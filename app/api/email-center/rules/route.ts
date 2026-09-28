import { NextRequest, NextResponse } from "next/server"
import { authorize, fail, userNames } from "@/lib/email-center/api"
import { DEFAULT_SUBJECT_RULES } from "@/lib/email-center/rules"
import {
  EXTRA_MIGRATION_MESSAGE, EXTRA_SENDER_MIGRATION_MESSAGE, RULES_TABLE, invalidateRulesCache,
  normalizeRuleRow, ruleColumns, withOptionalColumnFallback, withoutDroppedColumns,
} from "@/lib/email-center/rule-store"
import { parseRuleBody } from "@/lib/email-center/rule-validation"

// deleted_at arrived in the 20260929000000 migration; read without the filter if it isn't applied
// yet, so a soft delete just isn't available rather than the whole tab failing to load.
const isMissingDeletedAtColumn = (error: { message?: string } | null | undefined) =>
  !!error && /deleted_at/i.test(error.message ?? "")

// GET /api/email-center/rules — every rule, in the order they are tried.
// `source: "builtin"` means the table doesn't exist yet (migration not applied): the built-in list
// ingestion is currently using is returned read-only so the tab still shows something true.
export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const read = (columns: string, excludeDeleted: boolean) => {
      let q = sb.from(RULES_TABLE).select(columns).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
      if (excludeDeleted) q = q.is("deleted_at", null)
      return q
    }
    let excludeDeleted = true
    let { data, error } = await withOptionalColumnFallback<any[]>((dropped) => read(ruleColumns(dropped), excludeDeleted))
    if (isMissingDeletedAtColumn(error)) {
      excludeDeleted = false
      ;({ data, error } = await withOptionalColumnFallback<any[]>((dropped) => read(ruleColumns(dropped), excludeDeleted)))
    }

    if (error) {
      const rules = DEFAULT_SUBJECT_RULES.map((r, i) => ({
        id: `builtin-${i}`,
        match_type: r.match_type,
        pattern: r.pattern,
        extra_patterns: [] as string[],
        category_key: r.category_key,
        confidence: r.confidence,
        sort_order: (i + 1) * 10,
        is_active: true,
        notes: null,
        is_ignore: false,
        is_notify: false,
        hard_ignore: false,
        sender_pattern: null,
        extra_sender_patterns: [] as string[],
        sender_match_type: null,
        created_at: null,
        updated_at: null,
      }))
      return NextResponse.json({ success: true, source: "builtin", rules })
    }

    const names = await userNames(sb, (data ?? []).flatMap((r: any) => [r.created_by_id, r.updated_by_id]))
    const rules = (data ?? []).map((r: any) => ({
      ...normalizeRuleRow(r),
      created_by_name: r.created_by_id ? names.get(String(r.created_by_id)) ?? null : null,
      updated_by_name: r.updated_by_id ? names.get(String(r.updated_by_id)) ?? null : null,
    }))
    return NextResponse.json({ success: true, source: "database", rules })
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

    const row = { ...parsed.value, sort_order: sortOrder, created_by_id: actor.id, updated_by_id: actor.id }
    const { data, error, blocked } = await withOptionalColumnFallback<any>(
      (dropped) => sb.from(RULES_TABLE).insert(withoutDroppedColumns(row, dropped)).select(ruleColumns(dropped)).single(),
      (col) => {
        // hard_ignore has a safe default (false) — silently dropping it loses nothing. Real extra
        // wordings/senders would be lost, so those refuse instead.
        if (col === "extra_patterns" && parsed.value.extra_patterns?.length) return EXTRA_MIGRATION_MESSAGE
        if (col === "extra_sender_patterns" && parsed.value.extra_sender_patterns?.length) return EXTRA_SENDER_MIGRATION_MESSAGE
      }
    )
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 })
    if (error) {
      if ((error as any).code === "23505") {
        return NextResponse.json({ success: false, error: "A rule with this exact pattern already exists." }, { status: 409 })
      }
      throw new Error(error.message)
    }
    invalidateRulesCache()
    return NextResponse.json({ success: true, rule: normalizeRuleRow(data) })
  } catch (error) {
    return fail(error, "rules POST")
  }
}
