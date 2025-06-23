// DepartmentGuidelines.tsx
// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, ChevronRight, ChevronDown, BookOpen, Layers, AlertTriangle, Eye, EyeOff, Info, FileText } from "lucide-react"
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
import { DepartmentSidebar } from "../main-shared-components/department-sidebar"
import type { Department } from "./database"

interface DepartmentGuidelinesProps {
  departments: Department[]
}

interface EditingContext {
  type: 'subdepartment' | 'class' | 'subclass'
  departmentId: string
  subdepartmentId: string
  classId?: string
  subclassId?: string
}

// Function to generate sequential guideline IDs
const generateGuidelineId = (index: number, existingGuidelines: ApiGuideline[] = []): string => {
  if (existingGuidelines.length === 0) {
    return index.toString();
  }
  
  // Find the highest existing ID
  const maxId = existingGuidelines.reduce((max, guideline) => {
    const id = parseInt(guideline.id || '0', 10);
    return isNaN(id) ? max : Math.max(max, id);
  }, -1);
  
  return (maxId + 1 + index).toString();
}

export default function DepartmentGuidelines({ departments: initialDepartments }: DepartmentGuidelinesProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments)
  const [activeDept, setActiveDept] = useState<string>('')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [activeSubclass, setActiveSubclass] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  // Handlers for sidebar interactions
  const handleDeptClick = (deptId: string) => {
    setActiveDept(deptId)
    // Reset subdepartment selection when changing department
    setActiveSubdept(prev => ({ ...prev, [deptId]: '' }))
  }

  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setActiveDept(deptId)
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
  }

  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    const subdeptKey = `${deptId}-${subdeptId}`
    setActiveDept(deptId)
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
    setActiveClass(prev => ({ ...prev, [subdeptKey]: classId }))
  }

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    const subdeptKey = `${deptId}-${subdeptId}`
    const classKey = `${subdeptKey}-${classId}`
    setActiveDept(deptId)
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
    setActiveClass(prev => ({ ...prev, [subdeptKey]: classId }))
    setActiveSubclass(prev => ({ ...prev, [classKey]: subclassId }))
  }

  // Toggle expanded state for collapsible items
  const handleToggleExpand = (key: string) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{type: string, index: number} | null>(null)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [newGuidelines, setNewGuidelines] = useState<{
    title: string, 
    content: string,
    type: 'general' | 'process' | 'warning' | 'tip',
    isImportant: boolean,
    isVisible: boolean,
    category: string
  }[]>([{
    title: '', 
    content: '',
    type: 'general',
    isImportant: false,
    isVisible: true,
    category: ''
  }])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit states
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    title: '', 
    content: '',
    type: 'general' as 'general' | 'process' | 'warning' | 'tip',
    isImportant: false,
    isVisible: true,
    category: ''
  })

  const [isReady, setIsReady] = useState(false)

  // Initialize component
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
        // Use class ID instead of name
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

  // Update departments state when prop changes
  useEffect(() => {
    setDepartments(initialDepartments)
  }, [initialDepartments])

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openGuidelinesDialog = (context: EditingContext) => {
    setEditingContext(context)
    setNewGuidelines([{ 
      title: '', 
      content: '',
      type: 'general',
      isImportant: false,
      isVisible: true,
      category: ''
    }])
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewGuidelines([{ 
      title: '', 
      content: '',
      type: 'general',
      isImportant: false,
      isVisible: true,
      category: ''
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

      // Get current guidelines
      const currentGuidelines = getCurrentGuidelinesForContext(editingContext)
      if (!currentGuidelines) return

      const updatedGuidelines = currentGuidelines.filter((_, i) => i !== index)
      await saveGuidelinesForContext(editingContext, updatedGuidelines)

      await refreshDepartments()

      toast({
        title: "Success",
        description: "Guideline deleted successfully",
        variant: "default"
      })

      setIsDeleteDialogOpen(false)
      setDeleteContext(null)

    } catch (error) {
      console.error('Error deleting guideline:', error)
      toast({
        title: "Error",
        description: "Failed to delete guideline. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper function to get current guidelines for a context
  const getCurrentGuidelinesForContext = (context: EditingContext): ApiGuideline[] | null => {
    const dept = departments.find(d => d.id === context.departmentId)
    if (!dept) return null

    const subdept = dept.tm_subdepartments?.find(s => s.id.toString() === context.subdepartmentId)
    if (!subdept) return null

    if (context.type === 'subdepartment') {
      return subdept.upload_guidelines || []
    } else if (context.type === 'class') {
      const targetClass = subdept.classes?.find(c => c.id.toString() === context.classId)
      return targetClass?.guidelines || []
    } else if (context.type === 'subclass') {
      const targetClass = subdept.classes?.find(c => c.id.toString() === context.classId)
      const targetSubclass = targetClass?.subClasses?.find(sc => sc.id.toString() === context.subclassId)
      return targetSubclass?.guidelines || []
    }

    return null
  }

  // Helper function to save guidelines for a context
  const saveGuidelinesForContext = async (context: EditingContext, guidelines: ApiGuideline[]) => {
    let classId = '';
    let guidelineType = '';

    if (context.type === 'subdepartment') {
      classId = context.subdepartmentId;
      guidelineType = 'subdepartment';
    } else if (context.type === 'class') {
      classId = `${context.subdepartmentId}_${context.classId}`;
      guidelineType = 'class';
    } else if (context.type === 'subclass') {
      classId = `${context.subdepartmentId}_${context.classId}_${context.subclassId}`;
      guidelineType = 'subclass';
    }

    const { error } = await supabase
      .from('tm_class_guidelines')
      .upsert({
        class_id: classId,
        type: guidelineType,
        guidelines: guidelines,
        updated_at: new Date().toISOString(),
        is_mandatory: true
      }, {
        onConflict: 'class_id,type'
      });

    if (error) throw error;
  }

  const refreshDepartments = async () => {
    try {
      // Fixed query - removed the incorrect join syntax
      const { data: departmentsData, error } = await supabase
        .from('tm_departments')
        .select('*, tm_subdepartments(*)')
        .order('name')

      if (error) throw error

      // Fetch all guidelines from the API structure
      const { data: guidelines, error: guidelineError } = await supabase
        .from('tm_class_guidelines')
        .select('*')
        .order('id')

      if (guidelineError) throw guidelineError

      console.log('Fetched departments:', departmentsData)
      console.log('Fetched guidelines:', guidelines)

      // Process departments and their guidelines according to API structure
      const processedDepartments = departmentsData.map(dept => {
        const subdepartments = (dept.tm_subdepartments || []).map(subdept => {
          // Process classes from JSONB column
          const classes = (subdept.classes || []).map(cls => {
            const classId = `${subdept.id}_${cls.id}`
            
            // Find class guidelines from API
            const classGuidelinesRecord = guidelines?.find(guideline => 
              guideline.class_id === classId && guideline.type === 'class'
            )
            
            console.log(`Looking for class guidelines with ID: ${classId}`, classGuidelinesRecord)
            
            const classGuidelines = classGuidelinesRecord?.guidelines?.map((g: any, idx: number) => ({
              id: g.id?.toString() || generateGuidelineId(idx, classGuidelinesRecord.guidelines),
              title: g.title || '',
              content: g.content || '',
              type: g.type || 'general',
              order: g.order || idx,
              isVisible: g.isVisible !== false,
              isImportant: g.isImportant || false,
              category: g.category || ''
            })) || []

            // Process subclasses from JSONB
            const subClasses = (cls.subClasses || []).map(subCls => {
              const subClassId = `${classId}_${subCls.id}`
              
              // Find subclass guidelines from API
              const subClassGuidelinesRecord = guidelines?.find(guideline => 
                guideline.class_id === subClassId && guideline.type === 'subclass'
              )
              
              const subClassGuidelines = subClassGuidelinesRecord?.guidelines?.map((g: any, idx: number) => ({
                id: g.id?.toString() || generateGuidelineId(idx, subClassGuidelinesRecord.guidelines),
                title: g.title || '',
                content: g.content || '',
                type: g.type || 'general',
                order: g.order || idx,
                isVisible: g.isVisible !== false,
                isImportant: g.isImportant || false,
                category: g.category || ''
              })) || []

              return {
                ...subCls,
                parentClassId: classId,
                guidelines: subClassGuidelines
              }
            })

            return {
              ...cls,
              guidelines: classGuidelines,
              subClasses
            }
          })

          // Process subdepartment guidelines
          const subdeptGuidelinesRecord = guidelines?.find(guideline => 
            guideline.class_id === subdept.id.toString() && guideline.type === 'subdepartment'
          )
          
          console.log(`Looking for subdept guidelines with ID: ${subdept.id.toString()}`, subdeptGuidelinesRecord)
          
          const uploadGuidelines = subdeptGuidelinesRecord?.guidelines?.map((g: any, idx: number) => ({
            id: g.id?.toString() || generateGuidelineId(idx, subdeptGuidelinesRecord.guidelines),
            title: g.title || '',
            content: g.content || '',
            type: g.type || 'general',
            order: g.order || idx,
            isVisible: g.isVisible !== false,
            isImportant: g.isImportant || false,
            category: g.category || ''
          })) || []

          return {
            ...subdept,
            classes,
            upload_guidelines: uploadGuidelines
          }
        })

        return {
          ...dept,
          tm_subdepartments: subdepartments,
          subdepartments: subdepartments // For backward compatibility
        }
      })

      console.log('Processed departments:', processedDepartments)
      setDepartments(processedDepartments)
    } catch (error) {
      console.error('Error refreshing departments:', error)
      toast({
        title: "Error",
        description: "Failed to refresh departments. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Call refreshDepartments on mount
  useEffect(() => {
    refreshDepartments()
  }, [])

  const addNewGuideline = () => {
    setNewGuidelines([...newGuidelines, { 
      title: '', 
      content: '',
      type: 'general',
      isImportant: false,
      isVisible: true,
      category: ''
    }])
  }

  const removeNewGuideline = (index: number) => {
    if (newGuidelines.length > 1) {
      setNewGuidelines(newGuidelines.filter((_, i) => i !== index))
    }
  }

  const handleNewGuidelineChange = (index: number, field: keyof typeof newGuidelines[0], value: any) => {
    const updated = [...newGuidelines]
    updated[index] = { ...updated[index], [field]: value }
    setNewGuidelines(updated)
  }

  const handleAddMultipleGuidelines = async () => {
    if (!editingContext) return

    const validGuidelines = newGuidelines.filter(guideline => guideline.title.trim() !== '')
    if (validGuidelines.length === 0) {
      handleCloseDialog()
      return
    }

    try {
      setIsSubmitting(true)
      
      // Get existing guidelines based on context
      let classId = '';
      let existingGuidelines: any[] = [];
      let guidelineType = '';

      if (editingContext.type === 'subdepartment') {
        classId = editingContext.subdepartmentId;
        guidelineType = 'subdepartment';
      } else if (editingContext.type === 'class') {
        classId = `${editingContext.subdepartmentId}_${editingContext.classId}`;
        guidelineType = 'class';
      } else if (editingContext.type === 'subclass') {
        classId = `${editingContext.subdepartmentId}_${editingContext.classId}_${editingContext.subclassId}`;
        guidelineType = 'subclass';
      }

      // Get existing guidelines from tm_class_guidelines
      const { data: existingGuides } = await supabase
        .from('tm_class_guidelines')
        .select('*')
        .eq('class_id', classId)
        .eq('type', guidelineType)
        .single();

      existingGuidelines = existingGuides?.guidelines || [];

      // Prepare new guidelines with proper IDs and order
      const newGuidelinesWithIds = validGuidelines.map((guideline, index) => {
        const newId = generateGuidelineId(index, existingGuidelines);
        return {
          id: newId,
          title: guideline.title.trim(),
          content: guideline.content.trim() || '',
          type: guideline.type,
          order: existingGuidelines.length + index,
          isVisible: guideline.isVisible,
          isImportant: guideline.isImportant,
          category: guideline.category.trim() || ''
        };
      });

      // Combine existing and new guidelines
      const updatedGuidelines = [...existingGuidelines, ...newGuidelinesWithIds];

      // Save to tm_class_guidelines following API structure
      const { error } = await supabase
        .from('tm_class_guidelines')
        .upsert({
          class_id: classId,
          type: guidelineType,
          guidelines: updatedGuidelines,
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
        description: `Added ${validGuidelines.length} guideline${validGuidelines.length > 1 ? 's' : ''} successfully`,
        variant: "default"
      })
  
      handleCloseDialog()
  
    } catch (error) {
      console.error('Error adding guidelines:', error)
      toast({
        title: "Error",
        description: "Failed to add guidelines. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderGuidelines = (guidelines: GuidelineTableEntry[] | null | undefined, context: EditingContext) => {
    // Ensure guidelines is always an array
    const safeGuidelines = guidelines || [];

    console.log('Rendering guidelines:', safeGuidelines, 'for context:', context)
    
    const handleEdit = (index: number) => {
      setEditingIndex(index)
      setEditForm({
        title: safeGuidelines[index].title,
        content: safeGuidelines[index].content || '',
        type: safeGuidelines[index].type || 'general',
        isImportant: safeGuidelines[index].isImportant !== false,
        isVisible: safeGuidelines[index].isVisible !== false,
        category: safeGuidelines[index].category || ''
      })
    }

    const handleSaveEdit = async () => {
      if (editingIndex === null || !editingContext) return
    
      try {
        const updatedGuidelines = [...safeGuidelines]
        updatedGuidelines[editingIndex] = {
          ...updatedGuidelines[editingIndex],
          title: editForm.title.trim(),
          content: editForm.content.trim(),
          type: editForm.type,
          isImportant: editForm.isImportant,
          isVisible: editForm.isVisible,
          category: editForm.category.trim()
        }
    
        await saveGuidelinesForContext(context, updatedGuidelines)
        await refreshDepartments()
        setEditingIndex(null)
    
        toast({
          title: "Success",
          description: "Guideline updated successfully",
          variant: "default"
        })
    
      } catch (error) {
        console.error('Error updating guideline:', error)
        toast({
          title: "Error",
          description: "Failed to update guideline. Please try again.",
          variant: "destructive"
        })
      }
    }
 
    const handleMove = async (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= safeGuidelines.length) return
    
      try {
        const updatedGuidelines = [...safeGuidelines]
        ;[updatedGuidelines[index], updatedGuidelines[newIndex]] = 
         [updatedGuidelines[newIndex], updatedGuidelines[index]]
    
        // Update order values
        updatedGuidelines.forEach((guideline, i) => {
          guideline.order = i
        })
    
        await saveGuidelinesForContext(context, updatedGuidelines)
        await refreshDepartments()
    
      } catch (error) {
        console.error('Error moving guideline:', error)
        toast({
          title: "Error",
          description: "Failed to move guideline. Please try again.",
          variant: "destructive"
        })
      }
    }
 
    const getTypeIcon = (type: string) => {
      switch (type) {
        case 'warning':
          return <AlertTriangle className="h-4 w-4 text-yellow-500" />
        case 'process':
          return <FileText className="h-4 w-4 text-blue-500" />
        case 'tip':
          return <Info className="h-4 w-4 text-green-500" />
        default:
          return <BookOpen className="h-4 w-4 text-gray-500" />
      }
    }
 
    const getTypeBadgeVariant = (type: string) => {
      switch (type) {
        case 'warning':
          return 'destructive'
        case 'process':
          return 'default'
        case 'tip':
          return 'secondary'
        default:
          return 'outline'
      }
    }
 
    return (
      <div className="relative h-[calc(80vh-200px)] border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-24">Category</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-56">Actions</TableHead>
           </TableRow>
         </TableHeader>
         <TableBody>
           {safeGuidelines.length > 0 ? (
             safeGuidelines.map((guideline, idx) => (
               <TableRow key={guideline.id || guideline.tempId || idx} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                 <TableCell className="font-medium">
                   <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs">
                     {idx + 1}
                   </span>
                 </TableCell>
                 <TableCell>
                   {editingIndex === idx ? (
                     <Input
                       value={editForm.title}
                       onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                       className="h-9"
                       autoFocus
                     />
                   ) : (
                     <div className="flex items-center space-x-2">
                       {getTypeIcon(guideline.type)}
                       <span className="font-medium">{guideline.title}</span>
                       {guideline.isImportant && (
                         <AlertTriangle className="h-3 w-3 text-red-500" />
                       )}
                     </div>
                   )}
                 </TableCell>
                 <TableCell>
                   {editingIndex === idx ? (
                     <Textarea
                       value={editForm.content}
                       onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                       className="min-h-[60px]"
                       placeholder="Guideline content"
                     />
                   ) : (
                     <div className="max-w-xs">
                       <p className={cn(
                         "text-sm line-clamp-3",
                         !guideline.content ? 'text-gray-400 italic' : ''
                       )}>
                         {guideline.content || 'No content'}
                       </p>
                     </div>
                   )}
                 </TableCell>
                 <TableCell>
                   {editingIndex === idx ? (
                     <select
                       value={editForm.type}
                       onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                       className="h-9 px-2 border rounded"
                     >
                       <option value="general">General</option>
                       <option value="process">Process</option>
                       <option value="warning">Warning</option>
                       <option value="tip">Tip</option>
                     </select>
                   ) : (
                     <Badge variant={getTypeBadgeVariant(guideline.type)}>
                       {guideline.type}
                     </Badge>
                   )}
                 </TableCell>
                 <TableCell>
                   {editingIndex === idx ? (
                     <Input
                       value={editForm.category}
                       onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                       className="h-9"
                       placeholder="Category"
                     />
                   ) : (
                     <span className={cn(
                       "text-xs px-2 py-1 rounded-full",
                       guideline.category 
                         ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" 
                         : "text-gray-400 italic"
                     )}>
                       {guideline.category || 'No category'}
                     </span>
                   )}
                 </TableCell>
                 <TableCell>
                   {editingIndex === idx ? (
                     <div className="flex flex-col space-y-1">
                       <label className="flex items-center space-x-1">
                         <Checkbox
                           checked={editForm.isImportant}
                           onCheckedChange={(checked) => setEditForm({ ...editForm, isImportant: Boolean(checked) })}
                         />
                         <span className="text-xs">Important</span>
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
                         {guideline.isImportant ? (
                           <AlertTriangle className="h-3 w-3 text-red-500" />
                         ) : (
                           <div className="h-3 w-3" />
                         )}
                         <span className="text-xs">{guideline.isImportant ? 'Important' : 'Normal'}</span>
                       </div>
                       <div className="flex items-center space-x-1">
                         {guideline.isVisible ? (
                           <Eye className="h-3 w-3 text-green-500" />
                         ) : (
                           <EyeOff className="h-3 w-3 text-gray-400" />
                         )}
                         <span className="text-xs">{guideline.isVisible ? 'Visible' : 'Hidden'}</span>
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
                          disabled={idx === safeGuidelines.length - 1}
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
              <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                <div className="flex flex-col items-center space-y-2">
                  <BookOpen className="h-8 w-8 text-gray-400" />
                  <p>No guidelines added yet</p>
                  <p className="text-xs text-gray-400">Click the button above to add guidelines</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// Main content area with sidebar and guidelines
const renderSidebarView = () => {
  return (
    <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden">
      {/* Department Sidebar */}
      <DepartmentSidebar
        departments={departments}
        activeDept={activeDept}
        activeSubdept={activeSubdept[activeDept] || ''}
        onDeptClick={handleDeptClick}
        onSubdeptClick={handleSubdeptClick}
        onClassClick={handleClassClick}
        onSubclassClick={handleSubclassClick}
        onToggleExpand={handleToggleExpand}
        expandedItems={expandedItems}
      />

      {/* Main Content */}
      <div className="flex-1 p-6 bg-white dark:bg-gray-900">
        {renderMainContent()}
      </div>
</div>
     
    )
}

const renderMainContent = () => {
  const currentDept = departments.find(d => d.id === activeDept)
  if (!currentDept) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium">Select a department</p>
          <p className="text-sm">Choose a department from the sidebar to view its guidelines</p>
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
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">Select a subdepartment</p>
            <p className="text-sm">Choose a subdepartment to view and manage guidelines</p>
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
        // Show subclass guidelines
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium flex items-center space-x-2">
              <BookOpen className="h-5 w-5 text-orange-600" />
              <span>Sub-class Guidelines: {currentSubclass.name}</span>
            </h4>
            <Button
              onClick={() => openGuidelinesDialog({
                type: 'subclass',
                departmentId: currentDept.id,
                subdepartmentId: currentSubdept.id,
                classId: currentClass?.id.toString(),
                subclassId: currentSubclass.id.toString()
              })}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Guidelines
            </Button>
          </div>
          {renderGuidelines(currentSubclass.guidelines, {
            type: 'subclass',
            departmentId: currentDept.id,
            subdepartmentId: currentSubdept.id,
            classId: currentClass?.id.toString(),
            subclassId: currentSubclass.id.toString()
          })}
        </div>
      ) : currentClass ? (
        // Show class guidelines
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium flex items-center space-x-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <span>Class Guidelines: {currentClass.name}</span>
            </h4>
            <Button
              onClick={() => openGuidelinesDialog({
                type: 'class',
                departmentId: currentDept.id,
                subdepartmentId: currentSubdept.id,
                classId: currentClass.id.toString()
              })}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Guidelines
            </Button>
          </div>
          {renderGuidelines(currentClass.guidelines, {
            type: 'class',
            departmentId: currentDept.id,
            subdepartmentId: currentSubdept.id,
            classId: currentClass.id.toString()
          })}
        </div>
      ) : (
        // Show subdepartment guidelines
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium flex items-center space-x-2">
              <BookOpen className="h-5 w-5 text-green-600" />
              <span>Subdepartment Guidelines</span>
            </h4>
            <Button
              onClick={() => openGuidelinesDialog({
                type: 'subdepartment',
                departmentId: currentDept.id,
                subdepartmentId: currentSubdept.id
              })}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Guidelines
            </Button>
          </div>
          {renderGuidelines(currentSubdept.upload_guidelines, {
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
        <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-600">No departments found</p>
        <p className="text-sm text-gray-500">Create departments first to manage guidelines</p>
      </div>
    </div>
  )
}

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Department Guidelines</h1>
        </div>
        {renderSidebarView()}
      </div>

      {/* Delete Confirmation Dialog */}
    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Guideline</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this guideline? This action cannot be undone.
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

    {/* Add Guidelines Dialog */}
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Multiple Guidelines</DialogTitle>
          <DialogDescription>
            Add multiple guidelines to {editingContext?.type === 'subdepartment' ? 'subdepartment' : 
              editingContext?.type === 'class' ? 'class' : 'sub-class'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {newGuidelines.map((guideline, idx) => (
              <Card key={idx} className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-l-4 border-l-purple-500">
                <div className="space-y-4">
                  {/* Title and Remove Button */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold flex items-center">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Guideline {idx + 1}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => removeNewGuideline(idx)}
                      disabled={newGuidelines.length <= 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Title Input */}
                  <div className="space-y-2">
                    <Label htmlFor={`title-${idx}`}>
                      Title *
                    </Label>
                    <Input
                      id={`title-${idx}`}
                      value={guideline.title}
                      onChange={(e) => handleNewGuidelineChange(idx, 'title', e.target.value)}
                      placeholder="Enter guideline title"
                      className="font-medium"
                    />
                  </div>

                  {/* Content Textarea */}
                  <div className="space-y-2">
                    <Label htmlFor={`content-${idx}`}>
                      Content
                    </Label>
                    <Textarea
                      id={`content-${idx}`}
                      value={guideline.content}
                      onChange={(e) => handleNewGuidelineChange(idx, 'content', e.target.value)}
                      placeholder="Enter detailed guideline content..."
                      className="min-h-[100px]"
                    />
                  </div>

                  {/* Type and Category Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`type-${idx}`}>
                        Type
                      </Label>
                      <select
                        id={`type-${idx}`}
                        value={guideline.type}
                        onChange={(e) => handleNewGuidelineChange(idx, 'type', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      >
                        <option value="general">📋 General</option>
                        <option value="process">⚙️ Process</option>
                        <option value="warning">⚠️ Warning</option>
                        <option value="tip">💡 Tip</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`category-${idx}`}>
                        Category
                      </Label>
                      <Input
                        id={`category-${idx}`}
                        value={guideline.category}
                        onChange={(e) => handleNewGuidelineChange(idx, 'category', e.target.value)}
                        placeholder="e.g., Documentation, Process, Safety"
                      />
                    </div>
                  </div>
                  
                  {/* Checkboxes for properties */}
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center space-x-2">
                      <Checkbox
                        checked={guideline.isImportant}
                        onCheckedChange={(checked) => handleNewGuidelineChange(idx, 'isImportant', Boolean(checked))}
                      />
                      <span className="text-sm flex items-center">
                        <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
                        Mark as Important
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <Checkbox
                        checked={guideline.isVisible}
                        onCheckedChange={(checked) => handleNewGuidelineChange(idx, 'isVisible', Boolean(checked))}
                      />
                      <span className="text-sm flex items-center">
                        <Eye className="h-3 w-3 mr-1 text-green-500" />
                        Visible to Users
                      </span>
                    </label>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addNewGuideline}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Another Guideline
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseDialog}>
            Cancel
          </Button>
          <Button
            onClick={handleAddMultipleGuidelines}
            disabled={!newGuidelines.some(guideline => guideline.title.trim() !== '') || isSubmitting}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Adding...
              </>
            ) : (
              `Add ${newGuidelines.filter(guideline => guideline.title.trim() !== '').length} Guidelines`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)
}