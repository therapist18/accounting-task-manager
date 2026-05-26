import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE_NAME,
  createFirebaseSessionCookie,
  getAppSessionFromRequest,
  getSessionCookieOptions,
  resolveSessionFromIdToken,
} from "@/lib/auth/session";
import { getEffectivePermissionsForUser } from "@/lib/auth/access-controls";
import { toAuthErrorResponse } from "@/lib/auth/errors";

function isAuthConfigurationError(error: unknown) {
  return error instanceof Error && error.message.includes("Missing required environment variable");
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSessionFromRequest(request);
    if (!session) return NextResponse.json({ authenticated: false, user: null });
    const permissions = await getEffectivePermissionsForUser(session.user);
    return NextResponse.json({ authenticated: true, user: { ...session.user, permissions } });
  } catch (error) {
    if (isAuthConfigurationError(error)) {
      return NextResponse.json({ authenticated: false, user: null });
    }
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ authenticated: false, user: null }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { idToken?: string };
    const idToken = typeof body.idToken === "string" ? body.idToken : "";

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "idToken is required." },
        { status: 400 }
      );
    }

    const [session, sessionCookie] = await Promise.all([
      resolveSessionFromIdToken(idToken),
      createFirebaseSessionCookie(idToken),
    ]);

    const response = NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        ...session.user,
        permissions: await getEffectivePermissionsForUser(session.user),
      },
    });
    response.cookies.set(AUTH_SESSION_COOKIE_NAME, sessionCookie, getSessionCookieOptions());
    return response;
  } catch (error) {
    if (isAuthConfigurationError(error)) {
      return NextResponse.json(
        { success: false, error: "Sign-in is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "Failed to create session." },
      { status: 500 }
    );
  }
}
