// @ts-nocheck
import supabase from '@/lib/supabase/client'

// Helper function to generate sequential requirement IDs
const generateRequirementId = (existingRequirements: any[] = []): string => {
  if (existingRequirements.length === 0) {
    return '1';
  }
  
  // Find the highest existing ID
  const maxId = existingRequirements.reduce((max, req) => {
    const id = parseInt(req.id, 10);
    return isNaN(id) ? max : Math.max(max, id);
  }, 0);
  
  return (maxId + 1).toString();
}

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
  id: string;
  fieldName: string;
  description?: string;
  isRequired: boolean;
  fieldType: 'text' | 'date' | 'number' | 'email' | 'phone';
}

export type StageDocument = {
  id: string;
  name: string;
  description?: string;
  isRequired: boolean;
  documentType: 'upload' | 'extraction' | 'both';
  inputType: 'file' | 'message' | 'both'; // New field
  extractionSpecs?: DocumentExtraction[];
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

export async function createDepartment(departmentData: any): Promise<Department> {
  try {
    // Get the next order number for departments
    const { data: maxOrderData } = await supabase
      .from('tm_departments')
      .select('order')
      .order('order', { ascending: false })
      .limit(1)

    const nextOrder = (maxOrderData?.[0]?.order || 0) + 1

    // Create department with order
    const { data: department, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentData.name,
        description: departmentData.description,
        order: nextOrder
      })
      .select()
      .single()

    if (deptError) throw deptError
    if (!department) throw new Error('Failed to create department')

    // Process subdepartments with ordering
    for (const [index, subdept] of departmentData.subdepartments.entries()) {
      const subdeptOrder = index + 1

      // Prepare classes for storage
      const classesForStorage = subdept.classes.map((cls, clsIndex) => ({
        id: cls.id,
        name: cls.name,
        description: cls.description,
        order: clsIndex + 1,
        isVisible: cls.isVisible,
        subClasses: cls.subClasses.map((subCls, subClsIndex) => ({
          id: subCls.id,
          name: subCls.name,
          description: subCls.description,
          order: subClsIndex + 1,
          isVisible: subCls.isVisible
        }))
      }))

      const subdeptData = {
        name: subdept.name,
        description: subdept.description,
        department_id: department.id,
        order: subdeptOrder,
        classes: classesForStorage,
        task_manager: subdept.task_manager,
        task_assistant: subdept.task_assistants
      }

      // Create or update subdepartment
      let subdepartmentId: string
      if (subdept.id) {
        const { data: updatedSubdept, error: updateError } = await supabase
          .from('tm_subdepartments')
          .update(subdeptData)
          .eq('id', subdept.id)
          .select()
          .single()

        if (updateError) throw updateError
        subdepartmentId = subdept.id
      } else {
        const { data: newSubdept, error: insertError } = await supabase
          .from('tm_subdepartments')
          .insert(subdeptData)
          .select()
          .single()

        if (insertError) throw insertError
        subdepartmentId = newSubdept.id
      }

      // Save requirements with proper ordering
      for (const [clsIndex, cls] of subdept.classes.entries()) {
        const classId = `${subdepartmentId}_${cls.id}`

        // Delete existing requirements
        await supabase
          .from('tm_class_requirements')
          .delete()
          .eq('class_id', classId)

        // Insert class requirements with ordering
        if (cls.requirements.length > 0) {
          const requirementsArray = cls.requirements.map((req, reqIndex) => ({
            name: req.name,
            description: req.description,
            isRequired: req.isRequired,
            order: reqIndex + 1,
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

        // Handle sub-class requirements with ordering
        for (const [subClsIndex, subCls] of cls.subClasses.entries()) {
          const subClassId = `${classId}_${subCls.id}`

          await supabase
            .from('tm_class_requirements')
            .delete()
            .eq('class_id', subClassId)

          if (subCls.requirements.length > 0) {
            const subRequirementsArray = subCls.requirements.map((req, reqIndex) => ({
              name: req.name,
              description: req.description,
              isRequired: req.isRequired,
              order: reqIndex + 1,
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

    return await fetchDepartmentById(department.id)
  } catch (error) {
    console.error('Error in createDepartment:', error)
    throw error
  }
}

// Enhanced fetchDepartments with proper ordering
export async function fetchDepartments(): Promise<Department[]> {
  try {
    const { data: departmentsData, error: deptError } = await supabase
      .from('tm_departments')
      .select(`
        *,
        tm_subdepartments (*)
      `)
      .order('order', { ascending: true })

    if (deptError) throw deptError

    // Process and order the data
    const processedData = (departmentsData || []).map((dept: any) => {
      const subdepartments = (dept.tm_subdepartments || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((subdept: any) => {
          // Process classes with ordering
          const classes = (subdept.classes || [])
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((cls: any) => ({
              ...cls,
              subdepartmentId: subdept.id,
              subClasses: (cls.subClasses || []).sort((a, b) => (a.order || 0) - (b.order || 0))
            }))

          // Process task assistants
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
        subdepartments,
        tm_subdepartments: subdepartments
      }
    })

    return processedData
  } catch (error) {
    console.error('Error fetching departments:', error)
    throw new Error('Failed to fetch departments')
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
      const requirementsArray = requirements.map((req, index) => {
        // Generate ID based on existing requirements and current index
        const newId = req.id || generateRequirementId(
          requirements.slice(0, index).filter(r => r.id)
        );
        
        return {
          id: newId,
          name: req.name,
          description: req.description || null,
          isRequired: req.isRequired,
          order: req.order,
          isVisible: req.isVisible,
          type: req.type || 'standard'
        };
      })

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
      const existingReq = existingData?.requirements?.find((r: any) => r.name === req.name) || {};
      const existingReqs = existingData?.requirements || [];
      
      // Generate ID based on existing requirements and current index
      const newId = req.id || existingReq.id || generateRequirementId(
        [...existingReqs, ...requirements.slice(0, index).filter(r => r.id)]
      );

      return {
        id: newId,
        name: req.name,
        description: req.description || null,
        isRequired: req.isRequired,
        order: req.order,
        isVisible: req.isVisible,
        type: req.type || 'standard'
      };
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
    // Get existing requirements to ensure sequential IDs
    const { data: existingData } = await supabase
      .from('tm_subdepartments')
      .select('upload_requirements')
      .eq('id', subdepartmentId)
      .single();
      
    const existingReqs = existingData?.upload_requirements || [];
    
    const requirementsArray = requirements.map((req, index) => {
      // Generate ID based on existing requirements and current index
      const newId = req.id || generateRequirementId([
        ...existingReqs,
        ...requirements.slice(0, index).filter(r => r.id)
      ]);
      
      return {
        id: newId,
        name: req.name,
        description: req.description || null,
        isRequired: req.isRequired,
        order: req.order,
        isVisible: req.isVisible,
        type: req.type || 'standard'
      };
    })

    const { error } = await supabase
      .from('tm_subdepartments')
      .update({ upload_requirements: requirementsArray })
      .eq('id', subdepartmentId)

    if (error) throw error;
  } catch (error) {
    console.error('Error saving subdepartment requirements:', error);
    throw error;
  }
};