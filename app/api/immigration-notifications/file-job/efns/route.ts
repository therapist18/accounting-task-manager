import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { runEfnsFilingJob } from "@/lib/efnsFiling.server"

// /api/immigration-notifications/file-job/efns
//
//   POST   (header x-efns-secret: EFNS_FILING_SECRET)
//       The auto-filing pass, called by the EFNS automation at the end of each run so what it just
//       captured is filed without anyone pressing "Run filing". It has no session cookie, so the path
//       is public in middleware.ts and this route authenticates with the shared secret — rejecting
//       everything while EFNS_FILING_SECRET is unset.

const secretMatches = (given: string | null) => {
  const expected = process.env.EFNS_FILING_SECRET
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-efns-secret"))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runEfnsFilingJob({}))
  } catch (e: any) {
    console.error("[api/immigration-notifications/file-job/efns] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Auto-filing run failed" }, { status: 502 })
  }
}
