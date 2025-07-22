import { supabase } from '@/lib/supabase/client';

export interface DepartmentOption {
  value: string;
  label: string;
  subdepartments: SubdepartmentOption[];
}

export interface SubdepartmentOption {
  value: string;
  label: string;
  departmentId: string;
}

export async function fetchDepartmentsForSelect(): Promise<DepartmentOption[]> {
  try {
    // First, fetch all departments
    const { data: departments, error: deptError } = await supabase
      .from('tm_departments')
      .select('id, name, order')
      .order('order', { ascending: true });

    if (deptError) throw deptError;
    if (!departments?.length) return [];

    // Then fetch all subdepartments with their department_id
    const { data: subdepartments, error: subdeptError } = await supabase
      .from('tm_subdepartments')
      .select('id, name, department_id, order')
      .order('order', { ascending: true });

    if (subdeptError) throw subdeptError;

    // Create a map of department_id to its subdepartments
    const subdeptMap = new Map<string, SubdepartmentOption[]>();
    
    subdepartments?.forEach(subdept => {
      const subdeptOption: SubdepartmentOption = {
        value: subdept.id,
        label: subdept.name,
        departmentId: subdept.department_id
      };
      
      if (!subdeptMap.has(subdept.department_id)) {
        subdeptMap.set(subdept.department_id, []);
      }
      subdeptMap.get(subdept.department_id)?.push(subdeptOption);
    });

    // Combine departments with their subdepartments
    return departments.map(dept => ({
      value: dept.id,
      label: dept.name,
      subdepartments: subdeptMap.get(dept.id) || []
    }));
  } catch (error) {
    console.error('Error fetching departments for select:', error);
    throw new Error('Failed to fetch departments');
  }
}

export async function fetchSubdepartmentsByDepartment(departmentId: string): Promise<SubdepartmentOption[]> {
  if (!departmentId) return [];
  
  try {
    const { data, error } = await supabase
      .from('tm_subdepartments')
      .select('id, name, order')
      .eq('department_id', departmentId)
      .order('order', { ascending: true });

    if (error) throw error;

    return (data || []).map(subdept => ({
      value: subdept.id,
      label: subdept.name,
      departmentId
    }));
  } catch (error) {
    console.error('Error fetching subdepartments:', error);
    throw new Error('Failed to fetch subdepartments');
  }
}
