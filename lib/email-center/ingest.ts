// Email ingestion: Gmail -> Supabase for every connected company mailbox.
//
//   syncAccount()   incremental sync via Gmail history.list (falls back to a bounded backfill when the
//                   stored historyId is missing/expired). Triggered by the Gmail Pub/Sub push webhook
//                   and by the "Sync now" button / page open — all idempotent, one run per mailbox.
//   ingestMessage() metadata first (sender + subject are enough for the rules), then a full fetch, PDF
//                   read and DB write only for emails that belong to a KRA matter or need review.
//                   Noise, acknowledgements and certificates are never stored — they stay in Gmail,
//                   and neither are emails matched by an ignore rule.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { gmail_v1 } from "googleapis"
import { getGmailClient, parseEmailHeaders } from "@/lib/gmail/client"
import { CATEGORY_BY_KEY, KRA_JOB_LEVEL, type CategoryDef } from "./categories"
import { classifyByRules, detectApproval, extractPin, isAutomatedSender, isKraSender } from "./rules"
import { loadSubjectRules } from "./rule-store"
import { withRetry, withSupabaseRetry } from "./retry"
import {
  AUTO_CONFIDENCE_THRESHOLD as THRESHOLD,
  type Actor,
  type Disposition,
} from "./types"

const BACKFILL_DAYS = 14
// update_only categories whose case-attaching step also reads an approved/rejected outcome off the
// body (extension-of-time requests, and objection decisions — same shape, different KRA matter).
export const APPROVAL_DECISION_CATEGORIES = new Set(["extension_response", "objection_decision"])
const MAX_MESSAGES_PER_SYNC = 40
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const LOCK_MS = 90_000
const MAX_PASSES = 3
const BUCKET = "email-attachments"
// How many messages ingestMessage() runs at once, within ONE mailbox. Each KRA email can mean 2+
// Gmail calls (metadata, then a full fetch), one more per attachment,
// and several DB round trips — running them one at a time was the actual bottleneck, not
// Gmail's quota (250 units/user/second; a handful of concurrent full-fetches + attachment downloads
// sits nowhere close to that). Kept well under the quota rather than tuned to the exact ceiling.
const INGEST_CONCURRENCY = 6

export interface AccountRow {
  id: string
  email: string
  company_id: string | null
  token: any
  refresh_token: string | null
  history_id: number | string | null
  watch_expiry: string | null
  status: string
}

interface Ctx {
  sb: SupabaseClient
  gmail: gmail_v1.Gmail
  account: AccountRow
  // Set only by a "Sync from date" run started with "Pause auto-classification" checked: every inbound
  // email is stored straight into Needs Review, skipping every ignore/notify/classify rule
  // entirely — for recovering mail while the rules themselves are still being tuned, without letting
  // not-yet-correct rules re-drop or re-misclassify it the moment it's re-fetched.
  skipClassification?: boolean
}

// ─── helpers ────────────────────────────────────────────────────────────────

// Kenya date (YYYY-MM-DD) for an ISO timestamp — deadlines are counted in local calendar days.
export function toNairobiYmd(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(iso))
}

function header(headers: gmail_v1.Schema$MessagePartHeader[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

function decodeB64(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

function stripHtml(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
}

export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return ""
  const found: { plain?: string; html?: string } = {}
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.mimeType === "text/plain" && part.body?.data && !found.plain) {
      found.plain = decodeB64(part.body.data).toString("utf-8")
    } else if (part.mimeType === "text/html" && part.body?.data && !found.html) {
      found.html = decodeB64(part.body.data).toString("utf-8")
    }
    part.parts?.forEach(walk)
  }
  walk(payload)
  return found.plain ?? (found.html ? stripHtml(found.html) : "")
}

interface AttachmentMeta {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

function collectAttachments(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentMeta[] {
  const out: AttachmentMeta[] = []
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.filename && part.body?.attachmentId) {
      const mimeType = part.mimeType ?? "application/octet-stream"
      const size = part.body.size ?? 0
      // Skip tiny inline images (logos / signature graphics).
      if (!(mimeType.startsWith("image/") && size < 30 * 1024)) {
        out.push({ filename: part.filename, mimeType, size, attachmentId: part.body.attachmentId })
      }
    }
    part.parts?.forEach(walk)
  }
  if (payload) walk(payload)
  return out
}

const safeName = (s: string) => s.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file"

async function matchCompanyByPin(sb: SupabaseClient, pin: string | null): Promise<string | null> {
  if (!pin) return null
  const { data } = await sb
    .from("acc_portal_company_duplicate")
    .select("id")
    .ilike("kra_pin", pin)
    .limit(2)
  // Ambiguous PIN (two companies) -> do not guess.
  return data && data.length === 1 ? String(data[0].id) : null
}

export async function findCaseByThread(sb: SupabaseClient, threadId: string | null | undefined) {
  if (!threadId) return null
  const { data } = await sb.from("email_case").select("*").eq("gmail_thread_id", threadId).maybeSingle()
  return data
}

