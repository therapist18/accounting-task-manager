import supabase from "@/lib/supabase/client"

export interface StatusHistoryEntry {
    status: 'active' | 'inactive'
    changed_at: string
    changed_by: string
    reason?: string
    start_date?: string
    end_date?: string | null
}

export type UserRole = 'admin' | 'task_manager' | 'task_assistant' | 'officer'

export interface User {
    id: string
    clerk_id: string
    email: string
    name: string
    role: UserRole
    created_at: string
    updated_at: string
    status_history: StatusHistoryEntry[]
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
    const processedUsers = (users || []).map(user => ({
        ...user,
        status_history: Array.isArray(user.status_history) ? user.status_history : []
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
    userId: string,
    active: boolean,
    changedBy: string = 'system',
    reason?: string
): Promise<void> {
    // First, get the current user to check their status history
    const { data: currentUser, error: fetchError } = await supabase
        .from('tm_users')
        .select('status_history')
        .eq('id', userId)
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
        start_date: active ? now : latestStatus?.start_date,
        end_date: active ? null : now
    }

    // Update the status_history array with the new entry
    const { error } = await supabase
        .from('tm_users')
        .update({
            status_history: [...currentHistory, newStatusEntry],
            updated_at: now
        })
        .eq('id', userId)

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
    start_date?: string
}): Promise<User> {
    const now = new Date().toISOString()
    const startDate = userData.start_date || now

    const statusEntry: StatusHistoryEntry = {
        status: 'active',
        changed_at: now,
        changed_by: 'system',
        reason: 'User created',
        start_date: startDate,
        end_date: null
    }

    const { data: user, error } = await supabase
        .from('tm_users')
        .insert([{
            email: userData.email,
            name: userData.name,
            role: userData.role,
            clerk_id: userData.clerk_id,
            status_history: [statusEntry]
        }])
        .select()
        .single()

    if (error) {
        console.error('Error creating user:', error)
        throw error
    }

    return {
        ...user,
        status_history: Array.isArray(user.status_history) ? user.status_history : []
    }
}

export async function getUserStatusHistory(userId: string): Promise<StatusHistoryEntry[]> {
    const { data, error } = await supabase
        .from('tm_users')
        .select('status_history')
        .eq('id', userId)
        .single()

    if (error) {
        console.error('Error fetching user status history:', error)
        return []
    }

    return Array.isArray(data.status_history) ? data.status_history : []
}