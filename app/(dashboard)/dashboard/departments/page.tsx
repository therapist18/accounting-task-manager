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
import { FolderPlus, Plus, Settings, Users, Clock, AlertTriangle, X, Edit, Loader2, UserPlus, UserCheck, UserX } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"
type User = {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'task_manager' | 'task_assistant' | 'officer' | string
  created_at?: string
  updated_at?: string
  assignedDepartments?: string[]
  assignedSubdepartments?: string[]
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

type SubdepartmentClass = {
  id: string
  name: string
  description?: string
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

export default function DepartmentsPage() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [isAddStageOpen, setIsAddStageOpen] = useState(false)
  const [currentSubdept, setCurrentSubdept] = useState<Subdepartment | null>(null)
  const [newClassInput, setNewClassInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedSubdept, setSelectedSubdept] = useState<{deptId: string, subdept: Subdepartment} | null>(null)

  // Global stages loaded from the database
  const [globalStages, setGlobalStages] = useState<Array<{id: string, name: string}>>([])

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
        .select('*')
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

  const handleAddSubdepartment = () => {
    const newSubdept: SubdepartmentForm = {
      name: '',
      description: '',
      classes: [],
      taskManagerId: '',
      taskAssistantId: '',
      stages: globalStages.reduce((acc, stage) => {
        acc[stage.name] = {
          applies: true,
          estimatedTime: 8,
          reminderDays: 1
        }
        return acc
      }, {} as any)
    }

    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: [...prev.subdepartments, newSubdept]
    }))
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
      description: ''
    }

    setDepartmentForm(prev => ({
      ...prev,
      subdepartments: prev.subdepartments.map((subdept, index) =>
        index === subdeptIndex
          ? { ...subdept, classes: [...subdept.classes, newClass] }
          : subdept
      )
    }))
    setNewClassInput('')
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
    try {
      setSaving(true)
  
      // Validate form
      if (!departmentForm.name.trim()) {
        toast.error('Department name is required')
        return
      }
  
      if (departmentForm.subdepartments.length === 0) {
        toast.error('At least one subdepartment is required')
        return
      }
  
      // Prepare department data
      const departmentData = {
        name: departmentForm.name.trim(),
        description: departmentForm.description.trim() || null,
        subdepartments: departmentForm.subdepartments.map(subdept => ({
          name: subdept.name.trim(),
          description: subdept.description.trim() || null,
          classes: subdept.classes,
          taskManagerId: subdept.taskManagerId === 'none' ? null : subdept.taskManagerId,
          taskAssistantId: subdept.taskAssistantId === 'none' ? null : subdept.taskAssistantId,
          stages: Object.entries(subdept.stages)
            .filter(([_, stage]) => stage.applies)
            .map(([name, stage]) => ({
              name,
              estimatedTime: stage.estimatedTime,
              reminderDays: stage.reminderDays
            }))
        }))
      }
  
      const newDepartment = await createDepartmentDb(departmentData)
      setDepartments(prev => [...prev, newDepartment])
      setIsAddDepartmentOpen(false)
      toast.success('Department created successfully')
  
      // Reset form
      setDepartmentForm({
        name: '',
        description: '',
        subdepartments: []
      })
    } catch (error) {
      console.error('Error creating department:', error)
      toast.error('Failed to create department. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddStage = (subdept: Subdepartment) => {
    setCurrentSubdept(subdept)
    setIsAddStageOpen(true)
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

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId)
    return user ? user.name : 'Unassigned'
  }

  const handleOpenAssignmentDialog = (deptId: string, subdept: Subdepartment) => {
    setSelectedSubdept({ deptId, subdept })
    setAssignmentDialogOpen(true)
  }

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
                        <Button variant="outline" size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Subdepartment
                        </Button>
                      </div>
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">Subdepartment</TableHead>
                              <TableHead>Classes</TableHead>
                              <TableHead>Task Manager</TableHead>
                              <TableHead>Task Assistant</TableHead>
                              <TableHead>Processing Time</TableHead>
                              <TableHead>Delivery Time</TableHead>
                              <TableHead>Stages</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dept.subdepartments.map((subdept) => (
                              <TableRow key={subdept.id}>
                                <TableCell>
                                  <div>
                                    <div className="font-medium">{subdept.name}</div>
                                    {subdept.description && (
                                      <div className="text-sm text-muted-foreground">{subdept.description}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {subdept.classes && subdept.classes.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {subdept.classes.map(cls => (
                                        <Badge key={cls.id} variant="outline" className="text-xs">
                                          {cls.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">No classes</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">{getUserName(subdept.taskManagerId || '')}</span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">{getUserName(subdept.taskAssistantId || '')}</span>
                                </TableCell>
                                <TableCell>{subdept.processingTime} days</TableCell>
                                <TableCell>{subdept.deliveryTime} days</TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm text-muted-foreground">
                                      {subdept.stages.length} stages
                                    </span>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleAddStage(subdept)}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Stage
                                    </Button>
                                  </div>
                                  {subdept.stages.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {subdept.stages.map(stage => (
                                        <div
                                          key={stage.id}
                                          className="flex items-center justify-between p-2 text-sm rounded border"
                                        >
                                          <div className="flex items-center space-x-2">
                                            <div className={`w-2 h-2 rounded-full ${stage.isActive ? 'bg-green-500' : 'bg-gray-300'
                                              }`} />
                                            <span>{stage.name}</span>
                                            <Badge variant={stage.status === 'yes' ? 'default' : 'secondary'} className="text-xs">
                                              {stage.status === 'yes' ? 'Active' : 'N/A'}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground flex items-center">
                                              <Clock className="h-3 w-3 mr-1" />
                                              {stage.estimatedTime}h
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              {stage.reminderDays}d reminder
                                            </span>
                                            {stage.isActive && (
                                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center">
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                Active
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex space-x-2">
                                            <Button variant="ghost" size="sm" className="h-6">
                                              <Users className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-6">
                                              <Settings className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex space-x-2">
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleOpenAssignmentDialog(dept.id, subdept)}
                                    >
                                      <UserPlus className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                      <Settings className="h-4 w-4" />
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

      {/* Add Department Dialog */}
      <Dialog open={isAddDepartmentOpen} onOpenChange={setIsAddDepartmentOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Department</DialogTitle>
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
                        <div className="flex flex-wrap gap-2 mt-2">
                          {subdept.classes.map((cls, classIndex) => (
                            <Badge key={cls.id} variant="secondary" className="flex items-center gap-1">
                              {cls.name}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => handleRemoveClass(subdeptIndex, classIndex)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stages Configuration */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Stages Configuration</Label>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => window.location.href = '/dashboard/settings/workflow-stages'}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Manage Stages
                        </Button>
                      </div>
                      {globalStages.length > 0 ? (
                        <div className="border rounded-md p-4 space-y-3 max-h-60 overflow-y-auto">
                          {globalStages.map((stage) => (
                            <div key={stage.id} className="flex items-center space-x-4 p-2 border rounded">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  checked={subdept.stages[stage.name]?.applies || false}
                                  onCheckedChange={(checked) =>
                                    handleStageChange(subdeptIndex, stage.name, 'applies', checked)
                                  }
                                />
                                <span className="text-sm font-medium min-w-[150px]">{stage.name}</span>
                              </div>

                              {subdept.stages[stage.name]?.applies && (
                                <div className="flex items-center space-x-2 flex-1">
                                  <div className="flex items-center space-x-1">
                                    <Label className="text-xs">Time (hrs):</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      className="w-20"
                                      value={subdept.stages[stage.name]?.estimatedTime || 8}
                                      onChange={(e) =>
                                        handleStageChange(subdeptIndex, stage.name, 'estimatedTime', parseInt(e.target.value) || 8)
                                      }
                                    />
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <Label className="text-xs">Reminder (days):</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      className="w-20"
                                      value={subdept.stages[stage.name]?.reminderDays || 1}
                                      onChange={(e) =>
                                        handleStageChange(subdeptIndex, stage.name, 'reminderDays', parseInt(e.target.value) || 1)
                                      }
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No workflow stages found. Please add stages in the workflow settings.
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
              <Button variant="outline" onClick={() => setIsAddDepartmentOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDepartment} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Department
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