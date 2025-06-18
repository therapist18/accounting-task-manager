// @ts-nocheck
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

export interface TaskManagerAssistant {
  id: string;
  name: string | null;
  email: string | null;
  phone_number?: string | null;
  start_date?: string;
  end_date?: string | null;
}

export interface DepartmentWithSubdepartments extends Department {
  subdepartments: (Subdepartment & {
    task_manager?: TaskManagerAssistant | null;
    task_assistant?: TaskManagerAssistant | null;
    classes?: Array<{
      name: string;
      description: string | null;
      requirements: Array<{
        name: string;
        description: string | null;
        is_required?: boolean;
      }>;
    }>;
  })[];
  officers: Officer[];
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
    
    const usersMap = new Map(allUsers?.map(user => [user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role
    }]) || []);
    
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
        }).filter(Boolean) as Stage[];

        // Get user data for task manager and task assistant
        let taskManager: TaskManagerAssistant | null = null;
        if (subdept.task_manager?.id) {
          const managerUser = usersMap.get(subdept.task_manager.id);
          if (managerUser) {
            taskManager = {
              id: managerUser.id,
              name: managerUser.name,
              email: managerUser.email,
              phone_number: managerUser.phone_number,
              start_date: subdept.task_manager.start_date,
              end_date: subdept.task_manager.end_date
            };
          }
        }

        let taskAssistant: TaskManagerAssistant | null = null;
        if (subdept.task_assistant?.id) {
          const assistantUser = usersMap.get(subdept.task_assistant.id);
          if (assistantUser) {
            taskAssistant = {
              id: assistantUser.id,
              name: assistantUser.name,
              email: assistantUser.email,
              phone_number: assistantUser.phone_number,
              start_date: subdept.task_assistant.start_date,
              end_date: subdept.task_assistant.end_date
            };
          }
        }

        return {
          ...subdept,
          stages,
          taskManager: taskManager ? {
            id: taskManager.id,
            name: taskManager.name,
            email: taskManager.email,
            phone_number: taskManager.phone_number,
            start_date: taskManager.start_date,
            end_date: taskManager.end_date
          } : undefined,
          taskAssistant: taskAssistant ? {
            id: taskAssistant.id,
            name: taskAssistant.name,
            email: taskAssistant.email,
            phone_number: taskAssistant.phone_number,
            start_date: taskAssistant.start_date,
            end_date: taskAssistant.end_date
          } : undefined,
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
      // Insert subdepartment with stages as JSONB
      const { data: subdepartment, error: subdeptError } = await supabase
        .from('tm_subdepartments')
        .insert({
          name: subdept.name,
          description: subdept.description,
          department_id: department.id,
          classes: subdept.classes || [],
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

export interface DepartmentWithDetails extends Department {
  subdepartments: (Subdepartment & {
    taskManager?: User | null
    taskAssistant?: User | null
    classes: Array<{
      id: string
      name: string
      description: string | null
      requirements: Array<{
        id: string
        name: string
        description: string | null
        is_required: boolean
      }>
    }>
  })[]
}

export async function fetchDepartmentsWithDetails(): Promise<DepartmentWithDetails[]> {
  try {
    // 1. Fetch all departments with their basic info
    const { data: departments, error: deptError } = await supabase
      .from('tm_departments')
      .select('*')
      .order('name', { ascending: true })

    if (deptError) throw deptError
    if (!departments) return []

    // 2. Fetch all subdepartments with their classes
    const { data: subdepartments, error: subdeptError } = await supabase
      .from('tm_subdepartments')
      .select(`
        *,
        tm_subdepartment_classes(
          *,
          requirements:tm_class_requirements(*)
        )
      `)

    if (subdeptError) throw subdeptError

    // 3. Fetch all users for task managers and assistants
    const { data: users, error: usersError } = await supabase
      .from('tm_users')
      .select('id, name, email, role')

    if (usersError) throw usersError

    // Create maps for quick lookups
    const usersMap = new Map(users?.map(user => [user.id, user]))
    const subdeptsByDeptId = new Map<string, any[]>()
    
    // Group subdepartments by department ID
    subdepartments?.forEach(subdept => {
      const deptId = subdept.department_id
      if (!subdeptsByDeptId.has(deptId)) {
        subdeptsByDeptId.set(deptId, [])
      }
      subdeptsByDeptId.get(deptId)?.push(subdept)
    })

    // 4. Process each department and enrich with subdepartments and users
    const result = await Promise.all(departments.map(async dept => {
      const deptSubdepartments = subdeptsByDeptId.get(dept.id) || []
      
      // Process each subdepartment to add user details
      const enrichedSubdepts = await Promise.all(deptSubdepartments.map(async subdept => {
        const taskManager = subdept.task_manager_id ? usersMap.get(subdept.task_manager_id) : null
        const taskAssistant = subdept.task_assistant_id ? usersMap.get(subdept.task_assistant_id) : null
        
        // Format classes with their requirements
        const classes = (subdept.tm_subdepartment_classes || []).map(cls => ({
          id: cls.id,
          name: cls.name,
          description: cls.description,
          requirements: cls.requirements || []
        }))

        return {
          ...subdept,
          taskManager,
          taskAssistant,
          classes,
          // Remove the joined tables we don't need in the final output
          tm_subdepartment_classes: undefined
        }
      }))

      // Get officers for this department
      const { data: officers, error: officersError } = await supabase
        .from('tm_users')
        .select('id, name, email, phone_number, department_history')
        .eq('role', 'officer')
        .contains('department_history', [{ department_id: dept.id, end_date: null }])

      if (officersError) {
        console.error(`Error fetching officers for department ${dept.id}:`, officersError)
      }

      return {
        ...dept,
        subdepartments: enrichedSubdepts,
        officers: officers?.map(officer => ({
          id: officer.id,
          name: officer.name,
          email: officer.email,
          phone_number: officer.phone_number,
          assignment_start: '', // These would need to be extracted from department_history
          assignment_end: null
        })) || []
      }
    }))


    return result
  } catch (error) {
    console.error('Error in fetchDepartmentsWithDetails:', error)
    throw new Error('Failed to fetch departments with details')
  }
}