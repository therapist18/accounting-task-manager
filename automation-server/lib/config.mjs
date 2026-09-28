import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Env loading happens here, once, before anything reads process.env.
//
// Deliberately no `override: true`: the Electron main process injects
// PLAYWRIGHT_BROWSERS_PATH, HEADLESS, PORT and the event-bridge settings into
// this process, and a .env file must not clobber them. dotenv's default
// (first-writer-wins) keeps the injected values.
dotenv.config({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
dotenv.config();

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  // Headful by default. The desktop shell is a user-visible app and the eTA
  // portal's upload/date widgets behave differently when the page thinks it is
  // not visible. The old runner used the inverse default (headless unless
  // HEADLESS was explicitly "false").
  headless: toBoolean(process.env.HEADLESS, false),
  slowMo: Number(process.env.SLOW_MO) || 0,
  navigationTimeoutMs: Number(process.env.NAVIGATION_TIMEOUT_MS) || 120000,
  // Max simultaneous headed browsers. Each one is a real Chromium with its own
  // GPU/renderer processes, so this stays low deliberately - a user watching
  // three windows appear is fine, ten is not.
  maxConcurrentJobs: Math.max(1, Math.min(Number(process.env.MAX_CONCURRENT_JOBS) || 2, 4)),
};

// Loopback-only: this server is reachable from anything on the machine, so bind
// explicitly rather than relying on a default.
export const BIND_HOST = "127.0.0.1";
