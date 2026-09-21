import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"

type Ctx = { params: Promise<{ id: string; index: string }> }

// GET /api/email-center/emails/:id/attachments/:index — 302 to a short-lived signed URL
// (the bucket is private).
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { sb } = await authorize(request)
    const { id, index } = await params

    const { data: email } = await sb.from("emails").select("attachments").eq("id", id).maybeSingle()
    const att = Array.isArray(email?.attachments) ? email!.attachments[Number(index)] : null
    if (!att?.storage_path) {
      return NextResponse.json({ success: false, error: "Attachment not available." }, { status: 404 })
    }

    const { data, error } = await sb.storage
      .from("email-attachments")
      .createSignedUrl(att.storage_path, 120, { download: att.filename })
    if (error || !data) throw new Error(error?.message ?? "Could not sign URL")
    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    return fail(error, "attachment GET")
  }
}
