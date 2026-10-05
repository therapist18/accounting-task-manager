import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { classifyByRules } from "@/lib/email-center/rules"
import { loadSubjectRules } from "@/lib/email-center/rule-store"
import { AUTO_CONFIDENCE_THRESHOLD as THRESHOLD } from "@/lib/email-center/types"
import { withSupabaseRetry } from "@/lib/supabaseRetry"

// POST /api/email-center/backfill-rules
// One-off repair for rows classified before the matched rule was being recorded (the Reclassify route
// used to skip it): re-runs the CURRENT rules over each task's opening email — and over every other
// rule-classified email (ignored, update-only, notifications, …) — and stamps created_by_rule_id /
// matched_rule_id where a rule now confidently matches AND explains the email's current category or
// disposition. Only rows with no rule recorded are touched, and only ever filled in, never changed, so
// it's safe to run more than once. It's a best-effort attribution: if the rules were edited since, the rule
// that matches today may not be the one that originally fired.
//   -> { cases: n, emails: n }   rows that gained a rule

// Same function limit as the sync route; a very large backlog may need Link rules clicked again —
// rows that already have a rule are skipped, so each run only continues where the last one stopped.
export const maxDuration = 60

const CHUNK = 200
const MAX_ROWS = 20000
const PAGE = 1000
const CONCURRENCY = 8

export async function POST(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const rules = await loadSubjectRules(sb)
    let casesLinked = 0
    let emailsLinked = 0

    // ── tasks: match each one's opening email ──
    const { data: cases, error: caseErr } = await withSupabaseRetry<any>(() =>
      sb.from("email_case").select("id, opened_gmail_message_id").is("created_by_rule_id", null).not("opened_gmail_message_id", "is", null).limit(MAX_ROWS)
    )
    if (caseErr) throw new Error(caseErr.message)

    const caseRows: any[] = cases ?? []
    for (let i = 0; i < caseRows.length; i += CHUNK) {
      const chunk = caseRows.slice(i, i + CHUNK)
      const { data: mails, error } = await withSupabaseRetry<any>(() =>
        sb.from("emails").select("id, gmail_message_id, subject, snippet, sender_email, company_id, matched_rule_id").in("gmail_message_id", chunk.map((c) => c.opened_gmail_message_id))
      )
      if (error) throw new Error(error.message)
      const byMessage = new Map<string, any>((mails ?? []).map((m: any) => [m.gmail_message_id, m]))

      for (const c of chunk) {
        const m = byMessage.get(c.opened_gmail_message_id)
        if (!m) continue
        const rule = classifyByRules({ subject: m.subject, body: m.snippet ?? "", senderEmail: m.sender_email, threadHasCase: false, companyId: m.company_id, rules })
        // Only a confident classify rule opens a task, so only that kind of match is attributed.
        if (!rule || rule.action !== "classify" || !rule.ruleId || rule.confidence < THRESHOLD) continue
        const ruleId = rule.ruleId
        const { error: upErr } = await withSupabaseRetry<any>(() => sb.from("email_case").update({ created_by_rule_id: ruleId }).eq("id", c.id))
        if (upErr) throw new Error(upErr.message)
        casesLinked++
        if (!m.matched_rule_id) {
          const { error: mailErr } = await withSupabaseRetry<any>(() => sb.from("emails").update({ matched_rule_id: ruleId }).eq("id", m.id))
          if (mailErr) throw new Error(mailErr.message)
          emailsLinked++
        }
      }
    }

    // ── every other rule-classified email with no rule recorded (ignored, update-only, notifications,
    // anything a rule moved or opened a task for) ──
    // Paged by id: updating rows would shift a "where matched_rule_id is null" window mid-run.
    const pending: any[] = []
    for (let from = 0; pending.length < MAX_ROWS; from += PAGE) {
      const { data, error } = await withSupabaseRetry<any>(() =>
        sb.from("emails")
          .select("id, subject, snippet, sender_email, company_id, category_key, disposition")
          .eq("classification_source", "rule")
          .is("matched_rule_id", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1)
      )
      if (error) throw new Error(error.message)
      pending.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }

    const link = async (m: any) => {
      const rule = classifyByRules({ subject: m.subject, body: m.snippet ?? "", senderEmail: m.sender_email, threadHasCase: false, companyId: m.company_id, rules })
      if (!rule || !rule.ruleId || rule.confidence < THRESHOLD) return
      // The rule must explain what the email actually is today — otherwise a rule that happens to match
      // an email someone moved by hand would claim it: an ignore rule for Ignored mail, a notify rule
      // for a notification, a classify rule only for the category it assigns.
      const explains =
        rule.action === "ignore" ? m.disposition === "ignore" && !rule.hardIgnore
          : rule.action === "notify" ? m.category_key === "notification"
          : rule.categoryKey === m.category_key
      if (!explains) return
      const ruleId = rule.ruleId
      const { error } = await withSupabaseRetry<any>(() => sb.from("emails").update({ matched_rule_id: ruleId }).eq("id", m.id))
      if (error) throw new Error(error.message)
      emailsLinked++
    }
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
        for (;;) {
          const i = next++
          if (i >= pending.length) return
          await link(pending[i])
        }
      })
    )

    return NextResponse.json({ success: true, cases: casesLinked, emails: emailsLinked })
  } catch (error) {
    return fail(error, "backfill-rules POST")
  }
}
