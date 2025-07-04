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
import { FolderPlus, Plus, Settings, Users, Clock, AlertTriangle, X, Edit, Loader2, UserPlus, UserCheck, UserX, ChevronDown, Check, Eye, EyeOff, ChevronRight, ChevronUp, Trash2, FileText, Layers, Target, UserIcon, Minus, ChevronsUpDown, Search, FileDown, Workflow, Building } from "lucide-react"
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
            <div className="flex items-center space-x-2"><Checkbox checked={requirement.isVisible} onCheckedChange={(checked) => onUpdate([...path, 'isVisible'], Boolean(checked))} id={`visible-${path.join('-')}`} /><Label htmlFor={`visible-${path.join('-')}`} className="text-sm text-gray-700">Visible</Label></div>
            <div className="flex items-center space-x-2"><Checkbox checked={requirement.isRequired} onCheckedChange={(checked) => onUpdate([...path, 'isRequired'], Boolean(checked))} id={`required-${path.join('-')}`} /><Label htmlFor={`required-${path.join('-')}`} className="text-sm text-gray-700">Required</Label></div>
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
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-7 w-7"><ChevronsUpDown className="h-4 w-4 text-gray-500" /></Button>
            <Badge variant="secondary" className="font-mono bg-gray-200 text-gray-700">{index}</Badge>
            <Input placeholder="Sub-class name" value={subClass.name} onChange={(e) => onUpdate([...path, 'name'], e.target.value)} className="font-semibold" />
          </div>
          <div className="flex items-center space-x-2 ml-2">
            <Badge variant="outline">{subClass.requirements.length} reqs</Badge>
            <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:bg-red-50 h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0 p-4 space-y-4">
          <div className="space-y-3 pl-12">
            <Textarea placeholder="Sub-class description" value={subClass.description} onChange={(e) => onUpdate([...path, 'description'], e.target.value)} />
            <div className="flex items-center justify-between pt-2">
              <Label className="font-semibold text-gray-700">Requirements</Label>
              <Button variant="outline" size="sm" onClick={addRequirement}><Plus className="h-4 w-4 mr-1" /> Add Requirement</Button>
            </div>
            <div className="space-y-3">
              {subClass.requirements.map((req, reqIndex) => (
                <RequirementComponent key={req.id} requirement={req} onUpdate={onUpdate} onRemove={() => removeRequirement(reqIndex)} path={[...path, 'requirements', reqIndex.toString()]} index={`${index}.${reqIndex + 1}`} />
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
    onUpdate([...path, 'subClasses'], [...classItem.subClasses, { id: Date.now(), name: '', description: '', order: classItem.subClasses.length + 1, isVisible: true, requirements: [] }]);
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
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
        </div>
        <Textarea placeholder="Class description" value={classItem.description} onChange={(e) => onUpdate([...path, 'description'], e.target.value)} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-800">Sub-classes</h4>
          <Button variant="outline" size="sm" onClick={addSubClass}><Plus className="h-4 w-4 mr-1" /> Add Sub-class</Button>
        </div>
        <div className="space-y-4">
          {classItem.subClasses.map((subClass, subClassIndex) => (
            <SubClassComponent key={subClass.id} subClass={subClass} onUpdate={onUpdate} onRemove={() => removeSubClass(subClassIndex)} path={[...path, 'subClasses', subClassIndex.toString()]} index={`${index}.${subClassIndex + 1}`} />
          ))}
          {classItem.subClasses.length === 0 && <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">No sub-classes added yet.</div>}
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
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({});
  const [expandedClasses, setExpandedClasses] = useState<{ [key: string]: boolean }>({});
  const [isOrderChanged, setIsOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '', subdepartments: [] as SubdepartmentForm[] })

  // Data fetching logic remains the same
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
  useEffect(() => {
    async function loadInitialData() {
      await fetchData();
      try {
        const usersData = await fetchUsers();
        setUsers(usersData);
      } catch (error) { toast.error('Failed to load users'); }
    }
    loadInitialData();
  }, [])

  // Reordering and state management logic remains the same
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
  const handleDepartmentReorder = (index: number, direction: 'up' | 'down') => setDepartments(prev => handleReorder(prev, index, direction));
  const handleSubdepartmentReorder = (deptIndex: number, subdeptIndex: number, direction: 'up' | 'down') => {
    const newSubdepts = handleReorder(departments[deptIndex].tm_subdepartments, subdeptIndex, direction);
    setDepartments(prev => updateNestedState(prev, [deptIndex, 'tm_subdepartments'], newSubdepts));
  };
  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const deptUpdates = departments.map((dept, index) => ({ id: dept.id, order: index + 1 }));
      const subdeptUpdates = departments.flatMap(dept => (dept.tm_subdepartments || []).map((subdept, index) => ({ id: subdept.id, order: index + 1 })));
      const { error: deptError } = await supabase.from('tm_departments').upsert(deptUpdates);
      if (deptError) throw deptError;
      const { error: subdeptError } = await supabase.from('tm_subdepartments').upsert(subdeptUpdates);
      if (subdeptError) throw subdeptError;
      toast.success("Order saved successfully!");
      setIsOrderChanged(false);
    } catch (error) {
      console.error("Failed to save order", error);
      toast.error("Could not save the new order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const toggleExpansion = (type: 'dept' | 'class' | 'subclass', id: string) => {
    if (type === 'dept') {
      setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    } else if (type === 'class') {
      setExpandedClasses(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  const expandAll = () => {
    const allExpanded = {};
    departments.forEach(dept => { 
      allExpanded[dept.id] = true;
      (dept.tm_subdepartments || []).forEach(subdept => {
        allExpanded[`class-${subdept.id}`] = true;
      });
    });
    setExpanded(allExpanded);
    setExpandedClasses(allExpanded);
  };

  const collapseAll = () => {
    setExpanded({});
    setExpandedClasses({});
  };

  const areAllExpanded = departments.length > 0 && 
    departments.every(dept => expanded[dept.id]) &&
    departments.every(dept => 
      (dept.tm_subdepartments || []).every(subdept => 
        expandedClasses[`class-${subdept.id}`]
      )
    );

  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dept.tm_subdepartments || []).some(subdept => subdept.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const updateFormState = (path: string[], value: any) => setDepartmentForm(prevState => updateNestedState(prevState, path, value));

  const handleAddDepartment = () => {
    setCurrentDepartmentId(null);
    setDepartmentForm({
      name: '', description: '',
      subdepartments: [{ name: '', description: '', classes: [], taskManagerId: '', taskAssistantIds: [] }]
    });
    setIsAddDepartmentOpen(true);
  }

  const handleAddSubdepartment = (deptId: string, deptName: string) => {
    setCurrentDepartmentId(deptId);
    setDepartmentForm({
      name: deptName, description: '',
      subdepartments: [{ name: '', description: '', classes: [], taskManagerId: '', taskAssistantIds: [] }]
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
    updateFormState(['subdepartments', subdeptIndex, 'classes'], [...departmentForm.subdepartments[subdeptIndex].classes, { id: Date.now(), name: '', description: '', order: departmentForm.subdepartments[subdeptIndex].classes.length + 1, isVisible: true, requirements: [], subClasses: [] }]);
  };
  const handleRemoveClass = (subdeptIndex: number, classIndex: number) => {
    updateFormState(['subdepartments', subdeptIndex, 'classes'], departmentForm.subdepartments[subdeptIndex].classes.filter((_, i) => i !== classIndex));
  };
  const handleSubdepartmentChange = (subdeptIndex: number, field: string, value: any) => updateFormState(['subdepartments', subdeptIndex, field], value);
  const handleAddTaskAssistant = (subdeptIndex: number) => updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds, '']);
  const handleRemoveTaskAssistant = (subdeptIndex: number, assistantIndex: number) => updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], departmentForm.subdepartments[subdeptIndex].taskAssistantIds.filter((_, i) => i !== assistantIndex));
  const handleTaskAssistantChange = (subdeptIndex: number, assistantIndex: number, userId: string) => {
    const currentIds = [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds];
    currentIds[assistantIndex] = userId;
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], currentIds);
  };

  useEffect(() => {
    if (!isAddDepartmentOpen) {
      setDepartmentForm({ name: '', description: '', subdepartments: [] });
      setCurrentDepartmentId(null);
    }
  }, [isAddDepartmentOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /><span className="ml-3 text-lg text-gray-600">Loading Departments...</span></div>
    );
  }

  const OrderButtons = ({ onReorder, index, listLength, disabled = false }) => (
    <div className="flex flex-col -space-y-1.5">
      <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-gray-700" disabled={disabled || index === 0} onClick={() => onReorder(index, 'up')}><ChevronUp className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-gray-700" disabled={disabled || index === listLength - 1} onClick={() => onReorder(index, 'down')}><ChevronDown className="h-4 w-4" /></Button>
    </div>
  );

  return (
    <div className="flex-1 space-y-6 p-2 md:p-4 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center"><Building className="h-8 w-8 mr-3 text-blue-600" /> Departments & Workflows</h1>
          <p className="text-gray-500 mt-1">Manage all company departments and their structures.</p>
        </div>
        <div className="flex items-center space-x-2">
          {isOrderChanged && <Button onClick={handleSaveOrder} disabled={savingOrder}><Loader2 className={`mr-2 h-4 w-4 ${savingOrder ? 'animate-spin' : 'hidden'}`} />Save Order</Button>}
          <Button onClick={handleAddDepartment} className="bg-blue-600 hover:bg-blue-700 text-white"><FolderPlus className="mr-2 h-5 w-5" /> Add Department</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-72"><Input placeholder="Search departments..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" /><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /></div>
            <div className="flex items-center gap-2"><Button variant="outline" onClick={areAllExpanded ? collapseAll : expandAll} size="sm"><ChevronsUpDown className="mr-2 h-4 w-4" /> {areAllExpanded ? 'Collapse All' : 'Expand All'}</Button></div>
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
              <TableHead className="w-[180px] border-r text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-gray-500">No departments found.</TableCell></TableRow>
            ) : (
              filteredDepartments.map((dept, deptIndex) => (
                <React.Fragment key={dept.id}>
                  <TableRow className="bg-blue-50 font-semibold border-b-2 border-gray-200">
                    <TableCell className="text-center">
                      {deptIndex + 1}
                    </TableCell>
                    <TableCell className="text-base text-gray-800 flex items-center gap-3">
                      <div className="flex gap-2">
                        {dept.name}
                        <Badge variant="secondary">{(dept.tm_subdepartments || []).length} subs</Badge>
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
                    <TableCell colSpan={3}></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <OrderButtons onReorder={handleDepartmentReorder} index={deptIndex} listLength={filteredDepartments.length} disabled={savingOrder} />
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleAddSubdepartment(dept.id, dept.name)}><Plus className="h-4 w-4 mr-1" /> Add Sub</Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {expanded[dept.id] && (dept.tm_subdepartments || []).map((subdept, subdeptIndex) => (
                    <TableRow key={subdept.id} className="hover:bg-gray-50/50">
                      <TableCell></TableCell>
                      <TableCell className="pl-12">
                        <div className="flex items-center gap-3 font-medium text-gray-700"><Workflow className="h-5 w-5 text-blue-500" />{subdept.name}</div>
                        {subdept.description && <div className="pl-8 text-sm text-gray-500 mt-1">{subdept.description}</div>}
                      </TableCell>
                      <TableCell>
                        <UserDetailsPopover userId={subdept.taskManagerId} users={users} role="manager">{getUserName(subdept.taskManagerId)}</UserDetailsPopover>
                      </TableCell>
                      <TableCell>
                        {(subdept.taskAssistants || []).length > 0 ? (
                          <div className="flex flex-col space-y-1">{(subdept.taskAssistants || []).map((ta, i) => <UserDetailsPopover key={i} userId={ta.userId} users={users} role="assistant">{getUserName(ta.userId)}</UserDetailsPopover>)}</div>
                        ) : <span className="text-gray-400">None</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{subdept.classes?.length || 0} Classes</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <OrderButtons onReorder={(idx, dir) => handleSubdepartmentReorder(deptIndex, idx, dir)} index={subdeptIndex} listLength={(dept.tm_subdepartments || []).length} disabled={savingOrder} />
                          <Button variant="outline" size="icon" onClick={() => handleEditSubdepartment(dept.id, subdept)} title="Edit" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => handleDeleteSubdepartment(subdept.id)} title="Delete" className="h-8 w-8 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddDepartmentOpen} onOpenChange={setIsAddDepartmentOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl text-gray-800">{currentDepartmentId ? 'Edit Subdepartment' : 'Add New Department'}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto -mx-6 px-6 py-4 space-y-6">
            <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
              <h3 className="font-semibold text-lg text-gray-800">Department Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="deptName">Name</Label>
                  <Input id="deptName" value={departmentForm.name} onChange={(e) => updateFormState(['name'], e.target.value)} disabled={!!currentDepartmentId} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="deptDesc">Description</Label>
                  <Textarea id="deptDesc" value={departmentForm.description} onChange={(e) => updateFormState(['description'], e.target.value)} disabled={!!currentDepartmentId} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-gray-800">Subdepartments</h3>
                {!currentDepartmentId && <Button onClick={() => handleAddSubdepartment()} variant="outline" size="sm"><Plus className="h-4 w-4 mr-2" /> Add</Button>}
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
                        <div className="space-y-1"><Label>Subdepartment Name</Label><Input value={subdept.name} onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)} /></div>
                        <div className="space-y-1"><Label>Description</Label><Textarea value={subdept.description} onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)} /></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1"><Label>Task Manager</Label><Select value={subdept.taskManagerId || 'none'} onValueChange={(v) => handleSubdepartmentChange(subdeptIndex, 'taskManagerId', v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger><SelectContent>{[<SelectItem value="none">None</SelectItem>, ...users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)]}</SelectContent></Select></div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between"><Label>Task Assistants</Label><Button variant="outline" size="xs" onClick={() => handleAddTaskAssistant(subdeptIndex)}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                          <div className="space-y-2">{subdept.taskAssistantIds.map((id, assistantIndex) => (<div key={assistantIndex} className="flex items-center gap-2"><Select value={id || 'none'} onValueChange={(v) => handleTaskAssistantChange(subdeptIndex, assistantIndex, v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="Select assistant" /></SelectTrigger><SelectContent>{[<SelectItem value="none">None</SelectItem>, ...users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)]}</SelectContent></Select><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleRemoveTaskAssistant(subdeptIndex, assistantIndex)}><X className="h-4 w-4" /></Button></div>))}</div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="workflow" className="pt-6 space-y-4">
                      <div className="flex items-center justify-between"><h4 className="font-semibold text-gray-800">Classes & Requirements</h4><Button variant="outline" size="sm" onClick={() => handleAddClass(subdeptIndex)}><Plus className="h-4 w-4 mr-1" /> Add Class</Button></div>
                      <div className="space-y-4 bg-gray-50 p-4 rounded-md border">
                        {subdept.classes.map((classItem, classIndex) => {
                          const classId = `class-${subdept.id}-${classItem.id}`;
                          const isExpanded = expandedClasses[classId] !== false; // Default to expanded
                          
                          return (
                            <div key={classItem.id} className="border rounded-md overflow-hidden">
                              <div 
                                className="flex items-center bg-white p-3 border-b cursor-pointer hover:bg-gray-50"
                                onClick={() => toggleExpansion('class', classId)}
                              >
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 mr-2 text-gray-500 hover:bg-transparent"
                                >
                                  {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                </Button>
                                <span className="font-medium">{classItem.name || `Class ${classIndex + 1}`}</span>
                              </div>
                              
                              {isExpanded && (
                                <div className="p-4 bg-gray-50">
                                  <ClassComponent 
                                    classItem={classItem} 
                                    onUpdate={updateFormState} 
                                    onRemove={() => handleRemoveClass(subdeptIndex, classIndex)} 
                                    path={['subdepartments', subdeptIndex, 'classes', classIndex]} 
                                    index={`${subdeptIndex + 1}.${classIndex + 1}`} 
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {subdept.classes.length === 0 && (
                          <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                            No classes created yet. Click "Add Class" to begin.
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
            <Button variant="outline" onClick={() => setIsAddDepartmentOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveDepartment} disabled={saving || !departmentForm.name.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}