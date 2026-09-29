import "server-only";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { createServerSupabaseClient } from "@/lib/supabase";

export const getSupabaseAdmin = () => createServerSupabaseClient();
import type {
  AuthUser,
  ManagedAuthUser,
  ManagedAuthUserCreateInput,
  ManagedAuthUserUpdateInput,
  ScannerUserRole,
} from "@/lib/auth/types";
import { getRoleAssignmentsByUserId, getRoleAssignmentsByUserIds, setRoleAssignmentsForUser } from "./role-assignments";

export const SCANNER_USERS_TABLE = "scanner_users";
// Mirrors the `public.user_role` Postgres enum on scanner_users.role (see ScannerUserRole).
// This list is the app's allowlist: a value in the DB but not here makes normalizeRole throw
// and takes down every roster-reading route, so both need updating together.
export const SCANNER_USER_ROLES: ScannerUserRole[] = [
  "general_admin",
  "company_admin",
  "petty_cash_user",
  "officer",
  "company_staff",
  "bcl_staff",
  "SuperAdmin",
];
export const SCANNER_USERS_SELECT = [
  "id",
  "firebase_uid",
  "company_id",
  "role",
  "created_at",
  "updated_at",
  "is_active",
  "username",
  "password",
  "first_name",
  "last_name",
  "email",
  "last_login",
  "company_ids",
  "payroll_access_enabled",
  "job_levels",
].join(",");

export interface ScannerUserRow {
  id: string;
  firebase_uid: string | null;
  company_id: number | null;
  role: ScannerUserRole;
  created_at: string | null;
  updated_at: string | null;
  is_active: boolean | null;
  username: string | null;
  password: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  last_login: string | null;
  company_ids: unknown;
  payroll_access_enabled: boolean | null;
  job_levels: unknown;
}

interface FetchRowsOptions {
  payrollAccessEnabled?: boolean;
}

interface NormalizedManagedUserInput {
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
  password: string | null;
  roleAssignments?: any[];
}

export function isScannerUserRole(value: unknown): value is ScannerUserRole {
  return SCANNER_USER_ROLES.includes(value as ScannerUserRole);
}

function normalizeRole(value: unknown): ScannerUserRole {
  if (isScannerUserRole(value)) return value;
  throw new Error(`Unsupported scanner_users role: ${String(value)}`);
}

function normalizeCompanyAccess(
  companyIds: unknown,
  primaryCompanyId: number | null
): { companyIds: number[]; hasAllCompanyAccess: boolean } {
  const values = Array.isArray(companyIds) ? companyIds : [];
  const normalizedIds = new Set<number>();
  let hasAllCompanyAccess = false;

  for (const value of values) {
    if (typeof value === "string" && value.trim().toLowerCase() === "all") {
      hasAllCompanyAccess = true;
      continue;
    }
    const numericValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number.parseInt(value, 10)
          : Number.NaN;
    if (Number.isFinite(numericValue) && numericValue > 0) {
      normalizedIds.add(Math.trunc(numericValue));
    }
  }

  if (primaryCompanyId && primaryCompanyId > 0) {
    normalizedIds.add(primaryCompanyId);
  }

  return {
    companyIds: [...normalizedIds].sort((l, r) => l - r),
    hasAllCompanyAccess,
  };
}

function buildDisplayName(row: ScannerUserRow): string {
  const fullName = [row.first_name, row.last_name]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .trim();
  if (fullName) return fullName;
  if (row.username?.trim()) return row.username.trim();
  if (row.email?.trim()) return row.email.trim();
  return "User";
}

function mapScannerUser(row: ScannerUserRow): AuthUser {
  const role = normalizeRole(row.role);
  const { companyIds, hasAllCompanyAccess } = normalizeCompanyAccess(row.company_ids, row.company_id);
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    payrollAccessEnabled: row.payroll_access_enabled === true,
    role,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: buildDisplayName(row),
    isActive: row.is_active !== false,
    primaryCompanyId: row.company_id,
    companyIds,
    hasAllCompanyAccess: hasAllCompanyAccess || role === "SuperAdmin",
    isAdmin: role === "SuperAdmin" || role === "general_admin" || role === "company_admin",
    isSuperAdmin: role === "SuperAdmin",
  };
}

function mapManagedScannerUser(row: ScannerUserRow): ManagedAuthUser {
  const base = mapScannerUser(row);
  return {
    ...base,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLogin: row.last_login,
    hasPassword: Boolean(row.password && row.password.trim()),
    roleAssignments: undefined,
  };
}

