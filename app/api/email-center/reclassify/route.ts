import { NextRequest, NextResponse } from "next/server"
import type { Actor } from "@/lib/email-center/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { authorize, fail } from "@/lib/email-center/api"
import { categoryByKey } from "@/lib/email-center/categories"
import { APPROVAL_DECISION_CATEGORIES, findCaseByThread, findOpenCaseByPin, openCaseFromEmail, toNairobiYmd } from "@/lib/email-center/ingest"
import { classifyByRules, detectApproval, isAutomatedSender, isKraSender, type SubjectRule } from "@/lib/email-center/rules"
import { invalidateRulesCache, loadSubjectRules } from "@/lib/email-center/rule-store"
import { AUTO_CONFIDENCE_THRESHOLD as THRESHOLD } from "@/lib/email-center/types"
import { withSupabaseRetry } from "@/lib/supabaseRetry"

// POST /api/email-center/reclassify
// Re-runs the current rules over the emails sitting in a given disposition, so a rule added or edited
// after those emails were classified can still take effect on them. The client lists the affected
// emails once, then reclassifies them in batches and reports progress (the same shape as sync/backfill).
//
//   { action: "list", scope?, since?, until? }  -> { ids, total }   emails currently in `scope`
//                                                                   (optionally only those received in
//                                                                   the given date range, "YYYY-MM-DD")
//   { action: "run", ids: [] }                  -> { processed, changed, deleted, cases_opened, failed, moved }
//
// `scope` is "needs_review" (default — a rule now confidently matching mail that never matched
// anything before) or "update_only" (mail that WAS confidently classified, being re-run after a rule
// correction; guarded so an ignore/notify match never detaches it from a case it's already attached to
// — see the guard in reclassifyEmails()).
//
// Emails a rule now matches confidently are reclassified exactly as ingestion would have classified
// them (category, disposition, case opened or attached to via the same thread/PIN lookups ingestion
// uses, approval detected on an extension/objection response, deleted outright for a confident
// hard-ignore match — it would never have been stored in the first place — soft-ignored for a plain
// ignore match, or flagged urgent as an important notification); everything a rule still doesn't match
// stays as it is. The one gap: reclassify works from the stored snippet only (no Gmail re-fetch), so
// full-body approval detection isn't reproduced here.

// Same reasoning as the emails list route's own cap: this used to silently ignore any Needs Review
// backlog beyond the oldest 1,000, which — at the volumes a first-time full-mailbox backfill leaves
// behind — meant Reclassify could never reach most of it, run after run. RUN_MAX stays as it was:
// each "run" call still does real DB writes (and possibly opens a case) per email, so it's sized for
// one request's time budget, not for the backlog's total size — the client below just loops it more.
const LIST_MAX = 20000
const RUN_MAX = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD = /^\d{4}-\d{2}-\d{2}$/
// Which disposition Reclassify targets — defaults to Needs Review (a rule edit taking effect on mail
// that never confidently matched anything yet); Update-only lets the same run also pick up mail that
// was confidently classified before a rule was corrected. Every branch in reclassifyEmails() already
// works from the row's data alone, not from what disposition it currently holds, so no scope-specific
// logic is needed there beyond the ignore/notify-on-a-cased-row guard above.
// "notification" (flagged important-notification mail, not yet handled) and "ignore" (soft-ignored mail a
// rule put there — never mail a person ignored by hand) can be re-run too, so a corrected or deleted rule
// takes effect on what it already caught. The four scopes are disjoint: Needs Review excludes
// notifications even though they share its disposition.
const SCOPES = ["needs_review", "update_only", "notification", "ignore"] as const
type ReclassifyScope = (typeof SCOPES)[number]

// The rows a scope covers, as a filter on an emails query (used by both "list" and "run" so they agree).
function applyScope<T>(q: T, scope: ReclassifyScope): T {
  const b = q as any
  switch (scope) {
    case "notification":
      return b.eq("category_key", "notification").is("handled_at", null)
    case "ignore":
      return b.eq("disposition", "ignore").eq("classification_source", "rule")
    case "needs_review":
      return b.eq("disposition", "needs_review").or("category_key.is.null,category_key.neq.notification")
    default:
      return b.eq("disposition", scope)
  }
}
// Rule matching itself is cheap, in-memory regex work — what actually takes time per matched row is
// waiting on Supabase (a thread-case lookup, maybe a case open/update, then the email's own update).
// Running several rows at once instead of one after another turns that into mostly-overlapped network
// wait instead of one row's worth of latency multiplied by however many are in the batch. Case-opening's
// own unique-constraint-then-refetch fallback (openCaseFromEmail) already makes two rows racing to open
// the same thread's case safe, so this needs no extra locking here.
const RECLASSIFY_CONCURRENCY = 8

