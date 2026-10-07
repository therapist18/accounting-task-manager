import { NextRequest, NextResponse } from "next/server";
import {
  PERMISSION_KEYS,
  defaultPermissionMap,
  ensurePermission,
  getEffectivePermissionsForUser,
  listUsersTaskAccess,
  resetUserToRoleDefaults,
  setUserPermissionChanges,
} from "@/lib/auth/access-controls";
import { requireAppSession } from "@/lib/auth/session";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import type { PermissionKey } from "@/lib/auth/permissions";
import { getManagedScannerUserById, listManagedScannerUsers } from "@/lib/auth/scanner-users";

// One user's Task Manager access, read and written directly in scanner_users.task_manager_access
// (their complete permissions).

const KEYS = new Set<string>(PERMISSION_KEYS);

function errorResponse(error: unknown, fallback: string) {
  const authResponse = toAuthErrorResponse(error);
  if (authResponse) return authResponse;
  console.error(`${fallback}:`, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

async function loadUserAccess(userId: string) {
  const user = await getManagedScannerUserById(userId);
  if (!user) return null;
  const defaults = defaultPermissionMap(user.role);
  return {
    userId,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
    // The built-in defaults for the role, shown alongside for reference / reset.
    roleDefault: PERMISSION_KEYS.filter((key) => defaults[key]),
    effective: await getEffectivePermissionsForUser(user),
  };
}

/** Several users' effective permissions, keyed by id (Super Admins have everything). */
async function accessByUser(userIds: string[]) {
  const wanted = new Set(userIds);
  const users = (await listUsersTaskAccess()).filter((u) => wanted.has(u.id));
  return Object.fromEntries(
    users.map((u) => [u.id, { role: u.role, permissions: PERMISSION_KEYS.filter((key) => u.permissions[key]) }])
  );
}

/** No params: the user list. ?userId: that user's access. ?userIds=a,b: several users' access. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.view");

    const userIds = (request.nextUrl.searchParams.get("userIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (userIds.length > 0) {
      return NextResponse.json({ success: true, accessByUser: await accessByUser(userIds) });
    }

    const userId = request.nextUrl.searchParams.get("userId");
    if (userId) {
      const data = await loadUserAccess(userId);
      if (!data) return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
      return NextResponse.json({ success: true, data });
    }

    const users = await listManagedScannerUsers();
    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        // For the BCL Staff / All Users switch (company 10 = BCL itself).
        companyIds: u.companyIds,
        hasAllCompanyAccess: u.hasAllCompanyAccess,
      })),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load user access");
  }
}

/** Body: { userId, permissions: { [key]: boolean } } — sets those keys for the user. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.manage");

    const body = (await request.json()) as { userId?: string; permissions?: Record<string, unknown> };
    if (!body.userId) return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
    if (body.userId === session.user.id && !session.user.isSuperAdmin) {
      return NextResponse.json({ success: false, error: "You cannot change your own access." }, { status: 400 });
    }
    if (!body.permissions || typeof body.permissions !== "object") {
      return NextResponse.json({ success: false, error: "permissions must be an object." }, { status: 400 });
    }

    const user = await getManagedScannerUserById(body.userId);
    if (!user) return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
    if (user.isSuperAdmin) {
      return NextResponse.json({ success: false, error: "Super Admin always has every permission." }, { status: 400 });
    }

    const changes: Partial<Record<PermissionKey, boolean>> = {};
    for (const [key, value] of Object.entries(body.permissions)) {
      if (!KEYS.has(key) || typeof value !== "boolean") {
        return NextResponse.json({ success: false, error: `Invalid permission change: ${key}` }, { status: 400 });
      }
      changes[key as PermissionKey] = value;
    }

    await setUserPermissionChanges(user, changes);
    return NextResponse.json({ success: true, data: await loadUserAccess(body.userId) });
  } catch (error) {
    return errorResponse(error, "Failed to save user access");
  }
}

/** Puts the user back on their role's built-in defaults. */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.manage");

    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });

    const user = await getManagedScannerUserById(userId);
    if (!user) return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
    await resetUserToRoleDefaults(user);
    return NextResponse.json({ success: true, data: await loadUserAccess(userId) });
  } catch (error) {
    return errorResponse(error, "Failed to reset user access");
  }
}
