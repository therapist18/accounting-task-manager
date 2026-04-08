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
  getCurrentAssignments,
  getCurrentOfficer,
  getDepartmentOfficerIds,
  getSubdepartmentOfficerIds,
  getCurrentManager,
  getCurrentManagers,
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
  Officer,
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
import { Loader2, Building, FolderPlus, Edit, Trash2, ChevronDown, ChevronUp, Plus, Minus, Search, BarChart3, Workflow, Layers, Target, User as UserIcon, Shield, Users, History, FileSpreadsheet, DownloadCloud } from "lucide-react"
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
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { ENTITY_TYPES } from "@/lib/constants/entity-types"
import { getOfficerDisplayName } from "../../tasks/utils/authOfficers"
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
function OfficerHistoryPopover({ officers_history, officers, children }: {
  officers_history: OfficerHistory[],
  officers: Officer[],
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
              const user = officers.find(o => o.id === officer.id)
              const isCurrent = !officer.end_date
              const duration = getAssignmentDuration(officer)

              return (
                <div key={index} className={`p-3 rounded border ${isCurrent ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{user ? getOfficerDisplayName(user) : 'Unknown Officer'}</p>
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
function UserDetailsPopover({ userId, users, officers = [], role, children }: {
  userId: string,
  users: User[],
  officers?: Officer[],
  role: 'manager' | 'assistant' | 'officer',
  children: React.ReactNode
}) {
  const officer = role === 'officer' ? officers.find(o => o.id === userId) : null
  const user = role === 'officer'
    ? (officer ? { name: getOfficerDisplayName(officer), email: officer.email } : null)
    : users.find(u => u.id === userId)

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

  // Initial Form State
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>({
    name: '',
    description: '',
    default_display: true,
    subdepartments: [],
    officerId: ''
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

  const fetchData = async (isSilent = false) => {
    try {
      // Only show the global loader if it's the first time or not a silent refresh
      if (!isSilent) setLoading(true);

      const departmentsData = await fetchDepartments();

      // Simply update the state with the fresh data
      setDepartments(departmentsData);

      // If we are editing, we might want to refresh the expanded states 
      // but usually, keeping the current expanded keys is better for UX.
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to sync data. Please try again.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      // First load is NOT silent
      await fetchData(false);
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
  }, []);

  // --- REORDERING LOGIC ---
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

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const cleanDepartments = departments.map(dept => {
        const { officers_history, ...rest } = dept;
        return rest;
      });

      await saveOrderAndDefaultDisplay(cleanDepartments);
      toast.success("Order and display settings saved successfully!");
      setIsOrderChanged(false);
    } catch (error) {
      console.error("Failed to save order", error);
      toast.error("Could not save the settings.");
    } finally {
      setSavingOrder(false);
    }
  };

  // --- DISPLAY TOGGLES ---
  const handleDepartmentDefaultDisplayToggle = (deptIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

  const handleSubdepartmentDefaultDisplayToggle = (deptIndex: number, subdeptIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].tm_subdepartments[subdeptIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

  const handleClassDefaultDisplayToggle = (deptIndex: number, subdeptIndex: number, classIndex: number, checked: boolean) => {
    const updatedDepartments = [...departments];
    updatedDepartments[deptIndex].tm_subdepartments[subdeptIndex].classes[classIndex].default_display = checked;
    setDepartments(updatedDepartments);
    setIsOrderChanged(true);
  };

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

  const filteredDepartments = departments
    .filter(dept =>
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.tm_subdepartments || []).some(subdept => subdept.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const areAllExpanded = filteredDepartments.length > 0 &&
    filteredDepartments.every(dept => expanded[dept.id]) &&
    filteredDepartments.every(dept =>
      (dept.tm_subdepartments || []).every(subdept =>
        expanded[`subdept-${subdept.id}`]
      )
    );

  // Inside handleSaveDepartment function in Departments.tsx
  const handleSaveDepartment = async () => {
    setSaving(true);
    try {
      // 1. Core Department Update
      if (editingDepartmentId) {
        await updateExistingDepartment(departmentForm);
      } else {
        const newDept = await createNewDepartment(departmentForm);
        setEditingDepartmentId(newDept.id);
      }

      // 2. Loop through subdepartments and UPSERT them
      // This replaces the separate "createNewSubdepartment" vs "updateExistingSubdepartment" logic
      // which was causing the confusion and the duplicate name error.
      for (const sub of departmentForm.subdepartments) {
        const isNew = !sub.id;

        // Duplication check ONLY if it's a new subdepartment or name changed
        if (isNew) {
          const { data: existing } = await supabase
            .from('tm_subdepartments')
            .select('id')
            .ilike('name', sub.name.trim())
            .eq('department_id', editingDepartmentId)
            .limit(1);

          if (existing?.length > 0) {
            toast.error(`Subdepartment "${sub.name}" already exists. Skipping create.`);
            continue;
          }
        }

        // Prepare payload
        const payload = {
          name: sub.name.trim(),
          description: sub.description,
          department_id: editingDepartmentId,
          default_display: sub.default_display,
          classes: sub.classes || [],
          officer_history: sub.officer_history || [],
          manager_history: sub.manager_history || [],
          assistant_history: sub.assistant_history || [],
          entity_types: sub.entity_types || []
        };

        if (isNew) {
          const { data: newSub } = await supabase
            .from('tm_subdepartments')
            .insert(payload)
            .select().single();
          if (newSub) await saveClassRequirements(newSub.id, sub.classes);
        } else {
          await supabase
            .from('tm_subdepartments')
            .update(payload)
            .eq('id', sub.id);
          await updateClassRequirements(sub.id, sub.classes);
        }
      }

      toast.success('Department structure saved successfully!');
      setIsAddDepartmentOpen(false);
      await fetchData();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const createNewDepartment = async (formData: DepartmentForm) => {
    const { officerId, subdepartments, officers_history = [], ...departmentData } = formData;
    const { data: newDept, error: deptError } = await supabase
      .from('tm_departments')
      .insert([{ ...departmentData, officers_history }])
      .select('*')
      .single();

    if (deptError) throw deptError;

    if (subdepartments && subdepartments.length > 0) {
      await createSubdepartmentsForDepartment(newDept.id, subdepartments);
    }
    return newDept;
  };

  const updateExistingDepartment = async (formData: DepartmentForm) => {
    if (!editingDepartmentId) return;
    const { officerId, subdepartments, officers_history = [], ...departmentData } = formData;
    const { data: updatedDept, error: deptError } = await supabase
      .from('tm_departments')
      .update({ ...departmentData, officers_history })
      .eq('id', editingDepartmentId)
      .select('*')
      .single();

    if (deptError) throw deptError;
    return updatedDept;
  };

  const createNewSubdepartment = async (formData: any = departmentForm) => {
    if (formData.subdepartments.length === 0) throw new Error('No subdepartment data provided');
    const subdept = formData.subdepartments[0];

    // Duplication Check
    const { data: existingSubdept } = await supabase
      .from('tm_subdepartments')
      .select('id')
      .ilike('name', subdept.name.trim())
      .eq('department_id', editingDepartmentId)
      .limit(1);

    if (existingSubdept && existingSubdept.length > 0) {
      throw new Error('A subdepartment with this name already exists in this department');
    }

    const { data: maxOrder } = await supabase
      .from('tm_subdepartments')
      .select('order')
      .eq('department_id', editingDepartmentId)
      .order('order', { ascending: false })
      .limit(1);

    const nextOrder = (maxOrder?.[0]?.order || 0) + 1;

    const { data: newSubdept, error: createError } = await supabase
      .from('tm_subdepartments')
      .insert({
        name: subdept.name.trim(),
        description: subdept.description,
        department_id: editingDepartmentId,
        default_display: subdept.default_display,
        order: nextOrder,
        officer_history: subdept.officer_history || [],
        manager_history: subdept.manager_history || [],
        assistant_history: subdept.assistant_history || []
      })
      .select()
      .single();

    if (createError) throw createError;

    if (subdept.classes && subdept.classes.length > 0) {
      await saveClassRequirements(newSubdept.id, subdept.classes);
    }
  };

  const updateExistingSubdepartment = async (formData: any = departmentForm) => {
    if (formData.subdepartments.length === 0) throw new Error('No subdepartment data');
    const subdept = formData.subdepartments[0];

    const { data: currentSubdept } = await supabase
      .from('tm_subdepartments')
      .select('department_id')
      .eq('id', editingSubdepartmentId)
      .single();

    // Check duplicate name
    const { data: existingSubdept } = await supabase
      .from('tm_subdepartments')
      .select('id')
      .ilike('name', subdept.name.trim())
      .eq('department_id', currentSubdept.department_id)
      .neq('id', editingSubdepartmentId)
      .limit(1);

    if (existingSubdept && existingSubdept.length > 0) {
      throw new Error('Name exists in this department');
    }

    const updateData = {
      name: subdept.name.trim(),
      description: subdept.description || '',
      default_display: subdept.default_display || false,
      classes: subdept.classes || [],
      rates: subdept.rates || null,
      stages: subdept.stages || null,
      webdata: subdept.webdata || null,
      upload_requirements: subdept.upload_requirements || null,
      officer_history: subdept.officer_history || [],
      manager_history: subdept.manager_history || [],
      assistant_history: subdept.assistant_history || [],
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('tm_subdepartments')
      .update(updateData)
      .eq('id', editingSubdepartmentId);

    if (updateError) throw updateError;

    if (subdept.classes && subdept.classes.length > 0) {
      await updateClassRequirements(editingSubdepartmentId, subdept.classes);
    }
  };

  const createSubdepartmentsForDepartment = async (departmentId, subdepartments) => {
    for (let i = 0; i < subdepartments.length; i++) {
      const subdept = subdepartments[i];
      if (!subdept.name.trim()) continue;

      const { data: newSubdept, error } = await supabase
        .from('tm_subdepartments')
        .insert({
          name: subdept.name.trim(),
          description: subdept.description,
          department_id: departmentId,
          default_display: subdept.default_display,
          order: i + 1,
          officer_history: subdept.officer_history || [],
          manager_history: subdept.manager_history || [],
          assistant_history: subdept.assistant_history || []
        })
        .select()
        .single();

      if (error) continue;

      if (subdept.classes && subdept.classes.length > 0) {
        await saveClassRequirements(newSubdept.id, subdept.classes);
      }
    }
  };

  // --- DELETE LOGIC ---

  // 1. Delete Department
  const handleDeleteDepartment = async (departmentId: string) => {
    if (!confirm('Are you sure you want to delete this department? This will delete all subdepartments and data within it.')) return;

    try {
      setLoading(true);
      // Depending on DB setup, you might need to delete subdepartments first if cascade isn't on.
      // Assuming cascade is on or we rely on the error.
      const { error } = await supabase.from('tm_departments').delete().eq('id', departmentId);

      if (error) throw error;

      toast.success('Department deleted successfully!');
      await fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete department. It might contain data that prevents deletion.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Delete Subdepartment
  const handleDeleteSubdepartment = async (subdepartmentId: string) => {
    if (!confirm('Are you sure you want to delete this subdepartment?')) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('tm_subdepartments').delete().eq('id', subdepartmentId);

      if (error) throw error;

      toast.success('Subdepartment deleted successfully!');
      await fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete subdepartment.');
    } finally {
      setLoading(false);
    }
  };

  // --- DIALOG OPENERS ---
  const handleAddDepartment = () => {
    setEditingDepartmentId(null);
    setEditingSubdepartmentId(null);
    setDepartmentForm({
      name: '',
      description: '',
      default_display: true,
      subdepartments: [],
      officers_history: [],
      officerId: ''
    });
    setIsAddDepartmentOpen(true);
  };

  const handleEditDepartment = (dept) => {
    setEditingDepartmentId(dept.id);
    setEditingSubdepartmentId(null);
    const associatedOfficerIds = getDepartmentAssociatedOfficerIds(dept);
    const mappedSubdepartments = (dept.tm_subdepartments || []).map(sub => ({
      id: sub.id, // Important: pass ID so the save function updates instead of creating new
      name: sub.name,
      description: sub.description || '',
      default_display: sub.default_display ?? true,
      entity_types: sub.entity_types || [],
      officer_history: getOfficerHistoryFromIds(getSubdepartmentAssociatedOfficerIds(dept, sub)),
      manager_history: sub.manager_history || [],
      assistant_history: sub.assistant_history || [],
      classes: (sub.classes || []).map(cls => ({
        id: cls.id,
        name: cls.name,
        description: cls.description || '',
        order: cls.order,
        isVisible: cls.isVisible ?? true,
        default_display: cls.default_display ?? true,
        entity_types: cls.entity_types || [],
        subClasses: (cls.subClasses || []).map(sc => ({
          id: sc.id,
          name: sc.name,
          description: sc.description || '',
          order: sc.order,
          isVisible: sc.isVisible ?? true,
          default_display: sc.default_display ?? true,
          entity_types: sc.entity_types || [],
          requirements: sc.requirements || []
        }))
      }))
    }));

    setDepartmentForm({
      name: dept.name,
      description: dept.description || '',
      default_display: dept.default_display ?? true,
      entity_types: dept.entity_types || [],
      subdepartments: mappedSubdepartments,
      officers_history: getOfficerHistoryFromIds(associatedOfficerIds),
      officerId: ''
    });

    setIsAddDepartmentOpen(true);
  };

  const handleAddSubdepartment = (deptId, deptName) => {
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
        entity_types: [],
        officer_history: [],
        manager_history: [],
        assistant_history: [],
        officerId: '',
      }],
      officers_history: [],
      officerId: ''
    });
    setIsAddDepartmentOpen(true);
  };

  const handleEditSubdepartment = (subdept: Subdepartment) => {
    const department = departments.find(d => d.tm_subdepartments?.some(sd => sd.id === subdept.id));
    if (!department) return;

    const fullSubdept = department.tm_subdepartments?.find(sd => sd.id === subdept.id);
    if (!fullSubdept) return;

    setDepartmentForm({
      name: department.name,
      description: department.description || '',
      default_display: department.default_display || true,
      entity_types: department.entity_types || [],
      subdepartments: [{
        ...fullSubdept,
        officerId: '',
        taskManagerId: '',
        taskAssistantIds: [],
        officer_history: getOfficerHistoryFromIds(getSubdepartmentAssociatedOfficerIds(department, fullSubdept)),
        manager_history: fullSubdept.manager_history || [],
        assistant_history: fullSubdept.assistant_history || [],
      }],
      officers_history: getOfficerHistoryFromIds(getDepartmentAssociatedOfficerIds(department)),
      officerId: ''
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
        officers_history: [],
        officerId: ''
      });
      setEditingDepartmentId(null);
      setEditingSubdepartmentId(null);
    }
  }, [isAddDepartmentOpen]);

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.name || 'Unassigned';
  const getOfficerName = (officerId: string) => {
    const officer = officers.find(o => o.id === officerId);
    return officer ? getOfficerDisplayName(officer) : 'Unassigned';
  };
  const renderOfficerAssignments = (assignmentIds: string[], emptyLabel = 'Unassigned') => {
    if (!assignmentIds.length) return <span className="text-gray-400">{emptyLabel}</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {assignmentIds.map((officerId) => (
          <UserDetailsPopover key={officerId} userId={officerId} users={users} officers={officers} role="officer">
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              {getOfficerName(officerId)}
            </Badge>
          </UserDetailsPopover>
        ))}
      </div>
    );
  };
  const renderManagerAssignments = (managerIds: string[], emptyLabel = 'None') => {
    if (!managerIds.length) return <span className="text-gray-400">{emptyLabel}</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {managerIds.map((managerId) => (
          <UserDetailsPopover key={managerId} userId={managerId} users={users} officers={officers} role="manager">
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
              {getUserName(managerId)}
            </Badge>
          </UserDetailsPopover>
        ))}
      </div>
    );
  };
  const getDepartmentAssociatedOfficerIds = (dept: any) => getDepartmentOfficerIds(officers, dept.id);

  const getSubdepartmentAssociatedOfficerIds = (dept: any, subdept: any) =>
    getSubdepartmentOfficerIds(officers, dept.id, subdept.id);

  const getOfficerHistoryFromIds = (ids: string[]) =>
    ids.map((id) => ({ id, start_date: new Date().toISOString() }));
  // Change this condition
  if (loading && departments.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-lg text-gray-600">Initialising Departments...</span>
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

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Departments Structure');
      sheet.columns = [
        { header: 'Index', key: 'index', width: 15 },
        { header: 'Name', key: 'name', width: 60 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Officer', key: 'officer', width: 25 },
        { header: 'Task Manager', key: 'manager', width: 25 },
        { header: 'Task Assistants', key: 'assistants', width: 40 },
        { header: 'Default Display', key: 'display', width: 15 },
        { header: 'Item Type', key: 'type', width: 15 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

      const getName = (id: string) => users.find(u => u.id === id)?.name || '-';
      const getBoolean = (val: boolean) => val ? 'Yes' : 'No';

      filteredDepartments.forEach((dept, dIdx) => {
        const currentDeptOfficerIds = getDepartmentAssociatedOfficerIds(dept);
        const deptRow = sheet.addRow({
          index: `${dIdx + 1}`,
          name: dept.name,
          description: dept.description || '',
          officer: currentDeptOfficerIds.length ? currentDeptOfficerIds.map((officerId) => getOfficerName(officerId)).join(', ') : '-',
          manager: '-',
          assistants: '-',
          display: getBoolean(dept.default_display),
          type: 'Department'
        });
        deptRow.font = { bold: true, size: 12 };
        deptRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

        (dept.tm_subdepartments || []).forEach((sub, sIdx) => {
          const currentSubOfficerIds = getSubdepartmentAssociatedOfficerIds(dept, sub);
          const currentManagers = getCurrentManagers(sub.manager_history || []);
          const currentAssistants = getCurrentAssistants(sub.assistant_history || []);
          const subRow = sheet.addRow({
            index: `${dIdx + 1}.${sIdx + 1}`,
            name: `    ${sub.name}`,
            description: sub.description || '',
            officer: currentSubOfficerIds.length ? currentSubOfficerIds.map((officerId) => getOfficerName(officerId)).join(', ') : '-',
            manager: currentManagers.length ? currentManagers.map((manager) => getName(manager.id)).join(', ') : '-',
            assistants: currentAssistants.map(a => getName(a.id)).join(', '),
            display: getBoolean(sub.default_display),
            type: 'Subdepartment'
          });
          subRow.outlineLevel = 1;
          subRow.font = { bold: true, color: { argb: 'FF374151' } };

          (sub.classes || []).forEach((cls, cIdx) => {
            const classRow = sheet.addRow({
              index: `${dIdx + 1}.${sIdx + 1}.${cIdx + 1}`,
              name: `        ${cls.name}`,
              description: cls.description || '',
              officer: '-',
              manager: '-',
              assistants: '-',
              display: getBoolean(cls.default_display),
              type: 'Class'
            });
            classRow.outlineLevel = 2;
            classRow.font = { italic: true, color: { argb: 'FF4B5563' } };

            (cls.subClasses || []).forEach((subCls, scIdx) => {
              const subClassRow = sheet.addRow({
                index: `${dIdx + 1}.${sIdx + 1}.${cIdx + 1}.${scIdx + 1}`,
                name: `            ${subCls.name}`,
                description: subCls.description || '',
                officer: '-',
                manager: '-',
                assistants: '-',
                display: getBoolean(subCls.default_display),
                type: 'SubClass'
              });
              subClassRow.outlineLevel = 3;
              subClassRow.font = { color: { argb: 'FF6B7280' } };
            });
          });
        });
      });
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Departments_Structure_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Excel exported successfully!");
    } catch (error) {
      console.error('Export failed:', error);
      toast.error("Failed to export Excel.");
    }
  };

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
          <Button variant="outline" onClick={() => setIsStatsOpen(true)} className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Statistics
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="flex items-center gap-2 text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800">
            <DownloadCloud className="h-4 w-4" /> Export Excel
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
              <Button variant="outline" onClick={() => toggleAllDepartments(!areAllExpanded)} size="sm" className="flex items-center gap-1.5">
                {areAllExpanded ? <><ChevronUp className="h-4 w-4" /><span>Collapse All</span></> : <><ChevronDown className="h-4 w-4" /><span>Expand All</span></>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-white shadow-sm overflow-auto max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader className="bg-blue-600">
            <TableRow>
              <TableHead className="w-[60px] border-r text-white">#</TableHead>
              <TableHead className="w-1/4 border-r text-white">Department / Subdepartment</TableHead>
              <TableHead className="border-r text-white">Officer</TableHead>
              <TableHead className="border-r text-white">Task Manager</TableHead>
              <TableHead className="border-r text-white">Task Assistants</TableHead>
              <TableHead className="border-r text-white">Entities</TableHead>
              <TableHead className="border-r text-white">Structure</TableHead>
              <TableHead className="border-r text-white">Default Display</TableHead>
              <TableHead className="w-[180px] border-r text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-gray-500">No departments found.</TableCell>
              </TableRow>
            ) : (
              filteredDepartments.map((dept, deptIndex) => {
                const currentDepartmentOfficers = getDepartmentAssociatedOfficerIds(dept);
                return (
                  <React.Fragment key={dept.id}>
                    <TableRow className="bg-blue-50 font-semibold border-b-2 border-gray-200">
                      <TableCell className="text-center border-r">{deptIndex + 1}</TableCell>
                      <TableCell className="text-base text-gray-800 flex justify-between gap-3 border-r">
                        <div className="flex items-center gap-2"><span>{dept.name}</span></div>
                        <Button variant="ghost" size="icon" onClick={() => toggleExpansion('dept', dept.id)} className="h-8 w-8">
                          {expanded[dept.id] ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                        </Button>
                      </TableCell>
                      <TableCell className="border-r">{renderOfficerAssignments(currentDepartmentOfficers)}</TableCell>
                      <TableCell className="border-r"><div className="text-gray-400 text-sm">View in stats</div></TableCell>
                      <TableCell className="border-r"><div className="text-gray-400 text-sm">View in stats</div></TableCell>
                      <TableCell className="text-base text-gray-800 border-r">
                        {dept.entity_types && dept.entity_types.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {dept.entity_types.map((entityType, index) => {
                              const entityConfig = ENTITY_TYPES.find(type => type.value === entityType)
                              return (
                                <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  {entityConfig?.label || entityType}
                                </Badge>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">All Types</span>
                        )}
                      </TableCell>
                      <TableCell className="text-base text-gray-800 border-r">{(dept.tm_subdepartments || []).length} Sub Dept</TableCell>
                      <TableCell className="text-center border-r">
                        <Checkbox checked={dept.default_display || false} onCheckedChange={(checked) => handleDepartmentDefaultDisplayToggle(deptIndex, Boolean(checked))} />
                      </TableCell>
                      <TableCell className="text-right border-r">
                        <div className="flex items-center justify-end gap-2">
                          <DepartmentStats department={dept} subdepartments={dept.tm_subdepartments || []} users={users} officers={officers} />
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditDepartment(dept); }} className="h-6 w-6 text-gray-500 hover:text-blue-600">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {/* DELETE DEPARTMENT BUTTON */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDepartment(dept.id);
                            }}
                            className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                            title="Delete Department"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <OrderButtons onReorder={handleDepartmentReorder} index={deptIndex} listLength={filteredDepartments.length} disabled={savingOrder} />
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleAddSubdepartment(dept.id, dept.name)}>
                            <Plus className="h-4 w-4 mr-1" /> Add Sub
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {expanded[dept.id] && (dept.tm_subdepartments || [])
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((subdept, subdeptIndex) => {
                        const hasClasses = subdept.classes && subdept.classes.length > 0;
                        const subdeptKey = `subdept-${subdept.id}`;
                        const isExpanded = expanded[subdeptKey];
                        const currentManagers = getCurrentManagers(subdept.manager_history || []);
                        const currentAssistants = getCurrentAssistants(subdept.assistant_history || []);
                        const currentOfficerSub = getSubdepartmentAssociatedOfficerIds(dept, subdept);

                        return (
                          <React.Fragment key={subdept.id}>
                            <TableRow className="hover:bg-gray-50/50 border-b-2 border-gray-200">
                              <TableCell className="text-center border-r text-gray-500 text-xs">{deptIndex + 1}.{subdeptIndex + 1}</TableCell>
                              <TableCell className="pl-12 border-r">
                                <div className="flex justify-between gap-3 font-medium text-gray-700">
                                  <div className="flex items-center gap-2"><Workflow className="h-5 w-5 text-blue-500 flex-shrink-0" /><span>{subdept.name}</span></div>
                                  {hasClasses && (
                                    <Button variant="ghost" size="icon" onClick={() => toggleExpansion('dept', subdeptKey)} className="h-6 w-6 -ml-2">
                                      {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="border-r">
                                <div className="flex items-center gap-2">
                                  {currentOfficerSub.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {currentOfficerSub.map((officerId) => (
                                        <UserDetailsPopover key={officerId} userId={officerId} users={users} officers={officers} role="officer">
                                          <div className="flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-blue-600" />
                                            <span>{getOfficerName(officerId)}</span>
                                          </div>
                                        </UserDetailsPopover>
                                      ))}
                                    </div>
                                  ) : <span className="text-gray-400">Unassigned</span>}
                                </div>
                              </TableCell>
                              <TableCell className="border-r">
                                {renderManagerAssignments(currentManagers.map((manager) => manager.id))}
                              </TableCell>
                              <TableCell className="border-r">
                                <div className="flex items-center gap-2">
                                  {currentAssistants.length > 0 ? (
                                    <div className="flex flex-col space-y-1">
                                      {currentAssistants.map((assistant, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          <UserDetailsPopover userId={assistant.id} users={users} role="assistant">
                                            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-purple-600" /><span>{getUserName(assistant.id)}</span></div>
                                          </UserDetailsPopover>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <span className="text-gray-400">None</span>}
                                </div>
                              </TableCell>
                              <TableCell className="text-base text-gray-800 border-r">
                                {subdept.entity_types && subdept.entity_types.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {subdept.entity_types.map((entityType, index) => {
                                      const entityConfig = ENTITY_TYPES.find(type => type.value === entityType)
                                      return (
                                        <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                          {entityConfig?.label || entityType}
                                        </Badge>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">All Types</span>
                                )}
                              </TableCell>
                              <TableCell className="border-r">{hasClasses && <span className="text-sm text-gray-600">{subdept.classes.length} Classes</span>}</TableCell>
                              <TableCell className="text-center border-r">
                                <Checkbox checked={subdept.default_display || false} onCheckedChange={(checked) => handleSubdepartmentDefaultDisplayToggle(deptIndex, subdeptIndex, Boolean(checked))} />
                              </TableCell>
                              <TableCell className="border-r">
                                <div className="flex items-center justify-end gap-2">
                                  <OrderButtons onReorder={(idx, dir) => handleSubdepartmentReorder(deptIndex, idx, dir)} index={subdeptIndex} listLength={(dept.tm_subdepartments || []).length} disabled={savingOrder} />
                                  <Button variant="outline" size="icon" onClick={() => handleEditSubdepartment(subdept)} className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                                  <Button variant="outline" size="icon" onClick={() => handleDeleteSubdepartment(subdept.id)} className="h-8 w-8 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded && hasClasses && (subdept.classes || [])
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .map((cls, clsIndex) => {
                                const classId = `class-${subdept.id}-${cls.id || clsIndex}`;
                                const hasSubClasses = cls.subClasses && cls.subClasses.length > 0;
                                const isClassExpanded = expandedClasses[classId];

                                return (
                                  <React.Fragment key={`${subdept.id}-${cls.id || clsIndex}`}>
                                    <TableRow className="bg-gray-50 hover:bg-gray-100/50">
                                      <TableCell className="text-center border-r text-gray-500 text-xs">{deptIndex + 1}.{subdeptIndex + 1}.{clsIndex + 1}</TableCell>
                                      <TableCell className="pl-24 border-r flex justify-between">
                                        <div className="flex items-center gap-2 text-sm">
                                          <Layers className="h-4 w-4 text-blue-400 flex-shrink-0" /><span className="font-medium text-gray-700">{cls.name}</span>
                                        </div>
                                        {hasSubClasses ? (
                                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); toggleExpansion('class', classId); }} className="h-6 w-6 -ml-2">
                                            {isClassExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                          </Button>
                                        ) : <span className="w-6 h-6 flex-shrink-0"></span>}
                                      </TableCell>
                                      <TableCell className="border-r"></TableCell>
                                      <TableCell className="border-r"></TableCell>
                                      <TableCell className="border-r"></TableCell>
                                      <TableCell className="border-r">
                                        {cls.entity_types && cls.entity_types.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {cls.entity_types.map((entityType, index) => {
                                              const entityConfig = ENTITY_TYPES.find(type => type.value === entityType)
                                              return (
                                                <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                                  {entityConfig?.label || entityType}
                                                </Badge>
                                              )
                                            })}
                                          </div>
                                        ) : (
                                          <span className="text-gray-400 text-sm">All Types</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-center border-r">
                                        <Checkbox checked={cls.default_display || false} onCheckedChange={(checked) => handleClassDefaultDisplayToggle(deptIndex, subdeptIndex, clsIndex, Boolean(checked))} />
                                      </TableCell>
                                      <TableCell className="border-r"></TableCell>
                                    </TableRow>

                                    {isClassExpanded && hasSubClasses && (cls.subClasses || [])
                                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                                      .map((subClass, subClassIndex) => (
                                        <TableRow key={`${cls.id}-${subClass.id || subClassIndex}`} className="hover:bg-gray-100/70">
                                          <TableCell className="text-center border-r text-gray-500 text-xs">{deptIndex + 1}.{subdeptIndex + 1}.{clsIndex + 1}.{subClassIndex + 1}</TableCell>
                                          <TableCell className="pl-32 border-r">
                                            <div className="flex items-center gap-2 text-sm">
                                              <span className="w-6 h-6 flex-shrink-0"></span><Target className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" /><span className="font-medium text-gray-700">{subClass.name}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="border-r"></TableCell>
                                          <TableCell className="border-r"></TableCell>
                                          <TableCell className="border-r"></TableCell>
                                          <TableCell className="border-r">
                                            {subClass.entity_types && subClass.entity_types.length > 0 ? (
                                              <div className="flex flex-wrap gap-1">
                                                {subClass.entity_types.map((entityType, index) => {
                                                  const entityConfig = ENTITY_TYPES.find(type => type.value === entityType)
                                                  return (
                                                    <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                                      {entityConfig?.label || entityType}
                                                    </Badge>
                                                  )
                                                })}
                                              </div>
                                            ) : (
                                              <span className="text-gray-400 text-sm">All Types</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-center border-r">
                                            <Checkbox checked={subClass.default_display || false} onCheckedChange={(checked) => handleSubclassDefaultDisplayToggle(deptIndex, subdeptIndex, clsIndex, subClassIndex, Boolean(checked))} />
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
        officers={officers}
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
      />
    </div>
  )
}
