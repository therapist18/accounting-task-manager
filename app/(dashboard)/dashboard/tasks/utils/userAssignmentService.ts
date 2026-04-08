// Service for fetching officers, managers, and assistants for EnquiryDialog
import type { AuthOfficer } from './authOfficers';

export interface UserAssignmentOptions {
  companyId?: string;
  payrollAccess?: boolean;
}

export interface TaskManager {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  isActive: boolean;
  jobLevels: any[];
  createdAt: string;
  lastLogin: string | null;
  companyIds: number[];
  primaryCompanyId: number | null;
}

export interface TaskAssistant {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  isActive: boolean;
  jobLevels: any[];
  createdAt: string;
  lastLogin: string | null;
  companyIds: number[];
  primaryCompanyId: number | null;
}

export interface UserAssignmentData {
  officers: AuthOfficer[];
  taskManagers: TaskManager[];
  taskAssistants: TaskAssistant[];
  allUsers: any[];
}

// Fetch users using the unified API
async function fetchUsers(params: {
  role?: string;
  companyId?: string;
  payrollAccess?: boolean;
  id?: string;
} = {}): Promise<any> {
  const searchParams = new URLSearchParams();
  if (params.role) searchParams.set('role', params.role);
  if (params.companyId) searchParams.set('companyId', params.companyId);
  if (params.payrollAccess !== undefined) searchParams.set('payrollAccess', params.payrollAccess.toString());
  if (params.id) searchParams.set('id', params.id);

  const res = await fetch(`/api/auth/users/unified?${searchParams.toString()}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch users.");
  return json.data;
}

// Fetch officers
export async function fetchOfficers(options: UserAssignmentOptions = {}): Promise<AuthOfficer[]> {
  return fetchUsers({
    role: "officer",
    payrollAccess: options.payrollAccess ?? true
  });
}

// Fetch task managers (fetch by company then filter by role_type)
export async function fetchTaskManagers(options: UserAssignmentOptions = {}): Promise<TaskManager[]> {
  // Fetch all users for company 10 (default for accounting-task-manager)
  const companyId = options.companyId || '10';
  const allUsers = await fetchUsers({
    companyId: companyId,
    payrollAccess: options.payrollAccess ?? true
  });

  // Filter by role_type "manager", "company_admin", or "general_admin" in jobLevels
  const managers = allUsers.filter(user =>
    user.jobLevels && user.jobLevels.some((jobLevel: any) =>
      jobLevel.role_type === 'manager' ||
      jobLevel.role_type === 'company_admin' ||
      jobLevel.role_type === 'general_admin'
    )
  );

  // Transform to TaskManager format (matching regisry)
  return managers.map(user => ({
    id: user.id,
    firstName: user.firstName || user.displayName || '',
    lastName: user.lastName || '',
    email: user.email,
    username: user.username,
    isActive: user.isActive,
    jobLevels: user.jobLevels || [],
    createdAt: user.createdAt || new Date().toISOString(),
    lastLogin: user.lastLogin,
    companyIds: user.companyIds || [],
    primaryCompanyId: user.primaryCompanyId,
  }));
}

// Fetch task assistants (fetch by company then filter by role_type)
export async function fetchTaskAssistants(options: UserAssignmentOptions = {}): Promise<TaskAssistant[]> {
  // Fetch all users for company 10 (default for accounting-task-manager)
  const companyId = options.companyId || '10';
  const allUsers = await fetchUsers({
    companyId: companyId,
    payrollAccess: options.payrollAccess ?? true
  });

  // Filter by role_type "assistant" in jobLevels only
  const assistants = allUsers.filter(user =>
    user.jobLevels && user.jobLevels.some((jobLevel: any) => jobLevel.role_type === 'assistant')
  );

  // Transform to TaskAssistant format (matching regisry)
  return assistants.map(user => ({
    id: user.id,
    firstName: user.firstName || user.displayName || '',
    lastName: user.lastName || '',
    email: user.email,
    username: user.username,
    isActive: user.isActive,
    jobLevels: user.jobLevels || [],
    createdAt: user.createdAt || new Date().toISOString(),
    lastLogin: user.lastLogin,
    companyIds: user.companyIds || [],
    primaryCompanyId: user.primaryCompanyId,
  }));
}

// Fetch all user assignment data in one call
export async function fetchUserAssignmentData(options: UserAssignmentOptions = {}): Promise<UserAssignmentData> {
  const [officers, taskManagers, taskAssistants] = await Promise.all([
    fetchOfficers(options),
    fetchTaskManagers(options),
    fetchTaskAssistants(options)
  ]);

  return {
    officers,
    taskManagers,
    taskAssistants,
    allUsers: [...officers, ...taskManagers, ...taskAssistants]
  };
}

// Legacy compatibility functions to match current EnquiryDialog interface
export async function fetchUsersForDialog(options: UserAssignmentOptions = {}): Promise<any[]> {
  // Return all users in the format expected by the dialog
  const { officers, taskManagers, taskAssistants } = await fetchUserAssignmentData(options);

  // Transform to the format expected by the dialog (similar to tm_users structure)
  return [
    ...officers.map(officer => ({
      id: officer.id,
      name: officer.name || officer.full_name,
      full_name: officer.full_name || officer.name,
      role: "officer",
      email: officer.email,
      username: officer.username,
      isActive: officer.isActive,
      jobLevels: officer.jobLevels
    })),
    ...taskManagers.map(manager => ({
      id: manager.id,
      name: `${manager.firstName} ${manager.lastName}`.trim(),
      full_name: `${manager.firstName} ${manager.lastName}`.trim(),
      role: "manager",
      email: manager.email,
      username: manager.username,
      isActive: manager.isActive,
      jobLevels: manager.jobLevels
    })),
    ...taskAssistants.map(assistant => ({
      id: assistant.id,
      name: `${assistant.firstName} ${assistant.lastName}`.trim(),
      full_name: `${assistant.firstName} ${assistant.lastName}`.trim(),
      role: "assistant",
      email: assistant.email,
      username: assistant.username,
      isActive: assistant.isActive,
      jobLevels: assistant.jobLevels
    }))
  ];
}

// Helper function to check if user has access to the selected job level
export function hasJobLevelAccess(user: any, targetDepartmentId: string, targetSubdepartmentId: string, targetClassId: string): boolean {
  if (!user.jobLevels || !Array.isArray(user.jobLevels)) return false;

  const hasAccess = user.jobLevels.some((jobLevel: any) => {
    console.log('🔍 hasJobLevelAccess:', {
      userName: user.firstName || user.displayName,
      targetDepartmentId,
      targetSubdepartmentId,
      targetClassId,
      jobLevel
    });

    // If user has department level access, they can access any subdepartment/class under it
    if (jobLevel.department_id && String(jobLevel.department_id) === targetDepartmentId) {
      return true;
    }

    // If user has subdepartment level access, they can access any class under it
    if (jobLevel.subdepartment_id && String(jobLevel.subdepartment_id) === targetSubdepartmentId) {
      return true;
    }

    // If user has class level access, they can access that specific class
    if (jobLevel.class_id && String(jobLevel.class_id) === targetClassId) {
      return true;
    }

    // Special case: If no department is selected, show users with department-level access
    if (!targetDepartmentId && jobLevel.department_id) {
      return true;
    }

    return false;
  });

  console.log('🔍 hasJobLevelAccess result:', {
    userName: user.firstName || user.displayName,
    hasAccess
  });

  return hasAccess;
}
