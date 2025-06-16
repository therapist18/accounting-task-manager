// @ts-nocheck
import supabase from "@/lib/supabase/client"

export interface StatusHistoryEntry {
    status: 'active' | 'inactive'
    changed_at: string
    changed_by: string
    reason?: string
    start_date: string
    end_date: string | null
}

export type UserRole = 'admin' | 'task_manager' | 'task_assistant' | 'officer' | 'user'

export interface DepartmentHistoryEntry {
    department_id: string
    start_date: string
    end_date: string | null
    assigned_at: string
    assigned_by: string
}

export interface User {
    id: string | number
    clerk_id: string | null
    email: string | null
    name: string | null
    role: UserRole
    phone_number?: string | null
    password?: string | null
    created_at: string
    updated_at: string
    status_history: StatusHistoryEntry[]
    department_history?: DepartmentHistoryEntry[]
    start_date?: string
    end_date?: string | null
}

// Helper to determine if a user is active based on the latest status entry
function isUserActive(user: User): boolean {
    if (!user.status_history || user.status_history.length === 0) return false
    const latestStatus = user.status_history[user.status_history.length - 1]
    return latestStatus.status === 'active'
}

export async function fetchUsers(active?: boolean): Promise<User[]> {
    const { data: users, error } = await supabase
        .from('tm_users')
        .select('*')
        .order('name', { ascending: true })

    if (error) {
        console.error('Error fetching users:', error)
        return []
    }

    // Ensure status_history is always an array and filter by active status if needed
    const processedUsers = (users || []).map((user: any) => ({
        ...user,
        status_history: Array.isArray(user.status_history) ? user.status_history : [],
        department_history: Array.isArray(user.department_history) ? user.department_history : []
    }))

    if (active !== undefined) {
        return processedUsers.filter(user => {
            if (user.status_history.length === 0) return !active
            const latestStatus = user.status_history[user.status_history.length - 1]
            return active ? latestStatus.status === 'active' : latestStatus.status === 'inactive'
        })
    }

    return processedUsers
}

export async function updateUserStatus(
    userId: string | number,
    active: boolean,
    changedBy: string = 'system',
    reason?: string
): Promise<void> {
    // Convert userId to string for consistency
    const userIdStr = userId.toString()
    
    // First, get the current user to check their status history
    const { data: currentUser, error: fetchError } = await supabase
        .from('tm_users')
        .select('status_history')
        .eq('id', userIdStr)
        .single()

    if (fetchError) {
        console.error('Error fetching user:', fetchError)
        throw fetchError
    }

    const now = new Date().toISOString()
    const currentHistory = Array.isArray(currentUser.status_history) ? currentUser.status_history : []
    const latestStatus = currentHistory.length > 0 ? currentHistory[currentHistory.length - 1] : null

    // Only update if status is actually changing
    if ((active && latestStatus?.status === 'active') || (!active && latestStatus?.status === 'inactive')) {
        console.log('No status change needed')
        return
    }

    const newStatusEntry: StatusHistoryEntry = {
        status: active ? 'active' : 'inactive',
        changed_at: now,
        changed_by: changedBy,
        reason: reason || `Status changed to ${active ? 'active' : 'inactive'} by ${changedBy}`,
        start_date: active ? now.split('T')[0] : (latestStatus?.start_date || now.split('T')[0]),
        end_date: active ? null : now.split('T')[0]
    }

    // Update the status_history array with the new entry
    const { error } = await supabase
        .from('tm_users')
        .update({
            status_history: [...currentHistory, newStatusEntry],
            updated_at: now
        })
        .eq('id', userIdStr)

    if (error) {
        console.error('Error updating user status:', error)
        throw error
    }
}

export async function createUser(userData: {
    email: string
    name: string
    role: string
    clerk_id: string
    password?: string
    department_history?: Array<{
        department_id: string
        start_date: string
        end_date: string | null
        assigned_at: string
        assigned_by: string
    }>
}): Promise<User> {
    const now = new Date().toISOString()
    const startDate = userData.start_date || now.split('T')[0]
    
    const userToCreate: any = {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        clerk_id: userData.clerk_id,
        password: userData.password || '',
        status_history: [{
            status: 'active',
            changed_at: now,
            changed_by: 'system',
            reason: 'User created',
            start_date: startDate,
            end_date: userData.end_date || null
        }],
    }
    
    // Add department history if provided
    if (userData.department_history?.length) {
        userToCreate.department_history = userData.department_history
    }

    const { data, error } = await supabase
        .from('tm_users')
        .insert([userToCreate])
        .select()
        .single()

    if (error) {
        console.error('Error creating user:', error)
        throw error
    }

    return {
        ...data,
        status_history: Array.isArray(data.status_history) ? data.status_history : [],
        department_history: Array.isArray(data.department_history) ? data.department_history : []
    }
}

export async function getUserStatusHistory(userId: string | number): Promise<StatusHistoryEntry[]> {
    try {
        const { data, error } = await supabase
            .from('tm_users')
            .select('status_history')
            .eq('id', userId.toString())
            .single()

        if (error) {
            console.error('Error fetching user status history:', error)
            return []
        }

        return Array.isArray(data?.status_history) ? data.status_history : []
    } catch (error) {
        console.error('Error in getUserStatusHistory:', error)
        return []
    }
}

export async function updateOfficerDepartment(
    officerId: string | number,
    departmentId: string,
    assignedBy: string = 'system',
    startDate?: string,
    endDate?: string | null
): Promise<void> {
    const now = new Date().toISOString()
    const today = startDate || now.split('T')[0]

    // First, get the current department history
    const { data: currentUser, error: fetchError } = await supabase
        .from('tm_users')
        .select('department_history')
        .eq('id', officerId)
        .single()

    if (fetchError) {
        console.error('Error fetching officer data:', fetchError)
        throw fetchError
    }

    // Initialize department history if it doesn't exist
    const currentHistory: DepartmentHistoryEntry[] = Array.isArray(currentUser.department_history) 
        ? currentUser.department_history 
        : []


    // Close any open department assignments
    const updatedHistory = currentHistory.map(entry => ({
        ...entry,
        end_date: entry.end_date || today
    }))

    // Add the new department assignment
    const newDepartmentEntry: DepartmentHistoryEntry = {
        department_id: departmentId,
        start_date: today,
        end_date: endDate || null,
        assigned_at: now,
        assigned_by: assignedBy
    }

    // Update the department_history array with the new entry
    const { error } = await supabase
        .from('tm_users')
        .update({
            department_history: [...updatedHistory, newDepartmentEntry],
            updated_at: now
        })
        .eq('id', officerId)

    if (error) {
        console.error('Error updating officer department:', error)
        throw error
    }
}