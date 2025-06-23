// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Checkbox } from "@/components/ui/checkbox"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { saveClassRequirements, saveSubUploadRequirements } from "./database"
import type { Department, Requirement, RequirementForm } from "./database"
import { DepartmentSidebar } from "@/app/(dashboard)/dashboard/departments/main-shared-components/department-sidebar"

interface UploadRequirementsProps {
  departments: Department[]
}

interface EditingContext {
  type: 'subdepartment' | 'class' | 'subclass'
  departmentId: string
  subdepartmentId: string
  classId?: string
  subclassId?: string
}

// Enhanced requirement interface based on API structure
interface ApiRequirement {
  id?: string
  name: string
  description?: string
  type: 'standard' | 'conditional' | 'optional'
  order: number
  isVisible: boolean
  isRequired: boolean
}

interface RequirementTableEntry extends ApiRequirement {
  tempId?: string
}

// Function to generate sequential requirement IDs
const generateRequirementId = (index: number, existingRequirements: ApiRequirement[] = []): string => {
  if (existingRequirements.length === 0) {
    return index.toString();
  }

  // Find the highest existing ID
  const maxId = existingRequirements.reduce((max, req) => {
    const id = parseInt(req.id || '0', 10);
    return isNaN(id) ? max : Math.max(max, id);
  }, -1);

  return (maxId + 1 + index).toString();
}