// Listing every user is a bulk read (the staff rosters behind "Received By" / "Handled by"
// dropdowns read it on each page load), and mapManagedScannerUser throws on a role outside
// SCANNER_USER_ROLES. That turned a single value missing from the allowlist into a 500 for the
// whole endpoint — every dropdown silently rendered empty, with the real error only visible in
// the server log. This guard is what caught bcl_staff: it's a legitimate member of the
// public.user_role enum that had never been added to SCANNER_USER_ROLES. An unknown role still
// degrades to the least-privileged staff role and logs a warning, so one bad row can never take
// the roster down again. Auth (authenticateScannerUserByIdentifier) keeps using the strict
// mapScannerUser, so this never lets an unknown role sign in with elevated rights.
function mapManagedScannerUserLenient(row: ScannerUserRow): ManagedAuthUser | null {
  if (isScannerUserRole(row.role)) return mapManagedScannerUser(row);
  console.warn(
    `[auth] scanner_users row ${row.id} has unsupported role ${JSON.stringify(row.role)}; ` +
      `treating as company_staff and excluding from role-based admin views.`
  );
  try {
    return mapManagedScannerUser({ ...row, role: "company_staff" });
  } catch (error) {
    console.error(`[auth] Failed to map scanner_users row ${row.id}:`, error);
    return null;
  }
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeCompanyIds(companyIds: number[]): number[] {
  return [
    ...new Set(
      companyIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
        .map((v) => Math.trunc(v))
    ),
  ].sort((l, r) => l - r);
}

async function assertUniqueValue(field: "username" | "email", value: string, excludeId?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(SCANNER_USERS_TABLE).select("id").eq(field, value).limit(2);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  if ((data ?? []).length > 0) throw new Error(`${field} "${value}" is already in use.`);
}

async function fetchRowsByField(
  field: "username" | "email" | "firebase_uid" | "id",
  value: string,
  options?: FetchRowsOptions
): Promise<ScannerUserRow[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(SCANNER_USERS_TABLE).select(SCANNER_USERS_SELECT).eq(field, value).limit(5);
  if (typeof options?.payrollAccessEnabled === "boolean") {
    query = query.eq("payroll_access_enabled", options.payrollAccessEnabled);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown) as ScannerUserRow[];
}

async function normalizeManagedUserInput(
  input: ManagedAuthUserUpdateInput,
  existingUser?: ManagedAuthUser | null,
  userId?: string
): Promise<NormalizedManagedUserInput> {
  // Guard the write side too: without this, an unrecognised role (e.g. a handling-method value
  // like "bcl_staff" pasted into the role field) gets persisted and then breaks every later read
  // that maps scanner_users rows, since normalizeRole rejects it. Fail here, at the point of
  // entry, rather than surfacing as an empty staff dropdown much later.
  if (!isScannerUserRole(input.role)) {
    throw new Error(
      `Unsupported role ${JSON.stringify(input.role)}. Valid roles: ${SCANNER_USER_ROLES.join(", ")}.`
    );
  }

  const username = normalizeOptionalString(input.username);
  const email = normalizeOptionalString(input.email)?.toLowerCase() ?? null;
  const firstName = normalizeOptionalString(input.firstName);
  const lastName = normalizeOptionalString(input.lastName);
  const companyIds = normalizeCompanyIds(input.companyIds || []);
  const hasAllCompanyAccess = input.role === "SuperAdmin";

  if (input.role === "officer") {
    if (!username) {
      throw new Error("Username is required for sign-in.");
    }
    if (username && username !== existingUser?.username) await assertUniqueValue("username", username, userId);
    if (email && email !== existingUser?.email) await assertUniqueValue("email", email, userId);

    return {
      username, email, firstName, lastName,
      role: input.role,
      isActive: input.isActive,
      primaryCompanyId: null,
      companyIds: [],
      hasAllCompanyAccess: false,
      payrollAccessEnabled: input.payrollAccessEnabled,
      password: normalizeOptionalString(input.password ?? null),
      roleAssignments: (input as any).roleAssignments,
    };
  }

  if (input.role !== "SuperAdmin" && input.hasAllCompanyAccess) {
    throw new Error("Only Super Admin can access all companies.");
  }
  if (!hasAllCompanyAccess && companyIds.length === 0) {
    throw new Error("Select at least one company.");
  }
  if (!username) {
    throw new Error("Username is required for sign-in.");
  }

  if (username && username !== existingUser?.username) await assertUniqueValue("username", username, userId);
  if (email && email !== existingUser?.email) await assertUniqueValue("email", email, userId);

  const primaryCompanyId = hasAllCompanyAccess
    ? input.primaryCompanyId ?? existingUser?.primaryCompanyId ?? null
    : input.primaryCompanyId && companyIds.includes(input.primaryCompanyId)
      ? input.primaryCompanyId
      : companyIds[0] ?? null;

  return {
    username, email, firstName, lastName,
    role: input.role,
    isActive: input.isActive,
    primaryCompanyId,
    companyIds,
    hasAllCompanyAccess,
    payrollAccessEnabled: input.payrollAccessEnabled,
    password: normalizeOptionalString(input.password ?? null),
    roleAssignments: (input as any).roleAssignments,
  };
}

function buildManagedUserPayload(input: NormalizedManagedUserInput) {
  const payload: Record<string, unknown> = {
    username: input.username,
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    role: input.role,
    is_active: input.isActive,
    company_id: input.primaryCompanyId,
    company_ids: input.hasAllCompanyAccess ? ["all"] : input.companyIds,
    payroll_access_enabled: input.payrollAccessEnabled,
    updated_at: new Date().toISOString(),
  };

  return payload;
}

export async function getManagedScannerUserById(id: string): Promise<ManagedAuthUser | null> {
  const rows = await fetchRowsByField("id", id);
  if (rows.length === 0) return null;
  const user = mapManagedScannerUser(rows[0]);
  const roleAssignments = await getRoleAssignmentsByUserId(id);
  return {
    ...user,
    roleAssignments
  };
}

async function loadRoleAssignmentsForUsers(users: ManagedAuthUser[]): Promise<ManagedAuthUser[]> {
  // One query for every user here, not one query per user — this used to fire a Promise.all with as
  // many concurrent Supabase connections as there are scanner users system-wide (~80), which was the
  // actual cause of the "fetch failed" 500s on this route under load.
  const byUser = await getRoleAssignmentsByUserIds(users.map((u) => u.id));
  return users.map((user) => ({ ...user, roleAssignments: byUser.get(user.id) ?? [] }));
}

export async function listManagedScannerUsers(options?: FetchRowsOptions): Promise<ManagedAuthUser[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from(SCANNER_USERS_TABLE)
    .select(SCANNER_USERS_SELECT)
    .order("role", { ascending: true })
    .order("username", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true, nullsFirst: false });
  if (typeof options?.payrollAccessEnabled === "boolean") {
    query = query.eq("payroll_access_enabled", options.payrollAccessEnabled);
  }
  const { data, error } = await query;
  if (error) throw error;
  const users = (((data ?? []) as unknown) as ScannerUserRow[])
    .map(mapManagedScannerUserLenient)
    .filter((user): user is ManagedAuthUser => user !== null);
  return await loadRoleAssignmentsForUsers(users);
}

