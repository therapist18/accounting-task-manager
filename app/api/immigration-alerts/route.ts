import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import { fetchImmigrationAlertsFromRegistry } from "@/lib/immigrationAlerts.server"

// GET /api/immigration-alerts[?fresh=1] — everyone in the Imm Status Manager's Grace / Expired tabs,
// fetched from bcl-registry. Any signed-in user may read it; the registry key stays on the server.
export async function GET(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1"
    const result = await fetchImmigrationAlertsFromRegistry({ fresh })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("[api/immigration-alerts]", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to load immigration alerts" }, { status: 502 })
  }
}
