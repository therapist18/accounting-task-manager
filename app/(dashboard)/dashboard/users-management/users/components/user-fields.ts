import { z } from 'zod';

export interface UserStatus {
  start_date: string;
  end_date: string | null;
  status: 'active' | 'inactive';
}

export interface DepartmentHistory {
  department_id: string;
  subdepartment_id: string | null;
  start_date: string;
  end_date: string | null;
}

export interface User {
  id: string;
  clerk_id?: string | null;
  name: string;
  email: string;
  role: 'user' | 'officer' | 'admin';
  status_history: UserStatus[];
  department_history?: DepartmentHistory[];
  phone_number?: string | null;
  password?: string;
  created_at: string;
  updated_at: string;
}

export const userFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Name must be at least 2 characters.',
  }),
  email: z.string().optional(),
  password: z.string().optional(),
  role: z.enum(['user', 'officer', 'admin']).default('user'),
  phone_number: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