interface ReclassifyResult {
  processed: number
  changed: number
  deleted: number
  casesOpened: number
  failed: number
  // `patch` is exactly what was written to the row (absent for a deleted one), so the client can merge
  // it into its own copy instead of reloading every list to see what moved.
  moved: Array<{ id: string; subject: string; category: string | null; disposition: string; case_opened: boolean; patch?: Record<string, unknown> }>
}

async function reclassifyEmails(
  sb: SupabaseClient,
  actor: Actor,
  rules: SubjectRule[],
  rows: any[],
  scope: ReclassifyScope
): Promise<ReclassifyResult> {
  let changed = 0
  let deleted = 0
  let casesOpened = 0
  let failed = 0
  const moved: ReclassifyResult["moved"] = []

  // One row's failure (a transient blip that outlasted its own retries, or anything else) no longer
  // aborts the whole batch — everything already changed by other rows is kept, and this row just stays
  // in Needs Review to be picked up by the next Reclassify run, same as an unmatched one.
  const processOne = async (e: any) => {
    try {
      if (e.direction === "outbound") return

      const now = new Date().toISOString()

      // A no-reply/alerts sender, whatever the rules: ingestion now drops this mail before it's ever
      // stored, so an already-stored row from before that change (or before this account's mail was
      // recognized as automated) is deleted outright too, the same as a hard-ignore rule match.
      if (!e.case_id && isAutomatedSender(e.sender_email)) {
        const paths = (Array.isArray(e.attachments) ? e.attachments : [])
          .map((a: any) => a?.storage_path)
          .filter(Boolean)
        if (paths.length) await sb.storage.from("email-attachments").remove(paths)
        const { error: delErr } = await withSupabaseRetry(() => sb.from("emails").delete().eq("id", e.id))
        if (delErr) throw new Error(delErr.message)
        deleted++
        moved.push({ id: e.id, subject: e.subject, category: null, disposition: "deleted", case_opened: false })
        return
      }

      const rule = classifyByRules({
        subject: e.subject,
        body: e.snippet ?? "",
        senderEmail: e.sender_email,
        threadHasCase: !!e.case_id,
        companyId: e.company_id,
        rules,
      })
      if (!rule || rule.confidence < THRESHOLD) {
        // A notification no rule matches any more is left exactly as it is — silently demoting it to
        // Ignored via the catch-all below would hide mail someone was told to look at.
        if (scope === "notification") return
        // Same catch-all ingestion now applies: a non-KRA sender with nothing else matching, and no
        // case tracking this thread, has nothing to do sitting in Needs Review — there's no rule type
        // for "anything that isn't KRA", so this lives in code (mirrors the matching block in
        // ingest.ts). A reply that's genuinely part of an already-tracked case is left alone.
        if (!e.case_id && !isKraSender(e.sender_email) && !(await findCaseByThread(sb, e.gmail_thread_id))) {
          const patch = {
            category_key: "system_noise",
            category_confidence: 0.5,
            classification_source: "rule",
            disposition: "ignore",
            priority: "low",
            review_reason: null,
            classified_at: now,
            updated_at: now,
          }
          const { error: upErr } = await withSupabaseRetry(() => sb.from("emails").update(patch).eq("id", e.id))
          if (upErr) throw new Error(upErr.message)
          changed++
          moved.push({ id: e.id, subject: e.subject, category: "system_noise", disposition: "ignore", case_opened: false, patch })
        }
        return // otherwise stays in Needs Review
      }

      // An ignore or notify match on a mail that's already attached to a real case (reclassify can run
      // over Update-only mail too, unlike ingestion which only ever sees a fresh, uncased message) is
      // left alone rather than un-classified out from under that case — the same guard the automated-
      // sender check above already applies.
      if ((rule.action === "ignore" || rule.action === "notify") && e.case_id) return

      // A confident ignore match: had the rule existed when the mail arrived, a hard-ignore rule would
      // have dropped it before it was ever stored — so delete it now, the same as ingestion would have
      // skipped it. A plain (soft) ignore rule would still have stored it under Ignored, so it just
      // moves there instead.
      if (rule.action === "ignore") {
        if (rule.hardIgnore) {
          const paths = (Array.isArray(e.attachments) ? e.attachments : [])
            .map((a: any) => a?.storage_path)
            .filter(Boolean)
          if (paths.length) await sb.storage.from("email-attachments").remove(paths)
          const { error: delErr } = await withSupabaseRetry(() => sb.from("emails").delete().eq("id", e.id))
          if (delErr) throw new Error(delErr.message)
          deleted++
          moved.push({ id: e.id, subject: e.subject, category: null, disposition: "deleted", case_opened: false })
          return
        }
        const patch = {
          category_key: "system_noise",
          category_confidence: rule.confidence,
          classification_source: "rule",
          matched_rule_id: rule.ruleId ?? null,
          disposition: "ignore",
          priority: "low",
          review_reason: null,
          classified_at: now,
          updated_at: now,
        }
        const { error: upErr } = await withSupabaseRetry(() => sb.from("emails").update(patch).eq("id", e.id))
        if (upErr) throw new Error(upErr.message)
        changed++
        moved.push({ id: e.id, subject: e.subject, category: "system_noise", disposition: "ignore", case_opened: false, patch })
        return
      }

      // An important-notification match: store + flagged, Needs Review, no case — exactly as ingestion.
      // notify_priority decides how loudly (urgent -> priority "urgent", informational/FYI -> "normal").
      if (rule.action === "notify") {
        const informational = rule.notifyPriority === "informational"
        const patch = {
          category_key: "notification",
          category_confidence: rule.confidence,
          classification_source: "rule",
          matched_rule_id: rule.ruleId ?? null,
          disposition: "needs_review",
          priority: informational ? "normal" : "urgent",
          review_reason: informational ? "Important notification (FYI) — no action needed." : "Important notification — requires attention.",
          classified_at: now,
          updated_at: now,
        }
        const { error: upErr } = await withSupabaseRetry(() => sb.from("emails").update(patch).eq("id", e.id))
        if (upErr) throw new Error(upErr.message)
        changed++
        moved.push({ id: e.id, subject: e.subject, category: "notification", disposition: "needs_review", case_opened: false, patch })
        return
      }

      const cat = rule.categoryKey ? await categoryByKey(sb, rule.categoryKey) : null
      if (!cat || cat.disposition === "needs_review") return

      let disposition: string = cat.disposition
      let caseId: string | null = e.case_id
      let caseOpened = false
      let reviewReason: string | null = null

      // Same thread-first lookup ingestion uses: a mail that's part of an already-cased thread attaches
      // to that case instead of ever opening (or being left to open) a duplicate.
      const threadCase = await findCaseByThread(sb, e.gmail_thread_id)

      if (disposition === "action_required") {
        if (threadCase) {
          caseId = threadCase.id
          if (threadCase.status === "closed") {
            await withSupabaseRetry(() =>
              sb.from("email_case").update({ status: "open", completed_by_id: null, completed_at: null, updated_at: now }).eq("id", threadCase.id)
            )
          }
        } else if (!e.case_id && cat.creates_case) {
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
              snippet: e.snippet ?? "",
              attachment_names: (Array.isArray(e.attachments) ? e.attachments : []).map((a: any) => a.filename),
              created_by_rule_id: rule.ruleId ?? null,
            },
            cat,
            actor
          )
          caseId = caseRow.id
          caseOpened = true
          casesOpened++
        }
      } else if (disposition === "update_only") {
        const target = e.case_id ? null : threadCase ?? (cat.attaches_to_case ? await findOpenCaseByPin(sb, e.kra_pin, e.company_id) : null)
        if (target) caseId = target.id

        if (APPROVAL_DECISION_CATEGORIES.has(cat.key)) {
          // Reclassify only ever has the stored snippet to work with (no Gmail re-fetch), so approval detection here is a best effort compared to ingestion's.
          const approval = detectApproval(e.snippet ?? "")
          if (!caseId) {
            disposition = "needs_review"
            reviewReason = "No related case found for this KRA response."
          } else if (!approval) {
            disposition = "needs_review"
            reviewReason = "Could not tell whether KRA approved or declined."
          } else {
            await withSupabaseRetry(() =>
              sb
                .from("email_case")
                .update({ approval_status: approval, approval_date: toNairobiYmd(e.received_at), updated_at: now })
                .eq("id", caseId as string)
            )
          }
        } else if (!caseId && cat.attaches_to_case) {
          disposition = "needs_review"
          reviewReason = "No related case found."
        }
      }

      const patch = {
        category_key: cat.key,
        category_confidence: rule.confidence,
        classification_source: "rule",
        matched_rule_id: rule.ruleId ?? null,
        disposition,
        case_id: caseId,
        review_reason: reviewReason,
        classified_at: now,
        updated_at: now,
      }
      const { error: upErr } = await withSupabaseRetry(() => sb.from("emails").update(patch).eq("id", e.id))
      if (upErr) throw new Error(upErr.message)
      changed++
      moved.push({ id: e.id, subject: e.subject, category: cat.key, disposition, case_opened: caseOpened, patch })
    } catch (err: any) {
      failed++
      console.error("[email-center] reclassify failed for", e.id, err)
    }
  }

  let next = 0
  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= rows.length) return
      await processOne(rows[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(RECLASSIFY_CONCURRENCY, rows.length) }, worker))

  return { processed: rows.length, changed, deleted, casesOpened, failed, moved }
}

