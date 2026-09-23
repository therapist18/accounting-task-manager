// Email ingestion: Gmail -> Supabase for every connected company mailbox.
//
//   syncAccount()   incremental sync via Gmail history.list (falls back to a bounded backfill when the
//                   stored historyId is missing/expired). Triggered by the Gmail Pub/Sub push webhook
//                   and by the "Sync now" button / page open — all idempotent, one run per mailbox.
//   ingestMessage() metadata first (sender + subject are enough for the rules), then a full fetch, PDF
//                   read and DB write only for emails that belong to a KRA matter or need review.
//                   Noise, acknowledgements and certificates are never stored — they stay in Gmail.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { gmail_v1 } from "googleapis"
import { getGmailClient, parseEmailHeaders } from "@/lib/gmail/client"
import { extractWithAi } from "./ai"
import { CATEGORY_BY_KEY, KRA_JOB_LEVEL, type CategoryDef } from "./categories"
import { classifyByRules, detectApproval, extractPin, isKraSender } from "./rules"
import {
  AUTO_CONFIDENCE_THRESHOLD as THRESHOLD,
  type Actor,
  type AiExtraction,
  type Disposition,
} from "./types"

const BACKFILL_DAYS = 14
const MAX_MESSAGES_PER_SYNC = 40
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const LOCK_MS = 90_000
const MAX_PASSES = 3
const BUCKET = "email-attachments"

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

async function findCaseByThread(sb: SupabaseClient, threadId: string | null | undefined) {
  if (!threadId) return null
  const { data } = await sb.from("email_case").select("*").eq("gmail_thread_id", threadId).maybeSingle()
  return data
}

async function findOpenCaseByPin(sb: SupabaseClient, pin: string | null, companyId: string | null) {
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
  extracted: Partial<AiExtraction> | null
  snippet: string
  attachment_names: string[]
}

