import { NextRequest, NextResponse } from "next/server";
import {
  PERMISSION_KEYS,
  ensurePermission,
  getRoleSummaries,
  setRolePermissionChanges,
} from "@/lib/auth/access-controls";
import { requireAppSession } from "@/lib/auth/session";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import type { PermissionKey } from "@/lib/auth/permissions";
import type { ScannerUserRole } from "@/lib/auth/types";

// Roles have no storage of their own: a role is the users who have it. GET summarises their
// scanner_users.task_manager_access columns; PUT writes into every one of those users.

const ALLOWED_ROLES: ScannerUserRole[] = ["SuperAdmin", "general_admin", "company_admin", "company_staff", "bcl_staff", "officer", "petty_cash_user"];
const KEYS = new Set<string>(PERMISSION_KEYS);

export async function GET(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.view");

    return NextResponse.json({ success: true, roles: await getRoleSummaries(ALLOWED_ROLES) });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Role permissions GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to load role permissions." }, { status: 500 });
  }
}

/** Body: { role, changes: { [key]: boolean } } — only the keys that changed. */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.manage");

    const body = (await request.json()) as { role?: string; changes?: Record<string, unknown> };

    if (!body.role || !ALLOWED_ROLES.includes(body.role as ScannerUserRole)) {
      return NextResponse.json({ success: false, error: "Invalid or missing role." }, { status: 400 });
    }
    if (body.role === "SuperAdmin") {
      return NextResponse.json({ success: false, error: "Super Admin always has every permission." }, { status: 400 });
    }

    const changes: Partial<Record<PermissionKey, boolean>> = {};
    for (const [key, value] of Object.entries(body.changes ?? {})) {
      if (!KEYS.has(key) || typeof value !== "boolean") {
        return NextResponse.json({ success: false, error: `Invalid permission change: ${key}` }, { status: 400 });
      }
      changes[key as PermissionKey] = value;
    }

    await setRolePermissionChanges(body.role as ScannerUserRole, changes);
    return NextResponse.json({ success: true, roles: await getRoleSummaries(ALLOWED_ROLES) });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Role permissions PUT error:", error);
    return NextResponse.json({ success: false, error: "Failed to save role permissions." }, { status: 500 });
  }
}
