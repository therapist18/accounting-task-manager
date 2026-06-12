// Comprehensive Shared User Assignment Service
// Used by both regisry and accounting-task-manager projects
// Single source of truth for all user assignment operations
// Provides clean, display-ready data to all components

export interface UserAssignmentOptions {
  payrollAccess?: boolean;
}

export interface DisplayUser {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  isActive: boolean;
  role: 'officer' | 'manager' | 'assistant' | 'general';
  assignments: RoleAssignment[];
  createdAt: string;
  lastLogin: string | null;
}

export interface RoleAssignment {
  id: string;
  role: 'officer' | 'manager' | 'assistant';
  department_id: number | null;
  subdepartment_id: number | null;
  class_id: number | null;
  start_date: string;
  end_date: string | null;
  department_name?: string;
  subdepartment_name?: string;
  class_name?: string;
}

export interface FilteredUserData {
  officers: DisplayUser[];
  managers: DisplayUser[];
  assistants: DisplayUser[];
  allUsers: DisplayUser[];
}

export interface AssignmentFilters {
  department_id?: string;
  subdepartment_id?: string;
  class_id?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  user?: DisplayUser;
}

// Legacy interfaces for backward compatibility
export interface TaskManager extends DisplayUser { }
export interface TaskAssistant extends DisplayUser { }
export interface AuthOfficer extends DisplayUser { }

export interface UserAssignmentData {
  officers: AuthOfficer[];
  taskManagers: TaskManager[];
  taskAssistants: TaskAssistant[];
  allUsers: any[];
}

// Additional interfaces for comprehensive coverage
export interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  isActive?: boolean;
  role?: string;
  roleAssignments?: any[];
  companyIds?: number[];
  primaryCompanyId?: number | null;
}

export interface Officer extends User {
  roleAssignments: any[];
  jobLevels?: any[];
}

