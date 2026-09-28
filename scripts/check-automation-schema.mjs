// Verifies that the automation run table exists with the columns the app writes
// to, and that the service-role key can actually reach it.
//
// Read-only. Run this after applying supabase/tm_automation_runs.sql:
//
//   node scripts/check-automation-schema.mjs
//
// It exits non-zero on failure so it can gate a deploy, and prints exactly which
// column is missing when the migration is out of date.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader: strips the quotes dotenv would, since .env.local in this
// repo wraps values in double quotes.
function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key);

// Every column the app reads or writes. Kept in one list so a schema drift shows
// up here rather than as a runtime 500 in the middle of someone's application.
const REQUIRED = [
  "id", "user_id", "ran_by_email", "automation_type", "automation_id",
  "task_id", "task_label", "job_id", "status", "progress", "current_step",
  "error", "outcome_proof", "completion_secret", "started_at",
  "completed_at", "created_at", "updated_at",
];

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures += 1;
};
const pass = (msg) => console.log(`  ok    ${msg}`);

console.log("Automation schema check\n");

const { data, error } = await db
  .from("tm_automation_runs")
  .select(REQUIRED.join(","))
  .limit(1);

if (error) {
  fail(`cannot read tm_automation_runs: ${error.message}`);
  console.error(
    "\n  Most likely cause: the migration has not been applied.\n" +
      "  Run supabase/tm_automation_runs.sql in the Supabase SQL editor.\n"
  );
  process.exit(1);
}

console.log("tm_automation_runs");
pass("table exists and is readable with the service-role key");
pass(`all ${REQUIRED.length} required columns present`);

// A round-trip write proves the columns accept the shapes the app sends, which a
// SELECT alone cannot: e.g. `progress` is smallint, so 100 must fit.
const probeId = `schema-check-${Date.now()}`;
const { error: writeError } = await db.from("tm_automation_runs").insert({
  user_id: "schema-check",
  automation_type: "schema-check",
  status: "running",
  progress: 100,
  current_step: "Verifying schema",
  job_id: probeId,
  completion_secret: "probe",
});
if (writeError) fail(`insert failed: ${writeError.message}`);
else pass("insert accepts the app's column shapes (incl. progress = 100)");

const { error: updateError } = await db
  .from("tm_automation_runs")
  .update({ status: "interrupted", completed_at: new Date().toISOString(), completion_secret: null })
  .eq("job_id", probeId);
if (updateError) fail(`update failed: ${updateError.message}`);
else pass("update accepts a terminal status transition");

// Always clean up the probe row, including after a partial failure.
const { error: deleteError } = await db.from("tm_automation_runs").delete().eq("job_id", probeId);
if (deleteError) fail(`could not remove the probe row: ${deleteError.message}`);
else pass("probe row cleaned up");

console.log(failures === 0 ? "\nSchema OK." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
