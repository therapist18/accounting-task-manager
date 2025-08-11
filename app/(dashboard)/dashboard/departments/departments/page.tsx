// @ts-nocheck
"use client"
import React, { useState, useEffect } from "react"
import {
  fetchUsers,
  fetchOfficers,
  fetchDepartments,
  createDepartment as createDepartmentDb,
  saveOrderAndDefaultDisplay,
  saveClassRequirements,
  updateClassRequirements,
  saveSubdepartmentRequirements,
  assignOfficerToDepartment,
  assignManagerToSubdepartment,
  assignAssistantsToSubdepartment,
  getCurrentOfficer,
  getCurrentManager,
  getCurrentAssistants,
  Department,
  Subdepartment,
  Class,
  SubClass,
  Requirement,
  SubdepartmentForm,
  ClassForm,
  SubClassForm,
  RequirementForm,
  DepartmentForm,
  User,
  OfficerHistory,
  ManagerHistory,
  AssistantHistory
} from "./database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Building, FolderPlus, Edit, Trash2, ChevronDown, ChevronUp, Plus, Minus, Search, BarChart3, Workflow, Layers, Target, User as UserIcon, Shield, Users, History } from "lucide-react"
import { DepartmentStats } from "./components/DepartmentStats"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"
import DepartmentDialog from "./components/DepartmentDialog"
import AssignmentStatsDashboard from "./components/AssignmentStatsDashboard"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

// Helper function for deep cloning
const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj))

