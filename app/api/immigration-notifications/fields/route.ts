import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import type { ItemKind } from "@/lib/immigrationNotifications"
import { previewAllEfnsDocumentFields, previewEfnsDocumentFields } from "@/lib/efnsFiling.server"

// /api/immigration-notifications/fields
//
//   GET                             → every item's, at once ({ types, items }) — the page loads this
//                                     with its list so the preview dialog opens with them in hand
//   GET ?kind=notification&id=123   → the item's document-type fields for the preview dialog: the
//                                     filed document's saved values, or (not filed yet) the type its
//                                     status's "Filled from EFNS" rule picks, with what filing would
//                                     read off the PDF. No AI.

export async function GET(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  const kind = req.nextUrl.searchParams.get("kind") as ItemKind | null
  const id = Number(req.nextUrl.searchParams.get("id") || "0")
  if (!kind && !id) {
    try {
      return NextResponse.json({ success: true, ...(await previewAllEfnsDocumentFields()) })
    } catch (e: any) {
      console.error("[api/immigration-notifications/fields] GET all", e)
      return NextResponse.json({ success: false, error: e?.message || "Failed to load fields" }, { status: 502 })
    }
  }
  if ((kind !== "notification" && kind !== "payment") || !id) {
    return NextResponse.json({ success: false, error: "kind and id are required" }, { status: 400 })
  }
  try {
    return NextResponse.json({ success: true, ...(await previewEfnsDocumentFields(kind, id)) })
  } catch (e: any) {
    console.error("[api/immigration-notifications/fields] GET", e)
    return NextResponse.json({ success: false, error: e?.message || "Failed to load fields" }, { status: 502 })
  }
}
