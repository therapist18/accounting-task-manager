import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ success: false, error: message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 409 });
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === "object") {
    const maybe = error as {
      message?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    if (typeof maybe.error   === "string" && maybe.error.trim())   return maybe.error;
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
    const parts: string[] = [];
    if (typeof maybe.code    === "string") parts.push(maybe.code);
    if (typeof maybe.details === "string") parts.push(maybe.details);
    if (typeof maybe.hint    === "string") parts.push(maybe.hint);
    if (parts.length > 0) return parts.join(" | ");
  }

  return "Internal server error";
}

export function serverError(error: unknown) {
  const message = extractErrorMessage(error);
  console.error("[API Error]", error);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}
