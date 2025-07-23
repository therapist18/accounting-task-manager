import { supabase } from '@/lib/supabase/client';

export interface User {
  id: string;
  clerk_id?: string | null;
  name: string;
  email: string;
  role: 'user' | 'officer' | 'admin';
  phone_number?: string | null;
  password?: string;
  status_history: Array<{
    status: 'active' | 'inactive';
    start_date: string;
    end_date: string | null;
  }>;
  department_history?: Array<{
    department_id: string;
    subdepartment_id: string | null;
    start_date: string;
    end_date: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export async function fetchUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .select('*')
      .in('role', ['user', 'admin'])
      .order('name');

    if (error) throw error;
    
    return (data || []).map(user => ({
      ...user,
      status_history: user.status_history || [{
        status: 'active',
        start_date: user.created_at || new Date().toISOString(),
        end_date: null
      }],
      department_history: user.department_history || []
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    throw new Error('Failed to fetch users');
  }
}

export async function createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .insert([userData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating user:', error);
    throw new Error('Failed to create user');
  }
}

export async function updateUser(id: string, userData: Partial<User>): Promise<User> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw new Error('Failed to update user');
  }
}

export async function deleteUser(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('tm_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw new Error('Failed to delete user');
  }
}
