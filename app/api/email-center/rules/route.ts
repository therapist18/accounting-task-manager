import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { DEFAULT_SUBJECT_RULES } from "@/lib/email-center/rules"
import { RULES_TABLE, invalidateRulesCache } from "@/lib/email-center/rule-store"
import { parseRuleBody } from "@/lib/email-center/rule-validation"

const COLUMNS = "id, match_type, pattern, category_key, confidence, sort_order, is_active, notes, updated_at"

// GET /api/email-center/rules — every rule, in the order they are tried.
// `source: "builtin"` means the table doesn't exist yet (migration not applied): the built-in list
// ingestion is currently using is returned read-only so the tab still shows something true.
export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const { data, error } = await sb
      .from(RULES_TABLE)
      .select(COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      const rules = DEFAULT_SUBJECT_RULES.map((r, i) => ({
        id: `builtin-${i}`,
        match_type: r.match_type,
        pattern: r.pattern,
        category_key: r.category_key,
        confidence: r.confidence,
        sort_order: (i + 1) * 10,
        is_active: true,
        notes: null,
        updated_at: null,
      }))
      return NextResponse.json({ success: true, source: "builtin", rules })
    }
    return NextResponse.json({ success: true, source: "database", rules: (data ?? []).map((r: any) => ({ ...r, confidence: Number(r.confidence) })) })
  } catch (error) {
    return fail(error, "rules GET")
  }
}

// POST /api/email-center/rules — { pattern, match_type?, category_key, confidence?, sort_order?, is_active?, notes? }
export async function POST(request: NextRequest) {
  try {
    const { sb, actor } = await authorize(request)
    const parsed = parseRuleBody(await request.json(), false)
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

    // New rules go last unless the caller says otherwise (first match wins, so last = least priority).
    let sortOrder = parsed.value.sort_order
    if (sortOrder === undefined) {
      const { data: last } = await sb.from(RULES_TABLE).select("sort_order").order("sort_order", { ascending: false }).limit(1)
      sortOrder = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 10
    }

    const { data, error } = await sb
      .from(RULES_TABLE)
      .insert({ ...parsed.value, sort_order: sortOrder, created_by_id: actor.id, updated_by_id: actor.id })
      .select(COLUMNS)
      .single()
    if (error) {
      if ((error as any).code === "23505") {
        return NextResponse.json({ success: false, error: "A rule with this exact pattern already exists." }, { status: 409 })
      }
      throw new Error(error.message)
    }
    invalidateRulesCache()
    return NextResponse.json({ success: true, rule: { ...data, confidence: Number(data.confidence) } })
  } catch (error) {
    return fail(error, "rules POST")
  }
}
