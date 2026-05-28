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
  return { isAdmin, userId: session.user.id as string };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAppSession(req);
    const { isAdmin, userId } = getAccess(session);

    const { id } = params;
    const body = await req.json();
    const supabase = createServerSupabaseClient();

    if (!isAdmin) {
      const { data: existing } = await supabase
        .from("tm_task_diary")
        .select("created_by_user_id, assigned_to_user_ids, collaborator_ids")
        .eq("id", id)
        .single();

      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const canEdit =
        existing.created_by_user_id === userId ||
        (existing.assigned_to_user_ids ?? []).includes(userId) ||
        (existing.collaborator_ids ?? []).includes(userId);

      if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === "done") patch.completed_at = new Date().toISOString();
    }
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.type !== undefined) patch.type = body.type;
    if (body.assignedToUserIds !== undefined) patch.assigned_to_user_ids = body.assignedToUserIds;
    if (body.collaboratorIds !== undefined) patch.collaborator_ids = body.collaboratorIds;
    if (body.startDate !== undefined) patch.start_date = body.startDate;
    if (body.dueDate !== undefined) patch.due_date = body.dueDate;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;

    const { data, error } = await supabase
      .from("tm_task_diary")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ task: rowToTask(data) });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("PATCH /api/bcl-diary/tasks/[id]:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAppSession(req);
    const { isAdmin, userId } = getAccess(session);

    const { id } = params;
    const supabase = createServerSupabaseClient();

    if (!isAdmin) {
      const { data: existing } = await supabase
        .from("tm_task_diary")
        .select("created_by_user_id, assigned_to_user_ids")
        .eq("id", id)
        .single();

      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const canDelete =
        existing.created_by_user_id === userId ||
        (existing.assigned_to_user_ids ?? []).includes(userId);

      if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("tm_task_diary").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("DELETE /api/bcl-diary/tasks/[id]:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