export async function findOpenCaseByPin(sb: SupabaseClient, pin: string | null, companyId: string | null) {
  if (!pin) return null
  let q = sb.from("email_case").select("*").eq("kra_pin", pin).eq("status", "open")
  if (companyId) q = q.eq("company_id", companyId)
  const { data } = await q.order("created_at", { ascending: false }).limit(1)
  return data?.[0] ?? null
}

// Fetches a message body from Gmail on demand (bodies are not stored in the database).
export async function fetchMessageBody(sb: SupabaseClient, accountId: string, messageId: string): Promise<string | null> {
  const { data: account } = await sb.from("email_accounts").select("*").eq("id", accountId).maybeSingle()
  if (!account) return null
  try {
    const gmail = gmailForAccount(account as AccountRow)
    const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" })
    return extractBody(res.data.payload) || null
  } catch (err) {
    console.error("[email-center] body fetch failed", err)
    return null
  }
}

// ─── case opening (shared with the manual "mark as action required" path) ───

export interface CaseFacts {
  gmail_message_id: string
  gmail_thread_id: string | null
  company_id: string | null
  subject: string
  sender_email: string
  cc_addresses: string | null
  received_at: string
  kra_pin: string | null
  snippet: string
  attachment_names: string[]
  // The classify rule that decided this email's category, when a rule (rather than a person)
  // is what actually opened the case. Absent/null for the manual "mark as action required" path.
  created_by_rule_id?: string | null
}

export async function openCaseFromEmail(
  sb: SupabaseClient,
  facts: CaseFacts,
  category: CategoryDef,
  actor: Actor
): Promise<{ caseRow: any; created: boolean }> {
  const existing = await findCaseByThread(sb, facts.gmail_thread_id)
  if (existing) return { caseRow: existing, created: false }

  const now = new Date().toISOString()
  const row = {
    company_id: facts.company_id,
    gmail_thread_id: facts.gmail_thread_id,
    opened_gmail_message_id: facts.gmail_message_id,
    category_key: category.key,
    notice_type: category.name,
    subject: facts.subject,
    kra_pin: facts.kra_pin,
    job_level: KRA_JOB_LEVEL,
    kra_email_from: facts.sender_email,
    kra_email_cc: facts.cc_addresses,
    email_date: toNairobiYmd(facts.received_at),
    deadline_date: null,
    contents: facts.snippet.slice(0, 500),
    attachments_summary: facts.attachment_names.length ? facts.attachment_names.join(", ") : null,
    signing_officer_name: null,
    signing_officer_position: null,
    created_by_rule_id: facts.created_by_rule_id ?? null,
    created_by_id: actor.id, // NULL when opened automatically from an incoming email
    updated_by_id: actor.id,
    created_at: now,
    updated_at: now,
  }

  const { data, error } = await sb.from("email_case").insert(row).select("*").single()
  if (error) {
    // Two concurrent syncs opened the same thread — the unique gmail_thread_id keeps it to one case.
    if ((error as any).code === "23505") {
      const again = await findCaseByThread(sb, facts.gmail_thread_id)
      if (again) return { caseRow: again, created: false }
    }
    throw new Error(`Could not open case: ${error.message}`)
  }
  return { caseRow: data, created: true }
}

// ─── single message ─────────────────────────────────────────────────────────

