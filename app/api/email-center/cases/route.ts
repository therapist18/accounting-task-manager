import { NextRequest, NextResponse } from "next/server"
import { authorize, companyNames, fail, userNames } from "@/lib/email-center/api"
import { KRA_JOB_LEVEL } from "@/lib/email-center/categories"

// GET /api/email-center/cases?company=&status=open|closed|all&assignee=&q=
// One row per KRA case == one row of the correspondence Sheet1 (and one task of job level
// department 2 / subdepartment 28). The computed columns (days given, days since email, days
// remaining) are derived on screen from these dates, never stored.
export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const sp = new URL(request.url).searchParams
    const company = sp.get("company")
    const assignee = sp.get("assignee")
    const status = sp.get("status") ?? "open"
    const q = (sp.get("q") ?? "").replace(/[%,()]/g, " ").trim()

    // Fetched once per page load (and on an explicit Refresh/Sync), not per filter change, so a
    // larger one-time cap is affordable — the filtering/sorting itself runs client-side.
    let query = sb
      .from("email_case")
      .select("*")
      .order("email_date", { ascending: false, nullsFirst: false })
      .limit(2000)
    if (status === "open" || status === "closed") query = query.eq("status", status)
    if (company) query = query.eq("company_id", company)
    if (assignee === "none") query = query.is("assigned_to_id", null)
    else if (assignee) query = query.eq("assigned_to_id", assignee)
    if (q) query = query.or(`subject.ilike.%${q}%,kra_pin.ilike.%${q}%,notice_type.ilike.%${q}%,case_ref.ilike.%${q}%`)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const [companies, users] = await Promise.all([
      companyNames(sb, (data ?? []).map((c: any) => c.company_id)),
      userNames(
        sb,
        (data ?? []).flatMap((c: any) => [c.responded_by_id, c.assigned_to_id, c.completed_by_id])
      ),
    ])

    const cases = (data ?? []).map((c: any) => ({
      ...c,
      company_name: c.company_id ? companies.get(String(c.company_id))?.name ?? null : null,
      responded_by_name: c.responded_by_id ? users.get(String(c.responded_by_id)) ?? null : null,
      assigned_to_name: c.assigned_to_id ? users.get(String(c.assigned_to_id)) ?? null : null,
      completed_by_name: c.completed_by_id ? users.get(String(c.completed_by_id)) ?? null : null,
    }))
    return NextResponse.json({ success: true, cases })
  } catch (error) {
    return fail(error, "cases GET")
  }
}

// POST /api/email-center/cases — staff opening a KRA case by hand (no triggering email), e.g. a
// notice that arrived on paper or through a channel this module doesn't watch. Unlike an
// auto-opened case, created_by_id is a real person, not the system, and gmail_thread_id stays NULL
// (Postgres unique indexes allow any number of NULLs, so this never collides with a real thread).
// Returns the full case row (with joined names) so the client can add it to its list with no
// follow-up fetch.
export async function POST(request: NextRequest) {
  try {
    const { sb, actor } = await authorize(request)
    const body = (await request.json()) as Record<string, unknown>

    const companyId = body.company_id ? String(body.company_id) : null
    if (!companyId) return NextResponse.json({ success: false, error: "Company is required." }, { status: 400 })
    const { data: company } = await sb.from("acc_portal_company_duplicate").select("id").eq("id", companyId).maybeSingle()
    if (!company) return NextResponse.json({ success: false, error: "Company not found." }, { status: 400 })

    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    const dateStr = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

    const noticeType = str(body.notice_type)
    const subject = str(body.subject)
    if (!noticeType && !subject) {
      return NextResponse.json({ success: false, error: "Give the case a notice type or subject." }, { status: 400 })
    }

    const now = new Date().toISOString()
    const row = {
      company_id: companyId,
      gmail_thread_id: null,
      category_key: "other_kra",
      notice_type: noticeType,
      subject: subject ?? noticeType,
      kra_pin: str(body.kra_pin),
      job_level: KRA_JOB_LEVEL,
      kra_email_from: str(body.kra_email_from),
      kra_email_cc: str(body.kra_email_cc),
      email_date: dateStr(body.email_date) ?? now.slice(0, 10),
      deadline_date: dateStr(body.deadline_date),
      contents: str(body.contents),
      attachments_summary: str(body.attachments_summary),
      signing_officer_name: str(body.signing_officer_name),
      signing_officer_position: str(body.signing_officer_position),
      created_by_id: actor.id,
      updated_by_id: actor.id,
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await sb.from("email_case").insert(row).select("*").single()
    if (error) throw new Error(error.message)

    const [companies, users] = await Promise.all([companyNames(sb, [data.company_id]), userNames(sb, [actor.id])])
    return NextResponse.json({
      success: true,
      case: {
        ...data,
        company_name: data.company_id ? companies.get(String(data.company_id))?.name ?? null : null,
        responded_by_name: null,
        assigned_to_name: null,
        completed_by_name: null,
        created_by_name: actor.id ? users.get(String(actor.id)) ?? null : null,
      },
    })
  } catch (error) {
    return fail(error, "cases POST")
  }
}
