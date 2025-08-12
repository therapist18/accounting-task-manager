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

// History types for tracking assignments
export type OfficerHistory = {
  id: string
  start_date: string
  end_date?: string
}

export type ManagerHistory = {
  id: string
  start_date: string
  end_date?: string
}

export type AssistantHistory = {
  id: string
  start_date: string
  end_date?: string
  manager_id?: string
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
  default_display?: boolean
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
  default_display?: boolean
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
  inputType: 'file' | 'message' | 'both';
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
  default_display?: boolean
  order?: number
  // History tracking for managers and assistants
  manager_history?: ManagerHistory[]
  assistant_history?: AssistantHistory[]
}

export type Department = {
  id: string
  name: string
  description?: string
  subdepartments: Subdepartment[]
  tm_subdepartments?: Subdepartment[]
  default_display?: boolean
  order?: number
  // Officers are at department level
  officers_history?: OfficerHistory[]
  currentOfficerId?: string
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
  default_display?: boolean
}

export type ClassForm = {
  id: number
  name: string
  description: string
  order: number
  isVisible: boolean
  requirements: RequirementForm[]
  subClasses: SubClassForm[]
  default_display?: boolean
}

export type SubdepartmentForm = {
  id?: string
  name: string
  description: string
  classes: ClassForm[]
  taskManagerId: string
  taskAssistantIds: string[]
  officerId?: string  // This field is crucial
  default_display?: boolean
  stages: {
    [key: string]: {
      applies: boolean
      estimatedTime: number
      reminderDays: number
    }
  }
}

export type DepartmentForm = {
  name: string
  description: string
  default_display: boolean
  subdepartments: SubdepartmentForm[]
  officerId: string // This should be required
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

export async function fetchOfficers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .select('id, name, email, role')
      .eq('role', 'officer')
      .order('name')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching officers:', error)
    throw new Error('Failed to fetch officers')
  }
}

// Helper function to get current officer from officers_history
export function getCurrentOfficer(officers_history: OfficerHistory[]): OfficerHistory | null {
  if (!officers_history || officers_history.length === 0) return null
  
  // Find officer without end_date (current) or with the latest start_date
  const currentOfficer = officers_history.find(officer => !officer.end_date)
  if (currentOfficer) return currentOfficer
  
  // If no current officer, return the one with latest start_date
  return officers_history.reduce((latest, officer) => 
    new Date(officer.start_date) > new Date(latest.start_date) ? officer : latest
  )
}

// Helper function to get current manager from manager_history
export function getCurrentManager(manager_history: ManagerHistory[] | undefined | null): ManagerHistory | null {
  // Ensure manager_history is an array
  const history = Array.isArray(manager_history) ? manager_history : [];
  
  if (history.length === 0) return null;
  
  const currentManager = history.find(manager => manager && !manager.end_date);
  if (currentManager) return currentManager;
  
  // Safely handle the case where start_date might be missing or invalid
  return history.reduce((latest, manager) => {
    if (!manager || !manager.start_date) return latest || null;
    if (!latest) return manager;
    return new Date(manager.start_date) > new Date(latest.start_date) ? manager : latest;
  }, null as ManagerHistory | null);
}

// Helper function to get current assistants from assistant_history
export function getCurrentAssistants(assistant_history: AssistantHistory[] = [], manager_id?: string): AssistantHistory[] {
  if (!assistant_history || !Array.isArray(assistant_history)) return [];
  return assistant_history.filter(assistant => 
    !assistant.end_date && 
    (!manager_id || assistant.manager_id === manager_id)
  );
}

