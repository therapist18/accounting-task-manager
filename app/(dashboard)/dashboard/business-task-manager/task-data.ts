import type {
  BusinessTask,
  DiaryDepartment,
  DiaryUser,
  RecurringTaskTemplate,
  TaskReminder,
} from "./types"

export const departments: DiaryDepartment[] = [
  { id: "banking", name: "Banking", color: "bg-sky-500", jobLevels: ["Officer", "Manager", "Assistant"] },
  { id: "payroll", name: "Payroll", color: "bg-emerald-500", jobLevels: ["Payroll Lead", "Processor", "Reviewer"] },
  { id: "immigration", name: "Immigration", color: "bg-violet-500", jobLevels: ["Case Officer", "Document Reviewer", "Runner"] },
  { id: "kra", name: "KRA", color: "bg-amber-500", jobLevels: ["Tax Officer", "Compliance Reviewer"] },
  { id: "admin", name: "Admin", color: "bg-rose-500", jobLevels: ["Admin Lead", "Office Assistant"] },
]

export const users: DiaryUser[] = [
  {
    id: "u-admin",
    name: "Super Admin",
    email: "admin@bcl.co.ke",
    role: "admin",
    departmentIds: departments.map((department) => department.id),
    jobLevels: ["Global Oversight"],
  },
  {
    id: "u-banking",
    name: "Amina Banking",
    email: "amina@bcl.co.ke",
    role: "manager",
    departmentIds: ["banking"],
    jobLevels: ["Manager"],
  },
  {
    id: "u-payroll",
    name: "Brian Payroll",
    email: "brian@bcl.co.ke",
    role: "officer",
    departmentIds: ["payroll"],
    jobLevels: ["Processor"],
  },
  {
    id: "u-immigration",
    name: "Clara Immigration",
    email: "clara@bcl.co.ke",
    role: "officer",
    departmentIds: ["immigration"],
    jobLevels: ["Case Officer"],
  },
  {
    id: "u-kra",
    name: "David KRA",
    email: "david@bcl.co.ke",
    role: "assistant",
    departmentIds: ["kra"],
    jobLevels: ["Compliance Reviewer"],
  },
]

