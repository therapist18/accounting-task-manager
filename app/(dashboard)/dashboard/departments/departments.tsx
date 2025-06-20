// @ts-nocheck
"use client"
import { useState, useEffect } from "react"
import {
  fetchUsers,
  fetchDepartments,
  createDepartment as createDepartmentDb,
  
  Department,
  Subdepartment,
  Class,
  SubClass,
  Requirement,
  SubdepartmentForm,
  ClassForm,
  SubClassForm,
  RequirementForm
} from "./database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  FolderPlus, Plus, Settings, Users, Clock, AlertTriangle, X, Edit, Loader2, 
  UserPlus, UserCheck, UserX, ChevronDown, Check, Eye, EyeOff, 
  ChevronRight, ChevronUp, Trash2, FileText, Layers, Target,
  UserIcon, 
} from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"

// Helper function for deep cloning
const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj))

// Helper function for updating nested state
const updateNestedState = (state: any, path: string[], value: any) => {
  const newState = deepClone(state)
  let current = newState
  
  for (let i = 0; i < path.length - 1; i++) {
    if (!current[path[i]]) {
      current[path[i]] = {}
    }
    current = current[path[i]]
  }
  
  current[path[path.length - 1]] = value
  return newState
}

// User Details Popover Component
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
        <span className="cursor-pointer hover:underline text-blue-600">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">{user.name || 'No name'}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground">Role</p>
            <Badge variant="outline" className="mt-1">
              Task {role === 'manager' ? 'Manager' : 'Assistant'}
            </Badge>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Enhanced Requirement Component
