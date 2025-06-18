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
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Job Details Section */}
        <div className="space-y-4 rounded-lg border p-4 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Job Details</h3>
          </div>
          
          <div className="grid gap-6">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="job-description" className="text-sm font-medium text-gray-700">
                  Job Description *
                </Label>
                <span className="text-xs text-gray-500">
                  {formData.job_description.length}/500
                </span>
              </div>
              <Textarea
                id="job-description"
                value={formData.job_description}
                onChange={(e) => handleChange('job_description', e.target.value)}
                placeholder="Enter a clear and concise job description..."
                className="min-h-[100px]"
                maxLength={500}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="date-initiated" className="text-sm font-medium text-gray-700">
                  Date Initiated *
                </Label>
                <Input
                  id="date-initiated"
                  type="date"
                  value={formData.date_initiated}
                  onChange={(e) => handleChange('date_initiated', e.target.value)}
                  className="w-full"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="renewal-status" className="text-sm font-medium text-gray-700">
                  New/Renewal *
                </Label>
                <Select
                  value={formData.renewal_status}
                  onValueChange={(value: 'New' | 'Renewal') => handleChange('renewal_status', value)}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span>New</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Renewal">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                        <span>Renewal</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Application Type Section */}
        <div className="space-y-4 rounded-lg border p-4 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Application Type</h3>
          </div>
          
          <div className="space-y-4">
            <RadioGroup
              value={formData.application_type}
              onValueChange={(value: ApplicationType) => handleChange('application_type', value)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="principal" id="principal" className="peer sr-only" />
                <Label 
                  htmlFor="principal" 
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                    formData.application_type === 'principal' ? 'border-primary bg-blue-50' : ''
                  }`}
                >
                  <User className="h-6 w-6 mb-2 text-blue-600" />
                  <span className="font-medium">Principal Member</span>
                  <p className="text-sm text-muted-foreground text-center mt-1">
                    For new or existing principal applicants
                  </p>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="dependent" id="dependent" className="peer sr-only" />
                <Label 
                  htmlFor="dependent" 
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                    formData.application_type === 'dependent' ? 'border-primary bg-blue-50' : ''
                  }`}
                >
                  <Users className="h-6 w-6 mb-2 text-blue-600" />
                  <span className="font-medium">Dependent</span>
                  <p className="text-sm text-muted-foreground text-center mt-1">
                    For dependents of principal members
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Department Section */}
        <div className="space-y-4 rounded-lg border p-4 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Department & Subdepartment</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="department" className="text-sm font-medium text-gray-700">
                Department *
              </Label>
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
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                        <span>{dept.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="subdepartment" className="text-sm font-medium text-gray-700">
                Subdepartment *
              </Label>
              <Select
                value={formData.subdepartment_id}
                onValueChange={(value: string) => handleChange('subdepartment_id', value)}
                disabled={!formData.department_id}
                required
              >
                <SelectTrigger>
                  <SelectValue>
                    {formData.subdepartment_id ? (
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span>{subdepartments.find(s => s.id === formData.subdepartment_id)?.name || 'Select subdepartment'}</span>
                      </div>
                    ) : formData.department_id ? (
                      'Select subdepartment'
                    ) : (
                      'Select department first'
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {subdepartments.length > 0 ? (
                    subdepartments.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-green-500"></span>
                          <span>{sub.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No subdepartments found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Task Assignment - Auto-populated from subdepartment */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Task Assignment</h3>
          {/* ... (rest of the code remains the same) */}
        </div>
      </form>
    </DialogContent>
  </Dialog>
)
}