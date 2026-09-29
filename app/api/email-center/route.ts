import { NextRequest, NextResponse } from "next/server"
import { authorize, companyNames, fail } from "@/lib/email-center/api"
import { CATEGORIES } from "@/lib/email-center/categories"
import { withSupabaseRetry } from "@/lib/supabaseRetry"

// GET /api/email-center?light=1 — mailboxes, companies, staff and categories: everything the page
// needs besides the cases/emails lists themselves (those come from their own routes, fetched once
// at page load alongside this one). The tab/urgency counts are no longer computed here — the page
// derives them from the cases/emails/accounts it already holds, so this route doesn't run two more
// DB count queries just to duplicate numbers the client can get for free.
//
// ?light=1 skips the company/staff lists (they barely change within a session, unlike accounts) —
// the page fetches them fully once, then asks for the light version on its later, explicit reloads
// ("Refresh"/"Sync now"), rather than re-querying every company row in the system each time.
export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    const light = new URL(request.url).searchParams.get("light") === "1"

    // Explicit column list: OAuth tokens never leave the server. email_count/first_email_at
    // (20261004000000) are kept current by a trigger on `emails`, not computed here — if that
    // migration isn't applied yet, retry without them rather than failing the whole tab.
    const ACCOUNT_COLUMNS_BASE = "id, email, label, status, company_id, watch_expiry, last_synced_at, last_sync_error, created_at"
    const ACCOUNT_COLUMNS = `${ACCOUNT_COLUMNS_BASE}, email_count, first_email_at`
    // Loaded on every page open — withSupabaseRetry absorbs a transient network blip on any of these
    // before it's treated as a real failure.
    let accountsRes = await withSupabaseRetry<any>(() => sb.from("email_accounts").select(ACCOUNT_COLUMNS).order("email"))
    if (accountsRes.error && /email_count|first_email_at/i.test(accountsRes.error.message ?? "")) {
      accountsRes = await withSupabaseRetry<any>(() => sb.from("email_accounts").select(ACCOUNT_COLUMNS_BASE).order("email"))
    }

    const [companiesRes, staffRes] = await Promise.all([
      light
        ? Promise.resolve({ data: null } as { data: null })
        : withSupabaseRetry<any>(() => sb.from("acc_portal_company_duplicate").select("id, company_name, kra_pin").order("company_name")),
      light
        ? Promise.resolve({ data: null } as { data: null })
        : withSupabaseRetry<any>(() => sb.from("scanner_users").select("id, first_name, last_name, username").neq("is_active", false)),
    ])

    const names = await companyNames(sb, (accountsRes.data ?? []).map((a: any) => a.company_id))
    const accounts = (accountsRes.data ?? []).map((a: any) => ({
      ...a,
      company_name: a.company_id ? names.get(String(a.company_id))?.name ?? null : null,
      email_count: a.email_count ?? 0,
      first_email_at: a.first_email_at ?? null,
    }))

    // null (not []) when light — lets the client tell "not fetched this time" apart from
    // "genuinely zero companies/staff" and keep what it already has instead of clobbering it.
    const staff = light
      ? null
      : (staffRes.data ?? [])
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
      companies: light
        ? null
        : (companiesRes.data ?? []).map((c: any) => ({
            id: String(c.id),
            company_name: c.company_name,
            kra_pin: c.kra_pin ?? null,
          })),
    })
  } catch (error) {
    return fail(error, "overview")
  }
}
