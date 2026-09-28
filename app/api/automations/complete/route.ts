import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Turns a runner screenshot into a storable data URL, or null if there is
 * nothing worth storing. Accepts either raw base64 or an already-prefixed data
 * URL so the two halves cannot disagree about who owns the prefix.
 */
function toOutcomeProof(screenshot?: string | null) {
  if (!screenshot) return null;
  const value = screenshot.trim();
  if (!value) return null;
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

/**
 * Terminal result callback, called by the local automation server.
 *
 * Authenticated by the per-run `completion_secret` minted in /api/automations/run
 * rather than by a session cookie - the caller is a separate process, and the
 * user may have closed the window. The secret is compared against the run row it
 * claims, so a leaked token can only ever finalise that one run.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  // taskId is accepted and ignored: the automation server sends it, but this
  // route no longer writes to the task (see the note at the end of the function).
  const { runId, secret, status, screenshot, error } = body as {
    runId?: string;
    secret?: string;
    status?: "completed" | "failed";
    screenshot?: string;
    error?: string;
  };

  if (!runId || !secret) {
    return NextResponse.json({ success: false, error: "runId and secret are required." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: run, error: lookupError } = await supabase
    .from("tm_automation_runs")
    .select("id, completion_secret, status")
    .eq("id", runId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ success: false, error: lookupError.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ success: false, error: "Run not found." }, { status: 404 });
  }
  if (run.completion_secret !== secret) {
    return NextResponse.json({ success: false, error: "Invalid completion token." }, { status: 403 });
  }
  if (run.status !== "running" && run.status !== "pending") {
    // Already finalised - a duplicate callback is not an error.
    return NextResponse.json({ success: true, alreadyFinalised: true });
  }

  const now = new Date().toISOString();
  const succeeded = status === "completed";

  // The runner sends raw base64 (page.screenshot({ encoding: "base64" })), so the
  // data URL prefix belongs to us. Normalise rather than blindly concatenate: if
  // the runner ever switches to sending a full data URL, a plain prefix would
  // yield "data:image/png;base64,data:image/png;base64,..." - a stored value that
  // looks fine in the database and renders as a broken image forever after.
  const outcomeProof = toOutcomeProof(succeeded ? screenshot : null);

  const { error: updateError } = await supabase
    .from("tm_automation_runs")
    .update({
      status: succeeded ? "completed" : "failed",
      progress: succeeded ? 100 : null,
      current_step: succeeded ? "Complete" : "Failed",
      error: succeeded ? null : error || "Automation failed.",
      outcome_proof: outcomeProof,
      completed_at: now,
      updated_at: now,
      // Retire the capability token the moment the run reaches its final state
      // rather than waiting for the separate /settled call - a finalised run
      // should not remain writable via a token that is still on record.
      completion_secret: null,
    })
    .eq("id", runId);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  // Note: this route deliberately does NOT set tm_tasks.status.
  //
  // It originally did, writing "Completed". That was wrong on two counts: the
  // task table's status vocabulary is lowercase snake_case (`write_up_completed`,
  // `endorsed`, `cancel`, `in_progress`) and has no "Completed" member, so the
  // write either failed the column's constraint or left a status the UI has no
  // badge for. More importantly a successful eTA filing is one step inside a
  // task's workflow, not the end of the task - promoting the whole task is a
  // business decision, not an automation side effect. The run row is the record
  // of what the automation did; the client already attaches the proof screenshot
  // to the task as a document.
  return NextResponse.json({ success: true });
}
