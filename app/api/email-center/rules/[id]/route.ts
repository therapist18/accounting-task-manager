import { NextRequest, NextResponse } from "next/server"
import { authorize, fail, userNames } from "@/lib/email-center/api"
import {
  COMPANY_SCOPE_MIGRATION_MESSAGE, EXTRA_MIGRATION_MESSAGE, EXTRA_SENDER_MIGRATION_MESSAGE, NOTIFY_PRIORITY_MIGRATION_MESSAGE, RULES_TABLE,
  invalidateRulesCache, normalizeRuleRow, ruleColumns, withOptionalColumnFallback, withoutDroppedColumns,
} from "@/lib/email-center/rule-store"
import { parseRuleBody } from "@/lib/email-center/rule-validation"

type Ctx = { params: Promise<{ id: string }> }


// PATCH /api/email-center/rules/:id — any subset of the rule's fields (e.g. just { is_active }).
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { sb, actor } = await authorize(request)
    const { id } = await params
    const parsed = parseRuleBody(await request.json(), true)
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    if (!Object.keys(parsed.value).length) return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 })

    // pattern and match_type are validated together, so a partial edit re-checks against the stored other half.
    if (("pattern" in parsed.value) !== ("match_type" in parsed.value)) {
      const { data: current } = await sb.from(RULES_TABLE).select("pattern, match_type").eq("id", id).maybeSingle()
      if (!current) return NextResponse.json({ success: false, error: "Rule not found." }, { status: 404 })
      const check = parseRuleBody(
        { pattern: current.pattern, match_type: current.match_type, category_key: "other_kra", ...parsed.value },
        false
      )
      if (!check.ok) return NextResponse.json({ success: false, error: check.error }, { status: 400 })
    }

    const changes = { ...parsed.value, updated_by_id: actor.id, updated_at: new Date().toISOString() }
    const { data, error, blocked } = await withOptionalColumnFallback<any>(
      (dropped) => sb.from(RULES_TABLE).update(withoutDroppedColumns(changes, dropped)).eq("id", id).select(ruleColumns(dropped)).maybeSingle(),
      (col) => {
        // Clearing/keeping an empty list is harmless to drop; real extra wordings/senders can't be.
        // hard_ignore has a safe default (false), so it never blocks; notify_priority only blocks when
        // the edit would actually change it to "informational" — "urgent" is already the DB default.
        // A company restriction can never be silently dropped: the rule would then apply to EVERY company
        // (an "ignore except company 10" rule would ignore company 10 too). Only "all" is safe to lose.
        if ((col === "company_scope" || col === "company_ids") && ((parsed.value.company_scope && parsed.value.company_scope !== "all") || parsed.value.company_ids?.length)) return COMPANY_SCOPE_MIGRATION_MESSAGE
        if (col === "extra_patterns" && parsed.value.extra_patterns?.length) return EXTRA_MIGRATION_MESSAGE
        if (col === "extra_sender_patterns" && parsed.value.extra_sender_patterns?.length) return EXTRA_SENDER_MIGRATION_MESSAGE
        if (col === "notify_priority" && parsed.value.notify_priority === "informational") return NOTIFY_PRIORITY_MIGRATION_MESSAGE
      }
    )
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 })
    if (error) {
      if ((error as any).code === "23505") {
        return NextResponse.json({ success: false, error: "A rule with this exact pattern already exists." }, { status: 409 })
      }
      throw new Error(error.message)
    }
    if (!data) return NextResponse.json({ success: false, error: "Rule not found." }, { status: 404 })
    invalidateRulesCache()
    const names = await userNames(sb, [data.created_by_id, data.updated_by_id])
    return NextResponse.json({
      success: true,
      rule: {
        ...normalizeRuleRow(data),
        created_by_name: data.created_by_id ? names.get(String(data.created_by_id)) ?? null : null,
        updated_by_name: data.updated_by_id ? names.get(String(data.updated_by_id)) ?? null : null,
      },
    })
  } catch (error) {
    return fail(error, "rule PATCH")
  }
}

// DELETE /api/email-center/rules/:id — { deleteTasks?: boolean }
// A soft delete (deleted_at/deleted_by_id + is_active: false): the row disappears from the Rules tab
// and from classification, but stays in the database so a task's created_by_rule_id keeps resolving
// to something, and so the delete itself has an audit trail — a hard delete left no trace at all.
//
// deleteTasks decides what happens to the tasks (email_case rows) this rule already opened:
//   false (default)  they're left exactly as they are, still pointing at this now-deleted rule.
//   true              they're removed, and the emails that were in them go back to Needs Review
//                      (case_id cleared) rather than being silently stranded with no case and no
//                      tab that shows them.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { sb, actor } = await authorize(request)
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as { deleteTasks?: boolean }
    const now = new Date().toISOString()

    let tasksDeleted = 0
    if (body.deleteTasks === true) {
      const { data: cases } = await sb.from("email_case").select("id").eq("created_by_rule_id", id)
      const caseIds = (cases ?? []).map((c: any) => c.id)
      if (caseIds.length) {
        const { error: emailsErr } = await sb
          .from("emails")
          .update({
            case_id: null,
            disposition: "needs_review",
            review_reason: "Its task was deleted along with the rule that created it.",
            updated_by_id: actor.id,
            updated_at: now,
          })
          .in("case_id", caseIds)
        if (emailsErr) throw new Error(emailsErr.message)

        const { error: casesErr } = await sb.from("email_case").delete().in("id", caseIds)
        if (casesErr) throw new Error(casesErr.message)
        tasksDeleted = caseIds.length
      }
    }

    const { error, data } = await sb
      .from(RULES_TABLE)
      .update({ is_active: false, deleted_at: now, deleted_by_id: actor.id, updated_by_id: actor.id, updated_at: now })
      .eq("id", id)
      .select("id")
      .maybeSingle()
    if (error) {
      // deleted_at not applied yet — fall back to the old hard delete rather than failing outright.
      if (/deleted_at|deleted_by_id/i.test(error.message)) {
        const { error: hardErr } = await sb.from(RULES_TABLE).delete().eq("id", id)
        if (hardErr) throw new Error(hardErr.message)
      } else {
        throw new Error(error.message)
      }
    } else if (!data) {
      return NextResponse.json({ success: false, error: "Rule not found." }, { status: 404 })
    }

    invalidateRulesCache()
    return NextResponse.json({ success: true, tasksDeleted })
  } catch (error) {
    return fail(error, "rule DELETE")
  }
}
