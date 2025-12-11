export type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'task_manager' | 'task_assistant'
  created_at: string
  updated_at: string
}

export type Department = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type Subdepartment = {
  id: string
  name: string
  department_id: string
  processing_time: number
  delivery_time: number
  task_manager_id?: string
  task_assistant_id?: string
  created_at: string
  updated_at: string
}

export type Stage = {
  id: string
  name: string
  subdepartment_id: string
  estimated_time: number
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Task = {
  id: string
  job_description: string
  department_id: string
  subdepartment_id: string
  status: 'registered' | 'confirmed' | 'completed' | 'cancelled'
  task_manager_id: string
  task_assistant_id: string
  client_id: string
  date_initiated: string
  created_at: string
  updated_at: string
}

export type TaskStage = {
  id: string
  task_id: string
  stage_id: string
  started_at: string
  completed_at: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  notes: string | null
  created_at: string
  updated_at: string
}