// Fetch users using the unified API
async function fetchUsers(params: {
  payrollAccess?: boolean;
  id?: string;
} = {}): Promise<any> {
  const searchParams = new URLSearchParams();
  if (params.payrollAccess !== undefined) searchParams.set('payrollAccess', params.payrollAccess.toString());
  if (params.id) searchParams.set('id', params.id);

  const res = await fetch(`/api/auth/users/unified?${searchParams.toString()}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch users.");
  return json.data;
}

// Fetch officers (filter by role since officers don't have roleAssignments)
export async function fetchOfficers(options: UserAssignmentOptions = {}): Promise<AuthOfficer[]> {
  const allUsers = await fetchUsers({
    payrollAccess: options.payrollAccess ?? true
  });

  // Filter for officers (user.role === 'officer')
  const officers = allUsers.filter((user: any) => user.role === 'officer');

  return officers.map((officer: any) => ({
    id: officer.id,
    firstName: officer.firstName || officer.displayName || '',
    lastName: officer.lastName || '',
    email: officer.email,
    username: officer.username,
    isActive: officer.isActive,
    roleAssignments: officer.roleAssignments || [],
    createdAt: officer.createdAt || new Date().toISOString(),
    lastLogin: officer.lastLogin,
    companyIds: officer.companyIds || [],
    primaryCompanyId: officer.primaryCompanyId,
  }));
}

// Fetch task managers (filter by roleAssignments containing 'manager')
export async function fetchTaskManagers(options: UserAssignmentOptions = {}): Promise<TaskManager[]> {
  const allUsers = await fetchUsers({
    payrollAccess: options.payrollAccess ?? true
  });

  // Filter for users with roleAssignments containing 'manager'
  const managers = allUsers.filter((user: any) => {
    const hasManagerRole = user.roleAssignments &&
      Array.isArray(user.roleAssignments) &&
      user.roleAssignments.length > 0 &&
      user.roleAssignments.some((assignment: any) => assignment.role === 'manager');

    return hasManagerRole;
  });


  // Transform to TaskManager format
  const result = managers.map((user: any) => ({
    id: user.id,
    firstName: user.firstName || user.displayName || '',
    lastName: user.lastName || '',
    email: user.email,
    username: user.username,
    isActive: user.isActive,
    jobLevels: user.roleAssignments || [], // Map roleAssignments to jobLevels for compatibility
    createdAt: user.createdAt || new Date().toISOString(),
    lastLogin: user.lastLogin,
    companyIds: user.companyIds || [],
    primaryCompanyId: user.primaryCompanyId,
  }));

  return result;
}

// Fetch task assistants (filter by roleAssignments containing 'assistant')
export async function fetchTaskAssistants(options: UserAssignmentOptions = {}): Promise<TaskAssistant[]> {
  const allUsers = await fetchUsers({
    payrollAccess: options.payrollAccess ?? true
  });

  // Filter for users with roleAssignments containing 'assistant'
  const assistants = allUsers.filter((user: any) => {
    const hasAssistantRole = user.roleAssignments?.some((assignment: any) => assignment.role === 'assistant');
    return hasAssistantRole;
  });


  const result = assistants.map((assistant: any) => ({
    id: assistant.id,
    firstName: assistant.firstName || assistant.displayName || '',
    lastName: assistant.lastName || '',
    email: assistant.email,
    username: assistant.username,
    isActive: assistant.isActive,
    jobLevels: assistant.roleAssignments || [], // Map roleAssignments to jobLevels for compatibility
    createdAt: assistant.createdAt || new Date().toISOString(),
    lastLogin: assistant.lastLogin,
    companyIds: assistant.companyIds || [],
    primaryCompanyId: assistant.primaryCompanyId,
  }));

  return result;
}

// Fetch all users for general use
export async function fetchAllUsers(options: UserAssignmentOptions = {}): Promise<User[]> {
  const allUsers = await fetchUsers({
    payrollAccess: options.payrollAccess ?? true
  });

  return allUsers.map((user: any) => ({
    id: user.id,
    name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    isActive: user.isActive,
    role: user.role,
    roleAssignments: user.roleAssignments || [],
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

/**
 * Unified User Assignment Service
 * Provides a singleton service for all user assignment operations
 */
class UnifiedUserService {
  private static instance: UnifiedUserService;
  private cache: Map<string, { data: any; timestamp: number }>;
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.cache = new Map();
  }

  static getInstance(): UnifiedUserService {
    if (!UnifiedUserService.instance) {
      UnifiedUserService.instance = new UnifiedUserService();
    }
    return UnifiedUserService.instance;
  }

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.CACHE_DURATION;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private getCache(key: string): any {
    const cached = this.cache.get(key);
    return cached ? cached.data : null;
  }

  private clearCache(): void {
    this.cache.clear();
  }

  /**
   * Transform raw user data to display format with role assignments
   */
  private transformUserToDisplayFormat(user: any, departments: any[] = []): DisplayUser {

    // Transform roleAssignments to RoleAssignment format
    const assignments: RoleAssignment[] = (user.roleAssignments || user.jobLevels || []).map((assignment: any) => ({
      id: assignment.id || `${user.id}_${assignment.role}_${Date.now()}`,
      role: assignment.role,
      department_id: assignment.department_id || null,
      subdepartment_id: assignment.subdepartment_id || null,
      class_id: assignment.class_id || null,
      start_date: assignment.start_date || new Date().toISOString(),
      end_date: assignment.end_date || null,
      department_name: this.getDepartmentName(assignment.department_id, departments),
      subdepartment_name: this.getSubdepartmentName(assignment.subdepartment_id, departments),
      class_name: this.getClassName(assignment.class_id, departments)
    }));

    // Determine primary role
    let primaryRole: DisplayUser['role'] = 'general';
    if (assignments.some(a => a.role === 'officer')) {
      primaryRole = 'officer';
    } else if (assignments.some(a => a.role === 'manager')) {
      primaryRole = 'manager';
    } else if (assignments.some(a => a.role === 'assistant')) {
      primaryRole = 'assistant';
    }

    return {
      id: user.id,
      displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email,
      username: user.username,
      isActive: Boolean(user.isActive ?? true),
      role: primaryRole,
      assignments,
      createdAt: user.createdAt || new Date().toISOString(),
      lastLogin: user.lastLogin
    };
  }

  private getDepartmentName(departmentId: number | null, departments: any[]): string {
    if (!departmentId) return '';
    const dept = departments.find((d: any) => d.id === departmentId);
    return dept ? dept.name : '';
  }

  private getSubdepartmentName(subdepartmentId: number | null, departments: any[]): string {
    if (!subdepartmentId) return '';
    for (const dept of departments) {
      const subdept = dept.tm_subdepartments?.find((sd: any) => sd.id === subdepartmentId);
      if (subdept) return subdept.name;
    }
    return '';
  }

  private getClassName(classId: number | null, departments: any[]): string {
    if (!classId) return '';
    for (const dept of departments) {
      for (const subdept of dept.tm_subdepartments || []) {
        const cls = subdept.classes?.find((c: any) => c.id === classId);
        if (cls) return cls.name;
      }
    }
    return '';
  }

  /**
   * Get all users with their assignments, categorized by role
   */
  async getAllUserData(options: UserAssignmentOptions = {}, departments?: any[]): Promise<FilteredUserData> {
    const deptKey = departments?.length
      ? departments.map((d: any) => d.id).sort().join(',')
      : 'no-departments';
    const cacheKey = `allUserData_${JSON.stringify(options)}_${deptKey}`;

    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    // Use existing fetchUserAssignmentData to get raw data
    const rawData = await fetchUserAssignmentData(options);

    // Transform all users to display format
    const allDisplayUsers = [
      ...rawData.officers.map(user => this.transformUserToDisplayFormat(user, departments || [])),
      ...rawData.taskManagers.map(user => this.transformUserToDisplayFormat(user, departments || [])),
      ...rawData.taskAssistants.map(user => this.transformUserToDisplayFormat(user, departments || []))
    ];

    const uniqueUsers = Array.from(
      new Map(allDisplayUsers.map(user => [user.id, user])).values()
    );

    const result: FilteredUserData = {
      officers: uniqueUsers.filter(user => user.assignments.some(a => a.role === 'officer')),
      managers: uniqueUsers.filter(user => user.assignments.some(a => a.role === 'manager')),
      assistants: uniqueUsers.filter(user => user.assignments.some(a => a.role === 'assistant')),
      allUsers: uniqueUsers
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get users filtered by specific assignment criteria
   */
  getUsersByAssignment(users: DisplayUser[], filters: AssignmentFilters): {
    officers: DisplayUser[];
    managers: DisplayUser[];
    assistants: DisplayUser[];
  } {
    const filterUser = (user: DisplayUser, role: string): boolean => {
      if (!user.assignments || !Array.isArray(user.assignments)) return false;
      return user.assignments.some(assignment => {
        if (assignment.role !== role) return false;

        // If no filters, include all users with this role
        if (!filters.department_id && !filters.subdepartment_id && !filters.class_id) {
          return true;
        }

        // Department level access
        if (filters.department_id && assignment.department_id === parseInt(filters.department_id)) {
          if (!filters.subdepartment_id || assignment.subdepartment_id === null || assignment.subdepartment_id === parseInt(filters.subdepartment_id)) {
            if (!filters.class_id || assignment.class_id === null || assignment.class_id === parseInt(filters.class_id)) {
              return true;
            }
          }
        }

        // Subdepartment level access
        if (filters.subdepartment_id && assignment.subdepartment_id === parseInt(filters.subdepartment_id)) {
          if (!filters.class_id || assignment.class_id === null || assignment.class_id === parseInt(filters.class_id)) {
            return true;
          }
        }

        // Class level access
        if (filters.class_id && assignment.class_id === parseInt(filters.class_id)) {
          return true;
        }

        return false;
      });
    };

    return {
      officers: users.filter(user => filterUser(user, 'officer')),
      managers: users.filter(user => filterUser(user, 'manager')),
      assistants: users.filter(user => filterUser(user, 'assistant'))
    };
  }

  /**
   * Get select options for dropdown components
   */
  getSelectOptions(users: DisplayUser[], includeNone: boolean = false): SelectOption[] {
    const options: SelectOption[] = users.map(user => ({
      value: user.id,
      label: user.displayName,
      user
    }));

    if (includeNone) {
      options.unshift({ value: '', label: 'None' });
    }

    return options;
  }

  /**
   * Get users for a specific department
   */
  getDepartmentUsers(users: DisplayUser[], departmentId: string): {
    officers: DisplayUser[];
    managers: DisplayUser[];
    assistants: DisplayUser[];
  } {
    return this.getUsersByAssignment(users, { department_id: departmentId });
  }

  /**
   * Get users for a specific subdepartment
   */
  getSubdepartmentUsers(users: DisplayUser[], departmentId: string, subdepartmentId: string): {
    officers: DisplayUser[];
    managers: DisplayUser[];
    assistants: DisplayUser[];
  } {
    return this.getUsersByAssignment(users, {
      department_id: departmentId,
      subdepartment_id: subdepartmentId
    });
  }

  /**
   * Get users for a specific class
   */
  getClassUsers(users: DisplayUser[], departmentId: string, subdepartmentId: string, classId: string): {
    officers: DisplayUser[];
    managers: DisplayUser[];
    assistants: DisplayUser[];
  } {
    return this.getUsersByAssignment(users, {
      department_id: departmentId,
      subdepartment_id: subdepartmentId,
      class_id: classId
    });
  }

  /**
   * Get user by ID
   */
  getUserById(users: DisplayUser[], userId: string): DisplayUser | null {
    return users.find(user => user.id === userId) || null;
  }
}

// Export singleton instance for easy use
export const userService = UnifiedUserService.getInstance();

// Export convenience functions for backward compatibility
export async function fetchUnifiedUserData(options: UserAssignmentOptions = {}): Promise<FilteredUserData> {
  return userService.getAllUserData(options);
}

export function getUsersByRole(users: DisplayUser[], role: DisplayUser['role']): DisplayUser[] {
  return users.filter(user => user.role === role);
}

export function filterUsersByAssignment(users: DisplayUser[], filters: AssignmentFilters): {
  officers: DisplayUser[];
  managers: DisplayUser[];
  assistants: DisplayUser[];
} {
  return userService.getUsersByAssignment(users, filters);
}

export function getSelectOptions(users: DisplayUser[], includeNone: boolean = false): SelectOption[] {
  return userService.getSelectOptions(users, includeNone);
}

export function getDepartmentUsers(users: DisplayUser[], departmentId: string): {
  officers: DisplayUser[];
  managers: DisplayUser[];
  assistants: DisplayUser[];
} {
  return userService.getDepartmentUsers(users, departmentId);
}

export function getSubdepartmentUsers(users: DisplayUser[], departmentId: string, subdepartmentId: string): {
  officers: DisplayUser[];
  managers: DisplayUser[];
  assistants: DisplayUser[];
} {
  return userService.getSubdepartmentUsers(users, departmentId, subdepartmentId);
}

export function getClassUsers(users: DisplayUser[], departmentId: string, subdepartmentId: string, classId: string): {
  officers: DisplayUser[];
  managers: DisplayUser[];
  assistants: DisplayUser[];
} {
  return userService.getClassUsers(users, departmentId, subdepartmentId, classId);
}

export function getUserById(users: DisplayUser[], userId: string): DisplayUser | null {
  return userService.getUserById(users, userId);
}

/**
 * Check if user has access to specific job level (updated to use DisplayUser)
 */
export function hasJobLevelAccess(user: DisplayUser, targetDepartmentId: string, targetSubdepartmentId: string, targetClassId: string): boolean {
  // Add null check for assignments to prevent runtime errors
  if (!user.assignments || !Array.isArray(user.assignments)) {
    return false;
  }

  return user.assignments.some(assignment => {
    // If no department is selected, show users with department-level access
    if (!targetDepartmentId && assignment.department_id) {
      return true;
    }

    // Department level access
    if (assignment.department_id && String(assignment.department_id) === targetDepartmentId) {
      return true;
    }

    // Subdepartment level access
    if (assignment.subdepartment_id && String(assignment.subdepartment_id) === targetSubdepartmentId) {
      return true;
    }

    // Class level access
    if (assignment.class_id && String(assignment.class_id) === targetClassId) {
      return true;
    }

    return false;
  });
}

// Legacy functions for backward compatibility
export function getDepartmentOfficerIds(officers: any[], departmentId: number): string[] {
  return officers
    .filter(officer =>
      officer.companyIds?.includes(departmentId)
    )
    .map(officer => officer.id);
}

export function getSubdepartmentOfficerIds(officers: any[], departmentId: number, subdepartmentId: number): string[] {
  return officers
    .filter(officer =>
      officer.companyIds?.includes(departmentId) ||
      officer.companyIds?.includes(subdepartmentId)
    )
    .map(officer => officer.id);
}

export function getOfficerDisplayName(officer: any): string {
  return officer.displayName || `${officer.firstName || ''} ${officer.lastName || ''}`.trim() || officer.username || 'Unknown';
}