// Helper function to assign officer to department
export async function assignOfficerToDepartment(departmentId: string, officerId: string): Promise<void> {
  try {
    // Get current officers_history
    const { data: dept, error: fetchError } = await supabase
      .from('tm_departments')
      .select('officers_history')
      .eq('id', departmentId)
      .single()

    if (fetchError) throw fetchError

    const officers_history = dept?.officers_history || []
    
    // End current officer assignments
    const updatedHistory = officers_history.map(officer => 
      !officer.end_date ? { ...officer, end_date: new Date().toISOString() } : officer
    )
    
    // Add new officer
    updatedHistory.push({
      id: officerId,
      start_date: new Date().toISOString()
    })

    // Update department
    const { error: updateError } = await supabase
      .from('tm_departments')
      .update({ officers_history: updatedHistory })
      .eq('id', departmentId)

    if (updateError) throw updateError
  } catch (error) {
    console.error('Error assigning officer to department:', error)
    throw error
  }
}

// Helper function to assign manager to subdepartment
export async function assignManagerToSubdepartment(subdepartmentId: string, managerId: string): Promise<void> {
  try {
    // Get current manager_history
    const { data: subdept, error: fetchError } = await supabase
      .from('tm_subdepartments')
      .select('manager_history')
      .eq('id', subdepartmentId)
      .single()

    if (fetchError) throw fetchError

    const manager_history = subdept?.manager_history || []
    
    // End current manager assignments
    const updatedHistory = manager_history.map(manager => 
      !manager.end_date ? { ...manager, end_date: new Date().toISOString() } : manager
    )
    
    // Add new manager
    if (managerId) {
      updatedHistory.push({
        id: managerId,
        start_date: new Date().toISOString()
      })
    }

    // Update subdepartment
    const { error: updateError } = await supabase
      .from('tm_subdepartments')
      .update({ 
        manager_history: updatedHistory,
        task_manager: managerId || null
      })
      .eq('id', subdepartmentId)

    if (updateError) throw updateError
  } catch (error) {
    console.error('Error assigning manager to subdepartment:', error)
    throw error
  }
}

