import { NextRequest, NextResponse } from "next/server"
import { authorize, clientAttachments, companyNames, fail, userNames } from "@/lib/email-center/api"
import { DISPOSITIONS } from "@/lib/email-center/types"

// GET /api/email-center/emails?disposition=&company=&q=&limit=&offset=
export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const sp = new URL(request.url).searchParams
    const disposition = sp.get("disposition")
    const company = sp.get("company")
    const q = (sp.get("q") ?? "").replace(/[%,()]/g, " ").trim()
    const limit = Math.min(Number(sp.get("limit") ?? 50) || 50, 200)
    const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0)

    let query = sb
      .from("emails")
      .select(
        `id, gmail_message_id, gmail_thread_id, company_id, direction, subject, sender_email, sender_name,
         snippet, ai_summary, priority, is_read, received_at, has_attachments, disposition,
         classification_source, category_confidence, category_key, review_reason, kra_pin, case_id,
         to_addresses, cc_addresses, attachments, handled_by_id, handled_at`,
        { count: "exact" }
      )
      .not("disposition", "is", null)
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (disposition && (DISPOSITIONS as string[]).includes(disposition)) query = query.eq("disposition", disposition)
    if (company) query = query.eq("company_id", company)
    if (q) query = query.or(`subject.ilike.%${q}%,sender_email.ilike.%${q}%,snippet.ilike.%${q}%`)

    const { data, count, error } = await query
    if (error) throw new Error(error.message)

    const names = await companyNames(sb, (data ?? []).map((e: any) => e.company_id))
    const handlers = await userNames(sb, (data ?? []).map((e: any) => e.handled_by_id))
    // Everything the email dialog shows except the body (fetched from Gmail on demand) is returned
    // here, so opening an email from the table needs no request of its own for its details.
    const emails = (data ?? []).map(({ attachments, ...e }: any) => ({
      ...e,
      attachments: clientAttachments(attachments),
      company_name: e.company_id ? names.get(String(e.company_id))?.name ?? null : null,
      handled_by_name: e.handled_by_id ? handlers.get(String(e.handled_by_id)) ?? null : null,
    }))
    return NextResponse.json({ success: true, emails, total: count ?? emails.length })
  } catch (error) {
    return fail(error, "emails GET")
  }
}
