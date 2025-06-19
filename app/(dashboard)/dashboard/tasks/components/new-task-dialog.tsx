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
import { User, Building2, Users, FileText, Loader2, Info } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { Department, DepartmentWithDetails, Subdepartment, fetchDepartments, TaskManagerAssistant } from "@/app/(dashboard)/dashboard/departments/database"

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
  // Department
  department_id: string
  department_name: string
  // Subdepartment
  subdepartment_id: string
  subdepartment_name: string
  // Task Manager
  task_manager_id: string
  task_manager_name: string
  // Task Assistant
  task_assistant_id: string
  task_assistant_name: string
  // Officer
  officer_id: string
  officer_name: string
  // Client
  client_id: string
  client_name: string
  // Other fields
  status: string
  date_initiated: string
  class_id: string
  class_name: string
  renewal_status: 'New' | 'Renewal'
  account_used: string
  applied_by: string
  batch: string
  dependent_name: string
  application_type: ApplicationType
  principal_member_id: string // For dependent applications
  principal_member_name: string
}

interface NewTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (task: any) => void
}

export function NewTaskDialog({ open, onOpenChange, onCreate }: NewTaskDialogProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subdepartments, setSubdepartments] = useState<Array<Subdepartment & {
    taskManager?: {
      id: string;
      name: string | null;
      email: string | null;
      phone_number?: string | null;
      start_date?: string;
      end_date?: string | null;
    } | null;
    taskAssistant?: {
      id: string;
      name: string | null;
      email: string | null;
      phone_number?: string | null;
      start_date?: string;
      end_date?: string | null;
    } | null;
    classes?: Array<{
      name: string;
      description: string | null;
      requirements: Array<{
        name: string;
        description: string | null;
        is_required?: boolean;
      }>;
    }>;
  }>>([]);
  const [selectedTaskManager, setSelectedTaskManager] = useState<string>('');
  const [selectedAssistant, setSelectedAssistant] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [requirements, setRequirements] = useState<Array<{ name: string; description: string | null }>>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedPrincipalMember, setSelectedPrincipalMember] = useState<Client | null>(null);
  const [allUsers, setAllUsers] = useState<Officer[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [departmentMap, setDepartmentMap] = useState<Map<string, Department>>(new Map());

  const [formData, setFormData] = useState<FormData>(() => ({
    job_description: '',
    // Department
    department_id: '',
    department_name: '',
    // Subdepartment
    subdepartment_id: '',
    subdepartment_name: '',
    // Task Manager
    task_manager_id: '',
    task_manager_name: '',
    // Task Assistant
    task_assistant_id: '',
    task_assistant_name: '',
    // Officer
    officer_id: '',
    officer_name: '',
    // Client
    client_id: '',
    client_name: '',
    // Other fields
    status: 'registered',
    date_initiated: new Date().toISOString().split('T')[0],
    class_id: '',
    class_name: '',
    renewal_status: 'New',
    account_used: '',
    applied_by: '',
    batch: '',
    dependent_name: '',
    application_type: 'principal',
    principal_member_id: '',
    principal_member_name: ''
  }))

  // Optimized data fetching with proper error handling
  const fetchInitialData = useCallback(async () => {
    if (!open || !initialLoad) return

    try {
      setLoading(true)

      const [
        depts,
        { data: staff, error: staffError },
        { data: clientData, error: clientError }
      ] = await Promise.all([
        fetchDepartments(),
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
          individual_type
          `)
          .order('full_name', { ascending: true })
          .eq('individual_type', 'dependant')
      ])

      if (staffError) throw staffError
      if (clientError) throw clientError

      // Create a map for quick department lookup
      const deptMap = new Map<string, Department>()
      depts.forEach(dept => deptMap.set(dept.id, dept))
      
      // Update state with the fetched data
      setDepartments(depts)
      setDepartmentMap(deptMap)
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

  // Get subdepartments from the department map
  const fetchSubdepartments = useCallback((departmentId: string) => {
    console.log('Fetching subdepartments for department ID:', departmentId, 'Type:', typeof departmentId)
    
    if (!departmentId) {
      console.log('No department ID provided, clearing subdepartments')
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

    // Log the department map contents for debugging
    console.log('Department map keys (type:value):', Array.from(departmentMap.keys()).map(k => `${typeof k}:${k}`))
    
    // Try to find the department with both string and number ID
    let department = departmentMap.get(departmentId)
    
    // If not found, try converting the ID to a number if it's a string
    if (!department && typeof departmentId === 'string') {
      const numericId = parseInt(departmentId, 10)
      if (!isNaN(numericId)) {
        console.log(`Trying to find department with numeric ID: ${numericId}`)
        department = departmentMap.get(numericId as any)
      }
    }
    
    // If still not found, try to find by stringifying the ID
    if (!department) {
      console.log('Trying to find department by stringifying map keys')
      for (const [key, dept] of departmentMap.entries()) {
        if (key.toString() === departmentId.toString()) {
          department = dept
          break
        }
      }
    }
    
    if (!department) {
      console.error('Department not found in map. ID:', departmentId, 'Type:', typeof departmentId)
      console.log('Available department IDs:', Array.from(departmentMap.keys()).map(k => `${typeof k}:${k}`))
      setSubdepartments([])
      return
    }

    // Get subdepartments from the department
    const subdepts = department.subdepartments || []
    console.log('Subdepartments from department:', subdepts)
    
    // Update subdepartments with task manager/assistant details
    const updatedSubdepts = subdepts.map(subdept => {
      const taskManager = allUsers.find(user => user.id === subdept.task_manager?.id)
      const taskAssistant = allUsers.find(user => user.id === subdept.task_assistant?.id)
      
      return {
        ...subdept,
        taskManager: taskManager || null,
        taskAssistant: taskAssistant || null
      }
    })

    setSubdepartments(updatedSubdepts)
  }, [departmentMap, allUsers])

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
          client_name: '',
          principal_member_id: '',
          principal_member_name: '',
          dependent_name: ''
        };
      }

      // If changing department, reset subdepartment and its dependent fields
      if (field === 'department_id') {
        const selectedDept = departments.find(d => d.id === value);
        return {
          ...prev,
          department_id: value,
          department_name: selectedDept?.name || '',
          subdepartment_id: '',
          subdepartment_name: '',
          task_manager_id: '',
          task_manager_name: '',
          task_assistant_id: '',
          task_assistant_name: '',
          class_id: '',
          class_name: ''
        };
      }

      // If changing subdepartment, reset dependent fields but auto-populate task manager/assistant
      if (field === 'subdepartment_id') {
        const selectedSubdept = subdepartments.find(s => s.id.toString() === value.toString());
        console.log('Selected subdepartment for auto-population:', selectedSubdept);

        return {
          ...prev,
          subdepartment_id: value,
          subdepartment_name: selectedSubdept?.name || '',
          task_manager_id: selectedSubdept?.taskManager?.id?.toString() || '',
          task_manager_name: selectedSubdept?.taskManager?.name || '',
          task_assistant_id: selectedSubdept?.taskAssistant?.id?.toString() || '',
          task_assistant_name: selectedSubdept?.taskAssistant?.name || '',
          class_id: '',
          class_name: ''
        };
      }

      // If changing client, update the selected client
      if (field === 'client_id') {
        const client = clients.find(c => c.id === value) || null;
        setSelectedClient(client);
        return {
          ...prev,
          client_id: value,
          client_name: client?.full_name || '',
          principal_member_id: '',
          principal_member_name: ''
        };
      }

      // If changing principal member, update the selected principal member
      if (field === 'principal_member_id') {
        const principal = clients.find(c => c.id === value) || null;
        setSelectedPrincipalMember(principal);
        return {
          ...prev,
          principal_member_id: value,
          principal_member_name: principal?.full_name || ''
        };
      }

      // If changing task manager
      if (field === 'task_manager_id') {
        const manager = allUsers.find(u => u.id === value);
        return {
          ...prev,
          task_manager_id: value,
          task_manager_name: manager?.name || ''
        };
      }

      // If changing task assistant
      if (field === 'task_assistant_id') {
        const assistant = allUsers.find(u => u.id === value);
        return {
          ...prev,
          task_assistant_id: value,
          task_assistant_name: assistant?.name || ''
        };
      }

      // If changing officer
      if (field === 'officer_id') {
        const officer = officers.find(o => o.id === value);
        return {
          ...prev,
          officer_id: value,
          officer_name: officer?.name || ''
        };
      }

      // If changing class
      if (field === 'class_id') {
        const selectedSubdept = subdepartments.find(s => s.id.toString() === prev.subdepartment_id.toString());
        const selectedClass = selectedSubdept?.classes?.find(c => c.name === value);
        return {
          ...prev,
          class_id: value,
          class_name: selectedClass?.name || ''
        };
      }

      // For all other fields, update normally
      const newState = {
        ...prev,
        [field]: value
      };

      console.log('Updated form data:', newState);
      return newState;
    });
  }, [clients, subdepartments, allUsers, officers, departments]);

  // Optimized submit handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    try {
      setLoading(true)

      console.log('Submitting form data:', formData)

      // Determine the actual client ID and name based on application type
      const actualClientId = formData.application_type === 'dependent'
        ? formData.principal_member_id
        : formData.client_id;
      
      const actualClientName = formData.application_type === 'dependent'
        ? formData.principal_member_name
        : formData.client_name;

      const taskData = {
        // Basic task info
        job_description: formData.job_description,
        status: 'registered',
        date_initiated: new Date(formData.date_initiated).toISOString(),
        
        // Department info
        department_id: formData.department_id,
        department_name: formData.department_name,
        
        // Subdepartment info
        subdepartment_id: formData.subdepartment_id,
        subdepartment_name: formData.subdepartment_name,
        
        // Task assignment
        task_manager_id: formData.task_manager_id || null,
        task_manager_name: formData.task_manager_name || null,
        task_assistant_id: formData.task_assistant_id || null,
        task_assistant_name: formData.task_assistant_name || null,
        
        // Officer info
        officer_id: formData.officer_id || null,
        officer_name: formData.officer_name || null,
        
        // Client info
        client_id: actualClientId,
        client_name: actualClientName,
        
        // Class and type info
        class_id: formData.class_id || null,
        class_name: formData.class_name || null,
        renewal_status: formData.renewal_status,
        application_type: formData.application_type,
        
        // Additional fields
        account_used: formData.account_used,
        applied_by: formData.applied_by,
        batch: formData.batch,
        dependent_name: formData.application_type === 'dependent' ? formData.dependent_name : null,
        
        // Timestamps
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Include additional data for the task creation callback
        department: selectedDept ? { id: selectedDept.id, name: selectedDept.name } : null,
        subdepartment: selectedSubdept ? { 
          id: selectedSubdept.id, 
          name: selectedSubdept.name,
          task_manager: selectedSubdept.taskManager,
          task_assistant: selectedSubdept.taskAssistant
        } : null,
        task_manager: availableTaskManagers[0] || null,
        task_assistant: availableTaskAssistants[0] || null,
        officer: officers.find(o => o.id === formData.officer_id) || null,
        client: clients.find(c => c.id === actualClientId) || null
      };

      const { data, error } = await supabase
        .from('tm_tasks')
        .insert([taskData])
        .select('*')
        .single()

      if (error) throw error
      if (!data) throw new Error('No data returned from task creation')

      onCreate(data)
      onOpenChange(false)

      // Create a complete task object with all relationships
      const taskWithRelationships = {
        ...data,
        department: selectedDept ? { id: selectedDept.id, name: selectedDept.name } : null,
        subdepartment: selectedSubdept ? { 
          id: selectedSubdept.id, 
          name: selectedSubdept.name,
          task_manager: selectedSubdept.taskManager,
          task_assistant: selectedSubdept.taskAssistant
        } : null,
        task_manager: availableTaskManagers[0] || null,
        task_assistant: availableTaskAssistants[0] || null,
        officer: officers.find(o => o.id === formData.officer_id) || null,
        client: clients.find(c => c.id === actualClientId) || null
      };

      // Call the onCreate callback with the complete task data
      onCreate(taskWithRelationships);

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

  // Get task manager details from subdepartment
  const availableTaskManagers = useMemo<Officer[]>(() => {
    if (!selectedSubdepartment || !selectedSubdepartment.taskManager) return [];
    
    const manager = allUsers.find(user => user.id === selectedSubdepartment.taskManager?.id);
    if (!manager) {
      console.warn('Task manager not found for subdepartment:', selectedSubdepartment.id);
      return [];
    }
    return [manager];
  }, [selectedSubdepartment, allUsers])

  // Get task assistant details from subdepartment
  const availableTaskAssistants = useMemo<Officer[]>(() => {
    if (!selectedSubdepartment || !selectedSubdepartment.taskAssistant) return [];
    
    const assistant = allUsers.find(user => user.id === selectedSubdepartment.taskAssistant?.id);
    if (!assistant) {
      console.warn('Task assistant not found for subdepartment:', selectedSubdepartment.id);
      return [];
    }
    return [assistant];
  }, [selectedSubdepartment, allUsers])

  // Get available classes from the selected subdepartment
  const availableClasses = useMemo(() => {
    if (!selectedSubdepartment) return [];
    return selectedSubdepartment.classes || [];
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
      <DialogContent className="flex flex-col max-h-[90vh] w-full max-w-4xl p-0">
        <DialogHeader className="p-6 pb-0 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold">Create New Task</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Fill in the details below to create a new task.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-2 space-y-6 overflow-y-auto flex-1">
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
                      className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${formData.application_type === 'principal' ? 'border-primary bg-blue-50' : ''
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
                      className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${formData.application_type === 'dependent' ? 'border-primary bg-blue-50' : ''
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

            {/* Selected Details Summary */}
            <div className="space-y-4 rounded-lg border p-4 bg-muted/10">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Selected Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Department:</span>
                    <span className="text-sm">
                      {formData.department_name || departments.find(d => d.id === formData.department_id)?.name || 'Not selected'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Subdepartment:</span>
                    <span className="text-sm">
                      {formData.subdepartment_name || selectedSubdepartment?.name || 'Not selected'}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Task Manager:</span>
                    <span className="text-sm">
                      {formData.task_manager_name || 
                        (formData.task_manager_id 
                          ? availableTaskManagers.find(m => m.id === formData.task_manager_id)?.name 
                          : 'Not assigned')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Task Assistant:</span>
                    <span className="text-sm">
                      {formData.task_assistant_name || 
                        (formData.task_assistant_id 
                          ? availableTaskAssistants.find(a => a.id === formData.task_assistant_id)?.name 
                          : 'Not assigned')}
                    </span>
                  </div>
                </div>
              </div>
              {selectedSubdepartment?.classes?.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Selected Class:</span>
                    <span className="text-sm font-medium">
                      {formData.class_name || formData.class_id || 'Not selected'}
                    </span>
                  </div>
                  {formData.class_id && selectedSubdepartment.classes?.find(c => c.name === formData.class_id)?.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedSubdepartment.classes.find(c => c.name === formData.class_id)?.description}
                    </p>
                  )}
                </div>
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
                  <div><strong>Department:</strong> {formData.department_name || departments.find(d => d.id === formData.department_id)?.name || 'Not selected'}</div>
                  <div><strong>Subdepartment:</strong> {formData.subdepartment_name || subdepartments.find(s => s.id === formData.subdepartment_id)?.name || 'Not selected'}</div>
                  {(formData.task_manager_id || formData.task_manager_name) && (
                    <div><strong>Task Manager:</strong> {formData.task_manager_name || allUsers.find(u => u.id === formData.task_manager_id)?.name || 'Unknown'}</div>
                  )}
                  {(formData.task_assistant_id || formData.task_assistant_name) && (
                    <div><strong>Task Assistant:</strong> {formData.task_assistant_name || allUsers.find(u => u.id === formData.task_assistant_id)?.name || 'Unknown'}</div>
                  )}
                  {formData.class_id && (
                    <div><strong>Class:</strong> {formData.class_name || formData.class_id}</div>
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}