// Helper function to assign assistants to subdepartment
export async function assignAssistantsToSubdepartment(subdepartmentId: string, assistantIds: string[], managerId?: string): Promise<void> {
  try {
    // Get current assistant_history
    const { data: subdept, error: fetchError } = await supabase
      .from('tm_subdepartments')
      .select('assistant_history')
      .eq('id', subdepartmentId)
      .single()

    if (fetchError) throw fetchError

    const assistant_history = subdept?.assistant_history || []
    
    // End current assistant assignments
    const updatedHistory = assistant_history.map(assistant => 
      !assistant.end_date ? { ...assistant, end_date: new Date().toISOString() } : assistant
    )
    
    // Add new assistants with manager_id if provided
    assistantIds.filter(id => id).forEach(assistantId => {
      const newAssistant: AssistantHistory = {
        id: assistantId,
        start_date: new Date().toISOString()
      };
      
      // Only add manager_id if it's provided
      if (managerId) {
        newAssistant.manager_id = managerId;
      }
      
      updatedHistory.push(newAssistant);
    })

    // Update subdepartment
    const { error: updateError } = await supabase
      .from('tm_subdepartments')
      .update({ 
        assistant_history: updatedHistory,
        task_assistant: assistantIds.filter(id => id)
      })
      .eq('id', subdepartmentId)

    if (updateError) throw updateError
  } catch (error) {
    console.error('Error assigning assistants to subdepartment:', error)
    throw error
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

    // Prepare officers_history if officer is assigned
    const officers_history = departmentData.officerId ? [{
      id: departmentData.officerId,
      start_date: new Date().toISOString()
    }] : []

    // Create department with order, default_display, and officers_history
    const { data: department, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentData.name,
        description: departmentData.description,
        order: nextOrder,
        default_display: departmentData.default_display || true,
        officers_history
      })
      .select()
      .single()

    if (deptError) throw deptError
    if (!department) throw new Error('Failed to create department')

    // Process subdepartments with ordering and default display
    for (const [index, subdept] of departmentData.subdepartments.entries()) {
      const subdeptOrder = index + 1

      // Prepare classes for storage with default_display
      const classesForStorage = subdept.classes.map((cls, clsIndex) => ({
        id: cls.id,
        name: cls.name,
        description: cls.description,
        order: clsIndex + 1,
        isVisible: cls.isVisible,
        default_display: cls.default_display || true,
        subClasses: cls.subClasses.map((subCls, subClsIndex) => ({
          id: subCls.id,
          name: subCls.name,
          description: subCls.description,
          order: subClsIndex + 1,
          isVisible: subCls.isVisible,
          default_display: subCls.default_display || true
        }))
      }))

      // Prepare manager_history and assistant_history
      const manager_history = subdept.taskManagerId ? [{
        id: subdept.taskManagerId,
        start_date: new Date().toISOString()
      }] : []

      const assistant_history = subdept.taskAssistantIds
        .filter(id => id)
        .map(id => ({
          id,
          start_date: new Date().toISOString()
        }))

      const subdeptData = {
        name: subdept.name,
        description: subdept.description,
        department_id: department.id,
        order: subdeptOrder,
        default_display: subdept.default_display || true,
        classes: classesForStorage,
        task_manager: subdept.taskManagerId,
        task_assistant: subdept.taskAssistantIds.filter(id => id),
        manager_history,
        assistant_history
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

// Enhanced fetchDepartments with proper ordering and default display
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
          // Process classes with ordering and default display
          const classes = (subdept.classes || [])
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((cls: any) => ({
              ...cls,
              subdepartmentId: subdept.id,
              default_display: cls.default_display || false,
              subClasses: (cls.subClasses || [])
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((subCls: any) => ({
                  ...subCls,
                  default_display: subCls.default_display || false
                }))
            }))

          // Process task assistants (backward compatibility)
          const taskAssistants = Array.isArray(subdept.task_assistant)
            ? subdept.task_assistant
            : subdept.task_assistant
              ? [subdept.task_assistant]
              : []

          return {
            ...subdept,
            classes,
            default_display: subdept.default_display || false,
            taskAssistants: taskAssistants.map((ta: any) => ({
              id: ta.id || `ta_${Date.now()}`,
              userId: ta.userId || ta.id,
              startDate: ta.startDate || ta.start_date || new Date().toISOString(),
              endDate: ta.endDate || ta.end_date,
              isActive: ta.isActive !== false
            })),
            taskManagerId: subdept.task_manager?.id || subdept.task_manager_id || subdept.task_manager,
            // Add history fields
            manager_history: subdept.manager_history || [],
            assistant_history: subdept.assistant_history || []
          }
        })

      // Get current officer from officers_history
      const currentOfficer = getCurrentOfficer(dept.officers_history || [])

      return {
        ...dept,
        default_display: dept.default_display || false,
        subdepartments,
        tm_subdepartments: subdepartments,
        officers_history: dept.officers_history || [],
        currentOfficerId: currentOfficer?.id
      }
    })

    return processedData
  } catch (error) {
    console.error('Error fetching departments:', error)
    throw new Error('Failed to fetch departments')
  }
}

