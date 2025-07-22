// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Officer, OfficerFormValues, officerFormSchema } from '@/types/officer';
import { fetchDepartmentsForSelect, fetchSubdepartmentsByDepartment } from '@/lib/api/departments';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OfficerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: OfficerFormValues) => void;
  officer?: Officer;
  isLoading?: boolean;
}

export function OfficerDialog({
  open,
  onOpenChange,
  onSubmit,
  officer,
  isLoading = false,
}: OfficerDialogProps) {
  const [departments, setDepartments] = useState<Array<{
    value: string;
    label: string;
    subdepartments: Array<{ value: string; label: string }>;
  }>>([]);
  const [subdepartments, setSubdepartments] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoadingDepts, setIsLoadingDepts] = useState(true);
  const [isLoadingSubdepts, setIsLoadingSubdepts] = useState(false);

  // Fetch departments on component mount
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        setIsLoadingDepts(true);
        const depts = await fetchDepartmentsForSelect();
        setDepartments(depts);
        
        // If editing and department is already selected, load its subdepartments
        if (officer?.department_history?.[0]?.department_id) {
          const selectedDeptId = officer.department_history[0].department_id;
          const subdepts = await fetchSubdepartmentsByDepartment(selectedDeptId);
          setSubdepartments(subdepts);
        }
      } catch (error) {
        console.error('Error loading departments:', error);
      } finally {
        setIsLoadingDepts(false);
      }
    };

    loadDepartments();
  }, [officer]);

  // Handle department change to load subdepartments
  const handleDepartmentChange = async (departmentId: string) => {
    if (!departmentId) {
      setSubdepartments([]);
      form.setValue('subdepartment_id', '');
      return;
    }

    try {
      setIsLoadingSubdepts(true);
      const subdepts = await fetchSubdepartmentsByDepartment(departmentId);
      setSubdepartments(subdepts);
      
      // Reset subdepartment if no longer valid for the selected department
      const currentSubdeptId = form.getValues('subdepartment_id');
      if (currentSubdeptId && !subdepts.some(sd => sd.value === currentSubdeptId)) {
        form.setValue('subdepartment_id', '');
      }
    } catch (error) {
      console.error('Error loading subdepartments:', error);
      setSubdepartments([]);
    } finally {
      setIsLoadingSubdepts(false);
    }
  };

  const form = useForm<OfficerFormValues>({
    resolver: zodResolver(officerFormSchema),
    defaultValues: {
      name: officer?.name || '',
      email: officer?.email || '',
      password: '',
      department_id: officer?.department_history?.[0]?.department_id || '',
      subdepartment_id: officer?.department_history?.[0]?.subdepartment_id || '',
      department_start_date: officer?.department_history?.[0]?.start_date || new Date().toISOString().split('T')[0],
      department_end_date: officer?.department_history?.[0]?.end_date || '',
      start_date: officer?.status_history?.[0]?.start_date || new Date().toISOString().split('T')[0],
      end_date: officer?.status_history?.[0]?.end_date || '',
    },
  });

  // Watch department_id to update subdepartments when it changes
  const selectedDepartmentId = form.watch('department_id');
  useEffect(() => {
    if (selectedDepartmentId) {
      handleDepartmentChange(selectedDepartmentId);
    } else {
      setSubdepartments([]);
    }
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (officer?.department_history?.[0]) {
      setCurrentDept({
        department_id: officer.department_history[0].department_id,
        subdepartment_id: officer.department_history[0].subdepartment_id,
        start_date: officer.department_history[0].start_date,
        end_date: officer.department_history[0].end_date || '',
      });
    }
  }, [officer]);

  const handleSubmit = (data: OfficerFormValues) => {
    // Combine form data with department history
    const officerData = {
      ...data,
      department_history: [
        {
          department_id: data.department_id,
          subdepartment_id: data.subdepartment_id,
          start_date: data.department_start_date,
          end_date: data.department_end_date || null,
        },
      ],
      status_history: [
        {
          status: 'active',
          start_date: data.status_history[0].start_date,
          end_date: data.status_history[0].end_date || null,
        },
      ],
    };
    
    onSubmit(officerData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{officer ? 'Edit Officer' : 'Add New Officer'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Officer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Optional)</FormLabel>
                  <Input placeholder="officer@example.com" {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password {officer ? '(Leave blank to keep current)' : ''}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="department_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Dept. ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="subdepartment_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subdepartment ID (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Subdept. ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="department_start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="department_end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department End Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
