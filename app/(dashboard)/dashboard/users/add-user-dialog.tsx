// @ts-nocheck
'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
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
  role: z.enum(['user', 'admin', 'task_manager', 'task_assistant', 'officer']),
  start_date: z.string().optional(),
})

type UserFormValues = z.infer<typeof userFormSchema>

interface AddUserDialogProps {
  defaultRole?: UserRole
  onUserAdded?: () => void
}

export function AddUserDialog({ defaultRole = 'task_assistant', onUserAdded }: AddUserDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: '',
      email: '',
      role: defaultRole === 'officer' ? 'officer' : 'task_assistant',
      start_date: new Date().toISOString().split('T')[0],
    },
  })
  
  const onSubmit: SubmitHandler<UserFormValues> = async (data) => {
    try {
      setIsLoading(true)

      // In a real app, you would create the user in Clerk first
      // Then use the returned clerk_id to create the user in your database
      const clerkResponse = { id: `clerk_${Math.random().toString(36).substr(2, 9)}` }

      await createUser({
        name: data.name,
        email: data.email,
        role: data.role,
        clerk_id: clerkResponse.id,
        start_date: data.start_date
      })

      toast({
        title: 'User created',
        description: 'The user has been added successfully.',
      })

      setOpen(false)
      if (onUserAdded) {
        onUserAdded()
      }
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



  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Add a new user to the system. Click save when you're done.
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
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="task_manager">Task Manager</SelectItem>
                      <SelectItem value="task_assistant">Task Assistant</SelectItem>
                      <SelectItem value="officer">Officer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                      value={field.value || new Date().toISOString().split('T')[0]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
    </Dialog>
  )
}
