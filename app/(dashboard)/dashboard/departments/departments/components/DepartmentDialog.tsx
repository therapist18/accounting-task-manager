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
import { ChevronDown, ChevronUp, Plus, Trash2, Layers, UserIcon, ChevronsUpDown, FolderPlus, Edit, Building, Workflow, Loader2, Shield, X, BoxSelect } from "lucide-react"
// Note: The following types are assumed to have been updated in the database definitions.
// DepartmentForm would no longer have an `officers` property.
// SubdepartmentForm would now have an `officers` property and officer_history.
interface EnhancedSubdepartmentForm extends SubdepartmentForm {
  officer_history?: Array<{
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
  const [newOfficer, setNewOfficer] = React.useState<{ id: string; start_date: string; end_date?: string }>({ 
    id: '', 
    start_date: new Date().toISOString().split('T')[0] 
  });
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

  const handleAddTaskAssistant = (subdeptIndex: number) =>
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'],
      [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds, '']
    );

  const handleRemoveTaskAssistant = (subdeptIndex: number, assistantIndex: number) =>
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'],
      departmentForm.subdepartments[subdeptIndex].taskAssistantIds.filter((_, i) => i !== assistantIndex)
    );

  const handleTaskAssistantChange = (subdeptIndex: number, assistantIndex: number, userId: string) => {
    const currentIds = [...departmentForm.subdepartments[subdeptIndex].taskAssistantIds];
    currentIds[assistantIndex] = userId;
    updateFormState(['subdepartments', subdeptIndex, 'taskAssistantIds'], currentIds);
  };
  
  const handleAddOfficer = (subdeptIndex: number) => {
    if (newOfficer.id) {
        const currentOfficers = departmentForm.subdepartments[subdeptIndex].officers || [];
        const currentHistory = departmentForm.subdepartments[subdeptIndex].officer_history || [];
        
        // Add to current officers
        updateFormState(
            ['subdepartments', subdeptIndex, 'officers'],
            [...currentOfficers, { ...newOfficer }]
        );
        
        // Add to officer history
        updateFormState(
            ['subdepartments', subdeptIndex, 'officer_history'],
            [...currentHistory, { 
                id: newOfficer.id, 
                start_date: new Date().toISOString(),
                end_date: undefined
            }]
        );
        
        setNewOfficer({ id: '', start_date: new Date().toISOString().split('T')[0] });
    }
  };

  const handleRemoveOfficer = (subdeptIndex: number, officerIndex: number) => {
    const currentOfficers = departmentForm.subdepartments[subdeptIndex].officers || [];
    const currentHistory = departmentForm.subdepartments[subdeptIndex].officer_history || [];
    const officerToRemove = currentOfficers[officerIndex];

    // Remove from current officers
    updateFormState(
        ['subdepartments', subdeptIndex, 'officers'],
        currentOfficers.filter((_, i) => i !== officerIndex)
    );

    // Update officer history with end date
    const updatedHistory = currentHistory.map((historyItem, index) => {
      if (index === officerIndex && !historyItem.end_date) {
        return {
          ...historyItem,
          end_date: new Date().toISOString()
        };
      }
      return historyItem;
    });

    updateFormState(
        ['subdepartments', subdeptIndex, 'officer_history'],
        updatedHistory
    );
  };


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

              <div className="space-y-4">
                {departmentForm.subdepartments.map((subdept, subdeptIndex) => (
                  <Card key={subdeptIndex} className="bg-gray-50">
                    <CardHeader className="pb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {/* --- LEFT COLUMN --- */}
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor={`subdept-name-${subdeptIndex}`}>Subdepartment Name *</Label>
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline" className="font-mono bg-gray-200 text-gray-700">{subdeptIndex + 1}</Badge>
                              <Input id={`subdept-name-${subdeptIndex}`} placeholder="Enter subdepartment name" value={subdept.name} onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'name', e.target.value)} className="flex-1 font-medium"/>
                            </div>
                          </div>
                          <div>
                            <Label htmlFor={`subdept-desc-${subdeptIndex}`}>Description</Label>
                            <Textarea id={`subdept-desc-${subdeptIndex}`} placeholder="Enter subdepartment description" value={subdept.description} onChange={(e) => handleSubdepartmentChange(subdeptIndex, 'description', e.target.value)} className="min-h-[60px]"/>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox checked={subdept.default_display} onCheckedChange={(checked) => handleSubdepartmentChange(subdeptIndex, 'default_display', Boolean(checked))} id={`subdept-default-display-${subdeptIndex}`}/>
                            <Label htmlFor={`subdept-default-display-${subdeptIndex}`} className="text-sm text-gray-700">Default Display</Label>
                          </div>
                        </div>
                        {/* --- RIGHT COLUMN --- */}
                        <div className="space-y-6">
                          {/* Role Management Section */}
                          <div className="space-y-4 border-l-4 border-blue-600 pl-4 bg-blue-50/10 rounded-r-lg">
                            <h4 className="text-lg font-semibold flex items-center gap-2">
                              <UserIcon className="h-5 w-5 text-blue-600" />
                              Role Management
                            </h4>

                            {/* Task Manager */}
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Task Manager *</Label>
                              <Select value={subdept.taskManagerId || ''} onValueChange={(value) => handleSubdepartmentChange(subdeptIndex, 'taskManagerId', value)}>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select task manager" />
                                  <BoxSelect className="h-4 w-4 text-blue-600" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border rounded-md shadow-sm">
                                  <SelectItem value="none">
                                    <div className="flex items-center gap-2 p-2">
                                      <UserIcon className="h-4 w-4 text-gray-400" />
                                      <span className="text-gray-500">None</span>
                                    </div>
                                  </SelectItem>
                                  {users.filter(user => user.role === 'task_manager' || user.role === 'admin' || user.role === 'user').map((user) => (
                                    <SelectItem key={user.id} value={user.id}>
                                      <div className="flex items-center gap-2 p-2">
                                        <UserIcon className="h-4 w-4 text-blue-600" />
                                        <span className="font-medium">{user.name}</span>
                                        <Badge variant="outline" className="ml-auto text-xs">
                                          {user.role === 'task_manager' ? 'Manager' : user.role === 'admin' ? 'Admin' : 'User'}
                                        </Badge>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Officers */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <Label className="text-sm font-medium">Officers *</Label>
                                <div className="flex items-center gap-2">
                                  <Select value={newOfficer.id} onValueChange={(value) => setNewOfficer(prev => ({ ...prev, id: value }))}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select officer" />
                                      <BoxSelect className="h-4 w-4 text-purple-600" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border rounded-md shadow-sm">
                                      {officers.filter(officer => !subdept.officers?.some(o => o.id === officer.id)).map((officer) => (
                                        <SelectItem key={officer.id} value={officer.id}>
                                          <div className="flex items-center gap-2 p-2">
                                            <Shield className="h-4 w-4 text-purple-600" />
                                            <span className="font-medium">{officer.name}</span>
                                            <Badge variant="outline" className="ml-auto text-xs">Officer</Badge>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button 
                                    type="button" 
                                    onClick={() => handleAddOfficer(subdeptIndex)} 
                                    disabled={!newOfficer.id}
                                    className="h-8 px-3 bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-300 disabled:text-gray-500"
                                  >
                                    Add
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2 mt-2 max-h-32 overflow-y-auto border rounded-md">
                                {subdept.officers?.map((officer, officerIndex) => {
                                  const officerData = officers.find(o => o.id === officer.id);
                                  return officerData ? (
                                    <div key={`${officer.id}-${officerIndex}`} className="grid grid-cols-12 gap-2 items-center p-3 border-b last:border-b-0 hover:bg-gray-50">
                                      <div className="flex items-center gap-2 col-span-3">
                                        <Shield className="h-4 w-4 text-purple-600 flex-shrink-0" />
                                        <span className="font-medium truncate">{officerData.name}</span>
                                      </div>
                                      <div className="col-span-3">
                                        <Label className="text-xs text-gray-500">Start Date</Label>
                                        <Input 
                                          type="date" 
                                          value={officer.start_date || ''} 
                                          onChange={(e) => updateFormState(['subdepartments', subdeptIndex, 'officers', officerIndex, 'start_date'], e.target.value)} 
                                          className="h-8 text-sm border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        />
                                      </div>
                                      <div className="col-span-3">
                                        <Label className="text-xs text-gray-500">End Date (Opt.)</Label>
                                        <Input 
                                          type="date" 
                                          value={officer.end_date || ''} 
                                          onChange={(e) => updateFormState(['subdepartments', subdeptIndex, 'officers', officerIndex, 'end_date'], e.target.value || undefined)} 
                                          min={officer.start_date} 
                                          className="h-8 text-sm border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        />
                                      </div>
                                      <div className="flex justify-end col-span-3">
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                                          onClick={() => handleRemoveOfficer(subdeptIndex, officerIndex)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null;
                                })}
                                {subdept.officers?.length === 0 && (
                                  <div className="p-3 text-center text-gray-500">
                                    No officers assigned yet
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Task Assistants */}
                            <div className="space-y-3">
                              <Label className="text-sm font-medium">Task Assistants *</Label>
                              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md">
                                {subdept.taskAssistantIds.map((userId, assistantIndex) => (
                                  <div key={assistantIndex} className="flex items-center space-x-2 p-3 border-b last:border-b-0 hover:bg-gray-50">
                                    <Select 
                                      value={userId} 
                                      onValueChange={(value) => handleTaskAssistantChange(subdeptIndex, assistantIndex, value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select assistant" />
                                        <BoxSelect className="h-4 w-4 text-green-600" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-white border rounded-md shadow-sm">
                                        <SelectItem value="none">
                                          <div className="flex items-center gap-2 p-2">
                                            <UserIcon className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-500">None</span>
                                          </div>
                                        </SelectItem>
                                        {users.filter(user => user.role === 'task_assistant' || user.role === 'admin' || user.role === 'user').map((user) => (
                                          <SelectItem key={user.id} value={user.id}>
                                            <div className="flex items-center gap-2 p-2">
                                              <UserIcon className="h-4 w-4 text-green-600" />
                                              <span className="font-medium">{user.name}</span>
                                              <Badge variant="outline" className="ml-auto text-xs">
                                                {user.role === 'task_assistant' ? 'Assistant' : user.role === 'admin' ? 'Admin' : 'User'}
                                              </Badge>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => handleRemoveTaskAssistant(subdeptIndex, assistantIndex)} 
                                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 flex-shrink-0"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                {subdept.taskAssistantIds.length === 0 && (
                                  <div className="p-3 text-center text-gray-500">
                                    No assistants assigned yet
                                  </div>
                                )}
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleAddTaskAssistant(subdeptIndex)} 
                                className="w-full text-green-600 hover:text-green-700 border-green-600 hover:bg-green-50"
                              >
                                <Plus className="h-4 w-4 mr-1" /> Add Assistant
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="font-semibold text-gray-700">Classes</Label>
                          <Button variant="outline" size="sm" onClick={() => handleAddClass(subdeptIndex)}><Plus className="h-4 w-4 mr-1" /> Add Class</Button>
                        </div>
                        
                        <div className="space-y-4">
                          {subdept.classes && subdept.classes.length > 0 ? (
                            subdept.classes.map((cls, clsIndex) => (
                              <ClassComponent key={cls.id} classItem={cls} onUpdate={updateFormState} onRemove={() => handleRemoveClass(subdeptIndex, clsIndex)} path={['subdepartments', subdeptIndex.toString(), 'classes', clsIndex.toString()]} index={`${subdeptIndex + 1}.${clsIndex + 1}`}/>
                            ))
                          ) : (
                            <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">No classes added yet. Click "Add Class" to get started.</div>
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