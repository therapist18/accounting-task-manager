import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase";

const getSupabaseAdmin = () => createServerSupabaseClient();

/**
 * Per-user, per-app access overrides stored as jsonb columns on the shared scanner_users
 * table (see migration 20261008000000_add_app_access_to_scanner_users.sql). Each document
 * holds only what has been customised for that user — `{ group: { flag: boolean } }` —
 * and everything missing follows the user's role in that app.
 *
 * The same file is used by BCL Registry, Task Manager, KRA Tools and BCL Meetings; keep them in sync.
 */
export const APP_ACCESS_COLUMNS = {
  registry: "registry_access",
  task_manager: "task_manager_access",
  kra_tools: "kra_tools_access",
  meetings: "meetings_access",
} as const;

export type AppKey = keyof typeof APP_ACCESS_COLUMNS;

/** `{ group: { flag: boolean } }` as stored. */
export type AppAccessDocument = Record<string, Record<string, boolean>>;

/** A change: `null` for a group or flag resets it to the role. */
export type AppAccessPatch = Record<string, Record<string, boolean | null> | null>;

// Missing column (migration not applied yet): degrade to "no overrides" instead of breaking
// login or the users list.
function isMissingColumnError(error: { code?: string; message?: string } | null) {
  return (
    !!error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /column .* does not exist/i.test(error.message ?? ""))
  );
}

function toDocument(value: unknown): AppAccessDocument {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AppAccessDocument)
    : {};
}

export async function getUserAppAccess(userId: string, app: AppKey): Promise<AppAccessDocument> {
  const column = APP_ACCESS_COLUMNS[app];
  const { data, error } = await getSupabaseAdmin()
    .from("scanner_users")
    .select(column)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) {
      console.warn(`[app-access] scanner_users.${column} is missing — run the app access migration.`);
      return {};
    }
    throw error;
  }
  return toDocument((data as Record<string, unknown> | null)?.[column]);
}

/** Several users' overrides for an app, keyed by user id (users with none map to {}). */
export async function getUsersAppAccess(userIds: string[], app: AppKey): Promise<Map<string, AppAccessDocument>> {
  const result = new Map<string, AppAccessDocument>(userIds.map((id) => [id, {}]));
  if (userIds.length === 0) return result;
  const column = APP_ACCESS_COLUMNS[app];
  const { data, error } = await getSupabaseAdmin()
    .from("scanner_users")
    .select(`id, ${column}`)
    .in("id", userIds);
  if (error) {
    if (isMissingColumnError(error)) return result;
    throw error;
  }
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    result.set(String(row.id), toDocument(row[column]));
  }
  return result;
}

/** Every user's overrides for an app, keyed by user id (users with none are omitted). */
export async function listUsersAppAccess(app: AppKey): Promise<Map<string, AppAccessDocument>> {
  const column = APP_ACCESS_COLUMNS[app];
  const { data, error } = await getSupabaseAdmin()
    .from("scanner_users")
    .select(`id, ${column}`)
    .not(column, "is", null);
  if (error) {
    if (isMissingColumnError(error)) return new Map();
    throw error;
  }
  return new Map(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => [
      String(row.id),
      toDocument(row[column]),
    ])
  );
}

/** Applies a patch atomically in the database (no read-modify-write race). */
export async function patchUserAppAccess(
  userId: string,
  app: AppKey,
  patch: AppAccessPatch
): Promise<AppAccessDocument> {
  const { data, error } = await getSupabaseAdmin().rpc("patch_scanner_user_app_access", {
    p_user_id: userId,
    p_app: app,
    p_patch: patch,
  });
  if (error) throw error;
  return toDocument(data);
}

/** Drops all of a user's overrides for an app, so they follow their role again. */
export async function resetUserAppAccess(userId: string, app: AppKey): Promise<void> {
  await resetUsersAppAccess([userId], app);
}

/** Same as resetUserAppAccess for several users in one update. */
export async function resetUsersAppAccess(userIds: string[], app: AppKey): Promise<void> {
  if (userIds.length === 0) return;
  const { error } = await getSupabaseAdmin()
    .from("scanner_users")
    .update({ [APP_ACCESS_COLUMNS[app]]: null, updated_at: new Date().toISOString() })
    .in("id", userIds);
  if (error) throw error;
}

// ── Complete documents ──────────────────────────────────────────────────
// Access lives entirely in these columns: a converted column holds the user's full
// permissions and carries this marker. Anything without it (null, or the older
// overrides-only format) is converted by the app on first use.

export const ACCESS_META_GROUP = "_meta";

export function isCompleteAccess(document: AppAccessDocument | null | undefined): boolean {
  return document?.[ACCESS_META_GROUP]?.complete === true;
}

export function markComplete(document: AppAccessDocument): AppAccessDocument {
  return { ...document, [ACCESS_META_GROUP]: { complete: true } };
}

export interface UserAppAccessRow {
  id: string;
  role: string;
  isActive: boolean;
  document: AppAccessDocument;
}

/** Every user with their role and access document for an app (null documents become {}). */
export async function listAllUsersAppAccess(app: AppKey): Promise<UserAppAccessRow[]> {
  const column = APP_ACCESS_COLUMNS[app];
  const { data, error } = await getSupabaseAdmin()
    .from("scanner_users")
    .select(`id, role, is_active, ${column}`);
  if (error) {
    if (isMissingColumnError(error)) {
      console.warn(`[app-access] scanner_users.${column} is missing — run the app access migration.`);
      return [];
    }
    throw error;
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    role: String(row.role),
    isActive: row.is_active !== false,
    document: toDocument(row[column]),
  }));
}

/** Overwrites a user's whole access document for an app (used when converting/filling it). */
export async function replaceUserAppAccess(
  userId: string,
  app: AppKey,
  document: AppAccessDocument
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("scanner_users")
    .update({ [APP_ACCESS_COLUMNS[app]]: document, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

/** Bulk edit for a role: applies the patch to every user with that role. Returns the count. */
export async function patchUsersAppAccessByRole(
  role: string,
  app: AppKey,
  patch: AppAccessPatch
): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("patch_scanner_users_app_access_by_role", {
    p_role: role,
    p_app: app,
    p_patch: patch,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
