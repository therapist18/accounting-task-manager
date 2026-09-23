import "server-only";
import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import {
  findScannerUserByEmail,
  getScannerUserByFirebaseUid,
  linkScannerUserFirebaseUid,
  touchScannerUserLogin,
} from "@/lib/auth/scanner-users";
import { AuthError } from "@/lib/auth/errors";
import type { AppSession, AuthUser } from "@/lib/auth/types";

export const AUTH_SESSION_COOKIE_NAME =
  process.env.AUTH_SESSION_COOKIE_NAME ?? "bcl_auth_session";

const DEFAULT_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 days
const sessionMaxAgeMs = Number.parseInt(
  process.env.AUTH_SESSION_MAX_AGE_MS ?? String(DEFAULT_SESSION_MAX_AGE_MS),
  10
);

// Short-TTL in-memory cache for verified sessions. Every authenticated call currently pays a full
// chain on each request: Firebase verifySessionCookie (a network RPC to Google) + the lookup that
// maps the token uid to a scanner_users row. In a page that fires several API calls in parallel
// (and where every dialog save is its own request), that fixed cost stacks up and makes simple
// PATCHes feel sluggish. Caching the resolved session for a minute means consecutive requests from
// the same cookie skip both lookups entirely. Revocations are only reflected within the TTL — an
// acceptable trade for internal tooling; the cookie, permissions and DB rows are always still
// re-read fresh by each route's own queries.
const SESSION_CACHE_TTL_MS = 60_000;
const sessionCache = new Map<string, { session: AppSession; expiresAt: number }>();

function getCachedSession(cookie: string): AppSession | null {
  const entry = sessionCache.get(cookie);
  if (!entry) return null;
  if (entry.expiresAt > Date.now()) return entry.session;
  sessionCache.delete(cookie);
  return null;
}

function setCachedSession(cookie: string, session: AppSession) {
  if (sessionCache.size > 512) sessionCache.clear(); // crude bound for long-lived processes
  sessionCache.set(cookie, { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";").map((p) => p.trim())) {
    const [key, ...rest] = pair.split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function resolveUserFromVerifiedToken(token: DecodedIdToken): Promise<AuthUser | null> {
  const directUser = await getScannerUserByFirebaseUid(token.uid);
  if (directUser) return directUser;

  if (typeof token.email === "string" && token.email.trim()) {
    const emailUser = await findScannerUserByEmail(token.email.trim());
    if (emailUser) {
      if (emailUser.payrollAccessEnabled) {
        await linkScannerUserFirebaseUid(emailUser.id, token.uid);
        return { ...emailUser, firebaseUid: token.uid };
      }
      return emailUser;
    }
  }
  return null;
}

export async function createFirebaseSessionCookie(idToken: string) {
  return getFirebaseAdminAuth().createSessionCookie(idToken, { expiresIn: sessionMaxAgeMs });
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(sessionMaxAgeMs / 1000),
  };
}

export async function getAppSessionFromRequest(request: Request): Promise<AppSession | null> {
  const sessionCookie = parseCookieHeader(
    request.headers.get("cookie"),
    AUTH_SESSION_COOKIE_NAME
  );
  if (!sessionCookie) return null;

  const cached = getCachedSession(sessionCookie);
  if (cached) return cached;

  try {
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, false);
    const user = await resolveUserFromVerifiedToken(decoded);
    if (!user || !user.isActive) return null;
    const session = { tokenUid: decoded.uid, user };
    setCachedSession(sessionCookie, session);
    return session;
  } catch {
    return null;
  }
}

export async function getServerAppSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  const cached = getCachedSession(sessionCookie);
  if (cached) return cached;

  try {
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, false);
    const user = await resolveUserFromVerifiedToken(decoded);
    if (!user || !user.isActive) return null;
    const session = { tokenUid: decoded.uid, user };
    setCachedSession(sessionCookie, session);
    return session;
  } catch {
    return null;
  }
}

export async function requireAppSession(request: Request): Promise<AppSession> {
  const session = await getAppSessionFromRequest(request);
  if (!session) throw new AuthError(401, "Authentication required.");
  if (!session.user.isActive) throw new AuthError(403, "This account is inactive.");
  return session;
}

export async function resolveSessionFromIdToken(idToken: string): Promise<AppSession> {
  const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken, false);
  const user = await resolveUserFromVerifiedToken(decoded);
  if (!user) throw new AuthError(403, "No account profile is linked to this Firebase account.");
  if (!user.isActive) throw new AuthError(403, "This account is inactive.");

  void touchScannerUserLogin(user.id, decoded.email ?? user.email).catch((error: unknown) => {
    console.error("[Auth] Failed to update last_login", error);
  });

  return { tokenUid: decoded.uid, user };
}

export const AUTH_SESSION_COOKIE = AUTH_SESSION_COOKIE_NAME;
