// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
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
import { createUser } from './database'
import { fetchDepartments } from '../departments/database'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const officerFormSchema = z.object({
    name: z.string().min(2, {
        message: 'Name must be at least 2 characters.',
    }),
    email: z.string().email('Please enter a valid email'),
    password: z.string().min(8, {
        message: 'Password must be at least 8 characters.',
    }),
    department_id: z.string().min(1, 'Please select a department'),
    department_start_date: z.string().min(1, 'Start date is required'),
    department_end_date: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional(),
})

type OfficerFormValues = z.infer<typeof officerFormSchema>

interface AddOfficerDialogProps {
    onOfficerAdded: () => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function AddOfficerDialog({
    onOfficerAdded,
    open: propOpen,
    onOpenChange: propOnOpenChange
}: AddOfficerDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = propOpen !== undefined ? propOpen : internalOpen
    const setOpen = propOnOpenChange || setInternalOpen
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [departments, setDepartments] = useState<any[]>([])

    const form = useForm<OfficerFormValues>({
        resolver: zodResolver(officerFormSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            department_id: '',
            department_start_date: new Date().toISOString().split('T')[0],
            start_date: new Date().toISOString().split('T')[0],
        },
    })

    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const depts = await fetchDepartments()
                setDepartments(depts)
            } catch (error) {
                console.error('Error loading departments:', error)
                toast({
                    title: 'Error',
                    description: 'Failed to load departments',
                    variant: 'destructive',
                })
            }
        }


        if (open) {
            loadDepartments()
        }
    }, [open])

    const onSubmit: SubmitHandler<OfficerFormValues> = async (data) => {
        try {
            setIsLoading(true)

            // Create officer with department history
            await createUser({
                name: data.name,
                email: data.email,
                password: data.password,
                role: 'officer',
                status_history: [{
                    start_date: data.start_date,
                    end_date: data.end_date || null,
                }],
                department_history: [{
                    department_id: data.department_id,
                    start_date: data.department_start_date,
                    end_date: data.department_end_date || null,
                    assigned_at: new Date().toISOString(),
                    assigned_by: 'system',
                }]
            })

            toast({
                title: 'Officer created',
                description: 'The officer has been added successfully.',
            })

            if (onOfficerAdded) {
                onOfficerAdded()
            }
            setOpen(false)
            form.reset()
        } catch (error) {
            console.error('Error creating officer:', error)
            toast({
                title: 'Error',
                description: 'There was an error creating the officer. Please try again.',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

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
                    <DialogTitle>Add New Officer</DialogTitle>
                    <DialogDescription>
                        Add a new officer and assign them to a department.
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
                                        <Input placeholder="officer@example.com" type="email" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a department" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {departments.map((dept) => (
                                                    <SelectItem key={dept.id} value={dept.id}>
                                                        {dept.name}
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
                                {isLoading ? 'Saving...' : 'Save Officer'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
