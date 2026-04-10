// @ts-nocheck
import supabase from '@/lib/supabase/client'
import { toast } from "@/lib/hooks/use-toast"
import { fetchUserAssignmentData } from "@/lib/shared-user-assignment-service";

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

export type JobLevel = {
  id?: number; // assignment record ID
  role: "officer" | "manager" | "assistant";
  user_id: string;
  department_id: number | null;
  subdepartment_id: number | null;
  class_id: number | null;
  subclass_id: number | null;
  created_at?: string;
  level?: number; // Keep for backward compatibility
};

export type Officer = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  username?: string;
  isActive: boolean;
  roleAssignments: JobLevel[];
  createdAt: string;
  lastLogin?: string;
  name?: string;
  full_name?: string;
};

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
  specification?: string[] // Changed from string to string[]
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
  specification?: string[] // Changed from string to string[]
}

export type SubdepartmentForm = {
  id?: string
  name: string
  description: string
  classes: ClassForm[]
  taskManagerId: string
  taskAssistantIds: string[]
  officerId?: string
  default_display?: boolean
  specification?: string[] // Changed from string to string[]
  stages: any // matching your structure
}

export type DepartmentForm = {
  name: string
  description: string
  default_display: boolean
  subdepartments: SubdepartmentForm[]
  officerId: string
  officers_history?: OfficerHistory[]
  specification?: string[] // Changed from string to string[]
}

// Fetch all data in parallel for better performance
export async function fetchAllDepartmentData() {
  try {
    const [users, officers] = await Promise.all([
      fetchUsers(),
      fetchOfficers()
    ]);

    return {
      users,
      officers,
      success: true
    };
  } catch (error) {
    console.error('Error fetching department data:', error);
    toast({
      title: "Error",
      description: "Failed to load department data.",
      variant: "destructive"
    });
    return {
      users: [],
      officers: [],
      success: false
    };
  }
}

export async function fetchUsers(): Promise<User[]> {
  try {
    // Use unified user assignment service
    const userAssignmentData = await fetchUserAssignmentData({ payrollAccess: true });

    // Transform data to match expected User type
    return userAssignmentData.allUsers.map(user => ({
      id: user.id,
      name: user.displayName || user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      role: user.role
    }));
  } catch (error) {
    console.error('Error fetching users:', error)
    throw new Error('Failed to fetch users')
  }
}

export async function fetchUserRoleAssignments(userId: string): Promise<JobLevel[]> {
  try {
    const response = await fetch(`/api/auth/role-assignments?userId=${userId}`);
    const result = await response.json();

    if (!result.success) {
      console.error('Error fetching role assignments:', result.error);
      return [];
    }

    return result.data.map((assignment: any) => ({
      id: assignment.id,
      role: assignment.role as "officer" | "manager" | "assistant",
      user_id: assignment.user_id,
      department_id: assignment.department_id,
      subdepartment_id: assignment.subdepartment_id,
      class_id: assignment.class_id,
      subclass_id: assignment.subclass_id,
      created_at: assignment.created_at
    }));
  } catch (error) {
    console.error('Error fetching role assignments:', error);
    return [];
  }
}

export async function fetchOfficers(): Promise<Officer[]> {
  try {
    // Use unified user assignment service
    const userAssignmentData = await fetchUserAssignmentData({ payrollAccess: true });

    // Transform officers data to match expected Officer type
    return userAssignmentData.officers.map(officer => ({
      id: officer.id,
      firstName: officer.firstName || '',
      lastName: officer.lastName || '',
      email: officer.email,
      username: officer.username,
      isActive: officer.isActive ?? true,
      roleAssignments: officer.jobLevels || [], // Map jobLevels to roleAssignments
      createdAt: officer.createdAt || new Date().toISOString(),
      lastLogin: officer.lastLogin,
      name: `${officer.firstName} ${officer.lastName}`.trim(),
      full_name: `${officer.firstName} ${officer.lastName}`.trim(),
    }));
  } catch (error) {
    console.error('Error fetching officers:', error)
    throw new Error('Failed to fetch officers')
  }
}

