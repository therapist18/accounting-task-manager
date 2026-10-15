import { NextRequest, NextResponse } from "next/server";
import { getAppSessionFromRequest } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const RUN_COLUMNS =
  "id, automation_type, automation_id, task_id, task_label, job_id, status, progress, current_step, error, outcome_proof, created_at, completed_at";

/**
 * The persisted half of a run's progress.
 *
 * Live state (logs, fine-grained progress) lives in the automation service on the
 * user's machine and is read there by lib/automations/client. That client only
 * calls this once the job is terminal or the service no longer knows it, to fold
 * in the durable record - the outcome proof screenshot and the task/automation ids.
 */
export async function GET(request: NextRequest) {
  const session = await getAppSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId") || "";
  if (!jobId) {
    return NextResponse.json({ success: false, error: "jobId is required." }, { status: 400 });
  }

  const run = await findRun(createServerSupabaseClient(), String(session.user.id), jobId);
  if (!run) {
    return NextResponse.json({ success: false, error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, job: shapeJob(jobId, run), persisted: true });
}

/**
 * Finds the persisted run for a specific automation-server job id.
 *
 * Matching on job_id (not "most recent run for this user") matters: a user can
 * have several tasks open at once, and returning the newest row would show one
 * task's screenshot and status inside another task's tab.
 */
async function findRun(supabase: any, userId: string, jobId: string) {
  const { data } = await supabase
    .from("tm_automation_runs")
    .select(RUN_COLUMNS)
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/**
 * Normalises a persisted run row into the camelCase job shape the UI consumes.
 *
 * outcome_proof is already a data URL, so it is exposed as a single `evidence`
 * screenshot entry - the exact shape the tab's completion handler already fetches
 * from, which is why no client change was needed there.
 */
function shapeJob(jobId: string, run: Record<string, any>) {
  const evidence = run.outcome_proof
    ? [{ type: "screenshot", url: run.outcome_proof as string }]
    : [];

  return {
    jobId,
    runId: run.id,
    type: run.automation_type,
    automationId: run.automation_id,
    taskId: run.task_id,
    taskLabel: run.task_label,
    status: run.status,
    isRunning: run.status === "pending" || run.status === "running",
    progress: run.progress ?? 0,
    currentStep: run.current_step ?? "",
    message: run.error ?? "",
    error: run.error,
    evidence,
    startedAt: run.created_at,
    finishedAt: run.completed_at,
  };
}
