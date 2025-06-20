// @ts-nocheck
import supabase from '@/lib/supabase/client'

// Updated Types
export type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'task_manager' | 'task_assistant' | 'officer' | string
}

export type Requirement = {
  id: number
  classId: string
  name: string
  description?: string
  isRequired: boolean
  order: number
  isVisible: boolean
}

export type SubClass = {
  id: number
  name: string
  description?: string
  order: number
  isVisible: boolean
  parentClassId: string
  requirements: Requirement[]
}

export type Class = {
  id: number
  name: string
  description?: string
  order: number
  isVisible: boolean
  subdepartmentId: string
  requirements: Requirement[]
  subClasses: SubClass[]
}

export type TaskAssignment = {
  id: string
  userId: string
  startDate: string
  endDate?: string
  isActive: boolean
}

export type Subdepartment = {
  id: string
  name: string
  description?: string
  departmentId: string
  taskManagerId?: string
  taskAssistants: TaskAssignment[]
  classes: Class[]
  stages: any[]
}

export type Department = {
  id: string
  name: string
  description?: string
  subdepartments: Subdepartment[]
}

// Form types
export type RequirementForm = {
  id: number
  name: string
  description: string
  isRequired: boolean
  order: number
  isVisible: boolean
}

export type SubClassForm = {
  id: number
  name: string
  description: string
  order: number
  isVisible: boolean
  requirements: RequirementForm[]
}

export type ClassForm = {
  id: number
  name: string
  description: string
  order: number
  isVisible: boolean
  requirements: RequirementForm[]
  subClasses: SubClassForm[]
}

