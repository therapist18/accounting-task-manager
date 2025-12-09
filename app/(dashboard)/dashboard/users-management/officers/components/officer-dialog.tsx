// @ts-nocheck
'use client';

import { useEffect } from 'react';
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
  DialogDescription,
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
import { User, Mail, Lock, Calendar, Building2, Plus, Clock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const form = useForm<OfficerFormValues>({
    resolver: zodResolver(officerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      department_id: '',
      subdepartment_id: '',
      department_start_date: new Date().toISOString().split('T')[0],
      department_end_date: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
    },
  });

  // Reset form values when dialog opens or officer changes
  useEffect(() => {
    if (open) {
      if (officer) {
        // --- EDIT MODE ---
        const currentDept = officer.department_history?.[0];
        const currentStatus = officer.status_history?.[0];

        const formatDate = (dateString: string | undefined | null) => {
          if (!dateString) return '';
          try {
            return new Date(dateString).toISOString().split('T')[0];
          } catch (e) { return ''; }
        };

        form.reset({
          name: officer.name || '',
          email: officer.email || '',
          password: '',
          department_id: currentDept?.department_id || '',
          subdepartment_id: currentDept?.subdepartment_id || '',
          department_start_date: formatDate(currentDept?.start_date),
          department_end_date: formatDate(currentDept?.end_date),
          start_date: formatDate(currentStatus?.start_date),
          end_date: formatDate(currentStatus?.end_date),
        });
      } else {
        // --- ADD MODE ---
        const today = new Date().toISOString().split('T')[0];
        form.reset({
          name: '',
          email: '',
          password: '',
          department_id: '',
          subdepartment_id: '',
          department_start_date: today,
          department_end_date: '',
          start_date: today,
          end_date: '',
        });
      }
    }
  }, [open, officer, form]);

  // Helper component for consistent table rows
  const FormRow = ({ label, icon: Icon, children, className, description }: any) => (
    <div className={cn("grid grid-cols-12 gap-4 items-start p-4 border-b last:border-0 hover:bg-gray-50/50 transition-colors", className)}>
      <div className="col-span-12 sm:col-span-4 space-y-1 mt-2">
        <FormLabel className="text-sm font-medium text-gray-700 flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-gray-500" />}
          {label}
        </FormLabel>
        {description && <p className="text-xs text-gray-500 font-normal">{description}</p>}
      </div>
      <div className="col-span-12 sm:col-span-8">
        {children}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden gap-0 bg-white">
        <DialogHeader className="p-6 pb-4 bg-gray-50 border-b">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", officer ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600")}>
              {officer ? <User className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900">
                {officer ? 'Edit Officer Profile' : 'Register New Officer'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {officer
                  ? 'Manage account details, assignments, and access duration.'
                  : 'Create a new officer account and assign them to a department.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col max-h-[75vh]">
            <div className="overflow-y-auto">

              {/* --- GROUP 1: ESSENTIALS --- */}
              <div className="bg-gray-50/30">
                <div className="px-4 py-2 bg-gray-100 border-y text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Identity & Access
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Full Name" icon={User}>
                        <FormControl>
                          <Input placeholder="e.g. John Doe" {...field} className="bg-white" />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Email Address" icon={Mail}>
                        <FormControl>
                          <Input placeholder="john@company.com" {...field} className="bg-white" />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow
                        label="Password"
                        icon={Lock}
                        description={officer ? "Leave blank to keep current password" : "Required for new accounts"}
                      >
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={officer ? "••••••••" : "Set secure password"}
                            {...field}
                            className="bg-white"
                          />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />
              </div>

              {/* --- GROUP 2: DEPARTMENT --- */}
              <div className="mt-0">
                <div className="px-4 py-2 bg-gray-100 border-y text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Assignment
                </div>

                <FormField
                  control={form.control}
                  name="department_id"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Department" icon={Building2} description="Select Department & Subdepartment">
                        <FormControl>
                          <DepartmentSelect
                            value={field.value}
                            onChange={(value) => {
                              field.onChange(value);
                              form.setValue('subdepartment_id', '');
                            }}
                            subDepartmentValue={form.watch('subdepartment_id')}
                            onSubDepartmentChange={(value) => {
                              form.setValue('subdepartment_id', value);
                            }}
                            required={true}
                          />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="department_start_date"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Assignment Start" icon={Calendar} className="border-r border-b-0 sm:border-b last:border-b-0">
                        <FormControl>
                          <Input type="date" {...field} className="bg-white" />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department_end_date"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Assignment End" icon={Calendar} className="border-b-0 sm:border-b last:border-b-0" description="Optional">
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} className="bg-white" />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />
              </div>

              {/* --- GROUP 3: ACCOUNT STATUS --- */}
              <div className="mt-0">
                <div className="px-4 py-2 bg-gray-100 border-y text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Account Status Duration
                </div>

                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Active From" icon={ShieldCheck} className="border-r border-b-0">
                        <FormControl>
                          <Input type="date" {...field} className="bg-white" />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormRow label="Active Until" icon={Clock} className="border-b-0" description="Optional">
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} className="bg-white" />
                        </FormControl>
                        <FormMessage className="mt-1" />
                      </FormRow>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-white border-t sticky bottom-0 z-10">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[100px]">
                  {isLoading ? 'Saving...' : (officer ? 'Save Changes' : 'Create Account')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}