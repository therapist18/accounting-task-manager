import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/email-center/rules/:id/impact — how many tasks this rule has opened, so the delete
// dialog can ask "keep them or delete them too?" with real numbers instead of asking blind.
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { sb } = await authorize(request)
    const { id } = await params

    const { data, error } = await sb.from("email_case").select("status").eq("created_by_rule_id", id)
    if (error) {
      // created_by_rule_id not applied yet — nothing to report, not an error the dialog needs to show.
      if (/created_by_rule_id/i.test(error.message)) {
        return NextResponse.json({ success: true, open: 0, closed: 0, total: 0, linkable: false })
      }
      throw new Error(error.message)
    }

    const rows = data ?? []
    const open = rows.filter((r: any) => r.status === "open").length
    return NextResponse.json({ success: true, open, closed: rows.length - open, total: rows.length, linkable: true })
  } catch (error) {
    return fail(error, "rule impact GET")
  }
}
