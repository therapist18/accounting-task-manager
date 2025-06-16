// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, ListPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type ClassRequirement = {
  name: string
  description: string | null
}

type SubdepartmentClass = {
  name: string
  description: string | null
  requirements: ClassRequirement[]
}

type Subdepartment = {
  id: number
  name: string
  description: string | null
  classes?: SubdepartmentClass[]
  upload_requirements?: ClassRequirement[]
}

type Department = {
  id: string
  name: string
  description: string
  tm_subdepartments?: Subdepartment[]
}

interface DepartmentRequirementsProps {
  departments: Department[]
}

export default function DepartmentRequirements({ departments: initialDepartments }: DepartmentRequirementsProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [activeDept, setActiveDept] = useState(initialDepartments?.[0]?.id || '')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingContext, setEditingContext] = useState<{
    type: 'subdepartment' | 'class'
    departmentId: string
    subdepartmentId?: string
    classId?: string
  } | null>(null)
  const [newRequirements, setNewRequirements] = useState<Array<{ name: string; description: string }>>([{ name: '', description: '' }])
  const [isSubmitting, setIsSubmitting] = useState(false) 
  
  // Initialize active subdepartment if not set
  useEffect(() => {
    const currentDept = departments.find(d => d.id === activeDept) || departments[0]
    if (currentDept && !activeSubdept[currentDept.id] && currentDept.tm_subdepartments?.length) {
      setActiveSubdept(prev => ({
        ...prev,
        [currentDept.id]: currentDept.tm_subdepartments[0].id.toString()
      }))
    }
  }, [activeDept, departments, activeSubdept])

  const openMultipleRequirementsDialog = (
    type: 'subdepartment' | 'class'
  ) => {
    setEditingContext({
      type,
      departmentId: activeDept,
      subdepartmentId: activeSubdept[activeDept],
      classId: activeClass[activeSubdept[activeDept] || ''] || ''
    })
    
    // Initialize with one empty requirement
    setNewRequirements([{ name: '', description: '' }])
    setIsDialogOpen(true)
  }

  const updateSubdepartmentRequirements = (subdepartmentId: string, updatedRequirements: ClassRequirement[]) => {
    setDepartments(prevDepartments => 
      prevDepartments.map(dept => ({
        ...dept,
        tm_subdepartments: dept.tm_subdepartments?.map(subdept => 
          subdept.id.toString() === subdepartmentId 
            ? { ...subdept, upload_requirements: updatedRequirements }
            : subdept
        ) || []
      }))
    )
  }

  const updateClassRequirements = (subdepartmentId: string, className: string, updatedRequirements: ClassRequirement[]) => {
    setDepartments(prevDepartments => 
      prevDepartments.map(dept => ({
        ...dept,
        tm_subdepartments: dept.tm_subdepartments?.map(subdept => ({
          ...subdept,
          classes: subdept.classes?.map(cls => 
            cls.name === className 
              ? { ...cls, requirements: updatedRequirements }
              : cls
          ) || []
        })) || []
      }))
    )
  }

  const saveSubdepartmentRequirement = async (
    requirement: { name: string; description: string | null }, 
    subdepartmentId?: string, 
    index?: number
  ) => {
    if (!subdepartmentId) return
    
    try {
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId)
      
      if (!subdept) return
      
      const currentRequirements = subdept.upload_requirements || []
      const updatedRequirements = 
        index !== undefined && index >= 0
          ? currentRequirements.map((r, i) => (i === index ? requirement : r))
          : [...currentRequirements, requirement]
      
      // Update local state immediately for better UX
      updateSubdepartmentRequirements(subdepartmentId, updatedRequirements)
      
      // TODO: Uncomment and implement actual API call
      // const { error } = await supabase
      //   .from('tm_subdepartments')
      //   .update({ upload_requirements: updatedRequirements })
      //   .eq('id', subdepartmentId)
      // 
      // if (error) throw error
      
    } catch (error) {
      console.error('Error saving subdepartment requirement:', error)
      // TODO: Show error toast and revert local state on error
      // Revert local state on error
      // updateSubdepartmentRequirements(subdepartmentId, currentRequirements)
    }
  }
  
  const saveClassRequirement = async (
    requirement: { name: string; description: string | null }, 
    subdepartmentId?: string, 
    className?: string, 
    index?: number
  ) => {
    if (!subdepartmentId || !className) return
    
    try {
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId)
      
      if (!subdept) return
      
      const targetClass = subdept.classes?.find(cls => cls.name === className)
      if (!targetClass) return
      
      const currentRequirements = targetClass.requirements || []
      const updatedRequirements = 
        index !== undefined && index >= 0
          ? currentRequirements.map((r, i) => (i === index ? requirement : r))
          : [...currentRequirements, requirement]
      
      // Update local state immediately for better UX
      updateClassRequirements(subdepartmentId, className, updatedRequirements)
      
      // TODO: Uncomment and implement actual API call
      // 1. Get the current subdepartment
      // const { data: subdeptData, error: fetchError } = await supabase
      //   .from('tm_subdepartments')
      //   .select('classes')
      //   .eq('id', subdepartmentId)
      //   .single()
      // 
      // if (fetchError) throw fetchError
      // 
      // 2. Update the class requirements
      // const updatedClasses = subdeptData.classes.map((cls: any) => 
      //   cls.name === className 
      //     ? { ...cls, requirements: updatedRequirements }
      //     : cls
      // )
      // 
      // 3. Save back to database
      // const { error: updateError } = await supabase
      //   .from('tm_subdepartments')
      //   .update({ classes: updatedClasses })
      //   .eq('id', subdepartmentId)
      // 
      // if (updateError) throw updateError
      
    } catch (error) {
      console.error('Error saving class requirement:', error)
      // TODO: Show error toast and revert local state on error
    }
  }
  
  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewRequirements([{ name: '', description: '' }])
  }

  const handleDeleteRequirement = async (type: 'subdepartment' | 'class', index: number) => {
    if (!confirm(`Are you sure you want to delete this ${type} requirement?`)) return
    
    try {
      if (!editingContext) return
      
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        const subdept = departments
          .flatMap(dept => dept.tm_subdepartments || [])
          .find(sd => sd.id.toString() === editingContext.subdepartmentId)
        
        if (!subdept?.upload_requirements) return
        
        const updatedRequirements = subdept.upload_requirements.filter((_, i) => i !== index)
        updateSubdepartmentRequirements(editingContext.subdepartmentId, updatedRequirements)
        
        // TODO: Implement actual API call to delete from database
        // const { error } = await supabase
        //   .from('tm_subdepartments')
        //   .update({ upload_requirements: updatedRequirements })
        //   .eq('id', editingContext.subdepartmentId)
        // 
        // if (error) throw error
        
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        const subdept = departments
          .flatMap(dept => dept.tm_subdepartments || [])
          .find(sd => sd.id.toString() === editingContext.subdepartmentId)
        
        const targetClass = subdept?.classes?.find(cls => cls.name === editingContext.classId)
        if (!targetClass?.requirements) return
        
        const updatedRequirements = targetClass.requirements.filter((_, i) => i !== index)
        updateClassRequirements(editingContext.subdepartmentId, editingContext.classId, updatedRequirements)
        
        // TODO: Implement actual API call to delete from database
      }
      
    } catch (error) {
      console.error('Error deleting requirement:', error)
      // TODO: Show error toast
    }
  }

  const moveRequirement = (requirements: ClassRequirement[], currentIndex: number, direction: 'up' | 'down'): ClassRequirement[] => {
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    
    // Check if the move is valid
    if (newIndex < 0 || newIndex >= requirements.length) {
      return requirements
    }
    
    // Create a new array with the items swapped
    const newRequirements = [...requirements]
    const [movedItem] = newRequirements.splice(currentIndex, 1)
    newRequirements.splice(newIndex, 0, movedItem)
    
    return newRequirements
  }

  const addNewRequirement = () => {
    setNewRequirements([...newRequirements, { name: '', description: '' }])
  }

  const removeNewRequirement = (index: number) => {
    const updated = [...newRequirements]
    updated.splice(index, 1)
    setNewRequirements(updated)
  }

  const handleNewRequirementChange = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...newRequirements]
    updated[index] = { ...updated[index], [field]: value }
    setNewRequirements(updated)
  }

  const handleAddMultipleRequirements = async () => {
    if (!editingContext) return
    
    // Filter out empty requirements
    const validRequirements = newRequirements.filter(req => req.name.trim() !== '')
    
    if (validRequirements.length === 0) {
      handleCloseDialog()
      return
    }
    
    try {
      setIsSubmitting(true)
      
      if (editingContext.type === 'subdepartment' && editingContext.subdepartmentId) {
        await Promise.all(
          validRequirements.map(req => 
            saveSubdepartmentRequirement(
              { name: req.name, description: req.description || null },
              editingContext.subdepartmentId
            )
          )
        )
      } else if (editingContext.type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        await Promise.all(
          validRequirements.map(req => 
            saveClassRequirement(
              { name: req.name, description: req.description || null },
              editingContext.subdepartmentId,
              editingContext.classId
            )
          )
        )
      }
      
      handleCloseDialog()
    } catch (error) {
      console.error('Error adding requirements:', error)
      // TODO: Show error toast
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderRequirements = (requirements: ClassRequirement[] | undefined, type: 'subdepartment' | 'class') => {
    const hasRequirements = requirements && requirements.length > 0;
    const requirementsList = [...(requirements || [])];
    
    const handleAddMultipleClick = () => {
      openMultipleRequirementsDialog(type);
    };
    
    const handleMove = (index: number, direction: 'up' | 'down') => {
      handleMoveRequirement(index, direction, type, requirements || []);
    };
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">{type.charAt(0).toUpperCase() + type.slice(1)} Requirements</h3>
          <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleAddMultipleClick}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Requirements
              </Button>
          </div>
        </div>

        {!hasRequirements ? (
          <div className="p-4 text-center text-muted-foreground border rounded-md">
            No {type} requirements specified
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="w-10">Order</TableHead>
                  <TableHead className="w-1/3">Requirement</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirementsList.map((req, idx) => (
                  <TableRow key={`req-${idx}`} className="group">
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMove(idx, 'up')
                            }}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMove(idx, 'down')
                            }}
                            disabled={idx === requirementsList.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{req.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.description || 'No description provided'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteRequirement(type, idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    )


  }

  const renderSubdepartmentContent = (subdept: Subdepartment, deptId: string) => {
    const hasClasses = subdept.classes && subdept.classes.length > 0
    const hasRequirements = subdept.upload_requirements && subdept.upload_requirements.length > 0
    const subdeptKey = `${deptId}-${subdept.id}`
    
    // Initialize active class tab if not set
    if (!activeClass[subdeptKey] && hasClasses) {
      setActiveClass(prev => ({
        ...prev,
        [subdeptKey]: subdept.classes?.[0]?.name || ''
      }))
      return null
    }

    return (
      <div className="space-y-4">
        {hasRequirements && (
          <div>
            <h3 className="text-lg font-medium mb-2">Subdepartment Requirements</h3>
            {renderRequirements(subdept.upload_requirements, 'subdepartment')}
          </div>
        )}

        {hasClasses && (
          <div>
            <Tabs 
              value={activeClass[subdeptKey] || ''} 
              onValueChange={(value) => setActiveClass(prev => ({
                ...prev,
                [subdeptKey]: value
              }))}
              className="space-y-4"
            >
              <TabsList>
                {subdept.classes?.map(cls => (
                  <TabsTrigger key={cls.name} value={cls.name}>
                    {cls.name}
                    {cls.requirements?.length > 0 && (
                      <span className="ml-2 text-xs bg-muted-foreground/10 text-muted-foreground rounded-full px-2 py-0.5">
                        {cls.requirements.length}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {subdept.classes?.map(cls => (
                <TabsContent key={cls.name} value={cls.name} className="mt-0">
                  {cls.description && (
                    <p className="text-muted-foreground mb-4">{cls.description}</p>
                  )}
                  {renderRequirements(cls.requirements, 'class')}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
    )
  }

  // Add a null check for departments
  if (!departments || departments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No departments found</p>
      </div>
    )
  }

  const handleMoveRequirement = (index: number, direction: 'up' | 'down', type: 'subdepartment' | 'class', requirements: ClassRequirement[] = []) => {
    if (!editingContext) return;
    
    const updatedRequirements = moveRequirement(requirements, index, direction);
    
    if (type === 'subdepartment' && editingContext.subdepartmentId) {
      updateSubdepartmentRequirements(editingContext.subdepartmentId, updatedRequirements);
    } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
      updateClassRequirements(editingContext.subdepartmentId, editingContext.classId, updatedRequirements);
    }
  };


  return (
    <div className="space-y-6">
      {/* Department Tabs */}
      <Tabs 
        value={activeDept} 
        onValueChange={setActiveDept}
        className="space-y-4"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {departments.map((dept) => (
            <TabsTrigger key={dept.id} value={dept.id}>
              {dept.name}
              {dept.tm_subdepartments && dept.tm_subdepartments.length > 0 && (
                <span className="ml-2 text-xs bg-muted-foreground/10 text-muted-foreground rounded-full px-2 py-0.5">
                  {dept.tm_subdepartments.length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map((dept) => (
          <TabsContent key={dept.id} value={dept.id} className="mt-0 space-y-4">
            {dept.tm_subdepartments && dept.tm_subdepartments.length > 0 ? (
              <div className="space-y-6">
                {/* Subdepartment Tabs */}
                <Tabs 
                  value={activeSubdept[dept.id] || ''} 
                  onValueChange={(value) => setActiveSubdept(prev => ({
                    ...prev,
                    [dept.id]: value
                  }))}
                >
                  <TabsList className="mb-4">
                    {dept.tm_subdepartments.map((subdept) => (
                      <TabsTrigger 
                        key={subdept.id} 
                        value={subdept.id.toString()}
                        className="flex items-center gap-2"
                      >
                        {subdept.name}
                        {(subdept.upload_requirements?.length || 0) > 0 && (
                          <span className="text-xs bg-muted-foreground/10 text-muted-foreground rounded-full px-1.5">
                            {subdept.upload_requirements?.length}
                          </span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {dept.tm_subdepartments.map((subdept) => (
                    <TabsContent 
                      key={subdept.id} 
                      value={subdept.id.toString()}
                      className="mt-0"
                    >
                      {subdept.description && (
                        <p className="text-muted-foreground mb-4">{subdept.description}</p>
                      )}
                      {renderSubdepartmentContent(subdept, dept.id)}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            ) : (
              <div className="text-muted-foreground p-4 border rounded-md">
                No subdepartments found for this department.
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Requirements Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Multiple Requirements</DialogTitle>
            <DialogDescription>Add multiple requirements at once.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              {newRequirements.map((req, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Label htmlFor={`name-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Name {idx > 0 ? idx + 1 : ''}
                    </Label>
                    <Input
                      id={`name-${idx}`}
                      value={req.name}
                      onChange={(e) => handleNewRequirementChange(idx, 'name', e.target.value)}
                      placeholder="Requirement name"
                    />
                  </div>
                  <div className="col-span-6">
                    <Label htmlFor={`desc-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Description {idx > 0 ? idx + 1 : ''}
                    </Label>
                    <Input
                      id={`desc-${idx}`}
                      value={req.description}
                      onChange={(e) => handleNewRequirementChange(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => removeNewRequirement(idx)}
                      disabled={newRequirements.length <= 1}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove requirement {idx + 1}</span>
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addNewRequirement()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Another
              </Button>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddMultipleRequirements}
              disabled={!newRequirements.some(req => req.name.trim() !== '') || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Adding...
                </>
              ) : (
                `Add ${newRequirements.filter(req => req.name.trim() !== '').length} Requirements`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
    