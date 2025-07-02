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
  UserIcon, Minus, ChevronsUpDown, Hash, Search
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
        <span className="cursor-pointer hover:underline text-blue-600 hover:text-blue-800 transition-colors duration-200">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 border-gray-200">
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user.name || 'No name'}</p>
              <p className="text-sm text-gray-600">{user.email}</p>
            </div>
          </div>
          <div className="text-sm">
            <p className="text-gray-700 font-medium">Role</p>
            <Badge variant="outline" className="mt-1 border-blue-300 text-blue-700">
              Task {role === 'manager' ? 'Manager' : 'Assistant'}
            </Badge>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function Departments() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [currentDepartmentId, setCurrentDepartmentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  
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

  // CRUD handlers
  const updateFormState = (path: string[], value: any) => { 
    setDepartmentForm(prevState => updateNestedState(prevState, path, value)) 
  }
  
  const handleAddDepartment = () => { 
    setIsAddDepartmentOpen(true) 
  }
  
  const handleAddSubdepartment = (deptId?: string, deptName?: string) => { 
    setCurrentDepartmentId(deptId || null)
    if (deptId) {
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
      await createDepartmentDb(departmentForm)
      toast.success('Department saved successfully!')
      setIsAddDepartmentOpen(false)
      await fetchData()
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
      await fetchData()
    } catch (error) {
      console.error('Error deleting subdepartment:', error)
      toast.error('Failed to delete subdepartment')
    }
  }

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId)
    return user ? user.name : 'Unknown User'
  }

  // Filter departments based on search
  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dept.tm_subdepartments || []).some(subdept =>
      subdept.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  if (loading) {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-700">Loading departments...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Departments & Workflows</h2>
          <p className="text-gray-600 mt-2">Manage departments, subdepartments, and their hierarchical structure.</p>
        </div>
        <div className="flex items-center gap-2">
          {isOrderChanged && (
            <Button 
              onClick={handleSaveOrder} 
              disabled={savingOrder} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {savingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save Order Changes
            </Button>
          )}
          {departments.length > 0 && (
            <Button 
              variant="outline" 
              onClick={areAllExpanded ? collapseAll : expandAll}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ChevronsUpDown className="mr-2 h-4 w-4" />
              {areAllExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
          )}
          <Button 
            onClick={handleAddDepartment} 
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Input 
            placeholder="Search departments..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="pl-10 border-gray-300" 
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Main Content */}
      <Card className="shadow-sm border-gray-200 bg-white">
        <CardContent className="p-0">
          {filteredDepartments.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
                <FolderPlus className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No departments found</h3>
              <p className="text-gray-600 mb-6">Create your first department to get started.</p>
              <Button 
                onClick={handleAddDepartment} 
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create First Department
              </Button>
            </div>
          ) : (
            <div className="h-[calc(90vh-22rem)] overflow-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-blue-600/95 backdrop-blur-sm z-10">
                  <TableRow className="border-b-gray-300">
                    <TableHead className="w-16 text-center text-white font-semibold">
                      <Hash className="h-4 w-4 mx-auto" />
                    </TableHead>
                    <TableHead className="w-96 border-l border-gray-200 text-white font-semibold">
                      Department / Subdepartment
                    </TableHead>
                    <TableHead className="w-48 border-l border-gray-200 text-white font-semibold">
                      Task Manager
                    </TableHead>
                    <TableHead className="w-48 border-l border-gray-200 text-white font-semibold">
                      Task Assistants
                    </TableHead>
                    <TableHead className="w-32 text-center border-l border-gray-200 text-white font-semibold">
                      Order
                    </TableHead>
                    <TableHead className="w-32 text-center border-l border-gray-200 text-white font-semibold">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDepartments.map((dept, deptIndex) => (
                    <React.Fragment key={dept.id}>
                      {/* Department Row */}
                      <TableRow className="bg-blue-50 hover:bg-blue-100/70 border-b transition-colors cursor-pointer" onClick={() => toggleExpansion(dept.id)}>
                        <TableCell className="font-mono text-center text-blue-800 font-bold">
                          {generateHierarchicalIndex(deptIndex)}
                        </TableCell>
                        <TableCell className="font-bold text-lg text-gray-900 border-l">
                          <div className="flex items-center space-x-3">
                            <Button variant="ghost" size="sm" className="p-1">
                              <Layers className="h-5 w-5 mr-2 text-blue-600" />
                              {expanded[dept.id] ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </Button>
                            <div>
                              {dept.name}
                              {dept.description && <p className="text-sm font-normal text-gray-600 mt-1">{dept.description}</p>}
                            </div>
                            <Badge variant="secondary" className="bg-blue-200 text-blue-800">
                              {(dept.tm_subdepartments || []).length} subdepartments
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="border-l"></TableCell>
                        <TableCell className="border-l"></TableCell>
                        <TableCell className="text-center border-l">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-500 hover:text-blue-600"
                              onClick={(e) => { e.stopPropagation(); handleDepartmentReorder(deptIndex, 'up'); }}
                              disabled={deptIndex === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-500 hover:text-blue-600"
                              onClick={(e) => { e.stopPropagation(); handleDepartmentReorder(deptIndex, 'down'); }}
                              disabled={deptIndex === filteredDepartments.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-center border-l">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleAddSubdepartment(dept.id, dept.name); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                      
                      {/* Subdepartment Rows */}
                      {expanded[dept.id] && (dept.tm_subdepartments || []).map((subdept, subdeptIndex) => (
                        <TableRow key={subdept.id} className="bg-white hover:bg-gray-50 text-sm">
                          <TableCell className="font-mono text-center text-gray-700 font-semibold">
                            {generateHierarchicalIndex(deptIndex, subdeptIndex)}
                          </TableCell>
                          <TableCell className="border-l">
                            <div className="flex items-center space-x-2 pl-8">
                              <Button variant="ghost" size="sm" className="p-1">
                                <Layers className="h-4 w-4 text-gray-400" />
                              </Button>
                              <div>
                                <div className="font-semibold text-gray-900">{subdept.name}</div>
                                {subdept.description && <div className="text-sm text-gray-600 mt-1">{subdept.description}</div>}
                              </div>
                              <Badge variant="outline" className="border-gray-300 text-gray-700 text-xs">
                                {(subdept.classes?.length || 0)} Classes
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="border-l">
                            {subdept.taskManagerId ? (
                              <UserDetailsPopover userId={subdept.taskManagerId} users={users} role="manager">
                                <div className="flex items-center text-sm">
                                  <UserIcon className="h-4 w-4 mr-2 text-blue-600" />
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
                          <TableCell className="border-l">
                            {(subdept.taskAssistants || []).length > 0 ? (
                              <div className="space-y-1">
                                {(subdept.taskAssistants || []).slice(0, 2).map((ta, i) => (
                                  <UserDetailsPopover key={i} userId={ta.userId} users={users} role="assistant">
                                    <div className="flex items-center text-sm">
                                      <UserIcon className="h-3 w-3 mr-2 text-blue-600" />
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
                          <TableCell className="text-center border-l">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-gray-500 hover:text-blue-600"
                                onClick={() => handleSubdepartmentReorder(deptIndex, subdeptIndex, 'up')}
                                disabled={subdeptIndex === 0}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-gray-500 hover:text-blue-600"
                                onClick={() => handleSubdepartmentReorder(deptIndex, subdeptIndex, 'down')}
                                disabled={subdeptIndex === (dept.tm_subdepartments || []).length - 1}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center border-l">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-gray-500 hover:text-blue-600"
                                onClick={() => handleEditSubdepartment(dept.id, subdept)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-gray-500 hover:text-red-600"
                                onClick={() => handleDeleteSubdepartment(dept.id, subdept.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog remains the same but with simplified styling */}
      <Dialog open={isAddDepartmentOpen} onOpenChange={setIsAddDepartmentOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              {currentDepartmentId ? 'Edit Subdepartment' : 'Add New Department'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-gray-900">
                  <Layers className="h-5 w-5 mr-2 text-blue-600" />
                  Department Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Department Name *</Label>
                    <Input
                      placeholder="e.g., Immigration Services"
                      value={departmentForm.name}
                      onChange={(e) => updateFormState(['name'], e.target.value)}
                      className="border-gray-300"
                      disabled={!!currentDepartmentId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Description</Label>
                    <Textarea
                      placeholder="Brief description"
                      value={departmentForm.description}
                      onChange={(e) => updateFormState(['description'], e.target.value)}
                      className="border-gray-300"
                      disabled={!!currentDepartmentId}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setIsAddDepartmentOpen(false)}
                disabled={saving}
                className="border-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDepartment}
                disabled={saving || !departmentForm.name.trim()}
                className="bg-blue-600 hover:bg-blue-700"
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