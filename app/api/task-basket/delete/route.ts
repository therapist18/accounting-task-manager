import { NextRequest, NextResponse } from "next/server"
import { requireAppSession } from "@/lib/auth/session"
import { toAuthErrorResponse } from "@/lib/auth/errors"
import { createServerSupabaseClient } from "@/lib/supabase"

// Removes a row from the shared basket outright. This is deliberately a hard delete rather than a
// "hidden" flag: kra-tools' daily populate upserts on (company_id, module, cycle_month), so a company
// that is still non-compliant simply reappears on the next run. Deleting is for rows that shouldn't
// have been created at all (wrong company, wrong cycle, not a real gap).
export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req)
    const body = await req.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "Missing task basket item id" }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from("task_basket_items")
      .delete()
      .eq("id", id)
      .select()
      .single()

    // PGRST116 = .single() found nothing — the row is already gone, which is a successful delete.
    if (error?.code === "PGRST116") {
      return NextResponse.json({ deleted: null })
    }
    if (error) throw error

    console.log(`[task-basket] item ${id} deleted by ${session.user.id}`)
    return NextResponse.json({ deleted: data })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("POST /api/task-basket/delete:", error)
    return NextResponse.json({ error: "Failed to delete task basket item" }, { status: 500 })
  }
}
