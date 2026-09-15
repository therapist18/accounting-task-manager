// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Plus, 
  Minus, 
  ChevronDown, 
  Layers, 
  Search, 
  X, 
  Download, 
  Upload, 
  Loader2, 
  Save, 
  RotateCcw, 
  Building2,
  FolderTree,
  FileText,
  Users
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "@/app/(dashboard)/dashboard/departments/main-shared-components/column-visibility"
import { DocumentType, Department, OptimizedCheckbox } from "./components/types"
import { CATEGORY_MAPPING } from "./components/config"
import { getGroupedFields, FormField } from "./components/formFields"
import {
  filterAndSortDocuments,
  getColumnKey as getColumnKeyUtil,
  toggleSetItem,
} from "./components/utils"
import { supabase } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { format } from "date-fns"
import { toast } from "@/lib/hooks/use-toast"

const MemoizedCheckbox = memo(OptimizedCheckbox)

// Shared tab definitions used for export sheet names & import sheet lookup
const DOC_TABS = [
  { value: "company", label: "Company Documents" },
  { value: "individual", label: "Individual Documents" },
  { value: "application", label: "Application Documents" },
] as const

// Fixed column metrics for seamless sticky alignment & comfortable breathing room
const COL_INDEX_WIDTH = 64
const COL_NAME_WIDTH = 380
const DATA_COL_WIDTH = 136

