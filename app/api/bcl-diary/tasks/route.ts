import { NextRequest, NextResponse } from "next/server";
import { requireAppSession } from "@/lib/auth/session";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { createServerSupabaseClient } from "@/lib/supabase";

function rowToTask(row: any) {
  const assignedToUserIds: string[] = Array.isArray(row.assigned_to_user_ids)
    ? row.assigned_to_user_ids
    : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    type: row.type,
    createdByUserId: row.created_by_user_id,
    assignedToUserIds,
    assignedToUserId: assignedToUserIds[0] ?? null,
    collaboratorIds: row.collaborator_ids ?? [],
    startDate: row.start_date,
    dueDate: row.due_date,
    tags: row.tags ?? [],
    reminderIds: [],
    recurringTemplateId: row.recurring_template_id ?? null,
    notes: row.notes ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // kept for UI compat (not stored in DB)
    departmentId: "",
    subdepartmentId: null,
    classId: null,
    jobLevel: {},
    officerId: null,
    managerId: null,
    assistantId: null,
  };
}

function getAccess(session: any) {
  const permissions: string[] = session.user.permissions ?? [];
  const isSuperAdmin: boolean = session.user.isSuperAdmin ?? false;
  const isAdmin =
    isSuperAdmin || permissions.includes("bcl_task_diary.admin.view");
  return { isAdmin };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    const { isAdmin } = getAccess(session);

    const userId: string = session.user.id;
    const supabase = createServerSupabaseClient();

    let query = supabase
      .from("tm_task_diary")
      .select("*")
      .order("due_date", { ascending: true });

    if (!isAdmin) {
      query = query.or(
        [
          `created_by_user_id.eq.${userId}`,
          `assigned_to_user_ids.cs.["${userId}"]`,
          `collaborator_ids.cs.{${userId}}`,
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ tasks: (data ?? []).map(rowToTask) });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/bcl-diary/tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    const { isAdmin } = getAccess(session);

    const userId: string = session.user.id;
    const body = await req.json();

    const assignedToUserIds: string[] = isAdmin
      ? (body.assignedToUserIds ?? [])
      : [userId];

    if (assignedToUserIds.length === 0) {
      return NextResponse.json(
        { error: "At least one assignee is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("tm_task_diary")
      .insert({
        title: body.title,
        description: body.description ?? "",
        status: body.status ?? "todo",
        priority: body.priority ?? "medium",
        type: body.type ?? "personal",
        created_by_user_id: userId,
        assigned_to_user_ids: assignedToUserIds,
        collaborator_ids: body.collaboratorIds ?? [],
        start_date: body.startDate,
        due_date: body.dueDate,
        tags: body.tags ?? [],
        notes: body.notes ?? null,
        recurring_template_id: body.recurringTemplateId ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ task: rowToTask(data) }, { status: 201 });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/bcl-diary/tasks:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
