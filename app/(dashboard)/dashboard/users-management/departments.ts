// @ts-nocheck
import { supabase } from '@/lib/supabase/client';

export interface Department {
  id: string;
  name: string;
  description?: string;
  order: number;
  default_display: boolean;
  created_at: string;
  updated_at: string;
  subdepartments: SubDepartment[];
  tm_subdepartments: SubDepartment[];
}

export interface SubDepartment {
  id: string;
  name: string;
  department_id: string;
  order: number;
  default_display: boolean;
  created_at: string;
  updated_at: string;
  task_manager_id?: string;
  task_manager?: any;
  task_assistant?: any[];
  taskAssistants?: any[];
  classes?: any[];
}

export async function fetchDepartments(): Promise<Department[]> {
  try {
    const { data: departmentsData, error: deptError } = await supabase
      .from('tm_departments')
      .select(`
        *,
        tm_subdepartments (*)
      `)
      .order('order', { ascending: true });

    if (deptError) throw deptError;

    // Process and order the data
    const processedData = (departmentsData || []).map((dept: any) => {
      const subdepartments = (dept.tm_subdepartments || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      return {
        ...dept,
        default_display: dept.default_display || false,
        subdepartments,
        tm_subdepartments: subdepartments
      };
    });

    return processedData;
  } catch (error) {
    console.error('Error fetching departments:', error);
    throw new Error('Failed to fetch departments');
  }
}

export async function fetchDepartmentById(id: string): Promise<Department | null> {
  try {
    const { data, error } = await supabase
      .from('tm_departments')
      .select(`
        *,
        tm_subdepartments (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    const subdepartments = (data.tm_subdepartments || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      ...data,
      default_display: data.default_display || false,
      subdepartments,
      tm_subdepartments: subdepartments
    };
  } catch (error) {
    console.error(`Error fetching department ${id}:`, error);
    throw new Error('Failed to fetch department');
  }
}