function RequirementComponent({ 
  requirement, 
  onUpdate, 
  onRemove, 
  path 
}: {
  requirement: RequirementForm
  onUpdate: (path: string[], value: any) => void
  onRemove: () => void
  path: string[]
}) {
  return (
    <Card className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 border-l-4 border-l-blue-500">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <Input
                placeholder="Requirement name"
                value={requirement.name}
                onChange={(e) => onUpdate([...path, 'name'], e.target.value)}
                className="flex-1 font-medium"
              />
            </div>
            <Textarea
              placeholder="Description (optional)"
              value={requirement.description}
              onChange={(e) => onUpdate([...path, 'description'], e.target.value)}
              className="min-h-[60px]"
            />
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={requirement.isVisible}
                  onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))}
                />
                <Label className="text-sm flex items-center">
                  {requirement.isVisible ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                  Visible
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={requirement.isRequired}
                  onCheckedChange={(checked) => onUpdate([...path, 'isRequired'], Boolean(checked))}
                />
                <Label className="text-sm flex items-center">
                  <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
                  Required
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Label className="text-sm">Order:</Label>
                <Input
                  type="number"
                  value={requirement.order}
                  onChange={(e) => onUpdate([...path, 'order'], parseInt(e.target.value) || 0)}
                  className="w-16"
                />
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:text-red-700">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

// Enhanced SubClass Component
function SubClassComponent({ 
  subClass, 
  onUpdate, 
  onRemove, 
  path 
}: {
  subClass: SubClassForm
  onUpdate: (path: string[], value: any) => void
  onRemove: () => void
  path: string[]
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const addRequirement = () => {
    const newRequirement: RequirementForm = {
      id: Date.now(),
      name: '',
      description: '',
      isRequired: true,
      order: subClass.requirements.length + 1,
      isVisible: true
    }
    onUpdate([...path, 'requirements'], [...subClass.requirements, newRequirement])
  }

  const removeRequirement = (index: number) => {
    onUpdate([...path, 'requirements'], subClass.requirements.filter((_, i) => i !== index))
  }

  return (
    <Card className="border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Layers className="h-4 w-4 text-purple-600" />
            <Input
              placeholder="Sub-class name"
              value={subClass.name}
              onChange={(e) => onUpdate([...path, 'name'], e.target.value)}
              className="flex-1 font-semibold"
            />
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={subClass.isVisible}
                onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))}
              />
              <Label className="text-sm whitespace-nowrap">Visible</Label>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">{subClass.requirements.length} req</Badge>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            <Textarea
              placeholder="Sub-class description"
              value={subClass.description}
              onChange={(e) => onUpdate([...path, 'description'], e.target.value)}
              className="min-h-[60px]"
            />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center">
                  <Target className="h-4 w-4 mr-1" />
                  Requirements ({subClass.requirements.length})
                </Label>
                <Button variant="outline" size="sm" onClick={addRequirement}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Requirement
                </Button>
              </div>

              <div className="space-y-3">
                {subClass.requirements.map((req, reqIndex) => (
                  <RequirementComponent
                    key={req.id}
                    requirement={req}
                    onUpdate={onUpdate}
                    onRemove={() => removeRequirement(reqIndex)}
                    path={[...path, 'requirements', reqIndex.toString()]}
                  />
                ))}
                {subClass.requirements.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                    No requirements added yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// Enhanced Class Component  
function ClassComponent({ 
  classItem, 
  onUpdate, 
  onRemove, 
  path 
}: {
  classItem: ClassForm
  onUpdate: (path: string[], value: any) => void
  onRemove: () => void
  path: string[]
}) {
  const [activeTab, setActiveTab] = useState("details")

  const addSubClass = () => {
    const newSubClass: SubClassForm = {
      id: Date.now(),
      name: '',
      description: '',
      order: classItem.subClasses.length + 1,
      isVisible: true,
      requirements: []
    }
    onUpdate([...path, 'subClasses'], [...classItem.subClasses, newSubClass])
  }

  const removeSubClass = (index: number) => {
    onUpdate([...path, 'subClasses'], classItem.subClasses.filter((_, i) => i !== index))
  }

  const addDirectRequirement = () => {
    const newRequirement: RequirementForm = {
      id: Date.now(),
      name: '',
      description: '',
      isRequired: true,
      order: classItem.requirements.length + 1,
      isVisible: true
    }
    onUpdate([...path, 'requirements'], [...classItem.requirements, newRequirement])
  }

  const removeDirectRequirement = (index: number) => {
    onUpdate([...path, 'requirements'], classItem.requirements.filter((_, i) => i !== index))
  }

  const totalRequirements = classItem.requirements.length + 
    classItem.subClasses.reduce((total, subClass) => total + subClass.requirements.length, 0)

  return (
    <Card className="border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-emerald-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <Layers className="h-4 w-4 text-green-600" />
            </div>
            <Input
              placeholder="Class name"
              value={classItem.name}
              onChange={(e) => onUpdate([...path, 'name'], e.target.value)}
              className="flex-1 font-bold text-lg"
            />
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={classItem.isVisible}
                onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))}
              />
              <Label className="text-sm whitespace-nowrap">Visible</Label>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="default">{classItem.subClasses.length} sub-classes</Badge>
            <Badge variant="secondary">{totalRequirements} total req</Badge>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="requirements">Requirements ({classItem.requirements.length})</TabsTrigger>
            <TabsTrigger value="subclasses">Sub-classes ({classItem.subClasses.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <Textarea
                  placeholder="Class description"
                  value={classItem.description}
                  onChange={(e) => onUpdate([...path, 'description'], e.target.value)}
                  className="mt-1 min-h-[80px]"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Order</Label>
                <Input
                  type="number"
                  value={classItem.order}
                  onChange={(e) => onUpdate([...path, 'order'], parseInt(e.target.value) || 0)}
                  className="mt-1 w-32"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Direct Requirements for this Class</Label>
              <Button variant="outline" size="sm" onClick={addDirectRequirement}>
                <Plus className="h-4 w-4 mr-1" />
                Add Requirement
              </Button>
            </div>
            
            <div className="space-y-3">
              {classItem.requirements.map((req, reqIndex) => (
                <RequirementComponent
                  key={req.id}
                  requirement={req}
                  onUpdate={onUpdate}
                  onRemove={() => removeDirectRequirement(reqIndex)}
                  path={[...path, 'requirements', reqIndex.toString()]}
                />
              ))}
              {classItem.requirements.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  No direct requirements added yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="subclasses" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Sub-classes</Label>
              <Button variant="outline" size="sm" onClick={addSubClass}>
                <Plus className="h-4 w-4 mr-1" />
                Add Sub-class
              </Button>
            </div>

            <div className="space-y-4">
              {classItem.subClasses.map((subClass, subClassIndex) => (
                <SubClassComponent
                  key={subClass.id}
                  subClass={subClass}
                  onUpdate={onUpdate}
                  onRemove={() => removeSubClass(subClassIndex)}
                  path={[...path, 'subClasses', subClassIndex.toString()]}
                />
              ))}
              {classItem.subClasses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  No sub-classes added yet
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default function Departments() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [currentDepartmentId, setCurrentDepartmentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedSubdept, setSelectedSubdept] = useState<{ deptId: string, subdept: Subdepartment } | null>(null)
  
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [globalStages, setGlobalStages] = useState<Array<{ id: string, name: string }>>([])

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
    fetchUsersData()
    fetchGlobalStages()
  }, [])
 
  const fetchUsersData = async () => {
    try {
      const usersData = await fetchUsers()
      setUsers(usersData)
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to load users')
    }
  }
 
  const fetchData = async () => {
    try {
      setLoading(true)
      const departmentsData = await fetchDepartments()
      setDepartments(departmentsData)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }
 
  // Helper function to update nested form state
  const updateFormState = (path: string[], value: any) => {
    setDepartmentForm(prevState => updateNestedState(prevState, path, value))
  }
 
  const handleAddDepartment = () => {
    setDepartmentForm({
      name: '',
      description: '',
      subdepartments: []
    })
    setCurrentDepartmentId(null)
    setIsAddDepartmentOpen(true)
  }
 
  const handleAddSubdepartment = (deptId?: string, deptName?: string) => {
    const newSubdept: SubdepartmentForm = {
      name: `Subdepartment ${departmentForm.subdepartments.length + 1}`,
      description: '',
      classes: [],
      taskManagerId: '',
      taskAssistantIds: [],
      stages: globalStages.reduce((acc, stage) => ({
        ...acc,
        [stage.name]: {
          applies: true,
          estimatedTime: 8,
          reminderDays: 1
        }
      }), {} as any)
    }
    
    if (isAddDepartmentOpen && departmentForm.subdepartments.length > 0) {
      // Adding to existing form
      updateFormState(['subdepartments'], [...departmentForm.subdepartments, newSubdept])
    } else {
      // Opening dialog for the first time
      setCurrentDepartmentId(deptId || null)
      setDepartmentForm({ 
        name: deptName || '',
        description: '',
        subdepartments: [newSubdept]
      })
      setIsAddDepartmentOpen(true)
    }
  }
 
  const handleAddClass = (subdeptIndex: number) => {
    const newClass: ClassForm = {
      id: Date.now(),
      name: '',
      description: '',
      order: departmentForm.subdepartments[subdeptIndex].classes.length + 1,
      isVisible: true,
      requirements: [],
      subClasses: []
    }
    
    updateFormState(['subdepartments', subdeptIndex.toString(), 'classes'], [
      ...departmentForm.subdepartments[subdeptIndex].classes, 
      newClass
    ])
  }
 
  const handleRemoveClass = (subdeptIndex: number, classIndex: number) => {
    updateFormState(
      ['subdepartments', subdeptIndex.toString(), 'classes'], 
      departmentForm.subdepartments[subdeptIndex].classes.filter((_, i) => i !== classIndex)
    )
  }
 
  const handleRemoveSubdepartment = (index: number) => {
    updateFormState(['subdepartments'], departmentForm.subdepartments.filter((_, i) => i !== index))
  }
 
  const handleSubdepartmentChange = (subdeptIndex: number, field: string, value: any) => {
    updateFormState(['subdepartments', subdeptIndex.toString(), field], value)
  }
 
  const handleAddTaskAssistant = (subdeptIndex: number) => {
    const currentIds = departmentForm.subdepartments[subdeptIndex].taskAssistantIds
    updateFormState(['subdepartments', subdeptIndex.toString(), 'taskAssistantIds'], [...currentIds, ''])
  }
 
  const handleRemoveTaskAssistant = (subdeptIndex: number, assistantIndex: number) => {
    const currentIds = departmentForm.subdepartments[subdeptIndex].taskAssistantIds
    updateFormState(
      ['subdepartments', subdeptIndex.toString(), 'taskAssistantIds'], 
      currentIds.filter((_, i) => i !== assistantIndex)
    )
  }
 
  const handleTaskAssistantChange = (subdeptIndex: number, assistantIndex: number, userId: string) => {
    const currentIds = [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds]
    currentIds[assistantIndex] = userId
    updateFormState(['subdepartments', subdeptIndex.toString(), 'taskAssistantIds'], currentIds)
  }
 
  const handleSaveDepartment = async () => {
    if (!departmentForm.name.trim()) {
      toast.error('Department name is required')
      return
    }
 
    // Validate subdepartments
    for (const subdept of departmentForm.subdepartments) {
      if (!subdept.name.trim()) {
        toast.error('Please enter a name for all subdepartments')
        return
      }
    }
 
    try {
      setSaving(true)
 
      const isEditingSubdepartment = departmentForm.subdepartments[0]?.id !== undefined
      const isAddingSingleSubdepartment = !!currentDepartmentId && departmentForm.subdepartments.length === 1
 
      if (isAddingSingleSubdepartment) {
        // Handle single subdepartment addition/editing
        const subdept = departmentForm.subdepartments[0]
        
        const subdeptData = {
          name: subdept.name.trim(),
          description: subdept.description ? subdept.description.trim() : null,
          department_id: currentDepartmentId,
          classes: subdept.classes.map(cls => ({
            id: cls.id,
            name: cls.name,
            description: cls.description || null,
            order: cls.order,
            isVisible: cls.isVisible,
            subClasses: cls.subClasses.map(subCls => ({
              id: subCls.id,
              name: subCls.name,
              description: subCls.description || null,
              order: subCls.order,
              isVisible: subCls.isVisible
            }))
          })),
          task_manager: subdept.taskManagerId && subdept.taskManagerId !== 'none' ? {
            id: subdept.taskManagerId,
            start_date: new Date().toISOString(),
            end_date: null
          } : null,
          task_assistant: subdept.taskAssistantIds
            .filter(id => id && id !== 'none')
            .map(id => ({
              id,
              start_date: new Date().toISOString(),
              end_date: null
            }))
        }
 
        if (isEditingSubdepartment) {
          const { error: updateError } = await supabase
            .from('tm_subdepartments')
            .update(subdeptData)
            .eq('id', subdept.id)
 
          if (updateError) throw updateError
          toast.success('Subdepartment updated successfully')
        } else {
          const { error: insertError } = await supabase
            .from('tm_subdepartments')
            .insert(subdeptData)
 
          if (insertError) throw insertError
          toast.success('Subdepartment added successfully')
        }
 
        await fetchData()
        setIsAddDepartmentOpen(false)
        setCurrentDepartmentId(null)
        return
      }
 
      // Handle full department creation with multiple subdepartments
      const departmentData = {
        name: departmentForm.name.trim(),
        description: departmentForm.description ? departmentForm.description.trim() : null,
        subdepartments: departmentForm.subdepartments.map(subdept => ({
          id: subdept.id,
          name: subdept.name.trim(),
          description: subdept.description ? subdept.description.trim() : null,
          classes: subdept.classes.map(cls => ({
            id: cls.id,
            name: cls.name,
            description: cls.description || null,
            order: cls.order,
            isVisible: cls.isVisible,
            requirements: cls.requirements.map(req => ({
              id: req.id,
              name: req.name,
              description: req.description || null,
              isRequired: req.isRequired,
              order: req.order,
              isVisible: req.isVisible
            })),
            subClasses: cls.subClasses.map(subCls => ({
              id: subCls.id,
              name: subCls.name,
              description: subCls.description || null,
              order: subCls.order,
              isVisible: subCls.isVisible,
              requirements: subCls.requirements.map(req => ({
                id: req.id,
                name: req.name,
                description: req.description || null,
                isRequired: req.isRequired,
                order: req.order,
                isVisible: req.isVisible
              }))
            }))
          })),
          task_manager: subdept.taskManagerId && subdept.taskManagerId !== 'none' ? {
            id: subdept.taskManagerId,
            start_date: new Date().toISOString(),
            end_date: null
          } : null,
          task_assistants: subdept.taskAssistantIds
            .filter(id => id && id !== 'none')
            .map(id => ({
              id,
              start_date: new Date().toISOString(),
              end_date: null
            }))
        }))
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
 
  const handleEditSubdepartment = (deptId: string, subdept: Subdepartment) => {
    setCurrentDepartmentId(deptId)
    setDepartmentForm({
      name: departments.find(d => d.id === deptId)?.name || '',
      description: '',
      subdepartments: [{
        id: subdept.id,
        name: subdept.name,
        description: subdept.description || '',
        classes: subdept.classes.map(cls => ({
          id: cls.id,
          name: cls.name,
          description: cls.description || '',
          order: cls.order,
          isVisible: cls.isVisible,
          requirements: cls.requirements.map(req => ({
            id: req.id,
            name: req.name,
            description: req.description || '',
            isRequired: req.isRequired,
            order: req.order,
            isVisible: req.isVisible
          })),
          subClasses: cls.subClasses.map(subCls => ({
            id: subCls.id,
            name: subCls.name,
            description: subCls.description || '',
            order: subCls.order,
            isVisible: subCls.isVisible,
            requirements: subCls.requirements.map(req => ({
              id: req.id,
              name: req.name,
              description: req.description || '',
              isRequired: req.isRequired,
              order: req.order,
              isVisible: req.isVisible
            }))
          }))
        })),
        taskManagerId: subdept.taskManagerId || '',
        taskAssistantIds: subdept.taskAssistants.map(ta => ta.userId),
        stages: globalStages.reduce((acc, stage) => ({
          ...acc,
          [stage.name]: {
            applies: subdept.stages?.some(s => s.name === stage.name) || false,
            estimatedTime: 8,
            reminderDays: 1
          }
        }), {} as any)
      }]
    })
    setIsAddDepartmentOpen(true)
  }
 
  const handleDeleteSubdepartment = async (departmentId: string, subdepartmentId: string) => {
    if (!confirm('Are you sure you want to delete this subdepartment? This action cannot be undone.')) {
      return
    }
 
    try {
      setSaving(true)
      
      const { error: deleteError } = await supabase
        .from('tm_subdepartments')
        .delete()
        .eq('id', subdepartmentId)
 
      if (deleteError) throw deleteError
 
      await fetchData()
      toast.success('Subdepartment deleted successfully')
    } catch (error) {
      console.error('Error deleting subdepartment:', error)
      toast.error('Failed to delete subdepartment')
    } finally {
      setSaving(false)
    }
  }
 
  const handleOpenAssignmentDialog = (deptId: string, subdept: Subdepartment) => {
    setSelectedSubdept({ deptId, subdept })
    setAssignmentDialogOpen(true)
  }
 
  const handleSaveAssignments = async (taskManagerId: string, taskAssistantIds: string[]) => {
    if (!selectedSubdept) return
 
    try {
      setSaving(true)
 
      const { error } = await supabase
        .from('tm_subdepartments')
        .update({
          task_manager: taskManagerId ? {
            id: taskManagerId,
            start_date: new Date().toISOString(),
            end_date: null
          } : null,
          task_assistant: taskAssistantIds
            .filter(id => id && id !== 'none')
            .map(id => ({
              id,
              start_date: new Date().toISOString(),
              end_date: null
            })),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSubdept.subdept.id)
 
      if (error) throw error
 
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
 
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId)
    return user ? user.name : 'Unknown User'
  }
 
  // Reset form when dialog closes
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
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Departments & Workflows
          </h2>
          <p className="text-muted-foreground mt-2">
            Manage departments, subdepartments, classes, sub-classes, and their requirements
          </p>
        </div>
        <Button onClick={handleAddDepartment} size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          <FolderPlus className="mr-2 h-5 w-5" />
          Add Department
        </Button>
      </div>
 
      {/* Main Content */}
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
          <CardTitle className="flex items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 mr-3">
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            Departments Overview
          </CardTitle>
          <CardDescription>
            Manage your organizational structure with hierarchical class systems and team assignments.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {departments.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
                <FolderPlus className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No departments found</h3>
              <p className="text-muted-foreground mb-6">Create your first department to get started with managing your organizational structure.</p>
              <Button onClick={handleAddDepartment} size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Create First Department
              </Button>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full space-y-4">
              {departments.map((dept) => (
                <AccordionItem key={dept.id} value={dept.id} className="border rounded-lg shadow-sm">
                  <AccordionTrigger className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 px-6 py-4 rounded-lg">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="text-left">
                        <div className="flex items-center space-x-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                            <Layers className="h-5 w-5" />
                          </div>
                          <div>
                            <span className="font-semibold text-lg">{dept.name}</span>
                            {dept.description && (
                              <p className="text-sm text-muted-foreground mt-1">{dept.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          {dept.subdepartments.length} subdepartments
                        </Badge>
                        <Badge variant="outline">
                          {dept.subdepartments.reduce((total, sub) => total + sub.classes.length, 0)} classes
                        </Badge>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="px-6 pb-6">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-semibold flex items-center">
                          <Users className="h-5 w-5 mr-2 text-blue-600" />
                          Subdepartments
                        </h4>
                        <Button
                          variant="outline"
                          onClick={() => handleAddSubdepartment(dept.id, dept.name)}
                          className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 hover:from-green-100 hover:to-emerald-100"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Subdepartment
                        </Button>
                      </div>
                      
                      {dept.subdepartments.length === 0 ? (
                        <div className="text-center py-8">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mx-auto mb-3">
                            <Users className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-muted-foreground">No subdepartments yet. Add one to get started.</p>
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden bg-white">
                          <Table>
                            <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
                              <TableRow>
                                <TableHead className="w-[50px] text-center font-semibold">#</TableHead>
                                <TableHead className="w-[250px] font-semibold">Subdepartment</TableHead>
                                <TableHead className="font-semibold">Classes & Structure</TableHead>
                                <TableHead className="font-semibold">Task Manager</TableHead>
                                <TableHead className="font-semibold">Task Assistants</TableHead>
                                <TableHead className="text-center font-semibold">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dept.subdepartments.map((subdept, index) => (
                                <TableRow key={subdept.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50">
                                  <TableCell className="text-center text-sm text-muted-foreground font-medium">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <div className="font-semibold text-gray-900">{subdept.name}</div>
                                      {subdept.description && (
                                        <div className="text-sm text-muted-foreground mt-1">{subdept.description}</div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="w-full justify-between hover:bg-blue-50">
                                          <span className="flex items-center">
                                            <Layers className="h-4 w-4 mr-2" />
                                            {subdept.classes?.length || 0} Classes
                                            {subdept.classes?.reduce((total, cls) => total + (cls.subClasses?.length || 0), 0) > 0 && 
                                              ` • ${subdept.classes.reduce((total, cls) => total + (cls.subClasses?.length || 0), 0)} Sub-classes`
                                            }
                                          </span>
                                          <ChevronDown className="h-4 w-4 ml-2" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-[500px] max-h-96 overflow-y-auto">
                                        <div className="space-y-4">
                                          <h4 className="font-semibold text-lg flex items-center">
                                            <Layers className="h-5 w-5 mr-2 text-blue-600" />
                                            Classes & Sub-classes Structure
                                          </h4>
                                          {subdept.classes && subdept.classes.length > 0 ? (
                                            <div className="space-y-3">
                                              {subdept.classes.map((cls) => (
                                                <Card key={cls.id} className="border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-emerald-50">
                                                  <CardContent className="p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                      <div className="font-semibold flex items-center">
                                                        {cls.isVisible ? <Eye className="h-4 w-4 mr-2 text-green-600" /> : <EyeOff className="h-4 w-4 mr-2 text-gray-400" />}
                                                        {cls.name}
                                                      </div>
                                                      <div className="flex space-x-2">
                                                        <Badge variant="outline">{cls.requirements?.length || 0} reqs</Badge>
                                                        <Badge variant="secondary">{cls.subClasses?.length || 0} sub</Badge>
                                                      </div>
                                                    </div>
                                                    {cls.description && (
                                                      <p className="text-sm text-muted-foreground mb-3">{cls.description}</p>
                                                    )}
                                                    
                                                    {cls.subClasses && cls.subClasses.length > 0 && (
                                                      <div className="ml-4 space-y-2">
                                                        <div className="text-xs font-medium text-purple-600 mb-1">Sub-classes:</div>
                                                        {cls.subClasses.map((subCls) => (
                                                          <Card key={subCls.id} className="border-l-4 border-l-purple-400 bg-gradient-to-r from-purple-50 to-indigo-50">
                                                            <CardContent className="p-3">
                                                              <div className="flex items-center justify-between">
                                                                <div className="text-sm font-medium flex items-center">
                                                                  {subCls.isVisible ? <Eye className="h-3 w-3 mr-1 text-purple-600" /> : <EyeOff className="h-3 w-3 mr-1 text-gray-400" />}
                                                                  {subCls.name}
                                                                </div>
                                                                <Badge variant="outline" className="text-xs">{subCls.requirements?.length || 0} reqs</Badge>
                                                              </div>
                                                              {subCls.description && (
                                                                <p className="text-xs text-muted-foreground mt-1">{subCls.description}</p>
                                                              )}
                                                            </CardContent>
                                                          </Card>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </CardContent>
                                                </Card>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-center py-6">
                                              <Layers className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                                              <p className="text-sm text-muted-foreground">No classes defined</p>
                                            </div>
                                          )}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </TableCell>
                                  <TableCell>
                                    <div className="min-w-[120px]">
                                      {subdept.taskManagerId ? (
                                        <UserDetailsPopover userId={subdept.taskManagerId} users={users} role="manager">
                                          <div className="flex items-center space-x-2">
                                            <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                                              <UserIcon className="h-3 w-3 text-blue-600" />
                                            </div>
                                            <span className="text-sm font-medium">{getUserName(subdept.taskManagerId)}</span>
                                          </div>
                                        </UserDetailsPopover>
                                      ) : (
                                        <span className="text-sm text-muted-foreground flex items-center">
                                          <UserX className="h-4 w-4 mr-1" />
                                          Unassigned
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="min-w-[150px]">
                                      {subdept.taskAssistants.length > 0 ? (
                                        <div className="space-y-1">
                                          {subdept.taskAssistants.slice(0, 2).map((ta, taIndex) => (
                                            <UserDetailsPopover key={taIndex} userId={ta.userId} users={users} role="assistant">
                                              <div className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                                                  <UserIcon className="h-3 w-3 text-green-600" />
                                                </div>
                                                <span className="text-sm">{getUserName(ta.userId)}</span>
                                              </div>
                                            </UserDetailsPopover>
                                          ))}
                                          {subdept.taskAssistants.length > 2 && (
                                            <div className="text-xs text-muted-foreground">
                                              +{subdept.taskAssistants.length - 2} more
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-sm text-muted-foreground flex items-center">
                                          <UserX className="h-4 w-4 mr-1" />
                                          Unassigned
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex space-x-2 justify-center">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenAssignmentDialog(dept.id, subdept)}
                                        title="Assign users"
                                        className="hover:bg-blue-50"
                                      >
                                        <UserPlus className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEditSubdepartment(dept.id, subdept)}
                                        title="Edit subdepartment"
                                        className="hover:bg-green-50"
                                      >
                                       <Edit className="h-4 w-4" />
                                     </Button>
                                     <Button
                                       variant="outline"
                                       size="sm"
                                       onClick={() => handleDeleteSubdepartment(dept.id, subdept.id)}
                                       title="Delete subdepartment"
                                       className="hover:bg-red-50 text-red-500 hover:text-red-700"
                                     >
                                       <Trash2 className="h-4 w-4" />
                                     </Button>
                                   </div>
                                 </TableCell>
                               </TableRow>
                             ))}
                           </TableBody>
                         </Table>
                       </div>
                     )}
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
       <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
         <DialogHeader className="pb-4 border-b">
           <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
             {currentDepartmentId ? 'Add/Edit Subdepartment' : 'Add New Department'}
           </DialogTitle>
         </DialogHeader>
         
         <div className="space-y-8 py-6">
           {/* Department Basic Info */}
           <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
             <CardHeader>
               <CardTitle className="flex items-center">
                 <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 mr-3">
                   <Layers className="h-4 w-4 text-blue-600" />
                 </div>
                 Department Information
               </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label htmlFor="deptName" className="text-sm font-semibold">Department Name *</Label>
                   <Input
                     id="deptName"
                     placeholder="e.g., Immigration Services"
                     value={departmentForm.name}
                     onChange={(e) => updateFormState(['name'], e.target.value)}
                     className="text-lg font-medium"
                   />
                 </div>
                 <div className="space-y-2">
                   <Label htmlFor="deptDescription" className="text-sm font-semibold">Description</Label>
                   <Textarea
                     id="deptDescription"
                     placeholder="Brief description of the department's purpose and scope"
                     value={departmentForm.description}
                     onChange={(e) => updateFormState(['description'], e.target.value)}
                     className="min-h-[100px]"
                   />
                 </div>
               </div>
             </CardContent>
           </Card>

           {/* Subdepartments */}
           <Card>
             <CardHeader>
               <div className="flex items-center justify-between">
                 <CardTitle className="flex items-center">
                   <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 mr-3">
                     <Users className="h-4 w-4 text-green-600" />
                   </div>
                   Subdepartments ({departmentForm.subdepartments.length})
                 </CardTitle>
                 <Button onClick={() => handleAddSubdepartment()} variant="outline" size="sm" className="bg-green-50 border-green-200 hover:bg-green-100">
                   <Plus className="h-4 w-4 mr-2" />
                   Add Subdepartment
                 </Button>
               </div>
             </CardHeader>
             <CardContent>
               <div className="space-y-6">
                 {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                   <Card key={subdeptIndex} className="border-l-4 border-l-orange-500 bg-gradient-to-r from-orange-50 to-amber-50">
                     <CardHeader>
                       <div className="flex items-start justify-between">
                         <CardTitle className="flex items-center text-lg">
                           <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 mr-3">
                             <span className="text-sm font-bold text-orange-600">{subdeptIndex + 1}</span>
                           </div>
                           Subdepartment {subdeptIndex + 1}
                         </CardTitle>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => handleRemoveSubdepartment(subdeptIndex)}
                           className="text-red-500 hover:text-red-700 hover:bg-red-50"
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                     </CardHeader>

                     <CardContent className="space-y-6">
                       {/* Basic Info */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label className="text-sm font-semibold">Subdepartment Name *</Label>
                           <Input
                             placeholder="e.g., Visa Processing Unit"
                             value={subdept.name}
                             onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)}
                             className="font-medium"
                           />
                         </div>
                         <div className="space-y-2">
                           <Label className="text-sm font-semibold">Description</Label>
                           <Textarea
                             placeholder="Brief description of this subdepartment's responsibilities"
                             value={subdept.description}
                             onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)}
                             className="min-h-[80px]"
                           />
                         </div>
                       </div>

                       {/* Staff Assignment */}
                       <Card className="bg-white border-gray-200">
                         <CardHeader className="pb-3">
                           <CardTitle className="text-base flex items-center">
                             <UserCheck className="h-5 w-5 mr-2 text-blue-600" />
                             Team Assignments
                           </CardTitle>
                         </CardHeader>
                         <CardContent className="space-y-4">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             {/* Task Manager */}
                             <div className="space-y-2">
                               <Label className="text-sm font-semibold">Task Manager</Label>
                               <Select
                                 value={subdept.taskManagerId || 'none'}
                                 onValueChange={(value) => handleSubdepartmentChange(subdeptIndex, 'taskManagerId', value === 'none' ? '' : value)}
                               >
                                 <SelectTrigger className="bg-blue-50 border-blue-200">
                                   <SelectValue placeholder="Select task manager" />
                                 </SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="none">None</SelectItem>
                                   {users
                                     .filter(u => ['admin', 'user'].includes(u.role))
                                     .map(user => (
                                       <SelectItem key={user.id} value={user.id}>
                                         <div className="flex items-center space-x-2">
                                           <div className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center">
                                             <UserIcon className="h-2 w-2 text-blue-600" />
                                           </div>
                                           <span>{user.name}</span>
                                           <Badge variant="outline" className="text-xs">{user.role}</Badge>
                                         </div>
                                       </SelectItem>
                                     ))
                                   }
                                 </SelectContent>
                               </Select>
                             </div>

                             {/* Task Assistants */}
                             <div className="space-y-2">
                               <div className="flex items-center justify-between">
                                 <Label className="text-sm font-semibold">Task Assistants ({subdept.taskAssistantIds.length})</Label>
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={() => handleAddTaskAssistant(subdeptIndex)}
                                   className="bg-green-50 border-green-200 hover:bg-green-100"
                                 >
                                   <Plus className="h-3 w-3 mr-1" />
                                   Add
                                 </Button>
                               </div>
                               <div className="space-y-2 max-h-40 overflow-y-auto">
                                 {subdept.taskAssistantIds.map((assistantId, assistantIndex) => (
                                   <div key={assistantIndex} className="flex items-center space-x-2">
                                     <Select
                                       value={assistantId || 'none'}
                                       onValueChange={(value) => handleTaskAssistantChange(subdeptIndex, assistantIndex, value === 'none' ? '' : value)}
                                     >
                                       <SelectTrigger className="flex-1 bg-green-50 border-green-200">
                                         <SelectValue placeholder="Select task assistant" />
                                       </SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value="none">None</SelectItem>
                                         {users
                                           .filter(u => ['admin', 'user'].includes(u.role))
                                           .map(user => (
                                             <SelectItem key={user.id} value={user.id}>
                                               <div className="flex items-center space-x-2">
                                                 <div className="h-4 w-4 rounded-full bg-green-100 flex items-center justify-center">
                                                   <UserIcon className="h-2 w-2 text-green-600" />
                                                 </div>
                                                 <span>{user.name}</span>
                                                 <Badge variant="outline" className="text-xs">{user.role}</Badge>
                                               </div>
                                             </SelectItem>
                                           ))
                                         }
                                       </SelectContent>
                                     </Select>
                                     <Button
                                       variant="ghost"
                                       size="sm"
                                       onClick={() => handleRemoveTaskAssistant(subdeptIndex, assistantIndex)}
                                       className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                     >
                                       <X className="h-4 w-4" />
                                     </Button>
                                   </div>
                                 ))}
                                 {subdept.taskAssistantIds.length === 0 && (
                                   <div className="text-center py-4 text-muted-foreground border-2 border-dashed border-gray-200 rounded-lg">
                                     No task assistants assigned
                                   </div>
                                 )}
                               </div>
                             </div>
                           </div>
                         </CardContent>
                       </Card>

                       {/* Classes Section */}
                       <Card className="bg-white border-gray-200">
                         <CardHeader>
                           <div className="flex items-center justify-between">
                             <CardTitle className="text-base flex items-center">
                               <Layers className="h-5 w-5 mr-2 text-green-600" />
                               Classes & Requirements ({subdept.classes.length})
                             </CardTitle>
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => handleAddClass(subdeptIndex)}
                               className="bg-green-50 border-green-200 hover:bg-green-100"
                             >
                               <Plus className="h-4 w-4 mr-1" />
                               Add Class
                             </Button>
                           </div>
                         </CardHeader>
                         <CardContent>
                           <div className="space-y-6">
                             {subdept.classes.map((classItem, classIndex) => (
                               <ClassComponent
                                 key={classItem.id}
                                 classItem={classItem}
                                 onUpdate={updateFormState}
                                 onRemove={() => handleRemoveClass(subdeptIndex, classIndex)}
                                 path={['subdepartments', subdeptIndex.toString(), 'classes', classIndex.toString()]}
                               />
                             ))}
                             
                             {subdept.classes.length === 0 && (
                               <div className="text-center py-12 bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
                                 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
                                   <Layers className="h-8 w-8 text-gray-400" />
                                 </div>
                                 <h3 className="text-lg font-semibold text-gray-900 mb-2">No classes added yet</h3>
                                 <p className="text-muted-foreground mb-4">Classes help organize requirements and sub-categories for this subdepartment.</p>
                                 <Button onClick={() => handleAddClass(subdeptIndex)} variant="outline">
                                   <Plus className="h-4 w-4 mr-2" />
                                   Add Your First Class
                                 </Button>
                               </div>
                             )}
                           </div>
                         </CardContent>
                       </Card>
                     </CardContent>
                   </Card>
                 ))}

                 {departmentForm.subdepartments.length === 0 && (
                   <div className="text-center py-12 bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
                     <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
                       <Users className="h-10 w-10 text-gray-400" />
                     </div>
                     <h3 className="text-lg font-semibold text-gray-900 mb-2">No subdepartments added yet</h3>
                     <p className="text-muted-foreground mb-6">Subdepartments help organize your department into manageable units with specific responsibilities.</p>
                     <Button onClick={() => handleAddSubdepartment()} size="lg">
                       <Plus className="h-4 w-4 mr-2" />
                       Add Your First Subdepartment
                     </Button>
                   </div>
                 )}
               </div>
             </CardContent>
           </Card>

           {/* Dialog Actions */}
           <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
             <Button
               variant="outline"
               onClick={() => {
                 setIsAddDepartmentOpen(false)
                 setCurrentDepartmentId(null)
               }}
               disabled={saving}
               size="lg"
             >
               Cancel
             </Button>
             <Button
               onClick={handleSaveDepartment}
               disabled={saving || !departmentForm.name.trim()}
               size="lg"
               className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
             >
               {saving ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   Saving...
                 </>
               ) : (
                 <>
                   <Check className="mr-2 h-4 w-4" />
                   {currentDepartmentId ? 'Save Subdepartment' : 'Save Department'}
                 </>
               )}
             </Button>
           </div>
         </div>
       </DialogContent>
     </Dialog>

     {/* Assignment Dialog */}
     <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
       <DialogContent className="sm:max-w-[700px]">
         <DialogHeader className="pb-4 border-b">
           <DialogTitle className="text-xl font-bold">Assign Team Members</DialogTitle>
           <p className="text-sm text-muted-foreground">
             {selectedSubdept?.subdept.name} - {departments.find(d => d.id === selectedSubdept?.deptId)?.name}
           </p>
         </DialogHeader>

         {selectedSubdept && (
           <AssignmentDialogContent
             subdept={selectedSubdept.subdept}
             users={users}
             onSave={handleSaveAssignments}
             onCancel={() => setAssignmentDialogOpen(false)}
             saving={saving}
           />
         )}
       </DialogContent>
     </Dialog>
   </div>
 )
}

// Assignment Dialog Content Component
function AssignmentDialogContent({ 
 subdept, 
 users, 
 onSave, 
 onCancel, 
 saving 
}: {
 subdept: Subdepartment
 users: User[]
 onSave: (taskManagerId: string, taskAssistantIds: string[]) => void
 onCancel: () => void
 saving: boolean
}) {
 const [taskManagerId, setTaskManagerId] = useState(subdept.taskManagerId || '')
 const [taskAssistantIds, setTaskAssistantIds] = useState(
   subdept.taskAssistants.map(ta => ta.userId)
 )

 const addTaskAssistant = () => {
   setTaskAssistantIds([...taskAssistantIds, ''])
 }

 const removeTaskAssistant = (index: number) => {
   setTaskAssistantIds(taskAssistantIds.filter((_, i) => i !== index))
 }

 const updateTaskAssistant = (index: number, userId: string) => {
   const newIds = [...taskAssistantIds]
   newIds[index] = userId
   setTaskAssistantIds(newIds)
 }

 const handleSave = () => {
   onSave(taskManagerId, taskAssistantIds.filter(id => id && id !== 'none'))
 }

 return (
   <div className="space-y-6 py-6">
     {/* Task Manager Section */}
     <Card className="bg-blue-50 border-blue-200">
       <CardHeader className="pb-3">
         <CardTitle className="text-base flex items-center">
           <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
             <UserIcon className="h-3 w-3 text-blue-600" />
           </div>
           Task Manager
         </CardTitle>
       </CardHeader>
       <CardContent>
         <Select value={taskManagerId} onValueChange={setTaskManagerId}>
           <SelectTrigger className="bg-white">
             <SelectValue placeholder="Select task manager" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="">Unassigned</SelectItem>
             {users
               .filter(u => ['admin', 'user'].includes(u.role))
               .map(user => (
                 <SelectItem key={user.id} value={user.id}>
                   <div className="flex items-center space-x-3">
                     <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                       <UserIcon className="h-3 w-3 text-blue-600" />
                     </div>
                     <div>
                       <span className="font-medium">{user.name}</span>
                       <Badge variant="outline" className="ml-2 text-xs">{user.role}</Badge>
                     </div>
                   </div>
                 </SelectItem>
               ))
             }
           </SelectContent>
         </Select>
       </CardContent>
     </Card>

     {/* Task Assistants Section */}
     <Card className="bg-green-50 border-green-200">
       <CardHeader className="pb-3">
         <div className="flex items-center justify-between">
           <CardTitle className="text-base flex items-center">
             <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center mr-2">
               <Users className="h-3 w-3 text-green-600" />
             </div>
             Task Assistants ({taskAssistantIds.length})
           </CardTitle>
           <Button variant="outline" size="sm" onClick={addTaskAssistant} className="bg-white border-green-300 hover:bg-green-50">
             <Plus className="h-4 w-4 mr-1" />
             Add Assistant
           </Button>
         </div>
       </CardHeader>
       <CardContent>
         <div className="space-y-3">
           {taskAssistantIds.map((assistantId, index) => (
             <div key={index} className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-green-200">
               <div className="flex-1">
                 <Select
                   value={assistantId}
                   onValueChange={(value) => updateTaskAssistant(index, value)}
                 >
                   <SelectTrigger>
                     <SelectValue placeholder="Select task assistant" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="">Unassigned</SelectItem>
                     {users
                       .filter(u => ['admin', 'user'].includes(u.role))
                       .map(user => (
                         <SelectItem key={user.id} value={user.id}>
                           <div className="flex items-center space-x-3">
                             <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                               <UserIcon className="h-3 w-3 text-green-600" />
                             </div>
                             <div>
                               <span className="font-medium">{user.name}</span>
                               <Badge variant="outline" className="ml-2 text-xs">{user.role}</Badge>
                             </div>
                           </div>
                         </SelectItem>
                       ))
                     }
                   </SelectContent>
                 </Select>
               </div>
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => removeTaskAssistant(index)}
                 className="text-red-500 hover:text-red-700 hover:bg-red-50"
               >
                 <Trash2 className="h-4 w-4" />
               </Button>
             </div>
           ))}

           {taskAssistantIds.length === 0 && (
             <div className="text-center py-8 bg-white border-2 border-dashed border-green-200 rounded-lg">
               <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mx-auto mb-3">
                 <Users className="h-6 w-6 text-green-400" />
               </div>
               <p className="text-muted-foreground mb-3">No task assistants assigned</p>
               <Button variant="outline" onClick={addTaskAssistant} className="border-green-300 hover:bg-green-50">
                 <Plus className="h-4 w-4 mr-2" />
                 Add First Assistant
               </Button>
             </div>
           )}
         </div>
       </CardContent>
     </Card>

     {/* Actions */}
     <div className="flex justify-end space-x-3 pt-4 border-t">
       <Button variant="outline" onClick={onCancel} disabled={saving} size="lg">
         Cancel
       </Button>
       <Button onClick={handleSave} disabled={saving} size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
         {saving ? (
           <>
             <Loader2 className="mr-2 h-4 w-4 animate-spin" />
             Saving...
           </>
         ) : (
           <>
             <Check className="mr-2 h-4 w-4" />
             Save Assignments
           </>
         )}
       </Button>
     </div>
   </div>
 )
}