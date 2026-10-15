import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Called by the automation server once a run has fully settled, whatever the
 * outcome - including a stop, which never reaches /complete.
 *
 * Clears the completion token so a settled run cannot be written to again, and
 * backfills a terminal status for cancelled runs (which report no error because
 * the user asked for them).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  // `interrupted` is sent by the desktop shell on its next launch for runs a
  // crashed or force-closed session left behind (it kept their tokens for that).
  const { runId, secret, interrupted } = body as { runId?: string; secret?: string; interrupted?: boolean };
  if (!runId || !secret) {
    return NextResponse.json({ success: false, error: "runId and secret are required." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();

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

  const isActive = run.status === "running" || run.status === "pending";

  // /complete retires the token as soon as a run finalises, so by the time this
  // fires a completed or failed run legitimately presents a stale secret. That is
  // harmless - the only work left is clearing a secret that is already null - so
  // an already-settled run is accepted idempotently.
  //
  // An *active* run still requires a matching secret, otherwise a caller that
  // merely guessed a runId could cancel somebody else's in-flight run.
  if (run.completion_secret !== secret) {
    if (!isActive) {
      return NextResponse.json({ success: true, alreadySettled: true });
    }
    return NextResponse.json({ success: false, error: "Invalid completion token." }, { status: 403 });
  }

  if (isActive) {
    // Reached here without a /complete call, which means the run was stopped or
    // the process died between finishing and reporting.
    const { error: updateError } = await supabase
      .from("tm_automation_runs")
      .update({
        ...(interrupted
          ? {
              status: "interrupted",
              current_step: "Interrupted",
              error: "Application closed before the automation finished.",
            }
          : {
              status: "cancelled",
              current_step: "Stopped",
              error: "Stopped before the automation reported a result.",
            }),
        completed_at: now,
        updated_at: now,
        completion_secret: null,
      })
      .eq("id", runId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Retire the token either way.
  await supabase
    .from("tm_automation_runs")
    .update({ completion_secret: null, updated_at: now })
    .eq("id", runId);

  return NextResponse.json({ success: true });
}
