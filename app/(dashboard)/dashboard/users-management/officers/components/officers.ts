import supabase from "../../../../../../lib/supabase/client";

export interface Officer {
  id: string;
  name: string;
  email: string;
  role: 'officer' | 'admin';
  phone_number?: string | null;
  password?: string;
  department_id: string;
  department?: {
    id: string;
    name: string;
  };
  subdepartment_id?: string | null;
  subdepartment?: {
    id: string;
    name: string;
  } | null;
  department_start_date: string;
  department_end_date?: string | null;
  status_history: Array<{
    status: 'active' | 'inactive';
    start_date: string;
    end_date: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export async function fetchOfficers(): Promise<Officer[]> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .select('*')
      .eq('role', 'officer')
      .order('name');

    if (error) throw error;
    
    return (data || []).map(officer => ({
      ...officer,
      status_history: officer.status_history || [{
        status: 'active',
        start_date: officer.created_at || new Date().toISOString(),
        end_date: null
      }],
      department: officer.department || { id: officer.department_id, name: 'Unknown' },
      subdepartment: officer.subdepartment || 
        (officer.subdepartment_id ? { id: officer.subdepartment_id, name: 'Unknown' } : undefined)
    }));
  } catch (error) {
    console.error('Error fetching officers:', error);
    throw new Error('Failed to fetch officers');
  }
}

export async function createOfficer(officerData: Omit<Officer, 'id' | 'created_at' | 'updated_at' | 'department' | 'subdepartment'>): Promise<Officer> {
  try {
    // Ensure the role is set to 'officer'
    const dataToInsert = {
      ...officerData,
      role: 'officer' as const
    };

    const { data, error } = await supabase
      .from('tm_users')
      .insert([dataToInsert])
      .select()
      .single();

    if (error) throw error;

    return {
      ...data,
      department: data.department || { id: data.department_id, name: 'Unknown' },
      subdepartment: data.subdepartment || 
        (data.subdepartment_id ? { id: data.subdepartment_id, name: 'Unknown' } : undefined)
    };
  } catch (error) {
    console.error('Error creating officer:', error);
    throw new Error('Failed to create officer');
  }
}

export async function updateOfficer(id: string, officerData: Partial<Officer>): Promise<Officer> {
  try {
    const { data, error } = await supabase
      .from('tm_users')
      .update(officerData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      ...data,
      department: data.department || { id: data.department_id, name: 'Unknown' },
      subdepartment: data.subdepartment || 
        (data.subdepartment_id ? { id: data.subdepartment_id, name: 'Unknown' } : undefined)
    };
  } catch (error) {
    console.error('Error updating officer:', error);
    throw new Error('Failed to update officer');
  }
}

export async function deleteOfficer(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('tm_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting officer:', error);
    throw new Error('Failed to delete officer');
  }
}