export async function ingestMessage(ctx: Ctx, messageId: string): Promise<"ingested" | "skipped"> {
  const { sb, gmail, account } = ctx

  const { data: existing } = await sb
    .from("emails")
    .select("processed_at")
    .eq("gmail_message_id", messageId)
    .maybeSingle()
  if (existing?.processed_at) return "skipped"

  // 1. Cheap: headers + snippet only. withRetry absorbs a transient network blip (heavy concurrent
  // backfill traffic) before this whole message is given up on.
  const meta = (
    await withRetry(() =>
      gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
      })
    )
  ).data
  const labels = meta.labelIds ?? []
  if (labels.some((l) => ["DRAFT", "SPAM", "TRASH"].includes(l))) return "skipped"

  const headers = meta.payload?.headers ?? []
  const parsed = parseEmailHeaders(headers as { name: string; value: string }[])
  const { subject, senderName, senderEmail } = parsed
  const dateMs = Date.parse(parsed.date)
  const receivedAt = new Date(Number.isNaN(dateMs) ? Number(meta.internalDate ?? Date.now()) : dateMs).toISOString()
  const toAddresses = header(headers, "To")
  const ccAddresses = header(headers, "Cc")
  const snippet = meta.snippet ?? ""
  const threadId = meta.threadId ?? null
  const direction = labels.includes("SENT") && !labels.includes("INBOX") ? "outbound" : "inbound"
  const kra = isKraSender(senderEmail)
  const threadCase = await findCaseByThread(sb, threadId)
  const rules = await loadSubjectRules(sb) // cached for a minute, so a batch of emails costs one query
  // Outbound replies aren't decided by these rules at all (they always follow the case they're in), so
  // pausing only ever changes what happens to INBOUND mail.
  const paused = !!ctx.skipClassification && direction === "inbound"

  // 2. Decide from sender + subject alone whether this email is worth a full fetch at all.
  if (direction === "outbound" && !threadCase) return "skipped" // our mail outside any KRA case

  // Automated mail from a non-KRA "no-reply"/"alerts" address, outside any case thread: never KRA,
  // never opens a case or a review item — for now, drop it before it's ever stored (same as a
  // hard-ignore rule match) rather than storing it under the Ignored tab. Skipped while paused — it
  // should land in Needs Review too.
  if (!paused && direction === "inbound" && !kra && !threadCase && isAutomatedSender(senderEmail)) return "skipped"

  // Set when a confident ignore rule matches: the mail is stored as ignored (headers only — no body,
  // no attachments), tagged with the rule, so the Ignored tab can show what each rule caught.
  let ruleIgnore: { ruleId: string; confidence: number } | null = null

  // While paused this whole cheap pass is skipped too: it's what would otherwise drop hard-ignore
  // matches, non-KRA noise and confidently-informational KRA mail before ever reaching Needs Review.
  if (direction === "inbound" && !paused) {
    const cheap = classifyByRules({ subject, body: snippet, senderEmail, threadHasCase: !!threadCase, rules })
    // Confident ignore rules are checked before classification and name no category: whatever the
    // sender, matching mail never opens a case or reaches review. Below the threshold it still goes
    // to review.
    if (cheap?.action === "ignore" && cheap.confidence >= THRESHOLD) {
      // "Ignore and delete": drop it here, same as any other noise — never stored, never tagged.
      if (cheap.hardIgnore || !cheap.ruleId) return "skipped"
      ruleIgnore = { ruleId: cheap.ruleId, confidence: cheap.confidence }
    }
    if (!kra && cheap?.categoryKey === "system_noise") return "skipped"
    if (kra && !threadCase && cheap && cheap.categoryKey) {
      const cat = CATEGORY_BY_KEY.get(cheap.categoryKey)
      // Confidently an informational KRA email (acknowledgement, certificate, statement): nothing to track.
      if (cheap.confidence >= THRESHOLD && cat && cat.disposition === "update_only" && !cat.attaches_to_case) {
        return "skipped"
      }
    }
  }

  // 3. Full fetch — KRA mail, our replies in a case, and unknown senders needing review.
  const needsFull = (direction === "outbound" || kra) && !ruleIgnore
  const payload = needsFull
    ? (await withRetry(() => gmail.users.messages.get({ userId: "me", id: messageId, format: "full" }))).data.payload
    : undefined
  const body = needsFull ? extractBody(payload) : ""
  const text = body || snippet
  const pin = extractPin(subject, text)
  const companyId = account.company_id ?? threadCase?.company_id ?? (await matchCompanyByPin(sb, pin))

  // ── attachments: download + store what we need (KRA mail + our replies) ──
  const attachmentMeta = collectAttachments(payload)
  const attachmentRows: any[] = []
  for (const att of attachmentMeta) {
    let storagePath: string | null = null
    let status: "skipped" | "failed" = "skipped"
    if (att.size <= MAX_ATTACHMENT_BYTES) {
      try {
        const res = await withRetry(() => gmail.users.messages.attachments.get({ userId: "me", messageId, id: att.attachmentId }))
        const buf = decodeB64(res.data.data ?? "")
        storagePath = `${account.id}/${messageId}/${safeName(att.filename)}`
        // withSupabaseRetry absorbs a transient network blip before this attachment is given up on —
        // same heavy-concurrency traffic that occasionally resets a socket mid-upload.
        const { error } = await withSupabaseRetry(() =>
          sb.storage.from(BUCKET).upload(storagePath!, buf, { contentType: att.mimeType, upsert: true })
        )
        if (error) throw error
      } catch (err) {
        console.error("[email-center] attachment failed", att.filename, err)
        storagePath = null
        status = "failed"
      }
    }
    attachmentRows.push({
      filename: att.filename,
      mime_type: att.mimeType,
      size_bytes: att.size,
      storage_path: storagePath,
      extraction_status: status,
    })
  }
  const attachmentNames = attachmentMeta.map((a) => a.filename)

  // ── classify + act ──
  let categoryKey = "other_kra"
  let confidence = 0.3
  let disposition: Disposition
  let reviewReason: string | null = null
  let caseId: string | null = null
  let notifyFlag = false
  // Only meaningful when notifyFlag is true: "urgent" demands attention now, "informational" still
  // lands in Notifications but reads as FYI (see rule.notify_priority in rules.ts).
  let notifyPriority: "urgent" | "informational" | null = null
  // The rule (if any) that actually decided this email's outcome — recorded on the email row, and on
  // the task if this is what opens one, so "this rule shouldn't have created these" has an answer.
  let matchedRuleId: string | null = null

  if (direction === "outbound") {
    // BCL's reply inside a case thread: fills the "when BCL responds" columns.
    categoryKey = "bcl_response"
    confidence = 1
    disposition = "update_only"
    const patch: Record<string, unknown> = {}
    if (!threadCase!.respond_date) {
      patch.respond_date = toNairobiYmd(receivedAt)
      patch.respond_contents = snippet.slice(0, 500)
    }
    if (threadCase!.approval_status === "not_responded") patch.approval_status = "pending"
    if (Object.keys(patch).length) {
      await sb.from("email_case").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", threadCase!.id)
    }
    caseId = threadCase!.id
  } else if (ruleIgnore) {
    categoryKey = "system_noise"
    confidence = ruleIgnore.confidence
    disposition = "ignore"
    matchedRuleId = ruleIgnore.ruleId
  } else if (paused) {
    // Recovery mode: skip the rules entirely, store as-is straight into Needs Review so a human (or
    // a later Reclassify run, once the rules are finished) decides what happens to it.
    categoryKey = "other_kra"
    confidence = 0
    disposition = "needs_review"
    reviewReason = "Classification paused — recovering synced mail."
  } else {
    const rule = classifyByRules({ subject, body: text, senderEmail, threadHasCase: !!threadCase, rules })
    // "Ignore and delete" reached only via the full body/subject (the cheap, snippet-only pass above
    // missed it): drop it now, before going any further.
    if (rule?.action === "ignore" && rule.confidence >= THRESHOLD && rule.hardIgnore) return "skipped"
    const ruleCat = rule && rule.categoryKey ? CATEGORY_BY_KEY.get(rule.categoryKey) : null
    if (rule && rule.action === "ignore") {
      // An ignore rule matched. At/above the confidence threshold the mail is dropped (the cheap
      // path already handles fresh inbox mail); below it the subject goes to Needs Review instead.
      categoryKey = rule.confidence >= THRESHOLD ? "system_noise" : "other_kra"
      confidence = rule.confidence
      if (rule.confidence >= THRESHOLD) matchedRuleId = rule.ruleId ?? null
    } else if (rule && rule.action === "notify") {
      // An important-notification rule matched: store it under the "notification" category (which
      // carries the needs_review disposition) so someone sees it, but a case is never opened and
      // there is no review questionnaire — it just needs attention.
      categoryKey = "notification"
      confidence = rule.confidence
      matchedRuleId = rule.ruleId ?? null
    } else if (rule && rule.categoryKey && rule.confidence >= THRESHOLD) {
      categoryKey = rule.categoryKey
      confidence = rule.confidence
      matchedRuleId = rule.ruleId ?? null
    } else {
      categoryKey = rule?.categoryKey ?? "other_kra"
      confidence = Math.max(rule?.confidence ?? 0, 0.3)
    }

    const category = CATEGORY_BY_KEY.get(categoryKey) ?? CATEGORY_BY_KEY.get("other_kra")!
    disposition = category.disposition

    // A notify match always lands in Needs Review flagged urgent — that IS its purpose. Don't let the
    // low-confidence / non-KRA overrides below replace the reason or quietly demote it.
    notifyFlag = rule?.action === "notify"
    if (notifyFlag) {
      notifyPriority = rule && rule.action === "notify" ? (rule.notifyPriority ?? "urgent") : "urgent"
      reviewReason = notifyPriority === "informational" ? "Important notification (FYI) — no action needed." : "Important notification — requires attention."
    }

    // Not from KRA, nothing (ignore/notify rule, noise-sender check) already caught it, and it isn't
    // part of a case thread already being tracked: there's no rule type for "anything that isn't KRA",
    // so this catch-all lives here instead. Needs Review is for KRA correspondence someone has to look
    // at — ordinary non-KRA business mail (bank statements, vendor invoices, SaaS/account noise, etc.)
    // has nothing to do in this tool, so it's parked under Ignored (soft — still visible, still
    // resyncable) rather than left to pile up forever. threadCase is checked first so a reply that
    // genuinely belongs to an already-tracked case is never silently dropped just because its sender
    // isn't @kra.go.ke.
    if (!notifyFlag && !kra && !threadCase && categoryKey !== "system_noise") {
      categoryKey = "system_noise"
      confidence = 0.5 // heuristic, not a specific rule match — cosmetic only, disposition is set directly
      disposition = "ignore"
      reviewReason = null
    } else if (confidence < THRESHOLD && !notifyFlag) {
      disposition = "needs_review"
      reviewReason = "Low classification confidence — please confirm."
    }

    if (disposition === "action_required") {
      if (threadCase) {
        caseId = threadCase.id
        const patch: Record<string, unknown> = {}
        // A new KRA follow-up on a case we had already completed puts it back to work.
        if (threadCase.status === "closed") {
          patch.status = "open"
          patch.completed_by_id = null
          patch.completed_at = null
        }
        if (Object.keys(patch).length) {
          await sb.from("email_case").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", threadCase.id)
        }
      } else if (category.creates_case) {
        const { caseRow } = await openCaseFromEmail(
          sb,
          {
            gmail_message_id: messageId,
            gmail_thread_id: threadId,
            company_id: companyId,
            subject,
            sender_email: senderEmail,
            cc_addresses: ccAddresses || null,
            received_at: receivedAt,
            kra_pin: pin,
            snippet,
            attachment_names: attachmentNames,
            created_by_rule_id: matchedRuleId,
          },
          category,
          { id: null, type: "system" }
        )
        caseId = caseRow.id
      }
    } else if (disposition === "update_only") {
      const target =
        threadCase ?? (category.attaches_to_case ? await findOpenCaseByPin(sb, pin, companyId) : null)
      if (target) caseId = target.id

      if (APPROVAL_DECISION_CATEGORIES.has(categoryKey)) {
        const approval = detectApproval(body)
        if (!target) {
          disposition = "needs_review"
          reviewReason = "No related case found for this KRA response."
        } else if (!approval) {
          disposition = "needs_review"
          reviewReason = "Could not tell whether KRA approved or declined."
        } else {
          await sb
            .from("email_case")
            .update({
              approval_status: approval,
              approval_date: toNairobiYmd(receivedAt),
              updated_at: new Date().toISOString(),
            })
            .eq("id", target.id)
        }
      } else if (!target && category.attaches_to_case) {
        disposition = "needs_review"
        reviewReason = "No related case found."
      }
    }
  }

  // 4. Matter emails, auto-ignored no-reply mail and emails awaiting review are kept; everything else is dropped here.
  if (!caseId && disposition !== "needs_review" && disposition !== "ignore") return "skipped"

  const deadline = threadCase?.deadline_date ?? null
  const daysToDeadline = deadline
    ? Math.round((Date.parse(deadline) - Date.parse(toNairobiYmd(new Date()))) / 86_400_000)
    : null
  const priority =
    disposition === "action_required"
      ? daysToDeadline !== null && daysToDeadline <= 7
        ? "urgent"
        : "high"
      : notifyFlag
        ? notifyPriority === "informational" ? "normal" : "urgent"
        : disposition === "needs_review"
          ? "normal"
          : "low"

  const emailRow = {
      account_id: account.id,
      gmail_message_id: messageId,
      gmail_thread_id: threadId,
      company_id: companyId,
      direction,
      subject,
      sender_email: senderEmail,
      sender_name: senderName,
      to_addresses: toAddresses || null,
      cc_addresses: ccAddresses || null,
      snippet,
      has_attachments: attachmentMeta.length > 0,
      attachments: attachmentRows,
      category_key: categoryKey,
      category_confidence: confidence,
      ai_summary: snippet,
      priority,
      labels,
      is_read: !labels.includes("UNREAD"),
      received_at: receivedAt,
      disposition,
      classification_source: "rule",
      review_reason: reviewReason,
      kra_pin: pin,
      case_id: caseId,
      classified_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
  }
  // matched_rule_id arrived in a later migration; if it isn't applied yet, save the email without the
  // tag instead of failing the whole sync. withSupabaseRetry absorbs a transient network blip (a big
  // backfill runs many mailboxes concurrently, enough traffic to occasionally reset a socket) before
  // this is counted as a real failure.
  let { error: upsertErr } = await withSupabaseRetry(() =>
    sb.from("emails").upsert({ ...emailRow, matched_rule_id: matchedRuleId }, { onConflict: "gmail_message_id" })
  )
  if (upsertErr && /matched_rule_id/i.test(upsertErr.message)) {
    ;({ error: upsertErr } = await withSupabaseRetry(() => sb.from("emails").upsert(emailRow, { onConflict: "gmail_message_id" })))
  }
  if (upsertErr) throw new Error(`Could not save email ${messageId}: ${upsertErr.message}`)

  return "ingested"
}