const today = new Date()
const isoDate = (offsetDays = 0, hour = 9, minute = 0) => {
  const date = new Date(today)
  date.setDate(today.getDate() + offsetDays)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

export const reminders: TaskReminder[] = [
  { id: "r-1", taskId: "task-1", remindAt: isoDate(0, 10), channels: ["in_app", "push"] },
  { id: "r-2", taskId: "task-2", remindAt: isoDate(1, 8, 30), channels: ["in_app", "email"] },
  { id: "r-3", taskId: "task-4", remindAt: isoDate(-1, 16), channels: ["in_app", "push", "whatsapp"] },
  { id: "r-4", taskId: "task-5", remindAt: isoDate(2, 9), channels: ["in_app"] },
]

export const tasks: BusinessTask[] = [
  {
    id: "task-1",
    title: "Download daily bank statements",
    description: "Pull statements for all active client bank accounts and upload them to the working folder.",
    status: "in_progress",
    priority: "high",
    type: "system",
    departmentId: "banking",
    createdByUserId: "u-admin",
    assignedToUserId: "u-banking",
    startDate: isoDate(0, 8),
    dueDate: isoDate(0, 12),
    tags: ["daily", "bank-statements"],
    reminderIds: ["r-1"],
    recurringTemplateId: "tpl-daily-bank",
    createdAt: isoDate(-7),
    updatedAt: isoDate(0),
  },
  {
    id: "task-2",
    title: "Prepare May payroll update pack",
    description: "Confirm staff movement, statutory changes, and payroll adjustment notes before processing.",
    status: "todo",
    priority: "urgent",
    type: "department",
    departmentId: "payroll",
    createdByUserId: "u-admin",
    assignedToUserId: "u-payroll",
    startDate: isoDate(1, 9),
    dueDate: isoDate(3, 17),
    tags: ["monthly", "payroll"],
    reminderIds: ["r-2"],
    createdAt: isoDate(-2),
    updatedAt: isoDate(-1),
  },
  {
    id: "task-3",
    title: "Review immigration file handover notes",
    description: "Check pending client documents and update the department handover summary.",
    status: "todo",
    priority: "medium",
    type: "user",
    departmentId: "immigration",
    createdByUserId: "u-immigration",
    assignedToUserId: "u-immigration",
    startDate: isoDate(0, 13),
    dueDate: isoDate(2, 16),
    tags: ["handover", "client-docs"],
    reminderIds: [],
    createdAt: isoDate(-1),
    updatedAt: isoDate(-1),
  },
  {
    id: "task-4",
    title: "Resolve overdue KRA compliance follow-up",
    description: "Call client for missing PIN confirmation and update the compliance tracker.",
    status: "in_progress",
    priority: "urgent",
    type: "department",
    departmentId: "kra",
    createdByUserId: "u-admin",
    assignedToUserId: "u-kra",
    startDate: isoDate(-4, 9),
    dueDate: isoDate(-1, 17),
    tags: ["overdue", "client-follow-up"],
    reminderIds: ["r-3"],
    createdAt: isoDate(-5),
    updatedAt: isoDate(-1),
  },
  {
    id: "task-5",
    title: "Send monthly payslips",
    description: "Generate and send approved payslips after final payroll review.",
    status: "todo",
    priority: "high",
    type: "system",
    departmentId: "payroll",
    createdByUserId: "u-admin",
    assignedToUserId: "u-payroll",
    startDate: isoDate(2, 9),
    dueDate: isoDate(5, 15),
    tags: ["monthly", "payslips"],
    reminderIds: ["r-4"],
    recurringTemplateId: "tpl-monthly-payslips",
    createdAt: isoDate(-15),
    updatedAt: isoDate(-2),
  },
]

export const recurringTemplates: RecurringTaskTemplate[] = [
  {
    id: "tpl-daily-bank",
    title: "Daily bank statement downloads",
    description: "Generate daily download work for the banking team.",
    departmentId: "banking",
    assignedToUserId: "u-banking",
    priority: "high",
    frequency: "daily",
    tags: ["daily", "bank-statements"],
    startDate: isoDate(-30, 8),
    nextRunAt: isoDate(1, 8),
    active: true,
    defaultReminderOffsetsMinutes: [60, 15],
    createdByUserId: "u-admin",
  },
  {
    id: "tpl-monthly-payslips",
    title: "Monthly payslip sending",
    description: "Create payroll team task for approved monthly payslip distribution.",
    departmentId: "payroll",
    assignedToUserId: "u-payroll",
    priority: "high",
    frequency: "monthly",
    tags: ["monthly", "payslips"],
    startDate: isoDate(-60, 9),
    nextRunAt: isoDate(7, 9),
    active: true,
    defaultReminderOffsetsMinutes: [1440, 120],
    createdByUserId: "u-admin",
  },
  {
    id: "tpl-weekly-kra",
    title: "Weekly KRA exception review",
    description: "Review outstanding KRA exceptions and client follow-ups.",
    departmentId: "kra",
    assignedToUserId: "u-kra",
    priority: "medium",
    frequency: "weekly",
    tags: ["weekly", "kra"],
    startDate: isoDate(-14, 10),
    nextRunAt: isoDate(4, 10),
    active: true,
    defaultReminderOffsetsMinutes: [240],
    createdByUserId: "u-admin",
  },
]

export function isTaskVisibleToUser(task: BusinessTask, user: DiaryUser) {
  if (user.role === "admin") return true
  return (
    task.createdByUserId === user.id ||
    task.assignedToUserId === user.id ||
    (task.type === "department" && user.departmentIds.includes(task.departmentId)) ||
    (task.type === "system" && user.departmentIds.includes(task.departmentId))
  )
}

export function generateDueTemplates(now = new Date()) {
  return recurringTemplates.filter((template) => template.active && new Date(template.nextRunAt) <= now)
}

export function getPendingReminders(allReminders: TaskReminder[], now = new Date()) {
  return allReminders.filter((reminder) => !reminder.deliveredAt && new Date(reminder.remindAt) <= now)
}
