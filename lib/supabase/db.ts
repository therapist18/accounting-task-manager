"use client"
import { supabase } from '@/utils/supabase/client'
import { Department, Stage, Subdepartment, Task, TaskStage, User } from './database.types'

// Users
export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*')
  if (error) throw error
  return data
}

// Departments
export const getDepartments = async (): Promise<Department[]> => {
  const { data, error } = await supabase.from('tm_departments').select('*')
  if (error) throw error
  return data
}

export const createDepartment = async (department: Omit<Department, 'id' | 'created_at' | 'updated_at'>): Promise<Department> => {
  const { data, error } = await supabase
    .from('tm_departments')
    .insert([department])
    .select()
    .single()
  if (error) throw error
  return data
}

// Subdepartments
export const getSubdepartments = async (departmentId?: string): Promise<Subdepartment[]> => {
  let query = supabase.from('tm_subdepartments').select('*')
  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export const createSubdepartment = async (subdepartment: Omit<Subdepartment, 'id' | 'created_at' | 'updated_at'>): Promise<Subdepartment> => {
  const { data, error } = await supabase
    .from('tm_subdepartments')
    .insert([subdepartment])
    .select()
    .single()
  if (error) throw error
  return data
}

// Stages
export const getStages = async (subdepartmentId: string): Promise<Stage[]> => {
  const { data, error } = await supabase
    .from('tm_stages')
    .select('*')
    .eq('subdepartment_id', subdepartmentId)
    .order('order', { ascending: true })
  if (error) throw error
  return data
}

export const createStage = async (stage: Omit<Stage, 'id' | 'created_at' | 'updated_at'>): Promise<Stage> => {
  const { data, error } = await supabase
    .from('tm_stages')
    .insert([stage])
    .select()
    .single()
  if (error) throw error
  return data
}

// Tasks
export const getTasks = async (status?: string): Promise<Task[]> => {
  let query = supabase
    .from('tm_tasks')
    .select(`
      *,
      department:tm_departments(*),
      subdepartment:tm_subdepartments(*),
      task_manager:tm_users!tm_tasks_task_manager_id_fkey(*),
      task_assistant:tm_users!tm_tasks_task_assistant_id_fkey(*),
      current_stage:tm_stages(*)
    `)
    
  if (status) {
    query = query.eq('status', status)
  }
  
  const { data, error } = await query
  if (error) throw error
  return data as unknown as Task[]
}

export const createTask = async (task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> => {
  const { data, error } = await supabase
    .from('tm_tasks')
    .insert([task])
    .select()
    .single()
  if (error) throw error
  return data
}

// Task Stages
export const getTaskStages = async (taskId: string): Promise<TaskStage[]> => {
  const { data, error } = await supabase
    .from('tm_task_stages')
    .select('*')
    .eq('task_id', taskId)
    .order('started_at', { ascending: true })
  if (error) throw error
  return data
}

export const updateTaskStage = async (
  taskId: string,
  stageId: string,
  updates: Partial<TaskStage>
): Promise<TaskStage> => {
  const { data, error } = await supabase
    .from('tm_task_stages')
    .update(updates)
    .eq('task_id', taskId)
    .eq('stage_id', stageId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const createTaskStage = async (taskStage: Omit<TaskStage, 'id' | 'created_at' | 'updated_at'>): Promise<TaskStage> => {
  const { data, error } = await supabase
    .from('tm_task_stages')
    .insert([taskStage])
    .select()
    .single()
  if (error) throw error
  return data
}
