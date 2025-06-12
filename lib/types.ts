export interface User {
  id: string
  username: string
  email: string
  isActive: boolean
  createdAt: string
  activatedAt?: string
  deactivatedAt?: string
  reactivatedAt?: string
  role: "admin" | "user"
}

export interface Department {
  id: string
  name: string
  createdAt: string
}

export interface Subdepartment {
  id: string
  name: string
  departmentId: string
  taskManagerId?: string
  taskAssistantId?: string
  processingTime: number // in minutes
  clientDeliveryTime: number // in minutes
  createdAt: string
}

export interface Stage {
  id: string
  subdepartmentId: string
  name: string
  timeEstimate: number // in minutes
  followUpWith: "BCL" | "Officer" | "Client"
  processType: "Online" | "Manual"
  requiresUpload: boolean
  templateRequired: boolean
  templateFileUrl?: string
  autoMessage?: string
  order: number
  createdAt: string
}

export interface Client {
  id: string
  companyName: string
  clientType: "acc" | "imm" | "sheria" | "audit"
  phoneNumber: string
  email: string
  createdAt: string
}

export interface Task {
  id: string
  jobDescription: string
  registeredDate: string
  dateInitiated: string
  status: "Registered" | "Confirmed" | "Completed" | "Cancelled"
  departmentId: string
  subdepartmentId: string
  taskManagerId: string
  taskAssistantId: string
  clientId: string
  currentStageId?: string
  currentStageStartedAt?: string
  stageOrder: number
  createdAt: string
  updatedAt: string
}

export interface TaskStageHistory {
  id: string
  taskId: string
  stageId: string
  startedAt: string
  completedAt?: string
  estimatedDuration: number // in minutes
  actualDuration?: number // in minutes
  isOverdue: boolean
  status: "active" | "completed" | "skipped"
  notes?: string
  createdAt: string
}

export interface TaskAssignment {
  id: string
  taskId: string
  assignedBy: string
  assignedTo: string
  role: "task_manager" | "task_assistant"
  assignedAt: string
  isActive: boolean
  notes?: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: "info" | "warning" | "success" | "error"
  isRead: boolean
  relatedTaskId?: string
  createdAt: string
}

export interface DiaryEntry {
  id: string
  userId: string
  content: string
  date: string
  createdAt: string
}

export interface UserActivityLog {
  id: string
  userId: string
  action: "created" | "activated" | "deactivated" | "reactivated"
  timestamp: string
}