export async function findScannerUserByEmail(email: string): Promise<AuthUser | null> {
  const rows = await fetchRowsByField("email", email.trim());
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error("Duplicate email values found in scanner_users.");
  return mapScannerUser(rows[0]);
}

async function fetchRowsByIdentifier(identifier: string): Promise<ScannerUserRow[]> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return [];

  const [usernameRows, emailRows] = await Promise.all([
    fetchRowsByField("username", normalizedIdentifier),
    fetchRowsByField("email", normalizedIdentifier.toLowerCase()),
  ]);

  return [...new Map([...usernameRows, ...emailRows].map((row) => [row.id, row])).values()];
}

export async function findScannerUserByIdentifier(identifier: string): Promise<ManagedAuthUser | null> {
  const rows = await fetchRowsByIdentifier(identifier);
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error("Duplicate identifier values found in scanner_users.");
  return mapManagedScannerUser(rows[0]);
}

export async function authenticateScannerUserByIdentifier(
  identifier: string,
  password: string
): Promise<AuthUser | null> {
  const rows = await fetchRowsByIdentifier(identifier);
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error("Duplicate identifier values found in scanner_users.");

  const row = rows[0];
  const passwordMatches = await verifyScannerUserPassword(password, row.password);
  if (!passwordMatches) return null;

  return mapScannerUser(row);
}

