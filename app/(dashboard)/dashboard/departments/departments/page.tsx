// @ts-nocheck
"use client"
import React, { useState, useEffect } from "react"
import {
  fetchUsers,
  fetchDepartments,
  createDepartment as createDepartmentDb,
  saveClassRequirements,
  updateClassRequirements,
  saveSubdepartmentRequirements,
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
  UserIcon, Minus, ChevronsUpDown, ArrowUp, ArrowDown, GripVertical,
  Hash
} from "lucide-react"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"

// Helper function for deep cloning
const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj))

// Helper function for updating nested state
const updateNestedState = (state: any, path: (string | number)[], value: any) => {
  const newState = deepClone(state)
  let current = newState
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined) {
      const nextKey = path[i + 1];
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
  return newState;
};

// Enhanced index generator for hierarchical numbering
const generateHierarchicalIndex = (
  deptIndex: number,
  subdeptIndex?: number,
  classIndex?: number,
  subClassIndex?: number,
  reqIndex?: number
) => {
  let index = `${deptIndex + 1}`;
  if (subdeptIndex !== undefined) index += `.${subdeptIndex + 1}`;
  if (classIndex !== undefined) index += `.${classIndex + 1}`;
  if (subClassIndex !== undefined) index += `.${subClassIndex + 1}`;
  if (reqIndex !== undefined) index += `.${reqIndex + 1}`;
  return index;
};

// User Details Popover Component (Enhanced with blue theme)
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
        <span className="cursor-pointer hover:underline text-gray-700 hover:text-gray-900 transition-colors duration-200">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 border-gray-200 shadow-blue-100">
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-gray-700">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user.name || 'No name'}</p>
              <p className="text-sm text-gray-600">{user.email}</p>
            </div>
          </div>
          <div className="text-sm">
            <p className="text-gray-700 font-medium">Role</p>
            <Badge variant="outline" className="mt-1 border-gray-300 text-gray-700">
              Task {role === 'manager' ? 'Manager' : 'Assistant'}
            </Badge>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Enhanced Requirement Component with blue theme
