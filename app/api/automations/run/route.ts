import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePermission } from "@/lib/auth/access-controls";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { getAppSessionFromRequest } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * True when a PostgREST error means the table itself is absent, as opposed to a
 * column or constraint problem. PostgREST caches the schema, so a table that was
 * just created can also report missing until the cache reloads.
 */
function isMissingTable(message?: string) {
  if (!message) return false;
  return /could not find the table|does not exist.*relation|schema cache/i.test(message);
}

/**
 * Prepares an automation run.
 *
 * The browser work happens in the automation service on the user's own machine,
 * which this route (on Vercel) cannot reach. So it only creates the run record
 * and mints a per-run capability token; the page then hands both to the local
 * service (lib/automations/client). The service uses the token to report the
 * terminal result back via /api/automations/complete, which is what lets a
 * completion land after the user has closed the window.
 *
 * Returning the token to the browser is fine: it belongs to the signed-in user's
 * own run and can only ever finalise that one row. The service-role key never
 * leaves this server.
 */
export async function POST(request: NextRequest) {
  const session = await getAppSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  // Starting an automation submits a real application on a government portal and
  // spends real money on the payment step, so it is gated separately from merely
  // being able to view the automations page. Checked here rather than only in
  // the UI because the client is not a trust boundary.
  try {
    await ensurePermission(session.user, "automations.run");
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { success: false, error: "You do not have permission to run automations." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const {
    type,
    taskId = null,
    automationId = null,
    taskLabel = null,
  } = body as {
    type?: string;
    taskId?: string | number | null;
    automationId?: string | number | null;
    taskLabel?: string | null;
  };

  if (!type) {
    return NextResponse.json({ success: false, error: "type is required." }, { status: 400 });
  }

  // A stale run means the previous app session died mid-flight. The desktop
  // shell sweeps these on launch, but a crash can also happen while it is
  // running, so clear any leftovers for this task before starting a new one.
  const supabase = createServerSupabaseClient();
  const userId = String(session.user.id);

  const staleQuery = supabase
    .from("tm_automation_runs")
    .update({
      status: "interrupted",
      error: "Superseded by a newer run.",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("status", ["pending", "running"]);

  // PostgREST needs .is() for NULL comparisons; .eq(col, null) silently matches
  // nothing, which would leave genuinely stale runs in place.
  const { error: staleError } =
    taskId == null
      ? await staleQuery.is("task_id", null)
      : await staleQuery.eq("task_id", String(taskId));

  if (staleError) {
    return NextResponse.json(
      { success: false, error: `Could not clear the previous run: ${staleError.message}` },
      { status: 500 }
    );
  }

  const secret = randomBytes(24).toString("hex");
  const now = new Date().toISOString();

  const { data: run, error: insertError } = await supabase
    .from("tm_automation_runs")
    .insert({
      user_id: userId,
      ran_by_email: session.user.email || null,
      automation_type: type,
      automation_id: automationId == null ? null : String(automationId),
      task_id: taskId == null ? null : String(taskId),
      task_label: taskLabel,
      status: "running",
      progress: 0,
      current_step: "Starting",
      // Never persisted. The previous flow inserted the assembled payload -
      // including the immigration portal password - into automation_jobs.data,
      // leaving portal credentials in plaintext in the database.
      completion_secret: secret,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertError || !run) {
    // The most likely failure by far is that the migration has not been applied
    // yet. PostgREST's message for a missing table is recognisable, so surface
    // the actual remedy instead of leaking "schema cache" at the user.
    if (isMissingTable(insertError?.message)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Automation history is not set up on this database yet. Apply supabase/tm_automation_runs.sql, then try again.",
          code: "AUTOMATIONS_SCHEMA_MISSING",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: `Could not create the run record: ${insertError?.message}` },
      { status: 500 }
    );
  }

  // The automation service reports the terminal result back to *this* server,
  // since this is the process holding the service-role key. The origin comes
  // from the incoming request: the Vercel domain in production, localhost in dev.
  return NextResponse.json({
    success: true,
    runId: run.id,
    userId,
    completionSecret: secret,
    persistUrl: new URL(request.url).origin,
  });
}

/**
 * Second half of a start: records the local service's job id (so a page refresh
 * mid-run can resume live progress polling), or - when the service refused the
 * run - marks the placeholder row failed instead of leaving it "running" forever.
 */
export async function PATCH(request: NextRequest) {
  const session = await getAppSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { runId, jobId, error } = (body || {}) as { runId?: string; jobId?: string; error?: string };
  if (!runId || (!jobId && !error)) {
    return NextResponse.json(
      { success: false, error: "runId and either jobId or error are required." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const update = jobId
    ? { job_id: String(jobId), updated_at: now }
    : { status: "failed", error: String(error), completed_at: now, updated_at: now, completion_secret: null };

  // Scoped to the caller's own still-active run, so this can't touch anyone
  // else's history or reopen a settled run.
  const { error: updateError } = await createServerSupabaseClient()
    .from("tm_automation_runs")
    .update(update)
    .eq("id", runId)
    .eq("user_id", String(session.user.id))
    .in("status", ["pending", "running"]);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
