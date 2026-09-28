import express from "express";
import cors from "cors";

import { BIND_HOST, config } from "./lib/config.mjs";
import { emitEvent, initEventBridge } from "./lib/event-bridge.mjs";
import { logger } from "./lib/logger.mjs";
import {
  getJob,
  getRunningCount,
  listJobs,
  requestStop,
  serializeJob,
  startJob,
} from "./lib/job-store.mjs";
import { getSupportedTypes } from "./lib/runners.mjs";

initEventBridge();

const app = express();

// The Next server proxies to this process, so CORS only needs to admit it.
app.use(cors({ origin: [/^http:\/\/127\.0\.0\.1(:\d+)?$/, /^http:\/\/localhost(:\d+)?$/] }));
app.use(express.json({ limit: "25mb" }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", runningJobs: getRunningCount(), timestamp: new Date().toISOString() });
});

app.get("/api/automations", (_req, res) => {
  res.json({ success: true, types: getSupportedTypes(), runningJobs: getRunningCount() });
});

app.get("/api/automations/jobs", (_req, res) => {
  res.json({ success: true, jobs: listJobs().map(serializeJob) });
});

app.get("/api/automations/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ success: false, error: "Job not found" });
    return;
  }
  res.json({ success: true, job: serializeJob(job) });
});

// Starts the run and responds immediately - the browser work continues detached.
app.post("/api/automations/run", (req, res) => {
  const { type, runId, userId, formData, persistUrl, persistSecret } = req.body || {};

  if (!type) {
    res.status(400).json({ success: false, error: "type is required" });
    return;
  }
  if (getRunningCount() >= config.maxConcurrentJobs) {
    res.status(429).json({
      success: false,
      error: `Already running ${getRunningCount()} automation(s). Wait for one to finish or stop it.`,
    });
    return;
  }

  // Persistence is delegated back to the Next server rather than done here. This
  // process must not hold the Supabase service-role key: it ships inside the
  // desktop installer, so anyone who unpacked the app would have full DB admin.
  // The Next process holds the key, and persistSecret is a per-run capability
  // token it minted, so this callback can only ever touch its own run row.
  const persist = async (pathSuffix, payload) => {
    if (!persistUrl || !persistSecret) return;
    const response = await fetch(`${persistUrl}${pathSuffix}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, runId, userId, secret: persistSecret }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Persistence failed (${response.status}): ${text.slice(0, 200)}`);
    }
  };

  let job;
  try {
    job = startJob({
      type,
      // runId/userId are threaded through to onTerminal so the desktop shell
      // can attribute the completion notification to the right run. They are
      // held under double-underscore keys to avoid colliding with runner payload
      // fields, and are never read by the runner itself.
      requestData: { formData, __runId: runId ?? null, __userId: userId ?? null },
      onComplete: (outcome) =>
        persist("/api/automations/complete", {
          status: "completed",
          taskId: outcome.taskId,
          screenshot: outcome.screenshotBase64,
        }),
      onFailure: (error) =>
        persist("/api/automations/complete", { status: "failed", error: error.message }),
      onSettled: () => persist("/api/automations/settled", {}),
      // Emitted directly from the job lifecycle, not from the persistence hooks:
      // a run that failed to reach the database must still notify the user, and a
      // run the user stopped must notify that too.
      onTerminal: (snapshot) => {
        // `type` is set after the spread on purpose: the snapshot's own `type` is
        // the automation type ("eta-kenya"), which would otherwise overwrite the
        // event type and leave the desktop shell unable to tell success from
        // failure. The automation type survives as `automationType`.
        //
        // A user-requested stop gets its own event type. Folding it into
        // job:failed would pop a red "failed" toast for something the user did
        // deliberately, which trains people to ignore the notifications.
        const eventType =
          snapshot.status === "completed"
            ? "job:finished"
            : snapshot.status === "cancelled"
              ? "job:cancelled"
              : "job:failed";

        emitEvent({
          ...snapshot,
          type: eventType,
          automationType: snapshot.type,
          runId: snapshot.runId ?? runId,
          userId: snapshot.userId ?? userId,
        });
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  emitEvent({
    type: "job:started",
    jobId: job.id,
    label: job.label,
    automationType: job.type,
    runId,
    userId,
    startedAt: job.startedAt,
  });

  logger.info(`[${job.id}] Accepted run ${runId} (${type})`);
  res.json({ success: true, jobId: job.id, runId, label: job.label, job: serializeJob(job) });
});

app.post("/api/automations/jobs/:jobId/stop", (req, res) => {
  const stopped = requestStop(req.params.jobId);
  if (!stopped) {
    res.status(404).json({ success: false, error: "Job not found" });
    return;
  }
  res.json({ success: true, jobId: req.params.jobId });
});

// The Next process needs the outcome screenshot, which is deliberately excluded
// from serializeJob() to keep progress polls small. Fetched once, on demand.
app.get("/api/automations/jobs/:jobId/result", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ success: false, error: "Job not found" });
    return;
  }
  if (job.isRunning) {
    res.status(409).json({ success: false, error: "Job is still running" });
    return;
  }
  res.json({ success: true, jobId: job.id, status: job.status, result: job.result ?? null });
});

app.use((error, _req, res, _next) => {
  logger.error(`Unhandled error: ${error.stack || error.message}`);
  res.status(500).json({ success: false, error: error.message });
});

const server = app.listen(config.port, BIND_HOST, () => {
  logger.info("Automation server ready");
  logger.info(`  listening on http://${BIND_HOST}:${config.port}`);
  logger.info(`  headless=${config.headless} slowMo=${config.slowMo} maxConcurrent=${config.maxConcurrentJobs}`);
});

// Loopback only - never reachable off-box.
server.on("error", (error) => {
  logger.error(`Failed to start automation server: ${error.message}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(signal, () => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    // Don't let a lingering keep-alive socket hold the process open.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
