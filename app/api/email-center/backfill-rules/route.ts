import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { classifyByRules } from "@/lib/email-center/rules"
import { loadSubjectRules } from "@/lib/email-center/rule-store"
import { AUTO_CONFIDENCE_THRESHOLD as THRESHOLD } from "@/lib/email-center/types"
import { withSupabaseRetry } from "@/lib/supabaseRetry"

// POST /api/email-center/backfill-rules
// One-off repair for rows classified before the matched rule was being recorded (the Reclassify route
// used to skip it): re-runs the CURRENT rules over each task's opening email — and over soft-ignored,
// rule-classified emails — and stamps created_by_rule_id / matched_rule_id where a rule now confidently
// matches. Only rows with no rule recorded are touched, and only ever filled in, never changed, so it's
// safe to run more than once. It's a best-effort attribution: if the rules were edited since, the rule
// that matches today may not be the one that originally fired.
//   -> { cases: n, emails: n }   rows that gained a rule

const CHUNK = 200
const MAX_ROWS = 20000

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
        sb.from("emails").select("id, gmail_message_id, subject, snippet, sender_email, matched_rule_id").in("gmail_message_id", chunk.map((c) => c.opened_gmail_message_id))
      )
      if (error) throw new Error(error.message)
      const byMessage = new Map<string, any>((mails ?? []).map((m: any) => [m.gmail_message_id, m]))

      for (const c of chunk) {
        const m = byMessage.get(c.opened_gmail_message_id)
        if (!m) continue
        const rule = classifyByRules({ subject: m.subject, body: m.snippet ?? "", senderEmail: m.sender_email, threadHasCase: false, rules })
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

    // ── Ignored: rule-classified (not manual) soft-ignored mail with no rule recorded ──
    const { data: ignored, error: ignErr } = await withSupabaseRetry<any>(() =>
      sb.from("emails").select("id, subject, snippet, sender_email").eq("disposition", "ignore").eq("classification_source", "rule").is("matched_rule_id", null).limit(MAX_ROWS)
    )
    if (ignErr) throw new Error(ignErr.message)
    for (const m of ignored ?? []) {
      const rule = classifyByRules({ subject: m.subject, body: m.snippet ?? "", senderEmail: m.sender_email, threadHasCase: false, rules })
      if (!rule || rule.action !== "ignore" || !rule.ruleId || rule.hardIgnore || rule.confidence < THRESHOLD) continue
      const ruleId = rule.ruleId
      const { error } = await withSupabaseRetry<any>(() => sb.from("emails").update({ matched_rule_id: ruleId }).eq("id", m.id))
      if (error) throw new Error(error.message)
      emailsLinked++
    }

    return NextResponse.json({ success: true, cases: casesLinked, emails: emailsLinked })
  } catch (error) {
    return fail(error, "backfill-rules POST")
  }
}
