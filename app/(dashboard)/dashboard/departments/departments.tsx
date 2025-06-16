// @ts-nocheck
"use client"
import { useState, useEffect } from "react"
import {
  fetchUsers,
  fetchDepartments,
  createDepartment as createDepartmentDb,
  createStage as createStageDb,
  User as DbUser,
  Department,
  Subdepartment,
  Stage,
  UserRole
} from "./database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FolderPlus, Plus, Settings, Users, Clock, AlertTriangle, X, Edit, Loader2, UserPlus, UserCheck, UserX, ChevronDown, Check, User } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"
type User = {
  id: string
  name: string | null
  email: string
  phone_number?: string
  role: 'admin' | 'task_manager' | 'task_assistant' | 'officer' | string
  created_at?: string
  updated_at?: string
  assignedDepartments?: string[]
  assignedSubdepartments?: string[]
}

function UserDetailsPopover({ userId, users, role, children }: { 
  userId: string, 
  users: User[],
  role: 'manager' | 'assistant',
  children: React.ReactNode 
}) {
  const user = users.find(u => u.id === userId)
  
  if (!user) return <span>{children}</span>

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="cursor-pointer hover:underline">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{user.name || 'No name'}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          {user.phone_number && (
            <div className="text-sm">
              <p className="text-muted-foreground">Phone Number</p>
              <p>{user.phone_number}</p>
            </div>
          )}
          <div className="text-sm">
            <p className="text-muted-foreground">Role</p>
            <p className="capitalize">Task {role === 'manager' ? 'Manager' : 'Assistant'}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

type Stage = {
  id: string
  name: string
  estimatedTime: number // in hours
  reminderDays: number
  order: number
  taskManagerId?: string
  taskAssistantId?: string
  isActive: boolean
  status: 'yes' | 'na' // yes or N/A
}

type ClassRequirement = {
  id: string
  name: string
  description?: string
  isRequired: boolean
}

type SubdepartmentClass = {
  id: string
  name: string
  description?: string
  requirements: ClassRequirement[]
}

type Subdepartment = {
  id: string
  name: string
  description?: string
  classes?: SubdepartmentClass[]
  stages: Stage[]
  taskManagerId?: string
  taskAssistantId?: string
  processingTime: number // in days
  deliveryTime: number // in days
}

type Department = {
  id: string
  name: string
  description?: string
  subdepartments: Subdepartment[]
}

type SubdepartmentForm = {
  name: string
  description: string
  classes: SubdepartmentClass[]
  taskManagerId: string
  taskAssistantId: string
  stages: {
    [key: string]: {
      applies: boolean
      estimatedTime: number
      reminderDays: number
    }
  }
}

export default function Departments() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [isAddStageOpen, setIsAddStageOpen] = useState(false)
  const [currentSubdept, setCurrentSubdept] = useState<Subdepartment | null>(null)
  const [newClassInput, setNewClassInput] = useState('')
  const [newClassRequirement, setNewClassRequirement] = useState({
    name: '',
    description: '',
    isRequired: true
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedSubdept, setSelectedSubdept] = useState<{ deptId: string, subdept: Subdepartment } | null>(null)
  const [isAddSubdepartmentOpen, setIsAddSubdepartmentOpen] = useState(false)
  const [currentDepartmentId, setCurrentDepartmentId] = useState<string | null>(null)
  const [globalStages, setGlobalStages] = useState<Array<{ id: string, name: string }>>([])
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  // Form state for new department
  const [departmentForm, setDepartmentForm] = useState({
    name: '',
    description: '',
    subdepartments: [] as SubdepartmentForm[]
  })

  // Fetch data on component mount
  useEffect(() => {
    const fetchGlobalStages = async () => {
      try {
        const { data: stages, error } = await supabase
          .from('tm_stages')
          .select('id, name')
          .order('order_num', { ascending: true })

        if (error) throw error
        setGlobalStages(stages || [])
      } catch (error) {
        console.error('Error fetching global stages:', error)
        toast.error('Failed to load workflow stages')
      }
    }

    fetchData()
    fetchUsers()
    fetchGlobalStages()
  }, [])

  // Fetch users from the database
  const fetchUsers = async () => {
    try {
      const { data: users, error } = await supabase
        .from('tm_users')
        .select('id, name, email, phone_number, role, created_at, updated_at')
        .order('name')

      if (error) throw error
      setUsers(users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to load users')
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch departments using direct database function
      const departmentsData = await fetchDepartments()
      setDepartments(departmentsData)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDepartment = () => {
    setDepartmentForm({
      name: '',
      description: '',
      subdepartments: []
    })
    setIsAddDepartmentOpen(true)
  }

  const handleRemoveSubdepartment = (index: number) => {
    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: prev.subdepartments.filter((_, i) => i !== index)
    }))
  }

  const handleAddClass = (subdeptIndex: number) => {
    if (!newClassInput.trim()) return

    const newClass: SubdepartmentClass = {
      id: `temp-${Date.now()}`,
      name: newClassInput.trim(),
      description: '',
      requirements: []
    }

    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: prev.subdepartments.map((subdept, index) =>
        index === subdeptIndex
          ? { ...subdept, classes: [...(subdept.classes || []), newClass] }
          : subdept
      )
    }))
    setNewClassInput('')
  }

  const handleAddClassRequirement = (subdeptIndex: number, classIndex: number) => {
    if (!newClassRequirement.name.trim()) return

    const requirement: ClassRequirement = {
      id: `req-${Date.now()}`,
      name: newClassRequirement.name.trim(),
      description: newClassRequirement.description?.trim(),
      isRequired: newClassRequirement.isRequired
    }

    setDepartmentForm(prev => {
      const updatedSubdepartments = [...prev.subdepartments]
      const subdept = { ...updatedSubdepartments[subdeptIndex] }
      const updatedClasses = [...(subdept.classes || [])]

      if (updatedClasses[classIndex]) {
        updatedClasses[classIndex] = {
          ...updatedClasses[classIndex],
          requirements: [...(updatedClasses[classIndex].requirements || []), requirement]
        }
        subdept.classes = updatedClasses
        updatedSubdepartments[subdeptIndex] = subdept
      }

      return {
        ...prev,
        subdepartments: updatedSubdepartments
      }
    })

    // Reset requirement form
    setNewClassRequirement({
      name: '',
      description: '',
      isRequired: true
    })
  }

  const handleRemoveClassRequirement = (subdeptIndex: number, classIndex: number, reqIndex: number) => {
    setDepartmentForm(prev => {
      const updatedSubdepartments = [...prev.subdepartments]
      const subdept = { ...updatedSubdepartments[subdeptIndex] }
      const updatedClasses = [...(subdept.classes || [])]

      if (updatedClasses[classIndex]?.requirements) {
        updatedClasses[classIndex] = {
          ...updatedClasses[classIndex],
          requirements: updatedClasses[classIndex].requirements.filter((_, i) => i !== reqIndex)
        }
        subdept.classes = updatedClasses
        updatedSubdepartments[subdeptIndex] = subdept
      }

      return {
        ...prev,
        subdepartments: updatedSubdepartments
      }
    })
  }

  const handleRemoveClass = (subdeptIndex: number, classIndex: number) => {
    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: prev.subdepartments.map((subdept, index) =>
        index === subdeptIndex
          ? { ...subdept, classes: subdept.classes.filter((_, i) => i !== classIndex) }
          : subdept
      )
    }))
  }

  const handleSubdepartmentChange = (subdeptIndex: number, field: string, value: any) => {
    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: prev.subdepartments.map((subdept, index) =>
        index === subdeptIndex
          ? { ...subdept, [field]: value }
          : subdept
      )
    }))
  }

  const handleStageChange = (subdeptIndex: number, stageName: string, field: string, value: any) => {
    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: prev.subdepartments.map((subdept, index) =>
        index === subdeptIndex
          ? {
            ...subdept,
            stages: {
              ...subdept.stages,
              [stageName]: {
                ...subdept.stages[stageName],
                [field]: value
              }
            }
          }
          : subdept
      )
    }))
  }

  const handleSaveDepartment = async () => {
    if (!departmentForm.name.trim()) {
      toast.error('Department name is required')
      return
    }

    const isEditingSubdepartment = departmentForm.subdepartments[0]?.id !== undefined
    const isAddingSingleSubdepartment = !!currentDepartmentId && departmentForm.subdepartments.length === 1
    const isAddingMultipleSubdepartments = !currentDepartmentId && departmentForm.subdepartments.length > 0

    try {
      setSaving(true)

      // Process a single subdepartment (when adding/editing a subdepartment)
      if (isAddingSingleSubdepartment) {
        const subdept = departmentForm.subdepartments[0]
        if (!subdept.name.trim()) {
          toast.error('Please enter a subdepartment name')
          return
        }

        // Prepare task manager data if selected
        const taskManager = subdept.taskManagerId && subdept.taskManagerId !== 'none'
          ? await supabase
              .from('tm_users')
              .select('id, name, email')
              .eq('id', subdept.taskManagerId)
              .single()
          : { data: null }

        // Prepare task assistant data if selected
        const taskAssistant = subdept.taskAssistantId && subdept.taskAssistantId !== 'none'
          ? await supabase
              .from('tm_users')
              .select('id, name, email')
              .eq('id', subdept.taskAssistantId)
              .single()
          : { data: null }

        // Get selected stages with their IDs
        const selectedStages = await supabase
          .from('tm_stages')
          .select('id, name, order_num, estimated_time')
          .in('name', Object.entries(subdept.stages)
            .filter(([_, stage]) => stage?.applies)
            .map(([name]) => name)
          )

        const subdeptData = {
          name: subdept.name.trim(),
          description: subdept.description ? subdept.description.trim() : null,
          department_id: currentDepartmentId,
          classes: subdept.classes?.map(cls => ({
            name: cls.name,
            description: cls.description || null,
            requirements: cls.requirements?.map(req => ({
              name: req.name,
              description: req.description || null,
              is_required: req.isRequired
            })) || []
          })) || [],
          task_manager: taskManager.data ? {
            id: taskManager.data.id,
            start_date: new Date().toISOString(),
            end_date: null
          } : null,
          task_assistant: taskAssistant.data ? {
            id: taskAssistant.data.id,
            start_date: new Date().toISOString(),
            end_date: null
          } : null,
        }

        if (isEditingSubdepartment) {
          // Update existing subdepartment
          const { error: updateError } = await supabase
            .from('tm_subdepartments')
            .update(subdeptData)
            .eq('id', subdept.id)

          if (updateError) throw updateError
          toast.success('Subdepartment updated successfully')
        } else {
          // Create new subdepartment
          const { error: subdeptError } = await supabase
            .from('tm_subdepartments')
            .insert(subdeptData)
            .select()
            .single()

          if (subdeptError) throw subdeptError
          toast.success('Subdepartment added successfully')
        }

        // Refresh the data
        await fetchData()
        setIsAddDepartmentOpen(false)
        setCurrentDepartmentId(null)
        return
      }


      // Prepare department data with all subdepartments
      const departmentData = {
        name: departmentForm.name.trim(),
        description: departmentForm.description ? departmentForm.description.trim() : null,
        subdepartments: departmentForm.subdepartments.map(subdept => {
          // Validate subdepartment name
          if (!subdept.name.trim()) {
            throw new Error('Subdepartment name is required')
          }

          // Prepare task manager data if selected
          const taskManager = subdept.taskManagerId && subdept.taskManagerId !== 'none'
            ? users.find(u => u.id === subdept.taskManagerId)
            : null

          // Prepare task assistant data if selected
          const taskAssistant = subdept.taskAssistantId && subdept.taskAssistantId !== 'none'
            ? users.find(u => u.id === subdept.taskAssistantId)
            : null

          // Get stages data
          let stagesData: any[] = []
          if (subdept.stages) {
            stagesData = Object.entries(subdept.stages)
              .filter(([_, stage]) => stage && stage.applies)
              .map(([name]) => ({
                name,
                estimated_time: 8 * 60, // Default 8 hours in minutes
                order_num: globalStages.findIndex(s => s.name === name) + 1
              }))
          }


          return {
            id: subdept.id, // Include ID for updates if it exists
            name: subdept.name.trim(),
            description: subdept.description ? subdept.description.trim() : null,
            classes: subdept.classes?.map(cls => ({
              id: cls.id, // Include ID for updates if it exists
              name: cls.name,
              description: cls.description ? cls.description : null,
              requirements: cls.requirements?.map(req => ({
                id: req.id, // Include ID for updates if it exists
                name: req.name,
                description: req.description ? req.description : null,
                is_required: req.isRequired
              })) || []
            })) || [],
            task_manager: taskManager ? {
              id: taskManager.id,
              start_date: new Date().toISOString(),
              end_date: null
            } : null,
            task_assistant: taskAssistant ? {
              id: taskAssistant.id,
              start_date: new Date().toISOString(),
              end_date: null
            } : null,
            stages: stagesData
          }
        })
      }

      await createDepartmentDb(departmentData)
      await fetchData()
      toast.success('Department created successfully')
      setIsAddDepartmentOpen(false)
    } catch (error) {
      console.error('Error saving department:', error)
      toast.error('Failed to save department')
    } finally {
      setSaving(false)
    }
  }

  const handleAddStage = (subdept: Subdepartment) => {
    setCurrentSubdept(subdept)
    setIsAddStageOpen(true)
  }

  const handleEditSubdepartment = (deptId: string, subdept: Subdepartment) => {
    setCurrentDepartmentId(deptId)
    setDepartmentForm({
      name: departments.find(d => d.id === deptId)?.name || '',
      description: '',
      subdepartments: [{
        ...subdept,
        taskManagerId: subdept.taskManagerId || '',
        taskAssistantId: subdept.taskAssistantId || '',
        // Convert stages to the format expected by the form
        stages: globalStages.reduce((acc, stage) => ({
          ...acc,
          [stage.name]: {
            applies: subdept.stages.some(s => s.name === stage.name),
            estimatedTime: 8, // Default value, adjust as needed
            reminderDays: 1   // Default value, adjust as needed
          }
        }), {} as any)
      }]
    })
    setIsAddDepartmentOpen(true)
  }

  const handleAddSubdepartment = (deptId: string, deptName: string) => {
    // If we're already in the dialog, just add a new subdepartment
    if (isAddDepartmentOpen) {
      const newSubdept = {
        name: `Subdepartment ${departmentForm.subdepartments.length + 1}`,
        description: '',
        classes: [],
        taskManagerId: '',
        taskAssistantId: '',
        stages: globalStages.reduce((acc, stage) => ({
          ...acc,
          [stage.name]: {
            applies: true,
            estimatedTime: 8,
            reminderDays: 1
          }
        }), {} as any)
      }
      
      setDepartmentForm(prev => ({
        ...prev,
        subdepartments: [...prev.subdepartments, newSubdept]
      }))
      return
    }
    
    // If we're opening the dialog for the first time
    setCurrentDepartmentId(deptId)
    setDepartmentForm({ 
      name: deptName,
      description: '',
      subdepartments: [{
        name: 'Subdepartment 1',
        description: '',
        classes: [],
        taskManagerId: '',
        taskAssistantId: '',
        stages: globalStages.reduce((acc, stage) => ({
          ...acc,
          [stage.name]: {
            applies: true,
            estimatedTime: 8,
            reminderDays: 1
          }
        }), {} as any)
      }]
    })
    setIsAddDepartmentOpen(true)
  }

  const handleSaveStage = async (stageData: Omit<Stage, 'id' | 'order' | 'isActive'>) => {
    if (!currentSubdept) return

    try {
      setSaving(true)

      const newStage = await createStageDb({
        ...stageData,
        subdepartmentId: currentSubdept.id,
        order: currentSubdept.stages.length + 1
      })

      // Update local state
      setDepartments(prev => prev.map(dept => ({
        ...dept,
        subdepartments: dept.subdepartments.map(subdept => {
          if (subdept.id === currentSubdept.id) {
            return {
              ...subdept,
              stages: [...subdept.stages, newStage]
            }
          }
          return subdept
        })
      })))

      setIsAddStageOpen(false)
      toast.success('Stage added successfully')
    } catch (error) {
      console.error('Error creating stage:', error)
      toast.error('Failed to create stage. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const getUserName = (userData: any) => {
    if (!userData) return 'Unassigned';
    
    // Handle case where userData is an object with id (from API response)
    if (typeof userData === 'object' && userData !== null) {
      if (userData.name) return userData.name;
      if (userData.id) {
        const user = users.find(u => u.id === userData.id);
        return user ? user.name : 'Unassigned';
      }
      return 'Unassigned';
    }
    
    // Handle case where userData is just an ID string
    if (typeof userData === 'string') {
      const user = users.find(u => u.id === userData);
      return user ? user.name : 'Unassigned';
    }
    
    return 'Unassigned';
  }

  const handleOpenAssignmentDialog = (deptId: string, subdept: Subdepartment) => {
    setSelectedSubdept({ deptId, subdept })
    setAssignmentDialogOpen(true)
  }

  const handleDeleteSubdepartment = async (departmentId: string, subdepartmentId: string) => {
    if (!confirm('Are you sure you want to delete this subdepartment? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      
      // First, delete any related data (e.g., stages, assignments)
      // This is a simplified example - adjust according to your database schema
      const { error: deleteError } = await supabase
        .from('tm_subdepartments')
        .delete()
        .eq('id', subdepartmentId);

      if (deleteError) throw deleteError;

      // Refresh the data
      await fetchData();
      toast.success('Subdepartment deleted successfully');
    } catch (error) {
      console.error('Error deleting subdepartment:', error);
      toast.error('Failed to delete subdepartment');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAssignments = async (taskManagerId: string, taskAssistantId: string) => {
    if (!selectedSubdept) return

    try {
      setSaving(true)

      // Update the subdepartment with new assignments
      const { error } = await supabase
        .from('tm_subdepartments')
        .update({
          task_manager_id: taskManagerId || null,
          task_assistant_id: taskAssistantId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSubdept.subdept.id)

      if (error) throw error

      // Refresh the data
      await fetchData()
      setAssignmentDialogOpen(false)
      toast.success('Assignments updated successfully')
    } catch (error) {
      console.error('Error updating assignments:', error)
      toast.error('Failed to update assignments')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isAddDepartmentOpen) {
      setDepartmentForm({
        name: '',
        description: '',
        subdepartments: []
      })
      setCurrentDepartmentId(null)
    }
  }, [isAddDepartmentOpen])

  if (loading) {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading departments...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Departments & Workflows</h2>
          <p className="text-sm text-muted-foreground">
            Manage departments, subdepartments, and their workflow stages
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleAddDepartment}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
          <CardDescription>Manage departments and their subdepartments.</CardDescription>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No departments found. Create your first department to get started.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {departments.map((dept) => (
                <AccordionItem key={dept.id} value={dept.id}>
                  <AccordionTrigger className="hover:bg-muted/50 px-4 py-2 rounded-md">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="text-left">
                        <span className="font-medium">{dept.name}</span>
                        {dept.description && (
                          <p className="text-sm text-muted-foreground mt-1">{dept.description}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">
                          {dept.subdepartments.length} subdepartments
                        </Badge>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-4 pr-2 pt-2">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium">Subdepartments</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddSubdepartment(dept.id, dept.name)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Subdepartment
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {dept.subdepartments.length === 0 && (
                          <p className="text-sm text-muted-foreground">No subdepartments yet. Click the button above to add one.</p>
                        )}
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead className="w-[50px] text-center">#</TableHead>
                              <TableHead className="w-[200px] border-r">Subdepartment</TableHead>
                              <TableHead className="border-r">Classes</TableHead>
                              <TableHead className="border-r">Task Manager</TableHead>
                              <TableHead className="border-r">Task Assistant</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dept.subdepartments.map((subdept, index) => (
                              <TableRow key={subdept.id} className="hover:bg-muted/50">
                                <TableCell className="text-center text-sm text-muted-foreground border-r">
                                  {index + 1}
                                </TableCell>
                                <TableCell className="border-r">
                                  <div>
                                    <div className="font-medium">{subdept.name}</div>
                                    {subdept.description && (
                                      <div className="text-sm text-muted-foreground">{subdept.description}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="border-r">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                                        <span>{subdept.classes?.length || 0} Classes</span>
                                        <ChevronDown className="h-4 w-4 ml-2" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                      <div className="space-y-4">
                                        <h4 className="font-medium leading-none">Classes & Requirements</h4>
                                        {subdept.classes && subdept.classes.length > 0 ? (
                                          <div className="space-y-4">
                                            {subdept.classes.map((cls) => (
                                              <div key={cls.id} className="border rounded-md p-3">
                                                <div className="font-medium">{cls.name}</div>
                                                {cls.description && (
                                                  <p className="text-sm text-muted-foreground">{cls.description}</p>
                                                )}
                                                {cls.requirements && cls.requirements.length > 0 && (
                                                  <div className="mt-2">
                                                    <div className="text-xs font-medium text-muted-foreground mb-1">Requirements:</div>
                                                    <ul className="space-y-1">
                                                      {cls.requirements.map((req, idx) => (
                                                        <li key={idx} className="flex items-start">
                                                          <Check className="h-3 w-3 text-green-500 mt-0.5 mr-1 flex-shrink-0" />
                                                          <span className="text-sm">
                                                            {req.name}
                                                            {req.description && (
                                                              <span className="text-muted-foreground"> - {req.description}</span>
                                                            )}
                                                          </span>
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-muted-foreground">No classes defined</div>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </TableCell>
                                <TableCell className="border-r">
                                  <div className="min-w-[120px]">
                                    {subdept.task_manager ? (
                                      <UserDetailsPopover userId={subdept.task_manager.id} users={users} role="manager">
                                        <span className="text-sm">{subdept.task_manager.name || 'Unassigned'}</span>
                                      </UserDetailsPopover>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">Unassigned</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="border-r">
                                  <div className="min-w-[120px]">
                                    {subdept.task_assistant ? (
                                      <UserDetailsPopover userId={subdept.task_assistant.id} users={users} role="assistant">
                                        <span className="text-sm">{subdept.task_assistant.name || 'Unassigned'}</span>
                                      </UserDetailsPopover>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">Unassigned</span>
                                    )}
                                  </div>
                                </TableCell>
                                {/* <TableCell className="border-r text-center">
                                  <Badge variant="outline">{subdept.processingTime} days</Badge>
                                </TableCell>
                                <TableCell className="border-r text-center">
                                  <Badge variant="outline">{subdept.deliveryTime} days</Badge>
                                </TableCell>
                                <TableCell className="border-r">
                                  <div className="flex items-center space-x-2">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                                          <span>{subdept.stages?.length || 0} Stages</span>
                                          <ChevronDown className="h-4 w-4 ml-2" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-96">
                                        <div className="space-y-4">
                                          <h4 className="font-medium leading-none">Workflow Stages</h4>
                                          <div className="space-y-4">
                                            {subdept.stages && subdept.stages.length > 0 ? (
                                              <div className="space-y-2">
                                                {subdept.stages.map((stage) => (
                                                  <div key={stage.id} className="border rounded-md p-3">
                                                    <div className="flex justify-between items-start">
                                                      <div>
                                                        <div className="font-medium">{stage.name}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                          {stage.estimatedTime} hours • Order: {stage.order}
                                                        </div>
                                                      </div>
                                                      <Badge variant={stage.status === 'yes' ? 'default' : 'outline'}>
                                                        {stage.status === 'yes' ? 'Active' : 'N/A'}
                                                      </Badge>
                                                    </div>
                                                    {stage.reminderDays > 0 && (
                                                      <div className="mt-2 text-sm text-muted-foreground">
                                                        Reminder after {stage.reminderDays} days
                                                      </div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="text-sm text-muted-foreground">No stages defined</div>
                                            )}
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </TableCell> */}
                                <TableCell className="w-[180px]">
                                  <div className="flex space-x-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleOpenAssignmentDialog(dept.id, subdept)}
                                      title="Assign users"
                                    >
                                      <UserPlus className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleEditSubdepartment(dept.id, subdept)}
                                      title="Edit subdepartment"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => handleDeleteSubdepartment(dept.id, subdept.id)}
                                      title="Delete subdepartment"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Add Department/Subdepartment Dialog */}
      <Dialog open={isAddDepartmentOpen} onOpenChange={setIsAddDepartmentOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {currentDepartmentId ? 'Add New Subdepartment' : 'Add New Department'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Department Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deptName">Department Name</Label>
                <Input
                  id="deptName"
                  placeholder="e.g., Immigration"
                  value={departmentForm.name}
                  onChange={(e) => setDepartmentForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deptDescription">Description (Optional)</Label>
                <Textarea
                  id="deptDescription"
                  placeholder="Brief description of the department"
                  value={departmentForm.description}
                  onChange={(e) => setDepartmentForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            {/* Subdepartments */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium">Subdepartments</h4>
                <Button onClick={handleAddSubdepartment} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subdepartment
                </Button>
              </div>

              {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                <Card key={subdeptIndex} className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <h5 className="font-medium">Subdepartment {subdeptIndex + 1}</h5>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSubdepartment(subdeptIndex)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Subdepartment Name</Label>
                        <Input
                          placeholder="e.g., Visa Processing"
                          value={subdept.name}
                          onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (Optional)</Label>
                        <Input
                          placeholder="Brief description"
                          value={subdept.description}
                          onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Staff Assignment */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Task Manager</Label>
                        <Select
                          value={subdept.taskManagerId || 'none'}
                          onValueChange={(value) => handleSubdepartmentChange(subdeptIndex, 'taskManagerId', value === 'none' ? null : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select task manager" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {users.map(user => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Task Assistant</Label>
                        <Select
                          value={subdept.taskAssistantId || 'none'}
                          onValueChange={(value) => handleSubdepartmentChange(subdeptIndex, 'taskAssistantId', value === 'none' ? null : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select task assistant" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {users.map(user => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Classes (Optional) */}
                    <div className="space-y-2">
                      <Label>Classes (Optional)</Label>
                      <div className="flex space-x-2">
                        <Input
                          placeholder="Add a class name"
                          value={newClassInput}
                          onChange={(e) => setNewClassInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddClass(subdeptIndex)
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={() => handleAddClass(subdeptIndex)}
                          variant="outline"
                        >
                          Add
                        </Button>
                      </div>
                      {subdept.classes.length > 0 && (
                        <div className="space-y-3 mt-2">
                          {subdept.classes.map((cls, classIndex) => (
                            <div key={cls.id} className="border rounded-md p-3 space-y-2">
                              <div className="flex justify-between items-center">
                                <div className="font-medium">{cls.name}</div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveClass(subdeptIndex, classIndex)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Class Requirements */}
                              <div className="pl-2 border-l-2 border-muted">
                                <div className="text-sm font-medium mb-2">Requirements:</div>
                                <div className="space-y-2">
                                  <div className="flex space-x-2">
                                    <Input
                                      placeholder="Requirement name"
                                      value={newClassRequirement.name}
                                      onChange={(e) => setNewClassRequirement(prev => ({ ...prev, name: e.target.value }))}
                                      className="flex-1"
                                    />
                                    <Input
                                      placeholder="Description (optional)"
                                      value={newClassRequirement.description || ''}
                                      onChange={(e) => setNewClassRequirement(prev => ({ ...prev, description: e.target.value }))}
                                      className="flex-1"
                                    />
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`req-required-${subdeptIndex}-${classIndex}`}
                                        checked={newClassRequirement.isRequired}
                                        onCheckedChange={(checked) =>
                                          setNewClassRequirement(prev => ({ ...prev, isRequired: Boolean(checked) }))
                                        }
                                      />
                                      <Label htmlFor={`req-required-${subdeptIndex}-${classIndex}`} className="whitespace-nowrap">
                                        Required
                                      </Label>
                                    </div>
                                    <Button
                                      type="button"
                                      onClick={() => handleAddClassRequirement(subdeptIndex, classIndex)}
                                      variant="outline"
                                      size="sm"
                                    >
                                      Add
                                    </Button>
                                  </div>

                                  {cls.requirements?.length > 0 && (
                                    <div className="space-y-1">
                                      {cls.requirements.map((req, reqIndex) => (
                                        <div key={req.id} className="flex items-center justify-between bg-muted/50 p-2 rounded">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">{req.name}</span>
                                              {req.description && (
                                                <span className="text-muted-foreground text-sm">{req.description}</span>
                                              )}
                                              {req.isRequired && (
                                                <Badge variant="default" className="text-xs">Required</Badge>
                                              )}
                                            </div>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveClassRequirement(subdeptIndex, classIndex, reqIndex)}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}

              {departmentForm.subdepartments.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No subdepartments added yet. Click "Add Subdepartment" to get started.
                </div>
              )}
            </div>

            {/* Dialog Actions */}
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDepartmentOpen(false)
                  setCurrentDepartmentId(null)
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDepartment}
                disabled={saving}
              >
                {saving ? 'Saving...' : currentDepartmentId ? 'Save Subdepartment' : 'Save Department'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Stage Dialog */}
      <Dialog open={isAddStageOpen} onOpenChange={setIsAddStageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stageName">Stage Name</Label>
              <Input id="stageName" placeholder="e.g., Document Review" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedTime">Estimated Time (hours)</Label>
              <Input
                id="estimatedTime"
                type="number"
                min="1"
                placeholder="e.g., 8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderDays">Reminder Days</Label>
              <Input
                id="reminderDays"
                type="number"
                min="1"
                placeholder="e.g., 1"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddStageOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const name = (document.getElementById('stageName') as HTMLInputElement).value
                  const estimatedTime = parseInt((document.getElementById('estimatedTime') as HTMLInputElement).value || '8')
                  const reminderDays = parseInt((document.getElementById('reminderDays') as HTMLInputElement).value || '1')
                  handleSaveStage({ name, estimatedTime, reminderDays, status: 'yes' })
                }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Add Stage'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Team Members</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedSubdept?.subdept.name} - {departments.find(d => d.id === selectedSubdept?.deptId)?.name}
            </p>
          </DialogHeader>

          {selectedSubdept && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Task Manager</Label>
                <Select
                  value={selectedSubdept.subdept.taskManagerId || ''}
                  onValueChange={(value) => {
                    setSelectedSubdept(prev => prev ? {
                      ...prev,
                      subdept: {
                        ...prev.subdept,
                        taskManagerId: value || undefined
                      }
                    } : null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {users
                      .filter(u => ['admin', 'task_manager'].includes(u.role))
                      .map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Task Assistant</Label>
                <Select
                  value={selectedSubdept.subdept.taskAssistantId || ''}
                  onValueChange={(value) => {
                    setSelectedSubdept(prev => prev ? {
                      ...prev,
                      subdept: {
                        ...prev.subdept,
                        taskAssistantId: value || undefined
                      }
                    } : null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {users
                      .filter(u => ['admin', 'task_assistant', 'officer'].includes(u.role))
                      .map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setAssignmentDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => selectedSubdept && handleSaveAssignments(
                    selectedSubdept.subdept.taskManagerId || '',
                    selectedSubdept.subdept.taskAssistantId || ''
                  )}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Assignments'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}