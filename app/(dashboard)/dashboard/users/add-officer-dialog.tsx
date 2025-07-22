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

// Enhanced logging utility
const logger = {
    info: (message: string, data?: any) => {
        console.log(`[OFFICER_DIALOG] ${message}`, data ? { ...data, timestamp: new Date().toISOString() } : { timestamp: new Date().toISOString() });
    },
    error: (message: string, error?: any) => {
        console.error(`[OFFICER_DIALOG] ${message}`, { error, timestamp: new Date().toISOString() });
    },
    warn: (message: string, data?: any) => {
        console.warn(`[OFFICER_DIALOG] ${message}`, data ? { ...data, timestamp: new Date().toISOString() } : { timestamp: new Date().toISOString() });
    },
    debug: (message: string, data?: any) => {
        console.debug(`[OFFICER_DIALOG] ${message}`, data ? { ...data, timestamp: new Date().toISOString() } : { timestamp: new Date().toISOString() });
    }
};

const officerFormSchema = z.object({
    name: z.string().min(2, {
        message: 'Name must be at least 2 characters.',
    }),
    email: z.string().optional(),
    // Password is optional for edit mode, required for create mode
    password: z.string().optional(),
    department_id: z.string().optional(), // Made optional to handle edit mode without department
    subdepartment_id: z.string().optional(),
    department_start_date: z.string().optional(), // Made optional for edit mode
    department_end_date: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional(),
})
// Create a more specific schema for creation mode
.refine(data => {
    // For creation mode, require password
    if (!data.id && (!data.password || data.password.length < 8)) {
        return false;
    }
    return true;
}, {
    message: 'Password must be at least 8 characters.',
    path: ['password'],
})
// For creation mode, require department
.refine(data => {
    // This will be handled in the component validation since we need to know edit mode
    return true;
}, {
    message: 'Department is required for new officers.',
    path: ['department_id'],
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

    // Log dialog mode when component initializes
    useEffect(() => {
        logger.info('Dialog component initialized', {
            mode: isEditMode ? 'EDIT' : 'CREATE',
            officerId: propOfficer?.id,
            officerName: propOfficer?.name,
            departmentsCount: propDepartments.length
        });
    }, [isEditMode, propOfficer, propDepartments]);

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
            logger.info('Starting department loading and form setup', { 
                isDialogOpen: open, 
                isEditMode, 
                hasOfficerData: !!propOfficer 
            });

            try {
                logger.debug('Fetching departments from database');
                const depts = await fetchDepartments()
                logger.info('Departments loaded successfully', { 
                    departmentCount: depts.length,
                    departmentIds: depts.map(d => d.id)
                });
                setDepartments(depts)
                
                if (isEditMode && propOfficer) {
                    logger.info('Setting up form for EDIT mode', {
                        officerId: propOfficer.id,
                        officerName: propOfficer.name,
                        currentDepartmentId: propOfficer.department_id,
                        currentSubdepartmentId: propOfficer.subdepartment_id,
                        hasDepartmentAssigned: !!(propOfficer.department_id && propOfficer.department_id.trim())
                    });

                    // --- EDIT MODE ---
                    // Find the officer's current department (handle empty/null department_id)
                    const currentDept = (propOfficer.department_id && propOfficer.department_id.trim()) 
                        ? depts.find(d => String(d.id) === String(propOfficer.department_id))
                        : null;
                    
                    if (currentDept) {
                        logger.debug('Found current department for officer', {
                            departmentId: currentDept.id,
                            departmentName: currentDept.name,
                            subdepartmentCount: currentDept.tm_subdepartments?.length || 0
                        });
                        setSubdepartments(currentDept.tm_subdepartments || [])
                    } else {
                        if (propOfficer.department_id && propOfficer.department_id.trim()) {
                            logger.warn('Current department not found for officer', {
                                searchedDepartmentId: propOfficer.department_id,
                                availableDepartments: depts.map(d => ({ id: d.id, name: d.name }))
                            });
                        } else {
                            logger.info('Officer has no department assignment', {
                                officerId: propOfficer.id,
                                departmentId: propOfficer.department_id
                            });
                        }
                        setSubdepartments([])
                    }
                    
                    // Log the data being set in edit mode
                    const editFormData = {
                        name: propOfficer.name || '',
                        email: propOfficer.email || '',
                        password: '', // Password is not edited
                        department_id: (propOfficer.department_id && propOfficer.department_id.trim()) ? propOfficer.department_id : '',
                        subdepartment_id: (propOfficer.subdepartment_id && propOfficer.subdepartment_id.trim()) ? propOfficer.subdepartment_id : '',
                        department_start_date: propOfficer.department_start_date || new Date().toISOString().split('T')[0],
                        department_end_date: propOfficer.department_end_date || undefined,
                        start_date: propOfficer.start_date || new Date().toISOString().split('T')[0],
                        end_date: propOfficer.end_date || undefined,
                    };

                    logger.debug('Resetting form with officer data', { 
                        editFormData,
                        originalOfficerData: {
                            id: propOfficer.id,
                            name: propOfficer.name,
                            email: propOfficer.email,
                            department_id: propOfficer.department_id,
                            subdepartment_id: propOfficer.subdepartment_id,
                            department_start_date: propOfficer.department_start_date,
                            department_end_date: propOfficer.department_end_date,
                            start_date: propOfficer.start_date,
                            end_date: propOfficer.end_date
                        }
                    });
                    
                    // Reset the form with the officer's data
                    form.reset(editFormData);
                    
                    logger.info('Form successfully set up for editing officer', {
                        officerId: propOfficer.id,
                        fieldsPopulated: Object.keys(editFormData).filter(key => editFormData[key] && editFormData[key] !== ''),
                        emptyFields: Object.keys(editFormData).filter(key => !editFormData[key] || editFormData[key] === ''),
                        departmentAssigned: !!(editFormData.department_id),
                        subdepartmentAssigned: !!(editFormData.subdepartment_id)
                    });

                } else {
                    logger.info('Setting up form for CREATE mode');
                    
                    // --- ADD MODE ---
                    const createFormData = {
                        name: '', email: '', password: '',
                        department_id: '', subdepartment_id: '',
                        department_start_date: new Date().toISOString().split('T')[0],
                        start_date: new Date().toISOString().split('T')[0],
                    };

                    logger.debug('Resetting form for new officer creation', { createFormData });
                    
                    // Reset form for a new officer
                    form.reset(createFormData)
                    setSubdepartments([])
                    
                    logger.info('Form successfully set up for creating new officer');
                }
            } catch (error) {
                logger.error('Error during department loading and form setup', error);
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
        logger.info('Form submission initiated', { 
            mode: isEditMode ? 'EDIT' : 'CREATE',
            officerId: propOfficer?.id,
            submittedFields: Object.keys(data).filter(key => data[key]),
            formData: {
                ...data,
                password: data.password ? '[REDACTED]' : undefined // Don't log actual password
            },
            currentTime: new Date().toISOString()
        });
        
        logger.debug('Form submission context', {
            isEditMode,
            hasOfficerData: !!propOfficer,
            hasDepartmentSelected: !!data.department_id,
            hasSubdepartmentSelected: !!data.subdepartment_id
        });

        try {
            setIsLoading(true);
            
            // Enhanced validation logging
            logger.debug('Starting form validation', { 
                data: {
                    ...data,
                    password: data.password ? '[REDACTED]' : undefined
                },
                mode: isEditMode ? 'EDIT' : 'CREATE',
                validationChecks: {
                    hasName: !!data.name,
                    hasDepartment: !!data.department_id,
                    hasEmail: !!data.email,
                    hasPassword: !!data.password
                },
                validationRules: {
                    nameRequired: true,
                    departmentRequired: !isEditMode, // Department not required in edit mode
                    emailRequired: !isEditMode, // Email not required in edit mode
                    passwordRequired: !isEditMode // Password not required in edit mode
                }
            });
            
            if (!data.name) {
                logger.error('Validation failed: Name is required', { providedName: data.name });
                throw new Error('Name is required');
            }
            
            // For edit mode, allow saving without department (can be assigned later)
            // For create mode, department is required
            if (!isEditMode && !data.department_id) {
                logger.error('Validation failed: Department is required for new officers', { 
                    providedDepartmentId: data.department_id,
                    mode: 'CREATE'
                });
                throw new Error('Department is required for new officers');
            }
            
            if (!isEditMode && (!data.email || !data.password)) {
                logger.error('Validation failed: Email and password required for new officers', { 
                    hasEmail: !!data.email, 
                    hasPassword: !!data.password 
                });
                throw new Error('Email and password are required for new officers');
            }

            logger.info('Form validation passed successfully', {
                mode: isEditMode ? 'EDIT' : 'CREATE',
                departmentWillBeAssigned: !!data.department_id
            });

            // Format dates properly
            const formattedData = {
                ...data,
                department_start_date: data.department_start_date || new Date().toISOString().split('T')[0],
                department_end_date: data.department_end_date || null,
                start_date: data.start_date || new Date().toISOString().split('T')[0],
                end_date: data.end_date || null,
                subdepartment_id: data.subdepartment_id || null
            };

            logger.debug('Final formatted data for submission', {
                originalData: {
                    ...data,
                    password: data.password ? '[REDACTED]' : undefined
                },
                formattedData: {
                    ...formattedData,
                    password: formattedData.password ? '[REDACTED]' : undefined
                },
                transformations: {
                    departmentStartDateSet: !data.department_start_date,
                    departmentEndDateCleared: !data.department_end_date,
                    startDateSet: !data.start_date,
                    endDateCleared: !data.end_date,
                    subdepartmentIdCleared: !data.subdepartment_id
                }
            });

            logger.debug('Data formatted for submission', { 
                originalData: data, 
                formattedData,
                dataTransformations: {
                    departmentStartDateSet: !data.department_start_date,
                    departmentEndDateCleared: !data.department_end_date,
                    startDateSet: !data.start_date,
                    endDateCleared: !data.end_date,
                    subdepartmentIdCleared: !data.subdepartment_id
                }
            });

            if (isEditMode && propOfficer) {
                logger.info('Starting officer update process', {
                    operation: 'UPDATE_OFFICER',
                    officerId: propOfficer.id,
                    officerName: propOfficer.name,
                    currentDepartment: propOfficer.department_id || 'NONE',
                    newDepartment: formattedData.department_id || 'NONE',
                    currentSubdepartment: propOfficer.subdepartment_id || 'NONE',
                    newSubdepartment: formattedData.subdepartment_id || 'NONE',
                    updateType: formattedData.department_id ? 'ASSIGN_DEPARTMENT' : 'UPDATE_WITHOUT_DEPARTMENT',
                    changes: {
                        nameChanged: propOfficer.name !== formattedData.name,
                        emailChanged: propOfficer.email !== formattedData.email,
                        departmentChanged: propOfficer.department_id !== formattedData.department_id,
                        subdepartmentChanged: propOfficer.subdepartment_id !== formattedData.subdepartment_id,
                        datesChanged: {
                            startDate: propOfficer.start_date !== formattedData.start_date,
                            endDate: propOfficer.end_date !== formattedData.end_date,
                            deptStartDate: propOfficer.department_start_date !== formattedData.department_start_date,
                            deptEndDate: propOfficer.department_end_date !== formattedData.department_end_date
                        }
                    }
                });

                // Log if department/subdepartment is changing
                const departmentChanging = propOfficer.department_id !== formattedData.department_id;
                const subdepartmentChanging = propOfficer.subdepartment_id !== formattedData.subdepartment_id;

                if (departmentChanging) {
                    logger.info('Department change detected', {
                        from: propOfficer.department_id || 'NONE',
                        to: formattedData.department_id || 'NONE',
                        changeType: !propOfficer.department_id ? 'INITIAL_ASSIGNMENT' : 
                                   !formattedData.department_id ? 'DEPARTMENT_REMOVAL' : 'DEPARTMENT_CHANGE'
                    });
                }

                if (subdepartmentChanging) {
                    logger.info('Subdepartment change detected', {
                        from: propOfficer.subdepartment_id || 'NONE',
                        to: formattedData.subdepartment_id || 'NONE'
                    });
                }

                // Only update department assignment if a department is selected
                if (formattedData.department_id) {
                    const departmentUpdatePayload = {
                        officerId: propOfficer.id,
                        departmentId: formattedData.department_id,
                        subdepartmentId: formattedData.subdepartment_id,
                        startDate: formattedData.department_start_date,
                        endDate: formattedData.department_end_date,
                        changedBy: 'system',
                        timestamp: new Date().toISOString()
                    };
                    
                    logger.debug('Calling updateOfficerDepartment API', {
                        ...departmentUpdatePayload,
                        context: 'Updating officer department assignment',
                        previousDepartment: propOfficer.department_id || 'NONE',
                        previousSubdepartment: propOfficer.subdepartment_id || 'NONE',
                        isNewAssignment: !propOfficer.department_id,
                        isDepartmentChange: propOfficer.department_id && propOfficer.department_id !== formattedData.department_id
                    });

                    try {
                        // Update existing officer department assignment
                        logger.debug('Initiating department assignment update');
                        const updateResult = await updateOfficerDepartment(
                            propOfficer.id,
                            formattedData.department_id,
                            formattedData.subdepartment_id,
                            'system',
                            formattedData.department_start_date,
                            formattedData.department_end_date
                        );

                        logger.info('Officer department update completed successfully', {
                            officerId: propOfficer.id,
                            operation: 'UPDATE_DEPARTMENT',
                            departmentAssigned: formattedData.department_id,
                            subdepartmentAssigned: formattedData.subdepartment_id,
                            updateResult: updateResult ? 'SUCCESS' : 'UNKNOWN_RESULT',
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        logger.error('Failed to update officer department', {
                            error: error instanceof Error ? error.message : 'Unknown error',
                            errorType: error?.constructor?.name,
                            officerId: propOfficer.id,
                            departmentId: formattedData.department_id,
                            subdepartmentId: formattedData.subdepartment_id,
                            timestamp: new Date().toISOString()
                        });
                        throw error; // Re-throw to be caught by the outer catch
                    }
                } else {
                    logger.info('Officer update completed without department assignment', {
                        officerId: propOfficer.id,
                        operation: 'UPDATE_NO_DEPARTMENT',
                        reason: 'No department selected'
                    });
                }

                toast({
                    title: 'Success',
                    description: 'Officer updated successfully',
                });
                
            } else {
                logger.info('Starting new officer creation process', {
                    officerName: formattedData.name,
                    email: formattedData.email,
                    department: formattedData.department_id,
                    subdepartment: formattedData.subdepartment_id
                });

                logger.debug('Calling createUser API', {
                    name: formattedData.name,
                    email: formattedData.email,
                    role: 'officer',
                    hasPassword: !!formattedData.password
                });

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

                logger.info('New officer created successfully', {
                    officerId: newOfficer.id,
                    officerName: newOfficer.name,
                    operation: 'CREATE'
                });

                // Assign department
                if (formattedData.department_id) {
                    logger.debug('Assigning department to new officer', {
                        officerId: newOfficer.id,
                        departmentId: formattedData.department_id,
                        subdepartmentId: formattedData.subdepartment_id
                    });

                    await updateOfficerDepartment(
                        newOfficer.id,
                        formattedData.department_id,
                        formattedData.subdepartment_id,
                        'system',
                        formattedData.department_start_date,
                        formattedData.department_end_date
                    );

                    logger.info('Department assignment completed for new officer', {
                        officerId: newOfficer.id,
                        departmentId: formattedData.department_id
                    });
                }

                toast({
                    title: 'Success',
                    description: 'Officer created successfully',
                });
            }

            // Refresh parent component and reset form
            logger.debug('Triggering parent component refresh');
            if (onOfficerAdded) {
                await onOfficerAdded();
                logger.info('Parent component refresh completed');
            }
            
            logger.debug('Closing dialog and resetting form');
            setOpen(false);
            form.reset();
            
            logger.info('Form submission completed successfully', {
                mode: isEditMode ? 'EDIT' : 'CREATE',
                operation: 'SUCCESS'
            });
            
        } catch (error) {
            logger.error('Form submission failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error?.constructor?.name,
                mode: isEditMode ? 'EDIT' : 'CREATE',
                officerId: propOfficer?.id,
                submittedData: data
            });

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
            logger.debug('Form submission process completed, loading state cleared');
        }
    };

    // Log department selection changes
    const handleDepartmentChange = (value: string, field: any) => {
        // Handle 'no-department' case by converting to empty string
        const actualValue = value === 'no-department' ? '' : value;
        logger.info('Department selection changed', {
            newDepartmentId: actualValue || 'NONE',
            previousDepartmentId: field.value || 'NONE',
            isNoDepartmentSelected: actualValue === ''
        });

        field.onChange(value);
        
        // Reset subdepartment
        form.setValue('subdepartment_id', '');
        logger.debug('Subdepartment reset due to department change');
        
        // Find the selected department and update subdepartments state
        if (value && value.trim()) {
            const selectedDept = departments.find(d => String(d.id) === value);
            
            if (selectedDept && selectedDept.tm_subdepartments) {
                logger.debug('Loading subdepartments for selected department', {
                    departmentId: selectedDept.id,
                    departmentName: selectedDept.name,
                    subdepartmentCount: selectedDept.tm_subdepartments.length,
                    subdepartments: selectedDept.tm_subdepartments.map(s => ({ id: s.id, name: s.name }))
                });
                setSubdepartments(selectedDept.tm_subdepartments);
            } else {
                logger.debug('No subdepartments found for selected department', {
                    departmentId: value,
                    departmentFound: !!selectedDept
                });
                setSubdepartments([]);
            }
        } else {
            logger.debug('No department selected, clearing subdepartments');
            setSubdepartments([]);
        }
    };

    // Log subdepartment selection changes
    const handleSubdepartmentChange = (value: string, field: any) => {
        const actualValue = value === 'none' ? '' : value;
        logger.info('Subdepartment selection changed', {
            newSubdepartmentId: actualValue,
            previousSubdepartmentId: field.value,
            isNoneSelected: value === 'none'
        });
        field.onChange(actualValue);
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
                                        <FormLabel>
                                            Department {isEditMode ? '(Optional)' : ''}
                                        </FormLabel>
                                        <Select 
                                            onValueChange={(value) => handleDepartmentChange(value, field)}
                                            value={field.value === 'no-department' ? '' : field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={
                                                        isEditMode 
                                                            ? "Select a department (optional)" 
                                                            : "Select a department"
                                                    } />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {isEditMode && (
                                                    <SelectItem value="no-department">
                                                        No Department
                                                    </SelectItem>
                                                )}
                                                {departments.map((dept) => (
                                                    <SelectItem key={dept.id} value={String(dept.id)}>
                                                        {dept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                        {isEditMode && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                You can update the officer without assigning a department
                                            </p>
                                        )}
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
                                            onValueChange={(value) => handleSubdepartmentChange(value, field)}
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
                                            <FormLabel>
                                                Assignment Start {isEditMode && !form.watch('department_id') ? '(Optional)' : ''}
                                            </FormLabel>
                                            <FormControl>
                                                <Input 
                                                    type="date" 
                                                    {...field}
                                                    disabled={isEditMode && !form.watch('department_id')}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                            {isEditMode && !form.watch('department_id') && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Select a department to set assignment dates
                                                </p>
                                            )}
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
                                                    disabled={isEditMode && !form.watch('department_id')}
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