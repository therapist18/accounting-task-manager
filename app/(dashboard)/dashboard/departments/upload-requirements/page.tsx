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
import { EditRequirementDialog } from "./components/EditRequirementDialog"
import { AddRequirementsDialog } from "./components/AddRequirementsDialog"

interface UploadRequirementsProps {
  departments: Department[]
}

interface EditingContext {
  type: 'subdepartment' | 'class' | 'subclass'
  departmentId: string
  subdepartmentId: string
  subdepartmentName?: string
  classId?: string
  className?: string
  subclassId?: string
  subclassName?: string
}

// Also update the ApiRequirement interface
interface ApiRequirement {
  id?: string
  name: string
  description?: string
  type: 'standard' | 'conditional' | 'optional'
  order: number
  isVisible: boolean
  isRequired: boolean
  kycDocumentId?: string // Add this field
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
  const [bulkInput, setBulkInput] = useState('')
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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState<ApiRequirement | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addContext, setAddContext] = useState<EditingContext | null>(null);

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
    // Find the department and subdepartment
    const dept = departments.find(d => d.id === context.departmentId);

    // Convert subdepartmentId to number for comparison if needed
    const subdeptId = typeof context.subdepartmentId === 'string'
      ? parseInt(context.subdepartmentId, 10)
      : context.subdepartmentId;

    const subdept = dept?.tm_subdepartments?.find(s =>
      s.id === subdeptId || s.id.toString() === context.subdepartmentId.toString()
    );

    // Get class and subclass names if they exist
    let className = '';
    let subclassName = '';

    if (context.classId && subdept) {
      const classItem = subdept.classes?.find(c =>
        c.id.toString() === context.classId?.toString() ||
        c.id === context.classId
      );

      if (classItem) {
        className = classItem.name;

        if (context.subclassId) {
          const subclassItem = classItem.subClasses?.find(sc =>
            sc.id.toString() === context.subclassId?.toString() ||
            sc.id === context.subclassId
          );

          if (subclassItem) {
            subclassName = subclassItem.name;
          }
        }
      }
    }

    // Create enhanced context with names
    const enhancedContext = {
      ...context,
      subdepartmentName: subdept?.name || '',
      className,
      subclassName
    };

    setAddContext(enhancedContext)
    setBulkInput('')
    setNewRequirements([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
    setIsAddDialogOpen(true)
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
  // Add this function to handle adding new requirements
  const handleAddRequirements = async (requirements: Omit<ApiRequirement, 'id' | 'order'>[]) => {
    if (!addContext) return;

    try {
      setIsSubmitting(true);

      // Get current requirements
      const currentRequirements = getCurrentRequirementsForContext(addContext) || [];

      // Add new requirements with generated IDs
      const newRequirementsWithIds = requirements.map((req, index) => ({
        ...req,
        id: generateRequirementId(index, currentRequirements),
        order: currentRequirements.length + index
      }));

      // Combine with existing requirements
      const updatedRequirements = [...currentRequirements, ...newRequirementsWithIds];

      // Save to database
      await saveRequirementsForContext(addContext, updatedRequirements);

      // Refresh the data
      await refreshDepartments();

      // Close the dialog
      setIsAddDialogOpen(false);

      // Show success message
      toast({
        title: "Success",
        description: "Requirements added successfully",
        variant: "default"
      });

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
  };
  const handleDeleteClick = (type: 'subdepartment' | 'class' | 'subclass', index: number) => {
    setDeleteContext({ type, index })
    // Set the current context for deletion
    const context = {
      type,
      departmentId: activeDept,
      subdepartmentId: activeSubdept[activeDept],
      classId: type === 'class' || type === 'subclass' ? activeClass[`${activeDept}-${activeSubdept[activeDept]}`] : undefined,
      subclassId: type === 'subclass' ? activeSubclass[`${activeDept}-${activeSubdept[activeDept]}-${activeClass[`${activeDept}-${activeSubdept[activeDept]}`]}`] : undefined
    };
    setEditingContext(context);
    setIsDeleteDialogOpen(true);
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
    console.log('[getCurrentRequirementsForContext] Getting requirements for context:', JSON.stringify(context, null, 2));
    
    try {
      // Find the department
      const dept = departments.find(d => 
        String(d.id) === String(context.departmentId)
      );
      
      if (!dept) {
        console.error('[getCurrentRequirementsForContext] Department not found:', context.departmentId);
        return null;
      }

      // Find the subdepartment
      const subdept = dept.tm_subdepartments?.find(s => 
        String(s.id) === String(context.subdepartmentId)
      );
      
      if (!subdept) {
        console.error('[getCurrentRequirementsForContext] Subdepartment not found:', context.subdepartmentId);
        return null;
      }

      // Handle based on context type
      switch (context.type) {
        case 'subdepartment':
          console.log('[getCurrentRequirementsForContext] Found subdepartment requirements:', subdept.upload_requirements || []);
          return subdept.upload_requirements || [];
          
        case 'class':
          if (!context.classId) {
            console.error('[getCurrentRequirementsForContext] Missing classId in context');
            return null;
          }
          
          const targetClass = subdept.classes?.find(c => 
            String(c.id) === String(context.classId)
          );
          
          if (!targetClass) {
            console.error('[getCurrentRequirementsForContext] Class not found:', context.classId);
            return null;
          }
          
          console.log('[getCurrentRequirementsForContext] Found class requirements:', targetClass.requirements || []);
          return targetClass.requirements || [];
          
        case 'subclass':
          if (!context.classId || !context.subclassId) {
            console.error('[getCurrentRequirementsForContext] Missing classId or subclassId in context');
            return null;
          }
          
          const parentClass = subdept.classes?.find(c => 
            String(c.id) === String(context.classId)
          );
          
          if (!parentClass) {
            console.error('[getCurrentRequirementsForContext] Parent class not found:', context.classId);
            return null;
          }
          
          const targetSubclass = parentClass.subClasses?.find(sc => 
            String(sc.id) === String(context.subclassId)
          );
          
          if (!targetSubclass) {
            console.error('[getCurrentRequirementsForContext] Subclass not found:', context.subclassId);
            return null;
          }
          
          console.log('[getCurrentRequirementsForContext] Found subclass requirements:', targetSubclass.requirements || []);
          return targetSubclass.requirements || [];
          
        default:
          console.error('[getCurrentRequirementsForContext] Unknown context type:', context.type);
          return null;
      }
    } catch (error) {
      console.error('[getCurrentRequirementsForContext] Error getting requirements:', error);
      return null;
    }
  }

  const saveRequirementsForContext = async (context: EditingContext, requirements: ApiRequirement[]) => {
    console.log('[saveRequirementsForContext] Starting save with context:', JSON.stringify(context, null, 2));
    console.log('[saveRequirementsForContext] Requirements to save:', JSON.stringify(requirements, null, 2));
    
    try {
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

      console.log(`[saveRequirementsForContext] Generated classId: ${classId}, type: ${requirementType}`);

      console.log('[saveRequirementsForContext] Checking for existing record...');
      const { data: existingRecord, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('class_id', classId)
        .eq('type', requirementType)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('[saveRequirementsForContext] Error fetching existing record:', fetchError);
        throw fetchError;
      }

      console.log('[saveRequirementsForContext] Existing record:', existingRecord || 'No existing record found');

      // Ensure kycDocumentId is preserved
      const requirementsToSave = requirements.map(req => ({
        ...req,
        kycDocumentId: req.kycDocumentId || undefined
      }));

      console.log('[saveRequirementsForContext] All processed requirements:', JSON.stringify(requirementsToSave, null, 2));

      if (existingRecord) {
        console.log('[saveRequirementsForContext] Updating existing record...');
        const { data: updatedRecord, error: updateError } = await supabase
          .from('tm_class_requirements')
          .update({
            requirements: requirementsToSave,
            updated_at: new Date().toISOString()
          })
          .eq('class_id', classId)
          .eq('type', requirementType)
          .select();

        if (updateError) {
          console.error('[saveRequirementsForContext] Error updating requirements:', updateError);
          throw updateError;
        }
        console.log('[saveRequirementsForContext] Update successful, response:', updatedRecord);
      } else {
        console.log('[saveRequirementsForContext] Inserting new record...');
        const { data: insertedRecord, error: insertError } = await supabase
          .from('tm_class_requirements')
          .insert({
            class_id: classId,
            type: requirementType,
            requirements: requirementsToSave,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select();

        if (insertError) {
          console.error('[saveRequirementsForContext] Error inserting requirements:', insertError);
          throw insertError;
        }
        console.log('[saveRequirementsForContext] Insert successful, response:', insertedRecord);
      }

      console.log('[saveRequirementsForContext] Requirements saved successfully');
      return true;
    } catch (error) {
      console.error('[saveRequirementsForContext] Error:', error);
      throw error; // Re-throw to be handled by the caller
    }
  }

  const refreshDepartments = async () => {
    try {
      const { data: departmentsData, error } = await supabase
        .from('tm_departments')
        .select('*, tm_subdepartments(*)')
        .order('name')

      if (error) throw error

      const { data: requirements, error: reqError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .order('id')

      if (reqError) throw reqError

      // Process departments and include KYC document IDs in requirements
      const processedDepartments = departmentsData.map(dept => {
        const subdepartments = (dept.tm_subdepartments || []).map(subdept => {
          const classes = (subdept.classes || []).map(cls => {
            const classId = `${subdept.id}_${cls.id}`
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
              isRequired: r.isRequired !== false,
              kycDocumentId: r.kycDocumentId || undefined // Include KYC document ID
            })) || []

            const subClasses = (cls.subClasses || []).map(subCls => {
              const subClassId = `${classId}_${subCls.id}`
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
                isRequired: r.isRequired !== false,
                kycDocumentId: r.kycDocumentId || undefined // Include KYC document ID
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
            isRequired: r.isRequired !== false,
            kycDocumentId: r.kycDocumentId || undefined // Include KYC document ID
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
          subdepartments: subdepartments
        }
      })

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

  const handleNewRequirementChange = (index: number, field: string, value: any) => {
    const updated = [...newRequirements]
    updated[index] = { ...updated[index], [field]: value }
    setNewRequirements(updated)
  }

  const handleBulkInput = (text: string) => {
    setBulkInput(text)

    if (!text.trim()) {
      // If text is empty, reset to single empty requirement
      setNewRequirements([{
        name: '',
        description: '',
        type: 'standard',
        isRequired: true,
        isVisible: true
      }])
      return
    }

    // Split by new lines and filter out empty lines
    const lines = text.split('\n').filter(line => line.trim() !== '')

    // Map each line to a requirement object
    const requirements = lines.map(line => ({
      name: line.trim(),
      description: '',
      type: 'standard' as const,
      isRequired: true,
      isVisible: true
    }))

    setNewRequirements(requirements)
  }

  // Update the renderRequirements function to use the new edit dialog
  const renderRequirements = (requirements: RequirementTableEntry[] | null | undefined, context: EditingContext) => {
    const safeRequirements = requirements || [];

    // Remove the old inline edit logic and update the edit button
    const handleEditClick = (index: number) => {
      const requirement = safeRequirements[index]
      setEditingRequirement(requirement)
      setEditingContext(context)
      setIsEditDialogOpen(true)
    }

    // Update the table to remove inline editing
    return (
      <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex-1 flex flex-col h-full">
        <div className="flex flex-col h-full">
          <div className="overflow-hidden flex-1 flex flex-col">
            <Table className="table-fixed w-full">
              <TableHeader className="sticky top-0 z-10 bg-blue-600 dark:bg-blue-800 block">
                <TableRow className="flex">
                  <TableHead className="w-12 text-white border-r">#</TableHead>
                  <TableHead className="flex-1 text-white border-r">Requirement</TableHead>
                  <TableHead className="flex-1 text-white border-r">Description</TableHead>
                  <TableHead className="w-24 text-white border-r">Document</TableHead>
                  <TableHead className="w-32 text-white border-r">Properties</TableHead>
                  <TableHead className="w-48 text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <div className="overflow-y-auto flex-1">
              <Table className="table-fixed w-full">
                <TableBody className="block">
                  {safeRequirements.length > 0 ? (
                    safeRequirements.map((req, idx) => (
                      <TableRow key={req.id || req.tempId || idx} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 flex">
                        <TableCell className="font-medium border-r w-12">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs">
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell className="border-r flex-1">
                          <span className="font-medium">{req.name}</span>
                        </TableCell>
                        <TableCell className="border-r flex-1">
                          <span className={!req.description ? 'text-gray-400 italic' : ''}>
                            {req.description || 'No description'}
                          </span>
                        </TableCell>
                        <TableCell className="border-r w-24">
                          <div className="flex items-center justify-center">
                            {req.kycDocumentId ? (
                              <div className="flex items-center gap-1">
                                <FileText className="h-4 w-4 text-green-600" />
                                <span className="text-xs text-green-600">Linked</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <FileText className="h-4 w-4 text-gray-400" />
                                <span className="text-xs text-gray-400">None</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="border-r w-32">
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${req.isRequired ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                              <span className="text-xs">{req.isRequired ? 'Required' : 'Optional'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${req.isVisible ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                              <span className="text-xs">{req.isVisible ? 'Visible' : 'Hidden'}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="w-48">
                          <div className="flex items-center space-x-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-blue-600"
                              onClick={() => handleEditClick(idx)}
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
          </div>
        </div>
      </div>
    )
  }
  const handleSaveRequirement = async (updatedRequirement: ApiRequirement) => {
    console.log('[handleSaveRequirement] Starting with requirement:', JSON.stringify(updatedRequirement, null, 2));
    console.log('[handleSaveRequirement] Current editing context:', editingContext);
    
    if (!editingContext) {
      console.error('[handleSaveRequirement] No editing context available');
      toast({
        title: "Error",
        description: "No editing context available. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      // First, refresh the departments to ensure we have the latest data
      console.log('[handleSaveRequirement] Refreshing departments to get latest data...');
      await refreshDepartments();
      
      // Get current requirements for the context
      const currentRequirements = getCurrentRequirementsForContext(editingContext) || [];
      console.log('[handleSaveRequirement] Current requirements:', JSON.stringify(currentRequirements, null, 2));
      
      // If we still have no requirements, try to create a new one
      if (currentRequirements.length === 0) {
        console.log('[handleSaveRequirement] No existing requirements found, creating new one...');
        const newRequirements = [{
          ...updatedRequirement,
          id: updatedRequirement.id || Date.now().toString(),
          order: 0
        }];
        
        console.log('[handleSaveRequirement] Creating new requirements:', JSON.stringify(newRequirements, null, 2));
        const saveResult = await saveRequirementsForContext(editingContext, newRequirements);
        console.log('[handleSaveRequirement] saveRequirementsForContext result:', saveResult);
        
        await refreshDepartments();
        
        // Reset the dialog state
        setIsEditDialogOpen(false);
        setEditingRequirement(null);
        
        toast({
          title: "Success",
          description: "Requirement created successfully",
          variant: "default"
        });
        
        return;
      }
      
      // Try to find the requirement to update
      let requirementIndex = -1;
      
      // First try to find by ID if it exists
      if (updatedRequirement.id) {
        requirementIndex = currentRequirements.findIndex(req => 
          String(req.id) === String(updatedRequirement.id)
        );
      }
      
      // If not found by ID, try to find by name as fallback
      if (requirementIndex === -1) {
        requirementIndex = currentRequirements.findIndex(req => 
          req.name === updatedRequirement.name
        );
      }
      
      console.log('[handleSaveRequirement] Found requirement at index:', requirementIndex);

      let updatedRequirements = [...currentRequirements];
      
      // If requirement not found, add it as a new one
      if (requirementIndex === -1) {
        console.log('[handleSaveRequirement] Requirement not found, adding as new');
        updatedRequirements = [
          ...currentRequirements,
          {
            ...updatedRequirement,
            id: updatedRequirement.id || Date.now().toString(),
            order: currentRequirements.length
          }
        ];
      } else {
        // Update existing requirement
        console.log('[handleSaveRequirement] Updating existing requirement');
        updatedRequirements[requirementIndex] = {
          ...updatedRequirements[requirementIndex],
          ...updatedRequirement,
          // Preserve the original ID if the updated one is undefined
          id: updatedRequirement.id || updatedRequirements[requirementIndex].id
        };
      }
      
      console.log('[handleSaveRequirement] Updated requirements array:', JSON.stringify(updatedRequirements, null, 2));

      console.log('[handleSaveRequirement] Calling saveRequirementsForContext...');
      const saveResult = await saveRequirementsForContext(editingContext, updatedRequirements);
      console.log('[handleSaveRequirement] saveRequirementsForContext result:', saveResult);
      
      console.log('[handleSaveRequirement] Refreshing departments...');
      await refreshDepartments();

      // Reset the dialog state
      setIsEditDialogOpen(false);
      setEditingRequirement(null);

      toast({
        title: "Success",
        description: "Requirement saved successfully",
        variant: "default"
      });

      console.log('[handleSaveRequirement] Update completed successfully');
    } catch (error) {
      console.error('[handleSaveRequirement] Error updating requirement:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save requirement. Please try again.",
        variant: "destructive"
      });
    }
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
      <div className="space-y-4 h-[calc(100vh-200px)] flex flex-col">
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-auto">
            {/* Header */}
            <div className="border-b pb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{currentDept.name}</h2>
              <h3 className="text-lg text-gray-600 dark:text-gray-400">
                {currentSubdept.name} - <span className="text-sm text-gray-500">{currentSubdept.description}</span>
              </h3>
            </div>

            {/* Content based on current selection */}
            {currentSubclass ? (
              // Show subclass requirements
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-medium flex items-center space-x-2">
                    <Layers className="h-5 w-5 text-orange-600" />
                    <span>
                      Sub-class Requirements: {currentSubclass.name} -
                      <span className="text-sm text-gray-500">{currentSubclass.description}</span>
                    </span>
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
                {currentSubclass.requirements && renderRequirements(currentSubclass.requirements, {
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
                    <span>Class Requirements: {currentClass.name} - <span className="text-sm text-gray-500">{currentClass.description}</span></span>
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
        </div>
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
      <h2 className="text-2xl font-bold">GOVT Upload Processing Requirements</h2>
      <p className="text-sm text-gray-500">Manage GOVT upload processing requirements for each department, subdepartment, class, and subclass</p>
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
        <div className="flex-1 p-6 bg-white dark:bg-gray-900 overflow-auto">
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
      <AddRequirementsDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddRequirements}
        isSubmitting={isSubmitting}
        context={addContext}
      />
      <EditRequirementDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        requirement={editingRequirement}
        onSave={handleSaveRequirement}
        isSubmitting={isSubmitting}
        context={editingContext}
      />
    </div>
  )
}