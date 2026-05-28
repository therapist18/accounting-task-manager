// @ts-nocheck

export type BTaskStatus = "todo" | "in_progress" | "done" | "cancelled"
export type BTaskPriority = "low" | "medium" | "high" | "urgent"
export type BTaskType = "personal" | "department" | "system"
export type BRecurrenceFrequency = "daily" | "weekly" | "monthly"
export type BNotificationChannel = "in_app" | "push" | "email" | "whatsapp"
export type BUserRole = "super_admin" | "admin" | "manager" | "officer" | "assistant"

export type BServiceClass = {
  id: string
  name: string
  subdepartmentId: string
}

export type BSubdepartment = {
  id: string
  name: string
  departmentId: string
  classes: BServiceClass[]
}

export type BDepartment = {
  id: string
  name: string
  color: string
  bgColor: string
  subdepartments: BSubdepartment[]
}

export type BJobLevel = {
  level: 1 | 2 | 3
  departmentId: string
  subdepartmentId?: string | null
  classId?: string | null
}

export type BJobLevelAssignment = BJobLevel & {
  id: string
  role: "officer" | "manager" | "assistant" | "admin"
}

export type BUser = {
  id: string
  name: string
  email: string
  role: BUserRole
  avatarInitials: string
  avatarColor: string
  assignments: BJobLevelAssignment[]
  isActive: boolean
}

export type BTask = {
  id: string
  title: string
  description: string
  status: BTaskStatus
  priority: BTaskPriority
  type: BTaskType
  departmentId: string
  subdepartmentId?: string | null
  classId?: string | null
  jobLevel: BJobLevel
  createdByUserId: string
  assignedToUserId?: string | null
  assignedToUserIds: string[]
  collaboratorIds: string[]
  officerId?: string | null
  managerId?: string | null
  assistantId?: string | null
  startDate: string
  dueDate: string
  tags: string[]
  reminderIds: string[]
  recurringTemplateId?: string | null
  notes?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type BRecurringTemplate = {
  id: string
  title: string
  description: string
  departmentId: string
  subdepartmentId?: string | null
  classId?: string | null
  jobLevel: BJobLevel
  assignedToUserId?: string | null
  assignedToUserIds: string[]
  collaboratorIds: string[]
  officerId?: string | null
  managerId?: string | null
  assistantId?: string | null
  priority: BTaskPriority
  frequency: BRecurrenceFrequency
  tags: string[]
  dayOfMonth?: number | null
  dayOfWeek?: number | null
  startDate: string
  nextRunAt: string
  active: boolean
  defaultReminderOffsetsMinutes: number[]
  createdByUserId: string
  createdAt: string
}

export type BReminder = {
  id: string
  taskId: string
  taskTitle: string
  remindAt: string
  channels: BNotificationChannel[]
  deliveredAt?: string | null
  snoozedUntil?: string | null
}

export type BTaskFilters = {
  search: string
  status: "all" | BTaskStatus
  priority: "all" | BTaskPriority
  departmentId: "all" | string
  userId: "all" | string
  type: "all" | BTaskType
  dateView: "all" | "today" | "week" | "overdue"
}

export type BTaskStats = {
  total: number
  todo: number
  inProgress: number
  done: number
  overdue: number
  pendingReminders: number
  completionRate: number
}
