import { NextRequest, NextResponse } from "next/server"
import { requireAppSession } from "@/lib/auth/session"
import { toAuthErrorResponse } from "@/lib/auth/errors"
import { createServerSupabaseClient } from "@/lib/supabase"
import { sendEmailViaSmtp } from "@/lib/email/sendEmailViaSmtp"
import { sendWhatsAppDocument, sendWhatsAppText } from "@/lib/whatsapp/evolution"

// Sends a client their Task Basket report (the PDF / Excel the page generated) by email and/or
// WhatsApp, the way kra-tools sends documents: SMTP (same SMTP_* mailbox) and Evolution sendMedia.
// Recipients come from the items' contact_summary (kra-tools' report routing) or are typed in.
// Each item the report covers gets a 'report_sent' entry in its history.

const MAX_FILE_BYTES = 15 * 1024 * 1024

interface Body {
  item_ids?: string[]
  company_name?: string
  subject?: string
  message?: string
  emails?: string[]
  whatsapp?: string[]
  file?: { base64: string; fileName: string; mimeType: string }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req)
    const body = (await req.json()) as Body
    const emails = [...new Set((body.emails || []).map((e) => e.trim()).filter((e) => /\S+@\S+\.\S+/.test(e)))]
    const whatsapp = [...new Set((body.whatsapp || []).map((w) => w.trim()).filter(Boolean))]
    const file = body.file

    if (!file?.base64 || !file.fileName) return NextResponse.json({ error: "No report file" }, { status: 400 })
    if (Math.ceil((file.base64.length * 3) / 4) > MAX_FILE_BYTES) return NextResponse.json({ error: "Report is too large" }, { status: 400 })
    if (!emails.length && !whatsapp.length) return NextResponse.json({ error: "Add at least one email or WhatsApp recipient" }, { status: 400 })

    const subject = body.subject?.trim() || `Outstanding items — ${body.company_name || "Booksmart Consultancy"}`
    const message = body.message?.trim() || ""
    const results: Array<{ channel: string; to: string; success: boolean; error?: string }> = []

    if (emails.length) {
      try {
        await sendEmailViaSmtp({
          to: emails,
          subject,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(message)}</div>`,
          attachments: [{ filename: file.fileName, content: Buffer.from(file.base64, "base64"), contentType: file.mimeType }],
        })
        emails.forEach((to) => results.push({ channel: "email", to, success: true }))
      } catch (error: any) {
        emails.forEach((to) => results.push({ channel: "email", to, success: false, error: error?.message || "Email failed" }))
      }
    }

    for (const to of whatsapp) {
      // The message first (it explains the attachment), then the document.
      if (message) {
        const text = await sendWhatsAppText(to.includes("@") || /[a-zA-Z]/.test(to) ? to : to.replace(/\D/g, ""), message)
        if (!text.success) { results.push({ channel: "whatsapp", to, success: false, error: text.error }); continue }
      }
      const doc = await sendWhatsAppDocument(to, file)
      results.push({ channel: "whatsapp", to, success: doc.success, error: doc.error })
    }

    const sent = results.filter((r) => r.success)
    if (sent.length && body.item_ids?.length) {
      const supabase = createServerSupabaseClient()
      const { data: items } = await supabase.from("task_basket_items").select("id, history").in("id", body.item_ids.slice(0, 500))
      const at = new Date().toISOString()
      await Promise.all((items || []).map((item: any) =>
        supabase.from("task_basket_items").update({
          history: [...(item.history || []), {
            checked_at: at,
            event: "report_sent",
            channels: [...new Set(sent.map((r) => r.channel))],
            recipients: sent.map((r) => r.to),
            file_name: file.fileName,
            sent_by: session.user.id,
          }],
        }).eq("id", item.id),
      ))
    }

    return NextResponse.json({ results, sentCount: sent.length, failedCount: results.length - sent.length })
  } catch (error) {
    const authResponse = toAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error("POST /api/task-basket/send-report:", error)
    return NextResponse.json({ error: (error as any)?.message || "Failed to send report" }, { status: 500 })
  }
}
