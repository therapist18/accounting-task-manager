import { NextRequest, NextResponse } from "next/server";
import { getAppSessionFromRequest } from "@/lib/auth/session";
import { forward } from "../_lib/proxy";

export const dynamic = "force-dynamic";

/** Asks the automation server to stop a live run and close its browser. */
export async function POST(request: NextRequest) {
  const session = await getAppSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const jobId = (body as { jobId?: string } | null)?.jobId;
  if (!jobId) {
    return NextResponse.json({ success: false, error: "jobId is required." }, { status: 400 });
  }

  return forward(`/api/automations/jobs/${encodeURIComponent(jobId)}/stop`, { method: "POST" });
}
