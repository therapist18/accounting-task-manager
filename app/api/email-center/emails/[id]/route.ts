import { NextRequest, NextResponse } from "next/server"
import { authorize, clientAttachments, companyNames, fail, userNames } from "@/lib/email-center/api"
import { CATEGORY_BY_KEY } from "@/lib/email-center/categories"
import { fetchMessageBody, openCaseFromEmail } from "@/lib/email-center/ingest"
import { DISPOSITIONS, type Disposition } from "@/lib/email-center/types"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/email-center/emails/:id — the stored email plus its body, fetched from Gmail on demand
// (bodies are not kept in the database).
// GET /api/email-center/emails/:id?bodyOnly=1 — just the body. The email table already holds every
// other field the dialog shows, so opening an email from it only needs this one Gmail-backed call.
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { sb } = await authorize(request)
    const { id } = await params

    if (new URL(request.url).searchParams.get("bodyOnly") === "1") {
      const { data: row, error: rowErr } = await sb
        .from("emails")
        .select("account_id, gmail_message_id, snippet")
        .eq("id", id)
        .maybeSingle()
      if (rowErr) throw new Error(rowErr.message)
      if (!row) return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 })
      const body = await fetchMessageBody(sb, row.account_id, row.gmail_message_id)
      return NextResponse.json({ success: true, body: body ?? row.snippet ?? "" })
    }

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
    const attachments = clientAttachments(raw)

    const body = await fetchMessageBody(sb, email.account_id, email.gmail_message_id)

    return NextResponse.json({ success: true, email: { ...rest, body: body ?? email.snippet ?? "" }, attachments })
  } catch (error) {
    return fail(error, "email GET")
  }
}

// PATCH /api/email-center/emails/:id — staff correction of the classification (or read state), or
// marking an important notification handled.
// Body: { disposition?, category_key?, is_read?, handled? }
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { sb, actor } = await authorize(request)
    const { id } = await params
    const body = (await request.json()) as { disposition?: string; category_key?: string; is_read?: boolean; handled?: boolean }

    const { data: email } = await sb.from("emails").select("*").eq("id", id).maybeSingle()
    if (!email) return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (typeof body.is_read === "boolean") patch.is_read = body.is_read

    // The notifications basket is worked like a task but never becomes one: recording who handled a
    // notification and when (handled=false just moves it back into the active basket).
    if (typeof body.handled === "boolean") {
      patch.handled_by_id = body.handled ? actor.id : null
      patch.handled_at = body.handled ? new Date().toISOString() : null
    }

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

    // Resolved display name for classified_by_id/handled_by_id — display-only, never written to the
    // DB, so it's added to the response after the update, not into `patch` itself. Both are always
    // the acting user when set, so one lookup covers either.
    const displayNames: Record<string, unknown> = {}
    if (reclassified || "handled_by_id" in patch) {
      const actorName = (await userNames(sb, [actor.id])).get(String(actor.id)) ?? null
      if (reclassified) displayNames.classified_by_name = actorName
      if ("handled_by_id" in patch) displayNames.handled_by_name = patch.handled_by_id ? actorName : null
    }

    // email_patch: exactly the fields that changed (plus their resolved names, for display only), so
    // the client can merge them into whichever local copy of this email it's holding (the Needs Review
    // list, the open dialog, …) without a round trip back to GET the same row it just wrote.
    return NextResponse.json({ success: true, case_id: caseId, email_patch: { ...patch, ...displayNames }, case: newCase })
  } catch (error) {
    return fail(error, "email PATCH")
  }
}