export type SubdepartmentForm = {
  id?: string
  name: string
  description: string
  classes: ClassForm[]
  taskManagerId: string
  taskAssistantIds: string[]
  stages: {
    [key: string]: {
      applies: boolean
      estimatedTime: number
      reminderDays: number
    }
  }
}

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
    // Fetch departments with subdepartments
    const { data: departmentsData, error: deptError } = await supabase
      .from('tm_departments')
      .select(`
        *,
        tm_subdepartments (*)
      `)
      .order('name')

    if (deptError) throw deptError

    // Fetch all class requirements
    const { data: requirements, error: reqError } = await supabase
      .from('tm_class_requirements')
      .select('*')
      .order('id')

    if (reqError) throw reqError

    // Group requirements by class_id
    const requirementsByClass = new Map<string, Requirement[]>()
    requirements?.forEach(req => {
      const classId = req.class_id
      if (!requirementsByClass.has(classId)) {
        requirementsByClass.set(classId, [])
      }
      requirementsByClass.get(classId)?.push({
        id: req.id,
        classId: req.class_id,
        name: req.name?.name || '',
        description: req.name?.description || '',
        isRequired: req.name?.isRequired || false,
        order: req.name?.order || 0,
        isVisible: req.name?.isVisible !== false
      })
    })

    return (departmentsData || []).map((dept: any) => {
      const subdepartments = (dept.tm_subdepartments || []).map((subdept: any) => {
        // Parse classes from JSONB
        const classes = (subdept.classes || []).map((cls: any) => {
          const classId = `${subdept.id}_${cls.id}`
          const classRequirements = requirementsByClass.get(classId) || []
          
          // Process sub-classes
          const subClasses = (cls.subClasses || []).map((subCls: any) => {
            const subClassId = `${classId}_${subCls.id}`
            const subClassRequirements = requirementsByClass.get(subClassId) || []
            
            return {
              ...subCls,
              parentClassId: classId,
              requirements: subClassRequirements
            }
          })

          return {
            ...cls,
            subdepartmentId: subdept.id,
            requirements: classRequirements,
            subClasses
          }
        })

        // Parse task assistants
        const taskAssistants = Array.isArray(subdept.task_assistant) 
          ? subdept.task_assistant 
          : subdept.task_assistant 
            ? [subdept.task_assistant] 
            : []

        return {
          ...subdept,
          classes,
          taskAssistants: taskAssistants.map((ta: any) => ({
            id: ta.id || `ta_${Date.now()}`,
            userId: ta.userId || ta.id,
            startDate: ta.startDate || ta.start_date || new Date().toISOString(),
            endDate: ta.endDate || ta.end_date,
            isActive: ta.isActive !== false
          })),
          taskManagerId: subdept.task_manager?.id || subdept.task_manager_id
        }
      })

      return {
        ...dept,
        subdepartments
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
    id?: string
    name: string
    description: string | null
    classes: Array<{
      id: number
      name: string
      description: string | null
      order: number
      isVisible: boolean
      requirements: Array<{
        id: number
        name: string
        description: string | null
        isRequired: boolean
        order: number
        isVisible: boolean
      }>
      subClasses: Array<{
        id: number
        name: string
        description: string | null
        order: number
        isVisible: boolean
        requirements: Array<{
          id: number
          name: string
          description: string | null
          isRequired: boolean
          order: number
          isVisible: boolean
        }>
      }>
    }>
    task_manager: {
      id: string
      start_date: string
      end_date: string | null
    } | null
    task_assistants: Array<{
      id: string
      start_date: string
      end_date: string | null
    }>
  }>
}): Promise<Department> {
  try {
    // Create department
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
      // Prepare classes without requirements for JSONB storage
      const classesForStorage = subdept.classes.map(cls => ({
        id: cls.id,
        name: cls.name,
        description: cls.description,
        order: cls.order,
        isVisible: cls.isVisible,
        subClasses: cls.subClasses.map(subCls => ({
          id: subCls.id,
          name: subCls.name,
          description: subCls.description,
          order: subCls.order,
          isVisible: subCls.isVisible
        }))
      }))

      const subdeptData = {
        name: subdept.name,
        description: subdept.description,
        department_id: department.id,
        classes: classesForStorage,
        task_manager: subdept.task_manager,
        task_assistant: subdept.task_assistants
      }

      let subdepartmentId: string

      if (subdept.id) {
        // Update existing subdepartment
        const { data: updatedSubdept, error: updateError } = await supabase
          .from('tm_subdepartments')
          .update(subdeptData)
          .eq('id', subdept.id)
          .select()
          .single()

        if (updateError) throw updateError
        subdepartmentId = subdept.id
      } else {
        // Create new subdepartment
        const { data: newSubdept, error: insertError } = await supabase
          .from('tm_subdepartments')
          .insert(subdeptData)
          .select()
          .single()

        if (insertError) throw insertError
        subdepartmentId = newSubdept.id
      }

      // Save requirements to tm_class_requirements table
      for (const cls of subdept.classes) {
        const classId = `${subdepartmentId}_${cls.id}`

        // Delete existing requirements for this class
        await supabase
          .from('tm_class_requirements')
          .delete()
          .eq('class_id', classId)

        // Insert class requirements
        if (cls.requirements.length > 0) {
          const classRequirements = cls.requirements.map(req => ({
            class_id: classId,
            name: {
              name: req.name,
              description: req.description,
              isRequired: req.isRequired,
              order: req.order,
              isVisible: req.isVisible
            }
          }))

          const { error: reqError } = await supabase
            .from('tm_class_requirements')
            .insert(classRequirements)

          if (reqError) throw reqError
        }

        // Handle sub-class requirements
        for (const subCls of cls.subClasses) {
          const subClassId = `${classId}_${subCls.id}`

          // Delete existing requirements for this sub-class
          await supabase
            .from('tm_class_requirements')
            .delete()
            .eq('class_id', subClassId)

          // Insert sub-class requirements
          if (subCls.requirements.length > 0) {
            const subClassRequirements = subCls.requirements.map(req => ({
              class_id: subClassId,
              name: {
                name: req.name,
                description: req.description,
                isRequired: req.isRequired,
                order: req.order,
                isVisible: req.isVisible
              }
            }))

            const { error: subReqError } = await supabase
              .from('tm_class_requirements')
              .insert(subClassRequirements)

            if (subReqError) throw subReqError
          }
        }
      }
    }

    // Return the created department
    return await fetchDepartmentById(department.id)
  } catch (error) {
    console.error('Error in createDepartment:', error)
    throw error
  }
}

export async function fetchDepartmentById(id: string): Promise<Department> {
  try {
    const departments = await fetchDepartments()
    const department = departments.find(d => d.id === id)
    
    if (!department) {
      throw new Error('Department not found')
    }
    
    return department
  } catch (error) {
    console.error('Error fetching department by ID:', error)
    throw new Error('Failed to fetch department')
  }
}