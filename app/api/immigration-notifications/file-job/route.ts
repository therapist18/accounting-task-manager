import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import { runEfnsFilingJob } from "@/lib/efnsFiling.server"

// /api/immigration-notifications/file-job
//
//   POST { limit?, ids? }
//       Runs the EFNS auto-filing pass: every immigration notification / payment that hasn't been
//       looked at yet (filing_status null) or failed last time ("error") is matched to a task,
//       resolved to a stage document via that stage's EFNS trigger, and filed. `ids` re-runs just
//       those items; otherwise the newest unprocessed ones up to `limit`.
//
// The "Run filing" button on the Immigration Notifications page calls this.

export async function POST(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number
      ids?: Array<{ kind?: string; id?: number }>
    }

    const ids = Array.isArray(body?.ids)
      ? body.ids
          .filter((i): i is { kind: "notification" | "payment"; id: number } =>
            (i?.kind === "notification" || i?.kind === "payment") && typeof i.id === "number",
          )
      : undefined

    const result = await runEfnsFilingJob({
      limit: typeof body?.limit === "number" ? body.limit : undefined,
      ids,
      byId: session.user.id,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[api/immigration-notifications/file-job] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Auto-filing run failed" }, { status: 502 })
  }
}
