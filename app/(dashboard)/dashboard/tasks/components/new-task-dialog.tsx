// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Building2, Users } from "lucide-react"
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
  task_manager?: { id: number; start_date?: string; end_date?: string | null }
  task_assistant?: { id: number; start_date?: string; end_date?: string | null }
  stages?: number[] // Array of stage IDs
  classes?: Array<{
    name: string
    description: string | null
    requirements: Array<{
      name: string
      description: string | null
      is_required?: boolean
    }>
  }>
  created_at: string
  updated_at: string
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
  dependents?: Array<{
    id: string
    full_name: string
    relationship: string
    date_of_birth?: string
  }> | null
}

type ApplicationType = 'principal' | 'dependent'

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
  application_type: ApplicationType
  principal_member_id: string // For dependent applications
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
  const [selectedPrincipalMember, setSelectedPrincipalMember] = useState<Client | null>(null)
  const [allUsers, setAllUsers] = useState<Officer[]>([])
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
    dependent_name: '',
    application_type: 'principal',
    principal_member_id: ''
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
            bill_to,
            dependents
          `)
          .order('full_name')
      ])

      if (deptsError) throw deptsError
      if (staffError) throw staffError
      if (clientError) throw clientError

      setDepartments(depts || [])
      setOfficers(staff || [])
      setAllUsers(staff || [])
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

  // Fetch subdepartments - keeping the raw data structure
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
      const { data: subdepts, error: subdeptError } = await supabase
        .from('tm_subdepartments')
        .select('*')
        .eq('department_id', departmentId)
        .order('name')

      if (subdeptError) throw subdeptError

      console.log('Raw subdepartments data:', subdepts)

      // Process subdepartments and ensure proper structure
      const processedSubdepts = subdepts?.map(subdept => {
        console.log('Processing subdepartment:', subdept.name, subdept)
        return {
          ...subdept,
          classes: Array.isArray(subdept.classes) ? subdept.classes.map(cls => ({
            ...cls,
            requirements: Array.isArray(cls.requirements) ? cls.requirements.map(req => ({
              ...req,
              is_required: req.is_required ?? true // Default to required if not specified
            })) : []
          })) : [],
          stages: Array.isArray(subdept.stages) ? subdept.stages : []
        }
      }) || []

      console.log('Processed subdepartments:', processedSubdepts)
      setSubdepartments(processedSubdepts)
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
  const handleChange = useCallback((field: keyof FormData, value: any) => {
    console.log(`Changing ${field} to:`, value);

    setFormData(prev => {
      // If changing application type, reset related fields
      if (field === 'application_type') {
        return {
          ...prev,
          application_type: value,
          client_id: '',
          principal_member_id: '',
          dependent_name: ''
        };
      }

      // If changing department, reset subdepartment and its dependent fields
      if (field === 'department_id') {
        return {
          ...prev,
          department_id: value,
          subdepartment_id: '',
          task_manager_id: '',
          task_assistant_id: '',
          class_id: ''
        };
      }

      // If changing subdepartment, reset dependent fields but auto-populate task manager/assistant
      if (field === 'subdepartment_id') {
        const selectedSubdept = subdepartments.find(s => s.id.toString() === value.toString());
        console.log('Selected subdepartment for auto-population:', selectedSubdept);

        return {
          ...prev,
          subdepartment_id: value,
          task_manager_id: selectedSubdept?.task_manager?.id?.toString() || '',
          task_assistant_id: selectedSubdept?.task_assistant?.id?.toString() || '',
          class_id: ''
        };
      }

      // If changing client, update the selected client
      if (field === 'client_id') {
        const client = clients.find(c => c.id === value) || null;
        setSelectedClient(client);
      }

      // If changing principal member, update the selected principal member
      if (field === 'principal_member_id') {
        const principal = clients.find(c => c.id === value) || null;
        setSelectedPrincipalMember(principal);
      }

      // For all other fields, update normally
      const newState = {
        ...prev,
        [field]: value
      };

      console.log('Updated form data:', newState);
      return newState;
    });
  }, [clients, subdepartments]);

  // Optimized submit handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    try {
      setLoading(true)

      console.log('Submitting form data:', formData)

      // Determine the actual client ID based on application type
      const actualClientId = formData.application_type === 'dependent' 
        ? formData.principal_member_id 
        : formData.client_id;

      const { data, error } = await supabase
        .from('tm_tasks')
        .insert([{
          job_description: formData.job_description,
          department_id: formData.department_id,
          subdepartment_id: formData.subdepartment_id,
          task_manager_id: formData.task_manager_id || null,
          task_assistant_id: formData.task_assistant_id || null,
          officer_id: formData.officer_id || null,
          client_id: actualClientId,
          status: 'registered',
          date_initiated: new Date(formData.date_initiated).toISOString(),
          class_name: formData.class_id || null,
          renewal_status: formData.renewal_status,
          account_used: formData.account_used,
          applied_by: formData.applied_by,
          batch: formData.batch,
          dependent_name: formData.application_type === 'dependent' ? formData.dependent_name : null,
          application_type: formData.application_type,
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
        dependent_name: '',
        application_type: 'principal',
        principal_member_id: ''
      })
      setSelectedClient(null)
      setSelectedPrincipalMember(null)
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setLoading(false)
    }
  }, [formData, loading, onOpenChange, onCreate])

  // Memoized computed values with proper type safety and debugging
  const selectedSubdepartment = useMemo(() => {
    if (!formData.subdepartment_id) return null;
    const sub = subdepartments.find(sd => sd.id.toString() === formData.subdepartment_id.toString());
    console.log('Selected subdepartment:', sub);
    return sub || null;
  }, [subdepartments, formData.subdepartment_id]);

  // Get task manager details from allUsers using the ID from subdepartment
  const availableTaskManagers = useMemo<Officer[]>(() => {
    console.log('Computing available task managers...');
    console.log('Selected subdepartment:', selectedSubdepartment);
    console.log('All users:', allUsers);

    if (!selectedSubdepartment?.task_manager?.id) {
      console.log('No task manager ID in subdepartment');
      return [];
    }

    const managerId = selectedSubdepartment.task_manager.id;
    console.log('Looking for manager with ID:', managerId);

    // Find the manager in the users list by ID
    const manager = allUsers.find(user => {
      // Convert both IDs to strings for comparison to handle any type mismatches
      const userId = user.id.toString();
      return userId === managerId.toString();
    });

    console.log('Found manager:', manager);

    return manager ? [manager] : [];
  }, [selectedSubdepartment, allUsers])

  // Get task assistant details from allUsers using the ID from subdepartment
  const availableTaskAssistants = useMemo<Officer[]>(() => {
    console.log('Computing available task assistants...');

    if (!selectedSubdepartment?.task_assistant?.id) {
      console.log('No task assistant ID in subdepartment');
      return [];
    }

    const assistantId = selectedSubdepartment.task_assistant.id;
    console.log('Looking for assistant with ID:', assistantId);

    // Find the assistant in the users list by ID
    const assistant = allUsers.find(user => {
      // Convert both IDs to strings for comparison to handle any type mismatches
      const userId = user.id.toString();
      return userId === assistantId.toString();
    });

    console.log('Found assistant:', assistant);

    return assistant ? [assistant] : [];
  }, [selectedSubdepartment, allUsers])

  // Get available classes from the selected subdepartment
  const availableClasses = useMemo(() => {
    console.log('Computing available classes...');
    console.log('Selected subdepartment classes:', selectedSubdepartment?.classes);

    if (!selectedSubdepartment) return [];

    const classes = Array.isArray(selectedSubdepartment.classes)
      ? selectedSubdepartment.classes
      : [];

    console.log('Available classes:', classes);
    return classes;
  }, [selectedSubdepartment])

  // Get dependents for the selected principal member
  const availableDependents = useMemo(() => {
    if (formData.application_type !== 'dependent' || !selectedPrincipalMember) return [];
    
    return Array.isArray(selectedPrincipalMember.dependents) 
      ? selectedPrincipalMember.dependents 
      : [];
  }, [formData.application_type, selectedPrincipalMember]);

  const clientDetails = useMemo(() => {
    const client = formData.application_type === 'dependent' ? selectedPrincipalMember : selectedClient;
    if (!client) return null

    return (
      <Card className="mt-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {formData.application_type === 'dependent' ? (
              <>
                <User className="h-4 w-4" />
                Principal Member Details
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4" />
                Client Details
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div><strong>Name:</strong> {client.full_name || 'N/A'}</div>
          {client.bill_to?.company_name && (
            <div><strong>Company:</strong> {client.bill_to.company_name}</div>
          )}
          {client.alternative_email && (
            <div><strong>Email:</strong> {client.alternative_email}</div>
          )}
          {client.contact_details?.email?.primary && (
            <div><strong>Primary Email:</strong> {client.contact_details.email.primary}</div>
          )}
          {client.contact_details?.phone?.kenyan?.primary && (
            <div><strong>Phone:</strong> {client.contact_details.phone.kenyan.primary}</div>
          )}
          {client.contact_details?.phone?.whatsapp && (
            <div><strong>WhatsApp:</strong> {client.contact_details.phone.whatsapp}</div>
          )}
          {client.bill_to?.company_address && (
            <div><strong>Address:</strong> {client.bill_to.company_address}</div>
          )}
        </CardContent>
      </Card>
    )
  }, [selectedClient, selectedPrincipalMember, formData.application_type])

  // Debug logging
  useEffect(() => {
    console.log('Form data updated:', JSON.parse(JSON.stringify(formData)));
    console.log('Available managers:', availableTaskManagers);
    console.log('Available assistants:', availableTaskAssistants);
    console.log('Selected subdepartment:', selectedSubdepartment);
    console.log('All users:', allUsers);
  }, [formData, availableTaskManagers, availableTaskAssistants, selectedSubdepartment, allUsers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Fill in the details below to create a new task.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Application Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Application Type *</Label>
            <RadioGroup
              value={formData.application_type}
              onValueChange={(value: ApplicationType) => handleChange('application_type', value)}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="principal" id="principal" />
                <Label htmlFor="principal" className="flex items-center gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  Principal Member
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dependent" id="dependent" />
                <Label htmlFor="dependent" className="flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  Dependent
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Department and Subdepartment Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="department">Department *</Label>
              <Select
                value={formData.department_id}
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
                value={formData.subdepartment_id}
                onValueChange={(value: string) => handleChange('subdepartment_id', value)}
                disabled={!formData.department_id}
                required
              >
                <SelectTrigger>
                  <SelectValue>
                    {formData.subdepartment_id ? (
                      subdepartments.find(s => s.id === formData.subdepartment_id)?.name || 'Select subdepartment'
                    ) : formData.department_id ? (
                      'Select subdepartment'
                    ) : (
                      'Select department first'
                    )}
                  </SelectValue>
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

          {/* Task Assignment - Auto-populated from subdepartment */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Task Assignment</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid gap-2">
                <Label htmlFor="task-manager" className="font-medium text-sm">Task Manager *</Label>
                <Select
                  value={formData.task_manager_id}
                  onValueChange={(value: string) => handleChange('task_manager_id', value)}
                  disabled={!formData.subdepartment_id}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formData.task_manager_id ? (
                        <div className="flex flex-col">
                          <span>{allUsers.find(u => u.id === formData.task_manager_id)?.name || 'Unnamed Manager'}</span>
                          <span className="text-xs text-muted-foreground">
                            {allUsers.find(u => u.id === formData.task_manager_id)?.email}
                          </span>
                        </div>
                      ) : !formData.subdepartment_id ? (
                        'Select subdepartment first'
                      ) : availableTaskManagers.length === 0 ? (
                        'No managers available'
                      ) : (
                        'Select manager'
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableTaskManagers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        <div className="flex flex-col">
                          <span>{manager.name || 'Unnamed Manager'}</span>
                          {manager.email && <span className="text-xs text-muted-foreground">{manager.email}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableTaskManagers.length === 0 && formData.subdepartment_id && (
                  <p className="text-xs text-amber-600">
                    No task managers assigned to this subdepartment
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="task-assistant" className="font-medium text-sm">Task Assistant</Label>
                <Select
                  value={formData.task_assistant_id || 'none'}
                  onValueChange={(value: string) => handleChange('task_assistant_id', value === 'none' ? '' : value)}
                  disabled={!formData.subdepartment_id}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formData.task_assistant_id ? (
                        <div className="flex flex-col">
                          <span>{allUsers.find(u => u.id === formData.task_assistant_id)?.name || 'Unnamed Assistant'}</span>
                          <span className="text-xs text-muted-foreground">
                            {allUsers.find(u => u.id === formData.task_assistant_id)?.email}
                          </span>
                        </div>
                      ) : !formData.subdepartment_id ? (
                        'Select subdepartment first'
                      ) : availableTaskAssistants.length === 0 ? (
                        'No assistants available'
                      ) : (
                        'Select assistant'
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableTaskAssistants.map((assistant) => (
                      <SelectItem key={assistant.id} value={assistant.id}>
                        <div className="flex flex-col">
                          <span>{assistant.name || 'Unnamed Assistant'}</span>
                          {assistant.email && <span className="text-xs text-muted-foreground">{assistant.email}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableTaskAssistants.length === 0 && formData.subdepartment_id && (
                  <p className="text-xs text-amber-600">
                    No task assistants assigned to this subdepartment
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="officer" className="font-medium text-sm">Officer</Label>
                <Select
                  value={formData.officer_id || 'none'}
                  onValueChange={(value: string) => handleChange('officer_id', value === 'none' ? '' : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formData.officer_id ? (
                        <div className="flex flex-col">
                          <span>{allUsers.find(u => u.id === formData.officer_id)?.name || 'Unnamed Officer'}</span>
                          <span className="text-xs text-muted-foreground">
                            {allUsers.find(u => u.id === formData.officer_id)?.email}
                          </span>
                        </div>
                      ) : (
                        'Select officer'
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {officers
                      .filter(officer => officer.role === 'officer' || officer.role === 'admin')
                      .map((officer) => (
                        <SelectItem key={officer.id} value={officer.id}>
                          <div className="flex flex-col">
                            <span>{officer.name || 'Unnamed Officer'}</span>
                            {officer.email && <span className="text-xs text-muted-foreground">{officer.email}</span>}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Client/Principal Member Selection */}
          {formData.application_type === 'principal' ? (
            <div className="grid gap-2">
              <Label htmlFor="client">Applicant Name (Client) *</Label>
              <Select
                value={formData.client_id}
                onValueChange={(value: string) => handleChange('client_id', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      <div className="flex flex-col">
                        <span>{client.full_name || client.alternative_email || 'Unnamed Client'}</span>
                        {client.alternative_email && <span className="text-xs text-muted-foreground">{client.alternative_email}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientDetails}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="principal-member">Principal Member *</Label>
                <Select
                  value={formData.principal_member_id}
                  onValueChange={(value: string) => handleChange('principal_member_id', value)}
                  required
                >
                 <SelectTrigger>
                   <SelectValue placeholder="Select principal member" />
                 </SelectTrigger>
                 <SelectContent>
                   {clients.map((client) => (
                     <SelectItem key={client.id} value={client.id}>
                       <div className="flex flex-col">
                         <span>{client.full_name || client.alternative_email || 'Unnamed Client'}</span>
                         {client.alternative_email && <span className="text-xs text-muted-foreground">{client.alternative_email}</span>}
                       </div>
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             {selectedPrincipalMember && (
               <div className="grid gap-2">
                 <Label htmlFor="dependent-selection">Select Dependent *</Label>
                 <Select
                   value={formData.dependent_name}
                   onValueChange={(value: string) => handleChange('dependent_name', value)}
                   required
                 >
                   <SelectTrigger>
                     <SelectValue placeholder={
                       availableDependents.length === 0 
                         ? "No dependents found for this principal member" 
                         : "Select dependent"
                     } />
                   </SelectTrigger>
                   <SelectContent>
                     {availableDependents.map((dependent) => (
                       <SelectItem key={dependent.id} value={dependent.full_name}>
                         <div className="flex flex-col">
                           <span>{dependent.full_name}</span>
                           <span className="text-xs text-muted-foreground">
                             {dependent.relationship}
                             {dependent.date_of_birth && ` • DOB: ${dependent.date_of_birth}`}
                           </span>
                         </div>
                       </SelectItem>
                     ))}
                     {availableDependents.length === 0 && (
                       <SelectItem value="manual-entry" className="text-amber-600">
                         Enter dependent name manually
                       </SelectItem>
                     )}
                   </SelectContent>
                 </Select>
                 
                 {(availableDependents.length === 0 || formData.dependent_name === 'manual-entry') && (
                   <div className="mt-2">
                     <Label htmlFor="manual-dependent-name">Dependent Name</Label>
                     <Input
                       id="manual-dependent-name"
                       value={formData.dependent_name === 'manual-entry' ? '' : formData.dependent_name}
                       onChange={(e) => handleChange('dependent_name', e.target.value)}
                       placeholder="Enter dependent's full name"
                       required
                     />
                   </div>
                 )}
               </div>
             )}

             {clientDetails}
           </div>
         )}

         {/* Class Selection */}
         <div className="grid gap-2">
           <Label htmlFor="class">Class</Label>
           <Select
             value={formData.class_id}
             onValueChange={(value: string) => handleChange('class_id', value)}
             disabled={!formData.subdepartment_id}
           >
             <SelectTrigger>
               <SelectValue placeholder={
                 !formData.subdepartment_id ? 'Select subdepartment first' :
                   availableClasses.length === 0 ? 'No classes available' : 'Select class'
               } />
             </SelectTrigger>
             <SelectContent>
               {availableClasses.map((cls) => (
                 <SelectItem key={cls.name} value={cls.name}>
                   <div className="flex flex-col">
                     <span>{cls.name}</span>
                     {cls.description && (
                       <span className="text-xs text-muted-foreground">{cls.description}</span>
                     )}
                     {cls.requirements && cls.requirements.length > 0 && (
                       <Badge variant="outline" className="text-xs mt-1 w-fit">
                         {cls.requirements.length} requirements
                       </Badge>
                     )}
                   </div>
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
           {availableClasses.length === 0 && formData.subdepartment_id && (
             <p className="text-xs text-amber-600">
               No classes configured for this subdepartment
             </p>
           )}
         </div>

         {/* Additional Fields */}
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

         {/* Form Summary */}
         {(formData.application_type && formData.subdepartment_id) && (
           <Card className="bg-blue-50 border-blue-200">
             <CardHeader className="pb-2">
               <CardTitle className="text-sm text-blue-800">Task Summary</CardTitle>
             </CardHeader>
             <CardContent className="text-sm space-y-1">
               <div><strong>Application Type:</strong> {formData.application_type === 'principal' ? 'Principal Member' : 'Dependent'}</div>
               <div><strong>Department:</strong> {departments.find(d => d.id === formData.department_id)?.name || 'Not selected'}</div>
               <div><strong>Subdepartment:</strong> {subdepartments.find(s => s.id === formData.subdepartment_id)?.name || 'Not selected'}</div>
               {formData.task_manager_id && (
                 <div><strong>Task Manager:</strong> {allUsers.find(u => u.id === formData.task_manager_id)?.name || 'Unknown'}</div>
               )}
               {formData.task_assistant_id && (
                 <div><strong>Task Assistant:</strong> {allUsers.find(u => u.id === formData.task_assistant_id)?.name || 'Unknown'}</div>
               )}
               {formData.class_id && (
                 <div><strong>Class:</strong> {formData.class_id}</div>
               )}
               {formData.application_type === 'dependent' && formData.dependent_name && (
                 <div><strong>Dependent:</strong> {formData.dependent_name}</div>
               )}
             </CardContent>
           </Card>
         )}

         <DialogFooter>
           <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
             Cancel
           </Button>
           <Button 
             type="submit" 
             disabled={loading || !formData.job_description || !formData.department_id || !formData.subdepartment_id || 
               (formData.application_type === 'principal' && !formData.client_id) ||
               (formData.application_type === 'dependent' && (!formData.principal_member_id || !formData.dependent_name))}
           >
             {loading ? 'Creating...' : 'Create Task'}
           </Button>
         </DialogFooter>
       </form>
     </DialogContent>
   </Dialog>
 )
}