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
import supabase from "@/lib/supabase/client"

type ClassRate = {
  name: string
  description: string | null
}

type SubdepartmentClass = {
  name: string
  description: string | null
  rates: ClassRate[]
}

type Subdepartment = {
  id: number
  name: string
  description: string | null
  classes?: SubdepartmentClass[]
  upload_rates?: ClassRate[]
}

type Department = {
  id: string
  name: string
  description: string
  tm_subdepartments?: Subdepartment[]
}

interface RatesProps {
  departments: Department[]
}

export default function Rates({ departments: initialDepartments }: RatesProps) {
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
  const [newRates, setNewRates] = useState<Array<{ name: string; description: string }>>([{ name: '', description: '' }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{name: string; description: string}>({ name: '', description: '' });
  
  // Initialize active subdepartment and editing context
  useEffect(() => {
    const currentDept = departments.find(d => d.id === activeDept) || departments[0];
    if (!currentDept) return;
    
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

  const openMultipleRatesDialog = (
    type: 'subdepartment' | 'class'
  ) => {
    setEditingContext({
      type,
      departmentId: activeDept,
      subdepartmentId: activeSubdept[activeDept],
      classId: activeClass[activeSubdept[activeDept] || ''] || ''
    })
    
    // Initialize with one empty rate
    setNewRates([{ name: '', description: '' }])
    setIsDialogOpen(true)
  }

  const updateSubdepartmentRates = (subdepartmentId: string, updatedRates: ClassRate[]) => {
    setDepartments(prevDepartments => 
      prevDepartments.map(dept => ({
        ...dept,
        tm_subdepartments: dept.tm_subdepartments?.map(subdept => 
          subdept.id.toString() === subdepartmentId 
            ? { ...subdept, upload_rates: updatedRates }
            : subdept
        ) || []
      }))
    )
  }

  const updateClassRates = (subdepartmentId: string, className: string, updatedRates: ClassRate[]) => {
    setDepartments(prevDepartments => 
      prevDepartments.map(dept => ({
        ...dept,
        tm_subdepartments: dept.tm_subdepartments?.map(subdept => ({
          ...subdept,
          classes: subdept.classes?.map(cls => 
            cls.name === className 
              ? { ...cls, rates: updatedRates }
              : cls
          ) || []
        })) || []
      }))
    )
  }

  const saveSubdepartmentRate = async (
    rate: { name: string; description: string | null }, 
    subdepartmentId?: string, 
    index?: number
  ) => {
    if (!subdepartmentId) return;
    
    try {
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      
      if (!subdept) return;
      
      const currentRates = subdept.upload_rates || [];
      const updatedRates = 
        index !== undefined && index >= 0
          ? currentRates.map((r, i) => (i === index ? rate : r))
          : [...currentRates, rate];
      
      // Update local state immediately for better UX
      updateSubdepartmentRates(subdepartmentId, updatedRates);
      
      // Update database
      const { error } = await supabase
        .from('tm_subdepartments')
        .update({ upload_rates: updatedRates })
        .eq('id', subdepartmentId);
      
      if (error) throw error;
      
      // Show success message
      // toast.success('Rates updated successfully');
      
    } catch (error) {
      console.error('Error saving subdepartment rate:', error);
      // Revert local state on error
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      if (subdept) {
        updateSubdepartmentRates(subdepartmentId, subdept.upload_rates || []);
      }
      // Show error message
      // toast.error('Failed to update rates');
    }
  }
  
  const saveClassRate = async (
    rate: { name: string; description: string | null }, 
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
      
      const currentRates = targetClass.rates || [];
      const updatedRates = 
        index !== undefined && index >= 0
          ? currentRates.map((r, i) => (i === index ? rate : r))
          : [...currentRates, rate];
      
      // Update local state immediately for better UX
      updateClassRates(subdepartmentId, className, updatedRates);
      
      // Get current subdepartment data
      const { data: subdeptData, error: fetchError } = await supabase
        .from('tm_subdepartments')
        .select('classes')
        .eq('id', subdepartmentId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Update the class rates in the classes array
      const updatedClasses = subdeptData.classes.map((cls: any) => 
        cls.name === className 
          ? { ...cls, rates: updatedRates }
          : cls
      );
      
      // Save back to database
      const { error: updateError } = await supabase
        .from('tm_subdepartments')
        .update({ classes: updatedClasses })
        .eq('id', subdepartmentId);
      
      if (updateError) throw updateError;
      
      // Show success message
      // toast.success('Class rates updated successfully');
      
    } catch (error) {
      console.error('Error saving class rate:', error);
      // Revert local state on error
      const subdept = departments
        .flatMap(dept => dept.tm_subdepartments || [])
        .find(sd => sd.id.toString() === subdepartmentId);
      
      if (subdept) {
        const targetClass = subdept.classes?.find(cls => cls.name === className);
        if (targetClass) {
          updateClassRates(subdepartmentId, className, targetClass.rates || []);
        }
      }
      // Show error message
      // toast.error('Failed to update class rates');
    }
  }
  
  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewRates([{ name: '', description: '' }])
  }

  const handleDeleteRate = async (type: 'subdepartment' | 'class', index: number) => {
    if (!confirm(`Are you sure you want to delete this ${type} rate?`)) return
    
    try {
      if (!editingContext) return
      
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        const subdept = departments
          .flatMap(dept => dept.tm_subdepartments || [])
          .find(sd => sd.id.toString() === editingContext.subdepartmentId)
        
        if (!subdept?.upload_rates) return
        
        const updatedRates = subdept.upload_rates.filter((_, i) => i !== index)
        updateSubdepartmentRates(editingContext.subdepartmentId, updatedRates)
        
        // TODO: Implement actual API call to delete from database
        // const { error } = await supabase
        //   .from('tm_subdepartments')
        //   .update({ upload_rates: updatedRates })
        //   .eq('id', editingContext.subdepartmentId)
        // 
        // if (error) throw error
        
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        const subdept = departments
          .flatMap(dept => dept.tm_subdepartments || [])
          .find(sd => sd.id.toString() === editingContext.subdepartmentId)
        
        const targetClass = subdept?.classes?.find(cls => cls.name === editingContext.classId)
        if (!targetClass?.rates) return
        
        const updatedRates = targetClass.rates.filter((_, i) => i !== index)
        updateClassRates(editingContext.subdepartmentId, editingContext.classId, updatedRates)
        
        // TODO: Implement actual API call to delete from database
      }
      
    } catch (error) {
      console.error('Error deleting rate:', error)
      // TODO: Show error toast
    }
  }

  const addNewRate = () => {
    setNewRates([...newRates, { name: '', description: '' }])
  }

  const removeNewRate = (index: number) => {
    const updated = [...newRates]
    updated.splice(index, 1)
    setNewRates(updated)
  }

  const handleNewRateChange = (index: number, field: 'name' | 'description', value: string) => {
    const updated = [...newRates]
    updated[index] = { ...updated[index], [field]: value }
    setNewRates(updated)
  }

  const handleAddMultipleRates = async () => {
    if (!editingContext) return
    
    // Filter out empty rates
    const validRates = newRates.filter(req => req.name.trim() !== '')
    
    if (validRates.length === 0) {
      handleCloseDialog()
      return
    }
    
    try {
      setIsSubmitting(true)
      
      if (editingContext.type === 'subdepartment' && editingContext.subdepartmentId) {
        await Promise.all(
          validRates.map(req => 
            saveSubdepartmentRate(
              { name: req.name, description: req.description || null },
              editingContext.subdepartmentId
            )
          )
        )
      } else if (editingContext.type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        await Promise.all(
          validRates.map(req => 
            saveClassRate(
              { name: req.name, description: req.description || null },
              editingContext.subdepartmentId,
              editingContext.classId
            )
          )
        )
      }
      
      handleCloseDialog()
    } catch (error) {
      console.error('Error adding rates:', error)
      // TODO: Show error toast
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderRates = (rates: ClassRate[] | undefined, type: 'subdepartment' | 'class', context: typeof editingContext) => {
    const hasRates = rates && rates.length > 0;
    const ratesList = [...(rates || [])];
    
    const handleMove = (index: number, direction: 'up' | 'down') => {
      if (!rates || !context) return;
      handleMoveRate(index, direction, type, rates);
    };

    const handleEdit = (index: number) => {
      setEditingIndex(index);
      setEditForm({
        name: ratesList[index].name,
        description: ratesList[index].description || ''
      });
    };

    const handleSaveEdit = async () => {
      if (editingIndex === null || !context) return;
      
      const updatedRate = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null
      };

      if (type === 'subdepartment' && context.subdepartmentId) {
        await saveSubdepartmentRate(updatedRate, context.subdepartmentId, editingIndex);
      } else if (type === 'class' && context.subdepartmentId && context.classId) {
        await saveClassRate(updatedRate, context.subdepartmentId, context.classId, editingIndex);
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
                <TableHead className="w-1/3">Rate</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasRates ? ratesList.map((req, idx) => (
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
                            disabled={idx === ratesList.length - 1}
                            title="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:bg-red-50"
                            onClick={() => handleDeleteRate(type, idx)}
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
                    No rates added yet
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
    
    // Create context for rates rendering
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
                      {cls.rates?.length > 0 && (
                        <span className="ml-2 text-xs bg-muted-foreground/10 text-muted-foreground rounded-full px-2 py-0.5">
                          {cls.rates.length}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openMultipleRatesDialog('class')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rates
                </Button>
              </div>

              {subdept.classes?.map(cls => (
                <TabsContent key={cls.name} value={cls.name} className="mt-0 space-y-4">
                  {cls.description && (
                    <p className="text-muted-foreground">{cls.description}</p>
                  )}
                  {renderRates(cls.rates, 'class', context)}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Subdepartment Rates</h3>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openMultipleRatesDialog('subdepartment')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Rates
              </Button>
            </div>
            {renderRates(subdept.upload_rates, 'subdepartment', context)}
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

  const moveRate = (rates: ClassRate[], currentIndex: number, direction: 'up' | 'down'): ClassRate[] => {
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Check if the move is valid
    if (newIndex < 0 || newIndex >= rates.length) {
      return rates;
    }
    
    // Create a new array with the items swapped
    const newRates = [...rates];
    [newRates[currentIndex], newRates[newIndex]] = 
      [newRates[newIndex], newRates[currentIndex]];
    
    return newRates;
  };

  const handleMoveRate = async (index: number, direction: 'up' | 'down', type: 'subdepartment' | 'class', rates: ClassRate[] = []) => {
    if (!editingContext) return;
    
    const updatedRates = moveRate(rates, index, direction);
    
    try {
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        // Update local state immediately for better UX
        updateSubdepartmentRates(editingContext.subdepartmentId, updatedRates);
        
        // Update database
        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ upload_rates: updatedRates })
          .eq('id', editingContext.subdepartmentId);
          
        if (error) throw error;
        
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        // Update local state immediately for better UX
        updateClassRates(editingContext.subdepartmentId, editingContext.classId, updatedRates);
        
        // Get current subdepartment data
        const { data: subdeptData, error: fetchError } = await supabase
          .from('tm_subdepartments')
          .select('classes')
          .eq('id', editingContext.subdepartmentId)
          .single();
          
        if (fetchError) throw fetchError;
        
        // Update the class rates in the classes array
        const updatedClasses = subdeptData.classes.map((cls: any) => 
          cls.name === editingContext.classId 
            ? { ...cls, rates: updatedRates }
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
      console.error('Error moving rate:', error);
      // TODO: Show error toast to user
      // Revert local state on error
      if (type === 'subdepartment' && editingContext.subdepartmentId) {
        updateSubdepartmentRates(editingContext.subdepartmentId, rates);
      } else if (type === 'class' && editingContext.subdepartmentId && editingContext.classId) {
        updateClassRates(editingContext.subdepartmentId, editingContext.classId, rates);
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
                        {(subdept.upload_rates?.length || 0) > 0 && (
                          <span className="text-xs bg-muted-foreground/10 text-muted-foreground rounded-full px-1.5">
                            {subdept.upload_rates?.length}
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

      {/* Rates Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Multiple Rates</DialogTitle>
            <DialogDescription>Add multiple rates at once.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              {newRates.map((req, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Label htmlFor={`name-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Name {idx > 0 ? idx + 1 : ''}
                    </Label>
                    <Input
                      id={`name-${idx}`}
                      value={req.name}
                      onChange={(e) => handleNewRateChange(idx, 'name', e.target.value)}
                      placeholder="Rate name"
                    />
                  </div>
                  <div className="col-span-6">
                    <Label htmlFor={`desc-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Description {idx > 0 ? idx + 1 : ''}
                    </Label>
                    <Input
                      id={`desc-${idx}`}
                      value={req.description}
                      onChange={(e) => handleNewRateChange(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => removeNewRate(idx)}
                      disabled={newRates.length <= 1}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove rate {idx + 1}</span>
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addNewRate()}
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
              onClick={handleAddMultipleRates}
              disabled={!newRates.some(req => req.name.trim() !== '') || isSubmitting}
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
                `Add ${newRates.filter(req => req.name.trim() !== '').length} Rates`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
    