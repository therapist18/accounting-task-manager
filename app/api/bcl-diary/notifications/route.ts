import { NextRequest, NextResponse } from "next/server";
import { requireAppSession } from "@/lib/auth/session";
import { toAuthErrorResponse } from "@/lib/auth/errors";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    const userId = session.user.id;
    const isAdmin = session.user.isSuperAdmin ||
      (session.user.permissions ?? []).includes("bcl_task_diary.admin.view");

    const supabase = createServerSupabaseClient();
    const notifications: {
      id: string;
      title: string;
      message: string;
      type: "info" | "warning" | "success" | "error";
      isRead: boolean;
      relatedTaskId?: string;
      createdAt: string;
    }[] = [];

    // 1. Due reminders (remind_at <= now, not yet delivered)
    const { data: reminders } = await supabase
      .from("tm_reminders")
      .select("id, task_id, remind_at, tm_task_diary(title, created_by_user_id, assigned_to_user_ids)")
      .is("delivered_at", null)
      .lte("remind_at", new Date().toISOString())
      .order("remind_at", { ascending: false })
      .limit(30);

    for (const r of reminders ?? []) {
      const task = r.tm_task_diary as any;
      if (!task) continue;

      const involved =
        isAdmin ||
        task.created_by_user_id === userId ||
        (task.assigned_to_user_ids ?? []).includes(userId);

      if (involved) {
        notifications.push({
          id: `reminder-${r.id}`,
          title: "Task Reminder",
          message: `Reminder: ${task.title}`,
          type: "warning",
          isRead: false,
          relatedTaskId: r.task_id,
          createdAt: r.remind_at,
        });
      }
    }

    // 2. Tasks assigned to this user in the last 48 hours (not created by them)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: newTasks } = await supabase
      .from("tm_task_diary")
      .select("id, title, created_at, status")
      .gte("created_at", cutoff)
      .neq("created_by_user_id", userId)
      .or(`assigned_to_user_ids.cs.["${userId}"]`)
      .order("created_at", { ascending: false })
      .limit(10);

    for (const t of newTasks ?? []) {
      notifications.push({
        id: `assign-${t.id}`,
        title: "New Task Assigned",
        message: t.title,
        type: "info",
        isRead: false,
        relatedTaskId: t.id,
        createdAt: t.created_at,
      });
    }

    // 3. Overdue tasks for admins
    if (isAdmin) {
      const { data: overdue } = await supabase
        .from("tm_task_diary")
        .select("id, title, due_date")
        .lt("due_date", new Date().toISOString().split("T")[0])
        .not("status", "in", '("done","cancelled")')
        .order("due_date", { ascending: true })
        .limit(5);

      for (const t of overdue ?? []) {
        notifications.push({
          id: `overdue-${t.id}`,
          title: "Task Overdue",
          message: `${t.title} — due ${t.due_date}`,
          type: "error",
          isRead: false,
          relatedTaskId: t.id,
          createdAt: t.due_date,
        });
      }
    }

    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ notifications });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ notifications: [] });
  }
}
