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
import { saveClassWebData, saveSubWebData } from "./database"
import type { Department, WebData, WebDataForm } from "./database"
import { DepartmentSidebar } from "@/app/(dashboard)/dashboard/departments/main-shared-components/department-sidebar"
import { EditWebDataDialog } from "./components/EditWebDataDialog"
import { AddWebDataDialog } from "./components/AddWebDataDialog"

interface WebdataProps {
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

// Also update the ApiWebData interface
interface ApiWebData {
  id?: string
  name: string
  description?: string
  type: 'standard' | 'conditional' | 'optional'
  order: number
  isVisible: boolean
  isRequired: boolean
  kycDocumentId?: string
  masterFieldId?: string
  masterField?: any // Store master field data for display
}

interface WebDataTableEntry extends ApiWebData {
  tempId?: string
}

// Function to generate sequential webData IDs
const generateWebDataId = (index: number, existingWebData: ApiWebData[] = []): string => {
  if (existingWebData.length === 0) {
    return index.toString();
  }

  // Find the highest existing ID
  const maxId = existingWebData.reduce((max, req) => {
    const id = parseInt(req.id || '0', 10);
    return isNaN(id) ? max : Math.max(max, id);
  }, -1);

  return (maxId + 1 + index).toString();
}

export default function WebData({ departments: initialDepartments }: WebDataProps) {
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
  const [newWebData, setNewWebData] = useState<{
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
  const [editingWebData, setEditingWebData] = useState<ApiWebData | null>(null)
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

  const openWebDataDialog = (context: EditingContext) => {
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
    setIsAddDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingContext(null)
    setNewWebData([{
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
  }
  // Add this function to handle adding new webData
  const handleAddWebData = async (webData: WebDataForm[]) => {
    if (!addContext) return;

    try {
      setIsSubmitting(true);

      // Get current webData
      const currentWebData = getCurrentWebDataForContext(addContext) || [];

      // Add new webData with generated IDs and required fields
      const newWebDataWithIds = webData.map((req, index) => ({
        id: generateWebDataId(index, currentWebData),
        name: req.name,
        description: req.description,
        type: 'standard' as const,
        isRequired: req.isRequired,
        isVisible: true,
        order: currentWebData.length + index,
        masterFieldId: req.masterFieldId,
        kycDocumentId: undefined
      }));

      // Combine with existing webData
      const updatedWebData = [...currentWebData, ...newWebDataWithIds];

      // Save to database
      await saveWebDataForContext(addContext, updatedWebData);

      // Refresh the data
      await refreshDepartments();

      // Close the dialog
      setIsAddDialogOpen(false);

      // Show success message
      toast({
        title: "Success",
        description: "WebData added successfully",
        variant: "default"
      });

    } catch (error) {
      console.error('Error adding webData:', error);
      toast({
        title: "Error",
        description: "Failed to add webData. Please try again.",
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

      // Get current webData first
      const currentWebData = getCurrentWebDataForContext(editingContext)
      if (!currentWebData || currentWebData.length === 0) return

      const updatedWebData = currentWebData.filter((_, i) => i !== index)

      // Save updated webData
      await saveWebDataForContext(editingContext, updatedWebData)
      await refreshDepartments()

      toast({
        title: "Success",
        description: "WebData deleted successfully",
        variant: "default"
      })

      setIsDeleteDialogOpen(false)
      setDeleteContext(null)

    } catch (error) {
      console.error('Error deleting webData')
      toast({
        title: "Error",
        description: "Failed to delete webData. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getCurrentWebDataForContext = (context: EditingContext): ApiWebData[] | null => {
    console.log('[getCurrentWebDataForContext] Getting webData for context:', JSON.stringify(context, null, 2));

    try {
      // Find the department
      const dept = departments.find(d =>
        String(d.id) === String(context.departmentId)
      );

      if (!dept) {
        console.error('[getCurrentWebDataForContext] Department not found:', context.departmentId);
        return null;
      }

      // Find the subdepartment
      const subdept = dept.tm_subdepartments?.find(s =>
        String(s.id) === String(context.subdepartmentId)
      );

      if (!subdept) {
        console.error('[getCurrentWebDataForContext] Subdepartment not found:', context.subdepartmentId);
        return null;
      }

      // Handle based on context type
      switch (context.type) {
        case 'subdepartment':
          console.log('[getCurrentWebDataForContext] Found subdepartment webData:', subdept.upload_webData || []);
          return subdept.upload_webData || [];

        case 'class':
          if (!context.classId) {
            console.error('[getCurrentWebDataForContext] Missing classId in context');
            return null;
          }

          const targetClass = subdept.classes?.find(c =>
            String(c.id) === String(context.classId)
          );

          if (!targetClass) {
            console.error('[getCurrentWebDataForContext] Class not found:', context.classId);
            return null;
          }

          console.log('[getCurrentWebDataForContext] Found class webData:', targetClass.webData || []);
          return targetClass.webData || [];

        case 'subclass':
          if (!context.classId || !context.subclassId) {
            console.error('[getCurrentWebDataForContext] Missing classId or subclassId in context');
            return null;
          }

          const parentClass = subdept.classes?.find(c =>
            String(c.id) === String(context.classId)
          );

          if (!parentClass) {
            console.error('[getCurrentWebDataForContext] Parent class not found:', context.classId);
            return null;
          }

          const targetSubclass = parentClass.subClasses?.find(sc =>
            String(sc.id) === String(context.subclassId)
          );

          if (!targetSubclass) {
            console.error('[getCurrentWebDataForContext] Subclass not found:', context.subclassId);
            return null;
          }

          console.log('[getCurrentWebDataForContext] Found subclass webData:', targetSubclass.webData || []);
          return targetSubclass.webData || [];

        default:
          console.error('[getCurrentWebDataForContext] Unknown context type:', context.type);
          return null;
      }
    } catch (error) {
      console.error('[getCurrentWebDataForContext] Error getting webData:', error);
      return null;
    }
  }

  const saveWebDataForContext = async (context: EditingContext, webData: ApiWebData[]) => {
    console.log('[saveWebDataForContext] Starting save with context:', JSON.stringify(context, null, 2));
    console.log('[saveWebDataForContext] WebData to save:', JSON.stringify(webData, null, 2));

    try {
      let classId = '';
      let webDataType = '';

      if (context.type === 'subdepartment') {
        classId = context.subdepartmentId;
        webDataType = 'subdepartment';
      } else if (context.type === 'class') {
        classId = `${context.subdepartmentId}_${context.classId}`;
        webDataType = 'class';
      } else if (context.type === 'subclass') {
        classId = `${context.subdepartmentId}_${context.classId}_${context.subclassId}`;
        webDataType = 'subclass';
      }

      console.log(`[saveWebDataForContext] Generated classId: ${classId}, type: ${webDataType}`);

      console.log('[saveWebDataForContext] Checking for existing record...');
      const { data: existingRecord, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('class_id', classId)
        .eq('type', webDataType)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('[saveWebDataForContext] Error fetching existing record:', fetchError);
        throw fetchError;
      }

      console.log('[saveWebDataForContext] Existing record:', existingRecord || 'No existing record found');

      // Ensure kycDocumentId is preserved
      const webDataToSave = webData.map(req => ({
        ...req,
        kycDocumentId: req.kycDocumentId || undefined
      }));

      console.log('[saveWebDataForContext] All processed webData:', JSON.stringify(webDataToSave, null, 2));

      if (existingRecord) {
        console.log('[saveWebDataForContext] Updating existing record...');
        const { data: updatedRecord, error: updateError } = await supabase
          .from('tm_class_requirements')
          .update({
            webData: webDataToSave,
            updated_at: new Date().toISOString()
          })
          .eq('class_id', classId)
          .eq('type', webDataType)
          .select();

        if (updateError) {
          console.error('[saveWebDataForContext] Error updating webData:', updateError);
          throw updateError;
        }
        console.log('[saveWebDataForContext] Update successful, response:', updatedRecord);
      } else {
        console.log('[saveWebDataForContext] Inserting new record...');
        const { data: insertedRecord, error: insertError } = await supabase
          .from('tm_class_requirements')
          .insert({
            class_id: classId,
            type: webDataType,
            webData: webDataToSave,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select();

        if (insertError) {
          console.error('[saveWebDataForContext] Error inserting webData:', insertError);
          throw insertError;
        }
        console.log('[saveWebDataForContext] Insert successful, response:', insertedRecord);
      }

      console.log('[saveWebDataForContext] WebData saved successfully');
      return true;
    } catch (error) {
      console.error('[saveWebDataForContext] Error:', error);
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

      const { data: webData, error: reqError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .order('id')

      if (reqError) throw reqError

      // Process departments and include KYC document IDs in webData
      const processedDepartments = departmentsData.map(dept => {
        const subdepartments = (dept.tm_subdepartments || []).map(subdept => {
          const classes = (subdept.classes || []).map(cls => {
            const classId = `${subdept.id}_${cls.id}`
            const classWebDataRecord = webData?.find(req =>
              req.class_id === classId && req.type === 'class'
            )

            const classWebData = classWebDataRecord?.webData?.map((r: any, idx: number) => ({
              id: r.id?.toString() || generateWebDataId(idx, classWebDataRecord.webData),
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
              const subClassWebDataRecord = webData?.find(req =>
                req.class_id === subClassId && req.type === 'subclass'
              )

              const subClassWebData = subClassWebDataRecord?.webData?.map((r: any, idx: number) => ({
                id: r.id?.toString() || generateWebDataId(idx, subClassWebDataRecord.webData),
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
                webData: subClassWebData
              }
            })

            return {
              ...cls,
              webData: classWebData,
              subClasses
            }
          })

          const subdeptWebDataRecord = webData?.find(req =>
            req.class_id === subdept.id.toString() && req.type === 'subdepartment'
          )

          const uploadWebData = subdeptWebDataRecord?.webData?.map((r: any, idx: number) => ({
            id: r.id?.toString() || generateWebDataId(idx, subdeptWebDataRecord.webData),
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
            upload_webData: uploadWebData
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

  const addNewWebData = () => {
    setNewWebData([...newWebData, {
      name: '',
      description: '',
      type: 'standard',
      isRequired: true,
      isVisible: true
    }])
  }

  const removeNewWebData = (index: number) => {
    if (newWebData.length > 1) {
      setNewWebData(newWebData.filter((_, i) => i !== index))
    }
  }

  const handleNewWebDataChange = (index: number, field: string, value: any) => {
    const updated = [...newWebData]
    updated[index] = { ...updated[index], [field]: value }
    setNewWebData(updated)
  }

  const handleBulkInput = (text: string) => {
    setBulkInput(text)

    if (!text.trim()) {
      // If text is empty, reset to single empty webData
      setNewWebData([{
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

    // Map each line to a webData object
    const webData = lines.map(line => ({
      name: line.trim(),
      description: '',
      type: 'standard' as const,
      isRequired: true,
      isVisible: true
    }))

    setNewWebData(webData)
  }

  // Update the renderWebData function to use the new edit dialog
  const renderWebData = (webData: WebDataTableEntry[] | null | undefined, context: EditingContext) => {
    const safeWebData = webData || [];

    // Remove the old inline edit logic and update the edit button
    const handleEditClick = (index: number) => {
      const webData = safeWebData[index]
      setEditingWebData(webData)
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
                  <TableHead className="flex-1 text-white border-r">WebData</TableHead>
                  <TableHead className="flex-1 text-white border-r">Description</TableHead>
                  <TableHead className="w-48 text-white border-r">Master Field</TableHead>
                  <TableHead className="w-24 text-white border-r">Document</TableHead>
                  <TableHead className="w-48 text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <div className="overflow-y-auto flex-1">
              <Table className="table-fixed w-full">
                <TableBody className="block">
                  {safeWebData.length > 0 ? (
                    safeWebData.map((req, idx) => (
                      <TableRow key={req.id || req.tempId || idx} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 flex">
                        <TableCell className="font-medium border-r w-12">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs">
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell className="border-r flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{req.name}</span>
                            {req.masterFieldId && (
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                <Link2 className="h-3 w-3 mr-1" />
                                Master
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="border-r flex-1">
                          <span className={!req.description ? 'text-gray-400 italic' : ''}>
                            {req.description || 'No description'}
                          </span>
                        </TableCell>
                        <TableCell className="border-r w-48">
                          {req.masterFieldId ? (
                            <div className="text-sm text-muted-foreground truncate">
                              {req.masterField?.label || 'Linked'}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
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
                              disabled={idx === safeWebData.length - 1}
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
                          <p>No webData added yet</p>
                          <p className="text-xs text-gray-400">Click the button above to add webData</p>
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
  const handleSaveWebData = async (updatedWebData: ApiWebData) => {
    console.log('[handleSaveWebData] Starting with webData:', JSON.stringify(updatedWebData, null, 2));
    console.log('[handleSaveWebData] Current editing context:', editingContext);

    if (!editingContext) {
      console.error('[handleSaveWebData] No editing context available');
      toast({
        title: "Error",
        description: "No editing context available. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      // First, refresh the departments to ensure we have the latest data
      console.log('[handleSaveWebData] Refreshing departments to get latest data...');
      await refreshDepartments();

      // Get current webData for the context
      const currentWebData = getCurrentWebDataForContext(editingContext) || [];
      console.log('[handleSaveWebData] Current webData:', JSON.stringify(currentWebData, null, 2));

      // If we still have no webData, try to create a new one
      if (currentWebData.length === 0) {
        console.log('[handleSaveWebData] No existing webData found, creating new one...');
        const newWebData = [{
          ...updatedWebData,
          id: updatedWebData.id || Date.now().toString(),
          order: 0
        }];

        console.log('[handleSaveWebData] Creating new webData:', JSON.stringify(newWebData, null, 2));
        const saveResult = await saveWebDataForContext(editingContext, newWebData);
        console.log('[handleSaveWebData] saveWebDataForContext result:', saveResult);

        await refreshDepartments();

        // Reset the dialog state
        setIsEditDialogOpen(false);
        setEditingWebData(null);

        toast({
          title: "Success",
          description: "WebData created successfully",
          variant: "default"
        });

        return;
      }

      // Try to find the webData to update
      let webDataIndex = -1;

      // First try to find by ID if it exists
      if (updatedWebData.id) {
        webDataIndex = currentWebData.findIndex(req =>
          String(req.id) === String(updatedWebData.id)
        );
      }

      // If not found by ID, try to find by name as fallback
      if (webDataIndex === -1) {
        webDataIndex = currentWebData.findIndex(req =>
          req.name === updatedWebData.name
        );
      }

      console.log('[handleSaveWebData] Found webData at index:', webDataIndex);

      let updatedWebData = [...currentWebData];

      // If webData not found, add it as a new one
      if (webDataIndex === -1) {
        console.log('[handleSaveWebData] WebData not found, adding as new');
        updatedWebData = [
          ...currentWebData,
          {
            ...updatedWebData,
            id: updatedWebData.id || Date.now().toString(),
            order: currentWebData.length
          }
        ];
      } else {
        // Update existing webData
        console.log('[handleSaveWebData] Updating existing webData');
        updatedWebData[webDataIndex] = {
          ...updatedWebData[webDataIndex],
          ...updatedWebData,
          // Preserve the original ID if the updated one is undefined
          id: updatedWebData.id || updatedWebData[webDataIndex].id
        };
      }

      console.log('[handleSaveWebData] Updated webData array:', JSON.stringify(updatedWebData, null, 2));

      console.log('[handleSaveWebData] Calling saveWebDataForContext...');
      const saveResult = await saveWebDataForContext(editingContext, updatedWebData);
      console.log('[handleSaveWebData] saveWebDataForContext result:', saveResult);

      console.log('[handleSaveWebData] Refreshing departments...');
      await refreshDepartments();

      // Reset the dialog state
      setIsEditDialogOpen(false);
      setEditingWebData(null);

      toast({
        title: "Success",
        description: "WebData saved successfully",
        variant: "default"
      });

      console.log('[handleSaveWebData] Update completed successfully');
    } catch (error) {
      console.error('[handleSaveWebData] Error updating webData:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save webData. Please try again.",
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
              <p className="text-sm">Choose a subdepartment to view and manage webData</p>
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
              // Show subclass webData
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-medium flex items-center space-x-2">
                    <Layers className="h-5 w-5 text-orange-600" />
                    <span>
                      Sub-class WebData: {currentSubclass.name} -
                      <span className="text-sm text-gray-500">{currentSubclass.description}</span>
                    </span>
                  </h4>
                  <Button
                    onClick={() => openWebDataDialog({
                      type: 'subclass',
                      departmentId: currentDept.id,
                      subdepartmentId: currentSubdept.id,
                      classId: currentClass?.id.toString(),
                      subclassId: currentSubclass.id.toString()
                    })}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add WebData
                  </Button>
                </div>
                {currentSubclass.webData && renderWebData(currentSubclass.webData, {
                  type: 'subclass',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id,
                  classId: currentClass?.id.toString(),
                  subclassId: currentSubclass.id.toString()
                })}
              </div>
            ) : currentClass ? (
              // Show class webData
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-medium flex items-center space-x-2">
                    <Layers className="h-5 w-5 text-purple-600" />
                    <span>Class WebData: {currentClass.name} - <span className="text-sm text-gray-500">{currentClass.description}</span></span>
                  </h4>
                  <Button
                    onClick={() => openWebDataDialog({
                      type: 'class',
                      departmentId: currentDept.id,
                      subdepartmentId: currentSubdept.id,
                      classId: currentClass.id.toString()
                    })}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add WebData
                  </Button>
                </div>
                {renderWebData(currentClass.webData, {
                  type: 'class',
                  departmentId: currentDept.id,
                  subdepartmentId: currentSubdept.id,
                  classId: currentClass.id.toString()
                })}
              </div>
            ) : (
              // Show subdepartment webData
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-medium flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-green-600" />
                    <span>Subdepartment WebData</span>
                  </h4>
                  <Button
                    onClick={() => openWebDataDialog({
                      type: 'subdepartment',
                      departmentId: currentDept.id,
                      subdepartmentId: currentSubdept.id
                    })}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add WebData
                  </Button>
                </div>
                {renderWebData(currentSubdept.upload_webData, {
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
          <p className="text-sm text-gray-500">Create departments first to manage webData</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">WebData</h2>
      <p className="text-sm text-gray-500">Manage webData for each department, subdepartment, class, and subclass</p>
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
            <DialogTitle>Delete WebData</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this webData? This action cannot be undone.
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

      {/* Add WebData Dialog */}
      <AddWebDataDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddWebData}
        isSubmitting={isSubmitting}
        context={addContext}
      />
      <EditWebDataDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        webData={editingWebData}
        onSave={handleSaveWebData}
        isSubmitting={isSubmitting}
        context={editingContext}
      />
    </div>
  )
}