// @ts-nocheck
"use client"
import React, { useState, useEffect } from "react"
import {
  fetchUsers,
  fetchDepartments,
  createDepartment as createDepartmentDb,
  saveOrderAndDefaultDisplay,
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
import { FolderPlus, Plus, Settings, Users, Clock, AlertTriangle, X, Edit, Loader2, UserPlus, UserCheck, UserX, ChevronDown, Check, Eye, EyeOff, ChevronRight, ChevronUp, Trash2, FileText, Layers, Target, UserIcon, Minus, ChevronsUpDown, Search, FileDown, Workflow, Building, FolderOpen } from "lucide-react"
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

  if (!user) return <span className="text-gray-500">{children}</span>

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="cursor-pointer hover:underline text-blue-600 font-medium">{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex items-center space-x-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <UserIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user.name || 'No name'}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- Dialog Form Components ---

// Requirement Component (for Dialog)
function RequirementComponent({
  requirement, onUpdate, onRemove, path, index
}: {
  requirement: RequirementForm, onUpdate: (path: string[], value: any) => void, onRemove: () => void, path: string[], index: string
}) {
  return (
    <div className="p-3 bg-white border-l-4 border-gray-300 rounded-r-md border">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3 pr-4">
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="font-mono">{index}</Badge>
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
            className="min-h-[50px]"
          />
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={requirement.isVisible} 
                onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))} 
                id={`visible-${path.join('-')}`} 
              />
              <Label htmlFor={`visible-${path.join('-')}`} className="text-sm text-gray-700">Visible</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={requirement.isRequired} 
                onCheckedChange={(checked) => onUpdate([...path, 'isRequired'], Boolean(checked))} 
                id={`required-${path.join('-')}`} 
              />
              <Label htmlFor={`required-${path.join('-')}`} className="text-sm text-gray-700">Required</Label>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// SubClass Component (for Dialog)
