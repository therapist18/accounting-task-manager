import { NextRequest, NextResponse } from "next/server"
import { requireAppSession } from "@/lib/auth/session"
import { toAuthErrorResponse } from "@/lib/auth/errors"
import { createServerSupabaseClient } from "@/lib/supabase"

const MAX_BULK_IDS = 500

// Removes rows from the shared basket outright. This is deliberately a hard delete rather than a
// "hidden" flag: kra-tools' daily populate upserts on (company_id, module, cycle_month), so a company
// that is still non-compliant simply reappears on the next run. Deleting is for rows that shouldn't
// have been created at all (wrong company, wrong cycle, not a real gap).
//
// Accepts either { id } (the per-row button) or { ids: [...] } (bulk action).
export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req)
    const body = await req.json()
    const { id, ids } = body

    const targetIds: string[] = Array.isArray(ids) ? ids.map(String) : id ? [String(id)] : []
    if (!targetIds.length) {
      return NextResponse.json({ error: "Missing task basket item id" }, { status: 400 })
    }
    if (targetIds.length > MAX_BULK_IDS) {
      return NextResponse.json({ error: `Too many items at once (max ${MAX_BULK_IDS})` }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from("task_basket_items")
      .delete()
      .in("id", targetIds)
      .select()

    if (error) throw error

    // A row that is already gone counts as deleted, same as the old single-id behaviour.
    const deletedIds = (data || []).map((row: any) => row.id)
    console.log(`[task-basket] ${deletedIds.length}/${targetIds.length} item(s) deleted by ${session.user.id}`)
    return NextResponse.json({ deleted: data?.[0] ?? null, deletedIds })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("POST /api/task-basket/delete:", error)
    return NextResponse.json({ error: "Failed to delete task basket item" }, { status: 500 })
  }
}
