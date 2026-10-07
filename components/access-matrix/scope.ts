// "BCL Staff" vs "All Users" — the same rule as BCL Registry: a user is BCL staff when they
// belong to company 10 (BCL itself) or have access to every company.
// Shared by Task Manager, KRA Tools and BCL Meetings (components/access-matrix) — keep the copies in sync.

export const BCL_COMPANY_ID = 10;

export type UserScope = "bcl" | "all";

export const USER_SCOPE_TABS = [
  { value: "bcl", label: "BCL Staff" },
  { value: "all", label: "All Users" },
] as const;

/** companyIds may arrive as numbers, numeric strings or "all" (stored formats differ by app). */
export function isBclStaff(companyIds: unknown, hasAllCompanyAccess?: boolean | null): boolean {
  if (hasAllCompanyAccess) return true;
  const values = Array.isArray(companyIds) ? companyIds : companyIds == null ? [] : [companyIds];
  return values.some((v) => {
    if (typeof v === "string" && v.trim().toLowerCase() === "all") return true;
    return Number(v) === BCL_COMPANY_ID;
  });
}
