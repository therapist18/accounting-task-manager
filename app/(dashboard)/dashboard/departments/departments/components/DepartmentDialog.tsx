// @ts-nocheck
"use client"

import React, { useState, useCallback, useMemo, memo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, Layers, User as UserIcon, ChevronsUpDown, FolderPlus, Edit, Building, Workflow, Loader2, Shield, X, Calendar, Users, FileText , Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

const SPECIFICATION_OPTIONS = [
    { id: "Company", label: "Company" },
    { id: "Principal", label: "Principal" },
    { id: "Dependant", label: "Dependant" },
    { id: "Understudy", label: "Understudy" },
    { id: "Directors", label: "Directors" },
    { id: "Shareholders", label: "Shareholders" },
    { id: "Employees", label: "Employees" },
];

const MultiSelectSpec = ({ value, onChange }: { value?: string[] | null, onChange: (val: string[]) => void }) => {
    const safeValue = Array.isArray(value) ? value : [];
    const [open, setOpen] = useState(false);

    const toggleOption = (id: string) => {
        const newValue = safeValue.includes(id) 
            ? safeValue.filter(v => v !== id) 
            : [...safeValue, id];
        onChange(newValue);
    };

    const removeOption = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onChange(safeValue.filter(v => v !== id));
    };

    return (
        <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-gray-500">Target Specifications</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between min-h-[40px] h-auto bg-white/50 hover:bg-white"
                    >
                        <div className="flex flex-wrap gap-1 items-center overflow-hidden">
                            {safeValue.length > 0 ? (
                                safeValue.map((val, index) => (
                                    <Badge 
                                        key={`${val}-${index}`} 
                                        variant="secondary" 
                                        className="mr-1 bg-blue-50 text-blue-700 border-blue-200"
                                    >
                                        {val}
                                        <X 
                                            className="ml-1 h-3 w-3 cursor-pointer hover:text-red-500" 
                                            onClick={(e) => removeOption(e, val)}
                                        />
                                    </Badge>
                                ))
                            ) : (
                                <span className="text-muted-foreground font-normal">Select specifications...</span>
                            )}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Search specifications..." />
                        <CommandList>
                            <CommandEmpty>No specification found.</CommandEmpty>
                            <CommandGroup>
                                {SPECIFICATION_OPTIONS.map((opt) => (
                                    <CommandItem
                                        key={opt.id}
                                        value={opt.id}
                                        onSelect={() => toggleOption(opt.id)}
                                        className="cursor-pointer"
                                    >
                                        <div className={cn(
                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                            safeValue.includes(opt.id)
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50 [&_svg]:invisible"
                                        )}>
                                            <Check className="h-4 w-4" />
                                        </div>
                                        <span>{opt.label}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                        {safeValue.length > 0 && (
                            <div className="border-t p-1">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => onChange([])} 
                                    className="w-full justify-center text-xs text-muted-foreground hover:text-red-500"
                                >
                                    Clear All
                                </Button>
                            </div>
                        )}
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};
// Requirement Component (Optimized)
const RequirementComponent = memo(({ requirement, onUpdate, onRemove, path, index }) => (
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
                    placeholder="Requirement details..."
                    value={requirement.description}
                    onChange={(e) => onUpdate([...path, 'description'], e.target.value)}
                    className="min-h-[50px] text-sm"
                />
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox checked={requirement.isVisible} onCheckedChange={(val) => onUpdate([...path, 'isVisible'], !!val)} id={`vis-${index}`} />
                        <Label htmlFor={`vis-${index}`} className="text-sm">Visible</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox checked={requirement.isRequired} onCheckedChange={(val) => onUpdate([...path, 'isRequired'], !!val)} id={`req-${index}`} />
                        <Label htmlFor={`req-${index}`} className="text-sm">Required</Label>
                    </div>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
        </div>
    </div>
));

// SubClass Component (Optimized)
const SubClassComponent = memo(({ subClass, onUpdate, onRemove, path, index }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const handleReqAdd = () => {
        const newReq = { id: Date.now().toString(), name: '', description: '', isRequired: true, order: subClass.requirements.length + 1, isVisible: true };
        onUpdate([...path, 'requirements'], [...subClass.requirements, newReq]);
    };

    return (
        <Card className="bg-gray-50/50 border-gray-200">
            <CardHeader className="p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1">
                        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-7 w-7"><ChevronsUpDown className="h-4 w-4" /></Button>
                        <Badge variant="secondary" className="font-mono">{index}</Badge>
                        <Input placeholder="Sub-class name" value={subClass.name} onChange={(e) => onUpdate([...path, 'name'], e.target.value)} className="font-semibold h-8" />
                        <div className="flex items-center space-x-2 px-2">
                            <Checkbox checked={subClass.default_display} onCheckedChange={(v) => onUpdate([...path, 'default_display'], !!v)} id={`def-sc-${index}`} />
                            <Label htmlFor={`def-sc-${index}`} className="text-xs">Default</Label>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                </div>
            </CardHeader>
            {isExpanded && (
                <CardContent className="pt-0 p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-8">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-gray-500">Description</Label>
                            <Textarea placeholder="Sub-class description" value={subClass.description} onChange={(e) => onUpdate([...path, 'description'], e.target.value)} className="min-h-[80px]" />
                        </div>
                        <MultiSelectSpec value={subClass.specification || []} onChange={(val) => onUpdate([...path, 'specification'], val)} />
                    </div>

                    <div className="ml-8 space-y-3 border-t pt-4">
                        <div className="flex justify-between items-center">
                            <Label className="font-semibold text-gray-700">Requirements ({subClass.requirements.length})</Label>
                            <Button variant="outline" size="sm" onClick={handleReqAdd}><Plus className="h-3 w-3 mr-1" /> Add Req</Button>
                        </div>
                        {subClass.requirements.map((req, i) => (
                            <RequirementComponent key={req.id} requirement={req} onUpdate={onUpdate} onRemove={() => onUpdate([...path, 'requirements'], subClass.requirements.filter((_, idx) => idx !== i))} path={[...path, 'requirements', i.toString()]} index={`${index}.${i + 1}`} />
                        ))}
                    </div>
                </CardContent>
            )}
        </Card>
    );
});

// Class Component (Optimized)
const ClassComponent = memo(({ classItem, onUpdate, onRemove, path, index }) => {
    const handleAddSubClass = () => {
        const newSC = { id: Date.now(), name: '', description: '', order: classItem.subClasses.length + 1, isVisible: true, default_display: true, requirements: [], specification: [] };
        onUpdate([...path, 'subClasses'], [...classItem.subClasses, newSC]);
    };

    return (
        <Card className="border-l-4 border-blue-500 bg-white shadow-sm">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3 flex-1">
                        <Badge className="bg-blue-600">{index}</Badge>
                        <Layers className="h-5 w-5 text-blue-600" />
                        <Input placeholder="Class name" value={classItem.name} onChange={(e) => onUpdate([...path, 'name'], e.target.value)} className="font-bold text-lg border-none focus-visible:ring-1 shadow-none" />
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox checked={classItem.default_display} onCheckedChange={(v) => onUpdate([...path, 'default_display'], !!v)} id={`def-c-${index}`} />
                            <Label htmlFor={`def-c-${index}`} className="text-sm">Default Display</Label>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-gray-500">Class Description</Label>
                        <Textarea placeholder="Describe this class..." value={classItem.description} onChange={(e) => onUpdate([...path, 'description'], e.target.value)} />
                    </div>
                    <MultiSelectSpec value={classItem.specification || []} onChange={(val) => onUpdate([...path, 'specification'], val)} />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-t pt-4">
                    <h4 className="font-semibold text-gray-800">Sub-classes</h4>
                    <Button variant="ghost" size="sm" onClick={handleAddSubClass} className="text-blue-600"><Plus className="h-4 w-4 mr-1" /> Add Sub-class</Button>
                </div>
                <div className="space-y-3">
                    {classItem.subClasses.map((sc, i) => (
                        <SubClassComponent key={sc.id} subClass={sc} onUpdate={onUpdate} onRemove={() => onUpdate([...path, 'subClasses'], classItem.subClasses.filter((_, idx) => idx !== i))} path={[...path, 'subClasses', i.toString()]} index={`${index}.${i + 1}`} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
});

// --- MAIN DIALOG ---

export default function DepartmentDialog({ open, onOpenChange, onSave, departmentForm, setDepartmentForm, users, officers = [], editingDepartmentId, editingSubdepartmentId, isSaving }) {
    const [selectedManagerId, setSelectedManagerId] = useState('');

    // Logic for surgical state updates (replaces deepClone for better performance)
    const updateFormState = useCallback((path: (string | number)[], value: any) => {
        setDepartmentForm(prev => {
            const newState = { ...prev };
            let current = newState;
            for (let i = 0; i < path.length - 1; i++) {
                const key = path[i];
                current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] };
                current = current[key];
            }
            current[path[path.length - 1]] = value;
            return newState;
        });
    }, [setDepartmentForm]);

    const getCurrentAssignments = (history = []) => {
        const now = new Date();
        return history.filter(h => !h.end_date || new Date(h.end_date) > now);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <FolderPlus className="h-5 w-5 text-blue-600" />
                        {editingDepartmentId ? 'Edit Department' : 'Add New Department'}
                    </DialogTitle>
                    <DialogDescription>Configure hierarchy, specifications, and roles.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Level 1: Department */}
                    <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Building className="h-5 w-5 text-blue-700" />
                            <h3 className="font-bold text-blue-900 uppercase tracking-tight">Department Core Details</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <Label className="font-semibold">Department Name *</Label>
                                    <Input value={departmentForm.name} onChange={(e) => updateFormState(['name'], e.target.value)} className="bg-white" />
                                </div>
                                <div>
                                    <Label className="font-semibold">General Description</Label>
                                    <Textarea value={departmentForm.description} onChange={(e) => updateFormState(['description'], e.target.value)} className="min-h-[100px] bg-white" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox checked={departmentForm.default_display} onCheckedChange={(v) => updateFormState(['default_display'], !!v)} id="dept-def" />
                                    <Label htmlFor="dept-def">Set as Default Display</Label>
                                </div>
                            </div>
                            <MultiSelectSpec value={departmentForm.specification || []} onChange={(val) => updateFormState(['specification'], val)} />
                        </div>
                    </div>

                    {/* Level 2: Sub-departments */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold flex items-center gap-2"><Workflow className="h-5 w-5 text-blue-600" /> Sub-departments</h3>
                            <Button onClick={() => updateFormState(['subdepartments'], [...departmentForm.subdepartments, { name: '', description: '', classes: [], specification: [], officer_history: [], manager_history: [], assistant_history: [], default_display: true }])} variant="outline" size="sm">
                                <Plus className="h-4 w-4 mr-1" /> Add Sub-dept
                            </Button>
                        </div>

                        {departmentForm.subdepartments.map((sub, sIndex) => (
                            <Card key={sIndex} className="shadow-md border-gray-200 overflow-hidden">
                                <Tabs defaultValue="details">
                                    <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
                                        <div className="flex items-center gap-3 flex-1">
                                            <Badge variant="outline" className="bg-white">{sIndex + 1}</Badge>
                                            <Input value={sub.name} onChange={(e) => updateFormState(['subdepartments', sIndex, 'name'], e.target.value)} className="max-w-xs font-semibold h-9" placeholder="Sub-department name" />
                                            <TabsList className="h-9">
                                                <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                                                <TabsTrigger value="roles" className="text-xs">Roles</TabsTrigger>
                                                <TabsTrigger value="classes" className="text-xs">Classes ({sub.classes.length})</TabsTrigger>
                                            </TabsList>
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => updateFormState(['subdepartments'], departmentForm.subdepartments.filter((_, i) => i !== sIndex))}><Trash2 className="h-4 w-4" /></Button>
                                    </div>

                                    <TabsContent value="details" className="p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div>
                                                    <Label className="text-xs font-bold uppercase text-gray-500">Sub-department Description</Label>
                                                    <Textarea value={sub.description} onChange={(e) => updateFormState(['subdepartments', sIndex, 'description'], e.target.value)} className="min-h-[120px]" />
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox checked={sub.default_display} onCheckedChange={(v) => updateFormState(['subdepartments', sIndex, 'default_display'], !!v)} id={`sub-def-${sIndex}`} />
                                                    <Label htmlFor={`sub-def-${sIndex}`}>Default Display</Label>
                                                </div>
                                            </div>
                                            <MultiSelectSpec value={sub.specification || []} onChange={(val) => updateFormState(['subdepartments', sIndex, 'specification'], val)} />
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="roles" className="p-6 space-y-6">
                                        {/* Simplified Role Logic for readability */}
                                        <div className="grid grid-cols-1 gap-6">
                                            {/* Officers & Managers logic remains similar but UI cleaned up */}
                                            {['officer_history', 'manager_history'].map((field) => (
                                                <div key={field} className="border p-4 rounded-lg bg-gray-50/50">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <Label className="capitalize font-bold">{field.replace('_history', 's')}</Label>
                                                        <Select onValueChange={(userId) => {
                                                            const current = sub[field] || [];
                                                            updateFormState(['subdepartments', sIndex, field], [...current, { id: userId, start_date: new Date().toISOString().split('T')[0] }]);
                                                        }}>
                                                            <SelectTrigger className="w-48 bg-white"><SelectValue placeholder="Add User..." /></SelectTrigger>
                                                            <SelectContent>
                                                                {(field === 'officer_history' ? officers : users).map(u => (
                                                                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {getCurrentAssignments(sub[field]).map((asg, aIdx) => {
                                                            const uData = (field === 'officer_history' ? officers : users).find(u => u.id === asg.id);
                                                            return (
                                                                <div key={aIdx} className="flex items-center justify-between bg-white p-2 border rounded shadow-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <UserIcon className="h-4 w-4 text-gray-400" />
                                                                        <span className="text-sm font-medium">{uData?.name}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Input type="date" className="h-8 w-32 text-xs" value={asg.start_date} onChange={(e) => {
                                                                            const updated = [...sub[field]];
                                                                            updated[aIdx].start_date = e.target.value;
                                                                            updateFormState(['subdepartments', sIndex, field], updated);
                                                                        }} />
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => updateFormState(['subdepartments', sIndex, field], sub[field].filter((_, i) => i !== aIdx))}><X className="h-4 w-4" /></Button>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="classes" className="p-6">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-bold">Classes in {sub.name || 'this sub-dept'}</h4>
                                            <Button size="sm" variant="outline" onClick={() => updateFormState(['subdepartments', sIndex, 'classes'], [...sub.classes, { id: Date.now(), name: '', description: '', order: sub.classes.length + 1, isVisible: true, default_display: true, requirements: [], specification: [], subClasses: [] }])}><Plus className="h-4 w-4 mr-1" /> Add Class</Button>
                                        </div>
                                        <div className="space-y-6">
                                            {sub.classes.map((cls, cIdx) => (
                                                <ClassComponent key={cls.id} classItem={cls} onUpdate={updateFormState} onRemove={() => updateFormState(['subdepartments', sIndex, 'classes'], sub.classes.filter((_, i) => i !== cIdx))} path={['subdepartments', sIndex.toString(), 'classes', cIdx.toString()]} index={`${sIndex + 1}.${cIdx + 1}`} />
                                            ))}
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </Card>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t flex justify-end gap-3 bg-gray-50">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onSave} disabled={isSaving} className="min-w-[120px] bg-blue-600 hover:bg-blue-700">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : editingDepartmentId ? 'Update Department' : 'Create Department'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}