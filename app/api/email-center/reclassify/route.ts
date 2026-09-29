import { NextRequest, NextResponse } from "next/server"
import type { Actor } from "@/lib/email-center/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { authorize, fail } from "@/lib/email-center/api"
import { CATEGORY_BY_KEY } from "@/lib/email-center/categories"
import { findOpenCaseByPin, openCaseFromEmail } from "@/lib/email-center/ingest"
import { classifyByRules, isAutomatedSender, type SubjectRule } from "@/lib/email-center/rules"
import { loadSubjectRules } from "@/lib/email-center/rule-store"
import { AUTO_CONFIDENCE_THRESHOLD as THRESHOLD } from "@/lib/email-center/types"

// POST /api/email-center/reclassify
// Re-runs the current rules over the emails sitting in Needs Review, so a rule added after those
// emails were ingested can still take effect on them. The client lists the affected emails once, then
// reclassifies them in batches and reports progress (the same shape as sync/backfill).
//
//   { action: "list" }           -> { ids, total }              emails currently in Needs Review
//   { action: "run", ids: [] }   -> { processed, changed, cases_opened, moved }
//
// Emails a rule now matches confidently are reclassified exactly as ingestion would have classified
// them (category, disposition, case opened when the category opens one, ignored for a confident
// ignore-rule match, or flagged urgent as an important notification); everything a rule still doesn't
// match stays in Needs Review.

// Same reasoning as the emails list route's own cap: this used to silently ignore any Needs Review
// backlog beyond the oldest 1,000, which — at the volumes a first-time full-mailbox backfill leaves
// behind — meant Reclassify could never reach most of it, run after run. RUN_MAX stays as it was:
// each "run" call still does real DB writes (and possibly opens a case) per email, so it's sized for
// one request's time budget, not for the backlog's total size — the client below just loops it more.
const LIST_MAX = 20000
const RUN_MAX = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ReclassifyResult {
  processed: number
  changed: number
  casesOpened: number
  moved: Array<{ id: string; subject: string; category: string | null; disposition: string; case_opened: boolean }>
}

