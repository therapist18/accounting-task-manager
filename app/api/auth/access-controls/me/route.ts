import { NextRequest, NextResponse } from "next/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/access-controls";
import { getAppSessionFromRequest } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(request: NextRequest) {
  const session = await getAppSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false, permissions: [] }, { status: 401 });
  }

  const permissions = await getEffectivePermissionsForUser(session.user);
  return NextResponse.json({
    authenticated: true,
    permissions,
    catalog: PERMISSIONS,
  });
}