// ─── account sync ───────────────────────────────────────────────────────────

export function gmailForAccount(account: AccountRow) {
  const tokenData = typeof account.token === "string" ? JSON.parse(account.token) : account.token
  return getGmailClient(tokenData?.access_token, account.refresh_token ?? "", account.email)
}

interface Collected {
  ids: string[]
  nextHistoryId: string | null
  truncated: boolean
}

async function collectMessageIds(ctx: Ctx, max: number): Promise<Collected> {
  const { sb, gmail, account } = ctx

  if (account.history_id) {
    try {
      const ids: string[] = []
      let latest = String(account.history_id)
      let pageToken: string | undefined
      do {
        const res = await gmail.users.history.list({
          userId: "me",
          startHistoryId: String(account.history_id),
          historyTypes: ["messageAdded"],
          maxResults: 100,
          pageToken,
        })
        for (const record of res.data.history ?? []) {
          for (const added of record.messagesAdded ?? []) {
            const m = added.message
            const l = m?.labelIds ?? []
            if (m?.id && (l.includes("INBOX") || l.includes("SENT")) && !ids.includes(m.id)) ids.push(m.id)
          }
          // Cut only on a record boundary so no message of a record is skipped.
          if (ids.length >= max && record.id) {
            return { ids, nextHistoryId: record.id, truncated: true }
          }
        }
        latest = res.data.historyId ?? latest
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return { ids, nextHistoryId: latest, truncated: false }
    } catch (err: any) {
      // 404 = the stored historyId is too old/invalid -> fall back to a bounded backfill.
      if (err?.code !== 404 && err?.status !== 404) throw err
    }
  }

  const profile = await gmail.users.getProfile({ userId: "me" })
  const all: string[] = []
  let pageToken: string | undefined
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `newer_than:${BACKFILL_DAYS}d`,
      maxResults: 100,
      pageToken,
    })
    all.push(...(res.data.messages ?? []).map((m) => m.id!).filter(Boolean))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken && all.length < 500)
  all.reverse() // oldest first

  const { data: done } = await sb
    .from("emails")
    .select("gmail_message_id")
    .in("gmail_message_id", all.length ? all : ["-"])
    .not("processed_at", "is", null)
  const doneSet = new Set((done ?? []).map((r: any) => r.gmail_message_id))
  const pending = all.filter((id) => !doneSet.has(id))

  const truncated = pending.length > max
  return {
    ids: pending.slice(0, max),
    // While a backfill is unfinished keep history_id unset; the next run continues (already-stored
    // messages are skipped above), and only a completed backfill advances the cursor.
    nextHistoryId: truncated ? null : (profile.data.historyId ?? null),
    truncated,
  }
}

