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
import { Department, DepartmentWithDetails, Subdepartment, fetchDepartments, TaskManagerAssistant } from "@/app/(dashboard)/dashboard/departments/departments/database"

interface Officer {
  id: string
  name: string | null
  email: string
  role: string
}

interface ClassRequirement {
  name: string
  description: string | null
  is_required?: boolean
  type?: 'standard' | 'conditional' | 'optional'
  order?: number
  isVisible?: boolean
}

interface SubClass {
  id: number
  name: string
  order: number
  isVisible: boolean
  description: string | null
  requirements?: ClassRequirement[]
}

interface Class {
  id: number
  name: string
  order: number
  isVisible: boolean
  description: string | null
  subClasses: SubClass[]
  requirements?: ClassRequirement[]
}

interface Subdepartment extends Department {
  department_id: string
  task_manager?: { id: number; start_date?: string; end_date?: string | null }
  task_assistant?: { id: number; start_date?: string; end_date?: string | null }
  stages?: Array<{
    display: boolean
    stage_id: string
    applicable: boolean
  }>
  classes?: Class[]
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
  // Class & Subclass
  class_id: string
  class_name: string
  class_description: string | null
  subclass_id: string
  subclass_name: string
  subclass_description: string | null
  // Other fields
  status: string
  date_initiated: string
  renewal_status: 'New' | 'Renewal'
  account_used: string
  applied_by: string
  batch: string
  individual_name: string
  r_number: string
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
    task_manager?: {
      id: number;
      start_date?: string;
      end_date?: string | null;
    } | null;
    task_assistant?: {
      id: number;
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
    department_id: '',
    department_name: '',
    subdepartment_id: '',
    subdepartment_name: '',
    class_id: '',
    class_name: '',
    class_description: null,
    subclass_id: '',
    subclass_name: '',
    subclass_description: null,
    task_manager_id: 'none',
    task_manager_name: '',
    task_assistant_id: 'none',
    task_assistant_name: '',
    officer_id: 'none',
    officer_name: '',
    client_id: '',
    client_name: '',
    individual_name: '',
    r_number: '',
    principal_member_id: '',
    principal_member_name: '',
    status: 'registered',
    date_initiated: new Date().toISOString().split('T')[0],
    renewal_status: 'New',
    account_used: '',
    applied_by: '',
    batch: '',
    dependent_name: '',
    application_type: 'principal' as ApplicationType
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

  // Memoize the selected subdepartment for better performance
  const selectedSubdepartment = useMemo(() => {
    return subdepartments.find(sd => sd.id.toString() === formData.subdepartment_id);
  }, [subdepartments, formData.subdepartment_id]);

  // Memoize available task managers and assistants based on selected subdepartment
  const availableTaskManagers = useMemo(() => {
    // Check both taskManager and task_manager properties
    const manager = selectedSubdepartment?.taskManager || selectedSubdepartment?.task_manager;
    if (!manager?.id) return [];
    
    const managerId = manager.id.toString();
    const managerUser = allUsers.find(u => u.id === managerId);
    
    // If we have a direct name on the manager object, use it
    const managerName = manager.name || managerUser?.name || 'Unnamed Manager';
    
    return [{
      id: managerId,
      name: managerName,
      email: managerUser?.email || manager.email || ''
    }];
  }, [selectedSubdepartment, allUsers]);

  const availableTaskAssistants = useMemo(() => {
    // Check both taskAssistants and task_assistant arrays
    const assistants = selectedSubdepartment?.taskAssistants || selectedSubdepartment?.task_assistant || [];
    if (!Array.isArray(assistants) || assistants.length === 0) return [];
    
    return assistants.map(assistant => {
      // Get the user ID from either userId or id field
      const assistantId = (assistant.userId || assistant.id)?.toString();
      if (!assistantId) return null;
      
      // Find the user in allUsers - ensure we're comparing strings
      const assistantUser = allUsers.find(u => u.id.toString() === assistantId.toString());
      
      if (!assistantUser) {
        console.warn(`Could not find user with ID: ${assistantId}`);
        return null;
      }
      
      return {
        id: assistantId,
        name: assistantUser.name || `User ${assistantId}`,
        email: assistantUser.email || ''
      };
    }).filter(Boolean); // Remove any null entries
  }, [selectedSubdepartment, allUsers]);
  
  // Available officers (users linked to the selected department or with officer role)
  const availableOfficers = useMemo(() => {
    if (!selectedSubdepartment?.department_id) return [];
    
    return allUsers
      .filter(user => {
        if (!user) return false;
        
        // Include users who are either:
        // 1. Assigned to this department (if department_id is a string, convert to number for comparison)
        const isInDepartment = user.department_id?.toString() === selectedSubdepartment.department_id.toString();
        
        // 2. Have a role of officer or staff
        const role = (user.role || '').toLowerCase();
        const isOfficerOrStaff = role.includes('officer') || role.includes('staff');
        
        return isInDepartment || isOfficerOrStaff;
      })
      .map(officer => {
        if (!officer) return null;
        
        return {
          id: officer.id.toString(),
          name: officer.name || `User ${officer.id}`,
          email: officer.email || ''
        };
      })
      .filter(Boolean); // Remove any null entries
  }, [allUsers, selectedSubdepartment?.department_id]);
  
  // Log for debugging
  useEffect(() => {
    console.log('Available assistants:', availableTaskAssistants);
    console.log('Available officers:', availableOfficers);
    console.log('Current form data:', formData);
  }, [availableTaskAssistants, availableOfficers, formData]);

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
        const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === value);
        return {
          ...prev,
          class_id: value,
          class_name: selectedClass?.name || '',
          class_description: selectedClass?.description || null,
          subclass_id: '',
          subclass_name: '',
          subclass_description: null
        };
      }

      // If changing subclass
      if (field === 'subclass_id') {
        const selectedSubdept = subdepartments.find(s => s.id.toString() === prev.subdepartment_id.toString());
        const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === prev.class_id);
        const selectedSubclass = selectedClass?.subClasses?.find(sc => sc.id.toString() === value);
        
        return {
          ...prev,
          subclass_id: value,
          subclass_name: selectedSubclass?.name || '',
          subclass_description: selectedSubclass?.description || null
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

      // Get the selected class and subclass details
      const selectedClass = selectedSubdept?.classes?.find(c => c.id.toString() === formData.class_id);
      const selectedSubclass = selectedClass?.subClasses?.find(sc => sc.id.toString() === formData.subclass_id);

      // Memoize the selected department and subdepartment for better performance
      const selectedDepartment = useMemo(() => {
        return departments.find(d => d.id === formData.department_id);
      }, [departments, formData.department_id]);

      const selectedSubdepartment = useMemo(() => {
        return subdepartments.find(sd => sd.id === formData.subdepartment_id);
      }, [subdepartments, formData.subdepartment_id]);

      // Memoize available task managers and assistants based on selected subdepartment
      const availableTaskManagers = useMemo(() => {
        if (!selectedSubdepartment?.taskManager) return [];
        return [{
          id: selectedSubdepartment.taskManager.id.toString(),
          name: selectedSubdepartment.taskManager.name || 'Unnamed Manager',
          email: selectedSubdepartment.taskManager.email || ''
        }];
      }, [selectedSubdepartment]);

      const availableTaskAssistants = useMemo(() => {
        if (!selectedSubdepartment?.taskAssistant) return [];
        return [{
          id: selectedSubdepartment.taskAssistant.id.toString(),
          name: selectedSubdepartment.taskAssistant.name || 'Unnamed Assistant',
          email: selectedSubdepartment.taskAssistant.email || ''
        }];
      }, [selectedSubdepartment]);

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
        
        // Class and Subclass info
        class_id: formData.class_id || null,
        class_name: formData.class_name || null,
        class_description: formData.class_description || null,
        subclass_id: formData.subclass_id || null,
        subclass_name: formData.subclass_name || null,
        subclass_description: formData.subclass_description || null,
        
        // Application type and status
        renewal_status: formData.renewal_status,
        application_type: formData.application_type,
        
        // Additional fields
        account_used: formData.account_used,
        applied_by: formData.applied_by,
        batch: formData.batch,
        individual_name: formData.individual_name,
        r_number: formData.r_number,
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
        class: selectedClass ? {
          id: selectedClass.id,
          name: selectedClass.name,
          description: selectedClass.description,
          requirements: selectedClass.requirements || []
        } : null,
        subclass: selectedSubclass ? {
          id: selectedSubclass.id,
          name: selectedSubclass.name,
          description: selectedSubclass.description,
          requirements: selectedSubclass.requirements || []
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
        department_name: '',
        subdepartment_id: '',
        subdepartment_name: '',
        task_manager_id: '',
        task_manager_name: '',
        task_assistant_id: '',
        task_assistant_name: '',
        officer_id: '',
        officer_name: '',
        client_id: '',
        client_name: '',
        class_id: '',
        class_name: '',
        class_description: null,
        subclass_id: '',
        subclass_name: '',
        subclass_description: null,
        status: 'registered',
        date_initiated: new Date().toISOString().split('T')[0],
        renewal_status: 'New',
        account_used: '',
        applied_by: '',
        batch: '',
        individual_name: '',
        r_number: '',
        dependent_name: '',
        application_type: 'principal',
        principal_member_id: '',
        principal_member_name: ''
      })
      setSelectedClient(null)
      setSelectedPrincipalMember(null)
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setLoading(false)
    }
  }, [formData, loading, onOpenChange, onCreate])
 
  const selectedDepartment = useMemo(() => {
    if (!formData.department_id) return null;
    const dept = departments.find(d => d.id.toString() === formData.department_id.toString());
    console.log('Selected department:', dept);
    return dept || null;
  }, [departments, formData.department_id]);
  
  // Get available classes from the selected subdepartment
  const availableClasses = useMemo(() => {
    if (!selectedSubdepartment) return [];
    return (selectedSubdepartment.classes || []).map(cls => ({
      id: cls.id.toString(),
      name: cls.name,
      description: cls.description,
      requirements: cls.requirements || [],
      subClasses: cls.subClasses || []
    }));
  }, [selectedSubdepartment])

  // Get available subdepartments from the selected department
  const availableSubdepartments = useMemo(() => {
    if (!selectedDepartment) return [];
    return (selectedDepartment.subdepartments || []).map(sd => ({
      id: sd.id.toString(),
      name: sd.name,
      description: sd.description,
      classes: sd.classes || [],
      subClasses: sd.subClasses || []
    }));
  }, [selectedDepartment])

  // Get dependents for the selected principal member
  const availableDependents = useMemo(() => {
    if (formData.application_type !== 'dependent' || !selectedPrincipalMember) return [];

    return Array.isArray(selectedPrincipalMember.dependents)
      ? selectedPrincipalMember.dependents
      : [];
  }, [formData.application_type, selectedPrincipalMember]);

  // Get available subclasses from the selected class
  const availableSubclasses = useMemo(() => {
    if (!formData.class_id || !selectedSubdepartment?.classes) return [];
    
    const selectedClass = selectedSubdepartment.classes.find(c => c.id.toString() === formData.class_id);
    if (!selectedClass?.subClasses) return [];
    
    return selectedClass.subClasses.map(subClass => ({
      id: subClass.id.toString(),
      name: subClass.name,
      description: subClass.description,
      requirements: subClass.requirements || []
    }));
  }, [formData.class_id, selectedSubdepartment]);

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
                  <Label htmlFor="job-description" className="text-sm font-medium text-gray-700">
                    Job Description *
                  </Label>
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
                      <span className="font-medium">Principal</span>
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
                    </Label>
                  </div>
                </RadioGroup>

                {/* Individual Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="individual-name" className="text-sm font-medium text-gray-700">
                      Individual Name *
                    </Label>
                    <Input
                      id="individual-name"
                      value={formData.individual_name}
                      onChange={(e) => handleChange('individual_name', e.target.value)}
                      placeholder="Enter individual's full name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="r-number" className="text-sm font-medium text-gray-700">
                      R Number *
                    </Label>
                    <Input
                      id="r-number"
                      value={formData.r_number}
                      onChange={(e) => handleChange('r_number', e.target.value)}
                      placeholder="Enter R number"
                      required
                    />
                  </div>
                </div>

                {/* Principal Member Name for Dependents */}
                {formData.application_type === 'dependent' && (
                  <div className="grid gap-2">
                    <Label htmlFor="principal-member" className="text-sm font-medium text-gray-700">
                      Principal Member Name *
                    </Label>
                    <Input
                      id="principal-member"
                      value={formData.principal_member_name}
                      onChange={(e) => handleChange('principal_member_name', e.target.value)}
                      placeholder="Enter principal member's name"
                      required={formData.application_type === 'dependent'}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Department & Subdepartment Section */}
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
                    onValueChange={(value: string) => {
                      const selectedDept = departments.find(d => d.id === value);
                      if (selectedDept) {
                        handleChange('department_id', value);
                        handleChange('department_name', selectedDept.name);
                        handleChange('subdepartment_id', '');
                        handleChange('subdepartment_name', '');
                        handleChange('class_id', '');
                        handleChange('class_name', '');
                        handleChange('task_manager_id', '');
                        handleChange('task_manager_name', '');
                        handleChange('task_assistant_id', '');
                        handleChange('task_assistant_name', '');
                        handleChange('officer_id', '');
                        handleChange('officer_name', '');
                      }
                    }}
                    disabled={departments.length === 0}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue 
                        placeholder={
                          departments.length === 0 
                            ? "Loading departments..." 
                            : "Select department"
                        } 
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                          {dept.description && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {dept.description}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* <div className="grid gap-2">
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
                      <SelectValue placeholder={!formData.department_id ? "Select department first" : "Select subdepartment"} />
                    </SelectTrigger>
                    <SelectContent>
                      {subdepartments.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div> */}
                <div className="grid gap-2">
                  <Label htmlFor="subdepartment" className="text-sm font-medium text-gray-700">
                  Subdepartment *
                  </Label>
                  <Select
                    value={formData.subdepartment_id}
                    onValueChange={(value: string) => {
                      const selectedSubdept = availableSubdepartments.find(sd => sd.id === value);
                      if (selectedSubdept) {
                        handleChange('subdepartment_id', value);
                        handleChange('subdepartment_name', selectedSubdept.name);
                        handleChange('class_id', '');
                        handleChange('class_name', '');
                        handleChange('task_manager_id', '');
                        handleChange('task_manager_name', '');
                        handleChange('task_assistant_id', '');
                        handleChange('task_assistant_name', '');
                        handleChange('officer_id', '');
                        handleChange('officer_name', '');
                      }
                    }}
                    disabled={!formData.department_id || availableSubdepartments.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue 
                        placeholder={
                          !formData.department_id 
                            ? "Select department first" 
                            : availableSubdepartments.length === 0 
                              ? "No subdepartments available" 
                              : "Select subdepartment"
                        } 
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubdepartments.map((subdept) => (
                        <SelectItem key={subdept.id} value={subdept.id}>
                          {subdept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="class" className="text-sm font-medium text-gray-700">
                    Class
                  </Label>
                  <Select
                    value={formData.class_id}
                    onValueChange={(value: string) => {
                      const selectedClass = availableClasses.find(c => c.id === value);
                      if (selectedClass) {
                        handleChange('class_id', value);
                        handleChange('class_name', selectedClass.name);
                        handleChange('class_description', selectedClass.description || null);
                        handleChange('subclass_id', '');
                        handleChange('subclass_name', '');
                        handleChange('subclass_description', null);
                      }
                    }}
                    disabled={!formData.subdepartment_id || availableClasses.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue 
                        placeholder={
                          !formData.subdepartment_id 
                            ? "Select subdepartment first" 
                            : availableClasses.length === 0 
                              ? "No classes available" 
                              : "Select class"
                        } 
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClasses.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                          {cls.description && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {cls.description}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="subclass" className="text-sm font-medium text-gray-700">
                    Subclass
                  </Label>
                  <Select
                    value={formData.subclass_id}
                    onValueChange={(value: string) => {
                      const selectedSubclass = availableSubclasses.find(sc => sc.id === value);
                      if (selectedSubclass) {
                        handleChange('subclass_id', value);
                        handleChange('subclass_name', selectedSubclass.name);
                        handleChange('subclass_description', selectedSubclass.description || null);
                      }
                    }}
                    disabled={!formData.class_id || availableSubclasses.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue 
                        placeholder={
                          !formData.class_id 
                            ? "Select class first" 
                            : availableSubclasses.length === 0
                              ? "No subclasses available"
                              : "Select subclass"
                        } 
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubclasses.map((subcls) => (
                        <SelectItem key={subcls.id} value={subcls.id}>
                          {subcls.name}
                          {subcls.description && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {subcls.description}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Task Assignment Section */}
            <div className="space-y-4 rounded-lg border p-4 bg-white shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Task Assignment</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="task-manager" className="text-sm font-medium text-gray-700">
                    Task Manager *
                  </Label>
                  <Select
                    value={formData.task_manager_id || 'none'}
                    onValueChange={(value: string) => {
                      const selectedManager = availableTaskManagers.find(m => m.id === value);
                      if (selectedManager) {
                        handleChange('task_manager_id', value);
                        handleChange('task_manager_name', selectedManager.name || '');
                      } else {
                        handleChange('task_manager_id', 'none');
                        handleChange('task_manager_name', '');
                      }
                    }}
                    disabled={!formData.subdepartment_id}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!formData.subdepartment_id ? "Select subdepartment first" : "Select task manager"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTaskManagers.map((manager) => (
                        <SelectItem key={manager.id} value={manager.id}>
                          {manager.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="task-assistant" className="text-sm font-medium text-gray-700">
                    Task Assistant
                  </Label>
                  <Select
                    value={formData.task_assistant_id || 'none'}
                    onValueChange={(value: string) => {
                      const selectedAssistant = availableTaskAssistants.find(a => a.id === value);
                      if (selectedAssistant) {
                        handleChange('task_assistant_id', value);
                        handleChange('task_assistant_name', selectedAssistant.name || '');
                      } else {
                        handleChange('task_assistant_id', 'none');
                        handleChange('task_assistant_name', '');
                      }
                    }}
                    disabled={!formData.subdepartment_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!formData.subdepartment_id ? "Select subdepartment first" : "Select task assistant"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {availableTaskAssistants.map((assistant) => (
                        <SelectItem key={assistant.id} value={assistant.id}>
                          {assistant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="officer" className="text-sm font-medium text-gray-700">
                    Officer
                  </Label>
                  <Select
                    value={formData.officer_id || 'none'}
                    onValueChange={(value: string) => {
                      if (value === 'none') {
                        handleChange('officer_id', '');
                        handleChange('officer_name', '');
                      } else {
                        const selectedOfficer = availableOfficers.find(o => o.id === value);
                        if (selectedOfficer) {
                          handleChange('officer_id', value);
                          handleChange('officer_name', selectedOfficer.name);
                        }
                      }
                    }}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select officer">
                        {formData.officer_id && formData.officer_id !== 'none' 
                          ? availableOfficers.find(o => o.id === formData.officer_id)?.name || 'Select officer'
                          : 'Select officer'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {availableOfficers.map((officer) => (
                        <SelectItem key={officer.id} value={officer.id}>
                          {officer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Additional Fields Section */}
            <div className="space-y-4 rounded-lg border p-4 bg-white shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">Additional Fields</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="account-used" className="text-sm font-medium text-gray-700">
                    Account Used
                  </Label>
                  <Input
                    id="account-used"
                    value={formData.account_used}
                    onChange={(e) => handleChange('account_used', e.target.value)}
                    placeholder="Enter account used"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="applied-by" className="text-sm font-medium text-gray-700">
                    Applied by Who
                  </Label>
                  <Input
                    id="applied-by"
                    value={formData.applied_by}
                    onChange={(e) => handleChange('applied_by', e.target.value)}
                    placeholder="Enter who applied"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="batch" className="text-sm font-medium text-gray-700">
                    Batch
                  </Label>
                  <Input
                    id="batch"
                    value={formData.batch}
                    onChange={(e) => handleChange('batch', e.target.value)}
                    placeholder="Enter batch number"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-0 flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.job_description || !formData.department_id || !formData.subdepartment_id || !formData.individual_name || !formData.r_number}
            >
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}