import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"

// POST /api/email-center/reset-to-review — a hard reset for while the classification rules are still
// being tuned: every KRA task (email_case) is deleted, and every inbound email's classification is
// cleared back to Needs Review, so the whole mailbox history can be run through Reclassify again once
// the rules settle. Outbound mail (BCL's own replies) is left alone — it isn't decided by these rules.
//
// This never touches Gmail or `processed_at` — nothing is re-fetched, so it's cheap and instant; mail
// that was "Delete completely"-ignored under an old rule was never stored at all and needs a separate
// "Sync from date" (ideally with "Pause auto-classification" checked) to come back at all.
//
// Deliberately no scope filter: the caller (the toolbar's confirmation dialog) has already told the
// person this deletes every open/closed case and clears every Ignored/Notification/classified email,
// not just some of them.
export async function POST(request: NextRequest) {
  try {
    const { sb, actor } = await authorize(request)
    const now = new Date().toISOString()

    // PostgREST refuses a DELETE with no filter at all (a safety guard against exactly this kind of
    // "clear the whole table" call) — .neq() against an id no row can ever have is the standard way to
    // say "every row" without tripping it.
    const { data: deletedCases, error: casesErr } = await sb
      .from("email_case")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id")
    if (casesErr) throw new Error(casesErr.message)

    const resetRow = {
      disposition: "needs_review",
      category_key: null,
      category_confidence: null,
      classification_source: null,
      priority: "normal",
      review_reason: "Reset for reclassification.",
      case_id: null,
      handled_by_id: null,
      handled_at: null,
      classified_by_id: null,
      classified_at: null,
      matched_rule_id: null,
      updated_by_id: actor.id,
      updated_at: now,
    }

    // matched_rule_id arrived in a later migration; if it isn't applied yet, reset without touching it
    // instead of failing the whole reset.
    let { data: reset, error: resetErr } = await sb
      .from("emails")
      .update(resetRow)
      .neq("direction", "outbound")
      .select("id")
    if (resetErr && /matched_rule_id/i.test(resetErr.message)) {
      const { matched_rule_id, ...withoutMatchedRule } = resetRow
      ;({ data: reset, error: resetErr } = await sb.from("emails").update(withoutMatchedRule).neq("direction", "outbound").select("id"))
    }
    if (resetErr) throw new Error(resetErr.message)

    return NextResponse.json({ success: true, casesDeleted: deletedCases?.length ?? 0, emailsReset: reset?.length ?? 0 })
  } catch (error) {
    return fail(error, "reset-to-review POST")
  }
}
