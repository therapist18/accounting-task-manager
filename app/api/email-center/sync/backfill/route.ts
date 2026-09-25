import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { BACKFILL_BATCH, ingestBackfillBatch, listBackfillIds } from "@/lib/email-center/ingest"

export const maxDuration = 60

const YMD = /^\d{4}-\d{2}-\d{2}$/

// POST /api/email-center/sync/backfill — pull in mail from a chosen date, for one mailbox at a time
// (the client runs the selected mailboxes and reports progress).
//   { accountId, action: "list",   since: "YYYY-MM-DD", until?: "YYYY-MM-DD" }  -> { ids (oldest first), listed, capped, email }
//   { accountId, action: "ingest", ids: string[] }         -> { ingested, skipped, failed, remaining, errors }
export async function POST(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const body = (await request.json().catch(() => ({}))) as { accountId?: string; action?: string; since?: string; until?: string; ids?: unknown }
    if (!body.accountId) return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 })

    if (body.action === "list") {
      const since = body.since ?? ""
      const parsed = YMD.test(since) ? new Date(`${since}T00:00:00Z`) : null
      if (!parsed || isNaN(parsed.getTime())) return NextResponse.json({ success: false, error: "Choose a valid date." }, { status: 400 })
      if (parsed.getTime() > Date.now()) return NextResponse.json({ success: false, error: "The date can't be in the future." }, { status: 400 })
      // Optional end of the period (inclusive). Left out = everything up to now.
      let until: string | undefined
      if (body.until) {
        const end = YMD.test(body.until) ? new Date(`${body.until}T00:00:00Z`) : null
        if (!end || isNaN(end.getTime())) return NextResponse.json({ success: false, error: "Choose a valid end date." }, { status: 400 })
        if (end.getTime() < parsed.getTime()) return NextResponse.json({ success: false, error: "The end date can't be before the start date." }, { status: 400 })
        until = body.until
      }
      return NextResponse.json({ success: true, ...(await listBackfillIds(sb, body.accountId, since, until)) })
    }

    if (body.action === "ingest") {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && /^[\w-]{6,64}$/.test(x)) : []
      if (!ids.length || ids.length > BACKFILL_BATCH * 2) {
        return NextResponse.json({ success: false, error: `Send between 1 and ${BACKFILL_BATCH * 2} message ids.` }, { status: 400 })
      }
      return NextResponse.json({ success: true, ...(await ingestBackfillBatch(sb, body.accountId, ids)) })
    }

    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 })
  } catch (error) {
    return fail(error, "sync backfill")
  }
}
