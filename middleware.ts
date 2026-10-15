import { type NextRequest, NextResponse } from "next/server";

const AUTH_SESSION_COOKIE_NAME =
  process.env.AUTH_SESSION_COOKIE_NAME ?? "bcl_auth_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/cv-generator",
  "/dashboard/cv-generator",
  "/api/cv/extract",
  // Lets browser-side extraction code read the shared Gemini model setting; exposes no PII.
  "/api/gemini-model",
  // Called by the BCL Meetings mobile app, which has no web session cookie for this
  // domain — it authenticates via a shared-secret header instead (checked in the route
  // itself, see TASKS_REPORT_API_KEY), not the cookie-based session this middleware
  // otherwise enforces.
  "/api/tasks-report",
  // Called by Google Pub/Sub, which has no session cookie. The route authenticates itself with
  // ?token=PUBSUB_WEBHOOK_SECRET and rejects the request when the secret is unset.
  "/api/gmail/webhook",
  // Called by the EFNS automation after each run (no session cookie). The route authenticates with
  // the x-efns-secret header (EFNS_FILING_SECRET) and rejects every request while that is unset.
  "/api/immigration-notifications/file-job/efns",
  // Called by the local automation server when a run finishes (no session cookie - the user may
  // have closed the window). Both routes authenticate with the per-run completion_secret minted
  // in /api/automations/run, checked against the run row itself.
  "/api/automations/complete",
  "/api/automations/settled",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-search", search);

  if (isPublicPath(pathname)) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const sessionCookie = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    // API callers expect JSON, not the /login HTML page. Redirecting them makes fetch follow the
    // redirect and hand back HTML with a 200, which clients then mis-parse (e.g. `res.accounts`
    // coming through as undefined and crashing on `.filter`). Answer with a 401 JSON body instead.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
