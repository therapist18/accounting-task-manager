import { NextRequest, NextResponse } from "next/server";
import { ensurePermission, getRolePermissions, setRolePermissions } from "@/lib/auth/access-controls";
import { requireAppSession } from "@/lib/auth/session";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import type { ScannerUserRole } from "@/lib/auth/types";

const ALLOWED_ROLES = new Set<ScannerUserRole>(["SuperAdmin", "general_admin", "company_admin", "company_staff", "officer", "petty_cash_user"]);

export async function GET(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.view");

    const roles = await Promise.all(
      [...ALLOWED_ROLES].map(async (role) => {
        const saved = await getRolePermissions(role);
        return {
          role,
          permissions: saved ?? DEFAULT_ROLE_PERMISSIONS[role] ?? [],
          hasOverride: Boolean(saved),
        };
      })
    );

    return NextResponse.json({ success: true, roles });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Role permissions GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to load role permissions." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAppSession(request);
    await ensurePermission(session.user, "settings.access_controls.manage");

    const body = (await request.json()) as { role?: string; permissions?: string[] };

    if (!body.role || !ALLOWED_ROLES.has(body.role as ScannerUserRole)) {
      return NextResponse.json({ success: false, error: "Invalid or missing role." }, { status: 400 });
    }

    const permissions = await setRolePermissions(body.role, body.permissions ?? []);
    return NextResponse.json({ success: true, data: { role: body.role, permissions } });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Role permissions PUT error:", error);
    return NextResponse.json({ success: false, error: "Failed to save role permissions." }, { status: 500 });
  }
}