export interface SyncResult {
  email: string
  ingested: number
  skipped: number
  failed: number
  truncated: boolean
  error?: string
}

// Runs ingestMessage() over `ids` with up to INGEST_CONCURRENCY in flight at once, within one
// mailbox. When budgetMs is set, workers stop CLAIMING new ids once that much time has passed —
// whatever's already claimed always finishes — and whatever was never claimed comes back as
// `remaining`; undefined means no cutoff (the regular sync path, already capped at
// MAX_MESSAGES_PER_SYNC ids so it doesn't need one).
//
// A message that throws gets ONE extra full attempt (a second `pass`) before it's finally counted as
// failed — on top of the retries already inside ingestMessage itself (Supabase + Gmail, via
// lib/email-center/retry.ts). A transient blip under heavy concurrent backfill traffic is exactly the
// kind of thing that clears up a few seconds later; this catches whatever slips past the per-call
// retries (a different transient error each time, or one that needed a bit more time to recover).
async function ingestConcurrently(
  ctx: Ctx,
  ids: string[],
  budgetMs?: number
): Promise<{ ingested: number; skipped: number; failed: number; errors: string[]; remaining: string[] }> {
  const started = Date.now()
  let ingested = 0
  let skipped = 0
  const errorById = new Map<string, string>()

  // One pass over `idList`: attempts each id once. Returns ids that threw (candidates for the next
  // pass) separately from ids never claimed at all because budgetMs ran out (those come back as
  // `remaining` untouched, for a later server call — never silently retried here).
  const pass = async (idList: string[]): Promise<{ failed: string[]; unclaimed: string[] }> => {
    let next = 0
    const failed: string[] = []
    const worker = async () => {
      for (;;) {
        if (budgetMs !== undefined && Date.now() - started > budgetMs) return
        const i = next++
        if (i >= idList.length) return
        const id = idList[i]
        try {
          const r = await ingestMessage(ctx, id)
          if (r === "ingested") ingested++
          else skipped++
          errorById.delete(id) // succeeded on the retry pass — drop the first attempt's failure note
        } catch (err: any) {
          failed.push(id)
          errorById.set(id, err?.message ?? String(err))
          console.error("[email-center] ingest failed", ctx.account.email, id, err)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(INGEST_CONCURRENCY, idList.length) }, worker))
    return { failed, unclaimed: idList.slice(next) }
  }

  const first = await pass(ids)
  const second = first.failed.length ? await pass(first.failed) : { failed: [] as string[], unclaimed: [] as string[] }

  return {
    ingested,
    skipped,
    failed: second.failed.length,
    errors: [...errorById.values()].slice(0, 20), // capped — a bad batch shouldn't return hundreds of lines
    remaining: [...first.unclaimed, ...second.unclaimed],
  }
}

