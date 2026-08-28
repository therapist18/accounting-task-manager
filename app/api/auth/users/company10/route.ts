import { NextRequest } from "next/server";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { requireAppSession } from "@/lib/auth/session";
import { listManagedScannerUsers } from "@/lib/auth/scanner-users";
import type { ManagedAuthUser } from "@/lib/auth/types";
import { ok, serverError } from "@/lib/utils/api";

const BCL_COMPANY_ID = 10;

// Lists internal BCL staff (company 10) for "Received by" / "Handled by" style dropdowns —
// e.g. Passport Endorsement Tracking, Immigration Tracker. Any authenticated user can see
// these — it's just display names, not an admin listing. Uses the service-role client (via
// listManagedScannerUsers -> getSupabaseAdmin) rather than a client-side anon-key query
// against scanner_users directly, so it isn't subject to that table's RLS policies — which
// currently have a self-referencing policy causing "infinite recursion detected in policy
// for relation scanner_users" (42P17) on any client-side anon query. Same fix pattern as
// the sibling registry app's /api/auth/users/company10.
export async function GET(req: NextRequest) {
  try {
    await requireAppSession(req);

    const users = await listManagedScannerUsers();
    const companyUsers = users
      .filter((u: ManagedAuthUser) => u.isActive && (u.hasAllCompanyAccess || u.companyIds.includes(BCL_COMPANY_ID)))
      .map((u: ManagedAuthUser) => ({
        id: u.id,
        displayName: u.displayName,
        companyIds: u.companyIds,
        primaryCompanyId: u.primaryCompanyId,
      }));

    return ok(companyUsers);
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return serverError(error);
  }
}
