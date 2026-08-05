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
  officerIds?: string[]
  managerIds?: string[]
  assistantIds?: string[]
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




export async function createDepartment(departmentData: any): Promise<Department> {
  try {
    // Get the next order number for departments
    const { data: maxOrderData } = await supabase
      .from('tm_departments')
      .select('order')
      .order('order', { ascending: false })
      .limit(1)

    const nextOrder = (maxOrderData?.[0]?.order || 0) + 1

    const { data: department, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentData.name,
        description: departmentData.description,
        order: nextOrder,
        default_display: departmentData.default_display || true,
        specification: departmentData.specification || []
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
        specification: cls.specification || [],
        subClasses: cls.subClasses.map((subCls, subClsIndex) => ({
          id: subCls.id,
          name: subCls.name,
          description: subCls.description,
          order: subClsIndex + 1,
          isVisible: subCls.isVisible,
          default_display: subCls.default_display || true,
          specification: subCls.specification || []
        }))
      }))

      const subdeptData = {
        name: subdept.name,
        description: subdept.description,
        department_id: department.id,
        order: index + 1,
        default_display: subdept.default_display || true,
        classes: classesForStorage,
        specification: subdept.specification || []
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
            taskManagerId: subdept.task_manager?.id || subdept.task_manager_id || subdept.task_manager
          }
        })

      return {
        ...dept,
        default_display: dept.default_display || false,
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
        specification: subdept.specification || [],
        classes: (subdept.classes || []).map((cls, clsIndex) => ({
          ...cls,
          order: clsIndex + 1,
          default_display: cls.default_display || false,
          specification: cls.specification || [],
          subClasses: (cls.subClasses || []).map((subCls, subClsIndex) => ({
            ...subCls,
            order: subClsIndex + 1,
            default_display: subCls.default_display || false,
            specification: subCls.specification || []
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
// Class data (including requirements) is persisted directly on tm_subdepartments.classes;
// tm_class_requirements is keyed by job_level, not class_id, so nothing is written here.
export async function saveClassRequirements(subdepartmentId: string, classes: ClassForm[]): Promise<void> {
  console.log('Class requirements are stored on tm_subdepartments.classes; skipping tm_class_requirements write for subdepartment:', subdepartmentId);
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

export function getInheritedOfficer(
  departments: Department[],
  departmentId: string,
  subdepartmentId: string
): string | null {
  try {
    const department = departments.find(dept => dept.id === departmentId);
    if (!department) return null;

    const subdepartment = department.tm_subdepartments?.find(sub => sub.id === subdepartmentId);
    if (!subdepartment) return null;

    // Return task manager if available
    if (subdepartment.taskManagerId) {
      return subdepartment.taskManagerId;
    }

    // Check for task assistants
    if (subdepartment.taskAssistants && subdepartment.taskAssistants.length > 0) {
      return subdepartment.taskAssistants[0].userId;
    }

    return null;
  } catch (error) {
    console.error('Error getting inherited officer:', error);
    return null;
  }
}

export function getDepartmentOfficerIds(
  departments: Department[],
  departmentId: string
): string[] {
  try {
    const department = departments.find(dept => dept.id === departmentId);
    if (!department) return [];

    // Return department-level officers
    return department.officers_history?.map(history => history.id) || [];
  } catch (error) {
    console.error('Error getting department officer IDs:', error);
    return [];
  }
}