async function runPass(sb: SupabaseClient, account: AccountRow, result: SyncResult, max: number) {
  const ctx: Ctx = { sb, gmail: gmailForAccount(account), account }
  const collected = await collectMessageIds(ctx, max)
  result.truncated = collected.truncated

  const { ingested, skipped, failed, errors } = await ingestConcurrently(ctx, collected.ids)
  result.ingested += ingested
  result.skipped += skipped
  result.failed += failed

  const update: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    last_sync_error: errors.length ? errors.slice(0, 3).join(" | ").slice(0, 500) : null,
  }
  // Only advance the cursor when every message in the batch succeeded, so failures are retried.
  if (!errors.length && collected.nextHistoryId) update.history_id = Number(collected.nextHistoryId)
  await sb.from("email_accounts").update(update).eq("id", account.id)
}

// One sync per mailbox at a time. A push that arrives while a sync is running does not start a second
// one; it sets sync_pending and the running sync makes another pass, so no notification is dropped.
export async function syncAccount(
  sb: SupabaseClient,
  accountId: string,
  max = MAX_MESSAGES_PER_SYNC
): Promise<SyncResult> {
  const result: SyncResult = { email: accountId, ingested: 0, skipped: 0, failed: 0, truncated: false }

  const now = new Date()
  const { data: locked } = await sb
    .from("email_accounts")
    .update({ sync_lock_until: new Date(now.getTime() + LOCK_MS).toISOString() })
    .eq("id", accountId)
    .or(`sync_lock_until.is.null,sync_lock_until.lt.${now.toISOString()}`)
    .select("id")
  if (!locked?.length) {
    await sb.from("email_accounts").update({ sync_pending: true }).eq("id", accountId)
    return { ...result, error: "Sync already running — will re-check when it finishes." }
  }

  try {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      await sb.from("email_accounts").update({ sync_pending: false }).eq("id", accountId)
      const { data: account } = await sb.from("email_accounts").select("*").eq("id", accountId).single()
      if (!account || account.status !== "active" || !account.refresh_token) break
      result.email = account.email
      await runPass(sb, account as AccountRow, result, max)

      const { data: flag } = await sb.from("email_accounts").select("sync_pending").eq("id", accountId).single()
      if (!flag?.sync_pending) break
    }
  } catch (err: any) {
    result.error = err?.message ?? String(err)
    // last_synced_at reflects the last ATTEMPT, not the last success — a mailbox that's been failing
    // repeatedly should show a fresh timestamp with an error, not a stale one that reads as "hasn't
    // synced in days" when it's actually been trying (and failing) the whole time.
    await sb.from("email_accounts").update({ last_synced_at: new Date().toISOString(), last_sync_error: result.error }).eq("id", accountId)
  } finally {
    await sb.from("email_accounts").update({ sync_lock_until: null }).eq("id", accountId)
  }
  return result
}