// Helper function for updating nested state
export const updateNestedState = (state: any, path: (string | number)[], value: any) => {
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

// Officer History Popover Component
function OfficerHistoryPopover({ officers_history, users, children }: {
  officers_history: OfficerHistory[],
  users: User[],
  children: React.ReactNode
}) {
  const sortedHistory = [...officers_history].sort((a, b) => 
    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  )

  const getAssignmentDuration = (history: OfficerHistory): string => {
    const startDate = new Date(history.start_date)
    const endDate = history.end_date ? new Date(history.end_date) : new Date()
    
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 30) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return `${months} month${months !== 1 ? 's' : ''}`
    } else {
      const years = Math.floor(diffDays / 365)
      const remainingMonths = Math.floor((diffDays % 365) / 30)
      if (remainingMonths === 0) {
        return `${years} year${years !== 1 ? 's' : ''}`
      }
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Officer History ({sortedHistory.length} assignment{sortedHistory.length !== 1 ? 's' : ''})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedHistory.map((officer, index) => {
              const user = users.find(u => u.id === officer.id)
              const isCurrent = !officer.end_date
              const duration = getAssignmentDuration(officer)
              
              return (
                <div key={index} className={`p-3 rounded border ${isCurrent ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{user?.name || 'Unknown Officer'}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                    {isCurrent && (
                      <Badge variant="default" className="bg-green-500">Current</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Started:</span>
                      <span className="font-medium">{new Date(officer.start_date).toLocaleDateString()}</span>
                    </div>
                    {officer.end_date && (
                      <div className="flex justify-between">
                        <span>Ended:</span>
                        <span className="font-medium">{new Date(officer.end_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span className="font-medium text-blue-600">{duration}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {sortedHistory.length === 0 && (
              <p className="text-gray-500 text-sm">No officer history available</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Manager History Popover Component
function ManagerHistoryPopover({ manager_history, users, children }: {
  manager_history: ManagerHistory[],
  users: User[],
  children: React.ReactNode
}) {
  const sortedHistory = [...manager_history].sort((a, b) => 
    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  )

  const getAssignmentDuration = (history: ManagerHistory): string => {
    const startDate = new Date(history.start_date)
    const endDate = history.end_date ? new Date(history.end_date) : new Date()
    
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 30) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return `${months} month${months !== 1 ? 's' : ''}`
    } else {
      const years = Math.floor(diffDays / 365)
      const remainingMonths = Math.floor((diffDays % 365) / 30)
      if (remainingMonths === 0) {
        return `${years} year${years !== 1 ? 's' : ''}`
      }
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            Manager History ({sortedHistory.length} assignment{sortedHistory.length !== 1 ? 's' : ''})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedHistory.map((manager, index) => {
              const user = users.find(u => u.id === manager.id)
              const isCurrent = !manager.end_date
              const duration = getAssignmentDuration(manager)
              
              return (
                <div key={index} className={`p-3 rounded border ${isCurrent ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{user?.name || 'Unknown Manager'}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                    {isCurrent && (
                      <Badge variant="default" className="bg-green-500">Current</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Started:</span>
                      <span className="font-medium">{new Date(manager.start_date).toLocaleDateString()}</span>
                    </div>
                    {manager.end_date && (
                      <div className="flex justify-between">
                        <span>Ended:</span>
                        <span className="font-medium">{new Date(manager.end_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span className="font-medium text-blue-600">{duration}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {sortedHistory.length === 0 && (
              <p className="text-gray-500 text-sm">No manager history available</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Assistant History Popover Component
function AssistantHistoryPopover({ assistant_history, users, children }: {
  assistant_history: AssistantHistory[],
  users: User[],
  children: React.ReactNode
}) {
  const sortedHistory = [...assistant_history].sort((a, b) => 
    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  )

  const getAssignmentDuration = (history: AssistantHistory): string => {
    const startDate = new Date(history.start_date)
    const endDate = history.end_date ? new Date(history.end_date) : new Date()
    
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 30) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return `${months} month${months !== 1 ? 's' : ''}`
    } else {
      const years = Math.floor(diffDays / 365)
      const remainingMonths = Math.floor((diffDays % 365) / 30)
      if (remainingMonths === 0) {
        return `${years} year${years !== 1 ? 's' : ''}`
      }
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`
    }
  }

  // Group assistants by current/historical status
  const currentAssistants = sortedHistory.filter(a => !a.end_date)
  const historicalAssistants = sortedHistory.filter(a => a.end_date)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600">
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Assistant History ({sortedHistory.length} assignment{sortedHistory.length !== 1 ? 's' : ''})
          </h4>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {currentAssistants.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-green-700 mb-2">Current Assistants</h5>
                <div className="space-y-2">
                  {currentAssistants.map((assistant, index) => {
                    const user = users.find(u => u.id === assistant.id)
                    const duration = getAssignmentDuration(assistant)
                    
                    return (
                      <div key={index} className="p-3 rounded border bg-green-50 border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium text-gray-900">{user?.name || 'Unknown Assistant'}</p>
                            <p className="text-xs text-gray-500">{user?.email}</p>
                          </div>
                          <Badge variant="default" className="bg-green-500">Current</Badge>
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Started:</span>
                            <span className="font-medium">{new Date(assistant.start_date).toLocaleDateString()}</span>
                          </div>
                          {assistant.manager_id && (
                            <div className="flex justify-between">
                              <span>Manager:</span>
                              <span className="font-medium">
                                {users.find(u => u.id === assistant.manager_id)?.name || 'Unknown Manager'}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span className="font-medium text-blue-600">{duration}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {historicalAssistants.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Previous Assistants</h5>
                <div className="space-y-2">
                  {historicalAssistants.map((assistant, index) => {
                    const user = users.find(u => u.id === assistant.id)
                    const duration = getAssignmentDuration(assistant)
                    
                    return (
                      <div key={index} className="p-3 rounded border bg-gray-50 border-gray-200">
                        <div className="mb-2">
                          <p className="font-medium text-gray-900">{user?.name || 'Unknown Assistant'}</p>
                          <p className="text-xs text-gray-500">{user?.email}</p>
                        </div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Started:</span>
                            <span className="font-medium">{new Date(assistant.start_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Ended:</span>
                            <span className="font-medium">{new Date(assistant.end_date!).toLocaleDateString()}</span>
                          </div>
                          {assistant.manager_id && (
                            <div className="flex justify-between">
                              <span>Manager:</span>
                              <span className="font-medium">
                                {users.find(u => u.id === assistant.manager_id)?.name || 'Unknown Manager'}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span className="font-medium text-blue-600">{duration}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {sortedHistory.length === 0 && (
              <p className="text-gray-500 text-sm">No assistant history available</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// User Details Popover Component
function UserDetailsPopover({ userId, users, role, children }: {
  userId: string,
  users: User[],
  role: 'manager' | 'assistant' | 'officer',
  children: React.ReactNode
}) {
  const user = users.find(u => u.id === userId)

  if (!user) return <span className="text-gray-500">{children}</span>

  const roleIcons = {
    manager: <UserIcon className="h-6 w-6" />,
    assistant: <Users className="h-6 w-6" />,
    officer: <Shield className="h-6 w-6" />
  }

  const roleColors = {
    manager: 'bg-blue-100 text-blue-600',
    assistant: 'bg-green-100 text-green-600',
    officer: 'bg-purple-100 text-purple-600'
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="cursor-pointer hover:underline text-blue-600 font-medium">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex items-center space-x-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${roleColors[role]}`}>
            {roleIcons[role]}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user.name || 'No name'}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
            <Badge variant="outline" className="mt-1 capitalize">{role}</Badge>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Main Component
export default function Departments() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingSubdepartmentId, setEditingSubdepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [officers, setOfficers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  const [expandedClasses, setExpandedClasses] = useState<{ [key: string]: boolean }>({});
  const [expandedSubClasses, setExpandedSubClasses] = useState<{ [key: string]: boolean }>({});
  const [isOrderChanged, setIsOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>({
    name: '',
    description: '',
    default_display: true,
    subdepartments: [],
    officerId: '' // Make sure this is here
  })
  
  const toggleAllDepartments = (expand: boolean) => {
    const updates = {};
    filteredDepartments.forEach((dept) => {
      updates[dept.id] = expand;
      (dept.tm_subdepartments || []).forEach((subdept) => {
        const subdeptKey = `subdept-${subdept.id}`;
        updates[subdeptKey] = expand;
        (subdept.classes || []).forEach((cls, clsIndex) => {
          const classId = `class-${subdept.id}-${cls.id || clsIndex}`;
          setExpandedClasses(prev => ({ ...prev, [classId]: expand }));
          (cls.subClasses || []).forEach((subClass, subClassIndex) => {
            const subClassId = `subclass-${subClass.id || subClassIndex}`;
            setExpandedSubClasses(prev => ({ ...prev, [subClassId]: expand }));
          });
        });
      });
    });
    setExpanded(updates);
  };

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

  useEffect(() => {
    async function loadInitialData() {
      await fetchData();
      try {
        const [usersData, officersData] = await Promise.all([
          fetchUsers(),
          fetchOfficers()
        ]);
        setUsers(usersData);
        setOfficers(officersData);
      } catch (error) {
        toast.error('Failed to load users');
      }
    }
    loadInitialData();
  }, [])

  // Reordering and state management logic
  const handleReorder = (list: any[], index: number, direction: 'up' | 'down') => {
    const newList = [...list];
    const item = newList[index];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return list;
    newList[index] = newList[swapIndex];
    newList[swapIndex] = item;
    newList.forEach((item, idx) => { item.order = idx + 1; });
    setIsOrderChanged(true);
    return newList;
  };

  const handleDepartmentReorder = (index: number, direction: 'up' | 'down') =>
    setDepartments(prev => handleReorder(prev, index, direction));

  const handleSubdepartmentReorder = (deptIndex: number, subdeptIndex: number, direction: 'up' | 'down') => {
    const newSubdepts = handleReorder(departments[deptIndex].tm_subdepartments, subdeptIndex, direction);
    setDepartments(prev => updateNestedState(prev, [deptIndex, 'tm_subdepartments'], newSubdepts));
  };

  // Enhanced save order function that also saves default display
  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      // Remove officers_history from each department before saving
      departments.forEach(dept => {
        if ('officers_history' in dept) {
          delete dept.officers_history;
        }
      });
      
      await saveOrderAndDefaultDisplay(departments);
      toast.success("Order and display settings saved successfully!");
      setIsOrderChanged(false);
    } catch (error) {
      console.error("Failed to save order and display settings", error);
      toast.error("Could not save the settings.");
    } finally {
      setSavingOrder(false);
    }
  };

  // Handle default display toggle for departments
  const handleDepartmentDefaultDisplayToggle = (deptIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

  // Handle default display toggle for subdepartments
  const handleSubdepartmentDefaultDisplayToggle = (deptIndex: number, subdeptIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].tm_subdepartments[subdeptIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

  // Handle default display toggle for classes
  const handleClassDefaultDisplayToggle = (deptIndex: number, subdeptIndex: number, classIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].tm_subdepartments[subdeptIndex].classes[classIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

  // Handle default display toggle for subclasses
  const handleSubclassDefaultDisplayToggle = (deptIndex: number, subdeptIndex: number, classIndex: number, subclassIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].tm_subdepartments[subdeptIndex].classes[classIndex].subClasses[subclassIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

  const toggleExpansion = (type: 'dept' | 'class' | 'subclass', id: string) => {
    if (type === 'dept') {
      setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    } else if (type === 'class') {
      setExpandedClasses(prev => ({ ...prev, [id]: !prev[id] }));
    } else if (type === 'subclass') {
      setExpandedSubClasses(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dept.tm_subdepartments || []).some(subdept => subdept.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Check if all departments are expanded
  const areAllExpanded = filteredDepartments.length > 0 &&
    filteredDepartments.every(dept => expanded[dept.id]) &&
    filteredDepartments.every(dept =>
      (dept.tm_subdepartments || []).every(subdept =>
        expanded[`subdept-${subdept.id}`]
      )
    );

  const updateFormState = (path: string[], value: any) => setDepartmentForm(prevState => updateNestedState(prevState, path, value));

  const handleSaveDepartment = async () => {
    setSaving(true);
    console.log('=== DEPARTMENT FORM SUBMISSION ===');
    console.log('Current Mode:', {
      editingDepartment: editingDepartmentId,
      editingSubdepartment: editingSubdepartmentId,
      isNewDepartment: !editingDepartmentId && !editingSubdepartmentId,
      hasSubdepartmentsInForm: departmentForm.subdepartments.length
    });
    console.log('Form Data:', JSON.stringify(departmentForm, null, 2));

    try {
      // Scenario 1: Creating a new department
      if (!editingDepartmentId && !editingSubdepartmentId) {
        console.log('→ Creating new department');
        await createNewDepartment();
      }
      // Scenario 2: Editing an existing department (no subdepartments in form)
      else if (editingDepartmentId && !editingSubdepartmentId && departmentForm.subdepartments.length === 0) {
        console.log('→ Updating existing department');
        await updateExistingDepartment();
      }
      // Scenario 3: Creating a new subdepartment under existing department
      else if (editingDepartmentId && !editingSubdepartmentId && departmentForm.subdepartments.length > 0) {
        console.log('→ Creating new subdepartment');
        await createNewSubdepartment();
      }
      // Scenario 4: Editing an existing subdepartment
      else if (editingSubdepartmentId) {
        console.log('→ Updating existing subdepartment');
        await updateExistingSubdepartment();
      }

      console.log('Save operation completed successfully');
      toast.success('Saved successfully!');
      setIsAddDepartmentOpen(false);
      await fetchData();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Helper functions (updated to handle officers)
  const createNewDepartment = async () => {
    console.log('Creating new department');

    // Check if department name already exists
    const { data: existingDept } = await supabase
      .from('tm_departments')
      .select('id, name')
      .ilike('name', departmentForm.name.trim())
      .limit(1);

    if (existingDept && existingDept.length > 0) {
      throw new Error('A department with this name already exists');
    }

    // Get the next order number
    const { data: maxOrder } = await supabase
      .from('tm_departments')
      .select('order')
      .order('order', { ascending: false })
      .limit(1);

    const nextOrder = (maxOrder?.[0]?.order || 0) + 1;

    // Prepare officers_history if officer is assigned
    const officers_history = departmentForm.officerId ? [{
      id: departmentForm.officerId,
      start_date: new Date().toISOString()
    }] : []

    // Create the department
    const { data: newDept, error: deptError } = await supabase
      .from('tm_departments')
      .insert({
        name: departmentForm.name.trim(),
        description: departmentForm.description,
        default_display: departmentForm.default_display,
        order: nextOrder,
        officers_history
      })
      .select()
      .single();

    if (deptError) throw deptError;

    // Create subdepartments if any
    if (departmentForm.subdepartments.length > 0) {
      await createSubdepartmentsForDepartment(newDept.id, departmentForm.subdepartments);
    }
  };

  const updateExistingDepartment = async () => {
    console.log('Updating existing department with ID:', editingDepartmentId);

    // Check if another department with this name exists (excluding current)
    const { data: existingDept } = await supabase
      .from('tm_departments')
      .select('id, name')
      .ilike('name', departmentForm.name.trim())
      .neq('id', editingDepartmentId)
      .limit(1);

    if (existingDept && existingDept.length > 0) {
      throw new Error('Another department with this name already exists');
    }

    // Get current department data to preserve officer history
    const { data: currentDept, error: fetchError } = await supabase
      .from('tm_departments')
      .select('officers_history')
      .eq('id', editingDepartmentId)
      .single();

    if (fetchError) throw fetchError;

    let officers_history = currentDept?.officers_history || [];

    // If officer assignment changed, update the history
    const currentOfficer = getCurrentOfficer(officers_history);
    if (departmentForm.officerId !== currentOfficer?.id) {
      // End current officer assignment
      officers_history = officers_history.map(officer => 
        !officer.end_date ? { ...officer, end_date: new Date().toISOString() } : officer
      );

      // Add new officer if selected
      if (departmentForm.officerId) {
        officers_history.push({
          id: departmentForm.officerId,
          start_date: new Date().toISOString()
        });
      }
    }

    // Update the department
    const { error: updateError } = await supabase
      .from('tm_departments')
      .update({
        name: departmentForm.name.trim(),
        description: departmentForm.description,
        default_display: departmentForm.default_display,
        officers_history,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingDepartmentId);

    if (updateError) throw updateError;
  };

  const updateExistingSubdepartment = async () => {
    console.log('Updating existing subdepartment with ID:', editingSubdepartmentId);
  
    if (departmentForm.subdepartments.length === 0) {
      throw new Error('No subdepartment data provided');
    }
  
    const subdept = departmentForm.subdepartments[0];
    
    console.log('Subdepartment form data:', subdept);
  
    // Validate subdepartment name
    if (!subdept.name.trim()) {
      throw new Error('Subdepartment name is required');
    }
  
    // Get current subdepartment to find its department_id
    const { data: currentSubdept } = await supabase
      .from('tm_subdepartments')
      .select('department_id')
      .eq('id', editingSubdepartmentId)
      .single();
  
    if (!currentSubdept) {
      throw new Error('Subdepartment not found');
    }
  
    console.log('Current subdepartment from DB:', currentSubdept);
  
    // Check if another subdepartment with this name exists in the same department (excluding current)
    const { data: existingSubdept } = await supabase
      .from('tm_subdepartments')
      .select('id, name')
      .ilike('name', subdept.name.trim())
      .eq('department_id', currentSubdept.department_id)
      .neq('id', editingSubdepartmentId)
      .limit(1);
  
    if (existingSubdept && existingSubdept.length > 0) {
      throw new Error('Another subdepartment with this name already exists in this department');
    }
  
    // ⭐ FIXED: Use the history arrays directly from the form
    const officer_history = subdept.officer_history || [];
    const manager_history = subdept.manager_history || [];
    const assistant_history = subdept.assistant_history || [];
  
    console.log('History data to save:', {
      officer_history,
      manager_history,
      assistant_history
    });
  
    // Update the subdepartment with the new history-based structure
    const { error: updateError } = await supabase
      .from('tm_subdepartments')
      .update({
        name: subdept.name.trim(),
        description: subdept.description,
        default_display: subdept.default_display,
        officer_history,
        manager_history,
        assistant_history,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingSubdepartmentId);
  
    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }
  
    console.log('Subdepartment updated successfully');
  
    // Handle classes and requirements updates
    if (subdept.classes && subdept.classes.length > 0) {
      await updateClassRequirements(editingSubdepartmentId, subdept.classes);
    }
  };
  
  const createNewSubdepartment = async () => {
    console.log('Creating new subdepartment under department ID:', editingDepartmentId);
  
    if (departmentForm.subdepartments.length === 0) {
      throw new Error('No subdepartment data provided');
    }
  
    const subdept = departmentForm.subdepartments[0];
  
    console.log('Creating subdepartment with data:', subdept);
  
    // Validate subdepartment name
    if (!subdept.name.trim()) {
      throw new Error('Subdepartment name is required');
    }
  
    // Check if subdepartment with this name already exists in this department
    const { data: existingSubdept } = await supabase
      .from('tm_subdepartments')
      .select('id, name')
      .ilike('name', subdept.name.trim())
      .eq('department_id', editingDepartmentId)
      .limit(1);
  
    if (existingSubdept && existingSubdept.length > 0) {
      throw new Error('A subdepartment with this name already exists in this department');
    }
  
    // Get the next order number for this department
    const { data: maxOrder } = await supabase
      .from('tm_subdepartments')
      .select('order')
      .eq('department_id', editingDepartmentId)
      .order('order', { ascending: false })
      .limit(1);
  
    const nextOrder = (maxOrder?.[0]?.order || 0) + 1;
  
    // ⭐ FIXED: Use the history arrays directly from the form
    const officer_history = subdept.officer_history || [];
    const manager_history = subdept.manager_history || [];
    const assistant_history = subdept.assistant_history || [];
  
    console.log('History data to create:', {
      officer_history,
      manager_history,
      assistant_history
    });
  
    // Create the subdepartment
    const { data: newSubdept, error: createError } = await supabase
      .from('tm_subdepartments')
      .insert({
        name: subdept.name.trim(),
        description: subdept.description,
        department_id: editingDepartmentId,
        default_display: subdept.default_display,
        order: nextOrder,
        officer_history,
        manager_history,
        assistant_history
      })
      .select()
      .single();
  
    if (createError) {
      console.error('Database create error:', createError);
      throw createError;
    }
  
    console.log('Subdepartment created successfully with ID:', newSubdept.id);
  
    // Handle classes and requirements if any
    if (subdept.classes && subdept.classes.length > 0) {
      await saveClassRequirements(newSubdept.id, subdept.classes);
    }
  };

  const createSubdepartmentsForDepartment = async (departmentId, subdepartments) => {
    for (let i = 0; i < subdepartments.length; i++) {
      const subdept = subdepartments[i];
  
      // Skip empty subdepartments
      if (!subdept.name.trim()) continue;
  
      // Check for duplicates within the same department
      const { data: existingSubdept } = await supabase
        .from('tm_subdepartments')
        .select('id, name')
        .ilike('name', subdept.name.trim())
        .eq('department_id', departmentId)
        .limit(1);
  
      if (existingSubdept && existingSubdept.length > 0) {
        console.warn(`Skipping duplicate subdepartment: ${subdept.name}`);
        continue;
      }
  
      // ⭐ FIXED: Use the history arrays directly from the form
      const officer_history = subdept.officer_history || [];
      const manager_history = subdept.manager_history || [];
      const assistant_history = subdept.assistant_history || [];
  
      // Create the subdepartment
      const { data: newSubdept, error: subdeptError } = await supabase
        .from('tm_subdepartments')
        .insert({
          name: subdept.name.trim(),
          description: subdept.description,
          department_id: departmentId,
          default_display: subdept.default_display,
          order: i + 1,
          officer_history,
          manager_history,
          assistant_history
        })
        .select()
        .single();
  
      if (subdeptError) throw subdeptError;
  
      // Handle classes and requirements
      if (subdept.classes && subdept.classes.length > 0) {
        await saveClassRequirements(newSubdept.id, subdept.classes);
      }
    }
  };

  const handleAddDepartment = () => {
    console.log('Adding new department');
    setEditingDepartmentId(null);
    setEditingSubdepartmentId(null);
    setDepartmentForm({
      name: '',
      description: '',
      default_display: true,
      subdepartments: [],
      officerId: '' // Initialize with empty officer
    });
    setIsAddDepartmentOpen(true);
  };

  const handleEditDepartment = (dept) => {
    console.log('Editing department:', dept.id);
    setEditingDepartmentId(dept.id);
    setEditingSubdepartmentId(null);
    
    // Get current officer
    const currentOfficer = getCurrentOfficer(dept.officers_history || []);
    
    setDepartmentForm({
      name: dept.name,
      description: dept.description || '',
      default_display: dept.default_display || true,
      subdepartments: [], // Empty for department editing
      officerId: currentOfficer?.id || ''
    });
    setIsAddDepartmentOpen(true);
  };

  const handleAddSubdepartment = (deptId, deptName) => {
    console.log('Adding subdepartment to department:', deptId);
    setEditingDepartmentId(deptId);
    setEditingSubdepartmentId(null);
    setDepartmentForm({
      name: deptName,
      description: '',
      default_display: true,
      subdepartments: [{
        name: '',
        description: '',
        classes: [],
        taskManagerId: '',
        taskAssistantIds: [],
        default_display: true,
        officerId: '', 
      }],
      officerId: ''
    });
    setIsAddDepartmentOpen(true);
  };

  const handleEditSubdepartment = (subdept: Subdepartment) => {
    // Find the department that contains this subdepartment
    const department = departments.find(d => 
      d.tm_subdepartments?.some(sd => sd.id === subdept.id)
    );

    if (!department) {
      console.error('Department not found for subdepartment:', subdept.id);
      return;
    }

    // Find the full subdepartment data including role assignments
    const fullSubdept = department.tm_subdepartments?.find(sd => sd.id === subdept.id);
    if (!fullSubdept) {
      console.error('Subdepartment data not found:', subdept.id);
      return;
    }

    // Get current role assignments
    const currentManager = getCurrentManager(fullSubdept.manager_history || []);
    const currentAssistants = getCurrentAssistants(fullSubdept.assistant_history || []);
    const currentOfficer = getCurrentOfficer(fullSubdept.officer_history || []);

    console.log('Editing subdepartment:', {
      subdept: fullSubdept,
      currentManager,
      currentAssistants,
      currentOfficer
    });

    // Initialize the form with all necessary data
    setDepartmentForm({
      name: department.name,
      description: department.description || '',
      default_display: department.default_display || true,
      subdepartments: [{
        ...fullSubdept, // Spread all subdepartment properties
        id: fullSubdept.id,
        name: fullSubdept.name,
        description: fullSubdept.description || '',
        classes: fullSubdept.classes || [],
        default_display: fullSubdept.default_display || true,
        
        // Role assignments
        officerId: currentOfficer?.id || '',
        taskManagerId: currentManager?.id || '',
        taskAssistantIds: currentAssistants.map(a => a.id),
        
        // Role histories (ensure they're always arrays)
        officer_history: fullSubdept.officer_history || [],
        manager_history: fullSubdept.manager_history || [],
        assistant_history: fullSubdept.assistant_history || [],
        
        // Role arrays (ensure they're always arrays)
        officers: fullSubdept.officers || [],
        taskManagers: fullSubdept.taskManagers || [],
        taskAssistants: fullSubdept.taskAssistants || []
      }],
      officerId: '' // Department officer is not being edited here
    });

    setEditingDepartmentId(department.id);
    setEditingSubdepartmentId(fullSubdept.id);
    setIsAddDepartmentOpen(true);
  };
 
  useEffect(() => {
    if (!isAddDepartmentOpen) {
      setDepartmentForm({
        name: '',
        description: '',
        default_display: true,
        subdepartments: [],
        officerId: '' // Make sure to reset this
      });
      setEditingDepartmentId(null);
      setEditingSubdepartmentId(null);
    }
  }, [isAddDepartmentOpen]);

  const handleDeleteSubdepartment = async (subdepartmentId: string) => {
    if (!confirm('Are you sure you want to delete this subdepartment and all its contents?')) return;
    try {
      const { error } = await supabase.from('tm_subdepartments').delete().eq('id', subdepartmentId);
      if (error) throw error;
      toast.success('Subdepartment deleted successfully!');
      await fetchData();
    } catch (error) {
      toast.error('Failed to delete subdepartment.');
    }
  };

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.name || 'Unassigned';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-lg text-gray-600">Loading Departments...</span>
      </div>
    );
  }

  const OrderButtons = ({ onReorder, index, listLength, disabled = false }) => (
    <div className="flex flex-col -space-y-1.5">
      <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-gray-700" disabled={disabled || index === 0} onClick={() => onReorder(index, 'up')}>
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-gray-700" disabled={disabled || index === listLength - 1} onClick={() => onReorder(index, 'down')}>
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex-1 space-y-6 p-2 md:p-4 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center">
            <Building className="h-8 w-8 mr-3 text-blue-600" />
            Departments & Workflows
          </h1>
          <p className="text-gray-500 mt-1">Manage all company departments and their structures.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsStatsOpen(true)}
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Statistics
          </Button>
          {isOrderChanged && (
            <Button onClick={handleSaveOrder} disabled={savingOrder}>
              <Loader2 className={`mr-2 h-4 w-4 ${savingOrder ? 'animate-spin' : 'hidden'}`} />
              Save Changes
            </Button>
          )}
          <Button onClick={handleAddDepartment} className="bg-blue-600 hover:bg-blue-700 text-white">
            <FolderPlus className="mr-2 h-5 w-5" /> Add Department
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-72">
              <Input placeholder="Search departments..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => toggleAllDepartments(!areAllExpanded)}
                size="sm"
                className="flex items-center gap-1.5"
              >
                {areAllExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>Collapse All</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>Expand All</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-blue-600">
            <TableRow>
              <TableHead className="w-[60px] border-r text-white">#</TableHead>
              <TableHead className="w-1/4 border-r text-white">Department / Subdepartment</TableHead>
              <TableHead className="border-r text-white">Officer</TableHead>
              <TableHead className="border-r text-white">Task Manager</TableHead>
              <TableHead className="border-r text-white">Task Assistants</TableHead>
              <TableHead className="border-r text-white">Structure</TableHead>
              <TableHead className="border-r text-white">Default Display</TableHead>
              <TableHead className="w-[180px] border-r text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-gray-500">
                  No departments found.
                </TableCell>
              </TableRow>
            ) : (
              filteredDepartments.map((dept, deptIndex) => {
                const currentOfficer = getCurrentOfficer(dept.officers_history || []);
                const hasOfficerHistory = dept.officers_history && dept.officers_history.length > 1;

                return (
                  <React.Fragment key={dept.id}>
                    <TableRow className="bg-blue-50 font-semibold border-b-2 border-gray-200">
                      <TableCell className="text-center border-r">
                        {deptIndex + 1}
                      </TableCell>
                      <TableCell className="text-base text-gray-800 flex justify-between gap-3 border-r">
                        <div className="flex items-center gap-2">
                          <span>{dept.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpansion('dept', dept.id)}
                          className="h-8 w-8"
                        >
                          {expanded[dept.id] ? (
                            <Minus className="h-5 w-5" />
                          ) : (
                            <Plus className="h-5 w-5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="border-r">
                        <div className="text-gray-400 text-sm">View in stats</div>
                      </TableCell>
                      <TableCell className="border-r">
                        <div className="text-gray-400 text-sm">View in stats</div>
                      </TableCell>
                      <TableCell className="border-r">
                        <div className="text-gray-400 text-sm">View in stats</div>
                      </TableCell>
                      <TableCell className="text-base text-gray-800 border-r">
                        {(dept.tm_subdepartments || []).length} Sub Dept
                      </TableCell>
                      <TableCell className="text-center border-r">
                        <Checkbox
                          checked={dept.default_display || false}
                          onCheckedChange={(checked) =>
                            handleDepartmentDefaultDisplayToggle(deptIndex, Boolean(checked))
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right border-r">
                        <div className="flex items-center justify-end gap-2">
                          <DepartmentStats 
                            department={dept} 
                            subdepartments={dept.tm_subdepartments || []} 
                            users={users} 
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditDepartment(dept);
                            }}
                            className="h-6 w-6 text-gray-500 hover:text-blue-600"
                            title="Edit department"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <OrderButtons 
                            onReorder={handleDepartmentReorder} 
                            index={deptIndex} 
                            listLength={filteredDepartments.length} 
                            disabled={savingOrder} 
                          />
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => handleAddSubdepartment(dept.id, dept.name)}
                            title="Add subdepartment"
                          >
                            <Plus className="h-4 w-4 mr-1" /> Add Sub
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {expanded[dept.id] && (dept.tm_subdepartments || []).map((subdept, subdeptIndex) => {
                      const hasClasses = subdept.classes && subdept.classes.length > 0;
                      const subdeptKey = `subdept-${subdept.id}`;
                      const isExpanded = expanded[subdeptKey];
                      
                      // Get current manager and assistants from history
                      const currentManager = getCurrentManager(subdept.manager_history || []);
                      const currentAssistants = getCurrentAssistants(subdept.assistant_history || []);
                      const currentOfficerSub = getCurrentOfficer(subdept.officer_history || []);
                      const hasManagerHistory = subdept.manager_history && subdept.manager_history.length > 1;
                      const hasAssistantHistory = subdept.assistant_history && subdept.assistant_history.length > 1;
                      const hasOfficerHistorySub = subdept.officer_history && subdept.officer_history.length > 1;

                      return (
                        <React.Fragment key={subdept.id}>
                          <TableRow className="hover:bg-gray-50/50 border-b-2 border-gray-200">
                            <TableCell className="text-center border-r text-gray-500 text-xs">
                              {deptIndex + 1}.{subdeptIndex + 1}
                            </TableCell>
                            <TableCell className="pl-12 border-r">
                              <div className="flex justify-between gap-3 font-medium text-gray-700">
                                <div className="flex items-center gap-2">
                                  <Workflow className="h-5 w-5 text-blue-500 flex-shrink-0" />
                                  <span>{subdept.name}</span>
                                </div>
                                {hasClasses && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleExpansion('dept', subdeptKey)}
                                    className="h-6 w-6 -ml-2"
                                  >
                                    {isExpanded ? (
                                      <Minus className="h-4 w-4" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                              {subdept.description && <div className="pl-8 text-xs text-gray-500 mt-1">{subdept.description}</div>}
                            </TableCell>
                            <TableCell className="border-r">
                              <div className="flex items-center gap-2">
                                {currentOfficerSub ? (
                                  <UserDetailsPopover userId={currentOfficerSub.id} users={users} role="officer">
                                    <div className="flex items-center gap-2">
                                      <Shield className="h-4 w-4 text-blue-600" />
                                      <span>{getUserName(currentOfficerSub.id)}</span>
                                    </div>
                                  </UserDetailsPopover>
                                ) : (
                                  <span className="text-gray-400">None</span>
                                )}
                                {hasOfficerHistorySub && (
                                  <OfficerHistoryPopover officers_history={subdept.officer_history || []} users={users}>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600">
                                      <History className="h-3.5 w-3.5" />
                                    </Button>
                                  </OfficerHistoryPopover>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="border-r">
                              <div className="flex items-center gap-2">
                                {currentManager ? (
                                  <UserDetailsPopover userId={currentManager.id} users={users} role="manager">
                                    <div className="flex items-center gap-2">
                                      <UserIcon className="h-4 w-4 text-green-600" />
                                      <span>{getUserName(currentManager.id)}</span>
                                    </div>
                                  </UserDetailsPopover>
                                ) : (
                                  <span className="text-gray-400">None</span>
                                )}
                                {hasManagerHistory && (
                                  <ManagerHistoryPopover manager_history={subdept.manager_history || []} users={users}>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600">
                                      <History className="h-3.5 w-3.5" />
                                    </Button>
                                  </ManagerHistoryPopover>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="border-r">
                              <div className="flex items-center gap-2">
                                {currentAssistants.length > 0 ? (
                                  <div className="flex flex-col space-y-1">
                                    {currentAssistants.map((assistant, i) => (
                                      <UserDetailsPopover key={i} userId={assistant.id} users={users} role="assistant">
                                        <div className="flex items-center gap-2">
                                          <Users className="h-4 w-4 text-amber-600" />
                                          <span>{getUserName(assistant.id)}</span>
                                        </div>
                                      </UserDetailsPopover>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">None</span>
                                )}
                                {hasAssistantHistory && (
                                  <AssistantHistoryPopover assistant_history={subdept.assistant_history || []} users={users}>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600">
                                      <History className="h-3.5 w-3.5" />
                                    </Button>
                                  </AssistantHistoryPopover>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="border-r">
                              {hasClasses && (
                                <div className="flex items-center">
                                  <span className="text-sm text-gray-600">
                                    {subdept.classes.length} {subdept.classes.length === 1 ? 'Class' : 'Classes'}
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center border-r">
                              <Checkbox
                                checked={subdept.default_display || false}
                                onCheckedChange={(checked) =>
                                  handleSubdepartmentDefaultDisplayToggle(deptIndex, subdeptIndex, Boolean(checked))
                                }
                              />
                            </TableCell>
                            <TableCell className="border-r">
                              <div className="flex items-center justify-end gap-2">
                                <OrderButtons
                                  onReorder={(idx, dir) => handleSubdepartmentReorder(deptIndex, idx, dir)}
                                  index={subdeptIndex}
                                  listLength={(dept.tm_subdepartments || []).length}
                                  disabled={savingOrder}
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleEditSubdepartment(subdept)}
                                  title="Edit"
                                  className="h-8 w-8"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleDeleteSubdepartment(subdept.id)}
                                  title="Delete"
                                  className="h-8 w-8 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Classes for this subdepartment */}
                          {isExpanded && hasClasses && subdept.classes.map((cls, clsIndex) => {
                            const classId = `class-${subdept.id}-${cls.id || clsIndex}`;
                            const hasSubClasses = cls.subClasses && cls.subClasses.length > 0;
                            const isClassExpanded = expandedClasses[classId];

                            return (
                              <React.Fragment key={`${subdept.id}-${cls.id || clsIndex}`}>
                                <TableRow className="bg-gray-50 hover:bg-gray-100/50">
                                  <TableCell className="text-center border-r text-gray-500 text-xs">
                                    {deptIndex + 1}.{subdeptIndex + 1}.{clsIndex + 1}
                                  </TableCell>
                                  <TableCell className="pl-24 border-r flex justify-between">
                                    <div className="flex items-center gap-2 text-sm">
                                      <Layers className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                      <span className="font-medium text-gray-700">{cls.name}</span>
                                      {cls.description && (
                                        <span className="text-gray-500 truncate max-w-xs">- {cls.description}</span>
                                      )}
                                    </div>
                                    {hasSubClasses ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleExpansion('class', classId);
                                        }}
                                        className="h-6 w-6 -ml-2"
                                      >
                                        {isClassExpanded ? (
                                          <Minus className="h-4 w-4" />
                                        ) : (
                                          <Plus className="h-4 w-4" />
                                        )}
                                      </Button>
                                    ) : (
                                      <span className="w-6 h-6 flex-shrink-0"></span>
                                    )}
                                  </TableCell>
                                  <TableCell className="border-r"></TableCell>
                                  <TableCell className="border-r"></TableCell>
                                  <TableCell className="border-r"></TableCell>
                                  <TableCell className="border-r">
                                    {hasSubClasses && (
                                      <span className="text-xs text-gray-600">
                                        {cls.subClasses.length} {cls.subClasses.length === 1 ? 'Subclass' : 'Subclasses'}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center border-r">
                                    <Checkbox
                                      checked={cls.default_display || false}
                                      onCheckedChange={(checked) =>
                                        handleClassDefaultDisplayToggle(deptIndex, subdeptIndex, clsIndex, Boolean(checked))
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="border-r"></TableCell>
                                </TableRow>

                                {/* Subclasses */}
                                {isClassExpanded && hasSubClasses && cls.subClasses.map((subClass, subClassIndex) => (
                                  <TableRow key={`${cls.id}-${subClass.id || subClassIndex}`} className="hover:bg-gray-100/70">
                                    <TableCell className="text-center border-r text-gray-500 text-xs">
                                      {deptIndex + 1}.{subdeptIndex + 1}.{clsIndex + 1}.{subClassIndex + 1}
                                    </TableCell>
                                    <TableCell className="pl-32 border-r">
                                      <div className="flex items-center gap-2 text-sm">
                                        <span className="w-6 h-6 flex-shrink-0"></span>
                                        <Target className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />
                                        <span className="font-medium text-gray-700">{subClass.name}</span>
                                        {subClass.description && (
                                          <span className="text-gray-500 truncate max-w-xs">- {subClass.description}</span>
                                        )}
                                        {subClass.requirements?.length > 0 && (
                                          <Badge variant="outline" className="ml-2">
                                            {subClass.requirements.length} {subClass.requirements.length === 1 ? 'Requirement' : 'Requirements'}
                                          </Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="border-r"></TableCell>
                                    <TableCell className="border-r"></TableCell>
                                    <TableCell className="border-r"></TableCell>
                                    <TableCell className="border-r"></TableCell>
                                    <TableCell className="text-center border-r">
                                      <Checkbox
                                        checked={subClass.default_display || false}
                                        onCheckedChange={(checked) =>
                                          handleSubclassDefaultDisplayToggle(deptIndex, subdeptIndex, clsIndex, subClassIndex, Boolean(checked))
                                        }
                                      />
                                    </TableCell>
                                    <TableCell className="border-r"></TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DepartmentDialog
        open={isAddDepartmentOpen}
        onOpenChange={setIsAddDepartmentOpen}
        onSave={handleSaveDepartment}
        departmentForm={departmentForm}
        setDepartmentForm={setDepartmentForm}
        users={users}
        officers={officers}
        editingDepartmentId={editingDepartmentId}
        editingSubdepartmentId={editingSubdepartmentId}
        isSaving={saving}
      />

      <AssignmentStatsDashboard
        departments={departments}
        users={users}
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
      />
    </div>
  )
}