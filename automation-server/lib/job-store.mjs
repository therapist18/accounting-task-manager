import { logger } from "./logger.mjs";
import { getRunner, loadRunner } from "./runners.mjs";

// In-memory job registry. Replaces the old `automation_jobs` table + worker
// queue: the desktop app is the only consumer and there is exactly one process
// per install, so a Map is the whole story. Run *history* still lives in
// Postgres (tm_automation_runs, written by the Next server) - this Map only
// holds live state for runs in this process, and a restart legitimately drops
// them because the browser died with it.
const jobs = new Map();

// Bounded so a long-lived process (window closed to the tray for days) cannot
// accumulate unbounded log arrays.
const MAX_RETAINED_JOBS = 25;
const MAX_LOGS_PER_JOB = 500;

let runningCount = 0;

export function getRunningCount() {
  return runningCount;
}

export function createJobId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function prune() {
  if (jobs.size <= MAX_RETAINED_JOBS) return;
  const terminal = [...jobs.values()]
    .filter((job) => !job.isRunning)
    .sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));

  while (jobs.size > MAX_RETAINED_JOBS && terminal.length > 0) {
    jobs.delete(terminal.shift().id);
  }
}

function appendLog(job, level, message, step = null) {
  if (job.logs.length >= MAX_LOGS_PER_JOB) {
    // Keep the tail; the beginning of a 15-minute run is the least useful part
    // once a job is this large.
    job.logs.splice(0, job.logs.length - MAX_LOGS_PER_JOB + 1);
  }
  job.logs.push({ timestamp: new Date().toISOString(), level, step, message });
  job.updatedAt = new Date().toISOString();
}