export default function UploadRequirements({ departments: initialDepartments }: UploadRequirementsProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments)
  const [activeDept, setActiveDept] = useState<string>('')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [activeSubclass, setActiveSubclass] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number } | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [newRequirements, setNewRequirements] = useState<{
    name: string,
    description: string,
    type: 'standard' | 'conditional' | 'optional',
    isRequired: boolean,
    isVisible: boolean
  }[]>([{
    name: '',
    description: '',
    type: 'standard',
    isRequired: true,
    isVisible: true
  }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    type: 'standard' as 'standard' | 'conditional' | 'optional',
    isRequired: true,
    isVisible: true
  })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (departments.length === 0 || isReady) return

    const initialDept = departments[0]?.id || ''
    setActiveDept(initialDept)

    const initialSubdept = departments[0]?.tm_subdepartments?.[0]
    if (initialSubdept) {
      const subdeptId = initialSubdept.id.toString()
      setActiveSubdept(prev => ({ ...prev, [initialDept]: subdeptId }))

      const initialClass = initialSubdept.classes?.[0]
      if (initialClass) {
        const subdeptKey = `${initialDept}-${subdeptId}`
        // Store class ID instead of name
        setActiveClass(prev => ({ ...prev, [subdeptKey]: initialClass.id.toString() }))

        const initialSubclass = initialClass.subClasses?.[0]
        if (initialSubclass) {
          const classKey = `${subdeptKey}-${initialClass.id}`
          setActiveSubclass(prev => ({ ...prev, [classKey]: initialSubclass.id.toString() }))
        }
      }
    }

    setIsReady(true)
  }, [departments, isReady])

  useEffect(() => {
    setDepartments(initialDepartments)
  }, [initialDepartments])

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openRequirementsDialog = (context: EditingContext) => {
    setEditingContext(context)
    setNewRequirements([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewRequirements([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
  }

  const handleDeleteClick = (type: string, index: number) => {
    setDeleteContext({ type, index })
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteContext || !editingContext) return

    try {
      setIsSubmitting(true)
      const { type, index } = deleteContext

      // Get current requirements first
      const currentRequirements = getCurrentRequirementsForContext(editingContext)
      if (!currentRequirements || currentRequirements.length === 0) return

      const updatedRequirements = currentRequirements.filter((_, i) => i !== index)

      // Save updated requirements
      await saveRequirementsForContext(editingContext, updatedRequirements)
      await refreshDepartments()

      toast({
        title: "Success",
        description: "Requirement deleted successfully",
        variant: "default"
      })

      setIsDeleteDialogOpen(false)
      setDeleteContext(null)

    } catch (error) {
      console.error('Error deleting requirement')
      toast({
        title: "Error",
        description: "Failed to delete requirement. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getCurrentRequirementsForContext = (context: EditingContext): ApiRequirement[] | null => {
    const dept = departments.find(d => d.id === context.departmentId)
    if (!dept) return null

    const subdept = dept.tm_subdepartments?.find(s => s.id.toString() === context.subdepartmentId)
    if (!subdept) return null

    if (context.type === 'subdepartment') {
      return subdept.upload_requirements || []
    } else if (context.type === 'class') {
      const targetClass = subdept.classes?.find(c => c.id.toString() === context.classId)
      return targetClass?.requirements || []
    } else if (context.type === 'subclass') {
      const targetClass = subdept.classes?.find(c => c.id.toString() === context.classId)
      const targetSubclass = targetClass?.subClasses?.find(sc => sc.id.toString() === context.subclassId)
      return targetSubclass?.requirements || []
    }

    return null
  }

  const saveRequirementsForContext = async (context: EditingContext, requirements: ApiRequirement[]) => {
    let classId = '';
    let requirementType = '';

    if (context.type === 'subdepartment') {
      classId = context.subdepartmentId;
      requirementType = 'subdepartment';
    } else if (context.type === 'class') {
      classId = `${context.subdepartmentId}_${context.classId}`;
      requirementType = 'class';
    } else if (context.type === 'subclass') {
      classId = `${context.subdepartmentId}_${context.classId}_${context.subclassId}`;
      requirementType = 'subclass';
    }

    const { error } = await supabase
      .from('tm_class_requirements')
      .upsert({
        class_id: classId,
        type: requirementType,
        requirements: requirements,
        updated_at: new Date().toISOString(),
        is_mandatory: true
      }, {
        onConflict: 'class_id,type'
      });

    if (error) throw error;
  }

  const refreshDepartments = async () => {
    try {
      // Fixed query - removed the incorrect join and use correct column names
      const { data: departmentsData, error } = await supabase
        .from('tm_departments')
        .select('*, tm_subdepartments(*)')
        .order('name')

      if (error) throw error

      // Fetch all requirements from the API structure
      const { data: requirements, error: reqError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .order('id')

      if (reqError) throw reqError



      // Process departments and their requirements according to API structure
      const processedDepartments = departmentsData.map(dept => {
        const subdepartments = (dept.tm_subdepartments || []).map(subdept => {
          // Process classes from JSONB column
          const classes = (subdept.classes || []).map(cls => {
            const classId = `${subdept.id}_${cls.id}`

            // Find class requirements from API
            const classRequirementsRecord = requirements?.find(req =>
              req.class_id === classId && req.type === 'class'
            )


            const classRequirements = classRequirementsRecord?.requirements?.map((r: any, idx: number) => ({
              id: r.id?.toString() || generateRequirementId(idx, classRequirementsRecord.requirements),
              name: r.name || '',
              description: r.description || '',
              type: r.type || 'standard',
              order: r.order || idx,
              isVisible: r.isVisible !== false,
              isRequired: r.isRequired !== false
            })) || []

            // Process subclasses from JSONB
            const subClasses = (cls.subClasses || []).map(subCls => {
              const subClassId = `${classId}_${subCls.id}`

              // Find subclass requirements from API
              const subClassRequirementsRecord = requirements?.find(req =>
                req.class_id === subClassId && req.type === 'subclass'
              )

              const subClassRequirements = subClassRequirementsRecord?.requirements?.map((r: any, idx: number) => ({
                id: r.id?.toString() || generateRequirementId(idx, subClassRequirementsRecord.requirements),
                name: r.name || '',
                description: r.description || '',
                type: r.type || 'standard',
                order: r.order || idx,
                isVisible: r.isVisible !== false,
                isRequired: r.isRequired !== false
              })) || []

              return {
                ...subCls,
                parentClassId: classId,
                requirements: subClassRequirements
              }
            })

            return {
              ...cls,
              requirements: classRequirements,
              subClasses
            }
          })

          // Process subdepartment requirements
          const subdeptRequirementsRecord = requirements?.find(req =>
            req.class_id === subdept.id.toString() && req.type === 'subdepartment'
          )


          const uploadRequirements = subdeptRequirementsRecord?.requirements?.map((r: any, idx: number) => ({
            id: r.id?.toString() || generateRequirementId(idx, subdeptRequirementsRecord.requirements),
            name: r.name || '',
            description: r.description || '',
            type: r.type || 'standard',
            order: r.order || idx,
            isVisible: r.isVisible !== false,
            isRequired: r.isRequired !== false
          })) || []

          return {
            ...subdept,
            classes,
            upload_requirements: uploadRequirements
          }
        })

        return {
          ...dept,
          tm_subdepartments: subdepartments,
          subdepartments: subdepartments // For backward compatibility
        }
      })


      setDepartments(processedDepartments)
    } catch (error) {
      console.error('Error refreshing departments')
      toast({
        title: "Error",
        description: "Failed to refresh departments. Please try again.",
        variant: "destructive"
      })
    }
  }

  useEffect(() => {
    refreshDepartments()
  }, [])

  const addNewRequirement = () => {
    setNewRequirements([...newRequirements, {
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
  }

  const removeNewRequirement = (index: number) => {
    if (newRequirements.length > 1) {
      setNewRequirements(newRequirements.filter((_, i) => i !== index))
    }
  }

  const handleNewRequirementChange = (index: number, field: keyof typeof newRequirements[0], value: any) => {
    const updated = [...newRequirements]
    updated[index] = { ...updated[index], [field]: value }
    setNewRequirements(updated)
  }

  const handleAddMultipleRequirements = async () => {
    if (!editingContext) return

    const validRequirements = newRequirements.filter(req => req.name.trim() !== '')
    if (validRequirements.length === 0) {
      handleCloseDialog()
      return
    }

    try {
      setIsSubmitting(true)

      // Get existing requirements based on context
      let classId = '';
      let existingRequirements: any[] = [];
      let requirementType = '';

      if (editingContext.type === 'subdepartment') {
        classId = editingContext.subdepartmentId;
        requirementType = 'subdepartment';
      } else if (editingContext.type === 'class') {
        classId = `${editingContext.subdepartmentId}_${editingContext.classId}`;
        requirementType = 'class';
      } else if (editingContext.type === 'subclass') {
        classId = `${editingContext.subdepartmentId}_${editingContext.classId}_${editingContext.subclassId}`;
        requirementType = 'subclass';
      }

      // Get existing requirements from tm_class_requirements
      const { data: existingReqs } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('class_id', classId)
        .eq('type', requirementType)
        .single();

      existingRequirements = existingReqs?.requirements || [];

      // Prepare new requirements with proper IDs and order following API structure
      const newRequirementsWithIds = validRequirements.map((req, index) => {
        const newId = generateRequirementId(index, existingRequirements);
        return {
          id: newId,
          name: req.name.trim(),
          description: req.description.trim() || '',
          type: req.type,
          order: existingRequirements.length + index,
          isVisible: req.isVisible,
          isRequired: req.isRequired
        };
      });

      // Combine existing and new requirements
      const updatedRequirements = [...existingRequirements, ...newRequirementsWithIds];

      // Save to tm_class_requirements following API structure
      const { error } = await supabase
        .from('tm_class_requirements')
        .upsert({
          class_id: classId,
          type: requirementType,
          requirements: updatedRequirements,
          updated_at: new Date().toISOString(),
          is_mandatory: true
        }, {
          onConflict: 'class_id,type',
          returning: 'minimal'
        });

      if (error) throw error;

      await refreshDepartments()

      toast({
        title: "Success",
        description: `Added ${validRequirements.length} requirement${validRequirements.length > 1 ? 's' : ''} successfully`,
        variant: "default"
      })

      handleCloseDialog()

    } catch (error) {
      console.error('Error adding requirements:', error)
      toast({
        title: "Error",
        description: "Failed to add requirements. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderRequirements = (requirements: RequirementTableEntry[] | null | undefined, context: EditingContext) => {
    // Ensure requirements is always an array
    const safeRequirements = requirements || [];



    const handleEdit = (index: number) => {
      setEditingIndex(index)
      setEditForm({
        name: safeRequirements[index].name,
        description: safeRequirements[index].description || '',
        type: safeRequirements[index].type || 'standard',
        isRequired: safeRequirements[index].isRequired !== false,
        isVisible: safeRequirements[index].isVisible !== false
      })
    }

    const handleSaveEdit = async () => {
      if (editingIndex === null || !editingContext) return

      try {
        const updatedRequirements = [...safeRequirements]
        updatedRequirements[editingIndex] = {
          ...updatedRequirements[editingIndex],
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          type: editForm.type,
          isRequired: editForm.isRequired,
          isVisible: editForm.isVisible
        }

        await saveRequirementsForContext(context, updatedRequirements)
        await refreshDepartments()
        setEditingIndex(null)

        toast({
          title: "Success",
          description: "Requirement updated successfully",
          variant: "default"
        })

      } catch (error) {
        console.error('Error updating requirement')
        toast({
          title: "Error",
          description: "Failed to update requirement. Please try again.",
          variant: "destructive"
        })
      }
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= safeRequirements.length) return

      try {
        const updatedRequirements = [...safeRequirements]
          ;[updatedRequirements[index], updatedRequirements[newIndex]] =
            [updatedRequirements[newIndex], updatedRequirements[index]]

        // Update order values
        updatedRequirements.forEach((req, i) => {
          req.order = i
        })

        await saveRequirementsForContext(context, updatedRequirements)
        await refreshDepartments()

      } catch (error) {
        console.error('Error moving requirement')
        toast({
          title: "Error",
          description: "Failed to move requirement. Please try again.",
          variant: "destructive"
        })
      }
    }

    return (
      <div className="relative h-[calc(80vh-200px)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Requirement</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-56">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {safeRequirements.length > 0 ? (
              safeRequirements.map((req, idx) => (
                <TableRow key={req.id || req.tempId || idx} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs">
                      {idx + 1}
                    </span>
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-9"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{req.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <Input
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="h-9"
                        placeholder="Description"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                    ) : (
                      <span className={!req.description ? 'text-gray-400 italic' : ''}>
                        {req.description || 'No description'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <select
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                        className="h-9 px-2 border rounded"
                      >
                        <option value="standard">Standard</option>
                        <option value="conditional">Conditional</option>
                        <option value="optional">Optional</option>
                      </select>
                    ) : (
                      <Badge variant={req.type === 'standard' ? 'default' : req.type === 'conditional' ? 'secondary' : 'outline'}>
                        {req.type}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingIndex === idx ? (
                      <div className="flex flex-col space-y-1">
                        <label className="flex items-center space-x-1">
                          <Checkbox
                            checked={editForm.isRequired}
                            onCheckedChange={(checked) => setEditForm({ ...editForm, isRequired: Boolean(checked) })}
                          />
                          <span className="text-xs">Required</span>
                        </label>
                        <label className="flex items-center space-x-1">
                          <Checkbox
                            checked={editForm.isVisible}
                            onCheckedChange={(checked) => setEditForm({ ...editForm, isVisible: Boolean(checked) })}
                          />
                          <span className="text-xs">Visible</span>
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-1">
                          {req.isRequired ? (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          ) : (
                            <div className="h-3 w-3" />
                          )}
                          <span className="text-xs">{req.isRequired ? 'Required' : 'Optional'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {req.isVisible ? (
                            <Eye className="h-3 w-3 text-green-500" />
                          ) : (
                            <EyeOff className="h-3 w-3 text-gray-400" />
                          )}
                          <span className="text-xs">{req.isVisible ? 'Visible' : 'Hidden'}</span>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      {editingIndex === idx ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-green-600"
                            onClick={handleSaveEdit}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setEditingIndex(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-600"
                            onClick={() => handleEdit(idx)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleMove(idx, 'up')}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleMove(idx, 'down')}
                            disabled={idx === safeRequirements.length - 1}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500"
                            onClick={() => handleDeleteClick(context.type, idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  <div className="flex flex-col items-center space-y-2">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <p>No requirements added yet</p>
                    <p className="text-xs text-gray-400">Click the button above to add requirements</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    )
  }

  const handleDeptClick = (deptId: string) => {
    setActiveDept(deptId);
  };

  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
    if (activeDept !== deptId) setActiveDept(deptId)
  };

  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    const activeClassKey = `${deptId}-${subdeptId}`;
    setActiveClass(prev => ({ ...prev, [activeClassKey]: classId }))
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }));
    if (activeDept !== deptId) setActiveDept(deptId)
  };

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    const activeClassKey = `${deptId}-${subdeptId}`;
    const activeSubclassKey = `${activeClassKey}-${classId}`;
    
    setActiveSubclass(prev => ({ ...prev, [activeSubclassKey]: subclassId }))
    
    setActiveClass(prev => ({ ...prev, [activeClassKey]: classId }))
    
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }));
    
    if (activeDept !== deptId) setActiveDept(deptId)
  };

  const renderMainContent = () => {
    const currentDept = departments.find(d => d.id === activeDept)
    if (!currentDept) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <Layers className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">Select a department</p>
            <p className="text-sm">Choose a department from the sidebar to view its structure</p>
          </div>
        </div>
      )
    }
 
    const currentSubdeptId = activeSubdept[currentDept.id]
    const currentSubdept = currentDept.tm_subdepartments?.find(s => s.id.toString() === currentSubdeptId)
 
    if (!currentSubdept) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentDept.name}</h2>
            {currentDept.description && (
              <p className="text-gray-600 dark:text-gray-400">{currentDept.description}</p>
            )}
          </div>
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">Select a subdepartment</p>
              <p className="text-sm">Choose a subdepartment to view and manage requirements</p>
            </div>
          </div>
        </div>
      )
    }
 
    const activeClassKey = `${currentDept.id}-${currentSubdept.id}`
    const currentClassId = activeClass[activeClassKey]
    const currentClass = currentSubdept.classes?.find(c => c.id.toString() === currentClassId)
 
    const activeSubclassKey = `${activeClassKey}-${currentClassId}`
    const currentSubclassId = activeSubclass[activeSubclassKey]
    const currentSubclass = currentClass?.subClasses?.find(sc => sc.id.toString() === currentSubclassId)
 
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentDept.name}</h2>
          <h3 className="text-lg text-gray-600 dark:text-gray-400">{currentSubdept.name}</h3>
          {currentClass && (
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant="outline">{currentClass.name}</Badge>
              {currentSubclass && (
                <>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                  <Badge variant="outline">{currentSubclass.name}</Badge>
                </>
              )}
            </div>
          )}
        </div>
 
        {/* Content based on current selection */}
        {currentSubclass ? (
          // Show subclass requirements
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium flex items-center space-x-2">
                <Layers className="h-5 w-5 text-orange-600" />
                <span>Sub-class Requirements: {currentSubclass.name}</span>
              </h4>
              <Button
                onClick={() => openRequirementsDialog({
                  type: 'subclass',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id,
                  classId: currentClass?.id.toString(),
                  subclassId: currentSubclass.id.toString()
                })}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Requirements
              </Button>
            </div>
            {renderRequirements(currentSubclass.requirements, {
              type: 'subclass',
              departmentId: currentDept.id,
              subdepartmentId: currentSubdept.id,
              classId: currentClass?.id.toString(),
              subclassId: currentSubclass.id.toString()
            })}
          </div>
        ) : currentClass ? (
          // Show class requirements
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium flex items-center space-x-2">
                <Layers className="h-5 w-5 text-purple-600" />
                <span>Class Requirements: {currentClass.name}</span>
              </h4>
              <Button
                onClick={() => openRequirementsDialog({
                  type: 'class',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id,
                  classId: currentClass.id.toString()
                })}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Requirements
              </Button>
            </div>
            {renderRequirements(currentClass.requirements, {
              type: 'class',
              departmentId: currentDept.id,
              subdepartmentId: currentSubdept.id,
              classId: currentClass.id.toString()
            })}
          </div>
        ) : (
          // Show subdepartment requirements
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium flex items-center space-x-2">
                <FileText className="h-5 w-5 text-green-600" />
                <span>Subdepartment Requirements</span>
              </h4>
              <Button
                onClick={() => openRequirementsDialog({
                  type: 'subdepartment',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id
                })}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Requirements
              </Button>
            </div>
            {renderRequirements(currentSubdept.upload_requirements, {
              type: 'subdepartment',
              departmentId: currentDept.id,
              subdepartmentId: currentSubdept.id
            })}
          </div>
        )}
      </div>
    )
  }
 
  if (!departments || departments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Layers className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-600">No departments found</p>
          <p className="text-sm text-gray-500">Create departments first to manage requirements</p>
        </div>
      </div>
    )
  }
 
  return (
    <div className="space-y-4">
      <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden">
        <DepartmentSidebar
          departments={departments}
          activeDept={activeDept}
          activeSubdept={activeSubdept}
          activeClass={activeClass}
          activeSubclass={activeSubclass}
          expandedItems={expandedItems}
          onDeptClick={handleDeptClick}
          onSubdeptClick={handleSubdeptClick}
          onClassClick={handleClassClick}
          onSubclassClick={handleSubclassClick}
          onToggleExpand={toggleExpanded}
        />

        <div className="flex-1 p-6 bg-white dark:bg-gray-900">
          {renderMainContent()}
        </div>
      </div>
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Requirement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this requirement? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
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
 
      {/* Add Requirements Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add Multiple Requirements</DialogTitle>
            <DialogDescription>
              Add multiple requirements to {editingContext?.type === 'subdepartment' ? 'subdepartment' :
                editingContext?.type === 'class' ? 'class' : 'sub-class'}
            </DialogDescription>
          </DialogHeader>
 
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {newRequirements.map((req, idx) => (
              <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label htmlFor={`name-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Requirement Name
                    </Label>
                    <Input
                      id={`name-${idx}`}
                      value={req.name}
                      onChange={(e) => handleNewRequirementChange(idx, 'name', e.target.value)}
                      placeholder="Enter requirement name"
                    />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor={`desc-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Description
                    </Label>
                    <Input
                      id={`desc-${idx}`}
                      value={req.description}
                      onChange={(e) => handleNewRequirementChange(idx, 'description', e.target.value)}
                      placeholder="Description (optional)"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor={`type-${idx}`} className={idx > 0 ? 'sr-only' : ''}>
                      Type
                    </Label>
                    <select
                      id={`type-${idx}`}
                      value={req.type}
                      onChange={(e) => handleNewRequirementChange(idx, 'type', e.target.value)}
                      className="h-10 px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="standard">Standard</option>
                      <option value="conditional">Conditional</option>
                      <option value="optional">Optional</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-red-500"
                      onClick={() => removeNewRequirement(idx)}
                      disabled={newRequirements.length <= 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
 
                {/* Checkboxes for properties */}
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={req.isRequired}
                      onCheckedChange={(checked) => handleNewRequirementChange(idx, 'isRequired', Boolean(checked))}
                    />
                    <span className="text-sm">Required</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={req.isVisible}
                      onCheckedChange={(checked) => handleNewRequirementChange(idx, 'isVisible', Boolean(checked))}
                    />
                    <span className="text-sm">Visible</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
 
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addNewRequirement}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Another Requirement
          </Button>
 
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
                  <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
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
  )
}