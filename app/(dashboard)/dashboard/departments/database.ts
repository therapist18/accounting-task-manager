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
  id: string
  name: string
  description?: string
  isRequired: boolean
  order: number
  isVisible: boolean
  type?: string
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

export type DocumentExtraction = {
  fieldName: string
  fieldType: 'text' | 'date' | 'number' | 'boolean'
  isRequired: boolean
  description?: string
}

export type StageDocument = {
  id: string
  name: string
  description?: string
  isRequired: boolean
  extractionSpecs?: DocumentExtraction[]
}

export type StageAllocation = {
  stage_id: string
  applicable: boolean
  display: boolean
  duration?: {
    days: number
    hours: number
    minutes: number
  }
  followUpWith?: 'Client' | 'Officer' | 'BCL' | null
  documents?: StageDocument[]
}

export type Subdepartment = {
  id: string
  name: string
  description?: string
  departmentId: string
  taskManagerId?: string
  taskAssistants: TaskAssignment[]
  classes: Class[]
  stages: StageAllocation[]
  upload_requirements?: Requirement[]
}

export type Department = {
 id: string
 name: string
 description?: string
 subdepartments: Subdepartment[]
 tm_subdepartments?: Subdepartment[]
}

// Form types
export type RequirementForm = {
 id: string
 name: string
 description: string
 isRequired: boolean
 order: number
 isVisible: boolean
 type?: string
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
     
     // Parse the requirements JSON array
     const reqArray = Array.isArray(req.requirements) ? req.requirements : []
     const parsedRequirements = reqArray.map((r: any, index: number) => ({
       id: `${req.id}_${index}`,
       name: r.name || '',
       description: r.description || '',
       isRequired: r.isRequired !== false,
       order: r.order || index,
       isVisible: r.isVisible !== false,
       type: r.type || req.type || 'standard'
     }))
     
     requirementsByClass.get(classId)?.push(...parsedRequirements)
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

       // Parse subdepartment requirements
       const uploadRequirements = (subdept.upload_requirements || []).map((req: any, index: number) => ({
         id: `subdept_${subdept.id}_${index}`,
         name: req.name || '',
         description: req.description || '',
         isRequired: req.isRequired !== false,
         order: req.order || index,
         isVisible: req.isVisible !== false,
         type: req.type || 'standard'
       }))

       return {
         ...subdept,
         classes,
         upload_requirements: uploadRequirements,
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
       subdepartments,
       tm_subdepartments: subdepartments // For compatibility
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

       // Insert class requirements if any exist
       if (cls.requirements.length > 0) {
         const requirementsArray = cls.requirements.map(req => ({
           name: req.name,
           description: req.description,
           isRequired: req.isRequired,
           order: req.order,
           isVisible: req.isVisible,
           type: 'standard'
         }))

         const { error: reqError } = await supabase
           .from('tm_class_requirements')
           .insert({
             class_id: classId,
             requirements: requirementsArray,
             type: 'class',
             is_mandatory: true
           })

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

         // Insert sub-class requirements if any exist
         if (subCls.requirements.length > 0) {
           const subRequirementsArray = subCls.requirements.map(req => ({
             name: req.name,
             description: req.description,
             isRequired: req.isRequired,
             order: req.order,
             isVisible: req.isVisible,
             type: 'standard'
           }))

           const { error: subReqError } = await supabase
             .from('tm_class_requirements')
             .insert({
               class_id: subClassId,
               requirements: subRequirementsArray,
               type: 'subclass',
               is_mandatory: true
             })

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

// Helper function to save class requirements (deletes existing and creates new)
export async function saveClassRequirements(classId: string, requirements: RequirementForm[], type: 'class' | 'subclass' = 'class'): Promise<void> {
  try {
    // Delete existing requirements for this class
    await supabase
      .from('tm_class_requirements')
      .delete()
      .eq('class_id', classId)

    // Insert new requirements if any exist
    if (requirements.length > 0) {
      const requirementsArray = requirements.map(req => ({
        id: req.id, // Preserve the ID if it exists
        name: req.name,
        description: req.description || null,
        isRequired: req.isRequired,
        order: req.order,
        isVisible: req.isVisible,
        type: req.type || 'standard'
      }))

      const { error } = await supabase
        .from('tm_class_requirements')
        .insert({
          class_id: classId,
          requirements: requirementsArray,
          type,
          is_mandatory: true
        })

      if (error) throw error
    }
  } catch (error) {
    console.error('Error saving class requirements:', error)
    throw error
  }
}

// Helper function to update class requirements while preserving IDs
export async function updateClassRequirements(classId: string, requirements: RequirementForm[], type: 'class' | 'subclass' = 'class'): Promise<void> {
  try {
    // First, get the existing requirements to preserve IDs
    const { data: existingData, error: fetchError } = await supabase
      .from('tm_class_requirements')
      .select('*')
      .eq('class_id', classId)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw fetchError
    }

    // Prepare the requirements array with preserved IDs
    const requirementsArray = requirements.map((req, index) => {
      // Try to find a matching requirement by name to preserve the ID
      const existingReq = existingData?.requirements?.find((r: any) => r.name === req.name) || {}
      
      return {
        id: req.id || existingReq.id || `req_${Date.now()}_${index}`, // Use existing ID if available, or generate a new one
        name: req.name,
        description: req.description || null,
        isRequired: req.isRequired,
        order: req.order,
        isVisible: req.isVisible,
        type: req.type || 'standard'
      }
    })

    // Upsert the requirements (update if exists, insert if not)
    const { error: upsertError } = await supabase
      .from('tm_class_requirements')
      .upsert({
        class_id: classId,
        requirements: requirementsArray,
        type,
        is_mandatory: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'class_id',
        ignoreDuplicates: false
      })

    if (upsertError) throw upsertError
  } catch (error) {
    console.error('Error updating class requirements:', error)
    throw error
  }
}

// Helper function to save subdepartment requirements
export async function saveSubdepartmentRequirements(subdepartmentId: string, requirements: RequirementForm[]): Promise<void> {
 try {
   const requirementsArray = requirements.map(req => ({
     name: req.name,
     description: req.description || null,
     isRequired: req.isRequired,
     order: req.order,
     isVisible: req.isVisible,
     type: req.type || 'standard'
   }))

   const { error } = await supabase
     .from('tm_subdepartments')
     .update({ upload_requirements: requirementsArray })
     .eq('id', subdepartmentId)

   if (error) throw error
 } catch (error) {
   console.error('Error saving subdepartment requirements:', error)
   throw error
 }
}