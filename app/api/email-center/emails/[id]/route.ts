import { NextRequest, NextResponse } from "next/server"
import { authorize, companyNames, fail } from "@/lib/email-center/api"
import { CATEGORY_BY_KEY } from "@/lib/email-center/categories"
import { fetchMessageBody, openCaseFromEmail } from "@/lib/email-center/ingest"
import { DISPOSITIONS, type Disposition } from "@/lib/email-center/types"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/email-center/emails/:id — the stored email plus its body, fetched from Gmail on demand
// (bodies are not kept in the database).
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { sb } = await authorize(request)
    const { id } = await params

    const { data: email, error } = await sb
      .from("emails")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!email) return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 })

    // storage_path stays server-side; the client downloads by index through
    // /api/email-center/emails/:id/attachments/:index.
    const { attachments: raw, ...rest } = email
    const attachments = (Array.isArray(raw) ? raw : []).map((a: any, index: number) => ({
      index,
      filename: a.filename,
      mime_type: a.mime_type ?? null,
      size_bytes: a.size_bytes ?? null,
      downloadable: !!a.storage_path,
    }))

    const body = await fetchMessageBody(sb, email.account_id, email.gmail_message_id)

    return NextResponse.json({ success: true, email: { ...rest, body: body ?? email.snippet ?? "" }, attachments })
  } catch (error) {
    return fail(error, "email GET")
  }
}

// PATCH /api/email-center/emails/:id — staff correction of the classification (or read state).
// Body: { disposition?, category_key?, is_read? }
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { sb, actor } = await authorize(request)
    const { id } = await params
    const body = (await request.json()) as { disposition?: string; category_key?: string; is_read?: boolean }

    const { data: email } = await sb.from("emails").select("*").eq("id", id).maybeSingle()
    if (!email) return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (typeof body.is_read === "boolean") patch.is_read = body.is_read

    let category = null as ReturnType<typeof CATEGORY_BY_KEY.get> | null
    if (body.category_key) {
      category = CATEGORY_BY_KEY.get(body.category_key) ?? null
      if (!category) return NextResponse.json({ success: false, error: "Unknown category." }, { status: 400 })
      patch.category_key = category.key
    }
    if (body.disposition) {
      if (!(DISPOSITIONS as string[]).includes(body.disposition)) {
        return NextResponse.json({ success: false, error: "Invalid disposition." }, { status: 400 })
      }
      patch.disposition = body.disposition as Disposition
    }
    const reclassified = "disposition" in patch || "category_key" in patch
    if (reclassified) {
      patch.classification_source = "manual"
      patch.review_reason = null
      patch.classified_by_id = actor.id
      patch.classified_at = new Date().toISOString()
    }
    patch.updated_by_id = actor.id
    patch.updated_at = new Date().toISOString()

    // Marking an email as action-required for a case-creating category opens the case, just as
    // automatic ingestion would.
    let caseId: string | null = email.case_id
    let newCase: Record<string, unknown> | null = null
    if (patch.disposition === "action_required" && !email.case_id) {
      const current = CATEGORY_BY_KEY.get(email.category_key ?? "")
      const chosen = category ?? current
      const cat = chosen?.creates_case ? chosen : CATEGORY_BY_KEY.get("document_request")!
      const { caseRow } = await openCaseFromEmail(
        sb,
        {
          gmail_message_id: email.gmail_message_id,
          gmail_thread_id: email.gmail_thread_id,
          company_id: email.company_id,
          subject: email.subject,
          sender_email: email.sender_email,
          cc_addresses: email.cc_addresses,
          received_at: email.received_at,
          kra_pin: email.kra_pin,
          extracted: email.extracted,
          snippet: email.snippet ?? "",
          attachment_names: (Array.isArray(email.attachments) ? email.attachments : []).map((a: any) => a.filename),
        },
        cat,
        actor
      )
      caseId = caseRow.id
      patch.case_id = caseId

      // Hand back the full, freshly-opened case (joined name included) so the client can add it to
      // its list directly instead of fetching it right back — it was just built here.
      const companies = await companyNames(sb, [caseRow.company_id])
      newCase = {
        ...caseRow,
        company_name: caseRow.company_id ? companies.get(String(caseRow.company_id))?.name ?? null : null,
        responded_by_name: null,
        assigned_to_name: null,
        completed_by_name: null,
      }
    }

    const { error } = await sb.from("emails").update(patch).eq("id", id)
    if (error) throw new Error(error.message)

    // email_patch: exactly the fields that changed, so the client can merge them into whichever
    // local copy of this email it's holding (the Needs Review list, the open dialog, …) without a
    // round trip back to GET the same row it just wrote.
    return NextResponse.json({ success: true, case_id: caseId, email_patch: patch, case: newCase })
  } catch (error) {
    return fail(error, "email PATCH")
  }
}
