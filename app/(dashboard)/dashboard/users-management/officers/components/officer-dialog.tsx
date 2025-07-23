// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Officer, OfficerFormValues, officerFormSchema } from '@/app/(dashboard)/dashboard/users-management/officers/components/officers-fields';
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
import { DepartmentSelect } from '@/components/department-select';

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
  const [currentDept, setCurrentDept] = useState({
    department_id: '',
    subdepartment_id: '',
    start_date: '',
    end_date: '',
  });

  const form = useForm<OfficerFormValues>({
    resolver: zodResolver(officerFormSchema),
    defaultValues: {
      name: officer?.name || '',
      email: officer?.email || '',
      password: '',
      department_id: officer?.department_history?.[0]?.department_id || '',
      subdepartment_id: officer?.department_history?.[0]?.subdepartment_id || '',
      department_start_date: officer?.department_history?.[0]?.start_date || '',
      department_end_date: officer?.department_history?.[0]?.end_date || '',
      start_date: officer?.status_history?.[0]?.start_date || new Date().toISOString().split('T')[0],
      end_date: officer?.status_history?.[0]?.end_date || '',
    },
  });

  // Log form state after initialization
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      console.log('Form field changed:', { name, type, value });
    });
    return () => subscription.unsubscribe();
  }, [form]);

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
    console.log('Form submitted with values:', JSON.stringify(data, null, 2));
    
    // Get the current date in YYYY-MM-DD format
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Log department and subdepartment values
    console.log('Department ID:', data.department_id);
    console.log('Subdepartment ID:', data.subdepartment_id);
    
    // Combine form data with department history
    const officerData = {
      ...data,
      department_history: [
        {
          department_id: data.department_id,
          subdepartment_id: data.subdepartment_id || null,
          start_date: data.department_start_date || currentDate,
          end_date: data.department_end_date || null,
        },
      ],
      status_history: [
        {
          status: 'active',
          start_date: data.start_date || currentDate,
          end_date: data.end_date || null,
        },
      ],
    };
    
    console.log('Submitting officer data:', JSON.stringify(officerData, null, 2));
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
              required={false}
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

            <FormField
              control={form.control}
              name="department_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <DepartmentSelect
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        // Reset subdepartment when department changes
                        if (form.getValues('subdepartment_id')) {
                          form.setValue('subdepartment_id', '');
                        }
                      }}
                      subDepartmentValue={form.watch('subdepartment_id')}
                      onSubDepartmentChange={(value) => {
                        form.setValue('subdepartment_id', value);
                      }}
                      required={true}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
                      <FormLabel>End Date (Optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
