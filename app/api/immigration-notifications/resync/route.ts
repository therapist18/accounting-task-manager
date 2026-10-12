import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import type { ItemKind } from "@/lib/immigrationNotifications"
import { deleteEfnsItem, listSyncRequests } from "@/lib/efnsResync.server"

// /api/immigration-notifications/resync
//
//   GET                                       → the latest requested syncs (status + result)
//   POST { kind, id, unfile, resync }         → deletes the record (and, with unfile, the document it
//                                               filed onto a task); with resync, queues it for the EFNS
//                                               automation to capture again — WhatsApp off.

export async function GET() {
  const session = await getServerAppSession()
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  try {
    return NextResponse.json({ success: true, requests: await listSyncRequests() })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Failed to load sync requests", requests: [] }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  try {
    const body = (await req.json()) as { kind?: ItemKind; id?: number; unfile?: boolean; resync?: boolean }
    if (!body.kind || !body.id) {
      return NextResponse.json({ success: false, error: "kind and id are required" }, { status: 400 })
    }
    const result = await deleteEfnsItem({
      kind: body.kind,
      id: body.id,
      unfile: !!body.unfile,
      resync: !!body.resync,
      byId: session.user.id,
    })
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (e: any) {
    console.error("[api/immigration-notifications/resync] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Delete failed" }, { status: 502 })
  }
}