export function getCurrentAssignments<T extends { start_date: string; end_date?: string }>(history: T[] | null | undefined): T[] {
  const safeHistory = Array.isArray(history) ? history.filter(Boolean) : []
  if (safeHistory.length === 0) return []

  const dedupeById = (items: T[]) => {
    const latestById = new Map<string, T>()

    items.forEach((item) => {
      const key = String((item as any).id ?? '')
      if (!key) return

      const existing = latestById.get(key)
      if (!existing || new Date(item.start_date) > new Date(existing.start_date)) {
        latestById.set(key, item)
      }
    })

    return Array.from(latestById.values())
  }

  const activeAssignments = dedupeById(safeHistory.filter((item) => !item.end_date))
  if (activeAssignments.length > 0) return activeAssignments

  return dedupeById(safeHistory)
}

// Helper function to get current officer from officers_history
export function getCurrentOfficer(officers_history: OfficerHistory[]): OfficerHistory | null {
  return getCurrentAssignments(officers_history)[0] || null
}

export function getCurrentOfficers(officers_history: OfficerHistory[] | null | undefined): OfficerHistory[] {
  return getCurrentAssignments(officers_history)
}

const normalizeEntityId = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null
  return String(value)
}

const dedupeOfficerIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)))

export function getDepartmentOfficerIds(
  officers: Officer[] | null | undefined,
  departmentId: string | number | null | undefined
): string[] {
  const normalizedDepartmentId = normalizeEntityId(departmentId)
  if (!normalizedDepartmentId) return []

  return dedupeOfficerIds(
    (officers || [])
      .filter((officer) =>
        Array.isArray(officer.roleAssignments) &&
        officer.roleAssignments.some(
          (assignment) => normalizeEntityId(assignment.department_id) === normalizedDepartmentId
        )
      )
      .map((officer) => officer.id)
  )
}

export function getDepartmentOfficers(
  officers: Officer[] | null | undefined,
  departmentId: string | number | null | undefined
): Officer[] {
  const officerIds = new Set(getDepartmentOfficerIds(officers, departmentId))
  return (officers || []).filter((officer) => officerIds.has(officer.id))
}

export function getSubdepartmentOfficerIds(
  officers: Officer[] | null | undefined,
  departmentId: string | number | null | undefined,
  subdepartmentId: string | number | null | undefined
): string[] {
  const normalizedDepartmentId = normalizeEntityId(departmentId)
  const normalizedSubdepartmentId = normalizeEntityId(subdepartmentId)

  if (!normalizedSubdepartmentId) return []

  const directOfficerIds = dedupeOfficerIds(
    (officers || [])
      .filter((officer) =>
        Array.isArray(officer.roleAssignments) &&
        officer.roleAssignments.some(
          (assignment) => normalizeEntityId(assignment.subdepartment_id) === normalizedSubdepartmentId
        )
      )
      .map((officer) => officer.id)
  )

  if (directOfficerIds.length > 0) return directOfficerIds
  if (!normalizedDepartmentId) return []

  return dedupeOfficerIds(
    (officers || [])
      .filter((officer) =>
        Array.isArray(officer.roleAssignments) &&
        officer.roleAssignments.some(
          (assignment) =>
            normalizeEntityId(assignment.department_id) === normalizedDepartmentId &&
            normalizeEntityId(assignment.subdepartment_id) === null
        )
      )
      .map((officer) => officer.id)
  )
}

export function getSubdepartmentOfficers(
  officers: Officer[] | null | undefined,
  departmentId: string | number | null | undefined,
  subdepartmentId: string | number | null | undefined
): Officer[] {
  const officerIds = new Set(getSubdepartmentOfficerIds(officers, departmentId, subdepartmentId))
  return (officers || []).filter((officer) => officerIds.has(officer.id))
}

// Role assignment utility functions (from regisry system)
export function groupAssignmentsByHierarchy(roleAssignments: JobLevel[]) {
  return {
    departments: roleAssignments.filter(a => a.department_id && !a.subdepartment_id),
    subDepartments: roleAssignments.filter(a => a.subdepartment_id && !a.class_id),
    classes: roleAssignments.filter(a => a.class_id)
  };
}

export function getJobLevelFromHierarchy(jobLevel: JobLevel): number {
  if (jobLevel.class_id) return 3;
  if (jobLevel.subdepartment_id) return 2;
  if (jobLevel.department_id) return 1;
  return 0;
}