// Header row heights for precise sticky stacking
const H_ROW_1 = 44
const H_ROW_2 = 40
const H_ROW_3 = 34
const H_ROW_4 = 38

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, any>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual" | "application">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedClientGroups, setExpandedClientGroups] = useState<Set<string>>(new Set())
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())
  const [availableColumns, setAvailableColumns] = useState<ColumnVisibilityOption[]>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [pendingChanges, setPendingChanges] = useState({ documents: {}, clientFields: {} })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const importFileRef = useRef<HTMLInputElement>(null)
  const lastFetchTimeRef = useRef(0)

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetchTimeRef.current < 1000) return
    lastFetchTimeRef.current = now

    try {
      setLoading(true)
      const [depts, docs, requirements] = await Promise.all([
        supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`).order('order', { ascending: true }),
        supabase.from('acc_portal_kyc').select('*').order('main_category_number', { ascending: true }),
        supabase.from('tm_class_requirements').select('documents_and_fields, client_fields, job_level')
      ])

      if (depts.error || docs.error || requirements.error) throw new Error("Fetch failed")

      const transformedDepts = (depts.data || []).map(dept => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || [])
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(sd => ({
            ...sd,
            classes: (sd.classes || []).map(cls => ({
              ...cls,
              subclasses: cls.subClasses || cls.subclasses || []
            })),
            hasClasses: !!(sd.classes && sd.classes.length > 0)
          }))
      }))

      const processedDocs = (docs.data || []).map(doc => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }))

      const docAllocations = {}
      requirements.data?.forEach(req => {
        if (!req.job_level) return
        const classId = [
          req.job_level.subdepartment_id,
          req.job_level.class_id,
          req.job_level.subclass_id
        ].filter(id => id !== null && id !== undefined).join('_')

        ;(req.documents_and_fields || []).forEach(doc => {
          const docId = String(doc.id)
          Object.keys(doc).forEach(key => {
            if (!['id', 'fields', 'updated_at'].includes(key) && doc[key] === true) {
              docAllocations[`${docId}::${classId}`] = {
                ...docAllocations[`${docId}::${classId}`],
                [key]: true
              }
            }
          })
          ;(doc.fields || []).forEach(f => {
            const fieldId = String(f.id)
            Object.keys(f).forEach(key => {
              if (!['id', 'updated_at'].includes(key) && f[key] === true) {
                docAllocations[`${docId}|${fieldId}::${classId}`] = {
                  ...docAllocations[`${docId}|${fieldId}::${classId}`],
                  [key]: true
                }
              }
            })
          })
        })
      })

      const clientFieldAllocationsMap = {}
      requirements.data?.forEach(req => {
        if (!req.job_level) return
        const classId = [
          req.job_level.subdepartment_id,
          req.job_level.class_id,
          req.job_level.subclass_id
        ].filter(id => id !== null && id !== undefined).join('_')

        ;(req.client_fields || []).forEach(item => {
          const fieldId = String(item.id)
          const flags = {}
          if (item.ap === true || item.display === true) flags.ap = true
          if (item.dp === true) flags.dp = true
          if (item.understudy === true) flags.understudy = true
          if (item.references === true) flags.references = true
          if (!fieldId || Object.keys(flags).length === 0) return
          clientFieldAllocationsMap[`${fieldId}::${classId}`] = {
            ...clientFieldAllocationsMap[`${fieldId}::${classId}`],
            ...flags
          }
        })
      })

      const cols = []
      transformedDepts.forEach(dept => {
        dept.subdepartments?.forEach(sd => {
          if (sd.hasClasses) {
            sd.classes.forEach((cls, idx) => {
              if (cls.subclasses?.length) {
                cls.subclasses.forEach((sc, sidx) => cols.push({
                  id: getColumnKeyUtil(sd.id, idx, sidx),
                  label: `${sd.name} > ${cls.name} > ${sc.name}`,
                  visible: !!sc.default_display,
                  isDefault: !!sc.default_display,
                  group: sd.name
                }))
              } else cols.push({
                id: getColumnKeyUtil(sd.id, idx, null),
                label: `${sd.name} > ${cls.name}`,
                visible: !!cls.default_display,
                isDefault: !!cls.default_display,
                group: sd.name
              })
            })
          } else cols.push({
            id: getColumnKeyUtil(sd.id, null, null),
            label: sd.name,
            visible: !!sd.default_display,
            isDefault: !!sd.default_display,
            group: dept.name
          })
        })
      })

      startTransition(() => {
        setDepartments(transformedDepts)
        setDocuments(processedDocs)
        setDocumentAllocations(docAllocations)
        setClientFieldAllocations(clientFieldAllocationsMap)
        setAvailableColumns(cols)
        if (transformedDepts.length > 0 && (!activeTab || !transformedDepts.find(d => String(d.id) === activeTab))) {
          setActiveTab(String(transformedDepts[0].id))
        }
      })
    } catch (err) { 
      setError(err.message) 
    } finally { 
      setLoading(false) 
    }
  }, [activeTab])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (availableColumns.length > 0 && Object.keys(columnVisibility).length === 0) {
      const initialVisibility: Record<string, boolean> = {}
      availableColumns.forEach(col => { initialVisibility[col.id] = col.isDefault ?? true })
      setColumnVisibility(initialVisibility)
    }
  }, [availableColumns])

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────
  const { groupedDocuments } = useMemo(() => {
    const filteredByCategory = documents.filter(doc => doc.category === CATEGORY_MAPPING[documentTab])
    const filteredBySearch = searchQuery
      ? filteredByCategory.filter(doc =>
        (doc.display_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (doc.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        doc.fields?.some(field => field?.name?.toLowerCase()?.includes(searchQuery.toLowerCase()))
      )
      : filteredByCategory
    return filterAndSortDocuments(filteredBySearch, documentTab)
  }, [documents, documentTab, searchQuery])

  const groupedDocsByTab = useMemo(() => {
    const result: Record<string, any> = {}
    DOC_TABS.forEach(tab => {
      const filtered = documents.filter(doc => doc.category === CATEGORY_MAPPING[tab.value])
      result[tab.value] = filterAndSortDocuments(filtered, tab.value).groupedDocuments
    })
    return result
  }, [documents])

  const groupedClientFields = useMemo(() => {
    const formType: "company" | "individual" = documentTab === "individual" ? "individual" : "company"
    const grouped = getGroupedFields(formType)
    const result: Array<{
      key: string
      type: "form-section" | "platform"
      title: string
      fields: Array<FormField & { allocationKey: string }>
    }> = []

    Object.entries(grouped.formSections).forEach(([key, section]) => {
      const fields = (section.fields || []).filter(f => f.showInTable !== false)
      if (!fields.length) return
      result.push({
        key: `form-section-${key}`,
        type: "form-section",
        title: section.title,
        fields: fields.map(f => ({ ...f, allocationKey: `form-field-${f.name}` }))
      })
    })

    Object.entries(grouped.platformCredentials).forEach(([platformKey, platform]) => {
      const fields = (platform.fields || []).filter(f => f.showInTable !== false)
      if (!fields.length) return
      result.push({
        key: `platform-${platformKey}`,
        type: "platform",
        title: platform.title,
        fields: fields.map(f => ({ ...f, allocationKey: `platform-${platformKey}-${f.name}` }))
      })
    })

    return result
  }, [documentTab])

  const currentDepartment = useMemo(
    () => departments.find(d => String(d.id) === activeTab) || null,
    [departments, activeTab]
  )

  const normalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments) return []
    return currentDepartment.subdepartments.map(sd => ({
      ...sd,
      classes: sd.classes?.map(cls => ({
        ...cls,
        subclasses: cls.subClasses || cls.subclasses || []
      }))
    }))
  }, [currentDepartment])

  const buildVisibleColumns = useCallback((tabValue: string, subdepts: any[]) => {
    const cols = []
    const isIndiv = tabValue === "individual"

    subdepts.forEach(sd => {
      const getFilteredEntityTypes = (item) => {
        const raw = item?.entity_types
          ? Array.isArray(item.entity_types) ? item.entity_types : JSON.parse(item.entity_types || "[]")
          : []
        const entityTypes = raw.length > 0 ? raw : ["Company"]
        return isIndiv
          ? entityTypes.filter(s => s && s.toLowerCase() !== "company")
          : entityTypes.filter(s => s && s.toLowerCase() === "company")
      }
      const process = (item, cIdx, scIdx) => {
        const key = getColumnKeyUtil(sd.id, cIdx, scIdx)
        if (!columnVisibility[key]) return
        let specs = getFilteredEntityTypes(item)
        if (specs.length === 0) specs = ["Standard"]
        cols.push({
          subdept: sd, clsIndex: cIdx, subclsIndex: scIdx, columnKey: key,
          specifications: specs,
          isExpanded: expandedColumns.has(key),
          width: expandedColumns.has(key) ? (specs.length * DATA_COL_WIDTH) : DATA_COL_WIDTH
        })
      }

      if (sd.hasClasses) {
        sd.classes.forEach((cls, cIdx) => {
          if (cls.subclasses.length) cls.subclasses.forEach((sc, scIdx) => process(sc, cIdx, scIdx))
          else process(cls, cIdx, null)
        })
      } else process(sd, null, null)
    })
    return cols
  }, [columnVisibility, expandedColumns])

  const buildAllColumns = useCallback((tabValue: string, subdepts: any[]) => {
    const cols = []
    const isIndiv = tabValue === "individual"

    subdepts.forEach(sd => {
      const getFilteredEntityTypes = (item) => {
        const raw = item?.entity_types
          ? Array.isArray(item.entity_types) ? item.entity_types : JSON.parse(item.entity_types || "[]")
          : []
        const entityTypes = raw.length > 0 ? raw : ["Company"]
        return isIndiv
          ? entityTypes.filter(s => s && s.toLowerCase() !== "company")
          : entityTypes.filter(s => s && s.toLowerCase() === "company")
      }
      const process = (item, cIdx, scIdx) => {
        const key = getColumnKeyUtil(sd.id, cIdx, scIdx)
        let specs = getFilteredEntityTypes(item)
        if (specs.length === 0) specs = ["Standard"]
        cols.push({
          subdept: sd, clsIndex: cIdx, subclsIndex: scIdx, columnKey: key,
          specifications: specs,
          isExpanded: expandedColumns.has(key),
          width: expandedColumns.has(key) ? (specs.length * DATA_COL_WIDTH) : DATA_COL_WIDTH
        })
      }

      if (sd.hasClasses) {
        sd.classes.forEach((cls, cIdx) => {
          if (cls.subclasses.length) cls.subclasses.forEach((sc, scIdx) => process(sc, cIdx, scIdx))
          else process(cls, cIdx, null)
        })
      } else process(sd, null, null)
    })
    return cols
  }, [expandedColumns])

  const visibleColumns = useMemo(
    () => buildVisibleColumns(documentTab, normalizedSubdepartments),
    [buildVisibleColumns, documentTab, normalizedSubdepartments]
  )

  const flattenedColumns = useMemo(() => {
    const flat = []
    visibleColumns.forEach(col => {
      const specs = col.isExpanded ? col.specifications : [col.specifications[0]]
      specs.forEach((spec, sIdx) => {
        flat.push({
          ...col,
          spec,
          isFirstSpec: sIdx === 0,
          uniqueKey: `${col.columnKey}-${spec}`
        })
      })
    })
    return flat
  }, [visibleColumns])

  const totalTableWidth = useMemo(() => {
    return COL_INDEX_WIDTH + COL_NAME_WIDTH + (flattenedColumns.length * DATA_COL_WIDTH)
  }, [flattenedColumns])

  // ─────────────────────────────────────────────────────────────────────────────
  // ALLOCATION TOGGLE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  const resolveClassIdPart = useCallback((sdId, cIdx, scIdx) => {
    const sd = currentDepartment?.subdepartments?.find(s => s.id === sdId)
    const cls = cIdx !== null ? sd?.classes?.[cIdx] : null
    const sc = (cls && scIdx !== null) ? cls.subclasses?.[scIdx] : null
    return sc ? `${sdId}_${cls.id}_${sc.id}` : cls ? `${sdId}_${cls.id}` : `${sdId}`
  }, [currentDepartment])

  const getAllocationStatus = useCallback((id, sdId, cIdx, scIdx, type) => {
    const classIdPart = resolveClassIdPart(sdId, cIdx, scIdx)
    const key = `${id}::${classIdPart}`
    return pendingChanges.documents[key]?.[type] ?? documentAllocations[key]?.[type] ?? false
  }, [pendingChanges, documentAllocations, resolveClassIdPart])

  const handleToggle = useCallback((id, sdId, cIdx, scIdx, type, checked) => {
    const classIdPart = resolveClassIdPart(sdId, cIdx, scIdx)
    const key = `${id}::${classIdPart}`

    setPendingChanges(prev => {
      const newDocs = { ...prev.documents }
      const current = { ...(newDocs[key] || {}), [type]: checked }
      if (checked === (documentAllocations[key]?.[type] ?? false)) delete current[type]
      if (Object.keys(current).length === 0) delete newDocs[key]
      else newDocs[key] = current
      return { ...prev, documents: newDocs }
    })
    setHasUnsavedChanges(true)
  }, [resolveClassIdPart, documentAllocations])

  const getClientFieldAllocationStatus = useCallback((allocationId, sdId, cIdx, scIdx, type) => {
    const classIdPart = resolveClassIdPart(sdId, cIdx, scIdx)
    const key = `${allocationId}::${classIdPart}`
    return pendingChanges.clientFields[key]?.[type] ?? clientFieldAllocations[key]?.[type] ?? false
  }, [pendingChanges, clientFieldAllocations, resolveClassIdPart])

  const handleClientFieldToggle = useCallback((allocationId, sdId, cIdx, scIdx, type, checked) => {
    const classIdPart = resolveClassIdPart(sdId, cIdx, scIdx)
    const key = `${allocationId}::${classIdPart}`

    setPendingChanges(prev => {
      const newFields = { ...prev.clientFields }
      const current = { ...(newFields[key] || {}), [type]: checked }
      if (checked === (clientFieldAllocations[key]?.[type] ?? false)) delete current[type]
      if (Object.keys(current).length === 0) delete newFields[key]
      else newFields[key] = current
      return { ...prev, clientFields: newFields }
    })
    setHasUnsavedChanges(true)
  }, [resolveClassIdPart, clientFieldAllocations])

  const toggleAllRows = useCallback((levels: { categories: boolean; documents: boolean; clientFields: boolean }) => {
    setExpandedCategories(levels.categories ? new Set(Object.keys(groupedDocuments)) : new Set())
    setExpandedItems(levels.documents
      ? new Set<string>(
        Object.values(groupedDocuments).flatMap(group => group.documents).filter(doc => doc.fields?.length > 0).map(doc => doc.id)
      )
      : new Set())
    setExpandedClientGroups(levels.clientFields ? new Set(groupedClientFields.map(g => g.key)) : new Set())
  }, [groupedDocuments, groupedClientFields])

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSaveAllChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return
    setIsSaving(true)
    try {
      const changesByHierarchy: Record<string, { documents: Record<string, Record<string, boolean>> }> = {}
      Object.entries(pendingChanges.documents).forEach(([allocationKey, changes]) => {
        const [entityPart, hierarchyPart] = allocationKey.split('::')
        if (!hierarchyPart) return
        if (!changesByHierarchy[hierarchyPart]) changesByHierarchy[hierarchyPart] = { documents: {} }
        changesByHierarchy[hierarchyPart].documents[entityPart] = changes as Record<string, boolean>
      })

      const clientFieldChangesByHierarchy: Record<string, Record<string, Record<string, boolean>>> = {}
      Object.entries(pendingChanges.clientFields).forEach(([allocationKey, changes]) => {
        const [entityPart, hierarchyPart] = allocationKey.split('::')
        if (!hierarchyPart) return
        if (!clientFieldChangesByHierarchy[hierarchyPart]) clientFieldChangesByHierarchy[hierarchyPart] = {}
        clientFieldChangesByHierarchy[hierarchyPart][entityPart] = changes as Record<string, boolean>
      })

      const deptId = parseInt(activeTab)
      const { data: allRequirements, error: fetchAllError } = await supabase
        .from('tm_class_requirements')
        .select('id, documents_and_fields, client_fields, job_level')
        .eq('job_level->>department_id', String(deptId))
      if (fetchAllError) throw fetchAllError

      const existingByHierarchy: Record<string, { id: string; documents_and_fields: any[]; client_fields: any[] }> = {}
      ;(allRequirements || []).forEach(req => {
        if (!req.job_level) return
        const hKey = [req.job_level.subdepartment_id, req.job_level.class_id, req.job_level.subclass_id]
          .filter(id => id !== null && id !== undefined).join('_')
        existingByHierarchy[hKey] = {
          id: req.id,
          documents_and_fields: Array.isArray(req.documents_and_fields) ? req.documents_and_fields : [],
          client_fields: Array.isArray(req.client_fields) ? req.client_fields : []
        }
      })

      const savePromises = Array.from(
        new Set([...Object.keys(changesByHierarchy), ...Object.keys(clientFieldChangesByHierarchy)])
      ).map(async (hierarchyKey) => {
        const data = changesByHierarchy[hierarchyKey] || { documents: {} }
        const parts = hierarchyKey.split('_')
        const sdId = parts[0] ? parseInt(parts[0]) : null
        const clsId = parts[1] ? parseInt(parts[1]) : null
        const scId = parts[2] ? parseInt(parts[2]) : null

        let level = 2
        if (scId) level = 4
        else if (clsId) level = 3

        const jobLevelObj = {
          level, department_id: deptId,
          subdepartment_id: sdId, class_id: clsId ?? null, subclass_id: scId ?? null
        }
        const existingRecord = existingByHierarchy[hierarchyKey]

        const docsMap = new Map<string, any>()
        ;(existingRecord?.documents_and_fields || []).forEach(doc => {
          docsMap.set(String(doc.id), { ...doc, fields: Array.isArray(doc.fields) ? doc.fields : [] })
        })

        Object.entries(data.documents).forEach(([entityKey, typeChanges]) => {
          const isField = entityKey.includes('|')
          let docId: string, fieldId: string | undefined
          if (isField) [docId, fieldId] = entityKey.split('|')
          else docId = entityKey

          let docObj = docsMap.get(String(docId)) || {
            id: String(docId), fields: [], updated_at: new Date().toISOString()
          }

          if (isField && fieldId) {
            let fieldObj = docObj.fields.find((f: any) => String(f.id) === String(fieldId))
            if (!fieldObj) {
              fieldObj = { id: String(fieldId), updated_at: new Date().toISOString() }
              docObj.fields.push(fieldObj)
            }
            Object.entries(typeChanges).forEach(([type, val]) => {
              if (val) fieldObj[type] = true; else delete fieldObj[type]
            })
            const remainingKeys = Object.keys(fieldObj).filter(k => !['id', 'updated_at'].includes(k))
            if (remainingKeys.length === 0) {
              docObj.fields = docObj.fields.filter((f: any) => String(f.id) !== String(fieldId))
            }
          } else {
            Object.entries(typeChanges).forEach(([type, val]) => {
              if (val) docObj[type] = true; else delete docObj[type]
            })
          }

          docObj.updated_at = new Date().toISOString()
          docsMap.set(String(docId), docObj)
        })

        const finalDocs = Array.from(docsMap.values()).filter(doc => {
          const docBooleans = Object.keys(doc).filter(k => !['id', 'fields', 'updated_at'].includes(k))
          const fieldBooleans = (doc.fields || []).some((f: any) =>
            Object.keys(f).some(k => !['id', 'updated_at'].includes(k))
          )
          return docBooleans.length > 0 || fieldBooleans
        })

        const clientFieldsChanges = clientFieldChangesByHierarchy[hierarchyKey]
        const clientFieldsMap = new Map<string, any>()
        ;(existingRecord?.client_fields || []).forEach(item => {
          clientFieldsMap.set(String(item.id), { ...item })
        })

        if (clientFieldsChanges) {
          Object.entries(clientFieldsChanges).forEach(([fieldId, typeChanges]) => {
            let fieldObj = clientFieldsMap.get(String(fieldId)) || { id: String(fieldId) }
            Object.entries(typeChanges).forEach(([type, val]) => {
              if (val) fieldObj[type] = true; else delete fieldObj[type]
            })
            clientFieldsMap.set(String(fieldId), fieldObj)
          })
        }

        const finalClientFields = Array.from(clientFieldsMap.values()).filter(item => {
          return Object.keys(item).some(k => !['id', 'updated_at'].includes(k) && item[k] === true)
        })

        const finalPayload = {
          job_level: jobLevelObj,
          documents_and_fields: finalDocs,
          client_fields: finalClientFields,
          updated_at: new Date().toISOString()
        }

        if (existingRecord?.id) {
          return supabase.from('tm_class_requirements').update(finalPayload).eq('id', existingRecord.id)
        } else {
          return supabase.from('tm_class_requirements').insert([finalPayload])
        }
      })

      const results = await Promise.all(savePromises)
      const err = results.find(r => r?.error)
      if (err) throw err.error

      setPendingChanges({ documents: {}, clientFields: {} })
      setHasUnsavedChanges(false)
      await fetchData(true)
      toast.success("Allocations updated successfully")
    } catch (error) {
      console.error("[Save] Error:", error)
      toast.error(`Save Failed: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [pendingChanges, hasUnsavedChanges, fetchData, activeTab])

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────────────────────────
  const writeSheetForTab = useCallback((
    worksheet: ExcelJS.Worksheet,
    tabValue: string,
    tabCols: any[]
  ) => {
    const tabGrouped = groupedDocsByTab[tabValue] || {}

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } }
    const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }
    const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }
    const whiteFont = { color: { argb: 'FFFFFFFF' }, bold: true }
    const centerAlign = { vertical: 'middle', horizontal: 'center' }

    const HEADER_START = 3

    worksheet.mergeCells('A1:F1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = `${currentDepartment?.name} — ${DOC_TABS.find(t => t.value === tabValue)?.label}  |  Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`
    titleCell.font = { size: 14, bold: true }
    titleCell.alignment = { vertical: 'middle' }

    worksheet.mergeCells('A2:B2')
    const instrCell = worksheet.getCell('A2')
    instrCell.value = 'IMPORT GUIDE: Type "Yes" in any cell to enable that allocation. Leave blank to disable. Do not add or remove rows.'
    instrCell.font = { italic: true, color: { argb: 'FF595959' }, size: 11 }

    const fixedHeaders = ['#', 'Document / Field Name', 'Document ID', 'Field ID']
    const fixedWidths = [10, 56, 38, 14]
    fixedHeaders.forEach((text, i) => {
      const colNum = i + 1
      worksheet.mergeCells(HEADER_START, colNum, HEADER_START + 3, colNum)
      const cell = worksheet.getCell(HEADER_START, colNum)
      cell.value = text
      cell.fill = headerFill
      cell.font = whiteFont
      cell.alignment = centerAlign
      worksheet.getColumn(colNum).width = fixedWidths[i]
    })

    worksheet.getColumn(3).hidden = true
    worksheet.getColumn(4).hidden = true

    let colIndex = 5
    let lastSd = null, sdStart = 0
    let lastCls = null, clsStart = 0
    const subdepartmentBoundaries = []

    tabCols.forEach((col, idx) => {
      const actualColIdx = colIndex
      const colSpan = col.isExpanded ? col.specifications.length : 1

      if (!lastSd || lastSd.id !== col.subdept.id) {
        if (lastSd && sdStart) {
          subdepartmentBoundaries.push(actualColIdx - 1)
          try { worksheet.mergeCells(HEADER_START, sdStart, HEADER_START, actualColIdx - 1) } catch { }
        }
        lastSd = col.subdept; sdStart = actualColIdx
        const cell = worksheet.getCell(HEADER_START, actualColIdx)
        cell.value = col.subdept.name
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
        cell.font = whiteFont; cell.alignment = centerAlign
      }
      if (idx === tabCols.length - 1) {
        subdepartmentBoundaries.push(actualColIdx + colSpan - 1)
        try { worksheet.mergeCells(HEADER_START, sdStart, HEADER_START, actualColIdx + colSpan - 1) } catch { }
      }

      const className = col.clsIndex === null ? "Direct" : col.subdept.classes?.[col.clsIndex]?.name ?? ''
      const uniqueClassId = `${col.subdept.id}-${col.clsIndex}`
      if (!lastCls || lastCls.id !== uniqueClassId) {
        if (lastCls && clsStart) {
          try { worksheet.mergeCells(HEADER_START + 1, clsStart, HEADER_START + 1, actualColIdx - 1) } catch { }
        }
        lastCls = { id: uniqueClassId }; clsStart = actualColIdx
        const cell = worksheet.getCell(HEADER_START + 1, actualColIdx)
        cell.value = className
        cell.fill = subHeaderFill; cell.font = whiteFont; cell.alignment = centerAlign
      }
      if (idx === tabCols.length - 1) {
        try { worksheet.mergeCells(HEADER_START + 1, clsStart, HEADER_START + 1, actualColIdx + colSpan - 1) } catch { }
      }

      const subclassName = (col.subclsIndex !== null && col.clsIndex !== null)
        ? col.subdept.classes?.[col.clsIndex]?.subclasses?.[col.subclsIndex]?.name ?? '-'
        : '-'
      const scCell = worksheet.getCell(HEADER_START + 2, actualColIdx)
      scCell.value = subclassName
      scCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } }
      scCell.font = { color: { argb: 'FFFFFFFF' } }; scCell.alignment = centerAlign
      if (colSpan > 1) {
        try { worksheet.mergeCells(HEADER_START + 2, actualColIdx, HEADER_START + 2, actualColIdx + colSpan - 1) } catch { }
      }

      const specs = col.isExpanded ? col.specifications : [col.specifications[0]]
      specs.forEach((entityType, sIdx) => {
        const specCell = worksheet.getCell(HEADER_START + 3, actualColIdx + sIdx)
        specCell.value = entityType
        specCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
        specCell.font = { bold: true }; specCell.alignment = centerAlign
        worksheet.getColumn(actualColIdx + sIdx).width = 16
      })

      colIndex += colSpan
    })

    const getAlloc = (id: string, sdId, cIdx, scIdx, type) => {
      const sd = currentDepartment?.subdepartments?.find(s => s.id === sdId)
      const cls = cIdx !== null ? sd?.classes?.[cIdx] : null
      const sc = (cls && scIdx !== null) ? cls.subclasses?.[scIdx] : null
      const classIdPart = sc ? `${sdId}_${cls.id}_${sc.id}` : cls ? `${sdId}_${cls.id}` : `${sdId}`
      const key = `${id}::${classIdPart}`
      return (pendingChanges.documents[key]?.[type] ?? documentAllocations[key]?.[type]) === true
    }

    Object.entries(tabGrouped)
      .sort(([a], [b]) => parseInt(a === 'other' ? '999' : a) - parseInt(b === 'other' ? '999' : b))
      .forEach(([, group]) => {
        const catRow = worksheet.addRow([group.mainCategoryNumber, group.mainCategory, '', ''])
        catRow.outlineLevel = 0
        catRow.font = { bold: true }
        catRow.fill = lightFill

        group.documents.forEach((doc, dIdx) => {
          const rowLabel = `${group.mainCategoryNumber}.${dIdx + 1}`
          const docRow = worksheet.addRow([rowLabel, doc.display_name, doc.id, ''])
          docRow.outlineLevel = 1

          let dataCol = 5
          tabCols.forEach(col => {
            const specs = col.isExpanded ? col.specifications : [col.specifications[0]]
            specs.forEach(spec => {
              const checked = getAlloc(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec)
              const cell = docRow.getCell(dataCol++)
              if (checked) {
                cell.value = 'Yes'
                cell.alignment = centerAlign
                cell.font = { color: { argb: 'FF00B050' }, bold: true }
              }
            })
          })

          if (doc.fields?.length) {
            doc.fields.forEach(field => {
              const fieldRow = worksheet.addRow([field.path, `    ${field.name}`, doc.id, field.id])
              fieldRow.outlineLevel = 2
              fieldRow.font = { italic: true, color: { argb: 'FF555555' } }

              let fDataCol = 5
              tabCols.forEach(col => {
                const specs = col.isExpanded ? col.specifications : [col.specifications[0]]
                specs.forEach(spec => {
                  const checked = getAlloc(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, spec)
                  const cell = fieldRow.getCell(fDataCol++)
                  if (checked) {
                    cell.value = 'Yes'
                    cell.alignment = centerAlign
                    cell.font = { color: { argb: 'FF00B050' }, bold: true }
                  }
                });
              });
            });
          }
        });
      });

    const thickBorder = { style: 'thick', color: { argb: 'FF000000' } }
    subdepartmentBoundaries.forEach(colIndex => {
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= HEADER_START) {
          const cell = row.getCell(colIndex)
          cell.border = { ...cell.border, right: thickBorder }
        }
      })
    })

    worksheet.views = [{ state: 'frozen', xSplit: 4, ySplit: HEADER_START + 4 }]
  }, [groupedDocsByTab, currentDepartment, documentAllocations, pendingChanges])

  const exportToExcel = useCallback(async () => {
    if (!currentDepartment) return
    setIsExporting(true)
    try {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Document Management'
      workbook.created = new Date()

      DOC_TABS.forEach(tab => {
        const ws = workbook.addWorksheet(tab.label, {
          properties: { outlineProperties: { summaryBelow: false, summaryRight: false } }
        })
        const tabCols = buildAllColumns(tab.value, normalizedSubdepartments)
        writeSheetForTab(ws, tab.value, tabCols)
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      saveAs(blob, `${currentDepartment.name}_Documents_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success(`Export successful (${DOC_TABS.length} sheets)`)
    } catch (e) {
      console.error('[Export] Failed:', e)
      toast.error("Export Failed")
    } finally {
      setIsExporting(false)
    }
  }, [currentDepartment, buildAllColumns, normalizedSubdepartments, writeSheetForTab])

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────────────────────────────
  const handleImport = useCallback(async (file: File) => {
    if (!currentDepartment) return
    setIsImporting(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)

      const deptId = parseInt(activeTab)
      const { data: allRequirements, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('id, documents_and_fields, job_level')
        .eq('job_level->>department_id', String(deptId))
      if (fetchError) throw fetchError

      const existingByHierarchy: Record<string, { id: string; documents_and_fields: any[] }> = {}
      ;(allRequirements || []).forEach(req => {
        if (!req.job_level) return
        const hKey = [req.job_level.subdepartment_id, req.job_level.class_id, req.job_level.subclass_id]
          .filter(id => id !== null && id !== undefined).join('_')
        existingByHierarchy[hKey] = {
          id: req.id,
          documents_and_fields: Array.isArray(req.documents_and_fields) ? req.documents_and_fields : []
        }
      })

      const importChanges: Record<string, Record<string, Record<string, boolean>>> = {}
      let totalYesFound = 0

      for (const tab of DOC_TABS) {
        const worksheet = workbook.getWorksheet(tab.label)
        if (!worksheet) continue

        const tabCols = buildVisibleColumns(tab.value, normalizedSubdepartments)
        const colMetaMap: Record<number, { subdept: any; clsIndex: number | null; subclsIndex: number | null; spec: string }> = {}
        let cIdx = 5
        tabCols.forEach(col => {
          const specs = col.isExpanded ? col.specifications : [col.specifications[0]]
          specs.forEach(spec => {
            colMetaMap[cIdx] = {
              subdept: col.subdept,
              clsIndex: col.clsIndex,
              subclsIndex: col.subclsIndex,
              spec
            }
            cIdx++
          })
        })
        const maxDataCol = cIdx - 1

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber < 7) return

          const docId = String(row.getCell(3).value ?? '').trim()
          const fieldId = String(row.getCell(4).value ?? '').trim()
          if (!docId) return

          for (let c = 5; c <= maxDataCol; c++) {
            const meta = colMetaMap[c]
            if (!meta) continue

            const rawVal = row.getCell(c).value
            const cellStr = String(rawVal ?? '').trim().toLowerCase()
            if (cellStr !== 'yes') continue

            totalYesFound++

            const sd = meta.subdept
            const cls = meta.clsIndex !== null ? sd.classes?.[meta.clsIndex] : null
            const sc = (cls && meta.subclsIndex !== null) ? cls.subclasses?.[meta.subclsIndex] : null
            const hierarchyKey = [sd.id, cls?.id, sc?.id]
              .filter(id => id !== null && id !== undefined)
              .join('_')

            const entityKey = fieldId ? `${docId}|${fieldId}` : docId

            if (!importChanges[hierarchyKey]) importChanges[hierarchyKey] = {}
            if (!importChanges[hierarchyKey][entityKey]) importChanges[hierarchyKey][entityKey] = {}
            importChanges[hierarchyKey][entityKey][meta.spec] = true
          }
        })
      }

      if (totalYesFound === 0) {
        toast("No 'Yes' values found. Nothing was changed.")
        return
      }

      const upsertPromises = Object.entries(importChanges).map(async ([hierarchyKey, entityMap]) => {
        const parts = hierarchyKey.split('_')
        const sdId = parts[0] ? parseInt(parts[0]) : null
        const clsId = parts[1] ? parseInt(parts[1]) : null
        const scId = parts[2] ? parseInt(parts[2]) : null

        let level = 2
        if (scId) level = 4
        else if (clsId) level = 3

        const jobLevelObj = {
          level, department_id: deptId,
          subdepartment_id: sdId, class_id: clsId ?? null, subclass_id: scId ?? null
        }
        const existingRecord = existingByHierarchy[hierarchyKey]

        const docsMap = new Map<string, any>()
        ;(existingRecord?.documents_and_fields || []).forEach(doc => {
          docsMap.set(String(doc.id), { ...doc, fields: Array.isArray(doc.fields) ? doc.fields : [] })
        })

        Object.entries(entityMap).forEach(([entityKey, typeFlags]) => {
          const isField = entityKey.includes('|')
          let docId: string, fieldId: string | undefined
          if (isField) [docId, fieldId] = entityKey.split('|')
          else docId = entityKey

          let docObj = docsMap.get(String(docId)) || {
            id: String(docId), fields: [], updated_at: new Date().toISOString()
          }

          if (isField && fieldId) {
            let fieldObj = docObj.fields.find((f: any) => String(f.id) === String(fieldId))
            if (!fieldObj) {
              fieldObj = { id: String(fieldId), updated_at: new Date().toISOString() }
              docObj.fields.push(fieldObj)
            }
            Object.entries(typeFlags).forEach(([type, val]) => {
              if (val) fieldObj[type] = true; else delete fieldObj[type]
            })
          } else {
            Object.entries(typeFlags).forEach(([type, val]) => {
              if (val) docObj[type] = true; else delete docObj[type]
            })
          }

          docObj.updated_at = new Date().toISOString()
          docsMap.set(String(docId), docObj)
        })

        const finalDocs = Array.from(docsMap.values()).filter(doc => {
          const hasDocFlags = Object.keys(doc).some(k => !['id', 'fields', 'updated_at'].includes(k) && doc[k] === true)
          const hasFieldFlags = (doc.fields || []).some((f: any) =>
            Object.keys(f).some(k => !['id', 'updated_at'].includes(k) && f[k] === true)
          )
          return hasDocFlags || hasFieldFlags
        })

        const finalPayload = {
          job_level: jobLevelObj,
          documents_and_fields: finalDocs,
          updated_at: new Date().toISOString()
        }

        if (existingRecord?.id) {
          return supabase.from('tm_class_requirements').update(finalPayload).eq('id', existingRecord.id)
        } else {
          return supabase.from('tm_class_requirements').insert([finalPayload])
        }
      })

      const results = await Promise.all(upsertPromises)
      const err = results.find(r => r?.error)
      if (err) throw err.error

      await fetchData(true)
      toast.success(`Import Successful: ${totalYesFound} allocations applied.`)
    } catch (e) {
      console.error('[Import] Failed:', e)
      toast.error(`Import Failed: ${e.message}`)
    } finally {
      setIsImporting(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }, [currentDepartment, activeTab, fetchData, buildVisibleColumns, normalizedSubdepartments])

  const toggleColumnExpansion = (key) => setExpandedColumns(prev => toggleSetItem(prev, key))
  const toggleCategoryExpansion = (key) => setExpandedCategories(prev => toggleSetItem(prev, key))
  const toggleItemExpansion = (key) => setExpandedItems(prev => toggleSetItem(prev, key))
  const toggleClientGroupExpansion = (key) => setExpandedClientGroups(prev => toggleSetItem(prev, key))

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({ documents: {}, clientFields: {} })
    setHasUnsavedChanges(false)
    toast("Changes discarded.")
  }, [])

  if (loading && departments.length === 0) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-custom-blue" />
          Loading Document Allocation Matrix…
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-background overflow-hidden">
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImport(file)
        }}
      />

      {/* ── Top Navigation & Department Tabs ────────────────────────── */}
      <div className="flex-none bg-gradient-to-b from-accent/80 to-card border-b z-20 shadow-sm">
        <div className="px-5 py-3 flex items-center justify-between gap-4 border-b border-border/60">
          <div className="flex items-center gap-3.5">
            <div className="h-9 w-9 rounded-lg bg-custom-blue text-white flex items-center justify-center font-bold shadow-sm">
              <FolderTree className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2.5">
                Document Allocation Map
                {hasUnsavedChanges && (
                  <Badge variant="outline" className="h-5 px-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs font-semibold animate-pulse">
                    Unsaved Changes
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">
                Configure required documents and metadata fields across organizational class tiers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-[11px] font-medium gap-2 bg-card border-border shadow-none hover:bg-muted"
              onClick={exportToExcel}
              disabled={isExporting}
            >
              <Download className={cn("h-4 w-4", isExporting && "animate-pulse")} />
              <span>{isExporting ? "Exporting..." : "Export Excel"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 text-[11px] font-medium gap-2 bg-card border-border shadow-none hover:bg-muted"
              onClick={() => importFileRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className={cn("h-4 w-4", isImporting && "animate-pulse")} />
              <span>{isImporting ? "Importing..." : "Import Excel"}</span>
            </Button>

            {hasUnsavedChanges && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDiscardChanges} 
                  disabled={isSaving}
                  className="h-9 text-[11px] font-medium gap-2 text-muted-foreground hover:text-destructive border-border shadow-none"
                >
                  <RotateCcw className="h-4 w-4" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveAllChanges}
                  disabled={isSaving}
                  className="h-9 text-[11px] gap-2 bg-custom-blue text-white hover:bg-custom-blue/90 shadow-none font-medium"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Allocations
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Department Switcher Tabs */}
        <div className="px-5 pt-2 bg-accent/50 flex items-center justify-between overflow-x-auto custom-scrollbar">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-9 bg-transparent p-0 gap-1.5 flex-wrap justify-start">
              {departments.map(d => (
                <TabsTrigger
                  key={d.id}
                  value={String(d.id)}
                  className="h-8 text-[11px] font-medium px-3.5 rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-custom-blue data-[state=active]:bg-card data-[state=active]:text-custom-blue shadow-none transition-all"
                >
                  <Building2 className="h-3.5 w-3.5 mr-2 opacity-70" />
                  {d.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ── Sub Toolbar (Doc Type Tabs, Search, Visibility & Matrix Controls) ── */}
      <div className="flex-none bg-card border-b px-5 py-2.5 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 flex-wrap">
            <Tabs
              value={documentTab}
              onValueChange={value => {
                setDocumentTab(value as "company" | "individual" | "application")
                setSearchQuery("")
              }}
            >
              <TabsList className="h-9 p-1 bg-accent/70 border border-accent">
                {DOC_TABS.map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="h-7 text-[11px] font-medium px-3 rounded-sm data-[state=active]:bg-card data-[state=active]:text-custom-blue data-[state=active]:shadow-sm transition-all"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents or fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-[11px] bg-card border-border rounded-md shadow-none focus-visible:ring-1"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-[11px] font-medium gap-2 bg-card border-border shadow-none hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Expand Levels
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Expand Levels</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => toggleAllRows({ categories: true, documents: true, clientFields: true })}>
                  <Layers className="h-4 w-4 text-custom-blue" />
                  Expand Everything
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleAllRows({ categories: true, documents: true, clientFields: false })}>
                  <FileText className="h-4 w-4 text-custom-blue" />
                  Documents &amp; Fields
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleAllRows({ categories: true, documents: false, clientFields: false })}>
                  <FolderTree className="h-4 w-4 text-custom-blue" />
                  Categories Only
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleAllRows({ categories: false, documents: false, clientFields: true })}>
                  <Users className="h-4 w-4 text-custom-blue" />
                  Client Fields Only
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => toggleAllRows({ categories: false, documents: false, clientFields: false })}
                  className="text-destructive"
                >
                  <Minus className="h-4 w-4" />
                  Collapse All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ColumnVisibilityControl
              columns={availableColumns.map(c => ({ ...c, visible: !!columnVisibility[c.id] }))}
              onVisibilityChange={(id, v) => setColumnVisibility(prev => ({ ...prev, [id]: v }))}
            />
          </div>
        </div>
      </div>

      {/* ── Main Data Grid Matrix ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto relative custom-scrollbar bg-background">
        <table
          className="text-[11px] border-separate border-spacing-0 table-fixed select-none"
          style={{ width: totalTableWidth }}
        >
          <thead>
            {/* Row 1: Subdepartment Tier */}
            <tr style={{ height: H_ROW_1 }}>
              <th
                rowSpan={4}
                style={{ width: COL_INDEX_WIDTH, left: 0, top: 0 }}
                className="sticky z-50 bg-[#295287] text-white border-r border-b border-white/20 px-3 py-2 text-center align-middle font-bold text-[11px]"
              >
                #
              </th>
              <th
                rowSpan={4}
                style={{ width: COL_NAME_WIDTH, left: COL_INDEX_WIDTH, top: 0 }}
                className="sticky z-50 bg-[#295287] text-white border-r border-b border-white/20 px-4 py-2 text-left align-middle font-bold text-[11px] shadow-[2px_0_6px_rgba(0,0,0,0.12)]"
              >
                Document / Field Details
              </th>

              {visibleColumns.reduce((acc, col, idx) => {
                const prev = visibleColumns[idx - 1]
                if (!prev || prev.subdept.id !== col.subdept.id) {
                  const group = visibleColumns.filter(c => c.subdept.id === col.subdept.id)
                  const span = group.reduce((s, c) => s + (c.isExpanded ? c.specifications.length : 1), 0)
                  acc.push(
                    <th
                      key={`sd-${col.subdept.id}`}
                      colSpan={span}
                      style={{ top: 0, height: H_ROW_1 }}
                      className="sticky z-30 bg-[#376bae] text-white border-r border-b border-white/20 px-3 py-2 text-center font-bold uppercase tracking-wider text-[11px]"
                    >
                      {col.subdept.name}
                    </th>
                  )
                }
                return acc
              }, [])}
            </tr>

            {/* Row 2: Class Tier */}
            <tr style={{ height: H_ROW_2 }}>
              {visibleColumns.reduce((acc, col, idx) => {
                const prev = visibleColumns[idx - 1]
                const isNew = !prev || prev.subdept.id !== col.subdept.id || prev.clsIndex !== col.clsIndex
                if (isNew) {
                  const group = visibleColumns.filter(c => c.subdept.id === col.subdept.id && c.clsIndex === col.clsIndex)
                  const span = group.reduce((s, c) => s + (c.isExpanded ? c.specifications.length : 1), 0)
                  acc.push(
                    <th
                      key={`cls-${idx}`}
                      colSpan={span}
                      style={{ top: H_ROW_1, height: H_ROW_2 }}
                      className="sticky z-30 bg-[#4a7cbe] text-white border-r border-b border-white/20 px-3 py-1.5 text-center font-semibold text-[11px]"
                    >
                      {col.clsIndex === null ? "Direct" : col.subdept.classes[col.clsIndex].name}
                    </th>
                  )
                }
                return acc
              }, [])}
            </tr>

            {/* Row 3: Subclass Tier */}
            <tr style={{ height: H_ROW_3 }}>
              {visibleColumns.map((col, idx) => (
                <th
                  key={`sc-${idx}`}
                  colSpan={col.isExpanded ? col.specifications.length : 1}
                  style={{ top: H_ROW_1 + H_ROW_2, height: H_ROW_3 }}
                  className="sticky z-30 bg-[#5f8cc9] text-white border-r border-b border-white/20 px-2.5 py-1 text-center text-xs font-normal truncate"
                  title={col.subclsIndex !== null ? col.subdept.classes[col.clsIndex].subclasses[col.subclsIndex].name : "Standard"}
                >
                  {col.subclsIndex !== null
                    ? col.subdept.classes[col.clsIndex].subclasses[col.subclsIndex].name
                    : "—"}
                </th>
              ))}
            </tr>

            {/* Row 4: Entity-Type / Specification Tier */}
            <tr style={{ height: H_ROW_4 }}>
              {flattenedColumns.map(col => (
                <th
                  key={col.uniqueKey}
                  style={{ width: DATA_COL_WIDTH, top: H_ROW_1 + H_ROW_2 + H_ROW_3, height: H_ROW_4 }}
                  className="sticky z-30 bg-[#7ba3d4] text-white border-r border-b border-white/20 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wider"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="truncate">{col.spec}</span>
                    {col.isFirstSpec && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleColumnExpansion(col.columnKey)
                        }}
                        className="rounded p-0.5 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                        title={col.isExpanded ? "Collapse entity types" : "Expand entity types"}
                      >
                        {col.isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {Object.entries(groupedDocuments).length === 0 && groupedClientFields.length === 0 ? (
              <tr>
                <td 
                  colSpan={2 + flattenedColumns.length} 
                  className="p-16 text-center text-muted-foreground text-[11px]"
                >
                  No documents match your filter.
                </td>
              </tr>
            ) : (
              <>
              {Object.entries(groupedDocuments)
                .sort(([a], [b]) => parseInt(a === 'other' ? '999' : a) - parseInt(b === 'other' ? '999' : b))
                .map(([catKey, group]) => {
                  const isCatExpanded = expandedCategories.has(catKey)
                  return (
                    <React.Fragment key={`category-${catKey}`}>
                      {/* Main Category Header Group Banner */}
                      <tr
                        onClick={() => toggleCategoryExpansion(catKey)}
                        className="bg-accent hover:bg-accent/70 border-b border-border border-l-2 border-l-custom-blue cursor-pointer transition-colors group"
                      >
                        <td 
                          style={{ left: 0 }}
                          className="sticky z-20 bg-accent group-hover:bg-accent/90 border-r border-b border-border px-3 py-3 text-center font-bold text-[11px] text-custom-blue"
                        >
                          {group.mainCategoryNumber}
                        </td>
                        <td
                          style={{ left: COL_INDEX_WIDTH }}
                          className="sticky z-20 bg-accent group-hover:bg-accent/90 border-r border-b border-border px-4 py-3 font-bold text-[11px] text-foreground shadow-[2px_0_6px_rgba(0,0,0,0.06)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate">{group.mainCategory}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="h-6 px-2 text-xs font-bold bg-custom-blue text-white border shadow-none">
                                {group.documents.length}
                              </Badge>
                              <div className="p-1 rounded text-custom-blue group-hover:text-custom-blue">
                                {isCatExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td 
                          colSpan={flattenedColumns.length} 
                          className="bg-accent/60 group-hover:bg-accent/80 border-b border-border" 
                        />
                      </tr>

                      {/* Documents List within Category */}
                      {isCatExpanded && group.documents.map((doc, docIndex) => {
                        const isDocExpanded = expandedItems.has(doc.id)
                        const docHasFields = doc.fields && doc.fields.length > 0
                        const isEven = docIndex % 2 === 0
                        const rowBg = isEven ? "bg-card" : "bg-accent"

                        return (
                          <React.Fragment key={`doc-${doc.id}`}>
                            <tr className={cn(rowBg, "hover:bg-accent/60 border-b border-border transition-colors group")}>
                              {/* Doc Index */}
                              <td 
                                style={{ left: 0 }}
                                className={cn(
                                  "sticky z-10 border-r border-b border-border px-3 py-2.5 text-center text-muted-foreground font-mono text-[11px] font-medium",
                                  rowBg
                                )}
                              >
                                {`${group.mainCategoryNumber}.${docIndex + 1}`}
                              </td>

                              {/* Doc Name */}
                              <td 
                                style={{ left: COL_INDEX_WIDTH }}
                                className={cn(
                                  "sticky z-10 border-r border-b border-border px-4 py-2.5 font-medium text-[11px] text-foreground truncate shadow-[2px_0_6px_rgba(0,0,0,0.06)]",
                                  rowBg
                                )}
                                title={doc.display_name}
                              >
                                <div className="flex items-center justify-between gap-2.5">
                                  <span className="truncate">{doc.display_name}</span>
                                  {docHasFields && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleItemExpansion(doc.id)
                                      }}
                                      className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground gap-1 hover:bg-accent/70"
                                      title={isDocExpanded ? "Collapse fields" : "Expand fields"}
                                    >
                                      <span className="font-mono text-xs font-semibold">{doc.fields.length}f</span>
                                      {isDocExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                    </Button>
                                  )}
                                </div>
                              </td>

                              {/* Document Checkbox Matrix */}
                              {flattenedColumns.map(col => {
                                const checked = getAllocationStatus(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec)
                                return (
                                  <td
                                    key={`${doc.id}-${col.uniqueKey}`}
                                    onClick={() => handleToggle(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec, !checked)}
                                    className="border-r border-b border-border p-0 text-center align-middle cursor-pointer hover:bg-custom-blue/5 transition-colors"
                                  >
                                    <div className="h-full w-full py-2.5 flex items-center justify-center">
                                      <MemoizedCheckbox
                                        checked={checked}
                                        onCheckedChange={(c) => handleToggle(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec, !!c)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-4 w-4 data-checked:bg-custom-blue data-checked:border-custom-blue border-muted-foreground/60"
                                      />
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>

                            {/* Sub-Fields Rows (if document is expanded) */}
                            {isDocExpanded && docHasFields && doc.fields.map((field) => (
                              <tr key={`field-${field.id}`} className="bg-accent/40 hover:bg-accent/70 border-b border-border transition-colors">
                                {/* Field Path Index */}
                                <td 
                                  style={{ left: 0 }}
                                  className="sticky z-10 bg-accent/60 border-r border-b border-border px-3 py-2 text-center text-xs text-muted-foreground font-mono"
                                >
                                  {field.path || "•"}
                                </td>

                                {/* Field Name */}
                                <td 
                                  style={{ left: COL_INDEX_WIDTH }}
                                  className="sticky z-10 bg-accent/60 border-r border-b border-border pl-10 pr-4 py-2 text-xs text-muted-foreground truncate shadow-[2px_0_6px_rgba(0,0,0,0.06)]"
                                  title={field.name}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                    <span className="truncate">{field.name}</span>
                                  </div>
                                </td>

                                {/* Field Checkbox Matrix */}
                                {flattenedColumns.map(col => {
                                  const checked = getAllocationStatus(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec)
                                  return (
                                    <td
                                      key={`${field.id}-${col.uniqueKey}`}
                                      onClick={() => handleToggle(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec, !checked)}
                                      className="border-r border-b border-border p-0 text-center align-middle cursor-pointer hover:bg-custom-blue/5 transition-colors bg-card/60"
                                    >
                                      <div className="h-full w-full py-2 flex items-center justify-center">
                                        <MemoizedCheckbox
                                          checked={checked}
                                          onCheckedChange={(c) => handleToggle(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec, !!c)}
                                          onClick={(e) => e.stopPropagation()}
                                          className="h-3.5 w-3.5 data-checked:bg-custom-blue data-checked:border-custom-blue border-muted-foreground/60"
                                        />
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </React.Fragment>
                  )
                })}

              {/* ── Separator: Documents → Client Fields ─────────────── */}
              {groupedClientFields.length > 0 && (
                <tr className="bg-custom-blue text-white">
                  <td
                    style={{ left: 0 }}
                    className="sticky left-0 z-20 bg-custom-blue border-r border-b-2 border-black/20 px-4 py-3 text-center"
                  >
                    <Users className="h-5 w-5 mx-auto" />
                  </td>
                  <td
                    style={{ left: COL_INDEX_WIDTH }}
                    className="sticky z-20 bg-custom-blue border-r border-b-2 border-black/20 px-4 py-3 shadow-[2px_0_8px_rgba(0,0,0,0.18)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold uppercase tracking-wider text-sm text-white">Client Fields</span>
                    </div>
                  </td>
                  <td colSpan={flattenedColumns.length} className="bg-custom-blue border-b-2 border-black/20">
                    <div className="flex items-center justify-end gap-3 px-4 text-[10px] uppercase tracking-[0.14em] text-white/70 font-semibold">
                      Form sections &amp; platform credentials
                    </div>
                  </td>
                </tr>
              )}

              {groupedClientFields.map((group, groupIndex) => {
                const isOpen = expandedClientGroups.has(group.key)
                return (
                  <React.Fragment key={`client-group-${group.key}`}>
                    {/* Client Field Section Banner */}
                    <tr
                      onClick={() => toggleClientGroupExpansion(group.key)}
                      className={cn(
                        "hover:bg-custom-blue/15 border-b border-border cursor-pointer transition-colors group",
                        groupIndex % 2 === 0 ? "bg-custom-blue/[0.07]" : "bg-custom-blue/[0.11]"
                      )}
                    >
                      <td
                        style={{ left: 0 }}
                        className="sticky z-20 bg-custom-blue/[0.13] group-hover:bg-custom-blue/20 border-r border-b border-border px-3 py-3 text-center font-bold text-xs text-custom-blue"
                      >
                        {group.type === "platform" ? "P" : "F"}
                      </td>
                      <td
                        style={{ left: COL_INDEX_WIDTH }}
                        className="sticky z-20 bg-custom-blue/[0.13] group-hover:bg-custom-blue/20 border-r border-b border-border px-4 py-3 font-bold text-sm text-foreground shadow-[2px_0_6px_rgba(0,0,0,0.06)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2.5 uppercase tracking-wider text-xs text-custom-blue font-bold truncate">
                            {group.type === "platform" ? <Users className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            {group.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="secondary" className="h-6 px-2 text-xs font-bold bg-custom-blue text-white border shadow-none">
                              {group.fields.length} field{group.fields.length > 1 ? "s" : ""}
                            </Badge>
                            <div className="p-1 rounded text-muted-foreground group-hover:text-foreground">
                              {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        colSpan={flattenedColumns.length}
                        className="bg-custom-blue/[0.03] group-hover:bg-custom-blue/[0.06] border-b border-border"
                      />
                    </tr>

                    {/* Client Field Rows */}
                    {isOpen && group.fields.map((field, fieldIndex) => {
                      const isFieldEven = fieldIndex % 2 === 0
                      const fieldRowBg = isFieldEven ? "bg-card" : "bg-accent"
                      return (
                        <tr
                          key={`client-field-${group.key}-${field.name}`}
                          className={cn(fieldRowBg, "hover:bg-accent/60 border-b border-border transition-colors")}
                        >
                          {/* Field Index */}
                          <td
                            style={{ left: 0 }}
                            className={cn(
                              "sticky z-10 border-r border-b border-border px-3 py-2.5 text-center text-muted-foreground font-mono text-xs font-medium",
                              fieldRowBg
                            )}
                          >
                            {`F${groupIndex + 1}.${fieldIndex + 1}`}
                          </td>

                          {/* Field Name */}
                          <td
                            style={{ left: COL_INDEX_WIDTH }}
                            className={cn(
                              "sticky z-10 border-r border-b border-border px-4 py-2.5 font-medium text-sm text-foreground truncate shadow-[2px_0_6px_rgba(0,0,0,0.06)]",
                              fieldRowBg
                            )}
                            title={field.label || field.name}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-custom-blue/40 shrink-0" />
                              <span className="truncate">{field.tableHeader || field.label || field.name}</span>
                            </div>
                          </td>

                          {/* Client Field Checkbox Matrix */}
                          {flattenedColumns.map(col => {
                            const checked = getClientFieldAllocationStatus(field.allocationKey, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec)
                            return (
                              <td
                                key={`${field.allocationKey}-${col.uniqueKey}`}
                                onClick={() => handleClientFieldToggle(field.allocationKey, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec, !checked)}
                                className="border-r border-b border-border p-0 text-center align-middle cursor-pointer hover:bg-custom-blue/10 transition-colors"
                              >
                                <div className="h-full w-full py-2.5 flex items-center justify-center">
                                  <MemoizedCheckbox
                                    checked={checked}
                                    onCheckedChange={(c) => handleClientFieldToggle(field.allocationKey, col.subdept.id, col.clsIndex, col.subclsIndex, col.spec, !!c)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 data-checked:bg-custom-blue data-checked:border-custom-blue border-muted-foreground/60"
                                  />
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}