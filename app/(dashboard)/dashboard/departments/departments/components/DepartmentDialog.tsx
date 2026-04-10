// @ts-nocheck
"use client"

import React, { useState, useCallback, memo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
    Plus, Trash2, Layers, ChevronsUpDown,
    Building, Workflow, Loader2, Check,
    ChevronDown, ChevronRight, Shield, Target, ArrowUp, ArrowDown, Users,
    Minus
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { ENTITY_TYPES } from "@/lib/constants/entity-types"
import { toast } from "sonner"

// ─── Shared Components ──────────────────────────────────────────────────────

const MultiSelectUser = memo(({ users, value, onChange, placeholder }) => {
    const [open, setOpen] = useState(false)
    const safeValue = Array.isArray(value) ? value : []

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-full justify-between font-normal border-slate-200 bg-white">
                    <span className="truncate text-[11px]">
                        {safeValue.length > 0 ? `${safeValue.length} assigned` : placeholder}
                    </span>
                    <Users className="ml-2 h-3 w-3 shrink-0 opacity-50 text-blue-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 z-[100]" align="start">
                <Command>
                    <CommandInput placeholder="Search users..." className="h-8 text-xs" />
                    <CommandList className="max-h-48">
                        <CommandEmpty>No users found.</CommandEmpty>
                        <CommandGroup>
                            {users.map((user) => (
                                <CommandItem key={user.id} onSelect={() => {
                                    onChange(safeValue.includes(user.id) ? safeValue.filter(id => id !== user.id) : [...safeValue, user.id])
                                }} className="text-xs cursor-pointer">
                                    <div className={cn("mr-2 flex h-3.5 w-3.5 items-center justify-center rounded border", safeValue.includes(user.id) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300")}>
                                        {safeValue.includes(user.id) && <Check className="h-2 w-2" />}
                                    </div>
                                    {user.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
})

const MultiSelectSpec = memo(({ value, onChange }) => {
    const safeValue = Array.isArray(value) ? value : []
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-full justify-between font-normal border-slate-200 bg-white">
                    <span className="truncate text-[11px]">
                        {safeValue.length > 0 ? `${safeValue.length} Types` : 'All Types'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50 text-blue-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 z-[100]" align="start">
                <Command>
                    <CommandInput placeholder="Search types..." className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty>No types found.</CommandEmpty>
                        <CommandGroup>
                            {ENTITY_TYPES.map((type) => (
                                <CommandItem key={type.value} onSelect={() => {
                                    onChange(safeValue.includes(type.value) ? safeValue.filter(v => v !== type.value) : [...safeValue, type.value])
                                }} className="text-xs cursor-pointer">
                                    <div className={cn("mr-2 flex h-3.5 w-3.5 items-center justify-center rounded border", safeValue.includes(type.value) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300")}>
                                        {safeValue.includes(type.value) && <Check className="h-2 w-2" />}
                                    </div>
                                    {type.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
})

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export default function DepartmentDialog({
    open, onOpenChange, onSave, departmentForm, setDepartmentForm, userData, editingDepartmentId, isSaving
}) {
    const [expandedRows, setExpandedRows] = useState({})

    // Transform unified userData to the format expected by the component
    const officerUsers = userData.officers.map((officer) => ({
        id: officer.id,
        name: officer.displayName,
        email: officer.email || '',
    }))
    const managerUsers = userData.managers.map((manager) => ({
        id: manager.id,
        name: manager.displayName,
        email: manager.email || '',
    }))
    const assistantUsers = userData.assistants.map((assistant) => ({
        id: assistant.id,
        name: assistant.displayName,
        email: assistant.email || '',
    }))

    const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))

    const updateFormState = useCallback((path, value) => {
        setDepartmentForm(prev => {
            const newState = { ...prev }
            let current = newState
            for (let i = 0; i < path.length - 1; i++) {
                const key = path[i]
                current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] }
                current = current[key]
            }
            const lastKey = path[path.length - 1]
            current[lastKey] = value

            // Inheritance logic: Propagate entity_types to children
            if (lastKey === 'entity_types') {
                if (current.classes) current.classes = current.classes.map(c => ({ ...c, entity_types: value }))
                if (current.subClasses) current.subClasses = current.subClasses.map(s => ({ ...s, entity_types: value }))
            }

            // Manager inheritance: Propagate department-level managers to subdepartments
            if (lastKey === 'manager_history' && path.length === 1) {
                // Only apply inheritance at department level (path length 1)
                if (newState.subdepartments) {
                    newState.subdepartments = newState.subdepartments.map(subdept => {
                        // Only inherit if subdepartment doesn't have its own managers
                        const currentManagers = subdept.manager_history || []
                        const hasActiveManagers = currentManagers.some(manager => !manager.end_date)

                        if (!hasActiveManagers) {
                            return {
                                ...subdept,
                                manager_history: value // Inherit department managers
                            }
                        }
                        return subdept
                    })
                }
            }
            return newState
        })
    }, [setDepartmentForm])

    const moveItem = (path, index, direction) => {
        setDepartmentForm(prev => {
            const newState = JSON.parse(JSON.stringify(prev)) // Deep clone
            let targetArray = newState

            // Navigate to the target array
            for (let i = 0; i < path.length - 1; i++) {
                targetArray = targetArray[path[i]]
            }

            // Check if targetArray is actually an array
            if (!Array.isArray(targetArray)) {
                console.log('targetArray is not an array:', targetArray, 'path:', path)
                return prev
            }

            const newIndex = direction === 'up' ? index - 1 : index + 1
            if (newIndex < 0 || newIndex >= targetArray.length) return prev

            const updatedArray = [...targetArray]
            const [movedItem] = updatedArray.splice(index, 1)
            updatedArray.splice(newIndex, 0, movedItem)

            // Navigate back to set the updated array
            let current = newState
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]]
            }
            current[path[path.length - 1]] = updatedArray

            return newState
        })
    }

    const addSubdepartment = () => {
        updateFormState(['subdepartments'], [
            ...(departmentForm.subdepartments || []),
            { name: '', description: '', classes: [], entity_types: [...(departmentForm.entity_types || [])], officer_history: [], manager_history: [], assistant_history: [], default_display: true }
        ])
    }

    const getCurrentId = (history = []) => (history || []).find(h => !h.end_date || new Date(h.end_date) > new Date())?.id || ''
    const getCurrentIds = (history = []) => (history || []).filter(h => !h.end_date || new Date(h.end_date) > new Date()).map(h => h.id)

    // Helper functions to get current assignments based on roleAssignments
    const getCurrentManagerIds = (subdepartmentIndex = null) => {
        if (subdepartmentIndex !== null) {
            // For subdepartment, check both subdepartment-level and department-level assignments
            const subdept = departmentForm.subdepartments?.[subdepartmentIndex]
            if (!subdept) return []

            const subdeptManagers = userData.managers
                .filter(manager =>
                    manager.assignments?.some((assignment: any) =>
                        assignment.role === 'manager' &&
                        assignment.department_id === parseInt(editingDepartmentId || '0') &&
                        (assignment.subdepartment_id === parseInt(subdept.id || '0') || assignment.subdepartment_id === null) &&
                        !assignment.end_date
                    )
                )
                .map(manager => manager.id)

            return subdeptManagers
        } else {
            // For department level
            return userData.managers
                .filter(manager =>
                    manager.assignments?.some((assignment: any) =>
                        assignment.role === 'manager' &&
                        assignment.department_id === parseInt(editingDepartmentId || '0') &&
                        assignment.subdepartment_id === null &&
                        !assignment.end_date
                    )
                )
                .map(manager => manager.id)
        }
    }

    const getCurrentAssistantIds = (subdepartmentIndex = null) => {
        if (subdepartmentIndex !== null) {
            // For subdepartment
            const subdept = departmentForm.subdepartments?.[subdepartmentIndex]
            if (!subdept) return []

            return userData.assistants
                .filter(assistant =>
                    assistant.assignments?.some((assignment: any) =>
                        assignment.role === 'assistant' &&
                        assignment.department_id === parseInt(editingDepartmentId || '0') &&
                        (assignment.subdepartment_id === parseInt(subdept.id || '0') || assignment.subdepartment_id === null) &&
                        !assignment.end_date
                    )
                )
                .map(assistant => assistant.id)
        } else {
            // For department level (assistants are typically only at subdepartment level)
            return []
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[1440px] w-[98vw] h-[92vh] flex flex-col p-0 overflow-hidden bg-white">

                <DialogHeader className="px-6 py-4 border-b bg-blue-600 text-white shrink-0 z-50">
                    <div className="flex items-center gap-3">
                        <Building className="h-6 w-6" />
                        <div>
                            <DialogTitle className="text-white text-xl">{editingDepartmentId ? 'Edit' : 'Create'} Department</DialogTitle>
                            <DialogDescription className="text-blue-100">Structure units, assign staff, and manage visibility.</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto bg-slate-50">
                    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

                        {/* Core Details */}
                        <div className="grid grid-cols-4 gap-4 bg-white p-6 rounded-lg border border-blue-100 shadow-sm">
                            <div className="col-span-2 space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-blue-700 font-bold uppercase text-[10px]">Department Name</Label>
                                    <Input className="border-blue-100" value={departmentForm.name} onChange={(e) => updateFormState(['name'], e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-blue-700 font-bold uppercase text-[10px]">Description</Label>
                                    <Textarea className="min-h-[60px] border-blue-100" value={departmentForm.description} onChange={(e) => updateFormState(['description'], e.target.value)} />
                                </div>
                            </div>
                            <div className="col-span-1 space-y-2">
                                <Label className="text-blue-700 font-bold uppercase text-[10px]">Department Officers</Label>
                                <MultiSelectUser
                                    users={officerUsers}
                                    value={getCurrentIds(departmentForm.officers_history)}
                                    onChange={(ids) => updateFormState(['officers_history'], ids.map(id => ({ id, start_date: new Date().toISOString() })))}
                                    placeholder="Assign officers..."
                                />
                            </div>
                            <div className="col-span-1 space-y-2">
                                <Label className="text-blue-700 font-bold uppercase text-[10px]">Global Entity Types</Label>
                                <MultiSelectSpec value={departmentForm.entity_types} onChange={(val) => updateFormState(['entity_types'], val)} />
                            </div>
                            <div className="col-span-4 flex items-end">
                                <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg w-full border border-blue-100">
                                    <Checkbox checked={departmentForm.default_display} onCheckedChange={(v) => updateFormState(['default_display'], !!v)} />
                                    <span className="text-xs font-bold text-blue-700">Show on Dashboard by Default</span>
                                </div>
                            </div>
                        </div>

                        {/* Hierarchy Table */}
                        <div className="bg-white rounded-lg border border-slate-200 shadow-lg flex flex-col relative">
                            <Table>
                                <TableHeader className="sticky top-0 z-40 bg-blue-600 shadow-md">
                                    <TableRow className="border-none h-12">
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-12 text-center">Idx</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-12">Order</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold">Organizational Unit</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-[160px]">Officer</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-[160px]">Task Manager</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-[160px]">Assistants</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-[120px]">Entities</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-12">Def.</TableHead>
                                        <TableHead className="text-white text-[12px] uppercase font-bold w-20 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {departmentForm.subdepartments.map((sub, sIdx) => {
                                        const subId = `sub-${sIdx}`;
                                        const isSubExpanded = expandedRows[subId];
                                        return (
                                            <React.Fragment key={subId}>
                                                <TableRow className="bg-blue-50/50 group">
                                                    <TableCell className="text-[10px] text-slate-400 text-center">{sIdx + 1}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-0.5">
                                                            <Button variant="ghost" size="sm" disabled={sIdx === 0} onClick={() => moveItem(['subdepartments'], sIdx, 'up')} className="h-4 w-4 p-0 text-slate-300 hover:text-blue-600 disabled:opacity-10">
                                                                <ArrowUp className="h-3 w-3" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" disabled={sIdx === departmentForm.subdepartments.length - 1} onClick={() => moveItem(['subdepartments'], sIdx, 'down')} className="h-4 w-4 p-0 text-slate-300 hover:text-blue-600 disabled:opacity-10">
                                                                <ArrowDown className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="min-w-[200px] flex justify-between items-center">
                                                        <Input className="h-8 border-transparent focus:bg-white text-sm font-bold" value={sub.name} onChange={(e) => updateFormState(['subdepartments', sIdx, 'name'], e.target.value)} />
                                                        <Button variant="ghost" size="sm" onClick={() => toggleRow(subId)} className="p-1 h-8 w-8">
                                                            {isSubExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell>
                                                        <MultiSelectUser
                                                            users={officerUsers}
                                                            value={getCurrentIds(sub.officer_history)}
                                                            onChange={(ids) => updateFormState(['subdepartments', sIdx, 'officer_history'], ids.map(id => ({ id, start_date: new Date().toISOString() })))}
                                                            placeholder="All officers"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <MultiSelectUser
                                                            users={managerUsers}
                                                            value={getCurrentManagerIds(sIdx)}
                                                            onChange={(ids) => updateFormState(['subdepartments', sIdx, 'manager_history'], ids.map(id => ({ id, start_date: new Date().toISOString() })))}
                                                            placeholder="All managers"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <MultiSelectUser
                                                            users={assistantUsers}
                                                            value={getCurrentAssistantIds(sIdx)}
                                                            onChange={(ids) => updateFormState(['subdepartments', sIdx, 'assistant_history'], ids.map(id => ({ id, start_date: new Date().toISOString() })))}
                                                            placeholder="Add..."
                                                        />
                                                    </TableCell>
                                                    <TableCell><MultiSelectSpec value={sub.entity_types} onChange={(v) => updateFormState(['subdepartments', sIdx, 'entity_types'], v)} /></TableCell>
                                                    <TableCell><Checkbox checked={sub.default_display} onCheckedChange={(v) => updateFormState(['subdepartments', sIdx, 'default_display'], !!v)} /></TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => updateFormState(['subdepartments', sIdx, 'classes'], [...(sub.classes || []), { id: Date.now(), name: '', subClasses: [], default_display: true, entity_types: sub.entity_types }])}><Plus className="h-4 w-4" /></Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => updateFormState(['subdepartments'], departmentForm.subdepartments.filter((_, i) => i !== sIdx))}><Trash2 className="h-4 w-4" /></Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>

                                                {isSubExpanded && sub.classes.map((cls, cIdx) => {
                                                    const classId = `${subId}-c-${cIdx}`;
                                                    const isClsExpanded = expandedRows[classId];
                                                    return (
                                                        <React.Fragment key={classId}>
                                                            <TableRow className="bg-white">
                                                                <TableCell className="text-[10px] text-slate-400 text-center">{sIdx + 1}.{cIdx + 1}</TableCell>
                                                                <TableCell className="pl-6">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <Button variant="ghost" size="sm" disabled={cIdx === 0} onClick={() => moveItem(['subdepartments', sIdx, 'classes'], cIdx, 'up')} className="h-4 w-4 p-0 text-slate-200 hover:text-blue-400 disabled:opacity-10">
                                                                            <ArrowUp className="h-3 w-3" />
                                                                        </Button>
                                                                        <Button variant="ghost" size="sm" disabled={cIdx === sub.classes.length - 1} onClick={() => moveItem(['subdepartments', sIdx, 'classes'], cIdx, 'down')} className="h-4 w-4 p-0 text-slate-200 hover:text-blue-400 disabled:opacity-10">
                                                                            <ArrowDown className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="pl-4 flex justify-between items-center">
                                                                    <Input className="h-8 border-transparent focus:border-slate-200 text-sm" value={cls.name} onChange={(e) => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'name'], e.target.value)} />
                                                                    <Button variant="ghost" size="sm" onClick={() => toggleRow(classId)} className="p-1 h-8 w-8">
                                                                        {isClsExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                                    </Button>
                                                                </TableCell>
                                                                <TableCell colSpan={3} />
                                                                <TableCell><MultiSelectSpec value={cls.entity_types} onChange={(v) => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'entity_types'], v)} /></TableCell>
                                                                <TableCell><Checkbox checked={cls.default_display} onCheckedChange={(v) => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'default_display'], !!v)} /></TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex justify-end gap-1">
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'subClasses'], [...(cls.subClasses || []), { id: Date.now(), name: '', default_display: true, entity_types: cls.entity_types }])}><Plus className="h-4 w-4" /></Button>
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => updateFormState(['subdepartments', sIdx, 'classes'], sub.classes.filter((_, i) => i !== cIdx))}><Trash2 className="h-4 w-4" /></Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>

                                                            {isClsExpanded && cls.subClasses.map((sc, scIdx) => (
                                                                <TableRow key={`${classId}-sc-${scIdx}`} className="bg-slate-50/30">
                                                                    <TableCell className="text-[10px] text-slate-400 text-center">{sIdx + 1}.{cIdx + 1}.{scIdx + 1}</TableCell>
                                                                    <TableCell className="pl-12">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <Button variant="ghost" size="sm" disabled={scIdx === 0} onClick={() => moveItem(['subdepartments', sIdx, 'classes', cIdx, 'subClasses'], scIdx, 'up')} className="h-4 w-4 p-0 text-slate-200 hover:text-blue-400 disabled:opacity-10">
                                                                                <ArrowUp className="h-3 w-3" />
                                                                            </Button>
                                                                            <Button variant="ghost" size="sm" disabled={scIdx === cls.subClasses.length - 1} onClick={() => moveItem(['subdepartments', sIdx, 'classes', cIdx, 'subClasses'], scIdx, 'down')} className="h-4 w-4 p-0 text-slate-200 hover:text-blue-400 disabled:opacity-10">
                                                                                <ArrowDown className="h-3 w-3" />
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell />
                                                                    <TableCell className="pl-12">
                                                                        <div className="flex items-center gap-2">
                                                                            <Target className="h-4 w-4 text-slate-300 shrink-0" />
                                                                            <Input className="h-8 border-transparent focus:border-slate-200 text-xs" value={sc.name} onChange={(e) => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'subClasses', scIdx, 'name'], e.target.value)} />
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell colSpan={3} />
                                                                    <TableCell><MultiSelectSpec value={sc.entity_types} onChange={(v) => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'subClasses', scIdx, 'entity_types'], v)} /></TableCell>
                                                                    <TableCell><Checkbox checked={sc.default_display} onCheckedChange={(v) => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'subClasses', scIdx, 'default_display'], !!v)} /></TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => updateFormState(['subdepartments', sIdx, 'classes', cIdx, 'subClasses'], cls.subClasses.filter((_, i) => i !== scIdx))}><Trash2 className="h-4 w-4" /></Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            <div className="p-4 bg-slate-50 border-t">
                                <Button variant="outline" onClick={addSubdepartment} className="w-full border-dashed border-blue-200 text-blue-600 bg-white">
                                    <Plus className="h-4 w-4 mr-2" /> Add New Sub-department Unit
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex gap-2 px-6 py-4 border-t">
                    <Button className="bg-white text-blue-600 hover:bg-blue-50" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button className="bg-green-600 text-white hover:bg-green-50" onClick={() => {
                        onSave();
                        toast.success("Department structure saved successfully!");
                    }} disabled={isSaving || !departmentForm.name}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
