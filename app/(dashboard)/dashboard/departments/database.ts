import supabase from '@/lib/supabase/client'
import { nanoid } from 'nanoid'
// Types
export type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'task_manager' | 'task_assistant'
}

export type Stage = {
  id: string
  name: string
  estimatedTime: number // in hours (converted from minutes in DB)
  reminderDays: number
  order: number
  isActive: boolean
  status: 'yes' | 'na'
  subdepartmentId: string
}

export type Subdepartment = {
  id: string
  name: string
  description?: string
  departmentId: string
  taskManagerId?: string
  taskAssistantId?: string
  stages: Stage[]
  processingTime: number
  deliveryTime: number
}

export type Department = {
  id: string
  name: string
  description?: string
  subdepartments: Subdepartment[]
}

// Database functions
export async function fetchUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .select('id, name, email, role')
      .order('name')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching users:', error)
    throw new Error('Failed to fetch users')
  }
}

export async function fetchDepartments(): Promise<Department[]> {
  try {
    // Fetch departments with subdepartments and stages
    const { data: departmentsData, error: deptError } = await supabase
      .from('tm_departments')
      .select(`
        id,
        name,
        description,
        tm_subdepartments (
          id,
          name,
          description,
          department_id,
          tm_stages (
            id,
            name,
            estimated_time,
            order_num,
            subdepartment_id
          )
        )
      `)
      .order('name')

    if (deptError) throw deptError

    // Transform the data to match our component structure
    const departments: Department[] = (departmentsData || []).map(dept => ({
      id: dept.id,
      name: dept.name,
      description: dept.description,
      subdepartments: (dept.tm_subdepartments || []).map((subdept: any) => ({
        id: subdept.id,
        name: subdept.name,
        description: subdept.description,
        departmentId: subdept.department_id,
        taskManagerId: undefined, // We'll fetch this separately if needed
        taskAssistantId: undefined, // We'll fetch this separately if needed
        processingTime: 2, // Default values - you can store these in DB too
        deliveryTime: 5,
        stages: (subdept.tm_stages || []).map((stage: any) => ({
          id: stage.id,
          name: stage.name,
          estimatedTime: Math.round((stage.estimated_time || 0) / 60), // Convert minutes to hours
          reminderDays: 1, // Default - you can add this field to DB
          order: stage.order_num,
          isActive: false, // Default - you can add this field to DB
          status: 'yes' as const,
          subdepartmentId: stage.subdepartment_id
        })).sort((a: Stage, b: Stage) => a.order - b.order)
      }))
    }))

    return departments
  } catch (error) {
    console.error('Error fetching departments:', error)
    throw new Error('Failed to fetch departments')
  }
}