const SYNC_CONCURRENCY = 6

// Syncs active mailboxes within a time budget, several at a time (serverless functions have a hard
// run-time cap, and with 40+ connected mailboxes a strictly one-at-a-time loop is what made the page
// feel slow to load).
//
// staleAfterMs, when set, skips any mailbox whose last_synced_at is more recent than that — the
// page's own sync-on-open passes this (nothing to gain re-checking a mailbox that was just synced a
// few minutes ago, likely by push anyway), while an explicit "Sync now" click and a per-mailbox sync
// from the Mailboxes tab always pass it as undefined to force a real check.
export async function syncAllAccounts(
  sb: SupabaseClient,
  only?: string,
  budgetMs = 45_000,
  staleAfterMs?: number
): Promise<SyncResult[]> {
  let q = sb
    .from("email_accounts")
    .select("id, email, last_synced_at")
    .eq("status", "active")
    .not("refresh_token", "is", null)
  if (only) q = q.eq("id", only)
  const { data: allAccounts, error } = await q
  if (error) throw new Error(error.message)

  const cutoff = staleAfterMs ? Date.now() - staleAfterMs : null
  const accounts = (allAccounts ?? []).filter(
    (a: any) => !cutoff || !a.last_synced_at || new Date(a.last_synced_at).getTime() < cutoff
  )
  const skippedFresh = (allAccounts ?? []).length - accounts.length

  const started = Date.now()
  const results: SyncResult[] = []
  for (let i = 0; i < accounts.length; i += SYNC_CONCURRENCY) {
    if (Date.now() - started > budgetMs) {
      for (const a of accounts.slice(i)) {
        results.push({ email: a.email, ingested: 0, skipped: 0, failed: 0, truncated: true, error: "Skipped — out of time, will run on the next sync." })
      }
      break
    }
    const batch = accounts.slice(i, i + SYNC_CONCURRENCY)
    const batchResults = await Promise.all(batch.map((a: any) => syncAccount(sb, a.id)))
    results.push(...batchResults)
  }
  if (skippedFresh > 0) {
    console.log(`[email-center] sync: skipped ${skippedFresh} recently-synced mailbox(es)`)
  }
  return results
}

// ─── sync from a chosen date ────────────────────────────────────────────────
//
// "Sync from date" lets staff pull in mail older than the automatic backfill window, optionally only up to
// an end date (a period). It runs in two steps so no single request outruns the platform's time limit and
// the UI can show real progress:
//   listBackfillIds()      one cheap pass: the message ids in the period that aren't stored yet, OLDEST
//                          FIRST (so a thread's first email opens its case before the follow-ups). At most
//                          MAX_LIST_PAGES pages (30,000 messages, newest first) are listed; beyond that
//                          `capped` is set and the OLDEST are left out - run the period again with an
//                          earlier end date to reach them.
//   ingestBackfillBatch()  the client sends those ids back a few at a time; each goes through the exact
//                          same ingestMessage() as normal syncs, so classification, case opening and
//                          attachment handling are identical. Already-stored mail is skipped, so
//                          re-running or overlapping ranges is safe.
// It never touches the mailbox's history cursor — normal incremental sync carries on unaffected.

// How far one listing pass walks: 500 ids per page, newest first.
const MAX_LIST_PAGES = 60
// How many ids the client sends per HTTP round trip. Now that ingestBackfillBatch runs them
// INGEST_CONCURRENCY at a time instead of one at a time, a small batch mostly just adds round-trip
// overhead relative to the actual work — raised so each call does more before the time budget in
// ingestBackfillBatch cuts it off; the "remaining" mechanism absorbs whatever doesn't fit either way.
export const BACKFILL_BATCH = 40

async function loadActiveAccount(sb: SupabaseClient, accountId: string): Promise<AccountRow> {
  // The error was previously ignored here, so a transient network failure (the account row couldn't be
  // read, not that it doesn't exist) surfaced as the misleading "Mailbox not found." — withSupabaseRetry
  // absorbs the transient case; a real lookup failure now says so accurately instead of guessing.
  const { data: account, error } = await withSupabaseRetry<any>(() => sb.from("email_accounts").select("*").eq("id", accountId).maybeSingle())
  if (error) throw new Error(`Could not load mailbox: ${error.message}`)
  if (!account) throw new Error("Mailbox not found.")
  if (account.status !== "active" || !account.refresh_token) throw new Error(`${account.email} isn't connected — reconnect it first.`)
  return account as AccountRow
}

