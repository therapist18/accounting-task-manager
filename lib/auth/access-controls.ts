import "server-only";
import { AuthError } from "@/lib/auth/errors";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { AuthUser, ManagedAuthUser, ScannerUserRole } from "@/lib/auth/types";
import {
  getUserAppAccess,
  isCompleteAccess,
  listAllUsersAppAccess,
  markComplete,
  patchUserAppAccess,
  patchUsersAppAccessByRole,
  replaceUserAppAccess,
  type AppAccessDocument,
} from "@/lib/auth/app-access";
import {
  PERMISSIONS,
  findPermissionForPath,
  getDefaultPermissionsForRole,
  type PermissionKey,
} from "@/lib/auth/permissions";

// Access lives entirely in scanner_users.task_manager_access: { permissions: { [key]: bool } }
// holds each user's complete Task Manager permissions. A "role" is just the users who have
// it — editing a role writes into every one of them.

export type PermissionMap = Record<PermissionKey, boolean>;

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export function defaultPermissionMap(role: string): PermissionMap {
  const defaults = new Set(getDefaultPermissionsForRole(role as ScannerUserRole));
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, defaults.has(key)])) as PermissionMap;
}

/** The user's permissions; a key missing from the column (e.g. added later) uses the role default. */
function toPermissionMap(role: string, document: AppAccessDocument): PermissionMap {
  const defaults = defaultPermissionMap(role);
  const stored = document.permissions ?? {};
  return Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, typeof stored[key] === "boolean" ? stored[key] : defaults[key]])
  ) as PermissionMap;
}

const toKeys = (map: PermissionMap) => PERMISSION_KEYS.filter((key) => map[key]);

// ── One-time conversion from the old model ────────────────────────────

const LEGACY_ROLE_TABLE = "tm_role_permissions";

/** Old role permissions (tm_role_permissions), used only to convert users once. */
async function listLegacyRolePermissions(): Promise<Map<string, PermissionKey[]>> {
  const { data, error } = await createServerSupabaseClient().from(LEGACY_ROLE_TABLE).select("role, permissions");
  if (error) return new Map();
  const allowed = new Set<string>(PERMISSION_KEYS);
  return new Map(
    ((data ?? []) as { role: string; permissions: unknown }[]).map((row) => [
      row.role,
      (Array.isArray(row.permissions) ? row.permissions : []).filter(
        (key): key is PermissionKey => typeof key === "string" && allowed.has(key)
      ),
    ])
  );
}

/**
 * Returns a user's complete permissions. A column that isn't complete yet (empty, or the old
 * overrides-only format) is built once — from the old role permissions while they exist,
 * else the role's built-in defaults, with any stored values on top — and written back.
 */
async function ensureComplete(
  user: { id: string; role: string },
  document: AppAccessDocument,
  legacy?: Map<string, PermissionKey[]>
): Promise<PermissionMap> {
  if (isCompleteAccess(document)) return toPermissionMap(user.role, document);

  const legacyRoles = legacy ?? (await listLegacyRolePermissions());
  const base = new Set(legacyRoles.get(user.role) ?? getDefaultPermissionsForRole(user.role as ScannerUserRole));
  const stored = document.permissions ?? {};
  const map = Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, typeof stored[key] === "boolean" ? stored[key] : base.has(key)])
  ) as PermissionMap;

  await replaceUserAppAccess(user.id, "task_manager", markComplete({ permissions: map }));
  return map;
}

export interface UserTaskAccess {
  id: string;
  role: ScannerUserRole;
  isActive: boolean;
  permissions: PermissionMap;
}

/** Every user with their complete permissions (converting any that aren't yet). */
export async function listUsersTaskAccess(): Promise<UserTaskAccess[]> {
  const rows = await listAllUsersAppAccess("task_manager");
  const needsConversion = rows.some((r) => r.role !== "SuperAdmin" && !isCompleteAccess(r.document));
  const legacy = needsConversion ? await listLegacyRolePermissions() : new Map<string, PermissionKey[]>();

  const result: UserTaskAccess[] = [];
  // Small batches so converting everyone the first time doesn't flood the database.
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    result.push(
      ...(await Promise.all(
        batch.map(async (r) => ({
          id: r.id,
          role: r.role as ScannerUserRole,
          isActive: r.isActive,
          permissions:
            r.role === "SuperAdmin"
              ? (Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionMap)
              : await ensureComplete(r, r.document, legacy),
        }))
      ))
    );
  }
  return result;
}

// ── Reading permissions ───────────────────────────────────────────────

export async function getEffectivePermissionsForUser(user: AuthUser | ManagedAuthUser): Promise<PermissionKey[]> {
  if (user.isSuperAdmin) return [...PERMISSION_KEYS];
  return toKeys(await ensureComplete(user, await getUserAppAccess(user.id, "task_manager")));
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

// ── Roles = the users who have them ───────────────────────────────────

export interface RoleSummary {
  role: ScannerUserRole;
  userCount: number;
  /** Keys every user of the role has, and keys only some of them have. */
  permissions: PermissionKey[];
  partial: PermissionKey[];
}

export async function getRoleSummaries(roles: ScannerUserRole[]): Promise<RoleSummary[]> {
  const users = await listUsersTaskAccess();
  return roles.map((role) => {
    const members = users.filter((u) => u.role === role);
    const permissions: PermissionKey[] = [];
    const partial: PermissionKey[] = [];
    for (const key of PERMISSION_KEYS) {
      const count = members.filter((m) => m.permissions[key]).length;
      if (members.length > 0 && count === members.length) permissions.push(key);
      else if (count > 0) partial.push(key);
    }
    return { role, userCount: members.length, permissions, partial };
  });
}

/** Bulk edit: sets the given keys for every user with this role. */
export async function setRolePermissionChanges(role: ScannerUserRole, changes: Partial<PermissionMap>): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  // Convert everyone first, so the bulk patch lands on complete columns.
  await listUsersTaskAccess();
  await patchUsersAppAccessByRole(role, "task_manager", { permissions: changes });
}

// ── One user ──────────────────────────────────────────────────────────

export async function setUserPermissionChanges(
  user: { id: string; role: string },
  changes: Partial<PermissionMap>
): Promise<void> {
  await ensureComplete(user, await getUserAppAccess(user.id, "task_manager"));
  await patchUserAppAccess(user.id, "task_manager", { permissions: changes });
}

/** Puts a user back on their role's built-in defaults. */
export async function resetUserToRoleDefaults(user: { id: string; role: string }): Promise<void> {
  await replaceUserAppAccess(user.id, "task_manager", markComplete({ permissions: defaultPermissionMap(user.role) }));
}

export { PERMISSION_KEYS };
