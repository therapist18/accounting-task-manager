"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import supabase from "@/lib/supabase/client"

interface Department {
  id: string
  name: string
  created_at: string
}

interface Officer {
  id: string
  name: string | null
  email: string
  role: string
}

interface Subdepartment extends Department {
  department_id: string
  task_manager?: Officer[]
  task_assistant?: Officer[]
  classes?: Array<{
    name: string
    description: string | null
    requirements: Array<{
      name: string
      description: string | null
      is_required: boolean
    }>
  }>
}

interface Client {
  id: string
  full_name: string | null
  alternative_email?: string | null
  contact_details?: {
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
  } | null
  bill_to?: {
    company_name?: string
    company_address?: string
    contact_person?: string
  } | null
}

interface FormData {
  job_description: string
  department_id: string
  subdepartment_id: string
  task_manager_id: string
  task_assistant_id: string
  officer_id: string
  client_id: string
  status: string
  date_initiated: string
  class_id: string
  renewal_status: 'New' | 'Renewal'
  account_used: string
  applied_by: string
  batch: string
  dependent_name: string
}

interface NewTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (task: any) => void
}

export function NewTaskDialog({ open, onOpenChange, onCreate }: NewTaskDialogProps) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [subdepartments, setSubdepartments] = useState<Subdepartment[]>([])
  const [officers, setOfficers] = useState<Officer[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  
  const [formData, setFormData] = useState<FormData>(() => ({
    job_description: '',
    department_id: '',
    subdepartment_id: '',
    task_manager_id: '',
    task_assistant_id: '',
    officer_id: '',
    client_id: '',
    status: 'registered',
    date_initiated: new Date().toISOString().split('T')[0],
    class_id: '',
    renewal_status: 'New',
    account_used: '',
    applied_by: '',
    batch: '',
    dependent_name: ''
  }))

  // Optimized data fetching with proper error handling
  const fetchInitialData = useCallback(async () => {
    if (!open || !initialLoad) return
    
    try {
      setLoading(true)
      
      const [
        { data: depts, error: deptsError },
        { data: staff, error: staffError },
        { data: clientData, error: clientError }
      ] = await Promise.all([
        supabase.from('tm_departments').select('*').order('name'),
        supabase.from('tm_users')
          .select('id, name, email, role')
          .order('name'),
        supabase.from('registry_individuals')
          .select(`
            id, 
            full_name, 
            alternative_email, 
            contact_details,
            bill_to
          `)
          .order('full_name')
      ])

      if (deptsError) throw deptsError
      if (staffError) throw staffError
      if (clientError) throw clientError

      setDepartments(depts || [])
      setOfficers(staff || [])
      setClients(clientData || [])
      setInitialLoad(false)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [open, initialLoad])

  useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  // Optimized subdepartment fetching
  const fetchSubdepartments = useCallback(async (departmentId: string) => {
    if (!departmentId) {
      setSubdepartments([])
      setFormData(prev => ({ 
        ...prev, 
        subdepartment_id: '', 
        task_manager_id: '',
        task_assistant_id: '',
        class_id: '' 
      }))
      return
    }

    try {
      const { data, error } = await supabase
        .from('tm_subdepartments')
        .select('*')
        .eq('department_id', departmentId)
        .order('name')

      if (error) throw error

      // Parse JSONB fields properly
      const subdeptsWithParsedData = data?.map(subdept => ({
        ...subdept,
        task_manager: Array.isArray(subdept.task_manager) ? subdept.task_manager : [],
        task_assistant: Array.isArray(subdept.task_assistant) ? subdept.task_assistant : [],
        classes: Array.isArray(subdept.classes) ? subdept.classes : []
      })) || []

      setSubdepartments(subdeptsWithParsedData)
    } catch (error) {
      console.error('Error fetching subdepartments:', error)
    }
  }, [])

  useEffect(() => {
    if (formData.department_id) {
      fetchSubdepartments(formData.department_id)
    } else {
      setSubdepartments([])
    }
  }, [formData.department_id, fetchSubdepartments])

  // Optimized form change handler with proper state updates
  const handleChange = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => {
      if (field === 'department_id') {
        return { 
          ...prev, 
          [field]: value, 
          subdepartment_id: '',
          task_manager_id: '',
          task_assistant_id: '',
          class_id: ''
        }
      }
      else if (field === 'subdepartment_id') {
        return { 
          ...prev, 
          [field]: value,
          task_manager_id: '',
          task_assistant_id: '',
          class_id: ''
        }
      }
      else if (field === 'client_id') {
        const client = clients.find(c => c.id === value) || null
        setSelectedClient(client)
        return { ...prev, [field]: value }
      }
      return { ...prev, [field]: value }
    })
  }, [clients])

  // Optimized submit handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tm_tasks')
        .insert([{
          job_description: formData.job_description,
          department_id: formData.department_id,
          subdepartment_id: formData.subdepartment_id,
          task_manager_id: formData.task_manager_id || null,
          task_assistant_id: formData.task_assistant_id || null,
          officer_id: formData.officer_id || null,
          client_id: formData.client_id,
          status: 'registered',
          date_initiated: new Date(formData.date_initiated).toISOString(),
          class_name: formData.class_id || null,
          renewal_status: formData.renewal_status,
          account_used: formData.account_used,
          applied_by: formData.applied_by,
          batch: formData.batch,
          dependent_name: formData.dependent_name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          department:tm_departments(id, name),
          subdepartment:tm_subdepartments(id, name, classes),
          task_manager:tm_users!task_manager_id(id, name, email),
          task_assistant:tm_users!task_assistant_id(id, name, email),
          officer:tm_users!officer_id(id, name, email),
          client:registry_individuals(id, full_name, alternative_email, bill_to)
        `)
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
        officer_id: '',
        client_id: '',
        status: 'registered',
        date_initiated: new Date().toISOString().split('T')[0],
        class_id: '',
        renewal_status: 'New',
        account_used: '',
        applied_by: '',
        batch: '',
        dependent_name: ''
      })
      setSelectedClient(null)
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setLoading(false)
    }
  }, [formData, loading, onOpenChange, onCreate])

  // Memoized computed values
  const selectedSubdepartment = useMemo(() => 
    subdepartments.find(s => s.id === formData.subdepartment_id),
    [subdepartments, formData.subdepartment_id]
  )

  const availableTaskManagers = useMemo(() => 
    selectedSubdepartment?.task_manager || [],
    [selectedSubdepartment]
  )

  const availableTaskAssistants = useMemo(() => 
    selectedSubdepartment?.task_assistant || [],
    [selectedSubdepartment]
  )

  const availableClasses = useMemo(() => 
    selectedSubdepartment?.classes || [],
    [selectedSubdepartment]
  )

  const clientDetails = useMemo(() => {
    if (!selectedClient) return null
    
    return (
      <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm space-y-1">
        {selectedClient.bill_to?.company_name && (
          <div><strong>Company:</strong> {selectedClient.bill_to.company_name}</div>
        )}
        {selectedClient.alternative_email && (
          <div><strong>Email:</strong> {selectedClient.alternative_email}</div>
        )}
        {selectedClient.contact_details?.email?.primary && (
          <div><strong>Primary Email:</strong> {selectedClient.contact_details.email.primary}</div>
        )}
        {selectedClient.contact_details?.phone?.kenyan?.primary && (
          <div><strong>Phone:</strong> {selectedClient.contact_details.phone.kenyan.primary}</div>
        )}
        {selectedClient.contact_details?.phone?.whatsapp && (
          <div><strong>WhatsApp:</strong> {selectedClient.contact_details.phone.whatsapp}</div>
        )}
      </div>
    )
  }, [selectedClient])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Enter the details for the new task.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="job-description">Job Description *</Label>
            <Textarea
              id="job-description"
              value={formData.job_description}
              onChange={(e) => handleChange('job_description', e.target.value)}
              placeholder="Enter job description"
              required
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="date-initiated">Date Initiated *</Label>
              <Input
                id="date-initiated"
                type="date"
                value={formData.date_initiated}
                onChange={(e) => handleChange('date_initiated', e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="renewal-status">New/Renewal *</Label>
              <Select
                value={formData.renewal_status}
                onValueChange={(value: 'New' | 'Renewal') => handleChange('renewal_status', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Renewal">Renewal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="department">Department *</Label>
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
              <Label htmlFor="subdepartment">Subdepartment *</Label>
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
                  {subdepartments.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="task-manager">Task Manager *</Label>
              <Select
                value={formData.task_manager_id || undefined}
                onValueChange={(value: string) => handleChange('task_manager_id', value)}
                disabled={!formData.subdepartment_id}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {availableTaskManagers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name || manager.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-assistant">Task Assistant</Label>
              <Select
                value={formData.task_assistant_id || 'none'}
                onValueChange={(value: string) => handleChange('task_assistant_id', value === 'none' ? '' : value)}
                disabled={!formData.subdepartment_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select assistant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableTaskAssistants.map((assistant) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.name || assistant.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="officer">Officer</Label>
              <Select
                value={formData.officer_id || 'none'}
                onValueChange={(value: string) => handleChange('officer_id', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select officer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {officers
                    .filter(officer => officer.role === 'officer' || officer.role === 'admin')
                    .map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.name || officer.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client">Applicant Name (Client) *</Label>
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
            {clientDetails}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="class">Class</Label>
              <Select
                value={formData.class_id || ''}
                onValueChange={(value: string) => handleChange('class_id', value)}
                disabled={!formData.subdepartment_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {availableClasses.map((cls) => (
                    <SelectItem key={cls.name} value={cls.name}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dependent-name">Dependent Name</Label>
              <Input
                id="dependent-name"
                value={formData.dependent_name}
                onChange={(e) => handleChange('dependent_name', e.target.value)}
                placeholder="Enter dependent name"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="account-used">Account Used</Label>
              <Input
                id="account-used"
                value={formData.account_used}
                onChange={(e) => handleChange('account_used', e.target.value)}
                placeholder="Enter account used"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="applied-by">Applied by Who</Label>
              <Input
                id="applied-by"
                value={formData.applied_by}
                onChange={(e) => handleChange('applied_by', e.target.value)}
                placeholder="Enter who applied"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="batch">Batch</Label>
              <Input
                id="batch"
                value={formData.batch}
                onChange={(e) => handleChange('batch', e.target.value)}
                placeholder="Enter batch number"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}