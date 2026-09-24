import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { RULES_TABLE, invalidateRulesCache } from "@/lib/email-center/rule-store"
import { parseRuleBody } from "@/lib/email-center/rule-validation"

type Ctx = { params: Promise<{ id: string }> }

const COLUMNS = "id, match_type, pattern, category_key, confidence, sort_order, is_active, notes, updated_at"

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

    const { data, error } = await sb
      .from(RULES_TABLE)
      .update({ ...parsed.value, updated_by_id: actor.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle()
    if (error) {
      if ((error as any).code === "23505") {
        return NextResponse.json({ success: false, error: "A rule with this exact pattern already exists." }, { status: 409 })
      }
      throw new Error(error.message)
    }
    if (!data) return NextResponse.json({ success: false, error: "Rule not found." }, { status: 404 })
    invalidateRulesCache()
    return NextResponse.json({ success: true, rule: { ...data, confidence: Number(data.confidence) } })
  } catch (error) {
    return fail(error, "rule PATCH")
  }
}

// DELETE /api/email-center/rules/:id
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { sb } = await authorize(request)
    const { id } = await params
    const { error } = await sb.from(RULES_TABLE).delete().eq("id", id)
    if (error) throw new Error(error.message)
    invalidateRulesCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    return fail(error, "rule DELETE")
  }
}
