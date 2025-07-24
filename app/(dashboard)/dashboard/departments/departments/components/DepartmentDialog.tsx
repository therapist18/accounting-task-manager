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
import { ChevronDown, ChevronUp, Plus, Trash2, Layers, UserIcon, ChevronsUpDown, FolderPlus, Edit, Building, Workflow, Loader2, Shield, X, BoxSelect, Users, CheckSquare, Square } from "lucide-react"

// Note: The following types are assumed to have been updated in the database definitions.
// Officers are now managed at subdepartment level only
interface OfficerHistory {
  id: string;
  start_date: string;
  end_date?: string;
}

interface EnhancedSubdepartmentForm extends SubdepartmentForm {
  officer_history?: OfficerHistory[];
  officers?: Array<{
    id: string;
    start_date: string;
    end_date?: string;
  }>;
}

interface EnhancedDepartmentForm extends DepartmentForm {
  subdepartments: EnhancedSubdepartmentForm[];
}

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

// MultiSelect Component for selecting multiple users
function MultiSelect({ 
  users, 
  selectedIds, 
  onSelectionChange, 
  placeholder = "Select users...",
  role,
  disabled = false 
}: {
  users: User[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder?: string;
  role: 'officer' | 'assistant';
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const roleConfig = {
    officer: {
      icon: Shield,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      label: 'Officer'
    },
    assistant: {
      icon: Users,
      color: 'text-green-600', 
      bgColor: 'bg-green-100',
      label: 'Assistant'
    }
  };

  const config = roleConfig[role];
  const Icon = config.icon;

  const toggleUser = (userId: string) => {
    if (selectedIds.includes(userId)) {
      onSelectionChange(selectedIds.filter(id => id !== userId));
    } else {
      onSelectionChange([...selectedIds, userId]);
    }
  };

  const selectedUsers = users.filter(user => selectedIds.includes(user.id));
  const availableUsers = users.filter(user => !selectedIds.includes(user.id));

  return (
    <div className="space-y-2">
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full justify-between h-10"
        >
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${config.color}`} />
            <span className="text-sm">
              {selectedIds.length > 0 
                ? `${selectedIds.length} ${config.label}${selectedIds.length > 1 ? 's' : ''} selected`
                : placeholder
              }
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 mb-2">Available {config.label}s</div>
              {availableUsers.length > 0 ? (
                <div className="space-y-1">
                  {availableUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      onClick={() => toggleUser(user.id)}
                    >
                      <Square className="h-4 w-4 text-gray-400" />
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {user.role === 'task_manager' ? 'Manager' : 
                         user.role === 'task_assistant' ? 'Assistant' :
                         user.role === 'officer' ? 'Officer' :
                         user.role === 'admin' ? 'Admin' : 'User'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No available {config.label}s found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Users Display */}
      {selectedUsers.length > 0 && (
        <div className="space-y-2 max-h-32 overflow-y-auto">
          <div className="text-xs font-medium text-gray-500">Selected {config.label}s</div>
          <div className="space-y-1">
            {selectedUsers.map((user) => (
              <div key={user.id} className={`flex items-center justify-between p-2 rounded border ${config.bgColor}`}>
                <div className="flex items-center gap-2">
                  <CheckSquare className={`h-4 w-4 ${config.color}`} />
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <div>
                    <div className="font-medium text-sm">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleUser(user.id)}
                  className="h-6 w-6 text-red-500 hover:bg-red-50"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

// Enhanced Role Management Component
function RoleManagementSection({ 
  subdept, 
  subdeptIndex, 
  users, 
  officers, 
  onSubdepartmentChange,
  updateFormState 
}: {
  subdept: EnhancedSubdepartmentForm;
  subdeptIndex: number;
  users: User[];
  officers: User[];
  onSubdepartmentChange: (index: number, field: string, value: any) => void;
  updateFormState: (path: string[], value: any) => void;
}) {
  
  // Handle officer selection change
  const handleOfficerSelectionChange = (selectedIds: string[]) => {
    const currentOfficers = subdept.officers || [];
    const currentOfficerIds = currentOfficers.map(o => o.id);
    
    // Find newly added officers
    const newOfficerIds = selectedIds.filter(id => !currentOfficerIds.includes(id));
    
    // Find removed officers  
    const removedOfficerIds = currentOfficerIds.filter(id => !selectedIds.includes(id));
    
    // Create new officers array
    let updatedOfficers = [...currentOfficers];
    
    // End assignments for removed officers
    updatedOfficers = updatedOfficers.map(officer => 
      removedOfficerIds.includes(officer.id) 
        ? { ...officer, end_date: new Date().toISOString() }
        : officer
    );
    
    // Add new officers
    newOfficerIds.forEach(officerId => {
      updatedOfficers.push({
        id: officerId,
        start_date: new Date().toISOString()
      });
    });
    
    updateFormState(['subdepartments', subdeptIndex, 'officers'], updatedOfficers);
    
    // Update officer history
    const currentHistory = subdept.officer_history || [];
    let updatedHistory = [...currentHistory];
    
    // End history for removed officers
    updatedHistory = updatedHistory.map(historyItem => 
      removedOfficerIds.includes(historyItem.id) && !historyItem.end_date
        ? { ...historyItem, end_date: new Date().toISOString() }
        : historyItem
    );
    
    // Add new officers to history
    newOfficerIds.forEach(officerId => {
      updatedHistory.push({
        id: officerId,
        start_date: new Date().toISOString()
      });
    });
    
    updateFormState(['subdepartments', subdeptIndex, 'officer_history'], updatedHistory);
  };
  
  // Handle assistant selection change
  const handleAssistantSelectionChange = (selectedIds: string[]) => {
    onSubdepartmentChange(subdeptIndex, 'taskAssistantIds', selectedIds);
  };
  
  // Get current active officers
  const getCurrentOfficerIds = () => {
    return (subdept.officers || [])
      .filter(officer => !officer.end_date)
      .map(officer => officer.id);
  };
  
  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-lg">
          <UserIcon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h4 className="text-lg font-bold text-gray-900">Role Management</h4>
          <p className="text-sm text-gray-600">Assign officers, managers, and assistants to this subdepartment</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Officers Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            <Label className="text-sm font-semibold text-purple-900">Officers</Label>
            <Badge variant="outline" className="ml-auto">
              {getCurrentOfficerIds().length} active
            </Badge>
          </div>
          <MultiSelect
            users={officers}
            selectedIds={getCurrentOfficerIds()}
            onSelectionChange={handleOfficerSelectionChange}
            placeholder="Select officers..."
            role="officer"
          />
        </div>

        {/* Task Manager Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-blue-600" />
            <Label className="text-sm font-semibold text-blue-900">Task Manager</Label>
            <Badge variant="outline" className="ml-auto">
              {subdept.taskManagerId ? '1 assigned' : 'None'}
            </Badge>
          </div>
          <Select 
            value={subdept.taskManagerId || ''} 
            onValueChange={(value) => onSubdepartmentChange(subdeptIndex, 'taskManagerId', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select task manager" />
              <BoxSelect className="h-4 w-4 text-blue-600" />
            </SelectTrigger>
            <SelectContent className="bg-white border rounded-md shadow-sm">
              <SelectItem value="">
                <div className="flex items-center gap-2 p-2">
                  <UserIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">None</span>
                </div>
              </SelectItem>
              {users.filter(user => user.role === 'task_manager' || user.role === 'admin' || user.role === 'user').map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  <div className="flex items-center gap-2 p-2">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                    <div>
                      <span className="font-medium">{user.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {user.role === 'task_manager' ? 'Manager' : user.role === 'admin' ? 'Admin' : 'User'}
                      </Badge>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Task Assistants Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            <Label className="text-sm font-semibold text-green-900">Task Assistants</Label>
            <Badge variant="outline" className="ml-auto">
              {subdept.taskAssistantIds?.filter(id => id).length || 0} assigned
            </Badge>
          </div>
          <MultiSelect
            users={users.filter(user => user.role === 'task_assistant' || user.role === 'admin' || user.role === 'user')}
            selectedIds={subdept.taskAssistantIds?.filter(id => id) || []}
            onSelectionChange={handleAssistantSelectionChange}
            placeholder="Select assistants..."
            role="assistant"
          />
        </div>
      </div>

      {/* Role Assignment Summary */}
      <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
        <h5 className="text-sm font-semibold text-gray-900 mb-3">Assignment Summary</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-600" />
            <span>Officers: <strong>{getCurrentOfficerIds().length}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-blue-600" />
            <span>Manager: <strong>{subdept.taskManagerId ? '1' : '0'}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-green-600" />
            <span>Assistants: <strong>{subdept.taskAssistantIds?.filter(id => id).length || 0}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Updated DepartmentDialog with officer management at subdepartment level
interface DepartmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  departmentForm: DepartmentForm
  setDepartmentForm: React.Dispatch<React.SetStateAction<DepartmentForm>>
  users: User[]
  officers: User[] // Array of potential officers (Users with 'officer' role)
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
  
  const updateFormState = (path: string[], value: any) => 
    setDepartmentForm(prevState => updateNestedState(prevState, path, value));

  // Determine the current mode
  const isCreatingNewDepartment = !editingDepartmentId && !editingSubdepartmentId;
  const isEditingDepartment = editingDepartmentId && !editingSubdepartmentId && departmentForm.subdepartments.length === 0;
  const isCreatingSubdepartment = editingDepartmentId && !editingSubdepartmentId && departmentForm.subdepartments.length > 0;
  const isEditingSubdepartment = editingSubdepartmentId;

  // Get dialog title and description based on mode
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
    updateFormState(
      ['subdepartments', subdeptIndex, 'classes'],
      [...departmentForm.subdepartments[subdeptIndex].classes, newClass]
    );
  };

  const handleRemoveClass = (subdeptIndex: number, classIndex: number) => {
    updateFormState(
      ['subdepartments', subdeptIndex, 'classes'],
      departmentForm.subdepartments[subdeptIndex].classes.filter((_, i) => i !== classIndex)
    );
  };

  const handleSubdepartmentChange = (subdeptIndex: number, field: string, value: any) =>
    updateFormState(['subdepartments', subdeptIndex, field], value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[calc(100vh-8rem)]">
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
          {/* Department Section - shown when creating new dept or editing existing dept */}
          {(isCreatingNewDepartment || isEditingDepartment) && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border">
              <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
                <Building className="h-5 w-5" />
                Department Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="department-name">Department Name *</Label>
                  <Input
                    id="department-name"
                    placeholder="Enter department name"
                    value={departmentForm.name}
                    onChange={(e) => updateFormState(['name'], e.target.value)}
                    disabled={isEditingDepartment && editingDepartmentId !== null}
                    className="font-medium"
                  />
                </div>
                <div>
                  <Label htmlFor="department-description">Department Description</Label>
                  <Textarea
                    id="department-description"
                    placeholder="Enter department description"
                    value={departmentForm.description}
                    onChange={(e) => updateFormState(['description'], e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  checked={departmentForm.default_display}
                  onCheckedChange={(checked) => updateFormState(['default_display'], Boolean(checked))}
                  id="dept-default-display"
                />
                <Label htmlFor="dept-default-display" className="text-sm text-gray-700">
                  Default Display
                </Label>
              </div>
            </div>
          )}

          {/* Subdepartments Section */}
          {departmentForm.subdepartments.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Workflow className="h-5 w-5 text-blue-600" />
                  {isCreatingSubdepartment || isEditingSubdepartment ? 'Subdepartment Details' : 'Subdepartments'}
                </h3>
                {isCreatingNewDepartment && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFormState(['subdepartments'], [...departmentForm.subdepartments, {
                      name: '',
                      description: '',
                      classes: [],
                      taskManagerId: '',
                      taskAssistantIds: [],
                      officers: [],
                      default_display: true
                    }])}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Subdepartment
                  </Button>
                )}
              </div>

              <div className="space-y-6">
                {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                  <Card key={subdeptIndex} className="bg-gray-50/30 border-gray-200">
                    <CardHeader className="pb-4">
                      <div className="space-y-4">
                        {/* Basic Subdepartment Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`subdept-name-${subdeptIndex}`}>Subdepartment Name *</Label>
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline" className="font-mono bg-gray-200 text-gray-700">{subdeptIndex + 1}</Badge>
                              <Input 
                                id={`subdept-name-${subdeptIndex}`} 
                                placeholder="Enter subdepartment name" 
                                value={subdept.name} 
                                onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)} 
                                className="flex-1 font-medium"
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor={`subdept-desc-${subdeptIndex}`}>Description</Label>
                            <Textarea 
                              id={`subdept-desc-${subdeptIndex}`} 
                              placeholder="Enter subdepartment description" 
                              value={subdept.description} 
                              onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)} 
                              className="min-h-[60px]"
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            checked={subdept.default_display} 
                            onCheckedChange={(checked) => handleSubdepartmentChange(subdeptIndex, 'default_display', Boolean(checked))} 
                            id={`subdept-default-display-${subdeptIndex}`}
                          />
                          <Label htmlFor={`subdept-default-display-${subdeptIndex}`} className="text-sm text-gray-700">Default Display</Label>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      {/* Enhanced Role Management Section */}
                      <RoleManagementSection
                        subdept={subdept}
                        subdeptIndex={subdeptIndex}
                        users={users}
                        officers={officers}
                        onSubdepartmentChange={handleSubdepartmentChange}
                        updateFormState={updateFormState}
                      />

                      {/* Classes Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="font-semibold text-gray-700">Classes</Label>
                          <Button variant="outline" size="sm" onClick={() => handleAddClass(subdeptIndex)}>
                            <Plus className="h-4 w-4 mr-1" /> Add Class
                          </Button>
                        </div>
                        
                        <div className="space-y-4">
                          {subdept.classes && subdept.classes.length > 0 ? (
                            subdept.classes.map((cls, clsIndex) => (
                              <ClassComponent 
                                key={cls.id} 
                                classItem={cls} 
                                onUpdate={updateFormState} 
                                onRemove={() => handleRemoveClass(subdeptIndex, clsIndex)} 
                                path={['subdepartments', subdeptIndex.toString(), 'classes', clsIndex.toString()]} 
                                index={`${subdeptIndex + 1}.${clsIndex + 1}`}
                              />
                            ))
                          ) : (
                            <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">
                              No classes added yet. Click "Add Class" to get started.
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add first subdepartment section for new departments */}
          {isCreatingNewDepartment && departmentForm.subdepartments.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-gray-50">
              <Workflow className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">This department doesn't have any subdepartments yet.</p>
              <Button
                variant="outline"
                onClick={() => updateFormState(['subdepartments'], [{
                  name: '',
                  description: '',
                  classes: [],
                  taskManagerId: '',
                  taskAssistantIds: [],
                  officers: [],
                  default_display: true
                }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add First Subdepartment
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreatingNewDepartment || isCreatingSubdepartment ? 'Create' : 'Update'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}