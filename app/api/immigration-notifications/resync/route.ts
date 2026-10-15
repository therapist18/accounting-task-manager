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
//   POST { items: [{kind,id}…], unfile, resync } → the same as a bulk delete: every listed record goes,
//                                               all of them collecting into the one pending re-capture
//                                               request. Response adds deleted / failed counts.

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
    const body = (await req.json()) as {
      kind?: ItemKind
      id?: number
      items?: Array<{ kind?: ItemKind; id?: number }>
      unfile?: boolean
      resync?: boolean
    }
    // Either one record ({ kind, id }) or a bulk run ({ items: [...] }).
    const targets = (Array.isArray(body.items) ? body.items : body.kind && body.id ? [{ kind: body.kind, id: body.id }] : []).filter(
      (t): t is { kind: ItemKind; id: number } =>
        !!t && (t.kind === "notification" || t.kind === "payment") && typeof t.id === "number",
    )
    if (targets.length === 0) {
      return NextResponse.json({ success: false, error: "kind and id are required" }, { status: 400 })
    }

    const unfile = !!body.unfile
    const resync = !!body.resync
    const errors: string[] = []
    let requestId: number | null = null
    let warning: string | null = null
    let deleted = 0

    // Sequential on purpose: each deleteEfnsItem appends to the one pending efns_sync_requests row,
    // so they must not race each other's read-then-append of `targets`.
    for (const t of targets) {
      try {
        const r = await deleteEfnsItem({ ...t, unfile, resync, byId: session.user.id })
        // "Record not found" means the row is already gone — the record is deleted either way.
        if (r.success || r.error === "Record not found") deleted++
        else errors.push(r.error || "Delete failed")
        if (r.requestId) requestId = r.requestId
        if (r.warning && !warning) warning = r.warning
      } catch (e: any) {
        errors.push(e?.message || "Delete failed")
      }
    }

    if (targets.length === 1) {
      return NextResponse.json(
        { success: errors.length === 0, error: errors[0], requestId, warning },
        { status: errors.length === 0 ? 200 : 400 },
      )
    }
    return NextResponse.json(
      {
        success: errors.length === 0,
        deleted,
        failed: errors.length,
        error: errors.length > 0 ? `${errors.length} record${errors.length === 1 ? "" : "s"} could not be deleted: ${errors[0]}` : undefined,
        requestId,
        warning,
      },
      { status: deleted > 0 ? 200 : 400 },
    )
  } catch (e: any) {
    console.error("[api/immigration-notifications/resync] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Delete failed" }, { status: 502 })
  }
}
