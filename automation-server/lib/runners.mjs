// Runner registry.
//
// Each entry names a module and the exported function to call, plus the label
// used in notifications and the UI. The signature is
//   (requestData, jobId, hooks) => Promise<result>
// where hooks carries persistence callbacks supplied by the caller.
//
// Only eTA Kenya is wired up so far; the remaining imm-automations runners port
// over as additional entries here.

export const RUNNERS = {
  "eta-kenya": {
    module: "./runners/eta-kenya.mjs",
    export: "runEtaKenyaAutomation",
    label: "eTA Kenya",
    // Long: the eTA application is a ~13-step form with 7 document uploads and
    // a payment redirect at the end.
    timeoutMs: 15 * 60 * 1000,
  },
};

export function getRunner(type) {
  return RUNNERS[type] || null;
}

export function getSupportedTypes() {
  return Object.entries(RUNNERS).map(([type, runner]) => ({
    type,
    label: runner.label,
    timeoutMs: runner.timeoutMs,
  }));
}

export async function loadRunner(type) {
  const runner = getRunner(type);
  if (!runner) throw new Error(`Unknown automation type: ${type}`);

  // Resolve relative to this file rather than cwd: cwd is the repo root in dev
  // but the resources directory in a packaged build.
  const moduleUrl = new URL(`../${runner.module}`, import.meta.url).href;
  const mod = await import(moduleUrl);

  const fn = mod[runner.export];
  if (typeof fn !== "function") {
    throw new Error(`${runner.module} does not export ${runner.export}()`);
  }
  // `mod` is returned as well so callers can reach sibling exports such as a
  // runner's own stopJob().
  return { fn, runner, mod };
}
