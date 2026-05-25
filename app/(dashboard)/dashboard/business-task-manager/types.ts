export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled"
export type TaskPriority = "low" | "medium" | "high" | "urgent"
export type TaskType = "user" | "department" | "system"
export type RecurrenceFrequency = "daily" | "weekly" | "monthly"
export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp"

export type DiaryUser = {
  id: string
  name: string
  email: string
  role: "admin" | "manager" | "officer" | "assistant" | "user"
  departmentIds: string[]
  jobLevels: string[]
}

export type DiaryDepartment = {
  id: string
  name: string
  color: string
  jobLevels: string[]
}

export type TaskReminder = {
  id: string
  taskId: string
  remindAt: string
  channels: NotificationChannel[]
  deliveredAt?: string | null
}

export type BusinessTask = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  departmentId: string
  createdByUserId: string
  assignedToUserId?: string | null
  startDate: string
  dueDate: string
  tags: string[]
  reminderIds: string[]
  recurringTemplateId?: string | null
  createdAt: string
  updatedAt: string
}

export type RecurringTaskTemplate = {
  id: string
  title: string
  description: string
  departmentId: string
  assignedToUserId?: string | null
  priority: TaskPriority
  frequency: RecurrenceFrequency
  tags: string[]
  startDate: string
  nextRunAt: string
  active: boolean
  defaultReminderOffsetsMinutes: number[]
  createdByUserId: string
}

export type TaskFilters = {
  search: string
  status: "all" | TaskStatus
  priority: "all" | TaskPriority
  departmentId: "all" | string
  userId: "all" | string
  type: "all" | TaskType
  dateView: "all" | "today" | "week" | "overdue"
}
