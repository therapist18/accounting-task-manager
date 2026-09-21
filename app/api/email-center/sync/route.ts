import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { renewExpiringWatches, syncAllAccounts } from "@/lib/email-center/ingest"

// Keep within your Vercel plan's function limit; the sync itself stops starting new mailboxes after ~45s.
export const maxDuration = 60

// POST /api/email-center/sync  { accountId? }
// Runs when the Email Center page opens and from the "Sync now" button. Same code path as the Gmail
// push webhook. Also renews any Gmail push watch that is close to expiring (there is no cron job).
export async function POST(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const { accountId } = (await request.json().catch(() => ({}))) as { accountId?: string }
    const renewals = await renewExpiringWatches(sb)
    const results = await syncAllAccounts(sb, accountId)
    return NextResponse.json({ success: true, results, renewals })
  } catch (error) {
    return fail(error, "sync")
  }
}
