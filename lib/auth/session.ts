import { cookies } from "next/headers";

const AUTH_SESSION_COOKIE_NAME =
  process.env.AUTH_SESSION_COOKIE_NAME ?? "bcl_auth_session";

export async function getAppSessionFromRequest(request: Request) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const sessionData = JSON.parse(sessionCookie);
    return sessionData;
  } catch (error) {
    console.error("Failed to parse session:", error);
    return null;
  }
}

export async function getServerAppSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return null;
    }

    const sessionData = JSON.parse(sessionCookie);
    return sessionData;
  } catch (error) {
    console.error("Failed to get server session:", error);
    return null;
  }
}

export function getSessionCookieOptions() {
  const isSecure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export const AUTH_SESSION_COOKIE = AUTH_SESSION_COOKIE_NAME;