function RequirementComponent({
  requirement,
  onUpdate,
  onRemove,
  path,
  index
}: {
  requirement: RequirementForm
  onUpdate: (path: string[], value: any) => void
  onRemove: () => void
  path: string[]
  index: string
}) {
  return (
    <Card className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-l-blue-400 hover:shadow-blue-200 transition-all duration-200">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-xs font-mono bg-blue-100 text-gray-700 border-gray-300">
                {index}
              </Badge>
              <FileText className="h-4 w-4 text-gray-600" />
              <Input
                placeholder="Requirement name"
                value={requirement.name}
                onChange={(e) => onUpdate([...path, 'name'], e.target.value)}
                className="flex-1 font-medium border-gray-200 focus:border-gray-400"
              />
            </div>
            <Textarea
              placeholder="Description (optional)"
              value={requirement.description}
              onChange={(e) => onUpdate([...path, 'description'], e.target.value)}
              className="min-h-[60px] border-gray-200 focus:border-gray-400"
            />
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={requirement.isVisible}
                  onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))}
                  className="border-gray-300 data-[state=checked]:bg-blue-600"
                />
                <Label className="text-sm flex items-center text-gray-700">
                  {requirement.isVisible ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                  Visible
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={requirement.isRequired}
                  onCheckedChange={(checked) => onUpdate([...path, 'isRequired'], Boolean(checked))}
                  className="border-gray-300 data-[state=checked]:bg-blue-600"
                />
                <Label className="text-sm flex items-center text-gray-700">
                  <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
                  Required
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Label className="text-sm text-gray-700">Order:</Label>
                <Input
                  type="number"
                  value={requirement.order}
                  onChange={(e) => onUpdate([...path, 'order'], parseInt(e.target.value) || 0)}
                  className="w-16 border-gray-200 focus:border-gray-400"
                />
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

// Enhanced SubClass Component with blue theme and hierarchical indexing
function SubClassComponent({
  subClass,
  onUpdate,
  onRemove,
  path,
  index
}: {
  subClass: SubClassForm
  onUpdate: (path: string[], value: any) => void
  onRemove: () => void
  path: string[]
  index: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const addRequirement = () => {
    const newRequirement: RequirementForm = {
      id: Date.now().toString(),
      name: '',
      description: '',
      isRequired: true,
      order: subClass.requirements.length + 1,
      isVisible: true
    }
    onUpdate([...path, 'requirements'], [...subClass.requirements, newRequirement])
  }

  const removeRequirement = (reqIndex: number) => {
    onUpdate([...path, 'requirements'], subClass.requirements.filter((_, i) => i !== reqIndex))
  }

  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50 hover:shadow-blue-200 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <Badge variant="outline" className="text-xs font-mono bg-blue-200 text-gray-800 border-gray-400">
              {index}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-gray-600 hover:text-gray-800 hover:bg-blue-100"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Layers className="h-4 w-4 text-gray-600" />
            <Input
              placeholder="Sub-class name"
              value={subClass.name}
              onChange={(e) => onUpdate([...path, 'name'], e.target.value)}
              className="flex-1 font-semibold border-gray-200 focus:border-gray-400"
            />
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={subClass.isVisible}
                onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))}
                className="border-gray-300 data-[state=checked]:bg-blue-600"
              />
              <Label className="text-sm whitespace-nowrap text-gray-700">Visible</Label>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="bg-blue-200 text-gray-800">{subClass.requirements.length} req</Badge>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:bg-red-50">
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
              className="min-h-[60px] border-gray-200 focus:border-gray-400"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center text-gray-800">
                  <Target className="h-4 w-4 mr-1" />
                  Requirements ({subClass.requirements.length})
                </Label>
                <Button variant="outline" size="sm" onClick={addRequirement} className="border-gray-300 text-gray-700 hover:bg-blue-50">
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
                    index={`${index}.${reqIndex + 1}`}
                  />
                ))}
                {subClass.requirements.length === 0 && (
                  <div className="text-center py-6 text-gray-600 border-2 border-dashed border-gray-300 rounded-lg bg-blue-50">
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

// Enhanced Class Component with blue theme and hierarchical indexing
function ClassComponent({
  classItem,
  onUpdate,
  onRemove,
  path,
  index
}: {
  classItem: ClassForm
  onUpdate: (path: string[], value: any) => void
  onRemove: () => void
  path: string[]
  index: string
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

  const removeSubClass = (subClassIndex: number) => {
    onUpdate([...path, 'subClasses'], classItem.subClasses.filter((_, i) => i !== subClassIndex))
  }

  const addDirectRequirement = () => {
    const newRequirement: RequirementForm = {
      id: Date.now().toString(),
      name: '',
      description: '',
      isRequired: true,
      order: classItem.requirements.length + 1,
      isVisible: true
    }
    onUpdate([...path, 'requirements'], [...classItem.requirements, newRequirement])
  }

  const removeDirectRequirement = (reqIndex: number) => {
    onUpdate([...path, 'requirements'], classItem.requirements.filter((_, i) => i !== reqIndex))
  }

  const totalRequirements = classItem.requirements.length +
    classItem.subClasses.reduce((total, subClass) => total + subClass.requirements.length, 0)

  return (
    <Card className="border-l-4 border-l-blue-600 bg-gradient-to-r from-blue-50 to-blue-100 hover:shadow-blue-300 transition-all duration-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <Badge variant="outline" className="text-xs font-mono bg-blue-200 text-gray-800 border-gray-400">
              {index}
            </Badge>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200">
              <Layers className="h-4 w-4 text-gray-700" />
            </div>
            <Input
              placeholder="Class name"
              value={classItem.name}
              onChange={(e) => onUpdate([...path, 'name'], e.target.value)}
              className="flex-1 font-bold text-lg border-gray-200 focus:border-gray-400"
            />
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={classItem.isVisible}
                onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))}
                className="border-gray-300 data-[state=checked]:bg-blue-600"
              />
              <Label className="text-sm whitespace-nowrap text-gray-700">Visible</Label>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="default" className="bg-blue-600 text-white">{classItem.subClasses.length} sub-classes</Badge>
            <Badge variant="secondary" className="bg-blue-200 text-gray-800">{totalRequirements} total req</Badge>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-blue-100">
            <TabsTrigger value="details" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Details</TabsTrigger>
            <TabsTrigger value="requirements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Requirements ({classItem.requirements.length})</TabsTrigger>
            <TabsTrigger value="subclasses" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Sub-classes ({classItem.subClasses.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-gray-800">Description</Label>
                <Textarea
                  placeholder="Class description"
                  value={classItem.description}
                  onChange={(e) => onUpdate([...path, 'description'], e.target.value)}
                  className="mt-1 min-h-[80px] border-gray-200 focus:border-gray-400"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-800">Order</Label>
                <Input
                  type="number"
                  value={classItem.order}
                  onChange={(e) => onUpdate([...path, 'order'], parseInt(e.target.value) || 0)}
                  className="mt-1 w-32 border-gray-200 focus:border-gray-400"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-800">Direct Requirements for this Class</Label>
              <Button variant="outline" size="sm" onClick={addDirectRequirement} className="border-gray-300 text-gray-700 hover:bg-blue-50">
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
                  index={`${index}.${reqIndex + 1}`}
                />
              ))}
              {classItem.requirements.length === 0 && (
                <div className="text-center py-8 text-gray-600 border-2 border-dashed border-gray-300 rounded-lg bg-blue-50">
                  No direct requirements added yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="subclasses" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-800">Sub-classes</Label>
              <Button variant="outline" size="sm" onClick={addSubClass} className="border-gray-300 text-gray-700 hover:bg-blue-50">
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
                  index={`${index}.${subClassIndex + 1}`}
                />
              ))}
              {classItem.subClasses.length === 0 && (
                <div className="text-center py-8 text-gray-600 border-2 border-dashed border-gray-300 rounded-lg bg-blue-50">
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
  
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [globalStages, setGlobalStages] = useState<Array<{ id: string, name: string }>>([])
  
  // State for managing expanded rows
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  
  // State for tracking and saving order changes
  const [isOrderChanged, setIsOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Form state for new department
  const [departmentForm, setDepartmentForm] = useState({
    name: '',
    description: '',
    subdepartments: [] as SubdepartmentForm[]
  })

  // Helper to sort nested structures by the 'order' property
  const sortAllByOrder = (depts: Department[]) => {
    const sortedDepts = [...depts].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedDepts.forEach(dept => {
      if (dept.subdepartments) {
        dept.subdepartments.sort((a, b) => (a.order || 0) - (b.order || 0));
        dept.subdepartments.forEach(subdept => {
          if (subdept.classes) {
            subdept.classes.sort((a, b) => (a.order || 0) - (b.order || 0));
            subdept.classes.forEach(cls => {
              if (cls.subClasses) {
                cls.subClasses.sort((a, b) => (a.order || 0) - (b.order || 0));
              }
            });
          }
        });
      }
    });
    return sortedDepts;
  };

  // Enhanced fetch functions with proper ordering
  const fetchData = async () => {
    try {
      setLoading(true)
      const { data: departmentsData, error } = await supabase
        .from('tm_departments')
        .select(`
          *,
          tm_subdepartments (
            *
          )
        `)
        .order('order', { ascending: true })

      if (error) throw error

      // Also ensure subdepartments are ordered
      const orderedData = (departmentsData || []).map(dept => ({
        ...dept,
        tm_subdepartments: (dept.tm_subdepartments || []).sort((a, b) => (a.order || 0) - (b.order || 0))
      }))

      setDepartments(orderedData)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsersData = async () => {
    try {
      const usersData = await fetchUsers()
      setUsers(usersData)
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to load users')
    }
  }

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

  // Enhanced ordering system
  const handleReorder = (list: any[], index: number, direction: 'up' | 'down') => {
    const newList = [...list];
    const item = newList[index];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return list;
    
    newList[index] = newList[swapIndex];
    newList[swapIndex] = item;
    
    // Update order properties
    newList.forEach((item, idx) => {
      item.order = idx + 1;
    });
    
    setIsOrderChanged(true);
    return newList;
  };

  const handleDepartmentReorder = (index: number, direction: 'up' | 'down') => {
    setDepartments(prev => handleReorder(prev, index, direction));
  };

  const handleSubdepartmentReorder = (deptIndex: number, subdeptIndex: number, direction: 'up' | 'down') => {
    const newSubdepts = handleReorder(departments[deptIndex].tm_subdepartments, subdeptIndex, direction);
    setDepartments(prev => updateNestedState(prev, [deptIndex, 'tm_subdepartments'], newSubdepts));
  };

  // Enhanced save order function
  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      // Update departments order
      const deptUpdates = departments.map((dept, index) => ({
        id: dept.id,
        order: index + 1
      }));

      // Update subdepartments order
      const subdeptUpdates = departments.flatMap(dept =>
        (dept.tm_subdepartments || []).map((subdept, index) => ({
          id: subdept.id,
          order: index + 1
        }))
      );

      // Save to database
      const { error: deptError } = await supabase
        .from('tm_departments')
        .upsert(deptUpdates, { onConflict: 'id' });

      if (deptError) throw deptError;

      const { error: subdeptError } = await supabase
        .from('tm_subdepartments')
        .upsert(subdeptUpdates, { onConflict: 'id' });

      if (subdeptError) throw subdeptError;

      toast.success("Order saved successfully!");
      setIsOrderChanged(false);
    } catch (error) {
      console.error("Failed to save order", error);
      toast.error("Could not save the new order. Please try again.");
    } finally {
      setSavingOrder(false);
    }
  };

  // Expansion handlers
  const toggleExpansion = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };
  
  const expandAll = () => {
    const allExpanded = {};
    departments.forEach(dept => {
      allExpanded[dept.id] = true;
      (dept.tm_subdepartments || []).forEach(subdept => {
        allExpanded[subdept.id] = true;
        (subdept.classes || []).forEach(cls => {
          allExpanded[cls.id] = true;
        });
      });
    });
    setExpanded(allExpanded);
  };

  const collapseAll = () => {
    setExpanded({});
  };

  const areAllExpanded = departments.length > 0 && departments.every(dept => expanded[dept.id]);

  // CRUD handlers (placeholder implementations)
  const updateFormState = (path: string[], value: any) => { 
    setDepartmentForm(prevState => updateNestedState(prevState, path, value)) 
  }
  
  const handleAddDepartment = () => { 
    setIsAddDepartmentOpen(true) 
  }
  
  const handleAddSubdepartment = (deptId?: string, deptName?: string) => { 
    setCurrentDepartmentId(deptId || null)
    if (deptId) {
      // Set up form for adding subdepartment to existing department
      setDepartmentForm({
        name: deptName || '',
        description: '',
        subdepartments: [{
          name: '',
          description: '',
          classes: [],
          taskManagerId: '',
          taskAssistantIds: [],
          stages: {}
        }]
      })
    }
    setIsAddDepartmentOpen(true)
  }
 
  const handleSaveDepartment = async () => {
    setSaving(true)
    try {
      // Implementation for saving department
      await createDepartmentDb(departmentForm)
      toast.success('Department saved successfully!')
      setIsAddDepartmentOpen(false)
      await fetchData() // Refresh data
    } catch (error) {
      console.error('Error saving department:', error)
      toast.error('Failed to save department')
    } finally {
      setSaving(false)
    }
  }
 
  const handleEditSubdepartment = (deptId: string, subdept: Subdepartment) => {
    // Implementation for editing subdepartment
    setCurrentDepartmentId(deptId)
    setDepartmentForm({
      name: subdept.name,
      description: subdept.description || '',
      subdepartments: [{
        id: subdept.id,
        name: subdept.name,
        description: subdept.description || '',
        classes: subdept.classes || [],
        taskManagerId: subdept.taskManagerId || '',
        taskAssistantIds: subdept.taskAssistants?.map(ta => ta.userId) || [],
        stages: {}
      }]
    })
    setIsAddDepartmentOpen(true)
  }
 
  const handleDeleteSubdepartment = async (departmentId: string, subdepartmentId: string) => {
    try {
      const { error } = await supabase
        .from('tm_subdepartments')
        .delete()
        .eq('id', subdepartmentId)
 
      if (error) throw error
 
      toast.success('Subdepartment deleted successfully!')
      await fetchData() // Refresh data
    } catch (error) {
      console.error('Error deleting subdepartment:', error)
      toast.error('Failed to delete subdepartment')
    }
  }
 
  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId)
    return user ? user.name : 'Unknown User'
  }
 
  // Additional CRUD handlers
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
 
  useEffect(() => {
    if (!isAddDepartmentOpen) {
      setDepartmentForm({ name: '', description: '', subdepartments: [] })
      setCurrentDepartmentId(null)
    }
  }, [isAddDepartmentOpen])
 
  if (loading) {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          <span className="ml-2 text-gray-700">Loading departments...</span>
        </div>
      </div>
    )
  }
 
  // Enhanced Order Buttons with blue theme
  const OrderButtons = ({ onReorder, index, listLength }) => (
    <div className="flex flex-col -space-y-1">
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-5 w-5 p-0 text-gray-600 hover:text-gray-800 hover:bg-blue-50" 
        disabled={index === 0} 
        onClick={() => onReorder(index, 'up')}
      >
        <ArrowUp className="h-3 w-3" />
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-5 w-5 p-0 text-gray-600 hover:text-gray-800 hover:bg-blue-50" 
        disabled={index === listLength - 1} 
        onClick={() => onReorder(index, 'down')}
      >
        <ArrowDown className="h-3 w-3" />
      </Button>
    </div>
  );
 
  return (
    <div className="flex-1 space-y-6 p-6 bg-gradient-to-br from-blue-50 to-white min-h-screen">
      {/* Enhanced Header with blue theme */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Departments & Workflows</h2>
          <p className="text-gray-700 mt-2">Manage departments, subdepartments, and their class structures with hierarchical organization.</p>
        </div>
        <div className="flex items-center space-x-2">
          {isOrderChanged && (
            <Button 
              onClick={handleSaveOrder} 
              disabled={savingOrder} 
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-200"
            >
              {savingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save Order Changes
            </Button>
          )}
          {departments.length > 0 && (
            <Button 
              variant="outline" 
              onClick={areAllExpanded ? collapseAll : expandAll}
              className="border-gray-300 text-gray-700 hover:bg-blue-50"
            >
              <ChevronsUpDown className="mr-2 h-4 w-4" />
              {areAllExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
          )}
          <Button 
            onClick={handleAddDepartment} 
            size="lg" 
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-200"
          >
            <FolderPlus className="mr-2 h-5 w-5" />
            Add Department
          </Button>
        </div>
      </div>
 
      {/* Enhanced Main Content with blue theme */}
      <Card className="shadow-xl border-gray-200 bg-white">
        <CardContent className="p-0">
          {departments.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 mx-auto mb-4">
                <FolderPlus className="h-10 w-10 text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No departments found</h3>
              <p className="text-gray-600 mb-6">Create your first department to get started with hierarchical organization.</p>
              <Button 
                onClick={handleAddDepartment} 
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Department
              </Button>
            </div>
          ) : (
            <Table className="border-collapse">
              <TableHeader className="bg-gradient-to-r from-blue-100 to-blue-200">
                <TableRow className="border-gray-300">
                  <TableHead className="w-[50px] text-gray-900 font-semibold">
                    <Hash className="h-4 w-4" />
                  </TableHead>
                  <TableHead className="w-[450px] text-gray-900 font-semibold">Department / Subdepartment</TableHead>
                  <TableHead className="text-gray-900 font-semibold">Task Manager</TableHead>
                  <TableHead className="text-gray-900 font-semibold">Task Assistants</TableHead>
                  <TableHead className="text-right w-[250px] text-gray-900 font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-blue-200">
                {departments.map((dept, deptIndex) => (
                  <React.Fragment key={dept.id}>
                    {/* Enhanced Department Row with hierarchical indexing */}
                    <TableRow className="bg-gradient-to-r from-blue-100 to-blue-50 hover:from-blue-200 hover:to-blue-100 border-b-2 border-gray-300 transition-all duration-200">
                      <TableCell className="font-mono text-gray-800 font-bold">
                        {generateHierarchicalIndex(deptIndex)}
                      </TableCell>
                      <TableCell className="font-bold text-lg text-gray-900">
                        <div className="flex items-center space-x-2">
                          <OrderButtons onReorder={handleDepartmentReorder} index={deptIndex} listLength={departments.length} />
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => toggleExpansion(dept.id)}
                            className="text-gray-700 hover:text-gray-900 hover:bg-blue-100"
                          >
                            <Layers className="h-5 w-5 mr-3" />
                            {expanded[dept.id] ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </Button>
                          <div>
                            {dept.name}
                            {dept.description && <p className="text-sm font-normal text-gray-600 mt-1">{dept.description}</p>}
                          </div>
                          <Badge variant="secondary" className="ml-4 bg-blue-300 text-gray-900 border-gray-400">
                            {(dept.tm_subdepartments || []).length} subdepartments
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="outline" 
                          onClick={() => handleAddSubdepartment(dept.id, dept.name)} 
                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-gray-600"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Subdepartment
                        </Button>
                      </TableCell>
                    </TableRow>
                    
                    {/* Enhanced Subdepartment Rows with hierarchical indexing */}
                    {expanded[dept.id] && (dept.tm_subdepartments || []).map((subdept, subdeptIndex) => (
                      <React.Fragment key={subdept.id}>
                        <TableRow className="bg-white hover:bg-blue-50 transition-all duration-200">
                          <TableCell className="font-mono text-gray-700 font-semibold">
                            {generateHierarchicalIndex(deptIndex, subdeptIndex)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2 pl-8">
                              <OrderButtons 
                                onReorder={(idx, dir) => handleSubdepartmentReorder(deptIndex, idx, dir)} 
                                index={subdeptIndex} 
                                listLength={(dept.tm_subdepartments || []).length} 
                              />
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => toggleExpansion(subdept.id)} 
                                className="flex-shrink-0 text-gray-600 hover:text-gray-800 hover:bg-blue-100"
                              >
                                {(subdept.classes?.length || 0) > 0 ? 
                                  (expanded[subdept.id] ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />) : 
                                  <Layers className="h-4 w-4 text-gray-300" />
                                }
                              </Button>
                              <div>
                                <div className="font-semibold text-gray-900">{subdept.name}</div>
                                {subdept.description && <div className="text-sm text-gray-600 mt-1">{subdept.description}</div>}
                              </div>
                              <Badge variant="outline" className="border-gray-300 text-gray-700">
                                {(subdept.classes?.length || 0)} Classes
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            {subdept.taskManagerId ? (
                              <UserDetailsPopover userId={subdept.taskManagerId} users={users} role="manager">
                                <div className="flex items-center">
                                  <UserIcon className="h-4 w-4 mr-2 text-gray-600" />
                                  {getUserName(subdept.taskManagerId)}
                                </div>
                              </UserDetailsPopover>
                            ) : (
                              <span className="text-sm text-gray-500 flex items-center">
                                <UserX className="h-4 w-4 mr-1" />
                                Unassigned
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(subdept.taskAssistants || []).length > 0 ? (
                              <div className="space-y-1">
                                {(subdept.taskAssistants || []).slice(0, 2).map((ta, i) => (
                                  <UserDetailsPopover key={i} userId={ta.userId} users={users} role="assistant">
                                    <div className="flex items-center text-sm">
                                      <UserIcon className="h-3 w-3 mr-2 text-gray-600" />
                                      {getUserName(ta.userId)}
                                    </div>
                                  </UserDetailsPopover>
                                ))}
                                {(subdept.taskAssistants || []).length > 2 && (
                                  <div className="text-xs text-gray-500">
                                    +{(subdept.taskAssistants || []).length - 2} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500 flex items-center">
                                <UserX className="h-4 w-4 mr-1" />
                                Unassigned
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex space-x-2 justify-end">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleEditSubdepartment(dept.id, subdept)} 
                                title="Edit subdepartment" 
                                className="hover:bg-blue-50 border-gray-300 text-gray-700"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleDeleteSubdepartment(dept.id, subdept.id)} 
                                title="Delete subdepartment" 
                                className="hover:bg-red-50 text-red-500 hover:text-red-700 border-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        
                        {/* Enhanced Classes and Sub-classes Section with hierarchical indexing */}
                        {expanded[subdept.id] && (subdept.classes?.length || 0) > 0 && (
                          <TableRow className="bg-gradient-to-r from-blue-50 to-blue-25">
                            <TableCell colSpan={5} className="p-0">
                              <div className="p-4 pl-20 space-y-3">
                                {(subdept.classes || []).map((cls, classIndex) => (
                                  <Card key={cls.id} className="bg-white border-gray-200 hover:shadow-blue-100 transition-all duration-200">
                                    <CardHeader className="flex flex-row items-center justify-between p-3">
                                      <div className="flex items-center space-x-2">
                                        <Badge variant="outline" className="text-xs font-mono bg-blue-100 text-gray-800 border-gray-300">
                                          {generateHierarchicalIndex(deptIndex, subdeptIndex, classIndex)}
                                        </Badge>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          onClick={() => toggleExpansion(cls.id)}
                                          className="text-gray-600 hover:text-gray-800 hover:bg-blue-100"
                                        >
                                          {(cls.subClasses?.length || 0) > 0 ? 
                                            (expanded[cls.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : 
                                            <Layers className="h-4 w-4 text-gray-400" />
                                          }
                                        </Button>
                                        <p className="font-semibold text-gray-900">{cls.name}</p>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <Badge variant="outline" className="border-gray-300 text-gray-700">
                                          {(cls.requirements?.length || 0)} reqs
                                        </Badge>
                                        <Badge variant="secondary" className="bg-blue-200 text-gray-800">
                                          {(cls.subClasses?.length || 0)} sub-classes
                                        </Badge>
                                      </div>
                                    </CardHeader>
                                    {expanded[cls.id] && (cls.subClasses?.length || 0) > 0 && (
                                      <CardContent className="p-3 pl-12 space-y-2">
                                        {(cls.subClasses || []).map((subCls, subClassIndex) => (
                                          <div 
                                            key={subCls.id} 
                                            className="flex items-center justify-between p-2 rounded-md bg-blue-50 border border-gray-200 hover:bg-blue-100 transition-all duration-200"
                                          >
                                            <div className="flex items-center space-x-2">
                                              <Badge variant="outline" className="text-xs font-mono bg-blue-100 text-gray-800 border-gray-300">
                                                {generateHierarchicalIndex(deptIndex, subdeptIndex, classIndex, subClassIndex)}
                                              </Badge>
                                              <p className="text-sm font-medium text-gray-900">{subCls.name}</p>
                                            </div>
                                            <Badge variant="outline" className="text-xs border-gray-300 text-gray-700">
                                              {(subCls.requirements?.length || 0)} reqs
                                            </Badge>
                                          </div>
                                        ))}
                                      </CardContent>
                                    )}
                                  </Card>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
 
      {/* Enhanced Add Department/Subdepartment Dialog with blue theme */}
      <Dialog open={isAddDepartmentOpen} onOpenChange={setIsAddDepartmentOpen}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto border-gray-200">
          <DialogHeader className="pb-4 border-b border-gray-200">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {currentDepartmentId ? 'Edit Subdepartment' : 'Add New Department'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-8 py-6">
            {/* Enhanced Department Basic Info with blue theme */}
            <Card className="border-gray-200">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
                <CardTitle className="flex items-center text-gray-900">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 mr-3">
                    <Layers className="h-4 w-4 text-gray-700" />
                  </div>
                  Department Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="deptName" className="text-sm font-semibold text-gray-800">Department Name *</Label>
                    <Input
                      id="deptName"
                      placeholder="e.g., Immigration Services"
                      value={departmentForm.name}
                      onChange={(e) => updateFormState(['name'], e.target.value)}
                      className="text-lg font-medium border-gray-200 focus:border-gray-400"
                      disabled={!!currentDepartmentId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deptDescription" className="text-sm font-semibold text-gray-800">Description</Label>
                    <Textarea
                      id="deptDescription"
                      placeholder="Brief description of the department's purpose and scope"
                      value={departmentForm.description}
                      onChange={(e) => updateFormState(['description'], e.target.value)}
                      className="min-h-[100px] border-gray-200 focus:border-gray-400"
                      disabled={!!currentDepartmentId}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
 
            {/* Enhanced Subdepartments Section with blue theme */}
            <Card className="border-gray-200">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center text-gray-900">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 mr-3">
                      <Users className="h-4 w-4 text-gray-700" />
                    </div>
                    Subdepartments ({departmentForm.subdepartments.length})
                  </CardTitle>
                  {!currentDepartmentId && (
                    <Button 
                      onClick={() => handleAddSubdepartment()} 
                      variant="outline" 
                      size="sm" 
                      className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-gray-600"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Subdepartment
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                    <Card key={subdeptIndex} className="border-l-4 border-l-blue-600 bg-gradient-to-r from-blue-50 to-blue-25">
                      <CardHeader className="bg-blue-100">
                        <div className="flex items-start justify-between">
                          <CardTitle className="flex items-center text-lg text-gray-900">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 mr-3">
                              <span className="text-sm font-bold text-gray-700">{subdeptIndex + 1}</span>
                            </div>
                            Subdepartment {subdeptIndex + 1}
                          </CardTitle>
                          {!currentDepartmentId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveSubdepartment(subdeptIndex)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
 
                      <CardContent className="space-y-6">
                        {/* Enhanced Basic Info with blue theme */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-800">Subdepartment Name *</Label>
                            <Input
                              placeholder="e.g., Visa Processing Unit"
                              value={subdept.name}
                              onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)}
                              className="font-medium border-gray-200 focus:border-gray-400"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-800">Description</Label>
                            <Textarea
                              placeholder="Brief description of this subdepartment's responsibilities"
                              value={subdept.description}
                              onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)}
                              className="min-h-[80px] border-gray-200 focus:border-gray-400"
                            />
                          </div>
                        </div>
 
                        {/* Enhanced Staff Assignment with blue theme */}
                        <Card className="bg-white border-gray-200">
                          <CardHeader className="pb-3 bg-blue-50">
                            <CardTitle className="text-base flex items-center text-gray-900">
                              <UserCheck className="h-5 w-5 mr-2 text-gray-600" />
                              Team Assignments
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Enhanced Task Manager selection */}
                              <div className="space-y-2">
                                <Label className="text-sm font-semibold text-gray-800">Task Manager</Label>
                                <Select
                                  value={subdept.taskManagerId || 'none'}
                                  onValueChange={(value) => handleSubdepartmentChange(subdeptIndex, 'taskManagerId', value === 'none' ? '' : value)}
                                >
                                  <SelectTrigger className="border-gray-200 focus:border-gray-400">
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
                                              <UserIcon className="h-2 w-2 text-gray-600" />
                                            </div>
                                            <span>{user.name}</span>
                                            <Badge variant="outline" className="text-xs border-gray-300 text-gray-700">{user.role}</Badge>
                                          </div>
                                        </SelectItem>
                                      ))
                                    }
                                  </SelectContent>
                                </Select>
                              </div>
 
                              {/* Enhanced Task Assistants */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm font-semibold text-gray-800">Task Assistants ({subdept.taskAssistantIds.length})</Label>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                   onClick={() => handleAddTaskAssistant(subdeptIndex)}
                                   className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-gray-600"
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
                                       <SelectTrigger className="flex-1 border-gray-200 focus:border-gray-400">
                                         <SelectValue placeholder="Select task assistant" />
                                       </SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value="none">None</SelectItem>
                                         {users
                                           .filter(u => ['admin', 'user'].includes(u.role))
                                           .map(user => (
                                             <SelectItem key={user.id} value={user.id}>
                                               <div className="flex items-center space-x-2">
                                                 <div className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center">
                                                   <UserIcon className="h-2 w-2 text-gray-600" />
                                                 </div>
                                                 <span>{user.name}</span>
                                                 <Badge variant="outline" className="text-xs border-gray-300 text-gray-700">{user.role}</Badge>
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
                                   <div className="text-center py-4 text-gray-600 border-2 border-dashed border-gray-300 rounded-lg bg-blue-50">
                                     No task assistants assigned
                                   </div>
                                 )}
                               </div>
                             </div>
                           </div>
                         </CardContent>
                       </Card>

                       {/* Enhanced Classes Section with blue theme */}
                       <Card className="bg-white border-gray-200">
                         <CardHeader className="bg-blue-50">
                           <div className="flex items-center justify-between">
                             <CardTitle className="text-base flex items-center text-gray-900">
                               <Layers className="h-5 w-5 mr-2 text-gray-600" />
                               Classes & Requirements ({subdept.classes.length})
                             </CardTitle>
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => handleAddClass(subdeptIndex)}
                               className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-gray-600"
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
                                 index={`${subdeptIndex + 1}.${classIndex + 1}`}
                               />
                             ))}

                             {subdept.classes.length === 0 && (
                               <div className="text-center py-12 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-dashed border-gray-300 rounded-lg">
                                 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-200 mx-auto mb-4">
                                   <Layers className="h-8 w-8 text-gray-600" />
                                 </div>
                                 <h3 className="text-lg font-semibold text-gray-900 mb-2">No classes added yet</h3>
                                 <p className="text-gray-600 mb-4">Classes help organize requirements and sub-categories for this subdepartment with hierarchical structure.</p>
                               </div>
                             )}
                           </div>
                         </CardContent>
                       </Card>
                     </CardContent>
                   </Card>
                 ))}

                 {departmentForm.subdepartments.length === 0 && (
                   <div className="text-center py-12 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-dashed border-gray-300 rounded-lg">
                     <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-200 mx-auto mb-4">
                       <Users className="h-10 w-10 text-gray-600" />
                     </div>
                     <h3 className="text-lg font-semibold text-gray-900 mb-2">No subdepartments added yet</h3>
                     <p className="text-gray-600 mb-6">Subdepartments help organize your department into manageable units with specific responsibilities and hierarchical ordering.</p>
                   </div>
                 )}
               </div>
             </CardContent>
           </Card>

           {/* Enhanced Dialog Actions with blue theme */}
           <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
             <Button
               variant="outline"
               onClick={() => {
                 setIsAddDepartmentOpen(false)
                 setCurrentDepartmentId(null)
               }}
               disabled={saving}
               size="lg"
               className="border-gray-300 text-gray-700 hover:bg-blue-50"
             >
               Cancel
             </Button>
             <Button
               onClick={handleSaveDepartment}
               disabled={saving || !departmentForm.name.trim()}
               size="lg"
               className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-200"
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
   </div>
 )
}