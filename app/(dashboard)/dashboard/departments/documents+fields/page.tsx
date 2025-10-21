// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
// ... (all other imports remain the same)
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Minus, Expand, Minimize2, Info, FileText, Users } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { getTableFields, getGroupedFields, FormField } from "./components/formFields"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "@/app/(dashboard)/dashboard/departments/main-shared-components/column-visibility"
import { DocumentType, Subdepartment, DocumentField, ClientData, Department, GroupedDocuments, SubdepartmentClass, TruncatedText, SectionHeader, OptimizedCheckbox } from "./components/types"
import { CATEGORY_MAPPING, CLASS_D_ID, REFERENCE_SUBDEPARTMENT_IDS, CACHE_DURATION, DEBOUNCE_DELAY, cache, getCachedData, setCachedData, debounce } from "./components/config"
import {
  formatFieldValue as formatFieldValueUtil,
  processDocumentFields,
  groupDocumentsByCategory,
  filterAndSortDocuments,
  getAllocationStatus as getAllocationStatusUtil,
  getColumnKey as getColumnKeyUtil,
  toggleSetItem,
  shouldShowUnderstudy as shouldShowUnderstudyUtil,
  shouldShowReferences as shouldShowReferencesUtil,
  getClientFieldAllocationStatus as getClientFieldAllocationStatusUtil
} from "./components/utils"

const MemoizedCheckbox = memo(OptimizedCheckbox)
const MemoizedTruncatedText = memo(TruncatedText)

