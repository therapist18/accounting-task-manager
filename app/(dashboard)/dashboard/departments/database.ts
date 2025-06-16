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

export type Officer = {
  id: string
  name: string | null
  email: string | null
  phone_number?: string | null
  assignment_start: string
  assignment_end: string | null
}

export type Department = {
  id: string
  name: string
  description?: string
  subdepartments: Subdepartment[]
  officers: Officer[]
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
    // First, fetch all stages
    const { data: allStages, error: stagesError } = await supabase
      .from('tm_stages')
      .select('*')
      .order('order_num')

    if (stagesError) throw stagesError

    // Create a map of stage IDs to stage details for quick lookup
    const stagesMap = new Map(allStages?.map(stage => [stage.id, stage]) || [])

    // Fetch all users for quick lookup
    const { data: allUsers, error: usersError } = await supabase
      .from('tm_users')
      .select('id, name, email, phone_number, role, department_history')
      
    if (usersError) throw usersError
    
    const usersMap = new Map(allUsers?.map(user => [user.id, user]) || []);
    
    // Create a map of department IDs to their officers
    const departmentOfficersMap = new Map<string, any[]>();
    
    // Process users to map officers to their departments
    allUsers?.forEach(user => {
      if (user.role === 'officer' && Array.isArray(user.department_history)) {
        // Get the most recent department assignment
        const latestAssignment = user.department_history
          .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0];
        
        if (latestAssignment && !latestAssignment.end_date) {
          const departmentId = latestAssignment.department_id;
          if (!departmentOfficersMap.has(departmentId)) {
            departmentOfficersMap.set(departmentId, []);
          }
          departmentOfficersMap.get(departmentId)?.push({
            id: user.id,
            name: user.name,
            email: user.email,
            phone_number: user.phone_number,
            assignment_start: latestAssignment.start_date,
            assignment_end: latestAssignment.end_date
          });
        }
      }
    });

    // Fetch departments with their subdepartments
    const { data: departmentsData, error: deptError } = await supabase
      .from('tm_departments')
      .select(`
        *,
        tm_subdepartments (*)
      `)
      .order('name')

    if (deptError) throw deptError

    // Transform the data to include stage details and officers
    return (departmentsData || []).map((dept: any) => {
      // Get officers assigned to this department
      const departmentOfficers = departmentOfficersMap.get(dept.id) || [];
      
      const subdepartments = (dept.tm_subdepartments || []).map((subdept: any) => {
        // Get the stage IDs for this subdepartment
        const stageIds: number[] = subdept.stages || [];
        
        // Get the stage details for each ID
        const stages = stageIds.map((stageId: number) => {
          const stageDetails = stagesMap.get(stageId);
          return stageDetails ? {
            id: stageDetails.id,
            name: stageDetails.name,
            estimatedTime: stageDetails.estimated_time / 60, // Convert to hours
            reminderDays: 1, // Default, can be updated if stored in DB
            order: stageDetails.order_num,
            isActive: true,
            status: 'yes' as const,
            subdepartmentId: subdept.id
          } : null;
        }).filter(Boolean);

        // Get user data for task manager and task assistant
        const taskManagerUser = subdept.task_manager?.id ? usersMap.get(subdept.task_manager.id) : null;
        const taskAssistantUser = subdept.task_assistant?.id ? usersMap.get(subdept.task_assistant.id) : null;

        return {
          ...subdept,
          stages,
          task_manager: taskManagerUser ? {
            id: taskManagerUser.id,
            name: taskManagerUser.name,
            email: taskManagerUser.email,
            phone_number: taskManagerUser.phone_number,
            role: taskManagerUser.role
          } : null,
          task_assistant: taskAssistantUser ? {
            id: taskAssistantUser.id,
            name: taskAssistantUser.name,
            email: taskAssistantUser.email,
            phone_number: taskAssistantUser.phone_number,
            role: taskAssistantUser.role
          } : null,
          // Ensure classes always has requirements array
          classes: ((subdept.classes as any[]) || []).map((cls: any) => ({
            ...cls,
            requirements: cls.requirements || []
          }))
        }
      })

      return {
        ...dept,
        subdepartments,
        officers: departmentOfficers
      }
    })
  } catch (error) {
    console.error('Error fetching departments:', error)
    throw new Error('Failed to fetch departments')
  }
}

export async function createDepartment(departmentData: {
  name: string
  description: string | null
  subdepartments: Array<{
    name: string
    description: string | null
    classes?: Array<{
      name: string
      description: string | null
      requirements: Array<{
        name: string
        description: string | null
        is_required: boolean
      }>
    }>
    task_manager: {
      id: string
      start_date: string
      end_date: string | null
    } | null
    task_assistant: {
      id: string
      start_date: string
      end_date: string | null
    } | null
    stages: Array<{
      id: number
    }>
  }>
}): Promise<Department> {
  try {
    // Start by creating the department
    const { data: department, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentData.name,
        description: departmentData.description
      })
      .select()
      .single()

    if (deptError) throw deptError
    if (!department) throw new Error('Failed to create department')

    // Process each subdepartment
    for (const subdept of departmentData.subdepartments) {
      // Prepare stages data - only store the IDs
      const stageIds = subdept.stages.map(stage => stage.id)

      // Insert subdepartment with stages as JSONB
      const { data: subdepartment, error: subdeptError } = await supabase
        .from('tm_subdepartments')
        .insert({
          name: subdept.name,
          description: subdept.description,
          department_id: department.id,
          classes: subdept.classes || [],
          stages: stageIds, // Only store stage IDs
          task_manager: subdept.task_manager ? {
            id: subdept.task_manager.id,
            start_date: subdept.task_manager.start_date,
            end_date: subdept.task_manager.end_date
          } : null,
          task_assistant: subdept.task_assistant ? {
            id: subdept.task_assistant.id,
            start_date: subdept.task_assistant.start_date,
            end_date: subdept.task_assistant.end_date
          } : null
        })
        .select()
        .single()

      if (subdeptError) throw subdeptError
      if (!subdepartment) continue
    }

    // Fetch and return the created department with its subdepartments
    const { data: createdDepartment, error: fetchError } = await supabase
      .from('tm_departments')
      .select(`
        *,
        tm_subdepartments (*)
      `)
      .eq('id', department.id)
      .single()

    if (fetchError) throw fetchError
    if (!createdDepartment) throw new Error('Failed to fetch created department')

    return createdDepartment
  } catch (error) {
    console.error('Error in createDepartment:', error)
    throw error
  }
}
export async function fetchDepartmentById(id: string): Promise<Department> {
  try {
    // First, fetch the department with its subdepartments and stages
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

    // Fetch all users to find officers assigned to this department
    const { data: allUsers } = await supabase
      .from('tm_users')
      .select('id, name, email, phone_number, department_history')
      .eq('role', 'officer')
      .not('department_history', 'is', null)

    // Process officers to find those assigned to this department
    const officers: Officer[] = [];
    allUsers?.forEach(user => {
      if (Array.isArray(user.department_history)) {
        // Get the most recent department assignment
        const latestAssignment = user.department_history
          .sort((a: any, b: any) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0];
        
        if (latestAssignment && latestAssignment.department_id === id && !latestAssignment.end_date) {
          officers.push({
            id: user.id,
            name: user.name,
            email: user.email,
            phone_number: user.phone_number,
            assignment_start: latestAssignment.start_date,
            assignment_end: latestAssignment.end_date
          });
        }
      }
    });

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
      })),
      officers
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