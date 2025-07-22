import { z } from 'zod';

export type OfficerDepartmentHistory = {
  department_id: string;
  subdepartment_id: string;
  start_date: string;
  end_date: string | null;
};

export interface Department {
  id: string;
  name: string;
}

export interface Subdepartment {
  id: string;
  name: string;
}

export interface OfficerStatus {
  status: 'active' | 'inactive';
  start_date: string;
  end_date?: string;
}

export interface Officer {
  id: string;
  name: string;
  email?: string;
  department_id?: string;
  department?: Department;
  subdepartment_id?: string | null;
  subdepartment?: Subdepartment | null;
  department_start_date?: string | null;
  department_end_date?: string | null;
  status_history: OfficerStatus[];
  created_at?: string;
  updated_at?: string;
};

export const officerFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Name must be at least 2 characters.',
  }),
  email: z.string().email().optional(),
  password: z.string().min(8, {
    message: 'Password must be at least 8 characters.',
  }).optional(),
  department_id: z.string().optional(),
  subdepartment_id: z.string().optional(),
  department_start_date: z.string().optional(),
  department_end_date: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
});

export type OfficerFormValues = z.infer<typeof officerFormSchema>;
