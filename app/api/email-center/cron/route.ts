import { NextRequest, NextResponse } from "next/server"
import { renewExpiringWatches, syncAllAccounts } from "@/lib/email-center/ingest"
import { getServiceClient } from "@/lib/email-center/service"

// Keep within your Vercel plan's function limit; the sync itself stops starting new mailboxes after ~45s.
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Mailboxes synced within this window are skipped - push (or the previous run) already covered them.
const STALE_AFTER_MS = 30 * 60 * 1000

/**
 * GET /api/email-center/cron - the scheduled sync (vercel.json "crons").
 *
 * Until this existed nothing ran on a schedule: watches were only renewed when a push arrived or
 * someone pressed Sync. Once every Gmail watch lapsed (7 days), no push could arrive to renew them,
 * so mail silently stopped coming in until a manual sync. This renews any watch close to expiring -
 * which turns push back on - and catches up mailboxes push may have missed.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations; anything else is refused,
 * and with CRON_SECRET unset the route refuses everything.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const sb = getServiceClient()
    const renewals = await renewExpiringWatches(sb)
    const results = await syncAllAccounts(sb, undefined, undefined, STALE_AFTER_MS)
    return NextResponse.json({
      success: true,
      renewed: renewals.filter((r) => r.ok).length,
      renewFailures: renewals.filter((r) => !r.ok),
      synced: results.length,
    })
  } catch (error) {
    console.error("[email-center] cron", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    )
  }
}
