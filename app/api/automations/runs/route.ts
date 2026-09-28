import { NextRequest, NextResponse } from "next/server";
import { getAppSessionFromRequest } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Durable run history.
 *
 * Live progress comes from the automation server's memory, which is lost on
 * restart by design. This is the record that survives, so the automations page
 * can still show "last run" and any run that was interrupted.
 */
export async function GET(request: NextRequest) {
  const session = await getAppSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const limit = Math.min(Number(searchParams.get("limit")) || 25, 100);

  let query = createServerSupabaseClient()
    .from("tm_automation_runs")
    .select("*")
    .eq("user_id", String(session.user.id))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (taskId) query = query.eq("task_id", taskId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // completion_secret is a live capability token for rows that have not settled
  // yet; it must never leave the server.
  const runs = ((data || []) as Record<string, unknown>[]).map((row) => {
    const { completion_secret: _secret, ...rest } = row;
    return rest;
  });

  return NextResponse.json({ success: true, runs });
}
