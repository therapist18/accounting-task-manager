export type TaskManagerRole =
  | "admin"
  | "manager"
  | "user"
  | "super_admin";

export type ScannerUserRole =
  | "general_admin"
  | "company_admin"
  | "petty_cash_user"
  | "officer"
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
}

export interface AppSession {
  tokenUid: string;
  user: AuthUser;
}

export interface ManagedAuthUser extends AuthUser {
  clerkUserId: string | null;
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
