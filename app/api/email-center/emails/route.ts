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
    // Same pattern the tasks module's fetchTasks() uses: no artificial row cap, just a filtered
    // query — the page loads a whole tab's worth once and paginates the DISPLAY of it client-side
    // (EmailsTable already does this). A small hard cap here is what silently hid real KRA mail
    // once a single disposition (needs_review, in practice) passed it system-wide.
    const limit = Math.min(Number(sp.get("limit") ?? 25000) || 25000, 25000)
    const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0)

    // matched_rule_id (which ignore rule stored the mail) came with a later migration; without it the
    // list still loads, just ungrouped.
    const columns = `id, gmail_message_id, gmail_thread_id, company_id, direction, subject, sender_email, sender_name,
         snippet, ai_summary, priority, is_read, received_at, has_attachments, disposition,
         classification_source, category_confidence, category_key, review_reason, kra_pin, case_id,
         to_addresses, cc_addresses, attachments, handled_by_id, handled_at, classified_by_id, classified_at`
    const run = (select: string) => {
      let query = sb
        .from("emails")
        .select(select, { count: "exact" })
        .not("disposition", "is", null)
        .order("received_at", { ascending: false })
        .range(offset, offset + limit - 1)
      if (disposition && (DISPOSITIONS as string[]).includes(disposition)) query = query.eq("disposition", disposition)
      if (company) query = query.eq("company_id", company)
      if (q) query = query.or(`subject.ilike.%${q}%,sender_email.ilike.%${q}%,snippet.ilike.%${q}%`)
      return query
    }

    let { data, count, error } = await run(`${columns}, matched_rule_id`)
    if (error && /matched_rule_id/i.test(error.message)) ({ data, count, error } = await run(columns))
    if (error) throw new Error(error.message)

    const names = await companyNames(sb, (data ?? []).map((e: any) => e.company_id))
    const people = await userNames(sb, (data ?? []).flatMap((e: any) => [e.handled_by_id, e.classified_by_id]))
    // Everything the email dialog shows except the body (fetched from Gmail on demand) is returned
    // here, so opening an email from the table needs no request of its own for its details.
    const emails = (data ?? []).map(({ attachments, ...e }: any) => ({
      ...e,
      attachments: clientAttachments(attachments),
      company_name: e.company_id ? names.get(String(e.company_id))?.name ?? null : null,
      handled_by_name: e.handled_by_id ? people.get(String(e.handled_by_id)) ?? null : null,
      classified_by_name: e.classified_by_id ? people.get(String(e.classified_by_id)) ?? null : null,
    }))
    return NextResponse.json({ success: true, emails, total: count ?? emails.length })
  } catch (error) {
    return fail(error, "emails GET")
  }
}

// DELETE /api/email-center/emails — remove ignored emails from the app (they stay in Gmail).
// Body: { ids: string[] }. Only rows currently marked Ignored are deleted, so a stale selection can
// never remove something that has since been reclassified into a case or the review queue.
export async function DELETE(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const { ids } = (await request.json()) as { ids?: string[] }
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 500)
    if (!list.length) return NextResponse.json({ success: false, error: "No emails selected." }, { status: 400 })

    const { data: rows, error: readErr } = await sb
      .from("emails")
      .select("id, attachments")
      .in("id", list)
      .eq("disposition", "ignore")
    if (readErr) throw new Error(readErr.message)
    const targets = rows ?? []
    if (!targets.length) return NextResponse.json({ success: true, deleted: 0, ids: [] })

    const paths = targets.flatMap((r: any) =>
      (Array.isArray(r.attachments) ? r.attachments : []).map((a: any) => a?.storage_path).filter(Boolean)
    )
    if (paths.length) await sb.storage.from("email-attachments").remove(paths)

    const targetIds = targets.map((r: any) => r.id)
    const { error } = await sb.from("emails").delete().in("id", targetIds)
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, deleted: targetIds.length, ids: targetIds })
  } catch (error) {
    return fail(error, "emails DELETE")
  }
}
