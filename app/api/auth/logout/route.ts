import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ authenticated: false, user: null });

  // Clear session cookie with correct name
  response.cookies.set(AUTH_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
