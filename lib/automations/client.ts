"use client";

/**
 * Browser-side entry point for running automations.
 *
 * The eTA browser has to run on the user's own machine, but the app itself is
 * served from Vercel - and a Vercel function cannot reach 127.0.0.1 on somebody's
 * PC. So the work is split:
 *
 *   - The hosted /api/automations/* routes own the database (run records, the
 *     per-run completion secret, persisted outcomes). They hold the service-role
 *     key; the desktop app never does.
 *   - The local automation service owns the live job (browser, logs, progress).
 *     This module talks to it directly, through whichever transport exists:
 *       * Electron  - window.desktop.automationRequest (IPC to the main process)
 *       * next dev  - plain fetch to http://127.0.0.1:4000 (`npm run dev` starts it)
 *       * anything else (the live site in a normal browser) - unavailable.
 *
 * automationFetch() keeps the old contract - it takes the same URLs the UI used to
 * fetch and returns a Response with the same statuses (503 = service unavailable,
 * 404 = unknown job) - so call sites only swap `fetch` for `automationFetch`.
 */

const DEV_SERVICE_URL = process.env.NEXT_PUBLIC_AUTOMATIONS_DEV_URL || "http://127.0.0.1:4000";

const DESKTOP_REQUIRED =
  "Automations run on your computer. Open this page in the Task Manager desktop app to run them.";
const SERVICE_DOWN =
  "The automation service is not running. Restart the desktop app, or start it with `npm run automation:dev`.";

type LocalResult = { status: number; payload: any };

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unavailable(error: string) {
  return { status: 503, payload: { success: false, error, code: "AUTOMATIONS_UNAVAILABLE" } };
}

function isLocalOrigin() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

/** True when this page can reach an automation service at all. */
export function canRunAutomations() {
  if (typeof window === "undefined") return false;
  return Boolean(window.desktop?.automationRequest) || isLocalOrigin();
}

async function callLocal(method: "GET" | "POST", path: string, body?: unknown): Promise<LocalResult> {
  if (typeof window === "undefined") return unavailable(DESKTOP_REQUIRED);

  if (window.desktop?.automationRequest) {
    try {
      return await window.desktop.automationRequest({ method, path, body });
    } catch {
      return unavailable(SERVICE_DOWN);
    }
  }

  if (!isLocalOrigin()) return unavailable(DESKTOP_REQUIRED);

  try {
    const response = await fetch(`${DEV_SERVICE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } catch {
    return unavailable(SERVICE_DOWN);
  }
}

async function startRun(init?: RequestInit): Promise<Response> {
  const request = JSON.parse(String(init?.body || "{}"));
  const { formData, ...meta } = request;

  // Fail before creating a run record, so a missing service doesn't leave a
  // "running" row behind that nothing will ever finish.
  const health = await callLocal("GET", "/health");
  if (health.status !== 200) return json(health.payload, health.status);

  if (!formData || typeof formData !== "object") {
    return json({ success: false, error: "formData is required." }, 400);
  }

  // formData (which carries portal credentials) deliberately stays on this
  // machine: the hosted route only needs the run's metadata.
  const prepareResponse = await fetch("/api/automations/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const prepared = await prepareResponse.json().catch(() => null);
  if (!prepareResponse.ok || !prepared?.success) {
    return json(prepared || { success: false, error: "Could not create the run record." }, prepareResponse.status);
  }

  const started = await callLocal("POST", "/api/automations/run", {
    type: meta.type,
    runId: prepared.runId,
    userId: prepared.userId,
    formData,
    persistUrl: prepared.persistUrl,
    persistSecret: prepared.completionSecret,
  });
  const ok = started.status === 200 && started.payload?.success;

  // Record the job id (so a refresh mid-run can resume polling), or roll the
  // placeholder row back if the service refused the run.
  await fetch("/api/automations/run", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      ok
        ? { runId: prepared.runId, jobId: started.payload.jobId }
        : { runId: prepared.runId, error: started.payload?.error || "The automation service rejected the run." }
    ),
  }).catch(() => {});

  if (!ok) {
    return json(
      { success: false, error: started.payload?.error || "Could not start the automation." },
      started.status === 200 ? 500 : started.status
    );
  }

  return json({
    success: true,
    runId: prepared.runId,
    jobId: started.payload.jobId,
    label: started.payload.label,
  });
}

/**
 * Live state comes from the local service; once the job is terminal (or the
 * service no longer knows it) the persisted row is folded in, which carries the
 * outcome proof screenshot and the task/automation ids.
 */
async function getProgress(jobId: string): Promise<Response> {
  const local = await callLocal("GET", `/api/automations/jobs/${encodeURIComponent(jobId)}`);
  if (local.status === 503) return json(local.payload, 503);

  const job = local.payload?.job as Record<string, any> | undefined;
  if (job?.isRunning) return json({ success: true, job });

  const persistedResponse = await fetch(`/api/automations/progress?jobId=${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const persisted = await persistedResponse.json().catch(() => null);

  if (!job) {
    // The service is up but has never heard of this job: it restarted (desktop
    // app relaunched, `npm run dev` restarted) and took the run with it, since
    // jobs live only in its memory. If the database still says "running", nothing
    // will ever finish that row - close it out as interrupted so the UI stops
    // polling and offers a fresh start instead of spinning forever.
    const row = persisted?.job;
    if (persistedResponse.ok && row?.isRunning && row.runId) {
      const error = "The automation service restarted while this run was in progress, so it was lost. Start it again.";
      await fetch("/api/automations/run", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: row.runId, error, interrupted: true }),
      }).catch(() => {});
      return json({
        success: true,
        persisted: true,
        job: { ...row, status: "interrupted", isRunning: false, error, message: error, currentStep: "Interrupted" },
      });
    }
    return json(persisted || { success: false, error: "Job not found." }, persistedResponse.status);
  }

  const merged =
    persistedResponse.ok && persisted?.job ? { ...job, ...persisted.job, logs: job.logs ?? [] } : job;
  return json({ success: true, job: merged });
}

async function stopRun(init?: RequestInit): Promise<Response> {
  const { jobId } = JSON.parse(String(init?.body || "{}"));
  if (!jobId) return json({ success: false, error: "jobId is required." }, 400);
  const result = await callLocal("POST", `/api/automations/jobs/${encodeURIComponent(jobId)}/stop`);
  // 404 = the service no longer has this job (it restarted), so there is nothing
  // left running to stop. Reporting that as an error left the Stop button failing
  // forever; the next progress poll closes the run out as interrupted.
  if (result.status === 404) return json({ success: true, jobId, alreadyStopped: true });
  return json(result.payload, result.status);
}

/** Drop-in replacement for fetch() on /api/automations/{run,progress,stop}. */
export async function automationFetch(url: string, init?: RequestInit): Promise<Response> {
  const parsed = new URL(url, window.location.origin);

  switch (parsed.pathname) {
    case "/api/automations/run":
      return startRun(init);
    case "/api/automations/progress":
      return getProgress(parsed.searchParams.get("jobId") || "");
    case "/api/automations/stop":
      return stopRun(init);
    default:
      return fetch(url, init);
  }
}
