import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensurePermission } from "@/lib/auth/access-controls";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { getAppSessionFromRequest } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { forward } from "../_lib/proxy";

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
 * Starts an automation run.
 *
 * The browser work happens in the local automation server, but this route is
 * the only writer to tm_automation_runs and the only holder of the Supabase
 * service-role key. It mints a per-run capability token and hands it to the
 * automation server, which uses it to report the terminal result back via
 * /api/automations/complete. That is what lets a completion notification fire
 * after the user has closed the window.
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
    formData,
  } = body as {
    type?: string;
    taskId?: string | number | null;
    automationId?: string | number | null;
    taskLabel?: string | null;
    formData?: Record<string, unknown>;
  };

  if (!type) {
    return NextResponse.json({ success: false, error: "type is required." }, { status: 400 });
  }
  if (!formData || typeof formData !== "object") {
    return NextResponse.json({ success: false, error: "formData is required." }, { status: 400 });
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

  // The automation server has to report the terminal result back to *this* Next
  // server, since this is the process holding the service-role key. Pointing it
  // at the automation server's own address (getAutomationsApi) would make it call
  // /api/automations/complete on itself, where no such route exists.
  //
  // The Next origin is taken from the incoming request, which in the desktop app
  // is the loopback address the shell started the server on.
  const nextOrigin = new URL(request.url).origin;

  const started = await forward("/api/automations/run", {
    method: "POST",
    body: JSON.stringify({
      type,
      runId: run.id,
      userId,
      formData,
      persistUrl: nextOrigin,
      persistSecret: secret,
    }),
  });

  const result = await started.json().catch(() => ({}));

  if (!started.ok || !result?.success) {
    // The run never started, so roll the placeholder row back rather than
    // leaving a permanently "running" record behind.
    await supabase
      .from("tm_automation_runs")
      .update({
        status: "failed",
        error: result?.error || "The automation service rejected the run.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return NextResponse.json(
      { success: false, error: result?.error || "Could not start the automation." },
      { status: started.status }
    );
  }

  // Record the automation server's job id so a page refresh mid-run can resume
  // live progress polling. Without it a refresh looks like the run never started.
  await supabase
    .from("tm_automation_runs")
    .update({ job_id: result.jobId, updated_at: new Date().toISOString() })
    .eq("id", run.id);

  return NextResponse.json({
    success: true,
    runId: run.id,
    jobId: result.jobId,
    label: result.label,
  });
}