export async function saveOrderAndDefaultDisplay(departments: Department[]): Promise<void> {
  try {
    // Prepare department updates with order and default_display
    const deptUpdates = departments.map((dept, index) => ({
      id: dept.id,
      order: index + 1,
      default_display: dept.default_display || false
    }))

    // Prepare subdepartment updates with order and default_display
    const subdeptUpdates = departments.flatMap(dept => 
      (dept.tm_subdepartments || []).map((subdept, index) => ({
        id: subdept.id,
        order: index + 1,
        default_display: subdept.default_display || false,
        officer_history: subdept.officer_history || [], // ⭐ FIXED: Include officer_history
        manager_history: subdept.manager_history || [],
        assistant_history: subdept.assistant_history || [],
        // Update classes JSON with default_display
        classes: (subdept.classes || []).map((cls, clsIndex) => ({
          ...cls,
          order: clsIndex + 1,
          default_display: cls.default_display || false,
          subClasses: (cls.subClasses || []).map((subCls, subClsIndex) => ({
            ...subCls,
            order: subClsIndex + 1,
            default_display: subCls.default_display || false
          }))
        }))
      }))
    )

    // Update departments
    const { error: deptError } = await supabase
      .from('tm_departments')
      .upsert(deptUpdates)

    if (deptError) throw deptError

    // Update subdepartments
    const { error: subdeptError } = await supabase
      .from('tm_subdepartments')
      .upsert(subdeptUpdates)

    if (subdeptError) throw subdeptError

  } catch (error) {
    console.error('Error saving order and default display:', error)
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
export async function saveClassRequirements(subdepartmentId: string, classes: ClassForm[]): Promise<void> {
  try {
    console.log('Saving class requirements for subdepartment:', subdepartmentId);
    console.log('Classes to save:', JSON.stringify(classes, null, 2));

    for (const [clsIndex, cls] of classes.entries()) {
      // Ensure class ID is properly formatted as a string
      const classId = cls.id ? `${subdepartmentId}_${cls.id}` : `${subdepartmentId}_new_${clsIndex}`;
      console.log(`Processing class ${clsIndex}:`, { className: cls.name, classId });

      // Delete existing requirements for this class
      const { error: deleteError } = await supabase
        .from('tm_class_requirements')
        .delete()
        .eq('class_id', classId);

      if (deleteError) {
        console.error('Error deleting existing class requirements:', deleteError);
        throw deleteError;
      }

      // Insert class requirements if any exist
      if (cls.requirements && cls.requirements.length > 0) {
        console.log(`Saving ${cls.requirements.length} requirements for class ${cls.name}`);
        
        const requirementsArray = cls.requirements.map((req, reqIndex) => {
          const newId = req.id || generateRequirementId(
            cls.requirements.slice(0, reqIndex).filter(r => r.id)
          );
          
          return {
            id: newId,
            name: req.name,
            description: req.description || null,
            isRequired: req.isRequired,
            order: req.order || reqIndex + 1,
            isVisible: req.isVisible,
            type: req.type || 'standard'
          };
        });

        const { data, error } = await supabase
          .from('tm_class_requirements')
          .insert({
            class_id: classId,
            requirements: requirementsArray,
            type: 'class',
            is_mandatory: true,
            subdepartment_id: subdepartmentId,
            class_name: cls.name,
            class_description: cls.description || ''
          })
          .select();

        if (error) {
          console.error('Error inserting class requirements:', error);
          throw error;
        }
        console.log('Successfully saved class requirements:', data);
      } else {
        console.log(`No requirements to save for class ${cls.name}`);
      }

      // Handle sub-class requirements
      if (cls.subClasses && cls.subClasses.length > 0) {
        console.log(`Processing ${cls.subClasses.length} subclasses for class ${cls.name}`);
        
        for (const [subClsIndex, subCls] of cls.subClasses.entries()) {
          const subClassId = subCls.id ? `${classId}_${subCls.id}` : `${classId}_sub_${subClsIndex}`;
          console.log(`  Processing subclass ${subClsIndex}:`, { subClassName: subCls.name, subClassId });

          // Delete existing requirements for this subclass
          const { error: deleteSubclassError } = await supabase
            .from('tm_class_requirements')
            .delete()
            .eq('class_id', subClassId);

          if (deleteSubclassError) {
            console.error('Error deleting existing subclass requirements:', deleteSubclassError);
            throw deleteSubclassError;
          }

          if (subCls.requirements && subCls.requirements.length > 0) {
            console.log(`  Saving ${subCls.requirements.length} requirements for subclass ${subCls.name}`);
            
            const subRequirementsArray = subCls.requirements.map((req, reqIndex) => {
              const newId = req.id || generateRequirementId(
                subCls.requirements.slice(0, reqIndex).filter(r => r.id)
              );
              
              return {
                id: newId,
                name: req.name,
                description: req.description || null,
                isRequired: req.isRequired,
                order: req.order || reqIndex + 1,
                isVisible: req.isVisible,
                type: req.type || 'standard'
              };
            });

            const { error: subReqError } = await supabase
              .from('tm_class_requirements')
              .insert({
                class_id: subClassId,
                requirements: subRequirementsArray,
                type: 'subclass',
                is_mandatory: true,
                subdepartment_id: subdepartmentId,
                parent_class_id: classId,
                class_name: subCls.name,
                class_description: subCls.description || ''
              });

            if (subReqError) {
              console.error('Error inserting subclass requirements:', subReqError);
              throw subReqError;
            }
            console.log('  Successfully saved subclass requirements');
          } else {
            console.log(`  No requirements to save for subclass ${subCls.name}`);
          }
        }
      } else {
        console.log(`No subclasses to process for class ${cls.name}`);
      }
    }
    
    console.log('Successfully saved all class requirements');
  } catch (error) {
    console.error('Error in saveClassRequirements:', {
      error,
      subdepartmentId,
      errorMessage: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Helper function to update class requirements while preserving IDs
export async function updateClassRequirements(subdepartmentId: string, classes: ClassForm[]): Promise<void> {
  try {
    await saveClassRequirements(subdepartmentId, classes)
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
}
export async function removeOfficerFromDepartment(departmentId: string): Promise<void> {
  try {
    // Get current officers_history
    const { data: dept, error: fetchError } = await supabase
      .from('tm_departments')
      .select('officers_history')
      .eq('id', departmentId)
      .single()

    if (fetchError) throw fetchError

    const officers_history = dept?.officers_history || []
    
    // End current officer assignments
    const updatedHistory = officers_history.map(officer => 
      !officer.end_date ? { ...officer, end_date: new Date().toISOString() } : officer
    )

    // Update department
    const { error: updateError } = await supabase
      .from('tm_departments')
      .update({ officers_history: updatedHistory })
      .eq('id', departmentId)

    if (updateError) throw updateError
  } catch (error) {
    console.error('Error removing officer from department:', error)
    throw error
  }
}

// Utility function to remove manager from subdepartment
export async function removeManagerFromSubdepartment(subdepartmentId: string): Promise<void> {
  try {
    // Get current manager_history
    const { data: subdept, error: fetchError } = await supabase
      .from('tm_subdepartments')
      .select('manager_history')
      .eq('id', subdepartmentId)
      .single()

    if (fetchError) throw fetchError

    const manager_history = subdept?.manager_history || []
    
    // End current manager assignments
    const updatedHistory = manager_history.map(manager => 
      !manager.end_date ? { ...manager, end_date: new Date().toISOString() } : manager
    )

    // Update subdepartment
    const { error: updateError } = await supabase
      .from('tm_subdepartments')
      .update({ 
        manager_history: updatedHistory,
        task_manager: null
      })
      .eq('id', subdepartmentId)

    if (updateError) throw updateError
  } catch (error) {
    console.error('Error removing manager from subdepartment:', error)
    throw error
  }
}

// Utility function to remove all assistants from subdepartment
export async function removeAllAssistantsFromSubdepartment(subdepartmentId: string): Promise<void> {
  try {
    // Get current assistant_history
    const { data: subdept, error: fetchError } = await supabase
      .from('tm_subdepartments')
      .select('assistant_history')
      .eq('id', subdepartmentId)
      .single()

    if (fetchError) throw fetchError

    const assistant_history = subdept?.assistant_history || []
    
    // End current assistant assignments
    const updatedHistory = assistant_history.map(assistant => 
      !assistant.end_date ? { ...assistant, end_date: new Date().toISOString() } : assistant
    )

    // Update subdepartment
    const { error: updateError } = await supabase
      .from('tm_subdepartments')
      .update({ 
        assistant_history: updatedHistory,
        task_assistant: []
      })
      .eq('id', subdepartmentId)

    if (updateError) throw updateError
  } catch (error) {
    console.error('Error removing assistants from subdepartment:', error)
    throw error
  }
}