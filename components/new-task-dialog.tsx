// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "../lib/supabase/client"

interface Department {
  id: string
  name: string
  created_at: string
}

interface Subdepartment extends Department {
  department_id: string
}

interface User {
  id: string
  name: string | null
  email: string
}

interface ContactDetails {
  email?: {
    primary?: string
    alternative?: string
  }
  phone?: {
    abroad?: {
      primary?: string
      secondary?: string
    }
    kenyan?: {
      primary?: string
      secondary?: string
    }
    whatsapp?: string
  }
}

interface Client {
  id: string
  full_name: string | null
  alternative_email?: string | null
  contact_details?: ContactDetails | null
}

interface FormData {
  job_description: string
  department_id: string
  subdepartment_id: string
  task_manager_id: string
  task_assistant_id: string
  client_id: string
  status: string
  date_initiated: string
}

interface NewTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (task: any) => void
}

export function NewTaskDialog({ open, onOpenChange, onCreate }: NewTaskDialogProps) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [subdepartments, setSubdepartments] = useState<Subdepartment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState<FormData>({
    job_description: '',
    department_id: '',
    subdepartment_id: '',
    task_manager_id: '',
    task_assistant_id: '',
    client_id: '',
    status: 'registered',
    date_initiated: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch departments
        const { data: depts } = await supabase
          .from('tm_departments')
          .select('*')
          .order('name')

        // Fetch users with role 'staff'
        const { data: staff } = await supabase
          .from('tm_users')
          .select('id, name, email')
          .eq('role', 'staff')
          .order('name')

        // Fetch clients with contact details
        const { data: clientData } = await supabase
          .from('registry_individuals')
          .select('id, full_name, alternative_email, contact_details')
          .order('full_name')

        setDepartments(depts || [])
        setUsers(staff || [])
        setClients(clientData || [])
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }


    if (open) {
      fetchData()
    }
  }, [open])

  useEffect(() => {
    const fetchSubdepartments = async () => {
      if (!formData.department_id) return

      const { data } = await supabase
        .from('tm_subdepartments')
        .select('*')
        .eq('department_id', formData.department_id)
        .order('name')

      setSubdepartments(data || [])
      setFormData(prev => ({ ...prev, subdepartment_id: '' }))
    }

    fetchSubdepartments()
  }, [formData.department_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const { data, error } = await supabase
        .from('tm_tasks')
        .insert([{
          job_description: formData.job_description,
          department_id: formData.department_id,
          subdepartment_id: formData.subdepartment_id,
          task_manager_id: formData.task_manager_id || null,
          task_assistant_id: formData.task_assistant_id || null,
          client_id: formData.client_id,
          status: 'registered',
          date_initiated: new Date(formData.date_initiated).toISOString()
        }])
        .select()
        .single()

      if (error) throw error
      if (!data) throw new Error('No data returned from task creation')

      onCreate(data)
      onOpenChange(false)

      // Reset form
      setFormData({
        job_description: '',
        department_id: '',
        subdepartment_id: '',
        task_manager_id: '',
        task_assistant_id: '',
        client_id: '',
        status: 'registered',
        date_initiated: new Date().toISOString().split('T')[0]
      })
    } catch (error) {
      console.error('Error creating task:', error)
      // You might want to show an error toast/message to the user here
    }
  }

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    // When client changes, update the selected client
    if (field === 'client_id') {
      const client = clients.find(c => c.id === value) || null
      setSelectedClient(client)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Enter the details for the new task.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="job-description">Job Description</Label>
            <Textarea
              id="job-description"
              value={formData.job_description}
              onChange={(e) => handleChange('job_description', e.target.value)}
              placeholder="Enter job description"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="date-initiated">Date Initiated</Label>
              <Input
                id="date-initiated"
                type="date"
                value={formData.date_initiated}
                onChange={(e) => handleChange('date_initiated', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="department">Department</Label>
              <Select
                value={formData.department_id || undefined}
                onValueChange={(value: string) => handleChange('department_id', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="subdepartment">Subdepartment</Label>
              <Select
                value={formData.subdepartment_id || undefined}
                onValueChange={(value: string) => handleChange('subdepartment_id', value)}
                disabled={!formData.department_id}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subdepartment" />
                </SelectTrigger>
                <SelectContent>
                  {subdepartments
                    .filter(sub => sub.department_id === formData.department_id)
                    .map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="task-manager">Task Manager</Label>
              <Select
                value={formData.task_manager_id || undefined}
                onValueChange={(value: string) => handleChange('task_manager_id', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select task manager" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-assistant">Task Assistant</Label>
              <Select
                value={formData.task_assistant_id || undefined}
                onValueChange={(value: string) => handleChange('task_assistant_id', value || '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select task assistant (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client">Client</Label>
            <Select
              value={formData.client_id || undefined}
              onValueChange={(value: string) => handleChange('client_id', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.full_name || client.alternative_email || 'Unnamed Client'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedClient && (
              <div className="mt-2 text-sm text-gray-600">
                {selectedClient.alternative_email && (
                  <div>Email: {selectedClient.alternative_email}</div>
                )}
                {selectedClient.contact_details?.email?.primary && (
                  <div>Primary Email: {selectedClient.contact_details.email.primary}</div>
                )}
                {selectedClient.contact_details?.email?.alternative && (
                  <div>Alt. Email: {selectedClient.contact_details.email.alternative}</div>
                )}
                {selectedClient.contact_details?.phone?.kenyan?.primary && (
                  <div>Phone: {selectedClient.contact_details.phone.kenyan.primary}</div>
                )}
                {selectedClient.contact_details?.phone?.whatsapp && (
                  <div>WhatsApp: {selectedClient.contact_details.phone.whatsapp}</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
