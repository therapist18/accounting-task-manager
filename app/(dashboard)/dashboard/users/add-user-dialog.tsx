// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Eye, EyeOff, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { UserRole } from './database'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { createUser } from '@/app/(dashboard)/dashboard/users/database'

const userFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Name must be at least 2 characters.',
  }),
  email: z.string().optional(),
  password: z.string().min(8, {
    message: 'Password must be at least 8 characters.',
  }),
  role: z.enum(['user', 'admin', 'officer']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type UserFormValues = z.infer<typeof userFormSchema>

interface AddUserDialogProps {
  defaultRole?: UserRole
  onUserAdded?: () => void
  user?: User | null
  isEditMode?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface User {
  id?: string | number
  name: string | null
  email: string | null
  role: string
  start_date?: string
  end_date?: string | null
  clerk_id?: string | null
  status_history?: Array<{
    status: 'active' | 'inactive'
    changed_at: string
    changed_by: string
    reason?: string
    start_date: string
    end_date: string | null
  }>
}

export function AddUserDialog({ 
  defaultRole = 'task_assistant', 
  onUserAdded, 
  user: propUser,
  isEditMode = false,
  open: propOpen,
  onOpenChange: propOnOpenChange
}: AddUserDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = propOpen !== undefined ? propOpen : internalOpen
  const setOpen = propOnOpenChange || setInternalOpen
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: propUser?.name || '',
      email: propUser?.email || '',
      password: '',
      role: propUser?.role || (defaultRole === 'officer' ? 'officer' : 'user'),
      start_date: propUser?.status_history?.[0]?.start_date || new Date().toISOString().split('T')[0],
      end_date: propUser?.status_history?.[0]?.end_date || null,
    },
  }) 
  
  // Set up form reset when propUser changes
  useEffect(() => {
    if (propUser) {
      const latestStatus = propUser.status_history?.[propUser.status_history.length - 1]
      form.reset({
        name: propUser.name || '',
        email: propUser.email || '',
        password: '',
        role: propUser.role,
        start_date: latestStatus?.start_date || new Date().toISOString().split('T')[0],
        end_date: latestStatus?.end_date || null,
      })
    } else {
      form.reset({
        name: '',
        email: '',
        password: '',
        role: defaultRole === 'officer' ? 'officer' : 'user',
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
      })
    }
  }, [propUser, defaultRole, form.reset])

  const onSubmit: SubmitHandler<UserFormValues> = async (data) => {
    try {
      setIsLoading(true)
      const now = new Date().toISOString()

      if (isEditMode && propUser?.id) {
        // Get current status history
        const { data: currentUser } = await supabase
          .from('tm_users')
          .select('status_history')
          .eq('id', propUser.id)
          .single()

        const currentHistory = currentUser?.status_history || []
        const latestStatus = currentHistory.length > 0 
          ? currentHistory[currentHistory.length - 1] 
          : null

        // Only update status history if dates have changed
        const datesChanged = latestStatus?.start_date !== data.start_date || 
                           latestStatus?.end_date !== data.end_date

        let updatedStatusHistory = [...currentHistory]
        
        if (datesChanged) {
          updatedStatusHistory.push({
            status: latestStatus?.status || 'active',
            changed_at: now,
            changed_by: 'system',
            reason: 'User details updated',
            start_date: data.start_date || now.split('T')[0],
            end_date: data.end_date || null
          })
        }


        // Update existing user
        const { error } = await supabase
          .from('tm_users')
          .update({
            name: data.name,
            email: data.email,
            role: data.role,
            status_history: updatedStatusHistory,
            updated_at: now
          })
          .eq('id', propUser.id)

        if (error) throw error

        toast({
          title: 'User updated',
          description: 'The user has been updated successfully.',
        })
      } else {
        // Create new user
        // In a real app, you would create the user in Clerk first
        // Then use the returned clerk_id to create the user in your database
        const clerkResponse = { id: `clerk_${Math.random().toString(36).substr(2, 9)}` }

        await createUser({
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          clerk_id: clerkResponse.id,
          start_date: data.start_date,
          end_date: data.end_date
        })

        toast({
          title: 'User created',
          description: 'The user has been added successfully.',
        })
      }

      if (onUserAdded) {
        onUserAdded()
      }
      setOpen(false)
    } catch (error) {
      console.error('Error creating user:', error)
      toast({
        title: 'Error',
        description: 'There was an error creating the user. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }



  const dialogContent = (
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{isEditMode ? 'Edit User' : 'Add New User'}</DialogTitle>
        <DialogDescription>
          {isEditMode 
            ? 'Update user details. Click save when you\'re done.'
            : 'Add a new user to the system. Click save when you\'re done.'}
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
                  <Input placeholder="john@example.com" type="email" {...field} />
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
                      placeholder={isEditMode ? 'Leave blank to keep current' : '••••••••'} 
                      type={showPassword ? 'text' : 'password'} 
                      autoComplete="new-password"
                      {...field} 
                      value={field.value || ''}
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
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="officer">Officer</SelectItem>
                  </SelectContent>
                </Select>
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
                    <Input
                      type="date"
                      {...field}
                      value={field.value || ''}
                    />
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  )

  // Render the dialog with appropriate trigger based on mode
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEditMode && (
        <DialogTrigger asChild>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </DialogTrigger>
      )}
      {dialogContent}
    </Dialog>
  )
}
