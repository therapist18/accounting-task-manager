import { AuthError } from "@/lib/auth/errors";
import type { AppSession } from "@/lib/auth/types";

function toCompanyId(value: string | number): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AuthError(403, `Invalid company id: ${String(value)}`);
  }
  return Math.trunc(parsed);
}

export function getAccessibleCompanyIds(session: AppSession): number[] | null {
  return session.user.hasAllCompanyAccess ? null : session.user.companyIds;
}

export function ensureAuthenticatedCompanyAccess(
  session: AppSession,
  companyId: string | number
) {
  const normalizedCompanyId = toCompanyId(companyId);
  if (session.user.hasAllCompanyAccess) return normalizedCompanyId;
  if (session.user.companyIds.includes(normalizedCompanyId)) {
    return normalizedCompanyId;
  }
  throw new AuthError(403, `You do not have access to company ${normalizedCompanyId}.`);
}

export function ensureAdmin(session: AppSession) {
  if (!session.user.isAdmin) {
    throw new AuthError(403, "Admin access is required for this action.");
  }
}

export function ensureSuperAdmin(session: AppSession) {
  if (!session.user.isSuperAdmin) {
    throw new AuthError(403, "SuperAdmin access is required for this action.");
  }
}

export function ensureCompanyAdmin(session: AppSession, companyId: string | number) {
  ensureAdmin(session);
  return ensureAuthenticatedCompanyAccess(session, companyId);
}
