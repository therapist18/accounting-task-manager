// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, PanelLeft, LayoutGrid, ChevronRight, ChevronDown, FileText, Layers, AlertTriangle, Eye, EyeOff, ChevronUp, Upload, User, Users, Minus } from "lucide-react"
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
  availableForms?: Array<{ id: string; name: string }>
  entryContext?: {
    automationId: string
    documentId: string | null
    documentName: string
  }
}

// New structure for webData array
interface WebDataEntry {
  automationId: string
  fields: ApiWebData[]
  documentId: string | null
  documentName: string
  kycDocsUpload: Array<{
    kycDocumentId: string
    entityType: 'principal' | 'dependant' | 'both'
    isRequired: boolean
    documentType: string
    fileExtensions: string[]
    maxFileSizeMb: number
    description?: string
    documentName?: string
  }>
}

interface ApiWebData {
  id?: string
  name: string
  efnsDisplayName?: string
  description?: string
  type: 'standard' | 'conditional' | 'optional' | 'document'
  order: number
  isVisible: boolean
  isRequired: boolean
  masterFieldId?: string
  masterField?: any
  variableName?: string
  fieldType?: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object' | 'file'
  entityType?: 'principal' | 'dependant' | 'both'
  arrayItems?: Array<{ name: string; variableName: string; type: string }>
  masterFieldIds?: string[]
  kycDocumentId?: string
  doc_id?: string
  form_name?: string
  doc_name?: string
  automationId?: string
  documentType?: string
  fileExtensions?: string[]
  maxFileSizeMb?: number
}

