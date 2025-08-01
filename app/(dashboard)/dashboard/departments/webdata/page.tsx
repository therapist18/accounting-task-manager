// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff, ChevronUp } from "lucide-react"
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
  masterFieldId?: string
  masterField?: any // Store master field data for display
  variableName?: string // Add variable name field
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
    isVisible: boolean,
    variableName: string
  }[]>([{
    name: '',
    description: '',
    type: 'standard',
    isRequired: true,
    isVisible: true,
    variableName: ''
  }])
  const [bulkInput, setBulkInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    type: 'standard' as 'standard' | 'conditional' | 'optional',
    isRequired: true,
    isVisible: true,
    variableName: ''
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
    const dept = departments.find(d => d.id === context.departmentId);
    const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === context.subdepartmentId.toString());
    let className = '';
    let subclassName = '';

    if (context.classId && subdept) {
      const classItem = subdept.classes?.find(c => c.id.toString() === context.classId?.toString());
      if (classItem) {
        className = classItem.name;
        if (context.subclassId) {
          const subclassItem = classItem.subClasses?.find(sc => sc.id.toString() === context.subclassId?.toString());
          if (subclassItem) {
            subclassName = subclassItem.name;
          }
        }
      }
    }

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
      isVisible: true,
      variableName: ''
    }])
  }

  const handleAddWebData = async (webData: WebDataForm[]) => {
    if (!addContext) return;

    try {
      setIsSubmitting(true);
      const currentWebData = getCurrentWebDataForContext(addContext) || [];

      const newWebDataWithIds = webData.map((req, index) => ({
        id: generateWebDataId(index, currentWebData),
        name: req.efnsDisplayName || req.name,
        description: req.description,
        type: req.type || 'standard',
        isRequired: req.isRequired,
        isVisible: true,
        order: currentWebData.length + index,
        variableName: req.variableName || '',
        efnsDisplayName: req.efnsDisplayName || req.name,
        fieldType: req.fieldType || 'text',
        arrayItems: req.arrayItems || [],
        masterFieldIds: req.masterFieldIds || []
      }));

      const updatedWebData = [...currentWebData, ...newWebDataWithIds];
      await saveWebDataForContext(addContext, updatedWebData);
      await refreshDepartments();
      setIsAddDialogOpen(false);

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
              order: r.order ?? idx,
              isVisible: r.isVisible !== false,
              isRequired: r.isRequired !== false,
              variableName: r.variableName || '',
              efnsDisplayName: r.efnsDisplayName || r.name || '',
              fieldType: r.fieldType || 'text',
              arrayItems: r.arrayItems || [],
              masterFieldIds: r.masterFieldIds || [],
              kycDocumentId: r.kycDocumentId
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
                order: r.order ?? idx,
                isVisible: r.isVisible !== false,
                isRequired: r.isRequired !== false,
                variableName: r.variableName || '',
                efnsDisplayName: r.efnsDisplayName || r.name || '',
                fieldType: r.fieldType || 'text',
                arrayItems: r.arrayItems || [],
                masterFieldIds: r.masterFieldIds || [],
                kycDocumentId: r.kycDocumentId
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
            order: r.order ?? idx,
            isVisible: r.isVisible !== false,
            isRequired: r.isRequired !== false,
            variableName: r.variableName || '',
            efnsDisplayName: r.efnsDisplayName || r.name || '',
            fieldType: r.fieldType || 'text',
            arrayItems: r.arrayItems || [],
            masterFieldIds: r.masterFieldIds || [],
            kycDocumentId: r.kycDocumentId
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

  const saveWebDataForContext = async (context: EditingContext, webData: ApiWebData[]) => {
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

      const { data: existingRecord, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('class_id', classId)
        .eq('type', webDataType)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      const webDataToSave = webData.map(req => ({
        id: req.id,
        name: req.name,
        description: req.description,
        type: req.type,
        order: req.order,
        isVisible: req.isVisible,
        isRequired: req.isRequired,
        variableName: req.variableName,
        efnsDisplayName: req.efnsDisplayName,
        fieldType: req.fieldType,
        arrayItems: req.arrayItems,
        masterFieldIds: req.masterFieldIds,
        kycDocumentId: req.kycDocumentId
      }));

      if (existingRecord) {
        const { error: updateError } = await supabase
          .from('tm_class_requirements')
          .update({ webData: webDataToSave, updated_at: new Date().toISOString() })
          .eq('class_id', classId)
          .eq('type', webDataType);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('tm_class_requirements')
          .insert({
            class_id: classId,
            type: webDataType,
            webData: webDataToSave,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        if (insertError) throw insertError;
      }
      return true;
    } catch (error) {
      console.error('[saveWebDataForContext] Error:', error);
      throw error;
    }
  }

  const handleDeleteClick = (type: 'subdepartment' | 'class' | 'subclass', index: number) => {
    setDeleteContext({ type, index })
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
      const { index } = deleteContext
      const currentWebData = getCurrentWebDataForContext(editingContext)
      if (!currentWebData) return

      const updatedWebData = currentWebData.filter((_, i) => i !== index)
      await saveWebDataForContext(editingContext, updatedWebData)
      await refreshDepartments()

      toast({
        title: "Success",
        description: "WebData deleted successfully",
      })
      setIsDeleteDialogOpen(false)
      setDeleteContext(null)
    } catch (error) {
      console.error('Error deleting webData', error)
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
    try {
      const dept = departments.find(d => String(d.id) === String(context.departmentId));
      if (!dept) return null;
      const subdept = dept.tm_subdepartments?.find(s => String(s.id) === String(context.subdepartmentId));
      if (!subdept) return null;

      switch (context.type) {
        case 'subdepartment':
          return subdept.upload_webData || [];
        case 'class':
          if (!context.classId) return null;
          const targetClass = subdept.classes?.find(c => String(c.id) === String(context.classId));
          return targetClass?.webData || [];
        case 'subclass':
          if (!context.classId || !context.subclassId) return null;
          const parentClass = subdept.classes?.find(c => String(c.id) === String(context.classId));
          const targetSubclass = parentClass?.subClasses?.find(sc => String(sc.id) === String(context.subclassId));
          return targetSubclass?.webData || [];
        default:
          return null;
      }
    } catch (error) {
      console.error('[getCurrentWebDataForContext] Error:', error);
      return null;
    }
  }

  useEffect(() => {
    refreshDepartments()
  }, [])

  const handleSaveWebData = async (updatedWebData: ApiWebData) => {
    if (!editingContext) {
      toast({ title: "Error", description: "No editing context available.", variant: "destructive" });
      return;
    }

    try {
      const currentWebData = getCurrentWebDataForContext(editingContext) || [];
      let webDataIndex = -1;

      if (editingWebData?.id) {
        webDataIndex = currentWebData.findIndex(req => String(req.id) === String(editingWebData.id));
      }
      if (webDataIndex === -1 && updatedWebData.id) {
        webDataIndex = currentWebData.findIndex(req => String(req.id) === String(updatedWebData.id));
      }
      if (webDataIndex === -1) {
        webDataIndex = currentWebData.findIndex(req =>
          req.name === (editingWebData?.name || updatedWebData.name) &&
          req.order === (editingWebData?.order || updatedWebData.order)
        );
      }

      if (webDataIndex === -1) {
        const newWebDataArray = [
          ...currentWebData,
          { ...updatedWebData, id: updatedWebData.id || Date.now().toString(), order: updatedWebData.order ?? currentWebData.length }
        ];
        await saveWebDataForContext(editingContext, newWebDataArray);
      } else {
        const updatedWebDataArray = [...currentWebData];
        updatedWebDataArray[webDataIndex] = {
          ...updatedWebDataArray[webDataIndex],
          ...updatedWebData,
          id: updatedWebData.id || updatedWebDataArray[webDataIndex].id,
          order: updatedWebData.order ?? updatedWebDataArray[webDataIndex].order
        };
        await saveWebDataForContext(editingContext, updatedWebDataArray);
      }

      await refreshDepartments();
      setIsEditDialogOpen(false);
      setEditingWebData(null);
      toast({ title: "Success", description: "WebData saved successfully" });
    } catch (error) {
      console.error('[handleSaveWebData] Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save webData.",
        variant: "destructive"
      });
    }
  }

  const handleMove = async (index: number, direction: 'up' | 'down', moveContext: EditingContext) => {
    if (!moveContext) return;

    const currentWebData = getCurrentWebDataForContext(moveContext);
    if (!currentWebData || currentWebData.length < 2) return;

    const newWebData = [...currentWebData];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newWebData.length) return;

    [newWebData[index], newWebData[targetIndex]] = [newWebData[targetIndex], newWebData[index]];

    newWebData.forEach((item, idx) => { item.order = idx; });

    try {
      await saveWebDataForContext(moveContext, newWebData);
      await refreshDepartments();
      toast({ title: "Success", description: "WebData order updated." });
    } catch (error) {
      console.error('Error moving webData:', error);
      toast({ title: "Error", description: "Failed to update order.", variant: "destructive" });
    }
  };

  const handleDeptClick = (deptId: string) => setActiveDept(deptId);
  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }))
    if (activeDept !== deptId) setActiveDept(deptId)
  };
  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    setActiveClass(prev => ({ ...prev, [`${deptId}-${subdeptId}`]: classId }))
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }));
    if (activeDept !== deptId) setActiveDept(deptId)
  };
  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    const classKey = `${deptId}-${subdeptId}`;
    setActiveSubclass(prev => ({ ...prev, [`${classKey}-${classId}`]: subclassId }))
    setActiveClass(prev => ({ ...prev, [classKey]: classId }))
    setActiveSubdept(prev => ({ ...prev, [deptId]: subdeptId }));
    if (activeDept !== deptId) setActiveDept(deptId)
  };

  const renderWebData = (webData: WebDataTableEntry[] | null | undefined, context: EditingContext) => {
    const safeWebData = (webData || []).sort((a, b) => a.order - b.order);
    const handleEditClick = (req: WebDataTableEntry) => {
      setEditingWebData(req);
      setEditingContext(context);
      setIsEditDialogOpen(true);
    };

    return (
      <div className="relative h-full overflow-y-auto border rounded-lg bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-blue-500 dark:bg-blue-800 backdrop-blur-sm border-b">
            <TableRow>
              <TableHead className="w-[60px] text-white border-r">#</TableHead>
              <TableHead className="text-white border-r">EFNS Display Name</TableHead>
              <TableHead className="w-[200px] text-white border-r">Automation Variable</TableHead>
              <TableHead className="w-[120px] text-white border-r">Type</TableHead>
              <TableHead className="text-white border-r">Description</TableHead>
              <TableHead className="w-[160px] text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {safeWebData.length > 0 ? (
              safeWebData.map((req, idx) => (
                <TableRow key={req.id || req.tempId || idx} className="group hover:bg-muted/50">
                  <TableCell className="font-medium border-r">
                      {req.order + 1}
                  </TableCell>
                  <TableCell className="border-r">
                    <div className="font-medium text-card-foreground">{req.name}</div>
                  </TableCell>
                  <TableCell className="border-r">
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                      {req.variableName || '-'}
                    </code>
                  </TableCell>
                  <TableCell className="border-r">
                    <Badge variant="secondary" className="capitalize">
                      {req.fieldType || 'text'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground border-r">
                    <span className={!req.description ? 'italic' : ''}>
                      {req.description || 'No description'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right border-r">
                    <div className="flex items-center space-x-1">
                      <div className="flex-col">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMove(idx, 'up', context)} disabled={idx === 0}>
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMove(idx, 'down', context)} disabled={idx === safeWebData.length - 1}>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditClick(req)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteClick(context.type, idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center space-y-2">
                    <FileText className="h-8 w-8" />
                    <p className="font-medium">No WebData Yet</p>
                    <p className="text-sm">Click "Add WebData" to get started.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderMainContent = () => {
    const currentDept = departments.find(d => d.id === activeDept);
    if (!currentDept) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <Layers className="h-12 w-12 mx-auto mb-4" />
            <p className="text-lg font-medium">Select a department</p>
            <p className="text-sm">Choose a department from the sidebar to view its structure.</p>
          </div>
        </div>
      );
    }

    const currentSubdeptId = activeSubdept[currentDept.id];
    const currentSubdept = currentDept.tm_subdepartments?.find(s => s.id.toString() === currentSubdeptId);
    if (!currentSubdept) {
      return (
        <div className="flex flex-col h-full">
          <h2 className="text-2xl font-bold">{currentDept.name}</h2>
          {currentDept.description && <p className="text-muted-foreground">{currentDept.description}</p>}
          <div className="flex items-center justify-center flex-1 text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-medium">Select a subdepartment</p>
              <p className="text-sm">Choose a subdepartment to view and manage webData.</p>
            </div>
          </div>
        </div>
      );
    }

    const activeClassKey = `${currentDept.id}-${currentSubdept.id}`;
    const currentClassId = activeClass[activeClassKey];
    const currentClass = currentSubdept.classes?.find(c => c.id.toString() === currentClassId);
    const activeSubclassKey = `${activeClassKey}-${currentClassId}`;
    const currentSubclassId = activeSubclass[activeSubclassKey];
    const currentSubclass = currentClass?.subClasses?.find(sc => sc.id.toString() === currentSubclassId);

    const renderTableSection = (title: string, description: string, icon: React.ReactNode, data: any, context: EditingContext) => (
      <>
        <div className="flex items-center justify-between flex-shrink-0">
          <h4 className="text-lg font-medium flex items-center space-x-3">
            {icon}
            <span>
              {title}
              {description && <span className="text-sm text-muted-foreground ml-2">- {description}</span>}
            </span>
          </h4>
          <Button onClick={() => openWebDataDialog(context)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add WebData
          </Button>
        </div>
        <div className="flex-1 min-h-0">{renderWebData(data, context)}</div>
      </>
    );

    return (
      <div className="flex flex-col h-full space-y-4">
        <div className="flex-shrink-0 border-b pb-4">
          <h2 className="text-2xl font-bold">{currentDept.name}</h2>
          <h3 className="text-lg text-muted-foreground">{currentSubdept.name}</h3>
        </div>

        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          {currentSubclass ? renderTableSection(
            `Sub-class: ${currentSubclass.name}`, currentSubclass.description, <Layers className="h-5 w-5 text-orange-500" />, currentSubclass.webData,
            { type: 'subclass', departmentId: currentDept.id, subdepartmentId: currentSubdept.id.toString(), classId: currentClass?.id.toString(), subclassId: currentSubclass.id.toString() }
          ) : currentClass ? renderTableSection(
            `Class: ${currentClass.name}`, currentClass.description, <Layers className="h-5 w-5 text-purple-500" />, currentClass.webData,
            { type: 'class', departmentId: currentDept.id, subdepartmentId: currentSubdept.id.toString(), classId: currentClass.id.toString() }
          ) : renderTableSection(
            "Subdepartment WebData", "", <FileText className="h-5 w-5 text-green-500" />, currentSubdept.upload_webData,
            { type: 'subdepartment', departmentId: currentDept.id, subdepartmentId: currentSubdept.id.toString() }
          )}
        </div>
      </div>
    );
  }

  if (!departments || departments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <div className="text-center text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-4" />
          <p className="text-lg font-medium">No departments found</p>
          <p className="text-sm">Create departments first to manage webData.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">WebData</h2>
      <p className="text-sm text-muted-foreground">Manage webData for each department, subdepartment, class, and subclass.</p>
      <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-card">
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
        <div className="flex-1 p-6 flex flex-col">
          {renderMainContent()}
        </div>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete WebData</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this webData? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isSubmitting}>
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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