export function getJob(jobId) {
  return jobs.get(jobId) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

// Public projection. `requestData` and `result.screenshot` are deliberately
// excluded - the first can contain portal credentials and the second is a
// multi-hundred-kilobyte base64 PNG that would bloat every progress poll.
export function serializeJob(job) {
  return {
    jobId: job.id,
    type: job.type,
    label: job.label,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    message: job.message,
    error: job.error,
    isRunning: job.isRunning,
    stopRequested: job.stopRequested,
    logs: job.logs,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    result: job.result
      ? { success: job.result.success, taskId: job.result.taskId ?? null }
      : null,
  };
}

/**
 * Starts an automation and returns its job record immediately. The work runs
 * detached - the HTTP response must not wait on a 15-minute browser session.
 *
 * @param {object} options
 * @param {string} options.type - Registry key, e.g. 'eta-kenya'
 * @param {object} options.requestData - Payload handed to the runner
 * @param {(result: object) => Promise<void>} [options.onComplete]
 * @param {(error: Error) => Promise<void>} [options.onFailure]
 * @param {() => Promise<void>} [options.onSettled] - Always runs last; used to
 *   release the desktop shell's power-save blocker and tray badge.
 * @param {(snapshot: object) => void} [options.onTerminal] - Fires exactly once
 *   when the run reaches a terminal state, whatever the outcome. This is what the
 *   desktop shell uses to raise a native notification, so it must not depend on
 *   database persistence having succeeded.
 */
export function startJob({ type, requestData, onComplete, onFailure, onSettled, onTerminal }) {
  const runnerConfig = getRunner(type);
  if (!runnerConfig) {
    throw new Error(`Unknown automation type: ${type}`);
  }

  const id = createJobId(type);
  const job = {
    id,
    type,
    label: runnerConfig.label,
    status: "running",
    isRunning: true,
    stopRequested: false,
    progress: 0,
    currentStep: "Starting",
    message: "Automation started",
    error: null,
    logs: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
  };

  jobs.set(id, job);
  runningCount += 1;
  logger.info(`[${id}] Started ${type} (${runnerConfig.label})`);

  // Fire and forget. Everything below is contained so a rejection can never
  // surface as an unhandled rejection that kills the process.
  void execute(job, runnerConfig, requestData, { onComplete, onFailure, onTerminal })
    .catch((error) => logger.error(`[${id}] Unhandled: ${error.stack || error.message}`))
    .finally(() => {
      onSettled?.().catch((error) =>
        logger.error(`[${id}] onSettled failed: ${error.message}`)
      );
    });

  return job;
}

/**
 * Closes the browser a runner is holding, by delegating to that runner's
 * exported stopJob(). Used both by a user-requested stop and by the watchdog
 * timeout - without the runner actually releasing the browser, a run wedged on
 * a portal selector would hold the process (and the power-save blocker) open
 * indefinitely.
 */
function closeBrowser(jobId, type) {
  return loadRunner(type)
    .then(({ mod }) => (typeof mod.stopJob === "function" ? mod.stopJob(jobId) : false))
    .then((stopped) => {
      if (stopped) logger.info(`[${jobId}] Browser closed on stop request`);
      return stopped;
    })
    .catch((error) => {
      logger.error(`[${jobId}] stopJob failed: ${error.message}`);
      return false;
    });
}

async function execute(job, runnerConfig, requestData, hooks) {
  const { id } = job;
  // Guards against a runner that neither resolves nor rejects. Setting
  // stopRequested alone is not enough: the runner may be blocked on a selector
  // and never reach its next checkpoint, so the browser is force-closed here.
  // That rejects the pending Playwright call, which unwinds execute() through
  // the catch block below and lands on 'failed'.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    logger.error(`[${id}] Timed out after ${runnerConfig.timeoutMs}ms - closing browser`);
    job.stopRequested = true;
    job.message = "Timed out, closing browser...";
    appendLog(job, "error", `Timed out after ${Math.round(runnerConfig.timeoutMs / 1000)}s`, "timeout");
    void closeBrowser(id, job.type);
  }, runnerConfig.timeoutMs);

  try {
    const { fn } = await loadRunner(job.type);

    const result = await fn(requestData, id, {
      onComplete: async (outcome) => {
        if (hooks.onComplete) await hooks.onComplete(outcome);
        job.progress = 100;
        job.currentStep = "Complete";
        job.message = "Automation finished";
      },
    });

    clearTimeout(timer);

    if (result?.cancelled) {
      job.status = "cancelled";
      job.message = "Stopped by user";
      job.error = null;
    } else if (result?.success) {
      job.status = "completed";
      job.result = result;
    } else {
      // A runner can report failure by returning {success: false} rather than by
      // throwing. That path has to persist too, otherwise the run row stays
      // "running" in the database and the onSettled callback then has to guess,
      // recording a genuine failure as "cancelled".
      job.status = "failed";
      job.error = result?.error || "Automation did not complete";
      appendLog(job, "error", job.error, "error");
      if (hooks.onFailure) {
        await hooks.onFailure(new Error(job.error)).catch((persistError) =>
          logger.error(`[${id}] onFailure persistence failed: ${persistError.message}`)
        );
      }
    }
  } catch (error) {
    clearTimeout(timer);
    // A forced browser close from the watchdog surfaces here as a Playwright
    // error; report the real cause instead of that incidental error.
    if (timedOut) {
      job.status = "failed";
      job.error = `Timed out after ${Math.round(runnerConfig.timeoutMs / 1000)}s`;
    } else {
      job.status = job.stopRequested ? "cancelled" : "failed";
      job.error = job.stopRequested ? "Stopped by user" : error.message;
    }
    logger.error(`[${id}] Failed: ${error.stack || error.message}`);
    appendLog(job, "error", job.error, "error");

    if (!job.stopRequested && hooks.onFailure) {
      await hooks.onFailure(error).catch((persistError) =>
        logger.error(`[${id}] onFailure persistence failed: ${persistError.message}`)
      );
    }
  } finally {
    clearTimeout(timer);
    job.isRunning = false;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    runningCount = Math.max(0, runningCount - 1);
    appendLog(job, job.status === "completed" ? "info" : "error", `Run ${job.status}`, job.status);
    logger.info(`[${id}] ${job.status}${job.error ? `: ${job.error}` : ""}`);

    // Emitted before prune() so the snapshot is guaranteed to describe this job.
    // Synchronous and exception-proof: a notification failure must not change
    // the run's outcome or escape into the unhandled-rejection path.
    try {
      hooks.onTerminal?.({
        jobId: job.id,
        type: job.type,
        label: job.label,
        status: job.status,
        error: job.error,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        runId: requestData?.__runId ?? null,
        userId: requestData?.__userId ?? null,
      });
    } catch (emitError) {
      logger.error(`[${id}] onTerminal threw: ${emitError.message}`);
    }

    prune();
  }
}

export function requestStop(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (!job.isRunning) return true;

  job.stopRequested = true;
  job.message = "Stopping...";
  appendLog(job, "warn", "Stop requested by user", "stop");

  void closeBrowser(jobId, job.type);
  return true;
}