export async function createDepartment(departmentData: {
  name: string
  description?: string | null
  subdepartments: Array<{
    name: string
    description?: string | null
    classes?: any[]
    taskManagerId?: string | null
    taskAssistantId?: string | null
    stages: {
      [key: string]: {
        applies: boolean
        estimatedTime: number
        reminderDays: number
      }
    }
  }>
}): Promise<Department> {
  try {
    // Insert department (let DB auto-generate the ID)
    const { data: newDepartment, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentData.name,
        description: departmentData.description
      })
      .select()
      .single()

    if (deptError) throw deptError
    const departmentId = newDepartment.id

    // Insert subdepartments and stages
    for (const subdeptData of departmentData.subdepartments) {
      // Prepare task manager data
      const taskManagerUser = subdeptData.taskManagerId ? await supabase
        .from('tm_users')
        .select('*')
        .eq('id', subdeptData.taskManagerId)
        .single() : null

      // Prepare task assistant data
      const taskAssistantUser = subdeptData.taskAssistantId ? await supabase
        .from('tm_users')
        .select('*')
        .eq('id', subdeptData.taskAssistantId)
        .single() : null

      // Insert subdepartment with task assignments
      const { data: subdeptResult, error: subdeptError } = await supabase
        .from('tm_subdepartments')
        .insert({
          name: subdeptData.name,
          description: subdeptData.description,
          department_id: departmentId,
          task_manager: taskManagerUser?.data ? {
            id: taskManagerUser.data.id,
            start_date: new Date().toISOString(),
            end_date: null
          } : null,
          task_assistant: taskAssistantUser?.data ? {
            id: taskAssistantUser.data.id,
            start_date: new Date().toISOString(),
            end_date: null
          } : null
        })
        .select()
        .single()

      if (subdeptError) throw subdeptError
      
      const subdepartmentId = subdeptResult?.id
      if (!subdepartmentId) throw new Error('Failed to create subdepartment')

      if (subdeptError) throw subdeptError

      // Insert stages that apply
      const applicableStages = Object.entries(subdeptData.stages)
        .filter(([_, stageConfig]) => {
          const config = stageConfig as { applies: boolean }
          return config.applies
        })
        .map(([stageName, stageConfig], index) => {
          const config = stageConfig as { estimatedTime: number }
          return {
            id: nanoid(),
            name: stageName,
            subdepartment_id: subdepartmentId,
            order_num: index + 1,
            estimated_time: config.estimatedTime * 60 // Convert hours to minutes
          }
        })

      if (applicableStages.length > 0) {
        const { error: stagesError } = await supabase
          .from('tm_stages')
          .insert(applicableStages)

        if (stagesError) throw stagesError
      }
    }

    // Fetch and return the created department
    const createdDepartment = await fetchDepartmentById(departmentId)
    return createdDepartment
  } catch (error) {
    console.error('Error creating department:', error)
    throw new Error('Failed to create department')
  }
}

export async function fetchDepartmentById(id: string): Promise<Department> {
  try {
    const { data, error } = await supabase
      .from('tm_departments')
      .select(`
        id,
        name,
        description,
        tm_subdepartments (
          id,
          name,
          description,
          department_id,
          tm_stages (
            id,
            name,
            estimated_time,
            order_num,
            subdepartment_id
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // Transform the data
    const department: Department = {
      id: data.id,
      name: data.name,
      description: data.description,
      subdepartments: (data.tm_subdepartments || []).map((subdept: any) => ({
        id: subdept.id,
        name: subdept.name,
        description: subdept.description,
        departmentId: subdept.department_id,
        taskManagerId: undefined,
        taskAssistantId: undefined,
        processingTime: 2,
        deliveryTime: 5,
        stages: (subdept.tm_stages || []).map((stage: any) => ({
          id: stage.id,
          name: stage.name,
          estimatedTime: Math.round((stage.estimated_time || 0) / 60),
          reminderDays: 1,
          order: stage.order_num,
          isActive: false,
          status: 'yes' as const,
          subdepartmentId: stage.subdepartment_id
        })).sort((a: Stage, b: Stage) => a.order - b.order)
      }))
    }

    return department
  } catch (error) {
    console.error('Error fetching department by ID:', error)
    throw new Error('Failed to fetch department')
  }
}

export async function createStage(stageData: {
  name: string
  estimatedTime: number
  reminderDays: number
  subdepartmentId: string
  order: number
}): Promise<Stage> {
  try {
    const stageId = nanoid()

    const { error } = await supabase
      .from('tm_stages')
      .insert({
        id: stageId,
        name: stageData.name,
        subdepartment_id: stageData.subdepartmentId,
        order_num: stageData.order,
        estimated_time: stageData.estimatedTime * 60 // Convert hours to minutes
      })

    if (error) throw error

    // Return the stage in the format expected by the frontend
    const createdStage: Stage = {
      id: stageId,
      name: stageData.name,
      estimatedTime: stageData.estimatedTime,
      reminderDays: stageData.reminderDays,
      order: stageData.order,
      isActive: false,
      status: 'yes',
      subdepartmentId: stageData.subdepartmentId
    }

    return createdStage
  } catch (error) {
    console.error('Error creating stage:', error)
    throw new Error('Failed to create stage')
  }
}

// Helper function to get user name by ID
export async function getUserById(id: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .select('id, name, email, role')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching user by ID:', error)
    return null
  }
}