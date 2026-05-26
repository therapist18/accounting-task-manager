import "server-only";
import { AuthError } from "@/lib/auth/errors";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { AuthUser, ManagedAuthUser } from "@/lib/auth/types";
import {
  PERMISSIONS,
  findPermissionForPath,
  getDefaultPermissionsForRole,
  type PermissionKey,
} from "@/lib/auth/permissions";

export const ROLE_PERMISSIONS_TABLE = "tm_role_permissions";

function normalizePermissions(value: unknown): PermissionKey[] {
  const allowed = new Set(PERMISSIONS.map((p) => p.key));
  const permissions = Array.isArray(value) ? value : [];
  return [...new Set(permissions.filter((item): item is PermissionKey => typeof item === "string" && allowed.has(item as PermissionKey)))];
}

function isMissingTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "42P01" || (error as { code?: string }).code === "PGRST205")
  );
}

export async function getRolePermissions(role: string): Promise<PermissionKey[] | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ROLE_PERMISSIONS_TABLE)
    .select("permissions")
    .eq("role", role)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  if (!data) return null;

  return normalizePermissions(data.permissions);
}

export async function setRolePermissions(role: string, permissions: string[]): Promise<PermissionKey[]> {
  const normalizedPermissions = normalizePermissions(permissions);
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(ROLE_PERMISSIONS_TABLE)
    .upsert(
      { role, permissions: normalizedPermissions, updated_at: new Date().toISOString() },
      { onConflict: "role" }
    )
    .select("permissions")
    .single();

  if (error) throw error;

  return normalizePermissions(data.permissions);
}

export async function getEffectivePermissionsForUser(user: AuthUser | ManagedAuthUser): Promise<PermissionKey[]> {
  if (user.isSuperAdmin) return PERMISSIONS.map((p) => p.key);

  const rolePermissions = await getRolePermissions(user.role);
  if (rolePermissions) return rolePermissions;

  return getDefaultPermissionsForRole(user.role);
}

export async function canAccessPath(user: AuthUser, pathname: string): Promise<boolean> {
  if (user.isSuperAdmin) return true;

  const permission = findPermissionForPath(pathname);
  if (!permission) return true;

  const permissions = await getEffectivePermissionsForUser(user);
  return permissions.includes(permission.key);
}

export async function ensurePermission(user: AuthUser, permission: PermissionKey) {
  if (user.isSuperAdmin) return;

  const permissions = await getEffectivePermissionsForUser(user);
  if (!permissions.includes(permission)) {
    throw new AuthError(403, "You do not have access to perform this action.");
  }
}