export default function DocumentsFields() {
  // ... (all state declarations remain the same)
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [clientData, setClientData] = useState<ClientData[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, {
    ap: boolean
    dp: boolean
    understudy: boolean
    references: boolean
    kycdocumentid: string | null
  }>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, {
    ap: boolean
    dp: boolean
    understudy: boolean
    references: boolean
  }>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedClientItems, setExpandedClientItems] = useState<Set<string>>(new Set())
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set())
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())
  const [availableColumns, setAvailableColumns] = useState<ColumnVisibilityOption[]>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [pendingChanges, setPendingChanges] = useState<{
    documents: Record<string, { ap: boolean; dp: boolean; understudy: boolean; references: boolean }>;
    clientFields: Record<string, { ap: boolean; dp: boolean; understudy: boolean; references: boolean }>;
  }>({
    documents: {},
    clientFields: {}
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const renderCountRef = useRef(0)
  const lastFetchTimeRef = useRef(0)

  const fetchData = useCallback(async () => {
    // ... (initial logic is the same)
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 1000) return
    lastFetchTimeRef.current = now

    const cacheKey = `documents-fields-${documentTab}`
    const controller = new AbortController()

    try {
      setLoading(true)
      setError(null)

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 15000)
      )

      const fetchPromises = [
        supabase
          .from('tm_departments')
          .select(`*, tm_subdepartments (*, classes)`)
          .order('order', { ascending: true })
          .abortSignal(controller.signal),
        supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true })
          .abortSignal(controller.signal),
        supabase
          .from('tm_class_requirements')
          .select('documents_and_fields, client_fields, class_id')
          .abortSignal(controller.signal)
      ]

      const [deptsResponse, documentsResponse, requirementsResponse] = await Promise.race([
        Promise.all(fetchPromises),
        timeoutPromise
      ]) as any

      if (deptsResponse.error) throw deptsResponse.error
      if (documentsResponse.error) throw documentsResponse.error
      if (requirementsResponse.error) throw requirementsResponse.error

      const transformedDepartments = (deptsResponse.data || []).map((dept: any) => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || [])
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((subdept: any) => ({
            ...subdept,
            classes: Array.isArray(subdept.classes)
              ? subdept.classes.map((cls: any) => ({
                ...cls,
                isDefault: cls.default_display === true,
                subclasses: (cls.subclasses || []).map((subCls: any) => ({
                  ...subCls,
                  isDefault: subCls.default_display === true
                }))
              }))
              : [],
            hasClasses: Boolean(subdept.classes?.length)
          }))
      }))

      const processedDocuments = (documentsResponse.data || []).map((doc: any) => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }))

      const documentSettings: Record<string, any> = {}
      const clientFieldSettings: Record<string, any> = {}

      // MODIFICATION: FLATTEN the nested data from Supabase for efficient UI state management
      requirementsResponse.data?.forEach((req: any) => {
        if (!req.class_id) return;
        
        // Process nested documents and fields
        if (Array.isArray(req.documents_and_fields)) {
          req.documents_and_fields.forEach((docAllocation: any) => {
            if (docAllocation?.id) {
              const { fields, ...docProps } = docAllocation;
              const docKey = `${docProps.id}_${req.class_id}`;
              documentSettings[docKey] = docProps;

              // Process nested fields within the document
              if (Array.isArray(fields)) {
                fields.forEach((fieldAllocation: any) => {
                  if (fieldAllocation?.id) {
                    const fieldKey = `${docAllocation.id}-${fieldAllocation.id}_${req.class_id}`;
                    documentSettings[fieldKey] = fieldAllocation;
                  }
                });
              }
            }
          });
        }
        
        // Client fields remain flat
        if (Array.isArray(req.client_fields)) {
          req.client_fields.forEach((item: any) => {
            if (item?.id !== undefined) {
              const clientFieldKey = `${item.id}_${req.class_id}`;
              clientFieldSettings[clientFieldKey] = item;
            }
          });
        }
      });
      // ... (rest of the function remains the same)
      const columns: ColumnVisibilityOption[] = []
      transformedDepartments.forEach((dept: any) => {
        dept.subdepartments?.forEach((subdept: any) => {
          if (subdept.hasClasses) {
            subdept.classes?.forEach((cls: any, clsIndex: number) => {
              if (cls.subclasses?.length) {
                cls.subclasses.forEach((subcls: any, subclsIndex: number) => {
                  const subclsKey = `subdept_${subdept.id}_cls_${clsIndex}_subcls_${subclsIndex}`
                  columns.push({
                    id: subclsKey,
                    label: `${subdept.name} > ${cls.name} > ${subcls.name}`,
                    visible: subcls.isDefault === true,
                    isDefault: subcls.isDefault === true,
                    group: subdept.name
                  })
                })
              } else {
                const clsKey = `subdept_${subdept.id}_cls_${clsIndex}`
                columns.push({
                  id: clsKey,
                  label: `${subdept.name} > ${cls.name}`,
                  visible: cls.isDefault === true,
                  isDefault: cls.isDefault === true,
                  group: subdept.name
                })
              }
            })
          } else {
            const subdeptKey = `subdept_${subdept.id}`
            columns.push({
              id: subdeptKey,
              label: subdept.name,
              visible: subdept.default_display === true,
              isDefault: subdept.default_display === true,
              group: dept.name
            })
          }
        })
      })
      startTransition(() => {
        setDepartments(transformedDepartments)
        setDocuments(processedDocuments)
        setDocumentAllocations(documentSettings)
        setClientFieldAllocations(clientFieldSettings)
        setAvailableColumns(columns)

        if (transformedDepartments.length > 0) {
          setActiveTab(transformedDepartments[0].id)
        }
        const categoryKeys = Object.keys(groupDocumentsByCategory(
          processedDocuments.filter(doc => doc.category === CATEGORY_MAPPING[documentTab])
        ))
        setExpandedCategories(new Set(categoryKeys))
      })

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again.')
      }
    } finally {
      setLoading(false)
    }

    return () => controller.abort()
  }, [documentTab])

  const refreshData = useMemo(
    () => debounce(fetchData, DEBOUNCE_DELAY),
    [fetchData]
  );

  // MODIFICATION: Replace the entire function with a corrected version
  const handleSaveAllChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setIsSaving(true);

    try {
      const changesByClassId = {};

      // 1. Group all pending changes by their classId.
      const groupChanges = (changeType) => {
        const source = pendingChanges[changeType];
        Object.entries(source).forEach(([allocationKey, changeData]) => {
          const firstUnderscoreIndex = allocationKey.indexOf('_');
          if (firstUnderscoreIndex === -1) return;

          const entityId = allocationKey.substring(0, firstUnderscoreIndex);
          const classId = allocationKey.substring(firstUnderscoreIndex + 1);

          if (!changesByClassId[classId]) {
            changesByClassId[classId] = { documents: {}, clientFields: {} };
          }
          
          changesByClassId[classId][changeType][entityId] = changeData;
        });
      };
      
      groupChanges('documents');
      groupChanges('clientFields');
      
      // 2. For each classId, fetch existing data, merge changes, and upsert.
      const savePromises = Object.entries(changesByClassId).map(async ([classId, classChanges]) => {
        const { data: existingData, error: fetchError } = await supabase
          .from('tm_class_requirements')
          .select('documents_and_fields, client_fields')
          .eq('class_id', classId)
          .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        // 3. Build the nested document structure
        const documentsMap = new Map((existingData?.documents_and_fields || []).map(doc => [doc.id, doc]));

        Object.entries(classChanges.documents).forEach(([entityId, changeProps]) => {
          // A document ID is a 36-char UUID. Anything longer is a field ID.
          const isField = entityId.length > 37 && entityId[36] === '-';
          let docId, fieldId;
          
          if (isField) {
            docId = entityId.substring(0, 36);
            fieldId = entityId.substring(37);
          } else {
            docId = entityId;
            fieldId = null;
          }

          const docData = documentsMap.get(docId) || { id: docId, fields: [] };

          if (fieldId) { // It's a field change
            const fieldIndex = docData.fields.findIndex(f => f.id === fieldId);
            const fieldChanges = { id: fieldId, updated_at: new Date().toISOString(), ...changeProps };
            
            if (fieldIndex > -1) {
              docData.fields[fieldIndex] = { ...docData.fields[fieldIndex], ...fieldChanges };
            } else {
              docData.fields.push(fieldChanges);
            }
          } else { // It's a document change
            const docChanges = { updated_at: new Date().toISOString(), ...changeProps };
            documentsMap.set(docId, { ...docData, ...docChanges });
          }
        });

        // 4. Merge client field changes (they remain flat)
        const clientFieldsMap = new Map((existingData?.client_fields || []).map(field => [field.id, field]));
        Object.entries(classChanges.clientFields).forEach(([entityId, changeProps]) => {
          const fieldChanges = { id: entityId, updated_at: new Date().toISOString(), ...changeProps };
          clientFieldsMap.set(entityId, { ...clientFieldsMap.get(entityId), ...fieldChanges });
        });

        const finalPayload = {
          class_id: classId,
          documents_and_fields: Array.from(documentsMap.values()),
          client_fields: Array.from(clientFieldsMap.values()),
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from('tm_class_requirements')
          .upsert(finalPayload, { onConflict: 'class_id' });

        if (upsertError) throw upsertError;
      });

      await Promise.all(savePromises);

      setPendingChanges({ documents: {}, clientFields: {} });
      setHasUnsavedChanges(false);
      await refreshData();

      toast({
        title: "Success",
        description: `Changes saved successfully.`,
        variant: "default",
      });

    } catch (error) {
      console.error('Error saving changes:', error);
      toast({
        title: "Error",
        description: `Failed to save changes: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, hasUnsavedChanges, refreshData]);
  
  // ... (the rest of the component remains exactly the same)
  const getColumnKey = useCallback((subdeptId: number, clsIndex: number | null, subclsIndex: number | null = null) => {
    return getColumnKeyUtil(subdeptId, clsIndex, subclsIndex)
  }, [])

  const shouldShowUnderstudy = useCallback((subdept: Subdepartment, clsIndex: number | null) => {
    return shouldShowUnderstudyUtil(subdept, clsIndex)
  }, [])

  const shouldShowReferences = useCallback((subdept: Subdepartment) => {
    return shouldShowReferencesUtil(subdept)
  }, [])

  const formatFieldValue = useCallback(formatFieldValueUtil, [])

  const currentDepartment = useMemo(() =>
    departments.find(d => d.id === activeTab) || null,
    [departments, activeTab]
  )

  const { filteredDocuments, groupedDocuments } = useMemo(() => {
    renderCountRef.current++
    if (!documents.length) return { filteredDocuments: [], groupedDocuments: {} }
    return filterAndSortDocuments(documents, documentTab)
  }, [documents, documentTab])

  const normalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments?.length) {
      return [{
        id: -1,
        name: 'No Subdepartments',
        department_id: currentDepartment?.id || '',
        hasClasses: false,
        classes: []
      }]
    }

    return currentDepartment.subdepartments.map(dept => ({
      ...dept,
      hasClasses: Boolean(dept.classes?.length),
      classes: dept.classes?.map(cls => ({
        ...cls,
        id: cls.id || `class-${cls.name}`,
        subclasses: cls.subclasses || []
      })) || []
    }))
  }, [currentDepartment])

  const clientFormFields = useMemo(() => getTableFields(documentTab), [documentTab])
  const groupedClientFields = useMemo(() => getGroupedFields(documentTab), [documentTab])

  const getVisibleColumns = useCallback(() => {
    const visibleColumns: Array<{
      subdept: Subdepartment;
      clsIndex: number | null;
      subclsIndex: number | null;
      columnKey: string;
      isExpanded: boolean;
      hasUnderstudy: boolean;
      hasReferences: boolean;
      width: number;
    }> = []

    normalizedSubdepartments.forEach(subdept => {
      if (subdept.hasClasses) {
        subdept.classes?.forEach((cls, clsIndex) => {
          if (cls.subclasses?.length) {
            cls.subclasses.forEach((subcls, subclsIndex) => {
              const columnKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
              if (columnVisibility[columnKey] === true) {
                const isExpanded = expandedColumns.has(columnKey)
                const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
                const hasReferences = shouldShowReferences(subdept)
                const colCount = 2 + (hasUnderstudy ? 1 : 0) + (hasReferences ? 1 : 0)
                visibleColumns.push({
                  subdept,
                  clsIndex,
                  subclsIndex,
                  columnKey,
                  isExpanded,
                  hasUnderstudy,
                  hasReferences,
                  width: isExpanded ? (colCount * 120) : 120
                })
              }
            })
          } else {
            const columnKey = getColumnKey(subdept.id, clsIndex)
            if (columnVisibility[columnKey] === true) {
              const isExpanded = expandedColumns.has(columnKey)
              const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
              const hasReferences = shouldShowReferences(subdept)
              const colCount = 2 + (hasUnderstudy ? 1 : 0) + (hasReferences ? 1 : 0)
              visibleColumns.push({
                subdept,
                clsIndex,
                subclsIndex: null,
                columnKey,
                isExpanded,
                hasUnderstudy,
                hasReferences,
                width: isExpanded ? (colCount * 120) : 120
              })
            }
          }
        })
      } else {
        const columnKey = getColumnKey(subdept.id, null)
        if (columnVisibility[columnKey] === true) {
          const isExpanded = expandedColumns.has(columnKey)
          const hasReferences = shouldShowReferences(subdept)
          const colCount = 2 + (hasReferences ? 1 : 0)
          visibleColumns.push({
            subdept,
            clsIndex: null,
            subclsIndex: null,
            columnKey,
            isExpanded,
            hasUnderstudy: false,
            hasReferences,
            width: isExpanded ? (colCount * 120) : 120
          })
        }
      }
    })

    return visibleColumns
  }, [normalizedSubdepartments, columnVisibility, expandedColumns, getColumnKey, shouldShowUnderstudy, shouldShowReferences])

  const visibleColumns = useMemo(() => getVisibleColumns(), [getVisibleColumns])

  const toggleColumnExpansion = useCallback((columnKey: string) => {
    setExpandedColumns(prev => {
      const newSet = new Set(prev)
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey)
      } else {
        newSet.add(columnKey)
      }
      return newSet
    })
  }, [])

  const toggleItemExpansion = useCallback((itemId: string) => {
    setExpandedItems(prev => toggleSetItem(prev, itemId))
  }, [])

  const toggleCategoryExpansion = useCallback((categoryKey: string) => {
    setExpandedCategories(prev => toggleSetItem(prev, categoryKey))
  }, [])

  const toggleClientItemExpansion = useCallback((clientId: string) => {
    setExpandedClientItems(prev => toggleSetItem(prev, clientId))
  }, [])
  
  useEffect(() => {
    if (availableColumns.length > 0 && Object.keys(columnVisibility).length === 0) {
      const initialVisibility = availableColumns.reduce((acc, col) => {
        acc[col.id] = col.visible
        return acc
      }, {} as Record<string, boolean>)
      setColumnVisibility(initialVisibility)
    }
  }, [availableColumns, columnVisibility])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getAllocationStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null,
    columnType: 'ap' | 'dp' | 'understudy' | 'references'
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)
    const classItem = classIndex !== null ? subdept?.classes?.[classIndex] : null;
    const subClassItem = (classItem && subclassIndex !== null) ? classItem.subclasses?.[subclassIndex] : null;

    let class_id_part;
    if (subClassItem) {
        class_id_part = `${subdeptId}_${classItem.id}_${subClassItem.id}`;
    } else if (classItem) {
        class_id_part = `${subdeptId}_${classItem.id}`;
    } else {
        class_id_part = `${subdeptId}`;
    }
    
    const allocationKey = `${allocationId}_${class_id_part}`;

    if (pendingChanges.documents[allocationKey]?.[columnType] !== undefined) {
      return pendingChanges.documents[allocationKey][columnType]
    }

    return documentAllocations[allocationKey]?.[columnType] ?? false
  }, [pendingChanges.documents, documentAllocations, currentDepartment])

  const getClientFieldAllocationStatus = useCallback((
    fieldId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null,
    columnType: 'ap' | 'dp' | 'understudy' | 'references'
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)
    const classItem = classIndex !== null ? subdept?.classes?.[classIndex] : null;
    const subClassItem = (classItem && subclassIndex !== null) ? classItem.subclasses?.[subclassIndex] : null;

    let class_id_part;
    if (subClassItem) {
        class_id_part = `${subdeptId}_${classItem.id}_${subClassItem.id}`;
    } else if (classItem) {
        class_id_part = `${subdeptId}_${classItem.id}`;
    } else {
        class_id_part = `${subdeptId}`;
    }
    
    const allocationKey = `${fieldId}_${class_id_part}`;

    if (pendingChanges.clientFields[allocationKey]?.[columnType] !== undefined) {
      return pendingChanges.clientFields[allocationKey][columnType]
    }

    return clientFieldAllocations[allocationKey]?.[columnType] ?? false
  }, [pendingChanges.clientFields, clientFieldAllocations, currentDepartment])

  const handleDisplayToggle = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null,
    columnType: 'ap' | 'dp' | 'understudy' | 'references',
    checked: boolean = false
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)
    const classItem = classIndex !== null ? subdept?.classes?.[classIndex] : null;
    const subClassItem = (classItem && subclassIndex !== null) ? classItem.subclasses?.[subclassIndex] : null;

    let class_id_part;
    if (subClassItem) {
        class_id_part = `${subdeptId}_${classItem.id}_${subClassItem.id}`;
    } else if (classItem) {
        class_id_part = `${subdeptId}_${classItem.id}`;
    } else {
        class_id_part = `${subdeptId}`;
    }
    
    const allocationKey = `${allocationId}_${class_id_part}`;

    setPendingChanges(prev => {
        const originalStatus = documentAllocations[allocationKey]?.[columnType] ?? false;
        const newDocuments = { ...prev.documents };

        const currentPending = newDocuments[allocationKey] ? { ...newDocuments[allocationKey] } : {};
        currentPending[columnType] = checked;

        if (checked === originalStatus) {
            delete currentPending[columnType];
        }

        if (Object.keys(currentPending).length === 0) {
            delete newDocuments[allocationKey];
        } else {
            newDocuments[allocationKey] = currentPending;
        }

        return { ...prev, documents: newDocuments };
    });
    setHasUnsavedChanges(true);
}, [currentDepartment, documentAllocations]);


  const handleClientFieldToggle = useCallback((
    fieldId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null,
    columnType: 'ap' | 'dp' | 'understudy' | 'references',
    checked: boolean = false
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)
    const classItem = classIndex !== null ? subdept?.classes?.[classIndex] : null;
    const subClassItem = (classItem && subclassIndex !== null) ? classItem.subclasses?.[subclassIndex] : null;
    
    let class_id_part;
    if (subClassItem) {
        class_id_part = `${subdeptId}_${classItem.id}_${subClassItem.id}`;
    } else if (classItem) {
        class_id_part = `${subdeptId}_${classItem.id}`;
    } else {
        class_id_part = `${subdeptId}`;
    }
    
    const allocationKey = `${fieldId}_${class_id_part}`;


    setPendingChanges(prev => {
        const originalStatus = clientFieldAllocations[allocationKey]?.[columnType] ?? false;
        const newClientFields = { ...prev.clientFields };

        const currentPending = newClientFields[allocationKey] ? { ...newClientFields[allocationKey] } : {};
        currentPending[columnType] = checked;

        if (checked === originalStatus) {
            delete currentPending[columnType];
        }

        if (Object.keys(currentPending).length === 0) {
            delete newClientFields[allocationKey];
        } else {
            newClientFields[allocationKey] = currentPending;
        }

        return { ...prev, clientFields: newClientFields };
    });
    setHasUnsavedChanges(true)
  }, [currentDepartment, clientFieldAllocations]);

  const renderColumnHeaders = useCallback(() => {
    return visibleColumns.map(column => {
      const { subdept, clsIndex, subclsIndex, columnKey, isExpanded, hasUnderstudy, hasReferences } = column

      if (!isExpanded) {
        return (
          <TableHead
            key={columnKey}
            style={{ width: '120px' }}
            className="border-r border-blue-400 border-l border-blue-300 px-1 text-center text-white text-xs bg-blue-300"
          >
            <div className="flex items-center justify-center gap-1">
              <span className="truncate">AP</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 text-white hover:bg-blue-400"
                onClick={() => toggleColumnExpansion(columnKey)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </TableHead>
        )
      }

      const columns = ['AP', 'DP']
      if (hasUnderstudy) columns.push('US')
      if (hasReferences) columns.push('REF') 

      return columns.map((columnName, colIdx) => (
        <TableHead
          key={`${columnKey}-${columnName}`}
          style={{ width: '120px' }}
          className="border-r border-blue-400 border-l border-blue-300 px-1 text-center text-white text-xs bg-blue-300"
        >
          <div className="flex items-center justify-center gap-1">
            <span className="text-xs">{columnName}</span>
            {colIdx === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 text-white hover:bg-blue-400"
                onClick={() => toggleColumnExpansion(columnKey)}
              >
                <Minus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </TableHead>
      ))
    }).flat()
  }, [visibleColumns, toggleColumnExpansion])

  const renderDocumentCheckboxes = useCallback((
    doc: DocumentType,
    columnInfo: typeof visibleColumns[0]
  ) => {
    const { subdept, clsIndex, subclsIndex, columnKey, isExpanded, hasUnderstudy, hasReferences } = columnInfo
    const getSubmittingStatus = (allocationId: string, subdeptId: number, classIndex: number | null, subclassIndex: number | null) => {
      const keyParts = [allocationId, subdeptId]
      if (classIndex !== null) keyParts.push(String(classIndex))
      if (subclassIndex !== null) keyParts.push(String(subclassIndex))
      return submittingIds.has(keyParts.join('_'))
    }

    const isSubmitting = getSubmittingStatus(doc.id, subdept.id, clsIndex, subclsIndex)

    if (!isExpanded) {
      return (
        <TableCell
          key={`${doc.id}-${columnKey}`}
          className="text-center border-r border-l border-gray-200"
          style={{ width: '120px' }}
        >
          <MemoizedCheckbox
            checked={getAllocationStatus(doc.id, subdept.id, clsIndex, subclsIndex, 'ap')}
            onCheckedChange={(c) => handleDisplayToggle(doc.id, subdept.id, clsIndex, subclsIndex, 'ap', c)}
            disabled={isSubmitting}
            allocationKey={`ap-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
          />
        </TableCell>
      )
    }

    const columns = [
      { type: 'ap' as const, key: `ap-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}` },
      { type: 'dp' as const, key: `dp-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}` }
    ]
    if (hasUnderstudy) {
      columns.push({ type: 'understudy' as const, key: `us-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}` })
    }
    if (hasReferences) {
      columns.push({ type: 'references' as const, key: `ref-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}` })
    }

    return columns.map(column => (
      <TableCell
        key={`${doc.id}-${columnKey}-${column.type}`}
        className="text-center border-r border-l border-gray-200"
        style={{ width: '120px' }}
      >
        <MemoizedCheckbox
          checked={getAllocationStatus(doc.id, subdept.id, clsIndex, subclsIndex, column.type)}
          onCheckedChange={(c) => handleDisplayToggle(doc.id, subdept.id, clsIndex, subclsIndex, column.type, c)}
          disabled={isSubmitting}
          allocationKey={column.key}
        />
      </TableCell>
    ))
  }, [getAllocationStatus, handleDisplayToggle, submittingIds])

  const renderFieldCheckboxes = useCallback((
    field: DocumentField,
    doc: DocumentType,
    columnInfo: typeof visibleColumns[0]
  ) => {
    const getEffectiveCols = (colInfo) => {
      let cols = colInfo.isExpanded ? 2 : 1
      if (colInfo.isExpanded && colInfo.hasUnderstudy) cols++
      if (colInfo.isExpanded && colInfo.hasReferences) cols++
      return cols
    }

    if (field.type === 'array' || field.type === 'array-container' || field.isArrayItem || field.type === 'object') {
      return (
        <TableCell
          colSpan={getEffectiveCols(columnInfo)}
          key={`${field.id}-${columnInfo.columnKey}`}
          className="text-center border"
        >
          -
        </TableCell>
      )
    }

    const { subdept, clsIndex, subclsIndex, columnKey, isExpanded, hasUnderstudy, hasReferences } = columnInfo
    const fieldId = `${doc.id}-${field.id}`
    const getSubmittingStatus = (allocationId: string, subdeptId: number, classIndex: number | null, subclassIndex: number | null) => {
      const keyParts = [allocationId, subdeptId]
      if (classIndex !== null) keyParts.push(String(classIndex))
      if (subclassIndex !== null) keyParts.push(String(subclassIndex))
      return submittingIds.has(keyParts.join('_'))
    }

    const isSubmitting = getSubmittingStatus(fieldId, subdept.id, clsIndex, subclsIndex)

    if (!isExpanded) {
      return (
        <TableCell
          key={`${fieldId}-${columnKey}`}
          className="text-center border"
          style={{ width: '120px' }}
        >
          <MemoizedCheckbox
            checked={getAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, 'ap')}
            onCheckedChange={(c) => handleDisplayToggle(fieldId, subdept.id, clsIndex, subclsIndex, 'ap', c)}
            disabled={isSubmitting}
            allocationKey={`ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`}
          />
        </TableCell>
      )
    }

    const columns = [
      { type: 'ap' as const, key: `ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` },
      { type: 'dp' as const, key: `dp-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` }
    ]
    if (hasUnderstudy) {
      columns.push({ type: 'understudy' as const, key: `us-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` })
    }
    if (hasReferences) {
      columns.push({ type: 'references' as const, key: `ref-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` })
    }

    return columns.map(column => (
      <TableCell
        key={`${fieldId}-${columnKey}-${column.type}`}
        className="text-center border"
        style={{ width: '120px' }}
      >
        <MemoizedCheckbox
          checked={getAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, column.type)}
          onCheckedChange={(c) => handleDisplayToggle(fieldId, subdept.id, clsIndex, subclsIndex, column.type, c)}
          disabled={isSubmitting}
          allocationKey={column.key}
        />
      </TableCell>
    ))
  }, [getAllocationStatus, handleDisplayToggle, submittingIds])

  const renderClientFieldCheckboxes = useCallback((
    fieldId: string,
    columnInfo: typeof visibleColumns[0]
  ) => {
    const { subdept, clsIndex, subclsIndex, columnKey, isExpanded, hasUnderstudy, hasReferences } = columnInfo
    const getSubmittingStatus = (allocationId: string, subdeptId: number, classIndex: number | null, subclassIndex: number | null) => {
      const keyParts = [allocationId, subdeptId]
      if (classIndex !== null) keyParts.push(String(classIndex))
      if (subclassIndex !== null) keyParts.push(String(subclassIndex))
      return submittingIds.has(keyParts.join('_'))
    }

    const isSubmitting = getSubmittingStatus(fieldId, subdept.id, clsIndex, subclsIndex)

    if (!isExpanded) {
      return (
        <TableCell
          key={`${fieldId}-${columnKey}`}
          className="text-center border"
          style={{ width: '120px' }}
        >
          <MemoizedCheckbox
            checked={getClientFieldAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, 'ap')}
            onCheckedChange={(c) => handleClientFieldToggle(fieldId, subdept.id, clsIndex, subclsIndex, 'ap', c)}
            disabled={isSubmitting}
            allocationKey={`ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`}
          />
        </TableCell>
      )
    }

    const columns = [
      { type: 'ap' as const, key: `ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` },
      { type: 'dp' as const, key: `dp-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` }
    ]
    if (hasUnderstudy) {
      columns.push({ type: 'understudy' as const, key: `us-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` })
    }
    if (hasReferences) {
      columns.push({ type: 'references' as const, key: `ref-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}` })
    }

    return columns.map(column => (
      <TableCell
        key={`${fieldId}-${columnKey}-${column.type}`}
        className="text-center border"
        style={{ width: '120px' }}
      >
        <MemoizedCheckbox
          checked={getClientFieldAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, column.type)}
          onCheckedChange={(c) => handleClientFieldToggle(fieldId, subdept.id, clsIndex, subclsIndex, column.type, c)}
          disabled={isSubmitting}
          allocationKey={column.key}
        />
      </TableCell>
    ))
  }, [getClientFieldAllocationStatus, handleClientFieldToggle, submittingIds])
  
  const handleColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: visible
    }))
  }, [])

  const handleShowAllColumns = useCallback(() => {
    const newVisibility = availableColumns.reduce((acc, col) => ({
      ...acc,
      [col.id]: true
    }), {})
    setColumnVisibility(newVisibility)
  }, [availableColumns])

  const handleHideAllColumns = useCallback(() => {
    const newVisibility = availableColumns.reduce((acc, col) => ({
      ...acc,
      [col.id]: false
    }), {})
    setColumnVisibility(newVisibility)
  }, [availableColumns])

  const handleResetToDefault = useCallback(() => {
    const defaultVisibility = availableColumns.reduce((acc, col) => ({
      ...acc,
      [col.id]: col.isDefault
    }), {})
    setColumnVisibility(defaultVisibility)
  }, [availableColumns])

  const expandAll = useCallback(() => {
    const allExpandableIds = new Set<string>()
    const allCategoryKeys = new Set<string>(Object.keys(groupedDocuments))
    const allClientIds = new Set<string>(clientData.map(c => c.id))
    const allColumnKeys = new Set<string>()

    filteredDocuments.forEach(doc => {
      if (doc.hasFields) {
        allExpandableIds.add(doc.id)
        doc.fields.forEach(field => {
          if (field.hasChildren) {
            allExpandableIds.add(field.id)
          }
        })
      }
    })

    visibleColumns.forEach(col => {
      allColumnKeys.add(col.columnKey)
    })

    startTransition(() => {
      setExpandedCategories(allCategoryKeys)
      setExpandedItems(allExpandableIds)
      setExpandedClientItems(allClientIds)
      setExpandedColumns(allColumnKeys)
    })
  }, [filteredDocuments, groupedDocuments, clientData, visibleColumns])

  const collapseAll = useCallback(() => {
    startTransition(() => {
      setExpandedItems(new Set())
      setExpandedCategories(new Set())
      setExpandedClientItems(new Set())
      setExpandedColumns(new Set())
    })
  }, [])
  
  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({ documents: {}, clientFields: {} })
    setHasUnsavedChanges(false)
  }, [])
  
  const updatedAvailableColumns = useMemo(() => {
    return availableColumns.map(col => ({
      ...col,
      visible: columnVisibility[col.id] || false
    }))
  }, [availableColumns, columnVisibility])

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading documents...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <div className="text-red-500 mb-4">{error}</div>
        <Button onClick={fetchData} variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  if (!currentDepartment) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-600">No department selected.</p>
      </div>
    )
  }
  
  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Document Management</h1>
            <p className="text-gray-600 mt-1">Manage document types and allocations</p>
            {hasUnsavedChanges && (
              <p className="text-orange-600 text-sm mt-1">
                You have {Object.keys(pendingChanges.documents).length + Object.keys(pendingChanges.clientFields).length} unsaved changes
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {hasUnsavedChanges && (
              <>
                <Button
                  variant="outline"
                  onClick={handleDiscardChanges}
                  disabled={isSaving}
                >
                  Discard Changes
                </Button>
                <Button
                  onClick={handleSaveAllChanges}
                  disabled={isSaving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSaving ? 'Saving...' : 'Save All Changes'}
                </Button>
              </>
            )}
            <ColumnVisibilityControl
              columns={updatedAvailableColumns}
              onVisibilityChange={handleColumnVisibilityChange}
              onShowAll={handleShowAllColumns}
              onHideAll={handleHideAllColumns}
              onResetToDefault={handleResetToDefault}
              title="Column Visibility"
              description="Show/hide department columns"
            />
            <Button variant="outline" onClick={expandAll}>
              <Expand className="h-4 w-4 mr-2" />
              Fields
            </Button>
            <Button variant="outline" onClick={collapseAll}>
              <Minimize2 className="h-4 w-4 mr-2" />
              Docs
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            {departments.map(dept => (
              <TabsTrigger key={dept.id} value={dept.id}>{dept.name}</TabsTrigger>
            ))}
          </TabsList>

          {departments.map(dept => (
            <TabsContent key={dept.id} value={dept.id} className="space-y-4">
              <Tabs value={documentTab} onValueChange={setDocumentTab as (value: string) => void} className="w-full">
                <TabsList>
                  <TabsTrigger value="company">Company Documents</TabsTrigger>
                  <TabsTrigger value="individual">Individual Documents</TabsTrigger>
                </TabsList>

                <TabsContent value={documentTab} className="mt-6">
                  {visibleColumns.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No visible columns.</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Use the "Column Visibility" button to show columns.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                        <TooltipProvider>
                          <Table className="min-w-max">
                            <TableHeader className="sticky top-0 bg-blue-600 z-10">
                              {/* Subdepartment Header Row */}
                              <TableRow>
                                <TableHead rowSpan={4} className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center">#</TableHead>
                                <TableHead rowSpan={4} className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white">
                                  <div className="flex items-center justify-between px-4">
                                    <span className="truncate">Document / Field Details</span>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-gray-200 flex-shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[300px]">
                                        <p>Hover over truncated text to see full content. Click + to expand array fields.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TableHead>
                                {/* Subdepartment Headers */}
                                {visibleColumns.reduce((acc, col, index) => {
                                  const prevCol = visibleColumns[index - 1]
                                  if (!prevCol || prevCol.subdept.id !== col.subdept.id) {
                                    const subdeptColumns = visibleColumns.filter(c => c.subdept.id === col.subdept.id)
                                    const totalWidth = subdeptColumns.reduce((sum, c) => sum + c.width, 0)

                                    const colSpan = subdeptColumns.reduce((sum, c) => {
                                      if (!c.isExpanded) return sum + 1
                                      let cols = 2 
                                      if (c.hasUnderstudy) cols++
                                      if (c.hasReferences) cols++
                                      return sum + cols
                                    }, 0)

                                    acc.push(
                                      <TableHead
                                        key={`subdept-${col.subdept.id}`}
                                        colSpan={colSpan}
                                        style={{ width: `${totalWidth}px` }}
                                        className="border-r border-blue-400 px-2 text-center font-semibold text-white bg-blue-700"
                                      >
                                        <MemoizedTruncatedText
                                          text={col.subdept.name}
                                          className="font-semibold text-white"
                                          maxLength={15}
                                        />
                                      </TableHead>
                                    )
                                  }
                                  return acc
                                }, [] as React.ReactNode[])}
                              </TableRow>

                              {/* Class Header Row */}
                              <TableRow>
                                {visibleColumns.reduce((acc, col, index) => {
                                  const prevCol = visibleColumns[index - 1]
                                  const needsClassHeader = !prevCol ||
                                    prevCol.subdept.id !== col.subdept.id ||
                                    prevCol.clsIndex !== col.clsIndex

                                  if (needsClassHeader) {
                                    if (col.clsIndex === null) {
                                      let colSpan = col.isExpanded ? 2 : 1
                                      if (col.isExpanded && col.hasReferences) colSpan++ 

                                      acc.push(
                                        <TableHead
                                          key={`class-direct-${col.subdept.id}`}
                                          colSpan={colSpan}
                                          className="border-r border-blue-400 px-2 text-center text-white text-sm bg-blue-600"
                                        >
                                          Direct
                                        </TableHead>
                                      )
                                    } else {
                                      const classColumns = visibleColumns.filter(c =>
                                        c.subdept.id === col.subdept.id && c.clsIndex === col.clsIndex
                                      )

                                      const colSpan = classColumns.reduce((sum, c) => {
                                        if (!c.isExpanded) return sum + 1
                                        let cols = 2 
                                        if (c.hasUnderstudy) cols++
                                        if (c.hasReferences) cols++
                                        return sum + cols
                                      }, 0)

                                      const className = col.subdept.classes?.[col.clsIndex]?.name || ''
                                      acc.push(
                                        <TableHead
                                          key={`class-${col.subdept.id}-${col.clsIndex}`}
                                          colSpan={colSpan}
                                          className="border-r border-blue-400 px-2 text-center text-white text-sm bg-blue-600"
                                        >
                                          <MemoizedTruncatedText
                                            text={className}
                                            className="text-sm text-white"
                                            maxLength={15}
                                          />
                                        </TableHead>
                                      )
                                    }
                                  }
                                  return acc
                                }, [] as React.ReactNode[])}
                              </TableRow>

                              {/* Subclass Header Row */}
                              <TableRow>
                                {visibleColumns.map(col => {
                                  let colSpan = col.isExpanded ? 2 : 1 
                                  if (col.isExpanded && col.hasUnderstudy) colSpan++ 
                                  if (col.isExpanded && col.hasReferences) colSpan++ 

                                  if (col.subclsIndex !== null) {
                                    const subclassName = col.subdept.classes?.[col.clsIndex!]?.subclasses?.[col.subclsIndex]?.name || ''
                                    return (
                                      <TableHead
                                        key={`subclass-${col.columnKey}`}
                                        colSpan={colSpan}
                                        className="border-r border-blue-400 border-l border-blue-300 px-2 text-center text-white text-xs bg-blue-500"
                                      >
                                        <MemoizedTruncatedText
                                          text={subclassName}
                                          className="text-xs text-white"
                                          maxLength={10}
                                        />
                                      </TableHead>
                                    )
                                  } else {
                                    return (
                                      <TableHead
                                        key={`subclass-direct-${col.columnKey}`}
                                        colSpan={colSpan}
                                        className="border-r border-blue-400 border-l border-blue-300 text-center text-white text-xs bg-blue-500"
                                      >
                                        -
                                      </TableHead>
                                    )
                                  }
                                })}
                              </TableRow>

                              {/* Column Headers (AP/DP/US/REF) */}
                              <TableRow>
                                {renderColumnHeaders()}
                              </TableRow>
                            </TableHeader>

                            <TableBody>
                              {/* Documents & Fields Section */}
                              {Object.keys(groupedDocuments).length > 0 && (
                                <React.Fragment>
                                  <SectionHeader
                                    title="Documents & Fields"
                                    icon={FileText}
                                    count={Object.values(groupedDocuments).reduce((total, group) => total + group.documents.length, 0)}
                                  />

                                  {Object.entries(groupedDocuments)
                                    .sort(([a], [b]) => {
                                      const aNum = parseInt(a === 'other' ? '999' : a, 10)
                                      const bNum = parseInt(b === 'other' ? '999' : b, 10)
                                      return aNum - bNum
                                    })
                                    .map(([categoryKey, group]) => {
                                      const isCategoryExpanded = expandedCategories.has(categoryKey)

                                      return (
                                        <React.Fragment key={`category-fragment-${categoryKey}`}>
                                          {/* Category Header Row */}
                                          <TableRow
                                            className="bg-blue-50 hover:bg-blue-50/80 transition-colors cursor-pointer"
                                            onClick={() => toggleCategoryExpansion(categoryKey)}
                                          >
                                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700 w-16">
                                              {group.mainCategoryNumber}
                                            </TableCell>
                                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                              <div className="flex items-center justify-between px-4">
                                                <MemoizedTruncatedText
                                                  text={group.mainCategory}
                                                  className="font-semibold text-gray-700 flex-1 min-w-0 pr-2"
                                                  maxLength={35}
                                                />
                                                <span className="text-xs bg-blue-200 text-gray-700 px-2 py-1 rounded-full mr-2">{group.documents.length}</span>
                                                {isCategoryExpanded ? <Minus className="h-4 w-4 text-gray-600" /> : <Plus className="h-4 w-4 text-gray-600" />}
                                              </div>
                                            </TableCell>
                                            {visibleColumns.map(col => {
                                              let colSpan = col.isExpanded ? 2 : 1 
                                              if (col.isExpanded && col.hasUnderstudy) colSpan++
                                              if (col.isExpanded && col.hasReferences) colSpan++ 

                                              return (
                                                <TableCell
                                                  key={col.columnKey}
                                                  colSpan={colSpan}
                                                  className="border-r border-l text-center"
                                                >
                                                  -
                                                </TableCell>
                                              )
                                            })}
                                          </TableRow>

                                          {/* Document Rows */}
                                          {isCategoryExpanded && group.documents.map((doc, docIndex) => {
                                            const isDocExpanded = expandedItems.has(doc.id)

                                            return (
                                              <React.Fragment key={`doc-fragment-${doc.id}`}>
                                                {/* Document Header Row */}
                                                <TableRow className="group bg-blue-50 hover:bg-blue-100">
                                                  <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center font-semibold w-16">
                                                    {`${group.mainCategoryNumber}.${docIndex + 1}`}
                                                  </TableCell>
                                                  <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] w-[300px] pr-2">
                                                    <div className="flex items-center gap-2 px-4">
                                                      <div className="flex items-center justify-between flex-1">
                                                        <MemoizedTruncatedText
                                                          text={doc.display_name}
                                                          className="font-semibold text-gray-800 flex-1 min-w-0 pr-2"
                                                          maxLength={25}
                                                        />
                                                        {doc.hasFields && (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 flex-shrink-0 text-blue-600 hover:bg-blue-200"
                                                            onClick={(e) => {
                                                              e.stopPropagation()
                                                              toggleItemExpansion(doc.id)
                                                            }}
                                                          >
                                                            {isDocExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                          </Button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </TableCell>
                                                  {visibleColumns.map(col => renderDocumentCheckboxes(doc, col)).flat()}
                                                </TableRow>

                                                {/* Field Rows */}
                                                {isDocExpanded && doc.hasFields && doc.fields
                                                  .filter(field => !field.parentId || expandedItems.has(field.parentId))
                                                  .map((field) => {
                                                    const isFieldExpanded = expandedItems.has(field.id)

                                                    return (
                                                      <TableRow key={`field-${field.id}`} className="group bg-blue-25 hover:bg-blue-50">
                                                        <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-16 text-center text-sm text-gray-500">
                                                          {field.path}
                                                        </TableCell>
                                                        <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-[300px]">
                                                          <div className="flex items-center px-4" style={{ paddingLeft: `${(field.level + 2) * 1.25}rem` }}>
                                                            <div className="flex items-center gap-1 flex-1 min-w-0">
                                                              <MemoizedTruncatedText
                                                                text={field.name}
                                                                className={cn(
                                                                  'text-sm flex-shrink-0',
                                                                  field.type === 'array' ? 'text-gray-600 font-semibold' : 'text-gray-700'
                                                                )}
                                                                maxLength={field.level > 1 ? 20 : 30}
                                                              />
                                                              {field.type && (
                                                                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                                                  ({field.type})
                                                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                                                </span>
                                                              )}
                                                            </div>
                                                            {field.hasChildren && field.type === 'array' && (
                                                              <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0 flex-shrink-0"
                                                                onClick={() => toggleItemExpansion(field.id)}
                                                              >
                                                                {isFieldExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                              </Button>
                                                            )}
                                                          </div>
                                                        </TableCell>
                                                        {visibleColumns.map(col => renderFieldCheckboxes(field, doc, col)).flat()}
                                                      </TableRow>
                                                    )
                                                  })}
                                              </React.Fragment>
                                            )
                                          })}
                                        </React.Fragment>
                                      )
                                    })}
                                </React.Fragment>
                              )}

                              {/* Separator */}
                              {(Object.keys(groupedDocuments).length > 0 && clientFormFields.length > 0) && (
                                <TableRow>
                                  <TableCell colSpan={100} className="p-0">
                                    <Separator className="my-4" />
                                  </TableCell>
                                </TableRow>
                              )}

                              {/* Client Form Fields Section */}
                              {clientFormFields.length > 0 && (
                                <React.Fragment>
                                  <SectionHeader
                                    title="Client Form Fields"
                                    icon={Users}
                                    count={clientFormFields.length}
                                  />

                                  {Object.entries(groupedClientFields.formSections).map(([sectionKey, section], sectionIndex) => [
                                    <TableRow key={`form-section-${sectionKey}`} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                                      <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700 w-16">
                                        {sectionIndex + 1}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                        <div className="flex items-center justify-between px-4">
                                          <MemoizedTruncatedText
                                            text={section.title}
                                            className="font-semibold text-blue-700 flex-1 min-w-0 pr-2"
                                            maxLength={35}
                                          />
                                          <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full mr-2">
                                            {section.fields.filter(f => f.showInTable).length}
                                          </span>
                                        </div>
                                      </TableCell>
                                      {visibleColumns.map(col => {
                                        let colSpan = col.isExpanded ? 2 : 1 
                                        if (col.isExpanded && col.hasUnderstudy) colSpan++
                                        if (col.isExpanded && col.hasReferences) colSpan++ 
                                        
                                        return (
                                          <TableCell
                                            key={`form-section-cell-${sectionKey}-${col.columnKey}`}
                                            colSpan={colSpan}
                                            className="text-center border bg-blue-100"
                                          >
                                            -
                                          </TableCell>
                                        )
                                      })}
                                    </TableRow>,

                                    ...section.fields.filter(field => field.showInTable).map((field, fieldIndex) => (
                                      <TableRow key={`form-field-${field.name}`} className="group bg-blue-25 hover:bg-blue-50">
                                        <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-16 text-center text-sm text-blue-500">
                                          {sectionIndex + 1}.{fieldIndex + 1}
                                        </TableCell>
                                        <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-[300px]">
                                          <div className="flex items-center px-4 pl-8">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <div className="flex flex-col flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <MemoizedTruncatedText
                                                    text={field.tableHeader || field.label}
                                                    className="text-sm font-medium text-gray-700"
                                                    maxLength={25}
                                                  />
                                                  {field.type && (
                                                    <span className="text-xs text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                                                      {field.type}
                                                    </span>
                                                  )}
                                                  {field.required && (
                                                    <span className="text-xs text-red-500 bg-red-100 px-1 py-0.5 rounded">
                                                      Required
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </TableCell>
                                        {visibleColumns.map(col => renderClientFieldCheckboxes(`form-field-${field.name}`, col)).flat()}
                                      </TableRow>
                                    ))
                                  ])}

                                  {Object.entries(groupedClientFields.platformCredentials).map(([platformKey, platform], sectionIndex) => [
                                    <TableRow key={`platform-${platformKey}`} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                                      <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700 w-16">
                                        P{sectionIndex + 1}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                        <div className="flex items-center justify-between px-4">
                                          <MemoizedTruncatedText
                                            text={platform.title}
                                            className="font-semibold text-blue-700 flex-1 min-w-0 pr-2"
                                            maxLength={35}
                                          />
                                          <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full mr-2">
                                            {platform.fields.filter(f => f.showInTable).length}
                                          </span>
                                        </div>
                                      </TableCell>
                                      {visibleColumns.map(col => {
                                        let colSpan = col.isExpanded ? 2 : 1
                                        if (col.isExpanded && col.hasUnderstudy) colSpan++ 
                                        if (col.isExpanded && col.hasReferences) colSpan++ 
                                        
                                        return (
                                          <TableCell
                                            key={`platform-cell-${platformKey}-${col.columnKey}`}
                                            colSpan={colSpan}
                                            className="text-center border bg-blue-100"
                                          >
                                            -
                                          </TableCell>
                                        )
                                      })}
                                    </TableRow>,

                                    ...platform.fields.filter(field => field.showInTable).map((field, fieldIndex) => (
                                      <TableRow key={`platform-field-${platformKey}-${field.name}`} className="group bg-blue-25 hover:bg-blue-50">
                                        <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-16 text-center text-sm text-blue-500">
                                          P{sectionIndex + 1}.{fieldIndex + 1}
                                        </TableCell>
                                        <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-[300px]">
                                          <div className="flex items-center px-4 pl-8">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <div className="flex flex-col flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <MemoizedTruncatedText
                                                    text={field.tableHeader || field.label}
                                                    className="text-sm font-medium text-gray-700"
                                                    maxLength={25}
                                                  />
                                                  {field.type && (
                                                    <span className="text-xs text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                                                      {field.type}
                                                    </span>
                                                  )}
                                                  {field.type === 'password' && (
                                                    <span className="text-xs text-orange-600 bg-orange-100 px-1 py-0.5 rounded">
                                                      🔒
                                                    </span>
                                                  )}
                                                  {field.required && (
                                                    <span className="text-xs text-red-500 bg-red-100 px-1 py-0.5 rounded">
                                                      Required
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </TableCell>
                                        {visibleColumns.map(col => renderClientFieldCheckboxes(`platform-${platformKey}-${field.name}`, col)).flat()}
                                      </TableRow>
                                    ))
                                  ])}
                                </React.Fragment>
                              )}

                              {Object.keys(groupedDocuments).length === 0 && clientFormFields.length === 0 && clientData.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={2 + visibleColumns.reduce((sum, col) => {
                                    let cols = col.isExpanded ? 2 : 1
                                    if (col.isExpanded && col.hasUnderstudy) cols++ 
                                    if (col.isExpanded && col.hasReferences) cols++
                                    return sum + cols
                                  }, 0)} className="text-center py-12 text-gray-500">
                                    <div className="flex flex-col items-center gap-4">
                                      <FileText className="h-12 w-12 text-gray-300" />
                                      <div>
                                        <h3 className="font-medium text-gray-900">No data available</h3>
                                        <p className="text-sm text-gray-500 mt-1">No documents or client data found for this category.</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </TooltipProvider>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}