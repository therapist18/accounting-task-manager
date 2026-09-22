import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { renewExpiringWatches, syncAllAccounts } from "@/lib/email-center/ingest"

// Keep within your Vercel plan's function limit; the sync itself stops starting new mailboxes after ~45s.
export const maxDuration = 60

// 40+ mailboxes syncing sequentially on every page open was the main cause of the module feeling slow
// to load. Push already delivers most mail in real time, so the on-open call only re-checks mailboxes
// that haven't synced recently — everything else is skipped as "probably already current".
const STALE_AFTER_MS = 5 * 60 * 1000

// POST /api/email-center/sync  { accountId?, mode? }
//   accountId set        — always a full check of that one mailbox (the Mailboxes tab's per-row sync).
//   mode: "manual"       — the "Sync now" button: a full check of every mailbox, no staleness filter.
//   mode: "open" (or omitted) — the page-open catch-up: skips mailboxes synced within the last 5 minutes.
// Also renews any Gmail push watch close to expiring (there is no cron job).
export async function POST(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const { accountId, mode } = (await request.json().catch(() => ({}))) as { accountId?: string; mode?: string }
    const staleAfterMs = !accountId && mode !== "manual" ? STALE_AFTER_MS : undefined

    const renewals = await renewExpiringWatches(sb)
    const results = await syncAllAccounts(sb, accountId, undefined, staleAfterMs)
    return NextResponse.json({ success: true, results, renewals })
  } catch (error) {
    return fail(error, "sync")
  }
}