export async function openCaseFromEmail(
  sb: SupabaseClient,
  facts: CaseFacts,
  category: CategoryDef,
  actor: Actor
): Promise<{ caseRow: any; created: boolean }> {
  const existing = await findCaseByThread(sb, facts.gmail_thread_id)
  if (existing) return { caseRow: existing, created: false }

  const ex = facts.extracted ?? {}
  const now = new Date().toISOString()
  const row = {
    company_id: facts.company_id,
    gmail_thread_id: facts.gmail_thread_id,
    opened_gmail_message_id: facts.gmail_message_id,
    category_key: category.key,
    notice_type: ex.notice_type || category.name,
    subject: facts.subject,
    kra_pin: facts.kra_pin ?? ex.kra_pin ?? null,
    job_level: KRA_JOB_LEVEL,
    kra_email_from: facts.sender_email,
    kra_email_cc: facts.cc_addresses,
    email_date: toNairobiYmd(facts.received_at),
    deadline_date: ex.deadline_date ?? null,
    contents: ex.contents ?? facts.snippet.slice(0, 500),
    attachments_summary: facts.attachment_names.length ? facts.attachment_names.join(", ") : null,
    signing_officer_name: ex.signing_officer_name ?? null,
    signing_officer_position: ex.signing_officer_position ?? null,
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

  // 1. Cheap: headers + snippet only.
  const meta = (
    await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
    })
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

  // 2. Decide from sender + subject alone whether this email is worth a full fetch at all.
  if (direction === "outbound" && !threadCase) return "skipped" // our mail outside any KRA case
  if (direction === "inbound" && !kra) {
    const cheap = classifyByRules({ subject, body: snippet, senderEmail, threadHasCase: false })
    if (cheap?.categoryKey === "system_noise") return "skipped"
  }
  if (direction === "inbound" && kra && !threadCase) {
    const cheap = classifyByRules({ subject, body: snippet, senderEmail, threadHasCase: false })
    const cat = cheap ? CATEGORY_BY_KEY.get(cheap.categoryKey) : null
    // Confidently an informational KRA email (acknowledgement, certificate, statement): nothing to track.
    if (cheap && cat && cheap.confidence >= THRESHOLD && cat.disposition === "update_only" && !cat.attaches_to_case) {
      return "skipped"
    }
  }

  // 3. Full fetch — KRA mail, our replies in a case, and unknown senders needing review.
  const needsFull = direction === "outbound" || kra
  const payload = needsFull
    ? (await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" })).data.payload
    : undefined
  const body = needsFull ? extractBody(payload) : ""
  const text = body || snippet
  const pin = extractPin(subject, text)
  const companyId = account.company_id ?? threadCase?.company_id ?? (await matchCompanyByPin(sb, pin))

  // ── attachments: download + store what we need (KRA mail + our replies) ──
  const attachmentMeta = collectAttachments(payload)
  const pdfs: Array<{ filename: string; data: Buffer }> = []
  const attachmentRows: any[] = []
  for (const att of attachmentMeta) {
    let storagePath: string | null = null
    let status: "pending" | "skipped" | "failed" = "skipped"
    if (att.size <= MAX_ATTACHMENT_BYTES) {
      try {
        const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: att.attachmentId })
        const buf = decodeB64(res.data.data ?? "")
        storagePath = `${account.id}/${messageId}/${safeName(att.filename)}`
        const { error } = await sb.storage.from(BUCKET).upload(storagePath, buf, {
          contentType: att.mimeType,
          upsert: true,
        })
        if (error) throw error
        if (att.mimeType === "application/pdf" || /\.pdf$/i.test(att.filename)) {
          pdfs.push({ filename: att.filename, data: buf })
          status = "pending"
        }
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
  let source: "rule" | "ai" | "rule+ai" = "rule"
  let ai: AiExtraction | null = null
  let disposition: Disposition
  let reviewReason: string | null = null
  let caseId: string | null = null

  if (direction === "outbound") {
    // BCL's reply inside a case thread: fills the "when BCL responds" columns.
    categoryKey = "bcl_response"
    confidence = 1
    disposition = "update_only"
    ai = await extractWithAi({
      mode: "bcl_reply",
      subject,
      body: stripQuotedForAi(body || snippet),
      senderEmail,
      categoryKeys: [],
    })
    const patch: Record<string, unknown> = {}
    if (!threadCase!.respond_date) {
      patch.respond_date = toNairobiYmd(receivedAt)
      patch.respond_contents = ai?.contents ?? snippet.slice(0, 500)
    }
    if (!threadCase!.promised_date && ai?.promised_date) patch.promised_date = ai.promised_date
    if (threadCase!.approval_status === "not_responded") patch.approval_status = "pending"
    if (Object.keys(patch).length) {
      await sb.from("email_case").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", threadCase!.id)
    }
    caseId = threadCase!.id
  } else {
    const rule = classifyByRules({ subject, body: text, senderEmail, threadHasCase: !!threadCase })
    const ruleCat = rule ? CATEGORY_BY_KEY.get(rule.categoryKey) : null
    // AI only runs to extract PDF details (deadline, PIN, signing officer) for a category the rules
    // are already confident about — never to guess an uncertain category. An email the rules can't
    // confidently place always ends up in Needs Review regardless of what AI would say, so calling AI
    // there just to have it also land in Needs Review was spending money without saving a person any
    // work — those go straight to manual review instead.
    const needsAi = kra && !!rule && rule.confidence >= THRESHOLD && ruleCat?.disposition === "action_required"
    if (needsAi) {
      ai = await extractWithAi({
        mode: "kra_notice",
        subject,
        body,
        senderEmail,
        categoryKeys: [...CATEGORY_BY_KEY.keys()],
        pdfs,
      })
    }

    if (rule && rule.confidence >= THRESHOLD) {
      categoryKey = rule.categoryKey
      confidence = rule.confidence
      source = ai ? "rule+ai" : "rule"
    } else if (ai?.category_key && ai.confidence >= THRESHOLD) {
      categoryKey = ai.category_key
      confidence = ai.confidence
      source = "ai"
    } else {
      categoryKey = rule?.categoryKey ?? "other_kra"
      confidence = Math.max(rule?.confidence ?? 0, ai?.confidence ?? 0, 0.3)
      source = ai ? "ai" : "rule"
    }

    const category = CATEGORY_BY_KEY.get(categoryKey) ?? CATEGORY_BY_KEY.get("other_kra")!
    disposition = category.disposition

    if (confidence < THRESHOLD) {
      disposition = "needs_review"
      reviewReason = "Low classification confidence — please confirm."
    } else if (!kra && categoryKey !== "system_noise") {
      disposition = "needs_review"
      reviewReason = "Sender is not KRA."
    }

    if (disposition === "action_required") {
      if (threadCase) {
        caseId = threadCase.id
        const patch: Record<string, unknown> = {}
        if (!threadCase.deadline_date && ai?.deadline_date) patch.deadline_date = ai.deadline_date
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
            extracted: ai,
            snippet,
            attachment_names: attachmentNames,
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

      if (categoryKey === "extension_response") {
        const approval = ai?.approval ?? detectApproval(body)
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

  // 4. Only matter emails and emails awaiting review are kept; everything else is dropped here.
  if (!caseId && disposition !== "needs_review") return "skipped"

  for (const r of attachmentRows) {
    if (r.extraction_status === "pending") r.extraction_status = ai ? "done" : "skipped"
  }

  const deadline = ai?.deadline_date ?? threadCase?.deadline_date ?? null
  const daysToDeadline = deadline
    ? Math.round((Date.parse(deadline) - Date.parse(toNairobiYmd(new Date()))) / 86_400_000)
    : null
  const priority =
    disposition === "action_required"
      ? daysToDeadline !== null && daysToDeadline <= 7
        ? "urgent"
        : "high"
      : disposition === "needs_review"
        ? "normal"
        : "low"

  const { error: upsertErr } = await sb.from("emails").upsert(
    {
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
      ai_summary: ai?.contents ?? snippet,
      priority,
      labels,
      is_read: !labels.includes("UNREAD"),
      received_at: receivedAt,
      disposition,
      classification_source: source,
      review_reason: reviewReason,
      kra_pin: pin ?? ai?.kra_pin ?? null,
      extracted: ai,
      case_id: caseId,
      classified_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    },
    { onConflict: "gmail_message_id" }
  )
  if (upsertErr) throw new Error(`Could not save email ${messageId}: ${upsertErr.message}`)

  return "ingested"
}

function stripQuotedForAi(body: string) {
  // Only our own new text matters for the reply summary; drop quoted KRA history.
  const cut = body.search(/\n\s*On .{5,120}wrote:\s*\n|\n\s*>/)
  return cut > 0 ? body.slice(0, cut) : body
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

async function runPass(sb: SupabaseClient, account: AccountRow, result: SyncResult, max: number) {
  const ctx: Ctx = { sb, gmail: gmailForAccount(account), account }
  const collected = await collectMessageIds(ctx, max)
  result.truncated = collected.truncated
  const errors: string[] = []

  for (const id of collected.ids) {
    try {
      const r = await ingestMessage(ctx, id)
      if (r === "ingested") result.ingested++
      else result.skipped++
    } catch (err: any) {
      result.failed++
      errors.push(`${id}: ${err?.message ?? err}`)
      console.error("[email-center] ingest failed", account.email, id, err)
    }
  }

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
    await sb.from("email_accounts").update({ last_sync_error: result.error }).eq("id", accountId)
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