export async function listBackfillIds(
  sb: SupabaseClient,
  accountId: string,
  sinceYmd: string,
  untilYmd?: string
): Promise<{ email: string; ids: string[]; listed: number; capped: boolean }> {
  const account = await loadActiveAccount(sb, accountId)
  const gmail = gmailForAccount(account)

  // Gmail's after:/before: are evaluated at midnight Pacific time. Start a day early so Kenyan-morning mail
  // on the first day isn't missed, and end a day late (before: is exclusive) so the last day is complete;
  // the few extra hours either side are harmless because already-stored mail is skipped.
  const ymd = (d: Date) => `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`
  const start = new Date(`${sinceYmd}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 1)
  let q = `after:${ymd(start)}`
  if (untilYmd) {
    const end = new Date(`${untilYmd}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() + 1)
    q += ` before:${ymd(end)}`
  }

  // Gmail lists newest first. Already-stored mail is dropped as we go; the rest is returned oldest first.
  const pending: string[] = []
  let listed = 0
  let pages = 0
  let pageToken: string | undefined
  do {
    const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 500, pageToken })
    const pageIds = (res.data.messages ?? []).map((m) => m.id!).filter(Boolean)
    listed += pageIds.length

    const chunks: string[][] = []
    for (let i = 0; i < pageIds.length; i += 100) chunks.push(pageIds.slice(i, i + 100))
    const stored = await Promise.all(
      chunks.map((chunk) =>
        sb.from("emails").select("gmail_message_id").in("gmail_message_id", chunk).not("processed_at", "is", null)
      )
    )
    const done = new Set<string>()
    for (const { data } of stored) for (const r of data ?? []) done.add((r as any).gmail_message_id)
    pending.push(...pageIds.filter((id) => !done.has(id)))

    pageToken = res.data.nextPageToken ?? undefined
    pages++
  } while (pageToken && pages < MAX_LIST_PAGES)

  return { email: account.email, ids: pending.reverse(), listed, capped: !!pageToken } // oldest first
}

export async function ingestBackfillBatch(
  sb: SupabaseClient,
  accountId: string,
  ids: string[],
  budgetMs = 45_000,
  skipClassification = false
): Promise<{ ingested: number; skipped: number; failed: number; remaining: string[]; errors: string[] }> {
  const account = await loadActiveAccount(sb, accountId)
  const ctx: Ctx = { sb, gmail: gmailForAccount(account), account, skipClassification }
  const result = await ingestConcurrently(ctx, ids, budgetMs)
  // Backfill talks to this mailbox's Gmail just as much as a regular sync does, so it gets the same
  // last_synced_at/last_sync_error treatment as runPass below — every batch, not just the final one,
  // so "Sync from date" always leaves an accurate trail even if the dialog is closed partway through.
  await sb
    .from("email_accounts")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: result.errors.length ? result.errors.slice(0, 3).join(" | ").slice(0, 500) : null,
    })
    .eq("id", accountId)
  return result
}

// ─── Gmail push watch ───────────────────────────────────────────────────────

// (Re)registers the Gmail push watch. Keeps the existing history_id so no messages between the last
// sync and the renewal are lost.
export async function renewWatch(sb: SupabaseClient, account: AccountRow) {
  const topicName = process.env.PUBSUB_TOPIC_NAME
  if (!topicName) return { skipped: "PUBSUB_TOPIC_NAME not configured" }
  const gmail = gmailForAccount(account)
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: { topicName, labelIds: ["INBOX", "SENT"] },
  })
  const update: Record<string, unknown> = {
    watch_expiry: res.data.expiration
      ? new Date(Number(res.data.expiration)).toISOString()
      : new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }
  if (!account.history_id && res.data.historyId) update.history_id = Number(res.data.historyId)
  await sb.from("email_accounts").update(update).eq("id", account.id)
  return { expiry: update.watch_expiry }
}

// Gmail watches lapse after 7 days. There is no scheduler, so every push and every page open renews
// the ones expiring within 48h. A mailbox that stays quiet AND unopened for a week loses its push,
// but nothing is lost: the next sync catches up from the stored historyId.
export async function renewExpiringWatches(sb: SupabaseClient): Promise<Array<{ email: string; ok: boolean; error?: string }>> {
  if (!process.env.PUBSUB_TOPIC_NAME) return []
  const { data: accounts } = await sb
    .from("email_accounts")
    .select("*")
    .eq("status", "active")
    .not("refresh_token", "is", null)

  const out: Array<{ email: string; ok: boolean; error?: string }> = []
  for (const account of accounts ?? []) {
    const expiry = account.watch_expiry ? new Date(account.watch_expiry).getTime() : 0
    if (expiry - Date.now() >= 48 * 60 * 60 * 1000) continue
    try {
      await renewWatch(sb, account as AccountRow)
      out.push({ email: account.email, ok: true })
    } catch (err: any) {
      out.push({ email: account.email, ok: false, error: err?.message })
    }
  }
  return out
}
