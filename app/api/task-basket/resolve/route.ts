import { NextRequest, NextResponse } from "next/server"
import { requireAppSession } from "@/lib/auth/session"
import { toAuthErrorResponse } from "@/lib/auth/errors"
import { createServerSupabaseClient } from "@/lib/supabase"

// A bulk request is one UPDATE, so cap it: far above any real basket (one row per company per module
// per cycle) but low enough that a bad client can't build an enormous IN (...) list.
const MAX_BULK_IDS = 500

// Accepts either { id } (the per-row button) or { ids: [...] } (bulk action) — same note for all.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req)
    const body = await req.json()
    const { id, ids, resolution_note } = body

    const targetIds: string[] = Array.isArray(ids) ? ids.map(String) : id ? [String(id)] : []
    if (!targetIds.length) {
      return NextResponse.json({ error: "Missing task basket item id" }, { status: 400 })
    }
    if (targetIds.length > MAX_BULK_IDS) {
      return NextResponse.json({ error: `Too many items at once (max ${MAX_BULK_IDS})` }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    // Only OPEN rows are touched: re-resolving an already-resolved row would overwrite who closed it,
    // when and why — the audit trail the "Resolved" status exists to keep. In a bulk selection that
    // happens easily (Status filter "All"), so it is enforced here rather than trusted to the UI.
    const { data, error } = await supabase
      .from("task_basket_items")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: session.user.id,
        resolution_note: resolution_note || null,
      })
      .in("id", targetIds)
      .eq("status", "open")
      .select()

    if (error) throw error

    const resolvedIds = (data || []).map((row: any) => row.id)
    console.log(`[task-basket] ${resolvedIds.length}/${targetIds.length} item(s) resolved by ${session.user.id}`)
    // `item` keeps the old single-id response shape for the per-row button.
    return NextResponse.json({ item: data?.[0] ?? null, resolvedIds, skipped: targetIds.length - resolvedIds.length })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("POST /api/task-basket/resolve:", error)
    return NextResponse.json({ error: "Failed to resolve task basket item" }, { status: 500 })
  }
}
