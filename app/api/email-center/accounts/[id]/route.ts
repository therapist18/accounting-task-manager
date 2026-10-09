import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/email-center/accounts/:id — link a connected mailbox to a company.
// Body: { company_id: string | null }
// Because a mailbox belongs to one company, this is what makes company identification deterministic;
// emails and cases already ingested without a company are back-filled.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { sb, actor } = await authorize(request)
    const { id } = await params
    const { company_id } = (await request.json()) as { company_id?: string | null }
    const companyId = company_id ? String(company_id) : null

    const { data: account } = await sb.from("email_accounts").select("id, email, company_id, audit_log").eq("id", id).maybeSingle()
    if (!account) return NextResponse.json({ success: false, error: "Mailbox not found." }, { status: 404 })

    if (companyId) {
      const { data: company } = await sb.from("acc_portal_company_duplicate").select("id").eq("id", companyId).maybeSingle()
      if (!company) return NextResponse.json({ success: false, error: "Company not found." }, { status: 400 })
    }

    const { error } = await sb
      .from("email_accounts")
      .update({
        company_id: companyId,
        company_assigned_by_id: actor.id,
        updated_by_id: actor.id,
        audit_log: [
          ...(Array.isArray(account.audit_log) ? account.audit_log : []),
          {
            action: companyId ? (account.company_id ? "moved" : "linked") : "unlinked",
            by_id: actor.id,
            at: new Date().toISOString(),
            ...(companyId ? { company_id: companyId } : {}),
            ...(account.company_id ? { from_company_id: String(account.company_id) } : {}),
          },
        ],
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (error) throw new Error(error.message)

    if (companyId) {
      await sb.from("emails").update({ company_id: companyId }).eq("account_id", id).is("company_id", null)
      const { data: orphanCases } = await sb
        .from("emails")
        .select("case_id")
        .eq("account_id", id)
        .not("case_id", "is", null)
      const caseIds = [...new Set((orphanCases ?? []).map((r: any) => r.case_id))]
      if (caseIds.length) await sb.from("email_case").update({ company_id: companyId }).in("id", caseIds).is("company_id", null)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return fail(error, "account PATCH")
  }
}