export function formatJobLevel(jobLevel: JobLevel, departments: any[]): string {
  let foundDept, foundSub, foundCls;

  // Search through hierarchy to find matching entities
  for (const d of departments) {
    if (jobLevel.department_id && d.id === jobLevel.department_id) foundDept = d;

    for (const s of d.tm_subdepartments || []) {
      if (jobLevel.subdepartment_id && s.id === jobLevel.subdepartment_id) {
        foundSub = s;
        if (!foundDept) foundDept = d; // Back-fill parent if missing
      }

      for (const c of s.classes || []) {
        if (jobLevel.class_id && c.id === jobLevel.class_id) {
          foundCls = c;
          if (!foundSub) foundSub = s; // Back-fill parent
          if (!foundDept) foundDept = d; // Back-fill grandparent
        }
      }
    }
  }

  const parts = [];
  if (foundDept) parts.push(foundDept.name);
  if (foundSub) parts.push(foundSub.name);
  if (foundCls) parts.push(foundCls.name);

  return parts.length > 0 ? parts.join(" > ") : "Unassigned";
}

// Helper function to get officer with inheritance from parent department
export function getInheritedOfficer(
  entityOfficersHistory: OfficerHistory[] | null | undefined,
  parentDepartment: Department | null | undefined
): OfficerHistory | null {
  // First check if this entity has its own officer assignment
  const ownOfficer = getCurrentOfficer(entityOfficersHistory || [])
  if (ownOfficer) {
    return ownOfficer
  }

  // If no own officer, inherit from parent department
  if (parentDepartment) {
    const parentOfficer = getCurrentOfficer(parentDepartment.officers_history || [])
    return parentOfficer
  }

  // No officer found
  return null
}

export function getInheritedOfficers(
  entityOfficersHistory: OfficerHistory[] | null | undefined,
  parentDepartment: Department | null | undefined
): OfficerHistory[] {
  const ownOfficers = getCurrentOfficers(entityOfficersHistory)
  if (ownOfficers.length > 0) return ownOfficers

  if (parentDepartment) {
    return getCurrentOfficers(parentDepartment.officers_history || [])
  }

  return []
}

// Helper function to get current manager from manager_history
export function getCurrentManager(manager_history: ManagerHistory[] | undefined | null): ManagerHistory | null {
  return getCurrentAssignments(manager_history)[0] || null
}

export function getCurrentManagers(manager_history: ManagerHistory[] | null | undefined): ManagerHistory[] {
  return getCurrentAssignments(manager_history)
}

// Helper function to get current assistants from assistant_history
export function getCurrentAssistants(assistant_history: AssistantHistory[] = [], manager_id?: string): AssistantHistory[] {
  if (!assistant_history || !Array.isArray(assistant_history)) return [];
  return assistant_history.filter(assistant =>
    !assistant.end_date &&
    (!manager_id || assistant.manager_id === manager_id)
  );
}

// Role assignment management functions
export async function createRoleAssignment(assignment: Omit<JobLevel, 'id' | 'created_at'>): Promise<JobLevel> {
  try {
    const response = await fetch('/api/auth/role-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignment)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to create role assignment');
    }

    return {
      id: result.data.id,
      role: result.data.role,
      user_id: result.data.user_id,
      department_id: result.data.department_id,
      subdepartment_id: result.data.subdepartment_id,
      class_id: result.data.class_id,
      subclass_id: result.data.subclass_id,
      created_at: result.data.created_at
    };
  } catch (error) {
    console.error('Error creating role assignment:', error);
    throw error;
  }
}

