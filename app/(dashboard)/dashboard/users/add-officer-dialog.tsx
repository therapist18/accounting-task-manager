// @ts-nocheck
'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Eye, EyeOff, Pencil } from 'lucide-react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { createUser, updateOfficerDepartment } from './database'
import { fetchDepartments } from '../departments/departments/database'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import supabase from '@/lib/supabase/client'

const officerFormSchema = z.object({
    name: z.string().min(2, {
        message: 'Name must be at least 2 characters.',
    }),
    email: z.string().optional(),
    // Password is optional for edit mode, required for create mode
    password: z.string().optional(),
    department_id: z.string().min(1, 'Please select a department'),
    subdepartment_id: z.string().optional(),
    department_start_date: z.string().min(1, 'Start date is required'),
    department_end_date: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional(),
})
// Create a more specific schema for creation mode
.refine(data => !data.id && data.password && data.password.length >= 8, {
    message: 'Password must be at least 8 characters.',
    path: ['password'],
})


type OfficerFormValues = z.infer<typeof officerFormSchema>

// Updated interface to match the JSON data structure from Supabase
interface Department {
    id: string | number
    name: string
    tm_subdepartments: Array<{
        id: string | number
        name: string
        taskManagerId?: string
        taskAssistantId?: string
    }>
}
interface AddOfficerDialogProps {
    onOfficerAdded: () => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
    officer?: Officer | null
    departments?: Department[]
}

