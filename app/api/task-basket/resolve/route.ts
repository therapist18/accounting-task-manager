import { NextRequest, NextResponse } from "next/server"
import { requireAppSession } from "@/lib/auth/session"
import { toAuthErrorResponse } from "@/lib/auth/errors"
import { createServerSupabaseClient } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req)
    const body = await req.json()
    const { id, resolution_note } = body

    if (!id) {
      return NextResponse.json({ error: "Missing task basket item id" }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from("task_basket_items")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: session.user.id,
        resolution_note: resolution_note || null,
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("POST /api/task-basket/resolve:", error)
    return NextResponse.json({ error: "Failed to resolve task basket item" }, { status: 500 })
  }
}
