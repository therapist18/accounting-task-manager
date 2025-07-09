// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
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
import { getTableFields, getGroupedFields, FormField } from "./formFields"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "@/app/(dashboard)/dashboard/departments/main-shared-components/column-visibility"
import { DocumentType, Subdepartment, DocumentField, ClientData, Department, GroupedDocuments, SubdepartmentClass, TruncatedText, SectionHeader, OptimizedCheckbox } from "./types"
import { CATEGORY_MAPPING, CLASS_D_ID, CACHE_DURATION, DEBOUNCE_DELAY, cache, getCachedData, setCachedData, debounce } from "./config"
import {
  formatFieldValue as formatFieldValueUtil,
  processDocumentFields,
  groupDocumentsByCategory,
  filterAndSortDocuments,
  hasVisibleColumns,
  getAllocationStatus as getAllocationStatusUtil,
  getColumnKey as getColumnKeyUtil,
  shouldShowUnderstudy as shouldShowUnderstudyUtil,
  getColumnWidth as getColumnWidthUtil,
  toggleSetItem,
  processDocumentFieldsWithCache,
  groupDocumentsByCategoryWithCache,
  getClientFieldAllocationStatus as getClientFieldAllocationStatusUtil,
  getTotalColSpan as getTotalColSpanUtil,
  initializeColumnVisibility
} from "./utils"

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [clientData, setClientData] = useState<ClientData[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, {
    ap: boolean
    dp: boolean
    understudy: boolean
    kycdocumentid: string | null
  }>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, {
    ap: boolean
    dp: boolean
    understudy: boolean
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
  const renderCountRef = useRef(0)
  const lastFetchTimeRef = useRef(0)
  // Add these new state variables
  const [pendingChanges, setPendingChanges] = useState<{
    documents: Record<string, { ap: boolean; dp: boolean; understudy: boolean }>;
    clientFields: Record<string, { ap: boolean; dp: boolean; understudy: boolean }>;
  }>({
    documents: {},
    clientFields: {}
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const getColumnKey = useCallback((subdeptId: number, clsIndex: number | null, subclsIndex: number | null = null) => {
    return getColumnKeyUtil(subdeptId, clsIndex, subclsIndex)
  }, [])

  const shouldShowUnderstudy = useCallback((subdept: Subdepartment, clsIndex: number | null) => {
    return shouldShowUnderstudyUtil(subdept, clsIndex)
  }, [])

  const getColumnWidth = useCallback((subdept: Subdepartment, clsIndex: number | null, subclsIndex: number | null = null) => {
    return getColumnWidthUtil(
      subdept,
      clsIndex,
      subclsIndex,
      expandedColumns,
      getColumnKey,
      shouldShowUnderstudy
    )
  }, [expandedColumns, getColumnKey, shouldShowUnderstudy])

  // Toggle column expansion
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

  // Format field values using the utility function
  const formatFieldValue = useMemo(() => formatFieldValueUtil, [])

  // Process document fields with caching
  const processDocumentFieldsWithCache = useCallback((docs: DocumentType[]) => {
    const cacheKey = `processed-fields-${docs.length}-${docs.map(d => d.id).join('-')}`
    const cached = getCachedData(cacheKey)
    if (cached) return cached

    const processedDocs = processDocumentFields(docs.map(doc => ({
      ...doc,
      fields: doc.fields || []
    })))

    setCachedData(cacheKey, processedDocs)
    return processedDocs
  }, [])

  // Group documents by category with caching
  const groupDocumentsByCategoryWithCache = useCallback((docs: DocumentType[]): GroupedDocuments => {
    const cacheKey = `grouped-docs-${docs.length}-${docs.map(d => d.main_category_number).join('-')}`
    const cached = getCachedData(cacheKey)
    if (cached) return cached

    const grouped = groupDocumentsByCategory(docs)
    setCachedData(cacheKey, grouped)
    return grouped
  }, [])

  const { filteredDocuments, groupedDocuments } = useMemo(() => {
    renderCountRef.current++

    if (!documents.length) return { filteredDocuments: [], groupedDocuments: {} }

    // Remove caching here to prevent loops
    const result = filterAndSortDocuments(documents, documentTab)
    return result
  }, [documents, documentTab])

  // Enhanced memoized selectors
  const currentDepartment = useMemo(() =>
    departments.find(d => d.id === activeTab) || null,
    [departments, activeTab]
  )

  // Enhanced normalized subdepartments with support for subdepartments without classes
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

    return currentDepartment.subdepartments.map(dept => {
      // If subdepartment has no classes, treat the subdepartment itself as a "class"
      if (!dept.classes || dept.classes.length === 0) {
        return {
          ...dept,
          hasClasses: false,
          classes: []
        }
      }

      return {
        ...dept,
        hasClasses: true,
        classes: dept.classes.map(cls => ({
          ...cls,
          id: cls.id || `class-${cls.name}`, // Ensure each class has an ID
          subclasses: cls.subclasses || []
        }))
      }
    })
  }, [currentDepartment])

  const clientFormFields = useMemo(() => getTableFields(documentTab), [documentTab])
  const groupedClientFields = useMemo(() => getGroupedFields(documentTab), [documentTab])

  // Enhanced data fetching with default display filtering
  const fetchData = useCallback(async () => {
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
        // Fetch departments with default display filtering
        supabase
          .from('tm_departments')
          .select(`
          *, 
          tm_subdepartments (*, classes)
        `)
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
                // Keep track of default status but don't filter
                isDefault: cls.default_display === true,
                subClasses: (cls.subClasses || []).map((subCls: any) => ({
                  ...subCls,
                  isDefault: subCls.default_display === true
                }))
              }))
              : [],
            hasClasses: subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0
          }))
      }))

      const processedDocuments = (documentsResponse.data || []).map((doc: any) => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }))

      // Updated allocation processing with AP, DP, and understudy
      const documentSettings: Record<string, { ap: boolean, dp: boolean, understudy: boolean, kycdocumentid: string | null }> = {}
      const clientFieldSettings: Record<string, { ap: boolean, dp: boolean, understudy: boolean }> = {}

      requirementsResponse.data?.forEach((req: any) => {
        if (Array.isArray(req.documents_and_fields)) {
          req.documents_and_fields.forEach((item: any) => {
            if (item?.id !== undefined) {
              documentSettings[item.id] = {
                ap: Boolean(item.ap || item.display), // Backward compatibility
                dp: Boolean(item.dp),
                understudy: Boolean(item.understudy),
                kycdocumentid: item.kycdocumentid || null
              }
            }
          })
        }

        if (Array.isArray(req.client_fields)) {
          req.client_fields.forEach((item: any) => {
            if (item?.id !== undefined) {
              clientFieldSettings[item.id] = {
                ap: Boolean(item.ap || item.display), // Backward compatibility
                dp: Boolean(item.dp),
                understudy: Boolean(item.understudy)
              }
            }
          })
        }
      })

      // Generate available columns for visibility control
      const columns: ColumnVisibilityOption[] = []

      transformedDepartments.forEach((dept: any) => {
        dept.subdepartments?.forEach((subdept: any) => {
          if (subdept.hasClasses) {
            subdept.classes?.forEach((cls: any, clsIndex: number) => {
              if (cls.subClasses?.length) {
                cls.subClasses.forEach((subcls: any, subclsIndex: number) => {
                  const subclsKey = `subdept_${subdept.id}_cls_${clsIndex}_subcls_${subclsIndex}`
                  columns.push({
                    id: subclsKey,
                    label: `${subdept.name} > ${cls.name} > ${subcls.name}`,
                    visible: subcls.isDefault === true, // Only defaults visible initially
                    isDefault: subcls.isDefault === true,
                    group: subdept.name
                  })
                })
              } else {
                const clsKey = `subdept_${subdept.id}_cls_${clsIndex}`
                columns.push({
                  id: clsKey,
                  label: `${subdept.name} > ${cls.name}`,
                  visible: cls.isDefault === true, // Only defaults visible initially
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
              visible: subdept.default_display === true, // Only defaults visible initially
              isDefault: subdept.default_display === true,
              group: dept.name
            })
          }
        })
      })

      const result = {
        departments: transformedDepartments,
        documents: processedDocuments,
        documentAllocations: documentSettings,
        clientFieldAllocations: clientFieldSettings,
        availableColumns: columns
      }

      // Cache the result
      setCachedData(cacheKey, result)

      // Batch state updates using startTransition for better performance
      startTransition(() => {
        setDepartments(transformedDepartments)
        setDocuments(processedDocuments)
        setDocumentAllocations(documentSettings)
        setClientFieldAllocations(clientFieldSettings)
        setAvailableColumns(columns)

        if (transformedDepartments.length > 0) {
          setActiveTab(transformedDepartments[0].id)
        }

        // Auto-expand with optimization
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

  // Debounced refresh function
  const refreshData = useMemo(
    () => debounce(async () => {
      try {
        const { data: requirementsData, error } = await supabase
          .from('tm_class_requirements')
          .select('documents_and_fields, client_fields, class_id')

        if (error) throw error

        const documentSettings: Record<string, { ap: boolean, dp: boolean, understudy: boolean, kycdocumentid: string | null }> = {}
        const clientFieldSettings: Record<string, { ap: boolean, dp: boolean, understudy: boolean }> = {}

        requirementsData?.forEach((req: any) => {
          if (Array.isArray(req.documents_and_fields)) {
            req.documents_and_fields.forEach((item: any) => {
              if (item?.id !== undefined) {
                documentSettings[item.id] = {
                  ap: Boolean(item.ap || item.display), // Backward compatibility
                  dp: Boolean(item.dp),
                  understudy: Boolean(item.understudy),
                  kycdocumentid: item.kycdocumentid || null
                }
              }
            })
          }

          if (Array.isArray(req.client_fields)) {
            req.client_fields.forEach((item: any) => {
              if (item?.id !== undefined) {
                clientFieldSettings[item.id] = {
                  ap: Boolean(item.ap || item.display), // Backward compatibility
                  dp: Boolean(item.dp),
                  understudy: Boolean(item.understudy)
                }
              }
            })
          }
        })

        startTransition(() => {
          setDocumentAllocations(documentSettings)
          setClientFieldAllocations(clientFieldSettings)
        })
      } catch (error) {
        console.error('Error refreshing data:', error)
      }
    }, DEBOUNCE_DELAY),
    []
  )
  useEffect(() => {
    fetchData()
  }, [documentTab])
  // Fix the visibleNormalizedSubdepartments to prevent loops:
  const visibleNormalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments?.length) {
      return [{
        id: -1,
        name: 'No Subdepartments',
        department_id: currentDepartment?.id || '',
        hasClasses: false,
        classes: []
      }]
    }

    // If no column visibility set yet, show only defaults
    if (Object.keys(columnVisibility).length === 0) {
      return normalizedSubdepartments.filter(subdept => {
        if (!subdept.hasClasses) {
          return subdept.default_display === true
        }
        return subdept.classes?.some(cls => cls.isDefault === true) || false
      })
    }

    // Filter based on column visibility
    return normalizedSubdepartments
      .filter((subdept) => hasVisibleColumns(subdept, columnVisibility, getColumnKey))
      .map(dept => {
        if (!dept.hasClasses) return dept

        const filteredClasses = dept.classes?.filter((cls, clsIndex) => {
          if (cls.subclasses?.length) {
            return cls.subclasses.some((_, subclsIndex) => {
              const subclsKey = getColumnKey(dept.id, clsIndex, subclsIndex)
              return columnVisibility[subclsKey] === true
            })
          } else {
            const clsKey = getColumnKey(dept.id, clsIndex)
            return columnVisibility[clsKey] === true
          }
        }) || []

        return {
          ...dept,
          classes: filteredClasses.map((cls, clsIndex) => ({
            ...cls,
            id: cls.id || `class-${cls.name}`,
            subclasses: cls.subclasses?.filter((_, subclsIndex) => {
              const subclsKey = getColumnKey(dept.id, clsIndex, subclsIndex)
              return columnVisibility[subclsKey] === true
            }) || []
          }))
        }
      })
  }, [currentDepartment, normalizedSubdepartments, columnVisibility]) // Remove getColumnKey dependency

  const handleColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
    console.log('Toggling column:', columnId, 'to', visible)
    setColumnVisibility(prev => {
      const newVisibility = { ...prev, [columnId]: visible }
      console.log('New visibility state:', Object.values(newVisibility).filter(Boolean).length, 'visible')
      return newVisibility
    })
  }, [])

  // Optimized toggle functions with stable references
  const toggleItemExpansion = useCallback((itemId: string) => {
    setExpandedItems(prev => toggleSetItem(prev, itemId))
  }, [])

  const toggleCategoryExpansion = useCallback((categoryKey: string) => {
    setExpandedCategories(prev => toggleSetItem(prev, categoryKey))
  }, [])

  const toggleClientItemExpansion = useCallback((clientId: string) => {
    setExpandedClientItems(prev => toggleSetItem(prev, clientId))
  }, [])

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

    // Add all column keys for expansion
    normalizedSubdepartments.forEach(subdept => {
      if (subdept.hasClasses) {
        subdept.classes?.forEach((cls, clsIndex) => {
          if (cls.subclasses?.length) {
            cls.subclasses.forEach((_, subclsIndex) => {
              allColumnKeys.add(getColumnKey(subdept.id, clsIndex, subclsIndex))
            })
          } else {
            allColumnKeys.add(getColumnKey(subdept.id, clsIndex))
          }
        })
      } else {
        allColumnKeys.add(getColumnKey(subdept.id, null))
      }
    })

    startTransition(() => {
      setExpandedCategories(allCategoryKeys)
      setExpandedItems(allExpandableIds)
      setExpandedClientItems(allClientIds)
      setExpandedColumns(allColumnKeys)
    })
  }, [filteredDocuments, groupedDocuments, clientData, normalizedSubdepartments, getColumnKey])

  const collapseAll = useCallback(() => {
    startTransition(() => {
      setExpandedItems(new Set())
      setExpandedCategories(new Set())
      setExpandedClientItems(new Set())
      setExpandedColumns(new Set())
    })
  }, [])

  // Update the column visibility handlers:
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
  // Replace the useEffect for column visibility:
  useEffect(() => {
    if (availableColumns.length > 0 && Object.keys(columnVisibility).length === 0) {
      console.log('Initializing column visibility:', availableColumns.length, 'columns')

      const initialVisibility = availableColumns.reduce((acc, col) => {
        acc[col.id] = col.visible // Use the visible property from fetchData
        return acc
      }, {} as Record<string, boolean>)

      console.log('Initial visibility:', Object.values(initialVisibility).filter(Boolean).length, 'visible columns')
      setColumnVisibility(initialVisibility)
    }
  }, [availableColumns.length]) // Only depend on length to prevent loops

  // Replace handleDisplayToggle with this version that tracks changes
  const handleDisplayToggle = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null,
    columnType: 'ap' | 'dp' | 'understudy',
    checked: boolean = false
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)

    // Create allocation key
    const allocationKey = !subdept?.hasClasses && classIndex === null
      ? [allocationId, subdeptId, 'direct'].join('_')
      : [allocationId, subdeptId, classIndex, ...(subclassIndex !== null ? [subclassIndex] : [])].join('_')

    // Update pending changes instead of immediate save
    setPendingChanges(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [allocationKey]: {
          ...prev.documents[allocationKey],
          [columnType]: checked
        }
      }
    }))

    setHasUnsavedChanges(true)
  }, [currentDepartment])

  // Similar update for handleClientFieldToggle
  const handleClientFieldToggle = useCallback((
    fieldId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null,
    columnType: 'ap' | 'dp' | 'understudy',
    checked: boolean = false
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)

    const allocationKey = !subdept?.hasClasses && classIndex === null
      ? [fieldId, subdeptId, 'direct'].join('_')
      : [fieldId, subdeptId, classIndex, ...(subclassIndex !== null ? [subclassIndex] : [])].join('_')

    setPendingChanges(prev => ({
      ...prev,
      clientFields: {
        ...prev.clientFields,
        [allocationKey]: {
          ...prev.clientFields[allocationKey],
          [columnType]: checked
        }
      }
    }))

    setHasUnsavedChanges(true)
  }, [currentDepartment])

  const getAllocationStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null,
    columnType: 'ap' | 'dp' | 'understudy'
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)

    const allocationKey = !subdept?.hasClasses && classIndex === null
      ? [allocationId, subdeptId, 'direct'].join('_')
      : [allocationId, subdeptId, classIndex, ...(subclassIndex !== null ? [subclassIndex] : [])].join('_')

    // Check pending changes first
    if (pendingChanges.documents[allocationKey]?.[columnType] !== undefined) {
      return pendingChanges.documents[allocationKey][columnType]
    }

    // Fall back to saved state
    return getAllocationStatusUtil(
      allocationId,
      subdeptId,
      classIndex,
      subclassIndex,
      columnType,
      documentAllocations,
      currentDepartment
    )
  }, [pendingChanges.documents, documentAllocations, currentDepartment])

  const getClientFieldAllocationStatus = useCallback((
    fieldId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null,
    columnType: 'ap' | 'dp' | 'understudy'
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)

    const allocationKey = !subdept?.hasClasses && classIndex === null
      ? [fieldId, subdeptId, 'direct'].join('_')
      : [fieldId, subdeptId, classIndex, ...(subclassIndex !== null ? [subclassIndex] : [])].join('_')

    // Check pending changes first
    if (pendingChanges.clientFields[allocationKey]?.[columnType] !== undefined) {
      return pendingChanges.clientFields[allocationKey][columnType]
    }

    // Fall back to saved state
    return getClientFieldAllocationStatusUtil(
      fieldId,
      subdeptId,
      classIndex,
      subclassIndex,
      columnType,
      clientFieldAllocations,
      currentDepartment
    )
  }, [pendingChanges.clientFields, clientFieldAllocations, currentDepartment])

  // Update the getTotalColSpan function to handle colspan 3
  const getTotalColSpan = useCallback((subdept: Subdepartment) => {
    if (!subdept.hasClasses) {
      const columnKey = getColumnKey(subdept.id, null)
      const isExpanded = expandedColumns.has(columnKey)
      return isExpanded ? 3 : 1
    }

    const colSpan = subdept.classes?.reduce((total, cls, clsIndex) => {
      const hasSubclasses = cls.subclasses?.length || 0
      const columnKey = getColumnKey(subdept.id, clsIndex)
      const isExpanded = expandedColumns.has(columnKey)
      const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

      if (hasSubclasses > 0) {
        // For subclasses, each subclass gets its own column group
        return total + (hasSubclasses * (isExpanded ? (hasUnderstudy ? 3 : 2) : 1))
      } else {
        // For classes without subclasses
        return total + (isExpanded ? (hasUnderstudy ? 3 : 2) : 1)
      }
    }, 0) || 1

    return Math.max(1, colSpan)
  }, [expandedColumns, getColumnKey, shouldShowUnderstudy])

  const shouldShowCheckbox = useCallback((field: DocumentField) => {
    return field.type !== 'array' &&
      field.type !== 'array-container' &&
      !field.isArrayItem &&
      field.type !== 'object'
  }, [])

  const getSubmittingStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null
  ) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId)

    // Handle subdepartments without classes
    if (!subdept?.hasClasses && classIndex === null) {
      const directKey = [allocationId, subdeptId, 'direct'].join('_')
      return submittingIds.has(directKey)
    }

    const keyParts = [allocationId, subdeptId]
    if (classIndex !== null) keyParts.push(String(classIndex))
    if (subclassIndex !== null) keyParts.push(String(subclassIndex))
    const allocationKey = keyParts.join('_')
    return submittingIds.has(allocationKey)
  }, [submittingIds, currentDepartment])

  const handleSaveAllChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return

    setIsSaving(true)

    try {
      // Group changes by class_id for batch processing
      const changesByClassId: Record<string, {
        documents: Record<string, any>;
        clientFields: Record<string, any>;
      }> = {}

      // Process document changes
      Object.entries(pendingChanges.documents).forEach(([allocationKey, changes]) => {
        const [allocationId, subdeptId, ...rest] = allocationKey.split('_')

        const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === parseInt(subdeptId))

        let classId: string
        if (!subdept?.hasClasses) {
          classId = subdeptId
        } else {
          const [classIndex, subclassIndex] = rest.map(r => r === 'direct' ? null : parseInt(r))
          const classItem = classIndex !== null ? subdept?.classes?.[classIndex] : null
          classId = subdept && classItem
            ? [subdeptId, classItem.id, ...(subclassIndex !== null ? [subclassIndex] : [])].join('_')
            : subdeptId
        }

        if (!changesByClassId[classId]) {
          changesByClassId[classId] = { documents: {}, clientFields: {} }
        }

        changesByClassId[classId].documents[allocationKey] = {
          id: allocationKey,
          ...changes,
          updated_at: new Date().toISOString()
        }
      })

      // Process client field changes
      Object.entries(pendingChanges.clientFields).forEach(([allocationKey, changes]) => {
        const [fieldId, subdeptId, ...rest] = allocationKey.split('_')

        const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === parseInt(subdeptId))

        let classId: string
        if (!subdept?.hasClasses) {
          classId = subdeptId
        } else {
          const [classIndex, subclassIndex] = rest.map(r => r === 'direct' ? null : parseInt(r))
          const classItem = classIndex !== null ? subdept?.classes?.[classIndex] : null
          classId = subdept && classItem
            ? [subdeptId, classItem.id, ...(subclassIndex !== null ? [subclassIndex] : [])].join('_')
            : subdeptId
        }

        if (!changesByClassId[classId]) {
          changesByClassId[classId] = { documents: {}, clientFields: {} }
        }

        changesByClassId[classId].clientFields[allocationKey] = {
          id: allocationKey,
          ...changes,
          updated_at: new Date().toISOString()
        }
      })

      // Save each class_id's changes
      const savePromises = Object.entries(changesByClassId).map(async ([classId, classChanges]) => {
        // Get existing data
        const { data: existingData, error: fetchError } = await supabase
          .from('tm_class_requirements')
          .select('documents_and_fields, client_fields')
          .eq('class_id', classId)
          .maybeSingle()

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError
        }

        // Merge with existing data
        const existingDocuments = Array.isArray(existingData?.documents_and_fields) ? existingData.documents_and_fields : []
        const existingClientFields = Array.isArray(existingData?.client_fields) ? existingData.client_fields : []

        // Update documents
        const updatedDocuments = [...existingDocuments]
        Object.values(classChanges.documents).forEach(newDoc => {
          const existingIndex = updatedDocuments.findIndex(doc => doc.id === newDoc.id)
          if (existingIndex >= 0) {
            updatedDocuments[existingIndex] = { ...updatedDocuments[existingIndex], ...newDoc }
          } else {
            updatedDocuments.push(newDoc)
          }
        })

        // Update client fields
        const updatedClientFields = [...existingClientFields]
        Object.values(classChanges.clientFields).forEach(newField => {
          const existingIndex = updatedClientFields.findIndex(field => field.id === newField.id)
          if (existingIndex >= 0) {
            updatedClientFields[existingIndex] = { ...updatedClientFields[existingIndex], ...newField }
          } else {
            updatedClientFields.push(newField)
          }
        })

        // Save to database
        const recordData = {
          class_id: classId,
          documents_and_fields: updatedDocuments,
          client_fields: updatedClientFields,
          updated_at: new Date().toISOString(),
          ...((!existingData) && { created_at: new Date().toISOString() })
        }

        const { error: upsertError } = await supabase
          .from('tm_class_requirements')
          .upsert(recordData, { onConflict: 'class_id' })

        if (upsertError) throw upsertError
      })

      await Promise.all(savePromises)

      // Clear pending changes and refresh data
      setPendingChanges({ documents: {}, clientFields: {} })
      setHasUnsavedChanges(false)
      await refreshData()

      toast({
        title: "Success",
        description: `Saved ${Object.keys(pendingChanges.documents).length + Object.keys(pendingChanges.clientFields).length} changes successfully`,
        variant: "default",
      })

    } catch (error) {
      console.error('Error saving changes:', error)
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [pendingChanges, hasUnsavedChanges, currentDepartment, refreshData])

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({ documents: {}, clientFields: {} })
    setHasUnsavedChanges(false)
  }, [])

  const renderDocumentCheckboxes = useCallback((
    doc: DocumentType,
    subdept: Subdepartment,
    clsIndex: number | null,
    subclsIndex: number | null
  ) => {
    const columnKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
    const isExpanded = expandedColumns.has(columnKey)
    const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
    const isSubmitting = getSubmittingStatus(doc.id, subdept.id, clsIndex, subclsIndex)

    if (!isExpanded) {
      // Just show AP column
      return (
        <OptimizedCheckbox
          checked={getAllocationStatus(doc.id, subdept.id, clsIndex, subclsIndex, 'ap')}
          onCheckedChange={(c) => handleDisplayToggle(doc.id, subdept.id, clsIndex, subclsIndex, 'ap', c)}
          disabled={isSubmitting}
          allocationKey={`ap-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
        />
      )
    }

    // Return array of individual cells for expanded state
    const columns = [
      {
        type: 'ap' as const,
        key: `ap-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`
      },
      {
        type: 'dp' as const,
        key: `dp-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`
      }
    ]

    if (hasUnderstudy) {
      columns.push({
        type: 'understudy' as const,
        key: `us-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`
      })
    }

    return columns.map(column => (
      <OptimizedCheckbox
        key={column.key}
        checked={getAllocationStatus(doc.id, subdept.id, clsIndex, subclsIndex, column.type)}
        onCheckedChange={(c) => handleDisplayToggle(doc.id, subdept.id, clsIndex, subclsIndex, column.type, c)}
        disabled={isSubmitting}
        allocationKey={column.key}
      />
    ))
  }, [expandedColumns, getColumnKey, shouldShowUnderstudy, getSubmittingStatus, getAllocationStatus, handleDisplayToggle])

  const renderFieldCheckboxes = useCallback((
    field: DocumentField,
    doc: DocumentType,
    subdept: Subdepartment,
    clsIndex: number | null,
    subclsIndex: number | null
  ) => {
    if (!shouldShowCheckbox(field)) return null

    const fieldId = `${doc.id}-${field.id}`
    const columnKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
    const isExpanded = expandedColumns.has(columnKey)
    const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
    const isSubmitting = getSubmittingStatus(fieldId, subdept.id, clsIndex, subclsIndex)

    if (!isExpanded) {
      // Just show AP column
      return (
        <OptimizedCheckbox
          checked={getAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, 'ap')}
          onCheckedChange={(c) => handleDisplayToggle(fieldId, subdept.id, clsIndex, subclsIndex, 'ap', c)}
          disabled={isSubmitting}
          allocationKey={`ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`}
        />
      )
    }

    // Return array of individual cells for expanded state
    const columns = [
      {
        type: 'ap' as const,
        key: `ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`
      },
      {
        type: 'dp' as const,
        key: `dp-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`
      }
    ]

    if (hasUnderstudy) {
      columns.push({
        type: 'understudy' as const,
        key: `us-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`
      })
    }

    return columns.map(column => (
      <OptimizedCheckbox
        key={column.key}
        checked={getAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, column.type)}
        onCheckedChange={(c) => handleDisplayToggle(fieldId, subdept.id, clsIndex, subclsIndex, column.type, c)}
        disabled={isSubmitting}
        allocationKey={column.key}
      />
    ))
  }, [shouldShowCheckbox, expandedColumns, getColumnKey, shouldShowUnderstudy, getSubmittingStatus, getAllocationStatus, handleDisplayToggle])

  const renderClientFieldCheckboxes = useCallback((
    fieldId: string,
    subdept: Subdepartment,
    clsIndex: number | null,
    subclsIndex: number | null
  ) => {
    const columnKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
    const isExpanded = expandedColumns.has(columnKey)
    const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
    const isSubmitting = getSubmittingStatus(fieldId, subdept.id, clsIndex, subclsIndex)

    if (!isExpanded) {
      // Just show AP column
      return (
        <OptimizedCheckbox
          checked={getClientFieldAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, 'ap')}
          onCheckedChange={(c) => handleClientFieldToggle(fieldId, subdept.id, clsIndex, subclsIndex, 'ap', c)}
          disabled={isSubmitting}
          allocationKey={`ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`}
        />
      )
    }

    // Return array of individual cells for expanded state
    const columns = [
      {
        type: 'ap' as const,
        key: `ap-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`
      },
      {
        type: 'dp' as const,
        key: `dp-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`
      }
    ]

    if (hasUnderstudy) {
      columns.push({
        type: 'understudy' as const,
        key: `us-${fieldId}-${subdept.id}-${clsIndex}-${subclsIndex}`
      })
    }

    return columns.map(column => (
      <OptimizedCheckbox
        key={column.key}
        checked={getClientFieldAllocationStatus(fieldId, subdept.id, clsIndex, subclsIndex, column.type)}
        onCheckedChange={(c) => handleClientFieldToggle(fieldId, subdept.id, clsIndex, subclsIndex, column.type, c)}
        disabled={isSubmitting}
        allocationKey={column.key}
      />
    ))
  }, [expandedColumns, getColumnKey, shouldShowUnderstudy, getSubmittingStatus, getClientFieldAllocationStatus, handleClientFieldToggle])

  // Add this useEffect for debugging:
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Component state:', {
        renderCount: renderCountRef.current,
        availableColumnsCount: availableColumns.length,
        visibleColumnsCount: Object.values(columnVisibility).filter(Boolean).length,
        totalColumnsVisibility: Object.keys(columnVisibility).length,
        departmentsCount: departments.length,
        sampleColumnKeys: availableColumns.slice(0, 3).map(col => col.id),
        sampleVisibilityKeys: Object.keys(columnVisibility).slice(0, 3)
      })
    }
  }, [availableColumns.length, Object.keys(columnVisibility).length, departments.length])
  // Update the availableColumns when columnVisibility changes
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
  if (process.env.NODE_ENV === 'development') {
    console.log('Render count:', renderCountRef.current)
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
              <Expand className="h-4 w-4 mr-2" />Fields
            </Button>
            <Button variant="outline" onClick={collapseAll}>
              <Minimize2 className="h-4 w-4 mr-2" />Docs
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
                  {Object.keys(groupedDocuments).length === 0 && clientData.length === 0 && clientFormFields.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No data found for this category.</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Make sure departments are marked as "Default Display" in the Departments management page.
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
                                {visibleNormalizedSubdepartments.map((subdept, subIndex) => {
                                  const colSpan = getTotalColSpan(subdept)
                                  const width = Math.max(colSpan * 120, 120)
                                  return (
                                    <TableHead
                                      key={`subdept-header-${subdept.id}`}
                                      colSpan={colSpan}
                                      style={{ width: `${width}px` }}
                                      className={cn("border-r border-blue-400 px-2 text-center font-semibold text-white", subIndex % 2 === 0 ? "bg-blue-700" : "bg-blue-600")}
                                    >
                                      <div className="flex items-center justify-center">
                                        <TruncatedText
                                          text={subdept.name}
                                          className="font-semibold text-white"
                                          maxLength={15}
                                        />
                                      </div>
                                    </TableHead>
                                  )
                                })}
                              </TableRow>

                              {/* Class Header Row */}
                              <TableRow>
                                {visibleNormalizedSubdepartments.map((subdept, subIndex) =>
                                  subdept.hasClasses ? subdept.classes?.map((cls, clsIndex) => {
                                    const hasSubclasses = cls.subclasses?.length || 0
                                    const columnKey = getColumnKey(subdept.id, clsIndex)
                                    const isExpanded = expandedColumns.has(columnKey)
                                    const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                    let colSpan
                                    if (hasSubclasses > 0) {
                                      // Each subclass gets its own expanded columns
                                      colSpan = hasSubclasses * (isExpanded ? (hasUnderstudy ? 3 : 2) : 1)
                                    } else {
                                      // Class without subclasses
                                      colSpan = isExpanded ? (hasUnderstudy ? 3 : 2) : 1
                                    }

                                    const width = colSpan * 120
                                    return (
                                      <TableHead
                                        key={`class-header-${subdept.id}-${clsIndex}`}
                                        colSpan={colSpan}
                                        style={{ width: `${width}px` }}
                                        className={cn("border-r border-blue-400 px-2 text-center text-white text-sm", subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500")}
                                      >
                                        <div className="flex items-center justify-center">
                                          <TruncatedText
                                            text={cls.name}
                                            className="text-sm text-white"
                                            maxLength={15}
                                          />
                                        </div>
                                      </TableHead>
                                    )
                                  }) : (
                                    <TableHead
                                      key={`subdept-direct-${subdept.id}`}
                                      colSpan={getTotalColSpan(subdept)}
                                      style={{ width: `${getTotalColSpan(subdept) * 120}px` }}
                                      className={cn("border-r border-blue-400 text-center text-white text-sm", subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500")}
                                    >
                                      Direct
                                    </TableHead>
                                  )
                                )}
                              </TableRow>

                              {/* Subclass Header Row */}
                              <TableRow>
                                {visibleNormalizedSubdepartments.map((subdept, subIndex) =>
                                  subdept.hasClasses ? subdept.classes?.flatMap((cls, clsIndex) => {
                                    const columnKey = getColumnKey(subdept.id, clsIndex)
                                    const isExpanded = expandedColumns.has(columnKey)
                                    const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                    return cls.subclasses?.length ? cls.subclasses.map((subcls, subclsIndex) => {
                                      const colSpan = isExpanded ? (hasUnderstudy ? 3 : 2) : 1
                                      const width = colSpan * 120

                                      return (
                                        <TableHead
                                          key={`subclass-header-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                          colSpan={colSpan}
                                          style={{ width: `${width}px` }}
                                          className={cn("border-r border-blue-400 border-l border-blue-300 px-2 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}
                                        >
                                          <div className="flex items-center justify-center">
                                            <TruncatedText
                                              text={subcls.name}
                                              className="text-xs text-white"
                                              maxLength={10}
                                            />
                                          </div>
                                        </TableHead>
                                      )
                                    }) : (
                                      <TableHead
                                        key={`class-direct-${subdept.id}-${clsIndex}`}
                                        colSpan={isExpanded ? (hasUnderstudy ? 3 : 2) : 1}
                                        style={{ width: `${(isExpanded ? (hasUnderstudy ? 3 : 2) : 1) * 120}px` }}
                                        className={cn("border-r border-blue-400 border-l border-blue-300 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}
                                      >
                                        -
                                      </TableHead>
                                    )
                                  }) : (
                                    <TableHead
                                      key={`subdept-main-${subdept.id}`}
                                      colSpan={getTotalColSpan(subdept)}
                                      style={{ width: `${getTotalColSpan(subdept) * 120}px` }}
                                      className={cn("border-r border-blue-400 border-l border-blue-300 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}
                                    >
                                      -
                                    </TableHead>
                                  )
                                )}
                              </TableRow>

                              {/* Column Header Row - AP with expandable DP and understudy */}
                              <TableRow>
                                {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                  subdept.hasClasses ? subdept.classes?.flatMap((cls, clsIndex) =>
                                    cls.subclasses?.length ? cls.subclasses.map((_, subclsIndex) => {
                                      const columnKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
                                      const isExpanded = expandedColumns.has(columnKey)
                                      const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                      if (!isExpanded) {
                                        return (
                                          <TableHead
                                            key={`col-header-${subdept.id}-${clsIndex}-${subclsIndex}`}
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

                                      // Expanded state - use individual cells for each column
                                      const columns = ['AP', 'DP']
                                      if (hasUnderstudy) columns.push('US')

                                      return columns.map((columnName, colIdx) => (
                                        <TableHead
                                          key={`col-header-${subdept.id}-${clsIndex}-${subclsIndex}-${columnName}`}
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
                                    }).flat() : (
                                      (() => {
                                        const columnKey = getColumnKey(subdept.id, clsIndex)
                                        const isExpanded = expandedColumns.has(columnKey)
                                        const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                        if (!isExpanded) {
                                          return (
                                            <TableHead
                                              key={`col-header-${subdept.id}-${clsIndex}`}
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

                                        // Expanded state
                                        const columns = ['AP', 'DP']
                                        if (hasUnderstudy) columns.push('US')

                                        return columns.map((columnName, colIdx) => (
                                          <TableHead
                                            key={`col-header-${subdept.id}-${clsIndex}-${columnName}`}
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
                                      })()
                                    )
                                  ) : (
                                    (() => {
                                      const columnKey = getColumnKey(subdept.id, null)
                                      const isExpanded = expandedColumns.has(columnKey)

                                      if (!isExpanded) {
                                        return (
                                          <TableHead
                                            key={`col-header-${subdept.id}`}
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

                                      // Expanded state for subdepartment without classes
                                      const columns = ['AP', 'DP']

                                      return columns.map((columnName, colIdx) => (
                                        <TableHead
                                          key={`col-header-${subdept.id}-${columnName}`}
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
                                    })()
                                  )
                                )}
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
                                                <TruncatedText
                                                  text={group.mainCategory}
                                                  className="font-semibold text-gray-700 flex-1 min-w-0 pr-2"
                                                  maxLength={35}
                                                />
                                                <span className="text-xs bg-blue-200 text-gray-700 px-2 py-1 rounded-full mr-2">{group.documents.length}</span>
                                                {isCategoryExpanded ? <Minus className="h-4 w-4 text-gray-600" /> : <Plus className="h-4 w-4 text-gray-600" />}
                                              </div>
                                            </TableCell>
                                            {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                              subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                  const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                  const isExpanded = expandedColumns.has(columnKey)
                                                  const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                                  if (!isExpanded) {
                                                    return (
                                                      <TableCell
                                                        key={`cat-cell-${categoryKey}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                        className="text-center border bg-blue-100"
                                                        style={{ width: '120px' }}
                                                      >
                                                        -
                                                      </TableCell>
                                                    )
                                                  }

                                                  const columnCount = hasUnderstudy ? 3 : 2
                                                  return Array.from({ length: columnCount }, (_, idx) => (
                                                    <TableCell
                                                      key={`cat-cell-${categoryKey}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                      className="text-center border bg-blue-100"
                                                      style={{ width: '120px' }}
                                                    >
                                                      -
                                                    </TableCell>
                                                  ))
                                                })
                                              ) : (
                                                (() => {
                                                  const columnKey = getColumnKey(subdept.id, null)
                                                  const isExpanded = expandedColumns.has(columnKey)

                                                  if (!isExpanded) {
                                                    return (
                                                      <TableCell
                                                        key={`cat-cell-${categoryKey}-${subdept.id}`}
                                                        className="text-center border bg-blue-100"
                                                        style={{ width: '120px' }}
                                                      >
                                                        -
                                                      </TableCell>
                                                    )
                                                  }

                                                  return Array.from({ length: 2 }, (_, idx) => (
                                                    <TableCell
                                                      key={`cat-cell-${categoryKey}-${subdept.id}-${idx}`}
                                                      className="text-center border bg-blue-100"
                                                      style={{ width: '120px' }}
                                                    >
                                                      -
                                                    </TableCell>
                                                  ))
                                                })()
                                              )
                                            )}
                                          </TableRow>

                                          {/* Document Rows - Only render if expanded */}
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
                                                        <TruncatedText
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
                                                  {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                    subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                      (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                        const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                        const isExpanded = expandedColumns.has(columnKey)
                                                        const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
                                                        const checkboxes = renderDocumentCheckboxes(doc, subdept, clsIndex, subcls ? subclsIndex : null)

                                                        if (!isExpanded) {
                                                          return (
                                                            <TableCell
                                                              key={`doc-cell-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                              className="text-center border-r border-l border-gray-200 bg-blue-50 group-hover:bg-blue-100"
                                                              style={{ width: '120px' }}
                                                            >
                                                              {checkboxes}
                                                            </TableCell>
                                                          )
                                                        }

                                                        // Return individual cells for expanded state
                                                        return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                          <TableCell
                                                            key={`doc-cell-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                            className="text-center border-r border-l border-gray-200 bg-blue-50 group-hover:bg-blue-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            {checkbox}
                                                          </TableCell>
                                                        )) : (
                                                          <TableCell
                                                            key={`doc-cell-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                            className="text-center border-r border-l border-gray-200 bg-blue-50 group-hover:bg-blue-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            {checkboxes}
                                                          </TableCell>
                                                        )
                                                      })
                                                    ) : (
                                                      (() => {
                                                        const columnKey = getColumnKey(subdept.id, null)
                                                        const isExpanded = expandedColumns.has(columnKey)
                                                        const checkboxes = renderDocumentCheckboxes(doc, subdept, null, null)

                                                        if (!isExpanded) {
                                                          return (
                                                            <TableCell
                                                              key={`doc-cell-${doc.id}-${subdept.id}`}
                                                              className="text-center border-r border-l border-gray-200 bg-blue-50 group-hover:bg-blue-100"
                                                              style={{ width: '120px' }}
                                                            >
                                                              {checkboxes}
                                                            </TableCell>
                                                          )
                                                        }

                                                        return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                          <TableCell
                                                            key={`doc-cell-${doc.id}-${subdept.id}-${idx}`}
                                                            className="text-center border-r border-l border-gray-200 bg-blue-50 group-hover:bg-blue-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            {checkbox}
                                                          </TableCell>
                                                        )) : (
                                                          <TableCell
                                                            key={`doc-cell-${doc.id}-${subdept.id}`}
                                                            className="text-center border-r border-l border-gray-200 bg-blue-50 group-hover:bg-blue-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            {checkboxes}
                                                          </TableCell>
                                                        )
                                                      })()
                                                    )
                                                  )}
                                                </TableRow>

                                                {/* Field Rows - Only render if document is expanded */}
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
                                                              <TruncatedText
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
                                                        {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                          subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                            (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                              const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                              const isExpanded = expandedColumns.has(columnKey)
                                                              const checkboxes = renderFieldCheckboxes(field, doc, subdept, clsIndex, subcls ? subclsIndex : null)

                                                              if (!isExpanded) {
                                                                return (
                                                                  <TableCell
                                                                    key={`field-cell-${field.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                                    className="text-center border"
                                                                    style={{ width: '120px' }}
                                                                  >
                                                                    {checkboxes}
                                                                  </TableCell>
                                                                )
                                                              }

                                                              return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                                <TableCell
                                                                  key={`field-cell-${field.id}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                                  className="text-center border"
                                                                  style={{ width: '120px' }}
                                                                >
                                                                  {checkbox}
                                                                </TableCell>
                                                              )) : (
                                                                <TableCell
                                                                  key={`field-cell-${field.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                                  className="text-center border"
                                                                  style={{ width: '120px' }}
                                                                >
                                                                  {checkboxes}
                                                                </TableCell>
                                                              )
                                                            })
                                                          ) : (
                                                            (() => {
                                                              const columnKey = getColumnKey(subdept.id, null)
                                                              const isExpanded = expandedColumns.has(columnKey)
                                                              const checkboxes = renderFieldCheckboxes(field, doc, subdept, null, null)

                                                              if (!isExpanded) {
                                                                return (
                                                                  <TableCell
                                                                    key={`field-cell-${field.id}-${subdept.id}`}
                                                                    className="text-center border"
                                                                    style={{ width: '120px' }}
                                                                  >
                                                                    {checkboxes}
                                                                  </TableCell>
                                                                )
                                                              }

                                                              return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                                <TableCell
                                                                  key={`field-cell-${field.id}-${subdept.id}-${idx}`}
                                                                  className="text-center border"
                                                                  style={{ width: '120px' }}
                                                                >
                                                                  {checkbox}
                                                                </TableCell>
                                                              )) : (
                                                                <TableCell
                                                                  key={`field-cell-${field.id}-${subdept.id}`}
                                                                  className="text-center border"
                                                                  style={{ width: '120px' }}
                                                                >
                                                                  {checkboxes}
                                                                </TableCell>
                                                              )
                                                            })()
                                                          )
                                                        )}
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
                              {(Object.keys(groupedDocuments).length > 0 || clientFormFields.length > 0) && (
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

                                  {/* Render form sections */}
                                  {Object.entries(groupedClientFields.formSections).map(([sectionKey, section], sectionIndex) => [
                                    // Section Header Row
                                    <TableRow key={`form-section-${sectionKey}`} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                                      <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700 w-16">
                                        {sectionIndex + 1}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                        <div className="flex items-center justify-between px-4">
                                          <TruncatedText
                                            text={section.title}
                                            className="font-semibold text-blue-700 flex-1 min-w-0 pr-2"
                                            maxLength={35}
                                          />
                                          <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full mr-2">
                                            {section.fields.filter(f => f.showInTable).length}
                                          </span>
                                        </div>
                                      </TableCell>
                                      {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                        subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                          (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                            const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                            const isExpanded = expandedColumns.has(columnKey)
                                            const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                            if (!isExpanded) {
                                              return (
                                                <TableCell
                                                  key={`form-section-cell-${sectionKey}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                  className="text-center border bg-blue-100"
                                                  style={{ width: '120px' }}
                                                >
                                                  -
                                                </TableCell>
                                              )
                                            }

                                            const columnCount = hasUnderstudy ? 3 : 2
                                            return Array.from({ length: columnCount }, (_, idx) => (
                                              <TableCell
                                                key={`form-section-cell-${sectionKey}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                className="text-center border bg-blue-100"
                                                style={{ width: '120px' }}
                                              >
                                                -
                                              </TableCell>
                                            ))
                                          })
                                        ) : (
                                          (() => {
                                            const columnKey = getColumnKey(subdept.id, null)
                                            const isExpanded = expandedColumns.has(columnKey)

                                            if (!isExpanded) {
                                              return (
                                                <TableCell
                                                  key={`form-section-cell-${sectionKey}-${subdept.id}`}
                                                  className="text-center border bg-blue-100"
                                                  style={{ width: '120px' }}
                                                >
                                                  -
                                                </TableCell>
                                              )
                                            }

                                            return Array.from({ length: 2 }, (_, idx) => (
                                              <TableCell
                                                key={`form-section-cell-${sectionKey}-${subdept.id}-${idx}`}
                                                className="text-center border bg-blue-100"
                                                style={{ width: '120px' }}
                                              >
                                                -
                                              </TableCell>
                                            ))
                                          })()
                                        )
                                      )}
                                    </TableRow>,

                                    // Field Rows
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
                                                  <TruncatedText
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
                                        {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                          subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                            (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                              const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                              const isExpanded = expandedColumns.has(columnKey)
                                              const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
                                              const checkboxes = renderClientFieldCheckboxes(`form-field-${field.name}`, subdept, clsIndex, subcls ? subclsIndex : null)

                                              if (!isExpanded) {
                                                return (
                                                  <TableCell
                                                    key={`form-field-cell-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                    className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                    style={{ width: '120px' }}
                                                  >
                                                    {checkboxes}
                                                  </TableCell>
                                                )
                                              }

                                              return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                <TableCell
                                                  key={`form-field-cell-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkbox}
                                                </TableCell>
                                              )) : (
                                                <TableCell
                                                  key={`form-field-cell-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkboxes}
                                                </TableCell>
                                              )
                                            })
                                          ) : (
                                            (() => {
                                              const columnKey = getColumnKey(subdept.id, null)
                                              const isExpanded = expandedColumns.has(columnKey)
                                              const checkboxes = renderClientFieldCheckboxes(`form-field-${field.name}`, subdept, null, null)

                                              if (!isExpanded) {
                                                return (
                                                  <TableCell
                                                    key={`form-field-cell-${field.name}-${subdept.id}`}
                                                    className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                    style={{ width: '120px' }}
                                                  >
                                                    {checkboxes}
                                                  </TableCell>
                                                )
                                              }

                                              return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                <TableCell
                                                  key={`form-field-cell-${field.name}-${subdept.id}-${idx}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkbox}
                                                </TableCell>
                                              )) : (
                                                <TableCell
                                                  key={`form-field-cell-${field.name}-${subdept.id}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkboxes}
                                                </TableCell>
                                              )
                                            })()
                                          )
                                        )}
                                      </TableRow>
                                    ))
                                  ])}

                                  {/* Platform Credentials Section */}
                                  {Object.entries(groupedClientFields.platformCredentials).map(([platformKey, platform], sectionIndex) => [
                                    // Platform Header Row
                                    <TableRow key={`platform-${platformKey}`} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                                      <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700 w-16">
                                        P{sectionIndex + 1}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                        <div className="flex items-center justify-between px-4">
                                          <TruncatedText
                                            text={platform.title}
                                            className="font-semibold text-blue-700 flex-1 min-w-0 pr-2"
                                            maxLength={35}
                                          />
                                          <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full mr-2">
                                            {platform.fields.filter(f => f.showInTable).length}
                                          </span>
                                        </div>
                                      </TableCell>
                                      {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                        subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                          (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                            const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                            const isExpanded = expandedColumns.has(columnKey)
                                            const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                            if (!isExpanded) {
                                              return (
                                                <TableCell
                                                  key={`platform-cell-${platformKey}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                  className="text-center border bg-blue-100"
                                                  style={{ width: '120px' }}
                                                >
                                                  -
                                                </TableCell>
                                              )
                                            }

                                            const columnCount = hasUnderstudy ? 3 : 2
                                            return Array.from({ length: columnCount }, (_, idx) => (
                                              <TableCell
                                                key={`platform-cell-${platformKey}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                className="text-center border bg-blue-100"
                                                style={{ width: '120px' }}
                                              >
                                                -
                                              </TableCell>
                                            ))
                                          })
                                        ) : (
                                          (() => {
                                            const columnKey = getColumnKey(subdept.id, null)
                                            const isExpanded = expandedColumns.has(columnKey)

                                            if (!isExpanded) {
                                              return (
                                                <TableCell
                                                  key={`platform-cell-${platformKey}-${subdept.id}`}
                                                  className="text-center border bg-blue-100"
                                                  style={{ width: '120px' }}
                                                >
                                                  -
                                                </TableCell>
                                              )
                                            }

                                            return Array.from({ length: 2 }, (_, idx) => (
                                              <TableCell
                                                key={`platform-cell-${platformKey}-${subdept.id}-${idx}`}
                                                className="text-center border bg-blue-100"
                                                style={{ width: '120px' }}
                                              >
                                                -
                                              </TableCell>
                                            ))
                                          })()
                                        )
                                      )}
                                    </TableRow>,

                                    // Platform Field Rows
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
                                                  <TruncatedText
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
                                        {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                          subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                            (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                              const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                              const isExpanded = expandedColumns.has(columnKey)
                                              const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)
                                              const checkboxes = renderClientFieldCheckboxes(`platform-${platformKey}-${field.name}`, subdept, clsIndex, subcls ? subclsIndex : null)

                                              if (!isExpanded) {
                                                return (
                                                  <TableCell
                                                    key={`platform-field-cell-${platformKey}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                    className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                    style={{ width: '120px' }}
                                                  >
                                                    {checkboxes}
                                                  </TableCell>
                                                )
                                              }

                                              return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                <TableCell
                                                  key={`platform-field-cell-${platformKey}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkbox}
                                                </TableCell>
                                              )) : (
                                                <TableCell
                                                  key={`platform-field-cell-${platformKey}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkboxes}
                                                </TableCell>
                                              )
                                            })
                                          ) : (
                                            (() => {
                                              const columnKey = getColumnKey(subdept.id, null)
                                              const isExpanded = expandedColumns.has(columnKey)
                                              const checkboxes = renderClientFieldCheckboxes(`platform-${platformKey}-${field.name}`, subdept, null, null)

                                              if (!isExpanded) {
                                                return (
                                                  <TableCell
                                                    key={`platform-field-cell-${platformKey}-${field.name}-${subdept.id}`}
                                                    className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                    style={{ width: '120px' }}
                                                  >
                                                    {checkboxes}
                                                  </TableCell>
                                                )
                                              }

                                              return Array.isArray(checkboxes) ? checkboxes.map((checkbox, idx) => (
                                                <TableCell
                                                  key={`platform-field-cell-${platformKey}-${field.name}-${subdept.id}-${idx}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkbox}
                                                </TableCell>
                                              )) : (
                                                <TableCell
                                                  key={`platform-field-cell-${platformKey}-${field.name}-${subdept.id}`}
                                                  className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                  style={{ width: '120px' }}
                                                >
                                                  {checkboxes}
                                                </TableCell>
                                              )
                                            })()
                                          )
                                        )}
                                      </TableRow>
                                    ))
                                  ])}
                                </React.Fragment>
                              )}

                              {/* Client Data Section (actual client data from database) */}
                              {clientData.length > 0 && (
                                <React.Fragment>
                                  {/* Separator if we have both form fields and client data */}
                                  {clientFormFields.length > 0 && (
                                    <TableRow>
                                      <TableCell colSpan={100} className="p-0">
                                        <Separator className="my-4" />
                                      </TableCell>
                                    </TableRow>
                                  )}

                                  <SectionHeader
                                    title="Data from Clients"
                                    icon={Users}
                                    count={clientData.length}
                                  />

                                  {clientData.map((client, clientIndex) => {
                                    const isClientExpanded = expandedClientItems.has(client.id)

                                    return [
                                      // Client Header Row
                                      <TableRow
                                        key={`client-${client.id}`}
                                        className="group bg-green-50 hover:bg-green-100 cursor-pointer"
                                        onClick={() => toggleClientItemExpansion(client.id)}
                                      >
                                        <TableCell className="sticky left-0 bg-green-50 group-hover:bg-green-100 border-r z-[5] text-center font-semibold w-16">
                                          C{clientIndex + 1}
                                        </TableCell>
                                        <TableCell className="sticky left-16 bg-green-50 group-hover:bg-green-100 border-r z-[5] w-[300px]">
                                          <div className="flex items-center gap-2 px-4">
                                            <div className="flex items-center justify-between flex-1">
                                              <div className="flex flex-col">
                                                <TruncatedText
                                                  text={client.name || `${client.first_name || ''} ${client.last_name || ''}`.trim()}
                                                  className="font-semibold text-gray-800"
                                                  maxLength={25}
                                                />
                                                <TruncatedText
                                                  text={client.email || client.current_communication_email || client.email_address || ''}
                                                  className="text-sm text-gray-600"
                                                  maxLength={30}
                                                />
                                                {(client.company || client.company_name) && (
                                                  <TruncatedText
                                                    text={client.company || client.company_name || ''}
                                                    className="text-xs text-gray-500"
                                                    maxLength={25}
                                                  />
                                                )}
                                                <span className={cn(
                                                  "text-xs px-2 py-1 rounded-full mt-1 w-fit",
                                                  client.status === 'Active' ? "bg-green-100 text-green-700" :
                                                    client.status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                                                      "bg-gray-100 text-gray-700"
                                                )}>
                                                  {client.status}
                                                </span>
                                              </div>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 flex-shrink-0 text-green-600 hover:bg-green-200"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  toggleClientItemExpansion(client.id)
                                                }}
                                              >
                                                {isClientExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                              </Button>
                                            </div>
                                          </div>
                                        </TableCell>
                                        {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                          subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                            (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                              const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                              const isExpanded = expandedColumns.has(columnKey)
                                              const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                              if (!isExpanded) {
                                                return (
                                                  <TableCell
                                                    key={`client-cell-${client.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                    className="text-center border bg-green-50 group-hover:bg-green-100"
                                                    style={{ width: '120px' }}
                                                  >
                                                    <span className={cn(
                                                      "text-xs px-2 py-1 rounded-full",
                                                      client.status === 'Active' ? "bg-green-100 text-green-700" :
                                                        client.status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                                                          "bg-gray-100 text-gray-700"
                                                    )}>
                                                      {client.status || '-'}
                                                    </span>
                                                  </TableCell>
                                                )
                                              }

                                              const columnCount = hasUnderstudy ? 3 : 2
                                              return Array.from({ length: columnCount }, (_, idx) => (
                                                <TableCell
                                                  key={`client-cell-${client.id}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                  className="text-center border bg-green-50 group-hover:bg-green-100"
                                                  style={{ width: '120px' }}
                                                >
                                                  <span className={cn(
                                                    "text-xs px-2 py-1 rounded-full",
                                                    client.status === 'Active' ? "bg-green-100 text-green-700" :
                                                      client.status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                                                        "bg-gray-100 text-gray-700"
                                                  )}>
                                                    {client.status || '-'}
                                                  </span>
                                                </TableCell>
                                              ))
                                            })
                                          ) : (
                                            (() => {
                                              const columnKey = getColumnKey(subdept.id, null)
                                              const isExpanded = expandedColumns.has(columnKey)

                                              if (!isExpanded) {
                                                return (
                                                  <TableCell
                                                    key={`client-cell-${client.id}-${subdept.id}`}
                                                    className="text-center border bg-green-50 group-hover:bg-green-100"
                                                    style={{ width: '120px' }}
                                                  >
                                                    <span className={cn(
                                                      "text-xs px-2 py-1 rounded-full",
                                                      client.status === 'Active' ? "bg-green-100 text-green-700" :
                                                        client.status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                                                          "bg-gray-100 text-gray-700"
                                                    )}>
                                                      {client.status || '-'}
                                                    </span>
                                                  </TableCell>
                                                )
                                              }

                                              return Array.from({ length: 2 }, (_, idx) => (
                                                <TableCell
                                                  key={`client-cell-${client.id}-${subdept.id}-${idx}`}
                                                  className="text-center border bg-green-50 group-hover:bg-green-100"
                                                  style={{ width: '120px' }}
                                                >
                                                  <span className={cn(
                                                    "text-xs px-2 py-1 rounded-full",
                                                    client.status === 'Active' ? "bg-green-100 text-green-700" :
                                                      client.status === 'Pending' ? "bg-yellow-100 text-yellow-700" :
                                                        "bg-gray-100 text-gray-700"
                                                  )}>
                                                    {client.status || '-'}
                                                  </span>
                                                </TableCell>
                                              ))
                                            })()
                                          )
                                        )}
                                      </TableRow>,

                                      // Client Detail Rows (only if expanded)
                                      ...(isClientExpanded ? (() => {
                                        const sectionRows: React.ReactNode[] = []

                                        // Add Form Sections (optimized rendering)
                                        Object.entries(groupedClientFields.formSections).forEach(([sectionKey, section], sectionIndex) => {
                                          const sectionFields = section.fields.filter(field => {
                                            const fieldValue = client[field.name]
                                            return fieldValue && fieldValue !== '' && fieldValue !== null && fieldValue !== undefined
                                          })

                                          if (sectionFields.length > 0) {
                                            // Section Header
                                            sectionRows.push(
                                              <TableRow key={`client-section-${client.id}-${sectionKey}`} className="bg-green-100">
                                                <TableCell className="sticky left-0 bg-green-100 border-r z-[5] w-16 text-center text-sm font-semibold text-green-800">
                                                  C{clientIndex + 1}.{sectionIndex + 1}
                                                </TableCell>
                                                <TableCell className="sticky left-16 bg-green-100 border-r z-[5] w-[300px]">
                                                  <div className="flex items-center px-4 py-2">
                                                    <span className="font-semibold text-green-800 text-sm">{section.title}</span>
                                                    <span className="text-xs bg-green-200 text-green-700 px-2 py-1 rounded-full ml-2">
                                                      {sectionFields.length}
                                                    </span>
                                                  </div>
                                                </TableCell>
                                                {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                  subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                    (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                      const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                      const isExpanded = expandedColumns.has(columnKey)
                                                      const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                                      if (!isExpanded) {
                                                        return (
                                                          <TableCell
                                                            key={`client-section-cell-${client.id}-${sectionKey}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                            className="text-center border bg-green-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-green-600">-</span>
                                                          </TableCell>
                                                        )
                                                      }

                                                      const columnCount = hasUnderstudy ? 3 : 2
                                                      return Array.from({ length: columnCount }, (_, idx) => (
                                                        <TableCell
                                                          key={`client-section-cell-${client.id}-${sectionKey}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                          className="text-center border bg-green-100"
                                                          style={{ width: '120px' }}
                                                        >
                                                          <span className="text-xs text-green-600">-</span>
                                                        </TableCell>
                                                      ))
                                                    })
                                                  ) : (
                                                    (() => {
                                                      const columnKey = getColumnKey(subdept.id, null)
                                                      const isExpanded = expandedColumns.has(columnKey)

                                                      if (!isExpanded) {
                                                        return (
                                                          <TableCell
                                                            key={`client-section-cell-${client.id}-${sectionKey}-${subdept.id}`}
                                                            className="text-center border bg-green-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-green-600">-</span>
                                                          </TableCell>
                                                        )
                                                      }

                                                      return Array.from({ length: 2 }, (_, idx) => (
                                                        <TableCell
                                                          key={`client-section-cell-${client.id}-${sectionKey}-${subdept.id}-${idx}`}
                                                          className="text-center border bg-green-100"
                                                          style={{ width: '120px' }}
                                                        >
                                                          <span className="text-xs text-green-600">-</span>
                                                        </TableCell>
                                                      ))
                                                    })()
                                                  )
                                                )}
                                              </TableRow>
                                            )

                                            // Section Fields
                                            sectionFields.forEach((field, fieldIndex) => {
                                              const fieldValue = client[field.name]

                                              sectionRows.push(
                                                <TableRow key={`client-data-field-${client.id}-${field.name}`} className="group bg-green-25 hover:bg-green-50">
                                                  <TableCell className="sticky left-0 bg-green-25 group-hover:bg-green-50 border-r z-[5] w-16 text-center text-sm text-gray-500">
                                                    C{clientIndex + 1}.{sectionIndex + 1}.{fieldIndex + 1}
                                                  </TableCell>
                                                  <TableCell className="sticky left-16 bg-green-25 group-hover:bg-green-50 border-r z-[5] w-[300px]">
                                                    <div className="flex items-center px-4 pl-8">
                                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <div className="flex flex-col flex-1 min-w-0">
                                                          <div className="flex items-center gap-2">
                                                            <span className="text-sm text-gray-700 font-medium">
                                                              {field.tableHeader || field.label}:
                                                            </span>
                                                            {field.type && (
                                                              <span className="text-xs text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                                                                {field.type}
                                                              </span>
                                                            )}
                                                          </div>
                                                          <TruncatedText
                                                            text={formatFieldValue(fieldValue, field.type)}
                                                            className="text-sm text-gray-800 mt-1"
                                                            maxLength={35}
                                                          />
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </TableCell>
                                                  {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                    subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                      (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                        const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                        const isExpanded = expandedColumns.has(columnKey)
                                                        const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                                        if (!isExpanded) {
                                                          return (
                                                            <TableCell
                                                              key={`client-data-field-cell-${client.id}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                              className="text-center border bg-green-25 group-hover:bg-green-50"
                                                              style={{ width: '120px' }}
                                                            >
                                                              <span className="text-xs text-gray-400">-</span>
                                                            </TableCell>
                                                          )
                                                        }

                                                        const columnCount = hasUnderstudy ? 3 : 2
                                                        return Array.from({ length: columnCount }, (_, idx) => (
                                                          <TableCell
                                                            key={`client-data-field-cell-${client.id}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                            className="text-center border bg-green-25 group-hover:bg-green-50"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-gray-400">-</span>
                                                          </TableCell>
                                                        ))
                                                      })
                                                    ) : (
                                                      (() => {
                                                        const columnKey = getColumnKey(subdept.id, null)
                                                        const isExpanded = expandedColumns.has(columnKey)

                                                        if (!isExpanded) {
                                                          return (
                                                            <TableCell
                                                              key={`client-data-field-cell-${client.id}-${field.name}-${subdept.id}`}
                                                              className="text-center border bg-green-25 group-hover:bg-green-50"
                                                              style={{ width: '120px' }}
                                                            >
                                                              <span className="text-xs text-gray-400">-</span>
                                                            </TableCell>
                                                          )
                                                        }

                                                        return Array.from({ length: 2 }, (_, idx) => (
                                                          <TableCell
                                                            key={`client-data-field-cell-${client.id}-${field.name}-${subdept.id}-${idx}`}
                                                            className="text-center border bg-green-25 group-hover:bg-green-50"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-gray-400">-</span>
                                                          </TableCell>
                                                        ))
                                                      })()
                                                    )
                                                  )}
                                                </TableRow>
                                              )
                                            })
                                          }
                                        })

                                        // Add Platform Credentials Sections (same optimization pattern)
                                        Object.entries(groupedClientFields.platformCredentials).forEach(([platformKey, platform], sectionIndex) => {
                                          const platformFields = platform.fields.filter(field => {
                                            const fieldValue = client[field.name]
                                            return fieldValue && fieldValue !== '' && fieldValue !== null && fieldValue !== undefined
                                          })

                                          if (platformFields.length > 0) {
                                            // Platform Header
                                            sectionRows.push(
                                              <TableRow key={`client-platform-${client.id}-${platformKey}`} className="bg-blue-100">
                                                <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] w-16 text-center text-sm font-semibold text-blue-800">
                                                  C{clientIndex + 1}.P{sectionIndex + 1}
                                                </TableCell>
                                                <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                                  <div className="flex items-center px-4 py-2">
                                                    <span className="font-semibold text-blue-800 text-sm">{platform.title}</span>
                                                    <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                                      {platformFields.length}
                                                    </span>
                                                  </div>
                                                </TableCell>
                                                {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                  subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                    (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                      const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                      const isExpanded = expandedColumns.has(columnKey)
                                                      const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                                      if (!isExpanded) {
                                                        return (
                                                          <TableCell
                                                            key={`client-platform-cell-${client.id}-${platformKey}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                            className="text-center border bg-blue-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-blue-600">-</span>
                                                          </TableCell>
                                                        )
                                                      }

                                                      const columnCount = hasUnderstudy ? 3 : 2
                                                      return Array.from({ length: columnCount }, (_, idx) => (
                                                        <TableCell
                                                          key={`client-platform-cell-${client.id}-${platformKey}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                          className="text-center border bg-blue-100"
                                                          style={{ width: '120px' }}
                                                        >
                                                          <span className="text-xs text-blue-600">-</span>
                                                        </TableCell>
                                                      ))
                                                    })
                                                  ) : (
                                                    (() => {
                                                      const columnKey = getColumnKey(subdept.id, null)
                                                      const isExpanded = expandedColumns.has(columnKey)

                                                      if (!isExpanded) {
                                                        return (
                                                          <TableCell
                                                            key={`client-platform-cell-${client.id}-${platformKey}-${subdept.id}`}
                                                            className="text-center border bg-blue-100"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-blue-600">-</span>
                                                          </TableCell>
                                                        )
                                                      }

                                                      return Array.from({ length: 2 }, (_, idx) => (
                                                        <TableCell
                                                          key={`client-platform-cell-${client.id}-${platformKey}-${subdept.id}-${idx}`}
                                                          className="text-center border bg-blue-100"
                                                          style={{ width: '120px' }}
                                                        >
                                                          <span className="text-xs text-blue-600">-</span>
                                                        </TableCell>
                                                      ))
                                                    })()
                                                  )
                                                )}
                                              </TableRow>
                                            )

                                            // Platform Fields
                                            platformFields.forEach((field, fieldIndex) => {
                                              const fieldValue = client[field.name]

                                              sectionRows.push(
                                                <TableRow key={`client-platform-data-field-${client.id}-${field.name}`} className="group bg-blue-25 hover:bg-blue-50">
                                                  <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-16 text-center text-sm text-gray-500">
                                                    C{clientIndex + 1}.P{sectionIndex + 1}.{fieldIndex + 1}
                                                  </TableCell>
                                                  <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-[300px]">
                                                    <div className="flex items-center px-4 pl-8">
                                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <div className="flex flex-col flex-1 min-w-0">
                                                          <div className="flex items-center gap-2">
                                                            <span className="text-sm text-gray-700 font-medium">
                                                              {field.tableHeader || field.label}:
                                                            </span>
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
                                                          </div>
                                                          <TruncatedText
                                                            text={formatFieldValue(fieldValue, field.type)}
                                                            className="text-sm text-gray-800 mt-1"
                                                            maxLength={35}
                                                          />
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </TableCell>
                                                  {visibleNormalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                    subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                      (cls.subclasses?.length ? cls.subclasses : [null]).flatMap((subcls, subclsIndex) => {
                                                        const columnKey = getColumnKey(subdept.id, clsIndex, subcls ? subclsIndex : null)
                                                        const isExpanded = expandedColumns.has(columnKey)
                                                        const hasUnderstudy = shouldShowUnderstudy(subdept, clsIndex)

                                                        if (!isExpanded) {
                                                          return (
                                                            <TableCell
                                                              key={`client-platform-data-field-cell-${client.id}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                                              className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                              style={{ width: '120px' }}
                                                            >
                                                              <span className="text-xs text-gray-400">-</span>
                                                            </TableCell>
                                                          )
                                                        }

                                                        const columnCount = hasUnderstudy ? 3 : 2
                                                        return Array.from({ length: columnCount }, (_, idx) => (
                                                          <TableCell
                                                            key={`client-platform-data-field-cell-${client.id}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}-${idx}`}
                                                            className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-gray-400">-</span>
                                                          </TableCell>
                                                        ))
                                                      })
                                                    ) : (
                                                      (() => {
                                                        const columnKey = getColumnKey(subdept.id, null)
                                                        const isExpanded = expandedColumns.has(columnKey)

                                                        if (!isExpanded) {
                                                          return (
                                                            <TableCell
                                                              key={`client-platform-data-field-cell-${client.id}-${field.name}-${subdept.id}`}
                                                              className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                              style={{ width: '120px' }}
                                                            >
                                                              <span className="text-xs text-gray-400">-</span>
                                                            </TableCell>
                                                          )
                                                        }

                                                        return Array.from({ length: 2 }, (_, idx) => (
                                                          <TableCell
                                                            key={`client-platform-data-field-cell-${client.id}-${field.name}-${subdept.id}-${idx}`}
                                                            className="text-center border bg-blue-25 group-hover:bg-blue-50"
                                                            style={{ width: '120px' }}
                                                          >
                                                            <span className="text-xs text-gray-400">-</span>
                                                          </TableCell>
                                                        ))
                                                      })()
                                                    )
                                                  )}
                                                </TableRow>
                                              )
                                            })
                                          }
                                        })

                                        return sectionRows
                                      })() : [])
                                    ].flat()
                                  })}
                                </React.Fragment>
                              )}

                              {/* Empty state */}
                              {visibleNormalizedSubdepartments.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={100} className="text-center py-12 text-gray-500">
                                    <div className="flex flex-col items-center gap-4">
                                      <FileText className="h-12 w-12 text-gray-300" />
                                      <div>
                                        <h3 className="font-medium text-gray-900">No visible columns</h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                          Use the "Column Visibility" button to show columns or check the "Default Display" settings in Departments management.
                                        </p>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}

                              {/* Empty state for no data */}
                              {Object.keys(groupedDocuments).length === 0 && clientFormFields.length === 0 && clientData.length === 0 && visibleNormalizedSubdepartments.length > 0 && (
                                <TableRow>
                                  <TableCell colSpan={100} className="text-center py-12 text-gray-500">
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