function SubClassComponent({
  subClass, onUpdate, onRemove, path, index
}: {
  subClass: SubClassForm, onUpdate: (path: string[], value: any) => void, onRemove: () => void, path: string[], index: string
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const addRequirement = () => {
    onUpdate([...path, 'requirements'], [...subClass.requirements, { id: Date.now().toString(), name: '', description: '', isRequired: true, order: subClass.requirements.length + 1, isVisible: true }]);
  };
  const removeRequirement = (reqIndex: number) => {
    onUpdate([...path, 'requirements'], subClass.requirements.filter((_, i) => i !== reqIndex));
  };

  return (
    <Card className="bg-gray-50/50 border-gray-200">
      <CardHeader className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 flex-1">
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-7 w-7">
              <ChevronsUpDown className="h-4 w-4 text-gray-500" />
            </Button>
            <Badge variant="secondary" className="font-mono bg-gray-200 text-gray-700">{index}</Badge>
            <Input placeholder="Sub-class name" value={subClass.name} onChange={(e) => onUpdate([...path, 'name'], e.target.value)} className="font-semibold" />
            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={subClass.default_display} 
                onCheckedChange={(checked) => onUpdate([...path, 'default_display'], Boolean(checked))} 
                id={`default-display-${path.join('-')}`} 
              />
              <Label htmlFor={`default-display-${path.join('-')}`} className="text-sm text-gray-700">Default Display</Label>
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-2">
            <Badge variant="outline">{subClass.requirements.length} reqs</Badge>
            <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:bg-red-50 h-8 w-8">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0 p-4 space-y-4">
          <div className="space-y-3 pl-12">
            <Textarea placeholder="Sub-class description" value={subClass.description} onChange={(e) => onUpdate([...path, 'description'], e.target.value)} />
            <div className="flex items-center justify-between mb-4">
              <Label className="font-semibold text-gray-700">Requirements</Label>
              <Button variant="outline" size="sm" onClick={addRequirement}>
                <Plus className="h-4 w-4 mr-1" /> Add Requirement
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
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Class Component (for Dialog)
function ClassComponent({
  classItem, onUpdate, onRemove, path, index
}: {
  classItem: ClassForm, onUpdate: (path: string[], value: any) => void, onRemove: () => void, path: string[], index: string
}) {
  const addSubClass = () => {
    onUpdate([...path, 'subClasses'], [...classItem.subClasses, { 
      id: Date.now(), 
      name: '', 
      description: '', 
      order: classItem.subClasses.length + 1, 
      isVisible: true, 
      default_display: true,
      requirements: [] 
    }]);
  };
  const removeSubClass = (subClassIndex: number) => {
    onUpdate([...path, 'subClasses'], classItem.subClasses.filter((_, i) => i !== subClassIndex));
  };
  
  return (
    <Card className="border-l-4 border-blue-500 bg-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <Badge className="text-sm font-mono bg-blue-500 text-white">{index}</Badge>
            <Layers className="h-5 w-5 text-blue-600" />
            <Input placeholder="Class name" value={classItem.name} onChange={(e) => onUpdate([...path, 'name'], e.target.value)} className="flex-1 font-bold text-lg" />
            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={classItem.default_display} 
                onCheckedChange={(checked) => onUpdate([...path, 'default_display'], Boolean(checked))} 
                id={`class-default-display-${path.join('-')}`} 
              />
              <Label htmlFor={`class-default-display-${path.join('-')}`} className="text-sm text-gray-700">Default Display</Label>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Textarea placeholder="Class description" value={classItem.description} onChange={(e) => onUpdate([...path, 'description'], e.target.value)} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-800">Sub-classes</h4>
          <Button variant="outline" size="sm" onClick={addSubClass}>
            <Plus className="h-4 w-4 mr-1" /> Add Sub-class
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
            <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">
              No sub-classes added yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Main Component
export default function Departments() {
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false)
  const [currentDepartmentId, setCurrentDepartmentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  
  // State for managing expanded/collapsed state
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  const [expandedClasses, setExpandedClasses] = useState<{ [key: string]: boolean }>({});
  const [expandedSubClasses, setExpandedSubClasses] = useState<{ [key: string]: boolean }>({});

  const [isOrderChanged, setIsOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [departmentForm, setDepartmentForm] = useState({ 
    name: '', 
    description: '', 
    default_display: true,
    subdepartments: [] as SubdepartmentForm[] 
  })

  // Expand/collapse all departments and their children
  const toggleAllDepartments = (expand: boolean) => {
    const updates = {};
    filteredDepartments.forEach((dept) => {
      updates[dept.id] = expand;

      // Also expand/collapse all subdepartments
      (dept.tm_subdepartments || []).forEach((subdept) => {
        const subdeptKey = `subdept-${subdept.id}`;
        updates[subdeptKey] = expand;

        // Also expand/collapse all classes in subdepartments
        (subdept.classes || []).forEach((cls, clsIndex) => {
          const classId = `class-${subdept.id}-${cls.id || clsIndex}`;
          setExpandedClasses(prev => ({ ...prev, [classId]: expand }));

          // Also expand/collapse all subclasses
          (cls.subClasses || []).forEach((subClass, subClassIndex) => {
            const subClassId = `subclass-${subClass.id || subClassIndex}`;
            setExpandedSubClasses(prev => ({ ...prev, [subClassId]: expand }));
          });
        });
      });
    });
    setExpanded(updates);
  };

  // Data fetching logic
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
        const usersData = await fetchUsers();
        setUsers(usersData);
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

  const handleAddDepartment = () => {
    setCurrentDepartmentId(null);
    setDepartmentForm({
      name: '', 
      description: '',
      default_display: true,
      subdepartments: [{ 
        name: '', 
        description: '', 
        classes: [], 
        taskManagerId: '', 
        taskAssistantIds: [],
        default_display: true 
      }]
    });
    setIsAddDepartmentOpen(true);
  }

  const handleAddSubdepartment = (deptId: string, deptName: string) => {
    setCurrentDepartmentId(deptId);
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
        default_display: true 
      }]
    });
    setIsAddDepartmentOpen(true);
  };

  const handleSaveDepartment = async () => {
    setSaving(true);
    try {
      if (currentDepartmentId) {
        const subdept = departmentForm.subdepartments[0];
        await saveSubdepartmentRequirements(currentDepartmentId, subdept);
      } else {
        await createDepartmentDb(departmentForm);
      }
      toast.success('Saved successfully!');
      setIsAddDepartmentOpen(false);
      await fetchData();
    } catch (error) {
      toast.error('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubdepartment = (deptId: string, subdept: Subdepartment) => {
    setCurrentDepartmentId(deptId);
    setDepartmentForm({
      name: departments.find(d => d.id === deptId)?.name || '',
      description: departments.find(d => d.id === deptId)?.description || '',
      default_display: departments.find(d => d.id === deptId)?.default_display || true,
      subdepartments: [{
        ...subdept,
        taskAssistantIds: subdept.taskAssistants?.map(ta => ta.userId) || [],
      }]
    });
    setIsAddDepartmentOpen(true);
  };

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

  const handleAddClass = (subdeptIndex: number) => {
    const newClass = {
      id: Date.now(),
      name: '',
      description: '',
      order: departmentForm.subdepartments[subdeptIndex].classes.length + 1,
      isVisible: true,
      default_display: true,
      requirements: [],
      subClasses: []
    };
    updateFormState(
      ['subdepartments', subdeptIndex, 'classes'],
      [...departmentForm.subdepartments[subdeptIndex].classes, newClass]
    );
    // Auto-expand the new class
    setExpandedClasses(prev => ({
      ...prev,
      [`class-${newClass.id}`]: true
    }));
  };

  const handleRemoveClass = (subdeptIndex: number, classIndex: number) => {
    updateFormState(
      ['subdepartments', subdeptIndex, 'classes'], 
      departmentForm.subdepartments[subdeptIndex].classes.filter((_, i) => i !== classIndex)
    );
  };

  const handleSubdepartmentChange = (subdeptIndex: number, field: string, value: any) => 
    updateFormState(['subdepartments', subdeptIndex, field], value);

  const handleAddTaskAssistant = (subdeptIndex: number) => 
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], 
      [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds, '']);

  const handleRemoveTaskAssistant = (subdeptIndex: number, assistantIndex: number) => 
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], 
      departmentForm.subdepartments[subdeptIndex].taskAssistantIds.filter((_, i) => i !== assistantIndex));

  const handleTaskAssistantChange = (subdeptIndex: number, assistantIndex: number, userId: string) => {
    const currentIds = [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds];
    currentIds[assistantIndex] = userId;
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], currentIds);
  };

  useEffect(() => {
    if (!isAddDepartmentOpen) {
      setDepartmentForm({ 
        name: '', 
        description: '', 
        default_display: true,
        subdepartments: [] 
      });
      setCurrentDepartmentId(null);
    }
  }, [isAddDepartmentOpen]);

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
              <TableHead className="w-1/3 border-r text-white">Department / Subdepartment</TableHead>
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
                <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                  No departments found.
                </TableCell>
              </TableRow>
            ) : (
              filteredDepartments.map((dept, deptIndex) => (
                <React.Fragment key={dept.id}>
                  <TableRow className="bg-blue-50 font-semibold border-b-2 border-gray-200">
                    <TableCell className="text-center border-r">
                      {deptIndex + 1}
                    </TableCell>
                    <TableCell className="text-base text-gray-800 flex justify-between gap-3 border-r">
                      <div className="flex gap-3">
                        {dept.name}
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
                    <TableCell className="border-r"></TableCell>
                    <TableCell className="border-r"></TableCell>
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
                        <OrderButtons onReorder={handleDepartmentReorder} index={deptIndex} listLength={filteredDepartments.length} disabled={savingOrder} />
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => handleAddSubdepartment(dept.id, dept.name)}
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
                            <UserDetailsPopover userId={subdept.taskManagerId} users={users} role="manager">
                              {getUserName(subdept.taskManagerId)}
                            </UserDetailsPopover>
                          </TableCell>
                          <TableCell className="border-r">
                            {(subdept.taskAssistants || []).length > 0 ? (
                              <div className="flex flex-col space-y-1">
                                {(subdept.taskAssistants || []).map((ta, i) => (
                                  <UserDetailsPopover key={i} userId={ta.userId} users={users} role="assistant">
                                    {getUserName(ta.userId)}
                                  </UserDetailsPopover>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
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
                                onClick={() => handleEditSubdepartment(dept.id, subdept)}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddDepartmentOpen} onOpenChange={setIsAddDepartmentOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl text-gray-800">
              {currentDepartmentId ? 'Edit Subdepartment' : 'Add New Department'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto -mx-6 px-6 py-4 space-y-6">
            <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
              <h3 className="font-semibold text-lg text-gray-800">Department Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="deptName">Name</Label>
                  <Input 
                    id="deptName" 
                    value={departmentForm.name} 
                    onChange={(e) => updateFormState(['name'], e.target.value)} 
                    disabled={!!currentDepartmentId} 
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="deptDesc">Description</Label>
                  <Textarea 
                    id="deptDesc" 
                    value={departmentForm.description} 
                    onChange={(e) => updateFormState(['description'], e.target.value)} 
                    disabled={!!currentDepartmentId} 
                  />
                </div>
              </div>
              {!currentDepartmentId && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    checked={departmentForm.default_display} 
                    onCheckedChange={(checked) => updateFormState(['default_display'], Boolean(checked))} 
                    id="dept-default-display" 
                  />
                  <Label htmlFor="dept-default-display" className="text-sm text-gray-700">
                    Set as Default Display
                  </Label>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-gray-800">Subdepartments</h3>
                {!currentDepartmentId && (
                  <Button onClick={() => handleAddSubdepartment()} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Add
                  </Button>
                )}
              </div>

              {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                <div key={subdeptIndex} className="p-4 border rounded-lg space-y-6 bg-white shadow-sm">
                  <Tabs defaultValue="details">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="details">Details & People</TabsTrigger>
                      <TabsTrigger value="workflow">Workflow Structure</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="pt-6 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <Label>Subdepartment Name</Label>
                          <Input 
                            value={subdept.name} 
                            onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)} 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Description</Label>
                          <Textarea 
                            value={subdept.description} 
                            onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)} 
                          />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          checked={subdept.default_display} 
                          onCheckedChange={(checked) => handleSubdepartmentChange(subdeptIndex, 'default_display', Boolean(checked))} 
                          id={`subdept-default-display-${subdeptIndex}`} 
                        />
                        <Label htmlFor={`subdept-default-display-${subdeptIndex}`} className="text-sm text-gray-700">
                          Set as Default Display
                        </Label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <Label>Task Manager</Label>
                          <Select 
                            value={subdept.taskManagerId || 'none'} 
                            onValueChange={(v) => handleSubdepartmentChange(subdeptIndex, 'taskManagerId', v === 'none' ? '' : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select manager" />
                            </SelectTrigger>
                            <SelectContent>
                              {[<SelectItem value="none">None</SelectItem>, ...users.map(u => 
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              )]}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Task Assistants</Label>
                            <Button variant="outline" size="xs" onClick={() => handleAddTaskAssistant(subdeptIndex)}>
                              <Plus className="h-3 w-3 mr-1" />Add
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {subdept.taskAssistantIds.map((id, assistantIndex) => (
                              <div key={assistantIndex} className="flex items-center gap-2">
                                <Select 
                                  value={id || 'none'} 
                                  onValueChange={(v) => handleTaskAssistantChange(subdeptIndex, assistantIndex, v === 'none' ? '' : v)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select assistant" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[<SelectItem value="none">None</SelectItem>, ...users.map(u => 
                                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    )]}
                                  </SelectContent>
                                </Select>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 shrink-0" 
                                  onClick={() => handleRemoveTaskAssistant(subdeptIndex, assistantIndex)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="workflow" className="pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-800">Classes & Requirements</h4>
                        <Button variant="outline" size="sm" onClick={() => handleAddClass(subdeptIndex)}>
                          <Plus className="h-4 w-4 mr-1" /> Add Class
                        </Button>
                      </div>
                      <div className="space-y-4 bg-gray-50 p-4 rounded-md border">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-700">Classes</h4>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-gray-600 hover:bg-gray-100"
                              onClick={() => {
                                const updates = {};
                                subdept.classes?.forEach((cls, idx) => {
                                  const classId = `class-${subdept.id}-${cls.id || idx}`;
                                  updates[classId] = true;
                                });
                                setExpandedClasses(prev => ({ ...prev, ...updates }));
                              }}
                            >
                              <ChevronDown className="h-3 w-3 mr-1" /> Expand All
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-gray-600 hover:bg-gray-100"
                              onClick={() => {
                                const updates = {};
                                subdept.classes?.forEach((cls, idx) => {
                                  const classId = `class-${subdept.id}-${cls.id || idx}`;
                                  updates[classId] = false;
                                });
                                setExpandedClasses(prev => ({ ...prev, ...updates }));
                              }}
                            >
                              <ChevronUp className="h-3 w-3 mr-1" /> Collapse All
                            </Button>
                          </div>
                        </div>

                        {subdept.classes?.length > 0 ? (
                          <div className="space-y-3">
                            {subdept.classes.map((classItem, classIndex) => {
                              const classId = `class-${subdept.id}-${classItem.id || classIndex}`;
                              const isExpanded = expandedClasses[classId] !== false; // Default to expanded

                              return (
                                <div key={classItem.id || classIndex} className="border rounded-md overflow-hidden bg-white shadow-sm">
                                  <div
                                    className="flex items-center justify-between p-3 border-b cursor-pointer hover:bg-gray-50"
                                    onClick={() => toggleExpansion('class', classId)}
                                  >
                                    <div className="flex items-center">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 mr-2 text-gray-500 hover:bg-transparent"
                                      >
                                        {isExpanded ? (
                                          <Minus className="h-4 w-4" />
                                        ) : (
                                          <Plus className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <div>
                                        <div className="font-medium">
                                          {classItem.name || `Class ${classIndex + 1}`}
                                        </div>
                                        {classItem.description && (
                                          <div className="text-xs text-gray-500 mt-1">
                                            {classItem.description}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-xs text-gray-500">
                                        {classItem.subClasses?.length || 0} subclasses • {classItem.requirements?.length || 0} requirements
                                      </span>
                                    </div>
                                  </div>

                                  {isExpanded && (
                                    <div className="p-4 bg-gray-50 border-t">
                                      <ClassComponent
                                        classItem={classItem}
                                        onUpdate={updateFormState}
                                        onRemove={() => handleRemoveClass(subdeptIndex, classIndex)}
                                        path={['subdepartments', subdeptIndex, 'classes', classIndex]}
                                        index={`${subdeptIndex + 1}.${classIndex + 1}`}
                                      />

                                      {/* Subclasses section */}
                                      {classItem.subClasses?.length > 0 && (
                                        <div className="mt-4 pl-6 border-l-2 border-gray-200">
                                          <div className="flex items-center justify-between mb-2">
                                            <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                                              Subclasses
                                            </h5>
                                          </div>
                                          <div className="space-y-2">
                                            {classItem.subClasses.map((subClass, subClassIndex) => {
                                              const subClassId = `subclass-${subClass.id || subClassIndex}`;
                                              const isSubClassExpanded = expandedSubClasses[subClassId] !== false; // Default to expanded

                                              return (
                                                <div key={subClass.id || subClassIndex} className="border rounded bg-white p-3">
                                                  <div
                                                    className="flex items-center justify-between cursor-pointer"
                                                    onClick={() => toggleExpansion('subclass', subClassId)}
                                                  >
                                                    <div className="flex items-center">
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-5 w-5 mr-2 text-gray-400 hover:bg-transparent"
                                                      >
                                                        {isSubClassExpanded ? (
                                                          <Minus className="h-3 w-3" />
                                                        ) : (
                                                          <Plus className="h-3 w-3" />
                                                        )}
                                                      </Button>
                                                      <span className="text-sm font-medium">
                                                        {subClass.name || `Subclass ${subClassIndex + 1}`}
                                                      </span>
                                                    </div>
                                                    <span className="text-xs text-gray-500">
                                                      {subClass.requirements?.length || 0} requirements
                                                    </span>
                                                  </div>

                                                  {isSubClassExpanded && subClass.requirements?.length > 0 && (
                                                    <div className="mt-2 pl-7 space-y-2">
                                                      <div className="text-xs font-medium text-gray-600 mt-2 mb-1">
                                                        Requirements:
                                                      </div>
                                                      {subClass.requirements.map((req, reqIndex) => (
                                                        <div key={reqIndex} className="text-xs text-gray-600 bg-gray-50 p-2 rounded border">
                                                          {req.name || `Requirement ${reqIndex + 1}`}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg bg-white">
                            <FolderOpen className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                            <p className="text-sm">No classes created yet.</p>
                            <p className="text-xs text-gray-400 mt-1">Click "Add Class" to get started</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsAddDepartmentOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveDepartment} disabled={saving || !departmentForm.name.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} 
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}