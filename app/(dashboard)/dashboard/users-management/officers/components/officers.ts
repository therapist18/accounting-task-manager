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
    // Extract department history from the officer data
    const { department_id, subdepartment_id, department_start_date, department_end_date, ...rest } = officerData;
    
    // Create the department history array
    const department_history = [{
      department_id,
      subdepartment_id: subdepartment_id || null,
      start_date: department_start_date || new Date().toISOString(),
      end_date: department_end_date || null
    }];

    // Prepare the data to insert
    const dataToInsert = {
      ...rest,
      role: 'officer' as const,
      department_history, // Store as JSONB array
      // Set default status history if not provided
      status_history: officerData.status_history || [{
        status: 'active',
        start_date: new Date().toISOString(),
        end_date: null
      }]
    };

    const { data, error } = await supabase
      .from('tm_users')
      .insert([dataToInsert])
      .select()
      .single();

    if (error) throw error;

    return {
      ...data,
      department: { id: department_id, name: 'Unknown' },
      subdepartment: subdepartment_id ? { id: subdepartment_id, name: 'Unknown' } : undefined,
      department_id,
      subdepartment_id,
      department_start_date,
      department_end_date
    };
  } catch (error) {
    console.error('Error creating officer:', error);
    throw new Error('Failed to create officer');
  }
}

export async function updateOfficer(id: string, officerData: Partial<Officer>): Promise<Officer> {
  try {
    // Get the current officer data to preserve existing department history
    const { data: currentData } = await supabase
      .from('tm_users')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentData) {
      throw new Error('Officer not found');
    }

    // Prepare the update data
    const updateData: any = { ...officerData };
    
    // If department-related fields are being updated, update the department_history
    if ('department_id' in officerData || 'subdepartment_id' in officerData || 
        'department_start_date' in officerData || 'department_end_date' in officerData) {
      
      // Get the current department history or initialize if it doesn't exist
      const currentHistory = currentData.department_history || [];
      const lastHistory = currentHistory.length > 0 
        ? currentHistory[currentHistory.length - 1] 
        : null;
      
      // Only update if there are actual changes
      if (lastHistory && (
        lastHistory.department_id === officerData.department_id &&
        lastHistory.subdepartment_id === (officerData.subdepartment_id || null) &&
        lastHistory.start_date === officerData.department_start_date &&
        lastHistory.end_date === (officerData.department_end_date || null)
      )) {
        // No changes to department history
      } else {
        // End the current department assignment if it exists
        if (lastHistory) {
          lastHistory.end_date = new Date().toISOString();
        }
        
        // Add new department assignment
        const newAssignment = {
          department_id: officerData.department_id || lastHistory?.department_id || '',
          subdepartment_id: officerData.subdepartment_id || lastHistory?.subdepartment_id || null,
          start_date: officerData.department_start_date || new Date().toISOString(),
          end_date: officerData.department_end_date || null
        };
        
        updateData.department_history = [...currentHistory, newAssignment];
      }
    }

    const { data, error } = await supabase
      .from('tm_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return {
      ...data,
      department: { 
        id: data.department_id, 
        name: typeof data.department === 'object' ? data.department?.name : 'Unknown' 
      },
      subdepartment: data.subdepartment_id ? { 
        id: data.subdepartment_id, 
        name: typeof data.subdepartment === 'object' ? data.subdepartment?.name : 'Unknown' 
      } : undefined,
      department_id: data.department_id,
      subdepartment_id: data.subdepartment_id,
      department_start_date: data.department_start_date,
      department_end_date: data.department_end_date
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
