import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import { refillEfnsDocumentFields } from "@/lib/efnsFiling.server"

// /api/immigration-notifications/file/refill
//
//   POST { documentId }
//       re-fills a document filed from EFNS (acc_portal_directors_documents.metadata.source = 'efns')
//       from its PDF's labels and its EFNS item — no AI. The task-stage preview's "Retry" uses it.

export async function POST(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { documentId?: string }
    if (!body.documentId) {
      return NextResponse.json({ success: false, error: "documentId is required" }, { status: 400 })
    }
    const result = await refillEfnsDocumentFields(body.documentId)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (e: any) {
    console.error("[api/immigration-notifications/file/refill] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Re-fill failed" }, { status: 502 })
  }
}