export async function POST(request: NextRequest) {
  try {
    const { sb, actor } = await authorize(request)
    const body = (await request.json().catch(() => ({}))) as {
      action?: string; ids?: unknown; since?: string; until?: string; scope?: string
    }
    const scope: ReclassifyScope = SCOPES.includes(body.scope as ReclassifyScope) ? (body.scope as ReclassifyScope) : "needs_review"

    if (body.action === "run") {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)) : []
      if (!ids.length || ids.length > RUN_MAX) {
        return NextResponse.json({ success: false, error: `Send between 1 and ${RUN_MAX} email ids.` }, { status: 400 })
      }
      // Usually run straight after a rule was saved — possibly on another server instance, whose cached
      // rules wouldn't have it yet. One extra query per batch is nothing next to the per-row writes.
      invalidateRulesCache()
      const rules = await loadSubjectRules(sb)
      const { data: rows, error } = await withSupabaseRetry<any>(() =>
        applyScope(sb.from("emails").select("*").in("id", ids), scope)
      )
      if (error) throw new Error(error.message)
      const { processed, changed, deleted, casesOpened, failed, moved } = await reclassifyEmails(sb, actor, rules, rows ?? [], scope)
      return NextResponse.json({ success: true, processed, changed, deleted, cases_opened: casesOpened, failed, moved })
    }

    // Default action: list the emails currently sitting in the target disposition (oldest first),
    // optionally narrowed to a received-date range — lets a big backlog be worked through in smaller,
    // faster chunks (e.g. "just last week") instead of always pulling in the entire thing.
    let since: string | undefined
    let until: string | undefined
    if (body.since) {
      if (!YMD.test(body.since)) return NextResponse.json({ success: false, error: "Choose a valid start date." }, { status: 400 })
      since = body.since
    }
    if (body.until) {
      if (!YMD.test(body.until)) return NextResponse.json({ success: false, error: "Choose a valid end date." }, { status: 400 })
      if (since && body.until < since) return NextResponse.json({ success: false, error: "The end date can't be before the start date." }, { status: 400 })
      until = body.until
    }
    const list = () => {
      let q = applyScope(sb.from("emails").select("id"), scope).order("received_at", { ascending: true }).limit(LIST_MAX)
      if (since) q = q.gte("received_at", `${since}T00:00:00.000Z`)
      if (until) {
        const end = new Date(`${until}T00:00:00.000Z`)
        end.setUTCDate(end.getUTCDate() + 1) // "until" is inclusive of that whole day
        q = q.lt("received_at", end.toISOString())
      }
      return q
    }
    const { data, error } = await withSupabaseRetry<any>(list)
    if (error) throw new Error(error.message)
    const ids = (data ?? []).map((r: any) => r.id)
    return NextResponse.json({ success: true, ids, total: ids.length })
  } catch (error) {
    return fail(error, "reclassify POST")
  }
}
