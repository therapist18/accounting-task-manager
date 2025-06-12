import { supabase } from "./client"

export async function getTasks() {
  const { data, error } = await supabase
    .from('tm_tasks')
    .select(`
      *,
      department:tm_departments(*),
      subdepartment:tm_subdepartments(*),
      task_manager:tm_users!tm_tasks_task_manager_id_fkey(id, name, email),
      task_assistant:tm_users!tm_tasks_task_assistant_id_fkey(id, name, email),
      current_stage:tm_stages(*)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createTask(taskData: {
  job_description: string
  department_id: string
  subdepartment_id: string
  task_manager_id: string
  task_assistant_id: string | null
  client_id: string
  date_initiated: string
}) {
  const { data, error } = await supabase
    .from('tm_tasks')
    .insert([{
      job_description: taskData.job_description,
      department_id: taskData.department_id,
      subdepartment_id: taskData.subdepartment_id,
      task_manager_id: taskData.task_manager_id || null,
      task_assistant_id: taskData.task_assistant_id || null,
      client_id: taskData.client_id,
      status: 'registered',
      date_initiated: new Date(taskData.date_initiated).toISOString()
    }])
    .select(`
      *,
      department:tm_departments(*),
      subdepartment:tm_subdepartments(*),
      task_manager:tm_users!tm_tasks_task_manager_id_fkey(id, name, email),
      task_assistant:tm_users!tm_tasks_task_assistant_id_fkey(id, name, email),
      current_stage:tm_stages(*)
    `)
    .single()

  if (error) throw error
  return data
}

export async function updateTaskAssignment(taskId: string, assignments: {
  taskManager: string
  taskAssistant: string
}) {
  const { data, error } = await supabase
    .from('tm_tasks')
    .update({
      task_manager_id: assignments.taskManager,
      task_assistant_id: assignments.taskAssistant || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data
}
