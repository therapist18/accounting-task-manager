import { NextResponse } from "next/server";

/**
 * Resolves the local automation server.
 *
 * The Electron main process picks a free port at startup and injects it as
 * AUTOMATIONS_API_URL. In `next dev` there is no Electron parent, so fall back
 * to the conventional port that `npm run automation:dev` listens on.
 */
export function getAutomationsApi() {
  return process.env.AUTOMATIONS_API_URL || "http://127.0.0.1:4000";
}

export function automationsUnavailable(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: "AUTOMATIONS_UNAVAILABLE",
    },
    { status: 503 }
  );
}

/**
 * Forwards a request to the automation server and normalises transport failures.
 *
 * The automation server is a child of the desktop shell: if it has not booted,
 * crashed, or was disabled, every proxy route needs to say so clearly rather
 * than surfacing a raw "fetch failed".
 */
export async function forward(path: string, init: RequestInit = {}) {
  const url = `${getAutomationsApi()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
  } catch {
    return automationsUnavailable(
      "The automation service is not running. Restart the desktop app, or start it with `npm run automation:dev`."
    );
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { success: false, error: "The automation service returned an unreadable response." },
      { status: 502 }
    );
  }

  return NextResponse.json(payload, { status: response.status });
}
