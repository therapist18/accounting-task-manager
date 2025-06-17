// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{
    type: 'subdepartment' | 'class'
    index: number
  } | null>(null)
  const [editingContext, setEditingContext] = useState<{
    type: 'subdepartment' | 'class'
    departmentId: string
    subdepartmentId?: string
    classId?: string
  } | null>(null)
  const [newRequirements, setNewRequirements] = useState<Array<{ name: string; description: string }>>([{ name: '', description: '' }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{name: string; description: string}>({ name: '', description: '' });
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedSubdept, setSelectedSubdept] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  
  // Initialize selected department when departments change
  useEffect(() => {
    if (departments.length > 0 && !selectedDept) {
      const deptId = departments[0].id;
      setSelectedDept(deptId);
      
      // Also set the first subdepartment if available
      const firstSubdept = departments[0].tm_subdepartments?.[0];
      if (firstSubdept) {
        setSelectedSubdept(firstSubdept.id.toString());
      }
    }
  }, [departments]);
  
  // Initialize active subdepartment and editing context
  useEffect(() => {
    const currentDept = departments.find(d => d.id === activeDept) || departments[0];
    if (!currentDept) {
      return;
    }
    
    let subdeptId = activeSubdept[currentDept.id];
    let classId = '';
    
    // Set active subdepartment if not set
    if (currentDept.tm_subdepartments?.length) {
      if (!subdeptId) {
        subdeptId = currentDept.tm_subdepartments[0].id.toString();
        setActiveSubdept(prev => ({
          ...prev,
          [currentDept.id]: subdeptId
        }));
      }
      
      // Set active class if not set
      const currentSubdept = currentDept.tm_subdepartments.find(sd => sd.id.toString() === subdeptId);
      if (currentSubdept?.classes?.length) {
        const subdeptKey = `${currentDept.id}-${subdeptId}`;
        if (!activeClass[subdeptKey]) {
          classId = currentSubdept.classes[0].name;
          setActiveClass(prev => ({
            ...prev,
            [subdeptKey]: classId
          }));
        } else {
          classId = activeClass[subdeptKey];
        }
      }
      
      // Set editing context
      setEditingContext({
        type: currentSubdept?.classes?.length ? 'class' : 'subdepartment',
        departmentId: currentDept.id,
        subdepartmentId: subdeptId,
        classId: classId || undefined
      });
    }
  }, [activeDept, departments, activeSubdept, activeClass]);

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
    if (!subdepartmentId) return;
    
    try {
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      
      if (!subdept) return;
      
      const currentRequirements = subdept.upload_requirements || [];
      const updatedRequirements = 
        index !== undefined && index >= 0
          ? currentRequirements.map((r, i) => (i === index ? requirement : r))
          : [...currentRequirements, requirement];
      
      // Update local state immediately for better UX
      updateSubdepartmentRequirements(subdepartmentId, updatedRequirements);
      
      // Update database
      const { error } = await supabase
        .from('tm_subdepartments')
        .update({ upload_requirements: updatedRequirements })
        .eq('id', subdepartmentId);
      
      if (error) throw error;
      
      // Show success message
      toast({
        title: "Success",
        description: "Requirements updated successfully",
        variant: "default"
      });
      
    } catch (error) {
      console.error('Error saving subdepartment requirement:', error);
      // Revert local state on error
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      if (subdept) {
        updateSubdepartmentRequirements(subdepartmentId, subdept.upload_requirements || []);
      }
      // Show error message
      toast({
        title: "Error",
        description: "Failed to update requirements. Please try again.",
        variant: "destructive"
      });
    }
  }
  
  const saveClassRequirement = async (
    requirement: { name: string; description: string | null }, 
    subdepartmentId?: string, 
    className?: string, 
    index?: number
  ) => {
    if (!subdepartmentId || !className) return;
    
    try {
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      
      if (!subdept) return;
      
      const targetClass = subdept.classes?.find(cls => cls.name === className);
      if (!targetClass) return;
      
      const currentRequirements = targetClass.requirements || [];
      const updatedRequirements = 
        index !== undefined && index >= 0
          ? currentRequirements.map((r, i) => (i === index ? requirement : r))
          : [...currentRequirements, requirement];
      
      // Update local state immediately for better UX
      updateClassRequirements(subdepartmentId, className, updatedRequirements);
      
      // Get current subdepartment data
      const { data: subdeptData, error: fetchError } = await supabase
        .from('tm_subdepartments')
        .select('classes')
        .eq('id', subdepartmentId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Update the class requirements in the classes array
      const updatedClasses = subdeptData.classes.map((cls: any) => 
        cls.name === className 
          ? { ...cls, requirements: updatedRequirements }
          : cls
      );
      
      // Save back to database
      const { error: updateError } = await supabase
        .from('tm_subdepartments')
        .update({ classes: updatedClasses })
        .eq('id', subdepartmentId);
      
      if (updateError) throw updateError;
      
      // Show success message
      toast({
        title: "Success",
        description: "Class requirements updated successfully",
        variant: "default"
      });
      
    } catch (error) {
      console.error('Error saving class requirement:', error);
      // Revert local state on error
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      
      if (subdept) {
        const targetClass = subdept.classes?.find(cls => cls.name === className);
        if (targetClass) {
          updateClassRequirements(subdepartmentId, className, targetClass.requirements || []);
        }
      }
      // Show error message
      toast({
        title: "Error",
        description: "Failed to update class requirements. Please try again.",
        variant: "destructive"
      });
    }
  }
  
  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewRequirements([{ name: '', description: '' }])
  }

  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false)
    setDeleteContext(null)
  }

  const handleDeleteClick = (type: 'subdepartment' | 'class', index: number) => {
    setDeleteContext({ type, index })
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteContext) return
    
    const { type, index } = deleteContext
    
    try {
      if (!editingContext) return
      
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        const subdept = departments
          .flatMap(dept => dept.tm_subdepartments || [])
          .find(sd => sd.id.toString() === editingContext.subdepartmentId)
        
        if (!subdept?.upload_requirements) return
        
        const updatedRequirements = subdept.upload_requirements.filter((_, i) => i !== index)
        updateSubdepartmentRequirements(editingContext.subdepartmentId, updatedRequirements)
        
        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ upload_requirements: updatedRequirements })
          .eq('id', editingContext.subdepartmentId)
        
        if (error) throw error
        
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        const subdept = departments
          .flatMap(dept => dept.tm_subdepartments || [])
          .find(sd => sd.id.toString() === editingContext.subdepartmentId)
        
        if (!subdept) return
        
        const targetClass = subdept.classes?.find(cls => cls.name === editingContext.classId)
        if (!targetClass?.requirements) return
        
        // Update local state first for better UX
        const updatedRequirements = targetClass.requirements.filter((_, i) => i !== index)
        updateClassRequirements(editingContext.subdepartmentId, editingContext.classId, updatedRequirements)
        
        // Get current classes from the subdepartment
        const { data: currentData, error: fetchError } = await supabase
          .from('tm_subdepartments')
          .select('classes')
          .eq('id', editingContext.subdepartmentId)
          .single()
        
        if (fetchError) throw fetchError
        
        // Update only the requirements for the target class
        const updatedClasses = currentData.classes.map((cls: any) => 
          cls.name === editingContext.classId
            ? { ...cls, requirements: updatedRequirements }
            : cls
        )
        
        // Update the database with the modified classes array
        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ classes: updatedClasses })
          .eq('id', editingContext.subdepartmentId)
        
        if (error) throw error
        
        // Show success message
        toast({
          title: "Success",
          description: "Requirement deleted successfully",
          variant: "default"
        })
      }
      
      setIsDeleteDialogOpen(false)
      setDeleteContext(null)
      
    } catch (error) {
      console.error('Error deleting requirement:', error)
      toast({
        title: "Error",
        description: "Failed to delete requirement. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
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
    if (!selectedDept || !selectedSubdept) {
      toast({
        title: "Error",
        description: "Please select a department and subdepartment",
        variant: "destructive"
      });
      return;
    }

    // Filter out empty requirements
    const validRequirements = newRequirements.filter(req => req.name.trim() !== '');
    
    if (validRequirements.length === 0) {
      handleCloseDialog();
      return;
    }

    try {
      setIsSubmitting(true);

      // Get the selected department and subdepartment
      const currentDept = departments.find(d => d.id === selectedDept);
      const subdept = currentDept?.tm_subdepartments?.find(sd => sd.id.toString() === selectedSubdept);

      if (!currentDept || !subdept) {
        throw new Error('Department or subdepartment not found');
      }

      // Update local state immediately for better UX
      if (editingContext.type === 'subdepartment' || !subdept.classes?.length) {
        const currentRequirements = subdept.upload_requirements || [];
        const updatedRequirements = [...currentRequirements, ...validRequirements.map(req => ({
          name: req.name.trim(),
          description: req.description?.trim() || null
        }))];
        updateSubdepartmentRequirements(editingContext.subdepartmentId, updatedRequirements);
      } else if (editingContext.type === 'class') {
        // If classId is empty, use the first class
        const targetClass = selectedClass 
          ? subdept.classes?.find(cls => cls.name === selectedClass)
          : subdept.classes?.[0];
        
        if (!targetClass) {
          throw new Error('No valid class found');
        }

        const currentRequirements = targetClass.requirements || [];
        const updatedRequirements = [...currentRequirements, ...validRequirements.map(req => ({
          name: req.name.trim(),
          description: req.description?.trim() || null
        }))];
        
        updateClassRequirements(editingContext.subdepartmentId, targetClass.name, updatedRequirements);
      }

      // Update database
      const { data: subdeptData, error: fetchError } = await supabase
        .from('tm_subdepartments')
        .select('*')
        .eq('id', editingContext.subdepartmentId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Prepare the update data
      let updateData: any = {};
      
      if (editingContext.type === 'subdepartment' || !subdept.classes?.length) {
        // Handle subdepartment requirements
        const currentRequirements = subdeptData.upload_requirements || [];
        const newRequirements = validRequirements.map(req => ({
          name: req.name.trim(),
          description: req.description?.trim() || null
        }));
        updateData.upload_requirements = [...currentRequirements, ...newRequirements];
      } else {
        // Handle class requirements
        const targetClassName = selectedClass || (subdept.classes?.[0]?.name);
        if (!targetClassName) {
          throw new Error('No valid class found');
        }
        
        // Get current classes or initialize if not exists
        const currentClasses = Array.isArray(subdeptData.classes) ? [...subdeptData.classes] : [];
        const classIndex = currentClasses.findIndex(cls => cls.name === targetClassName);
        
        const newRequirements = validRequirements.map(req => ({
          name: req.name.trim(),
          description: req.description?.trim() || null
        }));
        
        if (classIndex >= 0) {
          // Update existing class
          const existingClass = currentClasses[classIndex];
          currentClasses[classIndex] = {
            ...existingClass,
            requirements: [...(existingClass.requirements || []), ...newRequirements]
          };
        } else {
          // Add new class with requirements
          currentClasses.push({
            name: targetClassName,
            description: null,
            requirements: newRequirements
          });
        }
        
        updateData.classes = currentClasses;
      }

      // Update the database
      const { error: updateError } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', editingContext.subdepartmentId)
        .select('*');
        
      // Refresh the data after successful update
      if (!updateError) {
        const { data: updatedData, error: refreshError } = await supabase
          .from('tm_subdepartments')
          .select('*')
          .eq('id', editingContext.subdepartmentId)
          .single();
          
        if (!refreshError && updatedData) {
          // Update local state with fresh data from database
          const updatedDepartments = departments.map(dept => ({
            ...dept,
            tm_subdepartments: dept.tm_subdepartments?.map(sd => 
              sd.id.toString() === editingContext.subdepartmentId ? updatedData : sd
            ) || []
          }));
          setDepartments(updatedDepartments);
        }
      }

      if (updateError) {
        // Revert local state on error
        if (editingContext.type === 'subdepartment') {
          updateSubdepartmentRequirements(editingContext.subdepartmentId, subdept.upload_requirements || []);
        } else if (editingContext.type === 'class' && editingContext.classId) {
          const targetClass = subdept.classes?.find(cls => cls.name === editingContext.classId);
          if (targetClass) {
            updateClassRequirements(editingContext.subdepartmentId, editingContext.classId, targetClass.requirements || []);
          }
        }
        throw updateError;
      }

      // Show success message
      toast({
        title: "Success",
        description: `Added ${validRequirements.length} requirement${validRequirements.length > 1 ? 's' : ''} successfully`,
        variant: "default"
      });

      handleCloseDialog();
    } catch (error) {
      console.error('Error adding requirements:', error);
      toast({
        title: "Error",
        description: "Failed to add requirements. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const renderRequirements = (requirements: ClassRequirement[] | undefined, type: 'subdepartment' | 'class', context: typeof editingContext) => {
    const handleDeleteClickWrapper = (e: React.MouseEvent, index: number) => {
      e.stopPropagation()
      handleDeleteClick(type, index)
    }
    const hasRequirements = requirements && requirements.length > 0;
    const requirementsList = [...(requirements || [])];
    
    const handleMove = (index: number, direction: 'up' | 'down') => {
      if (!requirements || !context) return;
      handleMoveRequirement(index, direction, type, requirements);
    };

    const handleEdit = (index: number) => {
      setEditingIndex(index);
      setEditForm({
        name: requirementsList[index].name,
        description: requirementsList[index].description || ''
      });
    };

    const handleSaveEdit = async () => {
      if (editingIndex === null || !context) return;
      
      const updatedRequirement = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null
      };

      if (type === 'subdepartment' && context.subdepartmentId) {
        await saveSubdepartmentRequirement(updatedRequirement, context.subdepartmentId, editingIndex);
      } else if (type === 'class' && context.subdepartmentId && context.classId) {
        await saveClassRequirement(updatedRequirement, context.subdepartmentId, context.classId, editingIndex);
      }
      
      setEditingIndex(null);
    };
    
    return (
      <div className="space-y-4">
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-1/3">Requirement</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasRequirements ? requirementsList.map((req, idx) => (
                <TableRow key={`req-${idx}`} className="group">
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">
                    {editingIndex === idx ? (
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      req.name
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {editingIndex === idx ? (
                      <Input
                        value={editForm.description}
                        onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                        className="h-8"
                        placeholder="No description"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                    ) : (
                      req.description || <span className="text-muted-foreground/50">No description</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {editingIndex === idx ? (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-green-50"
                            onClick={handleSaveEdit}
                            title="Save"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setEditingIndex(null)}
                            title="Cancel"
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-blue-50"
                            onClick={() => handleEdit(idx)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5 text-blue-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMove(idx, 'up');
                            }}
                            disabled={idx === 0}
                            title="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMove(idx, 'down');
                            }}
                            disabled={idx === requirementsList.length - 1}
                            title="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:bg-red-50"
                            onClick={(e) => handleDeleteClickWrapper(e, idx)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No requirements added yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  const renderSubdepartmentContent = (subdept: Subdepartment, deptId: string) => {
    const hasClasses = subdept.classes && subdept.classes.length > 0;
    const subdeptKey = `${deptId}-${subdept.id}`;
    const currentClass = activeClass[subdeptKey];
    
    // Update editing context when subdepartment or class changes
    useEffect(() => {
      setEditingContext({
        type: hasClasses ? 'class' : 'subdepartment',
        departmentId: deptId,
        subdepartmentId: subdept.id.toString(),
        classId: hasClasses ? currentClass : undefined
      });
    }, [deptId, subdept.id, hasClasses, currentClass]);
    
    // Create context for requirements rendering
    const context = {
      type: hasClasses ? 'class' as const : 'subdepartment' as const,
      departmentId: deptId,
      subdepartmentId: subdept.id.toString(),
      classId: hasClasses ? activeClass[subdeptKey] : undefined
    };

    return (
      <div className="space-y-6">
        {hasClasses ? (
          <div className="space-y-4">
            <Tabs 
              value={activeClass[subdeptKey] || ''} 
              onValueChange={(value) => setActiveClass(prev => ({
                ...prev,
                [subdeptKey]: value
              }))}
              className="space-y-4"
            >
              <div className="flex justify-between items-center">
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
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openMultipleRequirementsDialog('class')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Requirements
                </Button>
              </div>

              {subdept.classes?.map(cls => (
                <TabsContent key={cls.name} value={cls.name} className="mt-0 space-y-4">
                  {cls.description && (
                    <p className="text-muted-foreground">{cls.description}</p>
                  )}
                  {renderRequirements(cls.requirements, 'class', context)}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Subdepartment Requirements</h3>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openMultipleRequirementsDialog('subdepartment')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Requirements
              </Button>
            </div>
            {renderRequirements(subdept.upload_requirements, 'subdepartment', context)}
          </div>
        )}
      </div>
    );
  }

  // Add a null check for departments
  if (!departments || departments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No departments found</p>
      </div>
    )
  }

  const moveRequirement = (requirements: ClassRequirement[], currentIndex: number, direction: 'up' | 'down'): ClassRequirement[] => {
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Check if the move is valid
    if (newIndex < 0 || newIndex >= requirements.length) {
      return requirements;
    }
    
    // Create a new array with the items swapped
    const newRequirements = [...requirements];
    [newRequirements[currentIndex], newRequirements[newIndex]] = 
      [newRequirements[newIndex], newRequirements[currentIndex]];
    
    return newRequirements;
  };

  const handleMoveRequirement = async (index: number, direction: 'up' | 'down', type: 'subdepartment' | 'class', requirements: ClassRequirement[] = []) => {
    if (!editingContext) return;
    
    const updatedRequirements = moveRequirement(requirements, index, direction);
    
    try {
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        // Update local state immediately for better UX
        updateSubdepartmentRequirements(editingContext.subdepartmentId, updatedRequirements);
        
        // Update database
        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ upload_requirements: updatedRequirements })
          .eq('id', editingContext.subdepartmentId);
          
        if (error) throw error;
        
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        // Update local state immediately for better UX
        updateClassRequirements(editingContext.subdepartmentId, editingContext.classId, updatedRequirements);
        
        // Get current subdepartment data
        const { data: subdeptData, error: fetchError } = await supabase
          .from('tm_subdepartments')
          .select('classes')
          .eq('id', editingContext.subdepartmentId)
          .single();
          
        if (fetchError) throw fetchError;
        
        // Update the class requirements in the classes array
        const updatedClasses = subdeptData.classes.map((cls: any) => 
          cls.name === editingContext.classId 
            ? { ...cls, requirements: updatedRequirements }
            : cls
        );
        
        // Save back to database
        const { error: updateError } = await supabase
          .from('tm_subdepartments')
          .update({ classes: updatedClasses })
          .eq('id', editingContext.subdepartmentId);
          
        if (updateError) throw updateError;
      }
    } catch (error) {
      console.error('Error moving requirement:', error);
      // TODO: Show error toast to user
      toast({
        title: "Error",
        description: "Failed to move requirement. Please try again.",
        variant: "destructive"
      });
      // Revert local state on error
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        updateSubdepartmentRequirements(editingContext.subdepartmentId, requirements);
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        updateClassRequirements(editingContext.subdepartmentId, editingContext.classId, requirements);
      }
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Requirement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteContext?.type} requirement? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleCloseDeleteDialog}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Requirements Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Multiple Requirements</DialogTitle>
            <DialogDescription>Add multiple requirements at once.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Department Selection */}
            <div>
              <Label htmlFor="department">Department</Label>
              <select
                id="department"
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSelectedSubdept('');
                  setSelectedClass('');
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subdepartment Selection */}
            {selectedDept && (
              <div>
                <Label htmlFor="subdepartment">Subdepartment</Label>
                <select
                  id="subdepartment"
                  value={selectedSubdept}
                  onChange={(e) => {
                    setSelectedSubdept(e.target.value);
                    setSelectedClass('');
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select Subdepartment</option>
                  {(() => {
                    if (!selectedDept) return null;
                    const dept = departments.find(d => d.id === selectedDept);
                    if (!dept?.tm_subdepartments?.length) {
                      return <option value="">No subdepartments available</option>;
                    }
                    return dept.tm_subdepartments.map((subdept) => (
                      <option key={subdept.id} value={subdept.id.toString()}>
                        {subdept.name}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            )}

            {/* Class Selection */}
            {selectedSubdept && (() => {
              // Find the selected subdepartment
              const dept = departments.find(d => d.id === selectedDept);
              if (!dept?.tm_subdepartments) return null;
              
              const subdept = dept.tm_subdepartments.find(sd => sd.id.toString() === selectedSubdept);
              if (!subdept) return null;
              
              // Only show class selection if the subdepartment has classes
              if (!subdept.classes?.length) return null;
              
              return (
                <div>
                  <Label htmlFor="class">Class</Label>
                  <select
                    id="class"
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select Class</option>
                    {subdept.classes.map((cls) => (
                      <option key={cls.name} value={cls.name}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* Requirements */}
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
              disabled={!selectedDept || !selectedSubdept || (!selectedClass && departments.find(d => d.id === selectedDept)?.tm_subdepartments?.find(sd => sd.id.toString() === selectedSubdept)?.classes?.length > 0) || !newRequirements.some(req => req.name.trim() !== '') || isSubmitting}
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