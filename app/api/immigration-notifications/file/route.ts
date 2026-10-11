import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import { createServerSupabaseClient } from "@/lib/supabase"
import type { ItemKind } from "@/lib/immigrationNotifications"
import {
  fileEfnsItem,
  linkStagesForTask,
  suggestEfnsTasks,
} from "@/lib/efnsFiling.server"

// /api/immigration-notifications/file
//
//   GET ?kind=notification&id=123            → candidate tasks for the item's manual link dialog
//       &taskId=5                            → the stages a picked task can take a filing on
//       &q=...                               → narrow the candidate search
//
//   POST { kind, id, taskId, stageId, kycId }
//       files the item's PDF onto the task's stage against the task's individual (matched_by:
//       'manual'), and records the link back on the item.

export async function GET(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })

  const sb = createServerSupabaseClient()
  const sp = req.nextUrl.searchParams
  const kind = sp.get("kind") as ItemKind | null
  const id = Number(sp.get("id") || "0")
  const taskId = sp.get("taskId")
  const query = sp.get("q")

  try {
    if (taskId) {
      const link = await linkStagesForTask(taskId)
      return NextResponse.json({ success: true, ...link })
    }

    if (!kind || !id) {
      return NextResponse.json({ success: false, error: "kind and id are required" }, { status: 400 })
    }

    const table = kind === "notification" ? "immigration_notifications" : "immigration_payments"
    // Select everything: the two tables don't share a column set (e.g. applicant_name /
    // payment_instructions_file_name are payments-only), so naming columns here 404s the other.
    const { data: row, error } = await sb.from(table).select("*").eq("id", id).maybeSingle()
    if (error) {
      console.error("[api/immigration-notifications/file] item fetch", error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ success: false, error: `Item ${kind} ${id} not found` }, { status: 404 })
    }

    const applicantName = (row.printable_applicant || row.name || row.applicant_name || "").trim()
    const suggestions = await suggestEfnsTasks({
      fileNumber: row.file_number ?? null,
      applicant: applicantName || null,
      company: row.printable_company ?? null,
      query,
    })

    return NextResponse.json({ success: true, item: { kind, id, name: applicantName }, suggestions })
  } catch (e: any) {
    console.error("[api/immigration-notifications/file] GET", e)
    return NextResponse.json({ success: false, error: e?.message || "Failed to load filing options" }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      kind?: ItemKind
      id?: number
      taskId?: number | string
      stageId?: string
      kycId?: string
    }

    if (!body.kind || !body.id || !body.taskId || !body.stageId) {
      return NextResponse.json(
        { success: false, error: "kind, id, taskId and stageId are required" },
        { status: 400 },
      )
    }

    const result = await fileEfnsItem({
      kind: body.kind,
      id: body.id,
      taskId: body.taskId,
      stageId: body.stageId,
      kycId: body.kycId,
      matchedBy: "manual",
      byId: session.user.id,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[api/immigration-notifications/file] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Filing failed" }, { status: 502 })
  }
}