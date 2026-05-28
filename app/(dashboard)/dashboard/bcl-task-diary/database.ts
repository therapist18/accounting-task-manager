// @ts-nocheck
import supabase from "@/lib/supabase/client"
import {
  userService,
  getSubdepartmentUsers,
  type DisplayUser,
  type FilteredUserData,
  type RoleAssignment,
} from "@/lib/shared-user-assignment-service"
import { fetchDepartments } from "../departments/departments/database"
import type {
  BTask,
  BRecurringTemplate,
  BReminder,
  BUser,
  BDepartment,
} from "./types"

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-rose-500",
  "bg-amber-500", "bg-teal-500", "bg-indigo-500", "bg-pink-500",
]

function initials(name: string): string {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
}

function avatarColor(userId: string): string {
  return AVATAR_COLORS[userId.charCodeAt(0) % AVATAR_COLORS.length]
}

function displayUserToBUser(user: DisplayUser): BUser {
  const name = user.displayName || `${user.firstName} ${user.lastName}`.trim()
  return {
    id: user.id,
    name,
    email: user.email ?? "",
    role: user.role === "general" ? "officer" : (user.role as BUser["role"]),
    avatarInitials: initials(name),
    avatarColor: avatarColor(user.id),
    assignments: (user.assignments ?? []).map((a: RoleAssignment) => ({
      id: a.id,
      role: a.role as any,
      level: a.class_id ? 3 : a.subdepartment_id ? 2 : 1,
      departmentId: a.department_id != null ? String(a.department_id) : "",
      subdepartmentId: a.subdepartment_id != null ? String(a.subdepartment_id) : null,
      classId: a.class_id != null ? String(a.class_id) : null,
    })),
    isActive: user.isActive ?? true,
  }
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function fetchDiaryDepartments(): Promise<BDepartment[]> {
  const depts = await fetchDepartments()
  return depts.map(dept => ({
    id: String(dept.id),
    name: dept.name,
    color: "blue",
    bgColor: "blue",
    subdepartments: (dept.tm_subdepartments || []).map(sub => ({
      id: String(sub.id),
      name: sub.name,
      departmentId: String(dept.id),
      classes: (sub.classes || []).map((cls: any) => ({
        id: String(cls.id),
        name: cls.name,
        subdepartmentId: String(sub.id),
      })),
    })),
  }))
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function fetchDiaryUsers(): Promise<{
  allUsers: BUser[]
  officers: BUser[]
  managers: BUser[]
  assistants: BUser[]
  raw: FilteredUserData
}> {
  // Fetch raw departments to enrich user job-level labels in the service
  const rawDepts = await fetchDepartments()
  const data: FilteredUserData = await userService.getAllUserData({ payrollAccess: true }, rawDepts)

  return {
    allUsers: (data.allUsers ?? []).map(displayUserToBUser),
    officers: (data.officers ?? []).map(displayUserToBUser),
    managers: (data.managers ?? []).map(displayUserToBUser),
    assistants: (data.assistants ?? []).map(displayUserToBUser),
    raw: data,
  }
}

// Returns users whose role assignments match the given dept/subdept — used in
// TaskForm to populate officer/manager/assistant dropdowns contextually.
export function filterUsersForScope(
  raw: FilteredUserData,
  departmentId: string,
  subdepartmentId: string
): { officers: BUser[]; managers: BUser[]; assistants: BUser[] } {
  const filtered = getSubdepartmentUsers(raw.allUsers, departmentId, subdepartmentId)
  return {
    officers: (filtered.officers ?? []).map(displayUserToBUser),
    managers: (filtered.managers ?? []).map(displayUserToBUser),
    assistants: (filtered.assistants ?? []).map(displayUserToBUser),
  }
}

// ─── Current user ─────────────────────────────────────────────────────────────

export async function fetchCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ─── Row → type mappers ───────────────────────────────────────────────────────

function rowToTask(row: any): BTask {
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
    departmentId: "",
    subdepartmentId: null,
    classId: null,
    jobLevel: {},
    createdByUserId: row.created_by_user_id,
    assignedToUserIds,
    assignedToUserId: assignedToUserIds[0] ?? null,
    collaboratorIds: row.collaborator_ids ?? [],
    officerId: null,
    managerId: null,
    assistantId: null,
    startDate: row.start_date,
    dueDate: row.due_date,
    tags: row.tags ?? [],
    reminderIds: [],
    recurringTemplateId: row.recurring_template_id ?? null,
    notes: row.notes ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToTemplate(row: any): BRecurringTemplate {
  const assignedToUserIds: string[] = Array.isArray(row.assigned_to_user_ids)
    ? row.assigned_to_user_ids
    : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    departmentId: "",
    subdepartmentId: null,
    classId: null,
    jobLevel: {},
    assignedToUserIds,
    assignedToUserId: assignedToUserIds[0] ?? null,
    collaboratorIds: row.collaborator_ids ?? [],
    officerId: null,
    managerId: null,
    assistantId: null,
    priority: row.priority,
    frequency: row.frequency,
    tags: row.tags ?? [],
    dayOfMonth: row.day_of_month ?? null,
    dayOfWeek: row.day_of_week ?? null,
    startDate: row.start_date,
    nextRunAt: row.next_run_at,
    active: row.active,
    defaultReminderOffsetsMinutes: row.default_reminder_offsets_minutes ?? [],
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

function rowToReminder(row: any): BReminder {
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.tm_task_diary?.title ?? "",
    remindAt: row.remind_at,
    channels: row.channels ?? ["in_app"],
    deliveredAt: row.delivered_at ?? null,
    snoozedUntil: row.snoozed_until ?? null,
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchDiaryTasks(
  userId: string,
  isAdmin: boolean,
): Promise<BTask[]> {
  let query = supabase
    .from("tm_task_diary")
    .select("*")
    .order("due_date", { ascending: true })

  if (!isAdmin) {
    query = query.or(
      [
        `created_by_user_id.eq.${userId}`,
        `assigned_to_user_ids.cs.["${userId}"]`,
        `collaborator_ids.cs.{${userId}}`,
      ].join(",")
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(rowToTask)
}

export async function createDiaryTask(
  input: Omit<BTask, "id" | "createdAt" | "updatedAt" | "reminderIds">
): Promise<BTask> {
  const { data, error } = await supabase
    .from("tm_task_diary")
    .insert({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      type: input.type,
      created_by_user_id: input.createdByUserId,
      assigned_to_user_ids: input.assignedToUserIds ?? [],
      collaborator_ids: input.collaboratorIds ?? [],
      start_date: input.startDate,
      due_date: input.dueDate,
      tags: input.tags,
      notes: input.notes || null,
      recurring_template_id: input.recurringTemplateId || null,
    })
    .select()
    .single()

  if (error) throw error
  return rowToTask(data)
}

export async function updateDiaryTask(
  id: string,
  updates: Partial<Omit<BTask, "id" | "createdAt" | "reminderIds">>
): Promise<BTask> {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }

  if (updates.title !== undefined) patch.title = updates.title
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.status !== undefined) {
    patch.status = updates.status
    if (updates.status === "done") patch.completed_at = new Date().toISOString()
  }
  if (updates.priority !== undefined) patch.priority = updates.priority
  if (updates.type !== undefined) patch.type = updates.type
  if (updates.assignedToUserIds !== undefined) patch.assigned_to_user_ids = updates.assignedToUserIds
  if (updates.collaboratorIds !== undefined) patch.collaborator_ids = updates.collaboratorIds
  if (updates.startDate !== undefined) patch.start_date = updates.startDate
  if (updates.dueDate !== undefined) patch.due_date = updates.dueDate
  if (updates.tags !== undefined) patch.tags = updates.tags
  if (updates.notes !== undefined) patch.notes = updates.notes || null

  const { data, error } = await supabase
    .from("tm_task_diary")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return rowToTask(data)
}

export async function deleteDiaryTask(id: string): Promise<void> {
  const { error } = await supabase.from("tm_task_diary").delete().eq("id", id)
  if (error) throw error
}

// ─── Recurring templates ──────────────────────────────────────────────────────

export async function fetchRecurringTemplates(
  departmentId?: string,
  userId?: string,
  isAdmin = true
): Promise<BRecurringTemplate[]> {
  let query = supabase
    .from("tm_recurring_templates")
    .select("*")
    .order("created_at", { ascending: false })

  if (!isAdmin && userId) {
    query = query.or(
      [
        `created_by_user_id.eq.${userId}`,
        `assigned_to_user_ids.cs.["${userId}"]`,
        `collaborator_ids.cs.{${userId}}`,
      ].join(",")
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(rowToTemplate)
}

export async function createRecurringTemplate(
  input: Omit<BRecurringTemplate, "id" | "createdAt">
): Promise<BRecurringTemplate> {
  const { data, error } = await supabase
    .from("tm_recurring_templates")
    .insert({
      title: input.title,
      description: input.description,
      assigned_to_user_ids: input.assignedToUserIds ?? [],
      collaborator_ids: input.collaboratorIds ?? [],
      priority: input.priority,
      frequency: input.frequency,
      tags: input.tags,
      day_of_month: input.dayOfMonth ?? null,
      day_of_week: input.dayOfWeek ?? null,
      start_date: input.startDate,
      next_run_at: input.nextRunAt,
      active: input.active,
      default_reminder_offsets_minutes: input.defaultReminderOffsetsMinutes,
      created_by_user_id: input.createdByUserId,
    })
    .select()
    .single()

  if (error) throw error
  return rowToTemplate(data)
}

export async function updateRecurringTemplate(
  id: string,
  updates: Partial<Omit<BRecurringTemplate, "id" | "createdAt">>
): Promise<BRecurringTemplate> {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }

  if (updates.title !== undefined) patch.title = updates.title
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.assignedToUserIds !== undefined) patch.assigned_to_user_ids = updates.assignedToUserIds
  if (updates.collaboratorIds !== undefined) patch.collaborator_ids = updates.collaboratorIds
  if (updates.priority !== undefined) patch.priority = updates.priority
  if (updates.frequency !== undefined) patch.frequency = updates.frequency
  if (updates.dayOfMonth !== undefined) patch.day_of_month = updates.dayOfMonth ?? null
  if (updates.dayOfWeek !== undefined) patch.day_of_week = updates.dayOfWeek ?? null
  if (updates.startDate !== undefined) patch.start_date = updates.startDate
  if (updates.nextRunAt !== undefined) patch.next_run_at = updates.nextRunAt
  if (updates.active !== undefined) patch.active = updates.active
  if (updates.tags !== undefined) patch.tags = updates.tags
  if (updates.defaultReminderOffsetsMinutes !== undefined) {
    patch.default_reminder_offsets_minutes = updates.defaultReminderOffsetsMinutes
  }

  const { data, error } = await supabase
    .from("tm_recurring_templates")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return rowToTemplate(data)
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("tm_recurring_templates").delete().eq("id", id)
  if (error) throw error
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export async function fetchReminders(userId?: string): Promise<BReminder[]> {
  // Supabase doesn't support filtering via joined table in .or() at the PostgREST level,
  // so we fetch all reminders for tasks the user is part of via a two-step approach.
  let query = supabase
    .from("tm_reminders")
    .select("*, tm_task_diary(title, assigned_to_user_ids, created_by_user_id)")
    .order("remind_at", { ascending: true })

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []

  // Filter client-side when userId is provided — avoids complex PostgREST join filters
  const filtered = userId
    ? rows.filter(r =>
      (r.tm_task_diary?.assigned_to_user_ids ?? []).includes(userId) ||
      r.tm_task_diary?.created_by_user_id === userId
    )
    : rows

  return filtered.map(rowToReminder)
}

export async function createReminder(input: {
  taskId: string
  remindAt: string
  channels: string[]
}): Promise<BReminder> {
  const { data, error } = await supabase
    .from("tm_reminders")
    .insert({
      task_id: input.taskId,
      remind_at: input.remindAt,
      channels: input.channels,
    })
    .select("*, tm_task_diary(title)")
    .single()

  if (error) throw error
  return rowToReminder(data)
}

export async function markReminderDelivered(id: string): Promise<void> {
  const { error } = await supabase
    .from("tm_reminders")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}