export default function WebData({ departments: initialDepartments }: WebdataProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments)
  const [activeDept, setActiveDept] = useState<string>('')
  const [activeSubdept, setActiveSubdept] = useState<Record<string, string>>({})
  const [activeClass, setActiveClass] = useState<Record<string, string>>({})
  const [activeSubclass, setActiveSubclass] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteContext, setDeleteContext] = useState<{ type: string, index: number, itemIndex?: number } | null>(null)
  const [editingWebData, setEditingWebData] = useState<ApiWebData | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null)
  const [addContext, setAddContext] = useState<EditingContext | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableForms, setAvailableForms] = useState<Array<{ id: string; name: string }>>([])
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [kycDocuments, setKycDocuments] = useState<Record<string, string>>({})
  
  // --- [CHANGE #1] Add state to hold the full data object for the item being edited ---
  const [currentWebDataForEdit, setCurrentWebDataForEdit] = useState<WebDataEntry[] | null>(null);


  // Fetch KYC documents on component mount
  useEffect(() => {
    const fetchKycDocuments = async () => {
      try {
        const { data, error } = await supabase
          .from('acc_portal_kyc')
          .select('id, display_name')
          
        if (error) throw error;
        
        // Create a map of KYC document IDs to their display names
        const kycMap = data.reduce((acc, doc) => ({
          ...acc,
          [doc.id]: doc.display_name
        }), {});
        
        setKycDocuments(kycMap);
      } catch (error) {
        console.error('Error fetching KYC documents:', error);
      }
    };
    
    fetchKycDocuments();
  }, []);
  
  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  useEffect(() => {
    const fetchForms = async () => {
      try {
        const { data: departments, error } = await supabase
          .from('tm_departments')
          .select('id, name, stages')
          .order('name');

        if (error) throw error;

        const forms = departments.flatMap(dept => {
          if (!dept.stages || !Array.isArray(dept.stages)) return [];

          return dept.stages.flatMap((stage: any) =>
            (stage.documents || [])
              .filter((doc: any) => doc.docType === 'form')
              .map((doc: any) => ({
                id: doc.id,
                name: doc.name,
                departmentId: dept.id,
                departmentName: dept.name,
                stageId: stage.id,
                stageName: stage.name
              }))
          );
        });

        const uniqueForms = Array.from(new Map(forms.map(form => [form.id, form])).values());
        setAvailableForms(uniqueForms);
      } catch (error) {
        console.error('Error fetching forms:', error);
        toast({
          title: 'Error',
          description: 'Failed to load forms',
          variant: 'destructive',
        });
      }
    };

    fetchForms();
  }, []);

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
      subclassName,
      availableForms
    };

    setAddContext(enhancedContext)
    setIsAddDialogOpen(true)
  }

  const handleAddWebData = async (webDataArray: WebDataEntry[]) => {
    if (!addContext) return;

    try {
      setIsSubmitting(true);

      const existingWebData = getCurrentWebDataForContext(addContext) || [];
      const updatedWebData = [...existingWebData];

      for (const newEntry of webDataArray) {
        const existingEntryIndex = updatedWebData.findIndex(existing =>
          existing.documentId === newEntry.documentId &&
          existing.automationId === newEntry.automationId
        );

        if (existingEntryIndex !== -1) {
          const existingEntry = updatedWebData[existingEntryIndex];
          const existingFieldNames = new Set(existingEntry.fields.map(f => f.efnsDisplayName || f.name));
          const newFields = newEntry.fields.filter(f => !existingFieldNames.has(f.efnsDisplayName || f.name));
          const existingKycIds = new Set(existingEntry.kycDocsUpload.map(k => k.kycDocumentId));
          const newKycDocs = newEntry.kycDocsUpload.filter(k => !existingKycIds.has(k.kycDocumentId));

          updatedWebData[existingEntryIndex] = {
            ...existingEntry,
            fields: [...existingEntry.fields, ...newFields],
            kycDocsUpload: [...existingEntry.kycDocsUpload, ...newKycDocs]
          };

          toast({
            title: "Merged with Existing",
            description: `Added ${newFields.length} new fields and ${newKycDocs.length} new documents to existing entry`,
            variant: "default"
          });
        } else {
          updatedWebData.push(newEntry);
        }
      }

      await replaceWebDataForContext(addContext, updatedWebData);
      await refreshDepartments();
      setIsAddDialogOpen(false);

      toast({
        title: "Success",
        description: `WebData added successfully`,
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

            let classWebData: WebDataEntry[] = [];
            if (classWebDataRecord?.webData && Array.isArray(classWebDataRecord.webData)) {
              classWebData = classWebDataRecord.webData;
            }

            const subClasses = (cls.subClasses || []).map(subCls => {
              const subClassId = `${classId}_${subCls.id}`
              const subClassWebDataRecord = webData?.find(req =>
                req.class_id === subClassId && req.type === 'subclass'
              )

              let subClassWebData: WebDataEntry[] = [];
              if (subClassWebDataRecord?.webData && Array.isArray(subClassWebDataRecord.webData)) {
                subClassWebData = subClassWebDataRecord.webData;
              }

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

          let uploadWebData: WebDataEntry[] = [];
          if (subdeptWebDataRecord?.webData && Array.isArray(subdeptWebDataRecord.webData)) {
            uploadWebData = subdeptWebDataRecord.webData;
          }

          return {
            ...subdept,
            classes,
            upload_web_data: uploadWebData
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

  const getCurrentWebDataForContext = (context: EditingContext): WebDataEntry[] | null => {
    try {
      const dept = departments.find(d => String(d.id) === String(context.departmentId));
      if (!dept) return null;
      const subdept = dept.tm_subdepartments?.find(s => String(s.id) === String(context.subdepartmentId));
      if (!subdept) return null;

      switch (context.type) {
        case 'subdepartment':
          return subdept.upload_web_data || [];
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

  const handleSaveWebData = async (updatedWebData: any) => {
    if (!editingContext) return;
  
    try {
      setIsSubmitting(true);
      await replaceWebDataForContext(editingContext, updatedWebData);
      await refreshDepartments();
      setIsEditDialogOpen(false);
      
      toast({
        title: "Success",
        description: "WebData updated successfully",
        variant: "default"
      });
    } catch (error) {
      console.error('Error updating webData:', error);
      toast({
        title: "Error",
        description: "Failed to update webData. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    refreshDepartments()
  }, [])

  const handleDeleteClick = (entryIndex: number, itemType?: 'field' | 'upload', itemIndex?: number) => {
    const context = {
      type: activeDept && activeSubdept[activeDept] ? (
        activeClass[`${activeDept}-${activeSubdept[activeDept]}`] ? (
          activeSubclass[`${activeDept}-${activeSubdept[activeDept]}-${activeClass[`${activeDept}-${activeSubdept[activeDept]}`]}`] ? 'subclass' : 'class'
        ) : 'subdepartment'
      ) : null,
      departmentId: activeDept,
      subdepartmentId: activeSubdept[activeDept],
      classId: activeClass[`${activeDept}-${activeSubdept[activeDept]}`],
      subclassId: activeSubclass[`${activeDept}-${activeSubdept[activeDept]}-${activeClass[`${activeDept}-${activeSubdept[activeDept]}`]}`]
    };

    setEditingContext(context as EditingContext);
    setDeleteContext({
      type: itemType || 'entry',
      index: entryIndex,
      itemIndex: itemIndex
    });
    setIsDeleteDialogOpen(true);
  }

  // --- [CHANGE #2] Modify handleEditClick to populate the new state ---
  const handleEditClick = (field: ApiWebData, entry: WebDataEntry, context: EditingContext) => {
    // Get the full data array for the current context (subdepartment, class, etc.)
    const fullWebDataForContext = getCurrentWebDataForContext(context);
    setCurrentWebDataForEdit(fullWebDataForContext); // Store it in our new state

    // Create a copy of the field with necessary defaults
    const fieldToEdit = {
      ...field,
      fieldType: field.fieldType || 'text',
      entityType: field.entityType || 'both',
      isVisible: field.isVisible !== false,
      isRequired: field.isRequired !== false,
    };
  
    // Set up the context for the dialog, including which entry we're editing
    const editContext = {
      ...context,
      entryContext: {
        automationId: entry.automationId,
        documentId: entry.documentId,
        documentName: entry.documentName
      }
    };
  
    setEditingWebData(fieldToEdit);
    setEditingContext(editContext);
    setIsEditDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!deleteContext || !editingContext) return

    try {
      setIsSubmitting(true)
      const currentWebData = getCurrentWebDataForContext(editingContext)
      if (!currentWebData) return

      let updatedWebData = [...currentWebData];

      if (deleteContext.type === 'entry') {
        updatedWebData = currentWebData.filter((_, i) => i !== deleteContext.index)
      } else if (deleteContext.type === 'field' && deleteContext.itemIndex !== undefined) {
        const entryToUpdate = { ...updatedWebData[deleteContext.index] };
        entryToUpdate.fields = entryToUpdate.fields.filter((_, i) => i !== deleteContext.itemIndex);
        updatedWebData[deleteContext.index] = entryToUpdate;
      } else if (deleteContext.type === 'upload' && deleteContext.itemIndex !== undefined) {
        const entryToUpdate = { ...updatedWebData[deleteContext.index] };
        entryToUpdate.kycDocsUpload = entryToUpdate.kycDocsUpload.filter((_, i) => i !== deleteContext.itemIndex);
        updatedWebData[deleteContext.index] = entryToUpdate;
      }

      await replaceWebDataForContext(editingContext, updatedWebData)
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

  const replaceWebDataForContext = async (context: EditingContext, webDataArray: WebDataEntry[]) => {
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

      if (existingRecord) {
        const { error: updateError } = await supabase
          .from('tm_class_requirements')
          .update({
            webData: webDataArray,
            updated_at: new Date().toISOString()
          })
          .eq('class_id', classId)
          .eq('type', webDataType);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('tm_class_requirements')
          .insert({
            class_id: classId,
            type: webDataType,
            webData: webDataArray,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        if (insertError) throw insertError;
      }
      return true;
    } catch (error) {
      console.error('[replaceWebDataForContext] Error:', error);
      throw error;
    }
  }

  const toggleDocumentExpansion = useCallback((automationId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(automationId)) {
        newSet.delete(automationId);
      } else {
        newSet.add(automationId);
      }
      return newSet;
    });
  }, []);

  const renderWebData = (webDataEntries: WebDataEntry[] | null | undefined, context: EditingContext) => {
    const safeWebData = webDataEntries || [];

    return (
      <div className="relative h-full overflow-y-auto border rounded-lg bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-blue-500 dark:bg-blue-800 backdrop-blur-sm border-b">
            <TableRow>
              <TableHead className="w-[60px] text-white border-r">#</TableHead>
              <TableHead className="text-white border-r">Document/Field Name</TableHead>
              <TableHead className="w-[200px] text-white border-r">Automation ID</TableHead>
              <TableHead className="w-[120px] text-white border-r">Type</TableHead>
              <TableHead className="w-[120px] text-white border-r">Entity Type</TableHead>
              <TableHead className="text-white border-r">Description</TableHead>
              <TableHead className="w-[160px] text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {safeWebData.length > 0 ? (
              safeWebData.map((entry, entryIndex) => (
                <React.Fragment key={entry.automationId}>
                  {/* Document Header Row */}
                  <TableRow className="bg-muted/30 border-b-2">
                    <TableCell className="font-medium border-r">
                      <Badge variant="outline" className="text-xs">
                        DOC
                      </Badge>
                    </TableCell>
                    <TableCell className="border-r">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-card-foreground">
                          {entry.documentName}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDocumentExpansion(entry.automationId)}
                          className="h-6 w-6 p-0"
                        >
                          {expandedDocuments.has(entry.automationId) ?
                            <Minus className="h-4 w-4" /> :
                            <Plus className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="border-r">
                      <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                        {entry.automationId}
                      </code>
                    </TableCell>
                    <TableCell className="border-r">
                      <Badge variant="outline" className="capitalize">
                        Document
                      </Badge>
                    </TableCell>
                    <TableCell className="border-r">
                      <Badge variant="secondary" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        Mixed
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground border-r">
                      Form with {entry.fields.length} field{entry.fields.length !== 1 ? 's' : ''}
                      {entry.kycDocsUpload.length > 0 && ` + ${entry.kycDocsUpload.length} upload${entry.kycDocsUpload.length !== 1 ? 's' : ''}`}
                    </TableCell>
                    <TableCell className="border-r">
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(entryIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Field Rows (shown when expanded) */}
                  {expandedDocuments.has(entry.automationId) && (
                    <>
                      {entry.fields.map((field, fieldIndex) => (
                        <TableRow key={`${entry.automationId}-field-${fieldIndex}`} className="group hover:bg-muted/50">
                          <TableCell className="font-medium border-r pl-8">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm">F{fieldIndex + 1}</span>
                            </div>
                          </TableCell>
                          <TableCell className="border-r pl-8">
                            <div className="flex items-center space-x-2">
                              <FileText className="h-3 w-3 text-green-500" />
                              <div className="font-medium text-card-foreground">{field.efnsDisplayName || field.name}</div>
                            </div>
                          </TableCell>
                          <TableCell className="border-r">
                            <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                              {field.variableName || '-'}
                            </code>
                          </TableCell>
                          <TableCell className="border-r">
                            <Badge variant="secondary" className="capitalize">
                              {field.fieldType || 'text'}
                            </Badge>
                          </TableCell>
                          <TableCell className="border-r">
                            <Badge
                              variant={field.entityType === 'both' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {field.entityType === 'both' ? (
                                <><Users className="h-3 w-3 mr-1" />Both</>
                              ) : field.entityType === 'principal' ? (
                                <><User className="h-3 w-3 mr-1" />Principal</>
                              ) : (
                                <><User className="h-3 w-3 mr-1" />Dependant</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground border-r">
                            <span className={!field.description ? 'italic' : ''}>
                              {field.description || 'No description'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right border-r">
                            <div className="flex items-center space-x-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEditClick(field, entry, context)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteClick(entryIndex, 'field', fieldIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* KYC Upload Rows */}
                      {entry.kycDocsUpload.map((kycDoc, kycIndex) => (
                        <TableRow key={`${entry.automationId}-kyc-${kycIndex}`} className="group hover:bg-muted/50">
                          <TableCell className="font-medium border-r pl-8">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm">U{kycIndex + 1}</span>
                            </div>
                          </TableCell>
                          <TableCell className="border-r pl-8">
                            <div className="flex items-center space-x-2">
                              <Upload className="h-3 w-3 text-orange-500" />
                              <div className="font-medium text-card-foreground">
                                {kycDocuments[kycDoc.kycDocumentId] || kycDoc.documentName || entry.documentName}
                              </div>
                              {kycDoc.isRequired && (
                                <Badge variant="destructive" className="text-xs">Required</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="border-r">
                            <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                              {kycDoc.kycDocumentId}
                            </code>
                          </TableCell>
                          <TableCell className="border-r">
                            <Badge variant="outline" className="capitalize">
                              {kycDoc.documentType}
                            </Badge>
                          </TableCell>
                          <TableCell className="border-r">
                            <Badge
                              variant={kycDoc.entityType === 'both' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {kycDoc.entityType === 'both' ? (
                                <><Users className="h-3 w-3 mr-1" />Both</>
                              ) : kycDoc.entityType === 'principal' ? (
                                <><User className="h-3 w-3 mr-1" />Principal</>
                              ) : (
                                <><User className="h-3 w-3 mr-1" />Dependant</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground border-r">
                            <div className="space-y-1 text-xs">
                              <div>{kycDoc.description || 'Document upload'}</div>
                              <div className="text-muted-foreground">
                                Max: {kycDoc.maxFileSizeMb}MB | {kycDoc.fileExtensions.join(', ')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right border-r">
                            <div className="flex items-center space-x-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled // Edit for KYC uploads can be implemented here
                                onClick={() => {/* Handle edit upload */ }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteClick(entryIndex, 'upload', kycIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
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
            { type: 'subclass', departmentId: currentDept.id, subdepartmentId: currentSubdept.id.toString(), classId: currentClass?.id.toString(), subclassId: currentSubclass.id.toString(), availableForms }
          ) : currentClass ? renderTableSection(
            `Class: ${currentClass.name}`, currentClass.description, <Layers className="h-5 w-5 text-purple-500" />, currentClass.webData,
            { type: 'class', departmentId: currentDept.id, subdepartmentId: currentSubdept.id.toString(), classId: currentClass.id.toString(), availableForms }
          ) : renderTableSection(
            "Subdepartment WebData", "", <FileText className="h-5 w-5 text-green-500" />, currentSubdept.upload_web_data,
            { type: 'subdepartment', departmentId: currentDept.id, subdepartmentId: currentSubdept.id.toString(), availableForms }
          )}
        </div>
      </div>
    );
  }

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
        context={addContext ? { ...addContext, availableForms } : null}
      />
      {/* --- [CHANGE #3] Pass the new state to the dialog and add cleanup --- */}
      <EditWebDataDialog
        isOpen={isEditDialogOpen}
        onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) {
            // Clean up state when dialog closes
            setEditingWebData(null);
            setEditingContext(null);
            setCurrentWebDataForEdit(null);
          }
        }}
        webData={editingWebData}
        allAutomationData={currentWebDataForEdit || []}
        onSave={handleSaveWebData}
        isSubmitting={isSubmitting}
        context={editingContext ? {
          ...editingContext,
          availableForms,
          entryContext: editingContext.entryContext
        } : null}
      />
    </div>
  )
}