export async function updateRoleAssignment(id: string, assignment: Partial<JobLevel>): Promise<JobLevel> {
  try {
    const response = await fetch(`/api/auth/role-assignments?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignment)
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to update role assignment');
    }

    return {
      id: result.data.id,
      role: result.data.role,
      user_id: result.data.user_id,
      department_id: result.data.department_id,
      subdepartment_id: result.data.subdepartment_id,
      class_id: result.data.class_id,
      subclass_id: result.data.subclass_id,
      created_at: result.data.created_at
    };
  } catch (error) {
    console.error('Error updating role assignment:', error);
    throw error;
  }
}

export async function deleteRoleAssignment(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/auth/role-assignments?id=${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete role assignment');
    }
  } catch (error) {
    console.error('Error deleting role assignment:', error);
    throw error;
  }
}

export async function assignOfficerToDepartment(departmentId: string, officerId: string): Promise<void> {
  try {
    // Create new role assignment using the tm_role_assignments table
    await createRoleAssignment({
      role: 'officer',
      user_id: officerId,
      department_id: parseInt(departmentId),
      subdepartment_id: null,
      class_id: null,
      subclass_id: null
    });
  } catch (error) {
    console.error('Error assigning officer to department:', error)
    throw new Error('Failed to assign officer to department')
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
    const officers_history = Array.isArray(departmentData.officers_history)
      ? departmentData.officers_history
      : departmentData.officerId ? [{
        id: departmentData.officerId,
        start_date: new Date().toISOString()
      }] : []

    const { data: department, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentData.name,
        description: departmentData.description,
        order: nextOrder,
        default_display: departmentData.default_display || true,
        officers_history,
        specification: departmentData.specification || [] // Added
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
        specification: cls.specification || [], // Added
        subClasses: cls.subClasses.map((subCls, subClsIndex) => ({
          id: subCls.id,
          name: subCls.name,
          description: subCls.description,
          order: subClsIndex + 1,
          isVisible: subCls.isVisible,
          default_display: subCls.default_display || true,
          specification: subCls.specification || [] // Added
        }))
      }))

      // Prepare manager_history and assistant_history
      const manager_history = Array.isArray(subdept.manager_history)
        ? subdept.manager_history
        : subdept.taskManagerId ? [{
          id: subdept.taskManagerId,
          start_date: new Date().toISOString()
        }] : []

      const assistant_history = Array.isArray(subdept.assistant_history)
        ? subdept.assistant_history
        : (subdept.taskAssistantIds || [])
          .filter(id => id)
          .map(id => ({
            id,
            start_date: new Date().toISOString()
          }))


      const subdeptData = {
        name: subdept.name,
        description: subdept.description,
        department_id: department.id,
        order: index + 1,
        default_display: subdept.default_display || true,
        classes: classesForStorage,
        officer_history: subdept.officer_history || [],
        manager_history,
        assistant_history,
        task_manager: manager_history.map((manager) => manager.id),
        task_assistant: assistant_history.map((assistant) => assistant.id),
        specification: subdept.specification || [] // Added
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
    toast.error("Failed to create department")
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

    // Process the data with proper ordering
    const processedData = (departmentsData || []).map((dept: any) => {
      const subdepartments = (dept.tm_subdepartments || [])
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((subdept: any) => {
          // Process classes with ordering
          const classes = (subdept.classes || [])
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((cls: any) => ({
              ...cls,
              subdepartmentId: subdept.id,
              default_display: cls.default_display || false,
              subClasses: (cls.subClasses || [])
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
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
    const deptUpdates = departments.map((dept, index) => ({
      id: dept.id,
      order: index + 1,
      default_display: dept.default_display || false,
      specification: dept.specification || [] // Added
    }))

    const subdeptUpdates = departments.flatMap(dept =>
      (dept.tm_subdepartments || []).map((subdept, index) => ({
        id: subdept.id,
        order: index + 1,
        default_display: subdept.default_display || false,
        specification: subdept.specification || [], // Added
        manager_history: subdept.manager_history || [],
        assistant_history: subdept.assistant_history || [],
        classes: (subdept.classes || []).map((cls, clsIndex) => ({
          ...cls,
          order: clsIndex + 1,
          default_display: cls.default_display || false,
          specification: cls.specification || [], // Added to JSON
          subClasses: (cls.subClasses || []).map((subCls, subClsIndex) => ({
            ...subCls,
            order: subClsIndex + 1,
            default_display: subCls.default_display || false,
            specification: subCls.specification || [] // Added to JSON
          }))
        }))
      }))
    )

    await supabase.from('tm_departments').upsert(deptUpdates)
    await supabase.from('tm_subdepartments').upsert(subdeptUpdates)

    toast.success("Order and display settings saved successfully!")
  } catch (error) {
    console.error('Error saving order and specification:', error)
    toast.error("Failed to save order and display settings")
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
