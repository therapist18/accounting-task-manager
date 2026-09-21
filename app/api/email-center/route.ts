import { NextRequest, NextResponse } from "next/server"
import { authorize, companyNames, fail } from "@/lib/email-center/api"
import { CATEGORIES } from "@/lib/email-center/categories"

// GET /api/email-center — everything the page needs to draw its filters, tab counts and mailbox list.
export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)

    // Explicit column list: OAuth tokens never leave the server.
    const [accountsRes, companiesRes, staffRes] = await Promise.all([
      sb
        .from("email_accounts")
        .select("id, email, label, status, company_id, watch_expiry, last_synced_at, last_sync_error, created_at")
        .order("email"),
      sb.from("acc_portal_company_duplicate").select("id, company_name, kra_pin").order("company_name"),
      sb.from("scanner_users").select("id, first_name, last_name, username").neq("is_active", false),
    ])

    const [review, openCases] = await Promise.all([
      sb.from("emails").select("id", { count: "exact", head: true }).eq("disposition", "needs_review"),
      sb.from("email_case").select("id", { count: "exact", head: true }).eq("status", "open"),
    ])

    const names = await companyNames(sb, (accountsRes.data ?? []).map((a: any) => a.company_id))
    const accounts = (accountsRes.data ?? []).map((a: any) => ({
      ...a,
      company_name: a.company_id ? names.get(String(a.company_id))?.name ?? null : null,
    }))

    const staff = (staffRes.data ?? [])
      .map((u: any) => ({
        id: String(u.id),
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id),
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({
      success: true,
      accounts,
      staff,
      categories: CATEGORIES,
      companies: (companiesRes.data ?? []).map((c: any) => ({
        id: String(c.id),
        company_name: c.company_name,
        kra_pin: c.kra_pin ?? null,
      })),
      counts: {
        needs_review: review.count ?? 0,
        open_cases: openCases.count ?? 0,
        unassigned_mailboxes: accounts.filter((a: any) => !a.company_id).length,
      },
    })
  } catch (error) {
    return fail(error, "overview")
  }
}
