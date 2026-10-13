import { NextRequest, NextResponse } from "next/server"
import { getServerAppSession } from "@/lib/auth/session"
import { createServerSupabaseClient } from "@/lib/supabase"
import type { ItemKind } from "@/lib/immigrationNotifications"
import {
  fileEfnsItem,
  itemApplicant,
  itemPermitGroupAndStatus,
  linkStagesForTask,
  suggestEfnsTasks,
} from "@/lib/efnsFiling.server"
import { itemJobLevels } from "@/lib/efnsFiling"

// /api/immigration-notifications/file
//
//   GET ?kind=notification&id=123            → candidate tasks for the item's manual link dialog,
//                                              only in the job levels of the item's permit type
//       &scope=all                           → search every task instead
//       &taskId=5                            → the stages a picked task can take a filing on, plus the
//                                               one the stages' EFNS rules pick for the item (suggested)
//       &q=...                               → narrow the candidate search
//
//   POST { kind, id, taskId, stageId, kycId, mode? }
//       files the item's PDF onto the task's stage against the task's individual (matched_by:
//       'manual', linked_by: 'staff'), and records the link back on the item. On a stage that already
//       has a document, mode "replace" (default) takes that type's document off the stage and "add"
//       keeps it alongside.

export async function GET(req: NextRequest) {
  const session = await getServerAppSession()
  if (!session) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })

  const sb = createServerSupabaseClient()
  const sp = req.nextUrl.searchParams
  const kind = sp.get("kind") as ItemKind | null
  const id = Number(sp.get("id") || "0")
  const taskId = sp.get("taskId")
  const query = sp.get("q")
  const scope = sp.get("scope") === "all" ? "all" : "job_level"

  try {
    if (taskId) {
      const link = await linkStagesForTask(taskId, kind && id ? { kind, id } : null)
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

    // Who the item is about (a dependant, or someone applying under a company) and its permit type,
    // which decides the job levels searched.
    const who = itemApplicant(kind, row)
    const { permitGroup, status, category } = itemPermitGroupAndStatus(kind, row)
    const levels = itemJobLevels(permitGroup, category)
    const suggestions = await suggestEfnsTasks({
      fileNumber: row.file_number ?? null,
      // A typed search replaces the applicant; the file number still applies.
      applicant: query?.trim() || who.applicant || null,
      company: who.company,
      principal: who.principal,
      permitGroup,
      category,
      scope,
    })

    return NextResponse.json({
      success: true,
      item: { kind, id, name: who.applicant, relationship: who.relationship, principal: who.principal, company: who.company, permitGroup, status },
      // What was searched, so the dialog can say so and offer "search all tasks".
      scope: {
        mode: scope,
        permitGroup,
        subdepartmentIds: scope === "all" || !levels ? null : [...new Set(levels.map((l) => l.subdepartmentId))],
        classIds: scope === "all" || !levels?.every((l) => l.classId) ? null : levels.map((l) => l.classId),
      },
      suggestions,
    })
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
      mode?: "replace" | "add"
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
      mode: body.mode === "add" ? "add" : "replace",
      matchedBy: "manual",
      byId: session.user.id,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[api/immigration-notifications/file] POST", e)
    return NextResponse.json({ success: false, error: e?.message || "Filing failed" }, { status: 502 })
  }
}