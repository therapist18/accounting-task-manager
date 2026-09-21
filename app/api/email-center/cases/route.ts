import { NextRequest, NextResponse } from "next/server"
import { authorize, companyNames, fail, userNames } from "@/lib/email-center/api"

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

    let query = sb
      .from("email_case")
      .select("*")
      .order("email_date", { ascending: false, nullsFirst: false })
      .limit(500)
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