export function AddOfficerDialog({
    onOfficerAdded,
    open: propOpen,
    onOpenChange: propOnOpenChange,
    officer: propOfficer,
    departments: propDepartments = []
}: AddOfficerDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = propOpen !== undefined ? propOpen : internalOpen
    const setOpen = propOnOpenChange || setInternalOpen
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [departments, setDepartments] = useState<Department[]>(propDepartments)
    const [subdepartments, setSubdepartments] = useState<Department['tm_subdepartments']>([])

    const isEditMode = !!propOfficer?.id

    const form = useForm<OfficerFormValues>({
        resolver: zodResolver(officerFormSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            department_id: '',
            subdepartment_id: '',
            department_start_date: new Date().toISOString().split('T')[0],
            department_end_date: undefined,
            start_date: new Date().toISOString().split('T')[0],
            end_date: undefined,
        },
    })
    
    useEffect(() => {
        const loadDepartmentsAndSetupForm = async () => {
            try {
                const depts = await fetchDepartments()
                setDepartments(depts)
                
                if (isEditMode && propOfficer) {
                    // --- EDIT MODE ---
                    // Find the officer's current department
                    const currentDept = depts.find(d => String(d.id) === String(propOfficer.department_id))
                    
                    // If department is found, populate the subdepartments dropdown
                    if (currentDept) {
                        setSubdepartments(currentDept.tm_subdepartments || [])
                    } else {
                        setSubdepartments([])
                    }
                    
                    // Reset the form with the officer's data
                    form.reset({
                        name: propOfficer.name || '',
                        email: propOfficer.email || '',
                        password: '', // Password is not edited
                        department_id: propOfficer.department_id || '',
                        subdepartment_id: propOfficer.subdepartment_id || '',
                        department_start_date: propOfficer.department_start_date || new Date().toISOString().split('T')[0],
                        department_end_date: propOfficer.department_end_date || undefined,
                        start_date: propOfficer.start_date || new Date().toISOString().split('T')[0],
                        end_date: propOfficer.end_date || undefined,
                    });
                } else {
                    // --- ADD MODE ---
                    // Reset form for a new officer
                    form.reset({
                        name: '', email: '', password: '',
                        department_id: '', subdepartment_id: '',
                        department_start_date: new Date().toISOString().split('T')[0],
                        start_date: new Date().toISOString().split('T')[0],
                    })
                    setSubdepartments([])
                }
            } catch (error) {
                console.error('Error loading departments:', error)
                toast({
                    title: 'Error',
                    description: 'Failed to load departments.',
                    variant: 'destructive',
                })
            }
        }

        if (open) {
            loadDepartmentsAndSetupForm()
        }
    }, [open, isEditMode, propOfficer, form])

    const onSubmit: SubmitHandler<OfficerFormValues> = async (data) => {
        try {
            console.log('Form submission started', { data, isEditMode });
            setIsLoading(true);
            
            // Validate required fields
            if (!data.name) {
                throw new Error('Name is required');
            }
            if (!data.department_id) {
                throw new Error('Department is required');
            }
            if (!isEditMode && (!data.email || !data.password)) {
                throw new Error('Email and password are required for new officers');
            }

            // Format dates properly
            const formattedData = {
                ...data,
                department_start_date: data.department_start_date || new Date().toISOString().split('T')[0],
                department_end_date: data.department_end_date || null,
                start_date: data.start_date || new Date().toISOString().split('T')[0],
                end_date: data.end_date || null,
                subdepartment_id: data.subdepartment_id || null
            };

            console.log('Submitting data:', formattedData);

            if (isEditMode && propOfficer) {
                // Update existing officer
                await updateOfficerDepartment(
                    propOfficer.id,
                    formattedData.department_id,
                    formattedData.subdepartment_id,
                    'system',
                    formattedData.department_start_date,
                    formattedData.department_end_date
                );

                toast({
                    title: 'Success',
                    description: 'Officer updated successfully',
                });
                
            } else {
                // Create new officer
                const newOfficer = await createUser({
                    name: formattedData.name,
                    email: formattedData.email,
                    password: formattedData.password,
                    role: 'officer',
                    clerk_id: `officer_${Date.now()}`,
                    status_history: [{
                        status: 'active',
                        changed_at: new Date().toISOString(),
                        changed_by: 'system',
                        reason: 'Officer account created',
                        start_date: formattedData.start_date,
                        end_date: formattedData.end_date
                    }]
                });

                // Assign department
                if (formattedData.department_id) {
                    await updateOfficerDepartment(
                        newOfficer.id,
                        formattedData.department_id,
                        formattedData.subdepartment_id,
                        'system',
                        formattedData.department_start_date,
                        formattedData.department_end_date
                    );
                }

                toast({
                    title: 'Success',
                    description: 'Officer created successfully',
                });
            }

            // Refresh parent component and reset form
            if (onOfficerAdded) {
                await onOfficerAdded();
            }
            
            setOpen(false);
            form.reset();
            
        } catch (error) {
            console.error('Form submission error:', error);
            toast({
                title: 'Error',
                description: error instanceof Error 
                    ? error.message 
                    : 'An unexpected error occurred. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Officer
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Officer' : 'Add New Officer'}</DialogTitle>
                    <DialogDescription>
                        {isEditMode 
                            ? 'Update officer details and department assignment.'
                            : 'Add a new officer and assign them to a department.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="John Doe" {...field} />
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
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="officer@example.com" 
                                            type="email" 
                                            {...field} 
                                            disabled={isEditMode}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {!isEditMode && (
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    placeholder="••••••••"
                                                    type={showPassword ? 'text' : 'password'}
                                                    autoComplete="new-password"
                                                    {...field}
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

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
                                            <Input
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                onChange={(e) => field.onChange(e.target.value || undefined)}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="text-sm font-medium mb-4">Department Assignment</h4>

                            <FormField
                                control={form.control}
                                name="department_id"
                                render={({ field }) => (
                                    <FormItem className="mb-4">
                                        <FormLabel>Department</FormLabel>
                                        <Select 
                                            onValueChange={(value) => {
                                                field.onChange(value);
                                                
                                                // Reset subdepartment
                                                form.setValue('subdepartment_id', '');
                                                
                                                // Find the selected department and update subdepartments state
                                                const selectedDept = departments.find(d => String(d.id) === value);
                                                
                                                // Correctly check for tm_subdepartments from the API data
                                                if (selectedDept && selectedDept.tm_subdepartments) {
                                                    setSubdepartments(selectedDept.tm_subdepartments);
                                                } else {
                                                    setSubdepartments([]);
                                                }
                                            }} 
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a department" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {departments.map((dept) => (
                                                    <SelectItem key={dept.id} value={String(dept.id)}>
                                                        {dept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="subdepartment_id"
                                render={({ field }) => (
                                    <FormItem className="mb-4">
                                        <FormLabel>Subdepartment</FormLabel>
                                        <Select 
                                            onValueChange={(value) => {
                                                field.onChange(value === 'none' ? '' : value)
                                            }} 
                                            value={field.value || 'none'}
                                            disabled={!form.watch('department_id') || subdepartments.length === 0}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a subdepartment" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="none">
                                                    None
                                                </SelectItem>
                                                {subdepartments.map((subdept) => (
                                                    <SelectItem key={subdept.id} value={String(subdept.id)}>
                                                        {subdept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="department_start_date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Assignment Start</FormLabel>
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
                                            <FormLabel>Assignment End (Optional)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="date"
                                                    {...field}
                                                    value={field.value || ''}
                                                    onChange={(e) => field.onChange(e.target.value || undefined)}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? 'Saving...' : (isEditMode ? 'Update Officer' : 'Save Officer')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}