export async function getScannerUserByFirebaseUid(firebaseUid: string): Promise<AuthUser | null> {
  const rows = await fetchRowsByField("firebase_uid", firebaseUid);
  if (rows.length === 0) return null;
  return mapScannerUser(rows[0]);
}

export async function linkScannerUserFirebaseUid(userId: string, firebaseUid: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(SCANNER_USERS_TABLE)
    .update({ firebase_uid: firebaseUid, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export async function touchScannerUserLogin(userId: string, email?: string | null): Promise<void> {
  const supabase = getSupabaseAdmin();
  const payload: Record<string, string | null> = {
    last_login: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (typeof email === "string" && email.trim()) payload.email = email.trim();
  const { error } = await supabase.from(SCANNER_USERS_TABLE).update(payload).eq("id", userId);
  if (error) throw error;
}

export async function hashScannerUserPassword(password: string): Promise<string> {
  const normalized = password.trim();
  if (!normalized) throw new Error("Password cannot be empty.");
  if (normalized.length < 6) throw new Error("Password must be at least 6 characters.");
  return bcrypt.hash(normalized, 10);
}

export async function createManagedScannerUser(input: ManagedAuthUserCreateInput): Promise<ManagedAuthUser> {
  if (input.source === "existing") {
    const existingUserId = normalizeOptionalString(input.existingUserId ?? null);
    if (!existingUserId) throw new Error("Select an existing user.");
    return updateManagedScannerUser(existingUserId, { ...input, payrollAccessEnabled: true });
  }

  const normalizedInput = await normalizeManagedUserInput(input);
  const payload: Record<string, unknown> = {
    ...buildManagedUserPayload({ ...normalizedInput, payrollAccessEnabled: true }),
    created_at: new Date().toISOString(),
  };
  if (normalizedInput.password) payload.password = await hashScannerUserPassword(normalizedInput.password);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(SCANNER_USERS_TABLE)
    .insert(payload)
    .select(SCANNER_USERS_SELECT)
    .single();
  if (error) throw error;
  return mapManagedScannerUser((data as unknown) as ScannerUserRow);
}

export async function updateManagedScannerUser(id: string, input: ManagedAuthUserUpdateInput): Promise<ManagedAuthUser> {
  try {
    console.log('Starting update for user:', id);
    console.log('Input data:', JSON.stringify(input, null, 2));

    const existingUser = await getManagedScannerUserById(id);
    if (!existingUser) throw new Error("User not found.");

    console.log('Existing user found:', JSON.stringify(existingUser, null, 2));

    const normalizedInput = await normalizeManagedUserInput(input, existingUser, id);
    console.log('Normalized input:', JSON.stringify(normalizedInput, null, 2));

    const payload: Record<string, unknown> = buildManagedUserPayload(normalizedInput);
    console.log('Built payload:', JSON.stringify(payload, null, 2));

    if (normalizedInput.password) payload.password = await hashScannerUserPassword(normalizedInput.password);

    if (normalizedInput.roleAssignments) {
      await setRoleAssignmentsForUser(id, normalizedInput.roleAssignments.map(assignment => ({
        role: assignment.role,
        department_id: assignment.department_id,
        subdepartment_id: assignment.subdepartment_id,
        class_id: assignment.class_id,
        subclass_id: assignment.subclass_id
      })));
    }

    const supabase = getSupabaseAdmin();
    console.log('About to execute Supabase update...');

    const { data, error } = await supabase
      .from(SCANNER_USERS_TABLE)
      .update(payload)
      .eq("id", id)
      .select(SCANNER_USERS_SELECT)
      .single();

    console.log('Supabase result:', { data, error });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('About to map result...');
    const user = mapManagedScannerUser((data as unknown) as ScannerUserRow);
    const roleAssignments = await getRoleAssignmentsByUserId(id);
    const result = {
      ...user,
      roleAssignments
    };
    console.log('Mapped result:', result);

    return result;
  } catch (error) {
    console.error('Error in updateManagedScannerUser:', error);
    throw error;
  }
}

export async function deleteManagedScannerUser(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(SCANNER_USERS_TABLE).delete().eq("id", id);
  if (error) throw error;
}

function safePlaintextCompare(input: string, stored: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(stored);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function verifyScannerUserPassword(
  inputPassword: string,
  storedPassword: string | null
): Promise<boolean> {
  if (!storedPassword) return false;
  if (/^\$2[aby]\$/.test(storedPassword)) return bcrypt.compare(inputPassword, storedPassword);
  return safePlaintextCompare(inputPassword, storedPassword);
}
