// @ts-nocheck
"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs" // ⭐ NEW: Import Tabs
import { ChevronDown, ChevronUp, Plus, Trash2, Layers, User as UserIcon, ChevronsUpDown, FolderPlus, Edit, Building, Workflow, Loader2, Shield, X, BoxSelect, Calendar, Users, FileText } from "lucide-react"

import { Department, Subdepartment, Class, SubClass, Requirement, SubdepartmentForm, ClassForm, SubClassForm, RequirementForm, User, DepartmentForm } from "../database"
import { updateNestedState } from "../page"

// Helper function for hierarchical numbering
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

// Requirement Component
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

// SubClass Component
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

// Class Component
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

// Updated DepartmentDialog with multi-officer management at subdepartment level only
interface DepartmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  departmentForm: DepartmentForm
  setDepartmentForm: React.Dispatch<React.SetStateAction<DepartmentForm>>
  users: User[]
  officers: User[]
  editingDepartmentId?: string | null
  editingSubdepartmentId?: string | null
  isSaving: boolean
}

export default function DepartmentDialog({
  open,
  onOpenChange,
  onSave,
  departmentForm,
  setDepartmentForm,
  users,
  officers = [],
  editingDepartmentId,
  editingSubdepartmentId,
  isSaving
}: DepartmentDialogProps) {
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const updateFormState = (path: string[], value: any) => 
    setDepartmentForm(prevState => updateNestedState(prevState, path, value));

  const isCreatingNewDepartment = !editingDepartmentId && !editingSubdepartmentId;
  const isEditingDepartment = editingDepartmentId && !editingSubdepartmentId && departmentForm.subdepartments.length === 0;
  const isCreatingSubdepartment = editingDepartmentId && !editingSubdepartmentId && departmentForm.subdepartments.length > 0;
  const isEditingSubdepartment = editingSubdepartmentId;

  const getDialogTitle = () => {
    if (isCreatingNewDepartment) return 'Add New Department';
    if (isEditingDepartment) return 'Edit Department';
    if (isCreatingSubdepartment) return 'Add Subdepartment';
    if (isEditingSubdepartment) return 'Edit Subdepartment';
    return 'Department Management';
  };

  const getDialogDescription = () => {
    if (isCreatingNewDepartment) return 'Create a new department with its structure';
    if (isEditingDepartment) return 'Edit department details';
    if (isCreatingSubdepartment) return `Add a new subdepartment to ${departmentForm.name}`;
    if (isEditingSubdepartment) return `Edit subdepartment details`;
    return 'Manage department structure';
  };

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
    updateFormState(['subdepartments', subdeptIndex, 'classes'], [...departmentForm.subdepartments[subdeptIndex].classes, newClass]);
  };

  const handleRemoveClass = (subdeptIndex: number, classIndex: number) => {
    updateFormState(['subdepartments', subdeptIndex, 'classes'], departmentForm.subdepartments[subdeptIndex].classes.filter((_, i) => i !== classIndex));
  };
  
  const handleSubdepartmentChange = (subdeptIndex: number, field: string, value: any) => updateFormState(['subdepartments', subdeptIndex, field], value);

  // ⭐ START: New and updated role management functions
  const createNewAssignment = (id: string, managerId?: string) => {
    const assignment = {
      id,
      start_date: new Date().toISOString().split('T')[0],
      end_date: ''
    };
    
    if (managerId) {
      return { ...assignment, manager_id: managerId };
    }
    return assignment;
  };

  const handleAddRoleAssignment = (subdeptIndex: number, role: 'officers' | 'taskManagers' | 'taskAssistants', userId: string) => {
    if (!userId || userId === 'none') return;
    const currentAssignments = departmentForm.subdepartments[subdeptIndex][role] || [];
    if (currentAssignments.some(a => a.id === userId)) return;
    updateFormState(['subdepartments', subdeptIndex, role], [...currentAssignments, createNewAssignment(userId)]);
  };

  const handleRemoveRoleAssignment = (subdeptIndex: number, role: 'officers' | 'taskManagers' | 'taskAssistants', assignmentIndex: number) => {
    const currentAssignments = departmentForm.subdepartments[subdeptIndex][role] || [];
    updateFormState(['subdepartments', subdeptIndex, role], currentAssignments.filter((_, index) => index !== assignmentIndex));
  };

  const handleAssignmentChange = (subdeptIndex: number, role: 'taskAssistants', assignmentIndex: number, field: 'id' | 'start_date' | 'end_date' | 'manager_id', value: string) => {
    const currentAssignments = [...(departmentForm.subdepartments[subdeptIndex][role] || [])];
    currentAssignments[assignmentIndex] = { ...currentAssignments[assignmentIndex], [field]: value };
    updateFormState(['subdepartments', subdeptIndex, role], currentAssignments);
  };
  
  const handleAssignmentDateChange = (subdeptIndex: number, role: 'officers' | 'taskManagers', assignmentIndex: number, field: 'start_date' | 'end_date', value: string) => {
    const currentAssignments = [...(departmentForm.subdepartments[subdeptIndex][role] || [])];
    currentAssignments[assignmentIndex] = { ...currentAssignments[assignmentIndex], [field]: value };
    updateFormState(['subdepartments', subdeptIndex, role], currentAssignments);
  };

  const getAvailableUsersForRole = (subdeptIndex: number, role: 'officers' | 'taskManagers' | 'taskAssistants') => {
    const assignedIds = departmentForm.subdepartments[subdeptIndex][role]?.map(a => a.id) || [];
    const sourceList = role === 'officers' ? officers : users;
    return sourceList.filter(user => !assignedIds.includes(user.id));
  };

  const handleAddBlankTaskAssistant = (subdeptIndex: number, managerId: string, userId: string) => {
    if (!managerId || !userId) return;
    
    const currentAssistants = departmentForm.subdepartments[subdeptIndex].taskAssistants || [];
    updateFormState(
      ['subdepartments', subdeptIndex, 'taskAssistants'], 
      [...currentAssistants, createNewAssignment(userId, managerId)]
    );
  };
  // ⭐ END: New and updated role management functions

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[calc(100vh-10rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCreatingNewDepartment && <FolderPlus className="h-5 w-5 text-blue-600" />}
            {isEditingDepartment && <Edit className="h-5 w-5 text-blue-600" />}
            {isCreatingSubdepartment && <Plus className="h-5 w-5 text-blue-600" />}
            {isEditingSubdepartment && <Edit className="h-5 w-5 text-blue-600" />}
            {getDialogTitle()}
          </DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 overflow-y-auto p-1">
          {(isCreatingNewDepartment || isEditingDepartment) && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border">
              <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2"><Building className="h-5 w-5" />Department Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="department-name">Department Name *</Label>
                  <Input id="department-name" placeholder="Enter department name" value={departmentForm.name} onChange={(e) => updateFormState(['name'], e.target.value)} disabled={isEditingDepartment && editingDepartmentId !== null} className="font-medium" />
                </div>
                <div>
                  <Label htmlFor="department-description">Department Description</Label>
                  <Textarea id="department-description" placeholder="Enter department description" value={departmentForm.description} onChange={(e) => updateFormState(['description'], e.target.value)} className="min-h-[80px]" />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox checked={departmentForm.default_display} onCheckedChange={(checked) => updateFormState(['default_display'], Boolean(checked))} id="dept-default-display" />
                <Label htmlFor="dept-default-display" className="text-sm text-gray-700">Default Display</Label>
              </div>
            </div>
          )}

          {departmentForm.subdepartments.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Workflow className="h-5 w-5 text-blue-600" />{isCreatingSubdepartment || isEditingSubdepartment ? 'Subdepartment Details' : 'Subdepartments'}</h3>
                {isCreatingNewDepartment && (
                  <Button variant="outline" size="sm" onClick={() => updateFormState(['subdepartments'], [...departmentForm.subdepartments, { name: '', description: '', classes: [], officers: [], taskManagers: [], taskAssistants: [], default_display: true }])}>
                    <Plus className="h-4 w-4 mr-1" /> Add Subdepartment
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                  <Card key={subdeptIndex} className="bg-gray-50 overflow-hidden">
                    <Tabs defaultValue="details" className="w-full">
                      <CardHeader className="bg-white border-b">
                         <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="font-mono bg-gray-200 text-gray-700">{subdeptIndex + 1}</Badge>
                             <Input placeholder="Enter subdepartment name" value={subdept.name} onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)} className="flex-1 font-semibold text-lg" />
                         </div>
                        <TabsList className="grid w-full grid-cols-3 mt-2">
                           <TabsTrigger value="details"><FileText className="h-4 w-4 mr-2"/>Details</TabsTrigger>
                           <TabsTrigger value="roles"><Users className="h-4 w-4 mr-2"/>Role Assignments</TabsTrigger>
                           <TabsTrigger value="classes"><Layers className="h-4 w-4 mr-2"/>Classes</TabsTrigger>
                        </TabsList>
                      </CardHeader>
                      <CardContent className="p-0">
                        <TabsContent value="details" className="p-6 space-y-4">
                            <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">Basic Information</h4>
                            <div>
                                <Label htmlFor={`subdept-desc-${subdeptIndex}`}>Description</Label>
                                <Textarea id={`subdept-desc-${subdeptIndex}`} placeholder="Enter subdepartment description" value={subdept.description} onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)} className="min-h-[100px]" />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox checked={subdept.default_display} onCheckedChange={(checked) => handleSubdepartmentChange(subdeptIndex, 'default_display', Boolean(checked))} id={`subdept-default-display-${subdeptIndex}`} />
                                <Label htmlFor={`subdept-default-display-${subdeptIndex}`} className="text-sm text-gray-700">Default Display</Label>
                            </div>
                        </TabsContent>

                        <TabsContent value="roles" className="p-6 space-y-6">
                            {[{
                                title: "Officer", role: 'officers', icon: Shield, color: 'purple', source: officers, filter: (user) => true, badge: (user) => null
                            }, {
                                title: "Task Managers", role: 'taskManagers', icon: UserIcon, color: 'blue', source: users, filter: (user) => ['task_manager', 'admin', 'user'].includes(user.role), badge: (user) => user.role === 'task_manager' ? 'Manager' : user.role === 'admin' ? 'Admin' : 'User'
                            }].map(roleConfig => (
                                <div key={roleConfig.role} className={`space-y-4 p-4 border-l-4 border-${roleConfig.color}-500 bg-${roleConfig.color}-50/30 rounded-r-lg`}>
                                    <div className="flex items-center justify-between">
                                        <Label className={`text-sm font-medium text-${roleConfig.color}-700 flex items-center gap-2`}><roleConfig.icon className="h-4 w-4"/>{roleConfig.title}</Label>
                                        <Select onValueChange={(value) => handleAddRoleAssignment(subdeptIndex, roleConfig.role, value)}>
                                            <SelectTrigger className="w-48"><SelectValue placeholder={`Add ${roleConfig.title.slice(0, -1)}...`} /></SelectTrigger>
                                            <SelectContent>
                                                {getAvailableUsersForRole(subdeptIndex, roleConfig.role).filter(roleConfig.filter).map((user) => (
                                                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                                                ))}
                                                {getAvailableUsersForRole(subdeptIndex, roleConfig.role).filter(roleConfig.filter).length === 0 && (<SelectItem value="none" disabled>All eligible users assigned</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-3 max-h-64 overflow-y-auto border rounded-md bg-white p-2">
                                        {(subdept[roleConfig.role] || []).map((assignment, index) => {
                                            const userData = roleConfig.source.find(u => u.id === assignment.id);
                                            return userData ? (
                                                <div key={`${assignment.id}-${index}`} className="p-3 border-b last:border-b-0 hover:bg-gray-50 rounded-md">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-3">
                                                            <roleConfig.icon className={`h-5 w-5 text-${roleConfig.color}-600 flex-shrink-0`} />
                                                            <div>
                                                                <p className="font-medium text-gray-900">{userData.name}</p>
                                                                <p className="text-sm text-gray-500">{userData.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant={assignment.end_date ? "secondary" : "default"} className={assignment.end_date ? "bg-gray-500" : "bg-green-500"}>{assignment.end_date ? 'Past' : 'Active'}</Badge>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleRemoveRoleAssignment(subdeptIndex, roleConfig.role, index)}><X className="h-4 w-4" /></Button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                                        <div>
                                                            <Label className="text-xs font-medium text-gray-600 flex items-center gap-1"><Calendar className="h-3 w-3"/>Start Date *</Label>
                                                            <Input type="date" value={assignment.start_date || ''} onChange={(e) => handleAssignmentDateChange(subdeptIndex, roleConfig.role, index, 'start_date', e.target.value)} className="text-sm mt-1" required/>
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs font-medium text-gray-600 flex items-center gap-1"><Calendar className="h-3 w-3"/>End Date (Optional)</Label>
                                                            <Input type="date" value={assignment.end_date || ''} onChange={(e) => handleAssignmentDateChange(subdeptIndex, roleConfig.role, index, 'end_date', e.target.value)} className="text-sm mt-1" min={assignment.start_date} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null;
                                        })}
                                        {(subdept[roleConfig.role] || []).length === 0 && (<div className="p-6 text-center text-gray-500"><p className="text-sm">No users assigned to this role</p></div>)}
                                    </div>
                                </div>
                            ))}
                            {/* Task Assistants - grouped by manager */}
                            <div className={`space-y-4 p-4 border-l-4 border-green-500 bg-green-50/30 rounded-r-lg`}>
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium text-green-700 flex items-center gap-2">
                                        <UserIcon className="h-4 w-4"/>Task Assistants
                                    </Label>
                                    <Select 
                                        onValueChange={(managerId) => {
                                            setSelectedManagerId(managerId === 'none' ? '' : managerId);
                                        }}
                                        value={selectedManagerId}
                                    >
                                        <SelectTrigger className="w-48">
                                            <SelectValue placeholder="Select Manager" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Select Manager</SelectItem>
                                            {subdept.taskManagers?.map((manager) => {
                                                const managerUser = users.find(u => u.id === manager.id);
                                                return managerUser ? (
                                                    <SelectItem key={`select-manager-${manager.id}`} value={manager.id}>
                                                        {managerUser.name}
                                                    </SelectItem>
                                                ) : null;
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                {selectedManagerId && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-medium text-green-700">Add Assistant</Label>
                                            <Select 
                                                onValueChange={(userId) => {
                                                    if (userId && userId !== 'none') {
                                                        handleAddBlankTaskAssistant(subdeptIndex, selectedManagerId, userId);
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="w-48">
                                                    <SelectValue placeholder="Select Assistant" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Select Assistant</SelectItem>
                                                    {getAvailableUsersForRole(subdeptIndex, 'taskAssistants')
                                                        .filter(user => ['assistant', 'user'].includes(user.role))
                                                        .map((user) => (
                                                            <SelectItem key={`assistant-${user.id}`} value={user.id}>
                                                                {user.name}
                                                            </SelectItem>
                                                        ))
                                                    }
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="space-y-4 max-h-64 overflow-y-auto border rounded-md bg-white p-2">
                                    {subdept.taskManagers?.length > 0 ? (
                                        subdept.taskManagers.map((manager) => {
                                            const managerUser = users.find(u => u.id === manager.id);
                                            const managerAssistants = (subdept.taskAssistants || []).filter(
                                                a => a.manager_id === manager.id
                                            );
                                            
                                            return (
                                                <div key={`manager-assistants-${manager.id}`} className="mb-6">
                                                    <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 rounded">
                                                        <UserIcon className="h-4 w-4 text-blue-600" />
                                                        <span className="font-medium text-sm text-blue-800">
                                                            {managerUser?.name || 'Manager'}'s Assistants
                                                        </span>
                                                        <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-700">
                                                            {managerAssistants.length} assistant{managerAssistants.length !== 1 ? 's' : ''}
                                                        </Badge>
                                                    </div>
                                                    
                                                    {managerAssistants.length > 0 ? (
                                                        <div className="space-y-2 ml-4">
                                                            {managerAssistants.map((assistant, index) => {
                                                                const assistantUser = users.find(u => u.id === assistant.id);
                                                                const assistantIndex = subdept.taskAssistants.findIndex(a => a.id === assistant.id);
                                                                
                                                                return assistantUser && assistantIndex >= 0 ? (
                                                                    <div key={assistant.id} className="p-2 border rounded hover:bg-gray-50">
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <div className="flex items-center gap-2">
                                                                                <UserIcon className="h-4 w-4 text-gray-500" />
                                                                                <span className="text-sm font-medium">{assistantUser.name}</span>
                                                                            </div>
                                                                            <Button 
                                                                                variant="ghost" 
                                                                                size="icon" 
                                                                                className="h-6 w-6 text-red-500 hover:bg-red-50"
                                                                                onClick={() => handleRemoveRoleAssignment(subdeptIndex, 'taskAssistants', assistantIndex)}
                                                                            >
                                                                                <X className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mt-1">
                                                                            <div>
                                                                                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                                                                                    <Calendar className="h-3 w-3"/>Start Date
                                                                                </Label>
                                                                                <Input 
                                                                                    type="date" 
                                                                                    value={assistant.start_date || ''} 
                                                                                    onChange={(e) => handleAssignmentChange(subdeptIndex, 'taskAssistants', assistantIndex, 'start_date', e.target.value)}
                                                                                    className="h-8 text-xs"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                                                                                    <Calendar className="h-3 w-3"/>End Date
                                                                                </Label>
                                                                                <Input 
                                                                                    type="date" 
                                                                                    value={assistant.end_date || ''} 
                                                                                    onChange={(e) => handleAssignmentChange(subdeptIndex, 'taskAssistants', assistantIndex, 'end_date', e.target.value)}
                                                                                    min={assistant.start_date}
                                                                                    className="h-8 text-xs"
                                                                                />
                                                                            </div>
                                                                            <div className="col-span-2">
                                                                                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                                                                                    <User className="h-3 w-3"/>Manager
                                                                                </Label>
                                                                                <Select 
                                                                                    value={assistant.manager_id || ''} 
                                                                                    onValueChange={(value) => handleAssignmentChange(subdeptIndex, 'taskAssistants', assistantIndex, 'manager_id', value)}
                                                                                >
                                                                                    <SelectTrigger className="h-8 text-xs">
                                                                                        <SelectValue placeholder="Select Manager" />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        {subdept.taskManagers?.map((mgr) => {
                                                                                            const mgrUser = users.find(u => u.id === mgr.id);
                                                                                            return mgrUser ? (
                                                                                                <SelectItem key={`mgr-${mgr.id}`} value={mgr.id}>
                                                                                                    {mgrUser.name}
                                                                                                </SelectItem>
                                                                                            ) : null;
                                                                                        })}
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </div>
                                                                            <div>
                                                                                <span className="font-medium">Start:</span> {assistant.start_date || 'Not set'}
                                                                            </div>
                                                                            <div>
                                                                                <span className="font-medium">End:</span> {assistant.end_date || 'Not set'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : null;
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-500 ml-4 mb-2">No assistants assigned to this manager</p>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-4 text-center text-gray-500">
                                            <p className="text-sm">No managers assigned. Please add a manager first.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="classes" className="p-6 space-y-4">
                           <div className="flex items-center justify-between">
                               <h4 className="font-semibold text-gray-800">Classes</h4>
                               <Button variant="outline" size="sm" onClick={() => handleAddClass(subdeptIndex)}><Plus className="h-4 w-4 mr-1"/>Add Class</Button>
                           </div>
                           <div className="space-y-4">
                               {subdept.classes && subdept.classes.length > 0 ? (
                                   subdept.classes.map((cls, clsIndex) => (
                                       <ClassComponent key={cls.id} classItem={cls} onUpdate={updateFormState} onRemove={() => handleRemoveClass(subdeptIndex, clsIndex)} path={['subdepartments', subdeptIndex.toString(), 'classes', clsIndex.toString()]} index={`${subdeptIndex + 1}.${clsIndex + 1}`} />
                                   ))
                               ) : (<div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">No classes added yet.</div>)}
                           </div>
                        </TabsContent>
                      </CardContent>
                    </Tabs>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {isCreatingNewDepartment && departmentForm.subdepartments.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-gray-50">
              <Workflow className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">This department doesn't have any subdepartments yet.</p>
              <Button variant="outline" onClick={() => updateFormState(['subdepartments'], [{ name: '', description: '', classes: [], officers: [], taskManagers: [], taskAssistants: [], default_display: true }])}>
                <Plus className="h-4 w-4 mr-1" /> Add First Subdepartment
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreatingNewDepartment || isCreatingSubdepartment ? 'Create' : 'Update'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}