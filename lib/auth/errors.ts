import { NextResponse } from "next/server";

export class AuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export function toAuthErrorResponse(error: unknown) {
  if (!(error instanceof AuthError)) return null;
  if (error.status === 401) return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  return NextResponse.json({ success: false, error: error.message }, { status: 403 });
}