async function reclassifyEmails(
  sb: SupabaseClient,
  actor: Actor,
  rules: SubjectRule[],
  rows: any[]
): Promise<ReclassifyResult> {
  let processed = 0
  let changed = 0
  let casesOpened = 0
  const moved: ReclassifyResult["moved"] = []

  for (const e of rows) {
    processed++
    if (e.direction === "outbound") continue

    const now = new Date().toISOString()

    // A no-reply/alerts sender is auto-ignored now, whatever the rules: clear legacy needs-review mail
    // from such senders the same way ingestion would have handled it.
    if (!e.case_id && isAutomatedSender(e.sender_email)) {
      const { error: upErr } = await sb
        .from("emails")
        .update({
          category_key: "system_noise",
          category_confidence: 0.92,
          classification_source: "rule",
          disposition: "ignore",
          priority: "low",
          review_reason: null,
          classified_at: now,
          updated_at: now,
        })
        .eq("id", e.id)
      if (upErr) throw new Error(upErr.message)
      changed++
      moved.push({ id: e.id, subject: e.subject, category: "system_noise", disposition: "ignore", case_opened: false })
      continue
    }

    const rule = classifyByRules({
      subject: e.subject,
      body: e.snippet ?? "",
      senderEmail: e.sender_email,
      threadHasCase: !!e.case_id,
      rules,
    })
    if (!rule || rule.confidence < THRESHOLD) continue // stays in Needs Review

    // A confident ignore match: had the rule existed when the mail arrived it would never have
    // been stored. It is stored, so surface it as ignored — it leaves Needs Review either way.
    if (rule.action === "ignore") {
      const { error: upErr } = await sb
        .from("emails")
        .update({
          category_key: "system_noise",
          category_confidence: rule.confidence,
          classification_source: "rule",
          disposition: "ignore",
          priority: "low",
          review_reason: null,
          classified_at: now,
          updated_at: now,
        })
        .eq("id", e.id)
      if (upErr) throw new Error(upErr.message)
      changed++
      moved.push({ id: e.id, subject: e.subject, category: "system_noise", disposition: "ignore", case_opened: false })
      continue
    }

    // An important-notification match: store + flagged, Needs Review, no case — exactly as ingestion.
    // notify_priority decides how loudly (urgent -> priority "urgent", informational/FYI -> "normal").
    if (rule.action === "notify") {
      const informational = rule.notifyPriority === "informational"
      const { error: upErr } = await sb
        .from("emails")
        .update({
          category_key: "notification",
          category_confidence: rule.confidence,
          classification_source: "rule",
          disposition: "needs_review",
          priority: informational ? "normal" : "urgent",
          review_reason: informational ? "Important notification (FYI) — no action needed." : "Important notification — requires attention.",
          classified_at: now,
          updated_at: now,
        })
        .eq("id", e.id)
      if (upErr) throw new Error(upErr.message)
      changed++
      moved.push({ id: e.id, subject: e.subject, category: "notification", disposition: "needs_review", case_opened: false })
      continue
    }

    const cat = rule.categoryKey ? CATEGORY_BY_KEY.get(rule.categoryKey) : null
    if (!cat || cat.disposition === "needs_review") continue

    let disposition = cat.disposition
    let caseId: string | null = e.case_id
    let caseOpened = false

    if (disposition === "action_required" && !e.case_id && cat.creates_case) {
      const { caseRow } = await openCaseFromEmail(
        sb,
        {
          gmail_message_id: e.gmail_message_id,
          gmail_thread_id: e.gmail_thread_id,
          company_id: e.company_id,
          subject: e.subject,
          sender_email: e.sender_email,
          cc_addresses: e.cc_addresses,
          received_at: e.received_at,
          kra_pin: e.kra_pin,
          extracted: e.extracted,
          snippet: e.snippet ?? "",
          attachment_names: (Array.isArray(e.attachments) ? e.attachments : []).map((a: any) => a.filename),
        },
        cat,
        actor
      )
      caseId = caseRow.id
      caseOpened = true
      casesOpened++
    } else if (disposition === "update_only" && cat.attaches_to_case && !e.case_id) {
      // An update that belongs to a case still needs a case to attach to; without one it stays in
      // Needs Review, exactly as ingestion would leave it.
      const target = await findOpenCaseByPin(sb, e.kra_pin, e.company_id)
      if (!target) continue
      caseId = target.id
    }

    const { error: upErr } = await sb
      .from("emails")
      .update({
        category_key: cat.key,
        category_confidence: rule.confidence,
        classification_source: "rule",
        disposition,
        case_id: caseId,
        review_reason: null,
        classified_at: now,
        updated_at: now,
      })
      .eq("id", e.id)
    if (upErr) throw new Error(upErr.message)
    changed++
    moved.push({ id: e.id, subject: e.subject, category: cat.key, disposition, case_opened: caseOpened })
  }

  return { processed, changed, casesOpened, moved }
}

export async function POST(request: NextRequest) {
  try {
    const { sb, actor } = await authorize(request)
    const body = (await request.json().catch(() => ({}))) as { action?: string; ids?: unknown }

    if (body.action === "run") {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)) : []
      if (!ids.length || ids.length > RUN_MAX) {
        return NextResponse.json({ success: false, error: `Send between 1 and ${RUN_MAX} email ids.` }, { status: 400 })
      }
      const rules = await loadSubjectRules(sb)
      const { data: rows, error } = await sb
        .from("emails")
        .select("*")
        .in("id", ids)
        .eq("disposition", "needs_review")
      if (error) throw new Error(error.message)
      const { processed, changed, casesOpened, moved } = await reclassifyEmails(sb, actor, rules, rows ?? [])
      return NextResponse.json({ success: true, processed, changed, cases_opened: casesOpened, moved })
    }

    // Default action: list the emails currently waiting in Needs Review (oldest first).
    const { data, error } = await sb
      .from("emails")
      .select("id")
      .eq("disposition", "needs_review")
      .order("received_at", { ascending: true })
      .limit(LIST_MAX)
    if (error) throw new Error(error.message)
    const ids = (data ?? []).map((r: any) => r.id)
    return NextResponse.json({ success: true, ids, total: ids.length })
  } catch (error) {
    return fail(error, "reclassify POST")
  }
}