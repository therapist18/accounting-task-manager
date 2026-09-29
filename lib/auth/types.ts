import type { PermissionKey } from "@/lib/auth/permissions";

export type TaskManagerRole =
  | "admin"
  | "manager"
  | "user"
  | "super_admin";

// Mirrors the `public.user_role` Postgres enum on scanner_users.role. Keep these in sync with
// the database — a value present in the enum but missing here makes normalizeRole throw, which
// 500s every route that reads the user roster and silently empties the staff dropdowns.
export type ScannerUserRole =
  | "general_admin"
  | "company_admin"
  | "petty_cash_user"
  | "officer"
  | "company_staff"
  | "bcl_staff"
  | "SuperAdmin";

export interface AuthUser {
  id: string;
  firebaseUid: string | null;
  payrollAccessEnabled: boolean;
  role: ScannerUserRole;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  isActive: boolean;
  primaryCompanyId: number | null;
  companyIds: number[];
  hasAllCompanyAccess: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions?: PermissionKey[];
}

export interface AppSession {
  tokenUid: string;
  user: AuthUser;
}

export interface ManagedAuthUser extends AuthUser {
  createdAt: string | null;
  updatedAt: string | null;
  lastLogin: string | null;
  hasPassword: boolean;
  roleAssignments?: any[];
}

export interface ManagedAuthUserUpdateInput {
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: ScannerUserRole;
  isActive: boolean;
  primaryCompanyId: number | null;
  companyIds: number[];
  hasAllCompanyAccess: boolean;
  payrollAccessEnabled: boolean;
  password?: string | null;
  roleAssignments?: any[];
}

export interface ManagedAuthUserCreateInput extends ManagedAuthUserUpdateInput {
  source: "existing" | "new";
  existingUserId?: string | null;
}

export interface AuthResponse {
  authenticated: boolean;
  user: AuthUser | null;
}
