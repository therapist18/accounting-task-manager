// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, Pencil, X, Info, Minus, Plus, Clock, FileText, User, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Eye, EyeOff, Settings, ChevronDown, ChevronUp, Star } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { AddStageDialog } from "./components/add-stage-dialog"
import { EditStageDialog } from "./components/edit-stage-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import type { Department, Stage, Subdepartment, DepartmentOption } from "./stagesdb"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "../main-shared-components/column-visibility"
import EntityVisibilityControl, { EntityVisibilityOption } from "../main-shared-components/entity-visibility"
import * as XLSX from "xlsx"

// Simple UUID generator for client-side use
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Enhanced recursive helper to transform KYC fields, handling nested arrays
const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []

  return fields.map((field: any) => {
    // Check for array type more comprehensively
    const isArray = field.type === 'array' || field.isArray === true

    const transformedField: any = {
      id: field.id || field.fieldName || '',
      fieldName: field.name || field.fieldName || '',
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    }

    // Handle array configuration for nested fields
    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems || 10,
        // Recursive call for nested fields
        fields: transformKycFields(field.arrayConfig.fields)
      }
    }

    return transformedField
  })
}

// Utility functions for time conversion
const minutesToTimeString = (minutes: number | null): string => {
  if (minutes === null || minutes === 0) return '0m'
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0) parts.push(`${mins}m`)

  return parts.join(' ') || '0m'
}

const timeStringToMinutes = (timeString: string): number => {
  let totalMinutes = 0
  const parts = timeString.trim().split(/\s+/)

  for (const part of parts) {
    const value = parseInt(part)
    if (part.endsWith('d')) {
      totalMinutes += value * 60 * 24
    } else if (part.endsWith('h')) {
      totalMinutes += value * 60
    } else if (part.endsWith('m')) {
      totalMinutes += value
    }
  }

  return totalMinutes
}

const getTimeFromMinutes = (minutes: number | null) => {
  if (minutes === null) return { days: 0, hours: 0, minutes: 0 }
  const days = Math.floor(minutes / (24 * 60))
  const remainingMinutes = minutes % (24 * 60)
  const hours = Math.floor(remainingMinutes / 60)
  const mins = remainingMinutes % 60
  return { days, hours, minutes: mins }
}

// Utility function to sort items by order field
const sortByOrder = <T extends { order?: number, order_num?: number }>(items: T[]): T[] => {
  return [...items].sort((a, b) => (a.order || a.order_num || 0) - (b.order || b.order_num || 0))
}

// Utility function to filter items by default display
const filterByDefaultDisplay = <T extends { default_display?: boolean }>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items
  return items.filter(item => item.default_display !== false)
}

export default function Stages() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeTab, setActiveTab] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showDefaultDisplayOnly, setShowDefaultDisplayOnly] = useState(false)
  const { toast } = useToast()

  // State for KYC documents
  const [allKycDocuments, setAllKycDocuments] = useState<Map<string, any>>(new Map())
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map())
  const [kycDocumentsLoading, setKycDocumentsLoading] = useState(false)

  // Effect to fetch all KYC documents
  useEffect(() => {
    const fetchAllKycDocuments = async () => {
      try {
        setKycDocumentsLoading(true)
        
        // Fetch ALL KYC documents from acc_portal_kyc table
        const { data, error } = await supabase
          .from('acc_portal_kyc')
          .select('*')

        if (error) throw error

        // Transform and cache all documents
        const documentsMap = new Map()
        data?.forEach(doc => {
          const transformedDoc = {
            ...doc,
            fields: transformKycFields(doc.fields || [])
          }
          documentsMap.set(doc.id, transformedDoc)
        })

        setAllKycDocuments(documentsMap)
        console.log(`Loaded ${documentsMap.size} KYC documents`)
      } catch (error) {
        console.error('Error fetching KYC documents:', error)
        toast({
          title: "Warning",
          description: "Failed to load KYC documents. Some document information may be incomplete.",
          variant: "destructive"
        })
      } finally {
        setKycDocumentsLoading(false)
      }
    }

    fetchAllKycDocuments()
  }, [])

  // Effect to update filtered KYC documents when departments change
  useEffect(() => {
    updateKycDocumentsMap()
  }, [departments, allKycDocuments])

  // Helper function to update the filtered KYC documents map
  const updateKycDocumentsMap = () => {
    const filteredDocuments = new Map()
    
    // Get all unique kycIds from documents
    const allKycIds = new Set<string>()
    departments.forEach(dept => {
      dept.subdepartments?.forEach(subdept => {
        subdept.classes?.forEach(cls => {
          cls.subClasses?.forEach(subCls => {
            subCls.documents?.forEach(doc => {
              if (doc.kycId) {
                allKycIds.add(doc.kycId)
              }
            })
          })
        })
      })
    })

    // Add stages documents too
    departments.forEach(dept => {
      dept.stages?.forEach(stage => {
        stage.documents?.forEach(doc => {
          if (doc.kycId) {
            allKycIds.add(doc.kycId)
          }
        })
      })
    })

    // Filter and add only the required documents
    allKycIds.forEach(kycId => {
      const doc = allKycDocuments.get(kycId)
      if (doc) {
        filteredDocuments.set(kycId, doc)
      }
    })

    setKycDocuments(filteredDocuments)
  }

  // Enhanced function to get KYC fields for a document
  const getKycFields = useCallback((doc: any) => {
    if (!doc.kycId) {
      // Fallback to extractionSpecs only if no kycId is provided
      console.warn(`Document ${doc.name || 'Unknown'} has no kycId, falling back to extractionSpecs`)
      return transformKycFields(doc.extractionSpecs || [])
    }

    const kycDoc = kycDocuments.get(doc.kycId)
    if (!kycDoc) {
      console.warn(`KYC document not found for kycId: ${doc.kycId}`)
      return transformKycFields(doc.extractionSpecs || [])
    }

    return kycDoc.fields || []
  }, [kycDocuments])

  // Enhanced function to get document information from KYC
  const getDocumentInfo = useCallback((doc: any) => {
    if (!doc.kycId) {
      return {
        displayName: doc.name || 'Unknown Document',
        documentType: doc.documentType || 'document',
        category: doc.category || '',
        subcategory: doc.subcategory || '',
        isKycSynced: false,
        kycDoc: null
      }
    }

    const kycDoc = allKycDocuments.get(doc.kycId)
    if (!kycDoc) {
      console.warn(`KYC document not found for kycId: ${doc.kycId}`)
      return {
        displayName: doc.name || 'Unknown Document',
        documentType: doc.documentType || 'document',
        category: doc.category || '',
        subcategory: doc.subcategory || '',
        isKycSynced: false,
        kycDoc: null
      }
    }

    return {
      displayName: kycDoc.display_name || kycDoc.name || doc.name || 'Unknown Document',
      documentType: kycDoc.document_type || doc.documentType || 'document',
      category: kycDoc.category || doc.category || '',
      subcategory: kycDoc.subcategory || doc.subcategory || '',
      isKycSynced: true,
      kycDoc: kycDoc
    }
  }, [allKycDocuments])

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({
    index: true,
    entity: true,
    stageName: true,
    duration: true,
    followUp: true,
    controls: true,
  })

  // Entity visibility state
  const [entityVisibility, setEntityVisibility] = useState<Record<string, boolean>>({})

  // Enhanced document display component using KYC data exclusively
  const DocumentDisplay = useCallback(({ doc, stage }: { doc: any, stage: any }) => {
    const [kycFields, setKycFields] = useState([])
    const [fieldsLoading, setFieldsLoading] = useState(true)

    const documentInfo = getDocumentInfo(doc)

    useEffect(() => {
      const loadKycFields = async () => {
        setFieldsLoading(true)
        try {
          const fields = getKycFields(doc)
          setKycFields(fields)
        } catch (error) {
          console.error('Error loading KYC fields:', error)
          setKycFields([])
        } finally {
          setFieldsLoading(false)
        }
      }
      loadKycFields()
    }, [doc.kycId, doc.extractionSpecs])

    const renderArrayField = (field: any, depth: number = 0) => {
      const indentClass = depth > 0 ? `ml-${depth * 4}` : ''
      
      return (
        <div key={field.id} className={cn(
          "bg-white p-3 rounded-lg border-l-4 border-purple-400 space-y-2",
          indentClass
        )}>
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm flex items-center gap-2">
              {field.fieldName}
              <Badge variant="outline" className="text-xs py-0 bg-purple-50 text-purple-700 border-purple-200">
                Array
              </Badge>
              {field.arrayConfig?.maxItems && (
                <Badge variant="outline" className="text-xs py-0 bg-blue-50 text-blue-700 border-blue-200">
                  Max: {field.arrayConfig.maxItems}
                </Badge>
              )}
            </span>
            <div className="flex items-center gap-1">
              {field.isRequired && (
                <Badge variant="destructive" className="text-xs py-0">
                  Required
                </Badge>
              )}
            </div>
          </div>
          
          {field.description && (
            <div className="text-gray-600 text-xs">
              {field.description}
            </div>
          )}

          {/* Array sub-fields */}
          {field.arrayConfig?.fields && field.arrayConfig.fields.length > 0 && (
            <div className="space-y-2 border-l-2 border-gray-200 pl-3 ml-2">
              <div className="text-xs font-medium text-gray-500 mb-2">
                Array contains {field.arrayConfig.fields.length} field{field.arrayConfig.fields.length !== 1 ? 's' : ''}:
              </div>
              {field.arrayConfig.fields.map((subField: any) => {
                if (subField.isArray) {
                  return renderArrayField(subField, depth + 1)
                }
                
                return (
                  <div key={subField.id} className="bg-gray-50 p-2 rounded text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{subField.fieldName}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs py-0">
                          {subField.fieldType}
                        </Badge>
                        {subField.isRequired && (
                          <Badge variant="destructive" className="text-xs py-0">
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>
                    {subField.description && (
                      <div className="text-gray-600">
                        {subField.description}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    const renderRegularField = (field: any) => (
      <div key={field.id} className="bg-white p-2 rounded text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">{field.fieldName}</span>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs py-0">
              {field.fieldType}
            </Badge>
            {field.isRequired && (
              <Badge variant="destructive" className="text-xs py-0">
                Required
              </Badge>
            )}
          </div>
        </div>
        {field.description && (
          <div className="text-gray-600">
            {field.description}
          </div>
        )}
      </div>
    )

    return (
      <div className={cn(
        "p-3 rounded-lg space-y-3",
        doc.isSpecial ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
      )}>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {documentInfo.displayName}
              {doc.isSpecial && <Star className="h-4 w-4 text-amber-500" />}
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={doc.isRequired ? "default" : "secondary"} className="text-xs">
                {doc.isRequired ? "Required" : "Optional"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {documentInfo.documentType}
              </Badge>
              {doc.inputType && (
                <Badge variant="outline" className="text-xs">
                  {doc.inputType}
                </Badge>
              )}
              {documentInfo.isKycSynced ? (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  KYC Synced
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                  Legacy Data
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {documentInfo.category && (
                <Badge variant="outline" className="text-xs">
                  {documentInfo.category}
                </Badge>
              )}
              {documentInfo.subcategory && (
                <Badge variant="outline" className="text-xs">
                  {documentInfo.subcategory}
                </Badge>
              )}
            </div>
            
            {/* Special document target entities info */}
            {doc.isSpecial && doc.targetEntities && doc.targetEntities.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                  <Info className="h-3 w-3" />
                  <span>Target Entities ({doc.targetEntities.length}):</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {doc.targetEntities.map((entity, entityIndex) => (
                    <Badge key={entityIndex} variant="outline" className="text-xs">
                      {entity.entityName}
                      <span className="ml-1 text-amber-600">({entity.entityType})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {doc.description && (
          <div className="text-gray-600 text-xs">
            {doc.description}
          </div>
        )}

        {/* Enhanced KYC Fields display */}
        {fieldsLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="h-3 w-3 border-2 border-t-gray-600 border-gray-200 rounded-full animate-spin"></div>
            Loading field specifications...
          </div>
        ) : kycFields && kycFields.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Info className="h-3 w-3" />
              {documentInfo.isKycSynced ? 'KYC Fields' : 'Legacy Fields'} ({kycFields.length})
              {documentInfo.isKycSynced && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  From KYC System
                </Badge>
              )}
            </div>
            
            <div className="space-y-2">
              {kycFields.map((field) => {
                if (field.isArray) {
                  return renderArrayField(field)
                }
                return renderRegularField(field)
              })}
            </div>
          </div>
        ) : (
          doc.kycId ? (
            <div className="text-xs text-gray-500 italic">
              No fields configured for this KYC document (ID: {doc.kycId}).
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">
              No field specifications available for this document.
            </div>
          )
        )}

        {/* Additional KYC metadata if available */}
        {documentInfo.kycDoc && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500 space-y-1">
              {documentInfo.kycDoc.validity_days && (
                <div>Validity: {documentInfo.kycDoc.validity_days} days</div>
              )}
              {documentInfo.kycDoc.reminder_days && (
                <div>Reminder: {documentInfo.kycDoc.reminder_days} days before expiry</div>
              )}
              {documentInfo.kycDoc.main_category && (
                <div>Category: {documentInfo.kycDoc.main_category}</div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }, [getKycFields, getDocumentInfo])

  // Memoized column visibility options
  const columnVisibilityOptions: ColumnVisibilityOption[] = useMemo(() => [
    {
      id: 'index',
      label: 'Index (#)',
      visible: columnVisibility.index,
      disabled: true, // Always show index
      isDefault: true,
      group: 'Basic'
    },
    {
      id: 'entity',
      label: 'Department / Entity',
      visible: columnVisibility.entity,
      disabled: true, // Always show entity
      isDefault: true,
      group: 'Basic'
    },
    {
      id: 'stageName',
      label: 'Stage Names',
      visible: columnVisibility.stageName,
      isDefault: true,
      group: 'Stage Info'
    },
    {
      id: 'duration',
      label: 'Duration',
      visible: columnVisibility.duration,
      isDefault: true,
      group: 'Stage Info'
    },
    {
      id: 'followUp',
      label: 'Follow Up',
      visible: columnVisibility.followUp,
      isDefault: true,
      group: 'Stage Info'
    },
    {
      id: 'controls',
      label: 'Controls (Applicable/Default Display)',
      visible: columnVisibility.controls,
      isDefault: true,
      group: 'Controls'
    }
  ], [columnVisibility])

  // Generate entity visibility options
  const entityVisibilityOptions: EntityVisibilityOption[] = useMemo(() => {
    const currentDept = departments.find(d => d.id === activeTab)
    if (!currentDept) return []

    const entities: EntityVisibilityOption[] = []

    currentDept.subdepartments?.forEach((subdept) => {
      const subdeptId = `subdept-${subdept.id}`
      entities.push({
        id: subdeptId,
        name: subdept.name,
        type: 'subdepartment',
        visible: entityVisibility[subdeptId] !== false,
        level: 0,
        path: subdept.name,
        hasChildren: !!(subdept.classes && subdept.classes.length > 0),
        default_display: subdept.default_display
      })

      subdept.classes?.forEach((cls, clsIndex) => {
        const classId = `class-${subdept.id}-${cls.id || clsIndex}`
        entities.push({
          id: classId,
          name: cls.name,
          type: 'class',
          parentId: subdeptId,
          visible: entityVisibility[classId] !== false,
          level: 1,
          path: `${subdept.name} → ${cls.name}`,
          hasChildren: !!(cls.subClasses && cls.subClasses.length > 0),
          default_display: cls.default_display
        })

        cls.subClasses?.forEach((subCls, subClsIndex) => {
          const subclassId = `subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`
          entities.push({
            id: subclassId,
            name: subCls.name,
            type: 'subclass',
            parentId: classId,
            visible: entityVisibility[subclassId] !== false,
            level: 2,
            path: `${subdept.name} → ${cls.name} → ${subCls.name}`,
            default_display: subCls.default_display
          })
        })
      })
    })

    return entities
  }, [departments, activeTab, entityVisibility])

  const handleColumnVisibilityChange = (columnId: string, visible: boolean) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: visible
    }))
  }

  const handleShowAllColumns = () => {
    setColumnVisibility({
      index: true,
      entity: true,
      stageName: true,
      duration: true,
      followUp: true,
      controls: true,
    })
  }

  const handleHideAllColumns = () => {
    setColumnVisibility({
      index: true, // Keep required columns
      entity: true, // Keep required columns
      stageName: false,
      duration: false,
      followUp: false,
      controls: false,
    })
  }

  const handleResetToDefault = () => {
    setColumnVisibility({
      index: true,
      entity: true,
      stageName: true,
      duration: true,
      followUp: true,
      controls: true,
    })
  }

  const handleEntityVisibilityChange = (entityId: string, visible: boolean) => {
    setEntityVisibility(prev => ({
      ...prev,
      [entityId]: visible
    }))
  }

  const handleShowAllEntities = () => {
    const newVisibility: Record<string, boolean> = {}
    entityVisibilityOptions.forEach(entity => {
      newVisibility[entity.id] = true
    })
    setEntityVisibility(newVisibility)
  }

  const handleHideAllEntities = () => {
    const newVisibility: Record<string, boolean> = {}
    entityVisibilityOptions.forEach(entity => {
      newVisibility[entity.id] = false
    })
    setEntityVisibility(newVisibility)
  }

  const handleResetEntitiesToDefault = () => {
    const newVisibility: Record<string, boolean> = {}
    entityVisibilityOptions.forEach(entity => {
      newVisibility[entity.id] = entity.default_display !== false
    })
    setEntityVisibility(newVisibility)
  }

  const handleKeyDown = (e: React.KeyboardEvent, subdeptId: number, stageId: string, shouldAllocate: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAllocationChangeInternal(subdeptId, stageId, shouldAllocate)
    }
  }

  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowId)) {
        newSet.delete(rowId)
      } else {
        newSet.add(rowId)
      }
      return newSet
    })
  }

  const getCurrentDepartment = () => {
    return departments.find(d => d.id === activeTab)
  }

  // Process subdepartments based on display settings and entity visibility
  const getProcessedSubdepartments = (dept: Department) => {
    let subdepartments = dept.subdepartments || []

    // Filter by default display if needed
    subdepartments = filterByDefaultDisplay(subdepartments, showDefaultDisplayOnly)

    // Filter by entity visibility
    subdepartments = subdepartments.filter(subdept => {
      const subdeptId = `subdept-${subdept.id}`
      return entityVisibility[subdeptId] !== false
    })

    // Process classes and subclasses within each subdepartment
    return subdepartments.map(subdept => ({
      ...subdept,
      classes: filterByDefaultDisplay(
        (subdept.classes || [])
          .filter(cls => {
            const classId = `class-${subdept.id}-${cls.id}`
            return entityVisibility[classId] !== false
          })
          .map(cls => ({
            ...cls,
            subClasses: filterByDefaultDisplay(
              (cls.subClasses || []).filter(subCls => {
                const subclassId = `subclass-${subdept.id}-${cls.id}-${subCls.id}`
                return entityVisibility[subclassId] !== false
              }),
              showDefaultDisplayOnly
            )
          })),
        showDefaultDisplayOnly
      )
    }))
  }

  const expandAllRows = () => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const rowIds = new Set<string>()

    // Get all potential row IDs
    const processedSubdepartments = getProcessedSubdepartments(currentDept)
    processedSubdepartments.forEach((subdept, subdeptIndex) => {
      const subdeptRowId = `subdept-${subdept.id}`
      rowIds.add(subdeptRowId)

      if (subdept.classes && subdept.classes.length > 0) {
        subdept.classes.forEach((cls, clsIndex) => {
          const classRowId = `class-${subdept.id}-${cls.id || clsIndex}`
          rowIds.add(classRowId)
        })
      }
    })

    setExpandedRows(rowIds)
  }

  const collapseAllRows = () => {
    setExpandedRows(new Set())
  }

  // Check if all expandable rows are expanded
  const areAllRowsExpanded = useMemo(() => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return false

    const processedSubdepartments = getProcessedSubdepartments(currentDept)
    let totalExpandableRows = 0
    let expandedCount = 0

    processedSubdepartments.forEach((subdept) => {
      if (subdept.classes && subdept.classes.length > 0) {
        const subdeptRowId = `subdept-${subdept.id}`
        totalExpandableRows++
        if (expandedRows.has(subdeptRowId)) {
          expandedCount++
        }

        subdept.classes.forEach((cls, clsIndex) => {
          if (cls.subClasses && cls.subClasses.length > 0) {
            const classRowId = `class-${subdept.id}-${cls.id || clsIndex}`
            totalExpandableRows++
            if (expandedRows.has(classRowId)) {
              expandedCount++
            }
          }
        })
      }
    })

    return totalExpandableRows > 0 && expandedCount === totalExpandableRows
  }, [expandedRows, departments, activeTab, showDefaultDisplayOnly, entityVisibility])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        const { data: deptsData, error: deptsError } = await supabase
          .from('tm_departments')
          .select(`
            *,
            tm_subdepartments (
              *,
              classes
            )
          `)
          .order('order', { ascending: true })

        if (deptsError) throw deptsError

        // Transform and sort the data properly
        const transformedDepartments = (deptsData || []).map(dept => ({
          ...dept,
          stages: dept.stages ? (Array.isArray(dept.stages) ? sortByOrder(dept.stages) : []) : [],
          subdepartments: sortByOrder((dept.tm_subdepartments || []).map((subdept: any) => ({
            ...subdept,
            stages: Array.isArray(subdept.stages) ? subdept.stages : [],
            classes: sortByOrder(Array.isArray(subdept.classes) ? subdept.classes.map((cls: any) => ({
              ...cls,
              subClasses: sortByOrder(Array.isArray(cls.subClasses) ? cls.subClasses : [])
            })) : []),
            hasClasses: (subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0)
          })))
        }))

        // Sort departments by order
        const sortedDepartments = sortByOrder(transformedDepartments)
        setDepartments(sortedDepartments)

        if (sortedDepartments.length > 0) {
          setActiveTab(sortedDepartments[0].id)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const departmentList = useMemo((): DepartmentOption[] =>
    departments.map(dept => ({
      id: dept.id,
      name: dept.name
    })),
    [departments]
  )

  const handleAllocationChangeInternal = async (subdeptId: number, stageId: string,
    shouldAllocate: boolean
  ) => {
    return handleAllocationChange(subdeptId, stageId, shouldAllocate)
  }

  const handleAllocationChange = async (
    subdeptId: number,
    stageId: string,
    shouldAllocate: boolean,
    classIndex: number | null = null,
    subclassIndex: number | null = null
  ) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let stageName = currentDept.stages.find(s => s.id === stageId)?.name || 'this stage'

      if (classIndex !== null && subclassIndex !== null) {
        // Handle subclass allocation
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]?.subClasses?.[subclassIndex]) {
          toast({
            title: "Error",
            description: "Subclass not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name
        const subclassName = subdept.classes[classIndex].subClasses[subclassIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
          updatedClasses[classIndex].subClasses[subclassIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { classes: updatedClasses }

        // Update parent class and subdepartment stages as well
        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }
        let classStageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!classStageAllocation) {
          classStageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].stages.push(classStageAllocation)
        }
        classStageAllocation.applicable = shouldAllocate || updatedClasses[classIndex].subClasses?.some((sc: any) =>
          sc.stages?.some((s: any) => s.stage_id === stageId && s.applicable)
        )

        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)
        updateData.stages = subdeptStages

      } else if (classIndex !== null) {
        // Handle class allocation
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { classes: updatedClasses }

        // Also update subdepartment stages
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)
        updateData.stages = subdeptStages

      } else {
        // Handle subdepartment allocation
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name

        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { stages: subdeptStages }
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId)

      if (error) throw error

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments: dept.subdepartments?.map(subdept => {
              if (subdept.id !== subdeptId) return subdept

              if (classIndex !== null && subclassIndex !== null) {
                // Update subclass
                const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

                if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
                  updatedClasses[classIndex].subClasses[subclassIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
                }

                stageAllocation.applicable = shouldAllocate
                if (!shouldAllocate) {
                  stageAllocation.display = false
                }

                return {
                  ...subdept,
                  classes: updatedClasses
                }
              } else if (classIndex !== null) {
                // Update class
                const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }

                stageAllocation.applicable = shouldAllocate
                if (!shouldAllocate) {
                  stageAllocation.display = false
                }

                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
                  subdeptStages.push(subdeptStageAllocation)
                }
                subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  stages: subdeptStages
                }
              }

              // Update subdepartment
              const subdeptStages = [...(subdept.stages || [])]
              let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
              if (!stageAllocation) {
                stageAllocation = { stage_id: stageId, applicable: true, display: true }
                subdeptStages.push(stageAllocation)
              }

              stageAllocation.applicable = shouldAllocate
              if (!shouldAllocate) {
                stageAllocation.display = false
              }

              return {
                ...subdept,
                stages: subdeptStages
              }
            }) || []
          }
        })
      )

      toast({
        title: "Success",
        description: `${stageName} has been ${shouldAllocate ? 'applied to' : 'removed from'} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
      })
    } catch (err) {
      console.error('Error updating allocation:', err)
      toast({
        title: "Error",
        description: "Failed to update allocation. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleDisplayToggle = async (
    subdeptId: number,
    stageId: string,
    checked: boolean,
    classIndex: number | null = null,
    subclassIndex: number | null = null
  ) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let stageName = currentDept.stages.find(s => s.id === stageId)?.name || 'this stage'

      if (classIndex !== null && subclassIndex !== null) {
        // Handle subclass display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]?.subClasses?.[subclassIndex]) {
          toast({
            title: "Error",
            description: "Subclass not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name
        const subclassName = subdept.classes[classIndex].subClasses[subclassIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
          updatedClasses[classIndex].subClasses[subclassIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

      } else if (classIndex !== null) {
        // Handle class display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.display = checked || subdeptStages.some(s => s.stage_id === stageId && s.display)
        updateData.stages = subdeptStages

      } else {
        // Handle subdepartment display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name

        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { stages: subdeptStages }
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId)

      if (error) throw error

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments: dept.subdepartments?.map(subdept => {
              if (subdept.id !== subdeptId) return subdept

              if (classIndex !== null && subclassIndex !== null) {
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
                  updatedClasses[classIndex].subClasses[subclassIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
                }
                stageAllocation.display = checked

                return {
                  ...subdept,
                  classes: updatedClasses
                }
              } else if (classIndex !== null) {
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }
                stageAllocation.display = checked

                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
                  subdeptStages.push(subdeptStageAllocation)
                }
                subdeptStageAllocation.display = checked || subdeptStages.some(s => s.stage_id === stageId && s.display)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  stages: subdeptStages
                }
              }

              const subdeptStages = [...(subdept.stages || [])]
              let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
              if (!stageAllocation) {
                stageAllocation = { stage_id: stageId, applicable: true, display: true }
                subdeptStages.push(stageAllocation)
              }
              stageAllocation.display = checked

              return {
                ...subdept,
                stages: subdeptStages
              }
            }) || []
          }
        })
      )

      toast({
        title: "Success",
        description: `Display setting updated for ${stageName} in ${className ? `${className} (${subdeptName})` : subdeptName}`,
      })
    } catch (err) {
      console.error('Error updating display setting:', err)
      toast({
        title: "Error",
        description: "Failed to update display setting. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleAddStages = async (stages: any[], departmentId: string) => {
    const currentDept = departments.find(d => d.id === departmentId)
    if (!currentDept) {
      toast({
        title: "Error",
        description: "Department not found. Please try again.",
        variant: "destructive"
      })
      return
    }

    try {
      const newStagesData = stages
        .filter(stage => stage.name.trim() !== '')
        .map((stage, index) => {
          if (stage.isSpecial) {
            const timeConfigs = Array.isArray(stage.timeConfigs)
              ? stage.timeConfigs.map(config => ({
                applicationType: config.applicationType || 'Default',
                days: Number(config.days) || 0,
                hours: Number(config.hours) || 0,
                minutes: Number(config.minutes) || 0
              }))
              : [];

            const firstConfig = timeConfigs[0] || { days: 0, hours: 0, minutes: 0 };
            const totalMinutes = (firstConfig.days * 24 * 60) + (firstConfig.hours * 60) + firstConfig.minutes;

            return {
              id: generateId(),
              name: stage.name.trim(),
              description: stage.description || '',
              estimated_time: totalMinutes,
              order_num: currentDept.stages.length + index + 1,
              follow_up: stage.followUp === 'none' ? null : stage.followUp as 'Client' | 'Officer' | 'BCL',
              isSpecial: true,
              timeConfigs: timeConfigs.length > 0 ? timeConfigs : undefined,
              documents: stage.documents || [],
              allocations: {}
            };
          }

          const days = Number(stage.days) || 0;
          const hours = Number(stage.hours) || 0;
          const minutes = Number(stage.minutes) || 0;
          const totalMinutes = (days * 24 * 60) + (hours * 60) + minutes;

          return {
            id: generateId(),
            name: stage.name.trim(),
            description: stage.description || '',
            estimated_time: totalMinutes,
            order_num: currentDept.stages.length + index + 1,
            follow_up: stage.followUp === 'none' ? null : stage.followUp as 'Client' | 'Officer' | 'BCL',
            isSpecial: false,
            timeConfigs: undefined,
            documents: stage.documents || [],
            allocations: {}
          };
        });

      if (newStagesData.length === 0) {
        toast({
          title: "No valid stages to add",
          description: "Please enter at least one stage name",
          variant: "destructive"
        })
        return
      }

      const updatedStages = [
        ...currentDept.stages,
        ...newStagesData
      ];

      const { data: updatedDept, error: updateError } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentDept.id)
        .select()
        .single()

      if (updateError) throw updateError

      setDepartments(departments.map(dept =>
        dept.id === currentDept.id
          ? { ...dept, stages: updatedStages }
          : dept
      ))

      setIsDialogOpen(false)

      toast({
        title: "Success",
        description: `Added ${newStagesData.length} stage${newStagesData.length > 1 ? 's' : ''} successfully.`,
      })
    } catch (err) {
      console.error('Error adding stages:', err)
      toast({
        title: "Error",
        description: "Failed to add stages. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleUpdateStage = async (updatedStage: Stage) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const updatedStages = currentDept.stages.map(s =>
        s.id === updatedStage.id ? updatedStage : s
      )

      const { error } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)

      if (error) throw error

      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))

      toast({
        title: "Success",
        description: "Stage updated successfully",
      })

      setEditingStage(null)
      setIsEditDialogOpen(false)
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({
        title: "Error",
        description: "Failed to update stage. Please try again.",
        variant: "destructive"
      })
    }
  }

  const moveStage = async (stageId: string, direction: 'up' | 'down') => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const currentStages = JSON.parse(JSON.stringify(currentDept.stages))
    const currentIndex = currentStages.findIndex((s: Stage) => s.id === stageId)

    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentStages.length) return

    const newStages = [...currentStages]
    const [movedStage] = newStages.splice(currentIndex, 1)
    newStages.splice(newIndex, 0, movedStage)

    const updatedStages = newStages.map((stage: Stage, index: number) => ({
      ...stage,
      order_num: index + 1
    }))

    try {
      const { data: currentDeptData, error: fetchError } = await supabase
        .from('tm_departments')
        .select('*')
        .eq('id', activeTab)
        .single()

      if (fetchError) throw fetchError

      const { error } = await supabase
        .from('tm_departments')
        .update({
          ...currentDeptData,
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)

      if (error) throw error

      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))
    } catch (err) {
      console.error('Error moving stage:', err)
      toast({
        title: "Error",
        description: `Failed to move stage ${direction}. Please try again.`,
        variant: "destructive"
      })
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const stageToDelete = currentDept.stages.find(s => s.id === stageId)
      if (!stageToDelete) return

      if (stageToDelete.documents) {
        await Promise.all(
          stageToDelete.documents
            .filter(doc => doc.kycId)
            .map(doc => deleteKYCDocument(doc.kycId!))
        )
      }

      const updatedStages = currentDept.stages
        .filter(s => s.id !== stageId)
        .map((stage, index) => ({ ...stage, order_num: index + 1 }))

      const { error } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)

      if (error) throw error

      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))

      toast({
        title: "Success",
        description: "Stage and associated documents deleted successfully",
      })
    } catch (err) {
      console.error('Error deleting stage:', err)
      toast({
        title: "Error",
        description: "Failed to delete stage. Please try again.",
        variant: "destructive"
      })
    }
  }

  const currentDept = getCurrentDepartment()

  const handleExportToExcel = () => {
    if (!currentDept) return;

    const processedSubdepartments = getProcessedSubdepartments(currentDept);
    const dataToExport = [];

    // Process entities to create rows exactly like the table
    let entityIndex = 1;

    processedSubdepartments.forEach(subdept => {
      const hasClasses = subdept.classes && subdept.classes.length > 0;

      if (!hasClasses) {
        // Subdepartment without classes - add as leaf node
        const rowData = {
          'Department': currentDept.name,
          '#': entityIndex++,
          'Entity': subdept.name
        };

        // Add stage data for each stage
        currentDept.stages.forEach(stage => {
          const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id);
          const isApplicable = stageAllocation?.applicable ?? true;
          const isDisplayed = stageAllocation?.display ?? true;

          rowData[`${stage.name} - Stage Name`] = stage.name;
          rowData[`${stage.name} - Duration`] = minutesToTimeString(stage.estimated_time);
          rowData[`${stage.name} - Follow Up`] = stage.follow_up || '-';
          rowData[`${stage.name} - Applicable`] = isApplicable ? 'yes' : 'no';
          rowData[`${stage.name} - Display`] = isDisplayed ? 'yes' : 'no';
        });

        dataToExport.push(rowData);
      } else {
        // Subdepartment with classes
        subdept.classes.forEach(cls => {
          const hasSubClasses = cls.subClasses && cls.subClasses.length > 0;

          if (!hasSubClasses) {
            // Class without subclasses - add as leaf node
            const rowData = {
              'Department': currentDept.name,
              '#': entityIndex++,
              'Entity': cls.name
            };

            currentDept.stages.forEach(stage => {
              const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id);
              const isApplicable = stageAllocation?.applicable ?? true;
              const isDisplayed = stageAllocation?.display ?? true;

              rowData[`${stage.name} - Stage Name`] = stage.name;
              rowData[`${stage.name} - Duration`] = minutesToTimeString(stage.estimated_time);
              rowData[`${stage.name} - Follow Up`] = stage.follow_up || '-';
              rowData[`${stage.name} - Applicable`] = isApplicable ? 'yes' : 'no';
              rowData[`${stage.name} - Display`] = isDisplayed ? 'yes' : 'no';
            });

            dataToExport.push(rowData);
          } else {
            // Class with subclasses
            cls.subClasses.forEach(subCls => {
              const rowData = {
                'Department': currentDept.name,
                '#': entityIndex++,
                'Entity': subCls.name
              };

              currentDept.stages.forEach(stage => {
                const stageAllocation = subCls.stages?.find(s => s.stage_id === stage.id);
                const isApplicable = stageAllocation?.applicable ?? true;
                const isDisplayed = stageAllocation?.display ?? true;

                rowData[`${stage.name} - Stage Name`] = stage.name;
                rowData[`${stage.name} - Duration`] = minutesToTimeString(stage.estimated_time);
                rowData[`${stage.name} - Follow Up`] = stage.follow_up || '-';
                rowData[`${stage.name} - Applicable`] = isApplicable ? 'yes' : 'no';
                rowData[`${stage.name} - Display`] = isDisplayed ? 'yes' : 'no';
              });

              dataToExport.push(rowData);
            });
          }
        });
      }
    });

    if (dataToExport.length === 0) {
      toast({
        title: "No Data to Export",
        description: "There is no applicable stage data for the currently visible entities.",
        variant: "destructive"
      });
      return;
    }

    // Create workbook with enhanced KYC-aware export
    const wb = XLSX.utils.book_new();

    // Create header structure exactly like the table
    const headerRows = [];

    // Row 1: Stage Names with KYC document count
    const stageNameRow = ['Department', '#', 'Entity'];
    currentDept.stages.forEach(stage => {
      const docCount = stage.documents?.length || 0;
      const kycCount = stage.documents?.filter(doc => doc.kycId).length || 0;
      const stageName = `${stage.order_num}. ${stage.name}${docCount > 0 ? ` (${kycCount}/${docCount} KYC)` : ''}`;
      stageNameRow.push(
        stageName,
        '', '', '', '' // Empty cells for merging
      );
    });
    headerRows.push(stageNameRow);

    // Row 2: Duration
    const durationRow = ['', '', 'Stage Name'];
    currentDept.stages.forEach(stage => {
      durationRow.push('Duration', '', '', '', '');
    });
    headerRows.push(durationRow);

    // Row 3: Follow Up
    const followUpRow = ['', '', 'Duration'];
    currentDept.stages.forEach(stage => {
      followUpRow.push(minutesToTimeString(stage.estimated_time), '', '', '', '');
    });
    headerRows.push(followUpRow);

    // Row 4: Applicable/Display headers
    const controlsRow = ['', '', 'Follow Up'];
    currentDept.stages.forEach(stage => {
      controlsRow.push(stage.follow_up || '-', 'Applicable', 'Display', '', '');
    });
    headerRows.push(controlsRow);

    // Create worksheet with proper structure
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header rows
    XLSX.utils.sheet_add_aoa(ws, headerRows, { origin: 'A1' });

    // Add data rows
    const dataRows = dataToExport.map(row => {
      const dataRow = [row['Department'], row['#'], row['Entity']];

      currentDept.stages.forEach(stage => {
        dataRow.push(
          row[`${stage.name} - Stage Name`],
          row[`${stage.name} - Duration`],
          row[`${stage.name} - Follow Up`],
          row[`${stage.name} - Applicable`],
          row[`${stage.name} - Display`]
        );
      });

      return dataRow;
    });

    XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: 'A5' });

    // Set up merges to match the table structure
    const merges = [];

    // Merge basic columns vertically (Department, #, Entity)
    merges.push({ s: { r: 0, c: 0 }, e: { r: 3, c: 0 } }); // Department
    merges.push({ s: { r: 0, c: 1 }, e: { r: 3, c: 1 } }); // #
    merges.push({ s: { r: 0, c: 2 }, e: { r: 3, c: 2 } }); // Entity

    // Merge stage headers
    let colIndex = 3;
    currentDept.stages.forEach(stage => {
      // Stage name spans 5 columns
      merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 4 } });
      // Duration spans 5 columns
      merges.push({ s: { r: 1, c: colIndex }, e: { r: 1, c: colIndex + 4 } });
      // Follow up spans 5 columns
      merges.push({ s: { r: 2, c: colIndex }, e: { r: 2, c: colIndex + 4 } });
      // Stage name, duration, follow up each get 1 column, then applicable and display
      colIndex += 5;
    });

    ws['!merges'] = merges;

    // Apply styling
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1D4ED8' } }, // Blue-700 background
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: '1E40AF' } },
        bottom: { style: 'thin', color: { rgb: '1E40AF' } },
        left: { style: 'thin', color: { rgb: '1E40AF' } },
        right: { style: 'thin', color: { rgb: '1E40AF' } }
      }
    };

    const subHeaderStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2563EB' } }, // Blue-600 background
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: '1E40AF' } },
        bottom: { style: 'thin', color: { rgb: '1E40AF' } },
        left: { style: 'thin', color: { rgb: '1E40AF' } },
        right: { style: 'thin', color: { rgb: '1E40AF' } }
      }
    };

    const stickyColumnStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1D4ED8' } }, // Blue-700 background
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thick', color: { rgb: '1E40AF' } },
        bottom: { style: 'thick', color: { rgb: '1E40AF' } },
        left: { style: 'thick', color: { rgb: '1E40AF' } },
        right: { style: 'thick', color: { rgb: '1E40AF' } }
      }
    };

    // Get range for styling
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Style header rows (0-3)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) ws[cellRef] = { v: '' };

        if (c < 3) {
          ws[cellRef].s = stickyColumnStyle; // Sticky columns
        } else {
          ws[cellRef].s = r === 0 ? headerStyle : subHeaderStyle;
        }
      }
    }

    // Style data rows with alternating colors
    for (let r = 4; r <= range.e.r; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) continue;

        const isOddRow = (r - 4) % 2 === 1;
        const isStickyColumn = c < 3;

        ws[cellRef].s = {
          border: {
            top: { style: 'thin', color: { rgb: 'D1D5DB' } },
            bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
            left: { style: 'thin', color: { rgb: 'D1D5DB' } },
            right: { style: 'thin', color: { rgb: 'D1D5DB' } }
          },
          fill: {
            fgColor: {
              rgb: isStickyColumn
                ? (isOddRow ? 'F1F5F9' : 'E2E8F0') // Slate colors for sticky columns
                : (isOddRow ? 'F9FAFB' : 'FFFFFF')   // Gray colors for data columns
            }
          },
          alignment: {
            vertical: 'center',
            horizontal: c < 3 ? 'left' : 'center'
          },
          font: {
            bold: isStickyColumn
          }
        };
      }
    }

    // Set column widths
    const colWidths = [];
    colWidths.push({ wch: 15 }); // Department
    colWidths.push({ wch: 5 });  // #
    colWidths.push({ wch: 25 }); // Entity

    // Stage columns
    for (let i = 0; i < currentDept.stages.length; i++) {
      colWidths.push({ wch: 20 }); // Stage name (wider for KYC info)
      colWidths.push({ wch: 10 }); // Duration
      colWidths.push({ wch: 10 }); // Follow up
      colWidths.push({ wch: 10 }); // Applicable
      colWidths.push({ wch: 10 }); // Display
    }

    ws['!cols'] = colWidths;

    // Freeze panes to simulate sticky headers (freeze first 4 rows and first 3 columns)
    ws['!freeze'] = { xSplit: 3, ySplit: 4 };

    // Add the worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Stages Overview');

    // Generate file with KYC indicator
    const kycDocCount = allKycDocuments.size;
    const fileName = `${currentDept.name}_Stages_Overview_KYC_${kycDocCount}_docs_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Export Successful",
      description: `Exported ${dataToExport.length} rows with ${currentDept.stages.length} stages and ${kycDocCount} KYC documents to Excel`,
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading stages and KYC documents...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <div className="text-red-500 mb-4">{error}</div>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  if (!currentDept) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-600">No department selected.</p>
      </div>
    )
  }

  const processedSubdepartments = getProcessedSubdepartments(currentDept)
  const normalizedSubdepartments = processedSubdepartments.length > 0
    ? processedSubdepartments
    : [{
      id: -1,
      name: 'No Subdepartments',
      department_id: currentDept.id,
      stages: [],
      hasClasses: false,
      classes: []
    }]

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Stages Management</h1>
            <p className="text-gray-600 mt-1">
              Configure workflow stages and their allocations 
              {kycDocumentsLoading ? (
                <span className="ml-2 text-blue-600">Loading KYC documents...</span>
              ) : (
                <span className="ml-2 text-green-600">
                  • {allKycDocuments.size} KYC documents loaded
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Expand/Collapse All Buttons */}
            <Button
              variant="outline"
              onClick={areAllRowsExpanded ? collapseAllRows : expandAllRows}
              className="flex items-center gap-2"
            >
              {areAllRowsExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Expand All
                </>
              )}
            </Button>

            {/* Entity Visibility Control */}
            <EntityVisibilityControl
              entities={entityVisibilityOptions}
              onVisibilityChange={handleEntityVisibilityChange}
              onShowAll={handleShowAllEntities}
              onHideAll={handleHideAllEntities}
              onResetToDefault={handleResetEntitiesToDefault}
              showDefaultDisplayOnly={showDefaultDisplayOnly}
              onToggleDefaultDisplay={() => setShowDefaultDisplayOnly(!showDefaultDisplayOnly)}
              title="Row Visibility"
              description="Control which departments, classes, and subclasses are visible"
            />

            <Button
              variant="outline"
              onClick={handleExportToExcel}
              disabled={!currentDept || !currentDept.stages || currentDept.stages.length === 0}
              className="flex items-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export to Excel
            </Button>

            <AddStageDialog
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              onAddStages={handleAddStages}
              departments={departmentList}
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            {departments.map(dept => (
              <TabsTrigger key={dept.id} value={dept.id}>
                {dept.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {departments.map(dept => (
            <TabsContent key={dept.id} value={dept.id} className="space-y-4">
              {dept.stages.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No stages yet</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Create your first stage to get started with the workflow
                  </p>
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Stage
                  </Button>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                    <Table className="min-w-max">
                      {/* Sticky Headers */}
                      <TableHeader className="sticky top-0 z-30">
                        {/* Stage Names Row */}
                        <TableRow className="border-b-0">
                          {columnVisibility.index && (
                            <TableHead className="sticky left-0 bg-blue-700 border-r-2 border-blue-500 font-bold w-16 z-40 text-center text-white" rowSpan={4}>
                              #
                            </TableHead>
                          )}
                          {columnVisibility.entity && (
                            <TableHead className={cn(
                              "sticky bg-blue-700 border-r-2 border-blue-500 font-bold w-64 z-40 text-white",
                              columnVisibility.index ? "left-16" : "left-0"
                            )} rowSpan={4}>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Department / Entity
                              </div>
                            </TableHead>
                          )}
                          {columnVisibility.stageName && (
                            <TableHead className={cn(
                              "sticky bg-blue-700 border-r-2 border-blue-500 z-20 text-white",
                              columnVisibility.index && columnVisibility.entity ? "left-80" :
                                columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                            )}>
                              Stage Name
                            </TableHead>
                          )}

                          {dept.stages.map((stage, index) => (
                            <TableHead
                              key={stage.id}
                              className="border-r border-blue-500 text-center font-bold text-white min-w-[200px] bg-blue-700"
                            >
                              <div className="flex flex-col items-center p-2 space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{stage.order_num}. {stage.name}</span>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                  {stage.documents && stage.documents.length > 0 && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 relative bg-purple-600 shadow-sm hover:bg-purple-700">
                                          <FileText className="h-3 w-3 text-white" />
                                          <Badge
                                            variant="secondary"
                                            className="absolute -top-1 -right-1 h-4 w-4 text-xs p-0 flex items-center justify-center rounded-full"
                                          >
                                            <div className="flex items-center justify-center h-full w-full">
                                              {stage.documents.length}
                                            </div>
                                          </Badge>
                                          {/* KYC sync indicator */}
                                          {stage.documents.some(doc => doc.kycId) && (
                                            <div className="absolute -bottom-1 -left-1 h-3 w-3 bg-green-500 rounded-full p-0.5 flex items-center justify-center">
                                              <span className="text-white text-xs font-bold">K</span>
                                            </div>
                                          )}
                                          {/* Special document indicator */}
                                          {stage.documents.some(doc => doc.isSpecial) && (
                                            <Star className="absolute -bottom-1 -left-1 h-3 w-3 text-amber-400 bg-white rounded-full p-0.5" />
                                          )}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-96 max-h-96 overflow-y-auto z-50">
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <h4 className="font-medium">Stage Documents</h4>
                                            <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-xs">
                                                {stage.documents.length} document{stage.documents.length > 1 ? 's' : ''}
                                              </Badge>
                                              {stage.documents.some(doc => doc.kycId) && (
                                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                                  {stage.documents.filter(doc => doc.kycId).length} KYC Synced
                                                </Badge>
                                              )}
                                              {stage.documents.some(doc => doc.isSpecial) && (
                                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                  <Star className="h-3 w-3 mr-1" />
                                                  {stage.documents.filter(doc => doc.isSpecial).length} Special
                                                </Badge>
                                              )}
                                            </div>
                                          </div>

                                          <div className="space-y-3">
                                            {stage.documents.map((doc, i) => (
                                              <DocumentDisplay key={doc.id || i} doc={doc} stage={stage} />
                                            ))}
                                          </div>

                                          <div className="pt-2 border-t">
                                            <p className="text-xs text-gray-500">
                                              Documents are automatically synced with the KYC system when stages are saved.
                                              {stage.documents.some(doc => doc.isSpecial) && (
                                                <span className="block mt-1 text-amber-600 font-medium">
                                                  ⭐ Special documents are entity-specific and will only appear for their target entities.
                                                </span>
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                  {/* Special Time Config Indicator */}
                                  {stage.isSpecial && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 bg-orange-500 hover:bg-orange-600 rounded">
                                          <Clock className="h-3 w-3 text-white" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-80 z-50">
                                        <div className="space-y-2">
                                          <h4 className="font-medium">Special Time Requirements</h4>
                                          <div className="text-sm text-gray-600">
                                            This stage has different time requirements based on application type:
                                          </div>
                                          <div className="space-y-2 mt-2">
                                            {stage.timeConfigs?.map((config, i) => (
                                              <div key={i} className="bg-gray-50 p-2 rounded text-sm">
                                                <div className="font-medium">{config.applicationType || 'Default'}</div>
                                                <div className="text-gray-600">
                                                  {config.days > 0 && `${config.days}d `}
                                                  {config.hours > 0 && `${config.hours}h `}
                                                  {config.minutes > 0 ? `${config.minutes}m` : ''}
                                                  {!config.days && !config.hours && !config.minutes ? '0m' : ''}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}

                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 hover:bg-white/20"
                                      onClick={() => moveStage(stage.id, 'up')}
                                      disabled={stage.order_num === 1}
                                    >
                                      <ChevronLeft className="h-3 w-3 text-white" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 hover:bg-white/20"
                                      onClick={() => moveStage(stage.id, 'down')}
                                      disabled={stage.order_num === dept.stages.length}
                                    >
                                      <ChevronRight className="h-3 w-3 text-white" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 hover:bg-white/20"
                                      onClick={() => setEditingStage(stage)}
                                    >
                                      <Pencil className="h-3 w-3 text-white" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>

                        {/* Duration Row */}
                        {columnVisibility.duration && (
                          <TableRow className="border-b-0">
                            {columnVisibility.stageName && (
                              <TableHead className={cn(
                                "sticky bg-blue-600 border-r-2 border-blue-400 z-20 text-white",
                                columnVisibility.index && columnVisibility.entity ? "left-80" :
                                  columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                              )}>
                                Duration
                              </TableHead>
                            )}
                            {dept.stages.map((stage, index) => (
                              <TableHead
                                key={`duration-${stage.id}`}
                                className="border-r border-blue-400 text-center bg-blue-600"
                              >
                                <div className="font-bold text-sm text-white py-2">
                                  {minutesToTimeString(stage.estimated_time)}
                                </div>
                              </TableHead>
                            )
                            )}
                          </TableRow>
                        )}

                        {/* Follow Up Row */}
                        {columnVisibility.followUp && (
                          <TableRow className="border-b-0">
                            {columnVisibility.stageName && (
                              <TableHead className={cn(
                                "sticky bg-blue-600 border-r-2 border-blue-400 z-20 text-white",
                                columnVisibility.index && columnVisibility.entity ? "left-80" :
                                  columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                              )}>
                                Follow Up
                              </TableHead>
                            )}
                            {dept.stages.map((stage, index) => (
                              <TableHead
                                key={`followup-${stage.id}`}
                                className="border-r border-blue-400 text-center bg-blue-600"
                              >
                                <div className="font-bold text-sm text-white py-2">
                                  {stage.follow_up || '-'}
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        )}

                        {/* Applicable/Display Headers Row */}
                        {columnVisibility.controls && (
                          <TableRow className="border-b-0">
                            {columnVisibility.stageName && (
                              <TableHead className={cn(
                                "sticky bg-slate-500 border-r-2 border-slate-300 z-20",
                                columnVisibility.index && columnVisibility.entity ? "left-80" :
                                  columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                              )}></TableHead>
                            )}
                            {dept.stages.map((stage, index) => (
                              <TableHead
                                key={`controls-${stage.id}`}
                                className="border-r border-slate-300 bg-slate-500"
                              >
                                <div className="grid grid-cols-2 gap-1 p-1">
                                  <div className="text-center text-xs font-medium text-white">
                                    Applicable
                                  </div>
                                  <div className="text-center text-xs font-medium text-white">
                                    Display
                                  </div>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        )}
                      </TableHeader>

                      <TableBody>
                        {normalizedSubdepartments.flatMap((subdept, subdeptIndex) => {
                          const subdeptRowId = `subdept-${subdept.id}`
                          const isExpanded = expandedRows.has(subdeptRowId)
                          const rows = []
                          let rowIndex = subdeptIndex + 1

                          const hasClasses = subdept.classes && subdept.classes.length > 0

                          rows.push(
                            <TableRow key={subdeptRowId} className="border-b border-slate-300">
                              {columnVisibility.index && (
                                <TableCell className="sticky left-0 bg-slate-100 border-r-2 border-slate-300 text-center text-sm z-10 font-medium">
                                  {rowIndex}
                                </TableCell>
                              )}
                              {columnVisibility.entity && (
                                <TableCell className={cn(
                                  "sticky bg-slate-100 border-r-2 border-slate-300 font-medium z-10",
                                  columnVisibility.index ? "left-16" : "left-0"
                                )}>
                                  <div className="flex justify-between items-center gap-2">
                                    <span className="font-semibold text-slate-800">{subdept.name}</span>
                                    {hasClasses && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 hover:bg-slate-300/50"
                                        onClick={() => toggleRowExpansion(subdeptRowId)}
                                      >
                                        {isExpanded ? (
                                          <Minus className="h-4 w-4 text-slate-600" />
                                        ) : (
                                          <Plus className="h-4 w-4 text-slate-600" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              {columnVisibility.stageName && (
                                <TableCell className={cn(
                                  "sticky bg-slate-100 border-r-2 border-slate-300 text-center text-sm z-10",
                                  columnVisibility.index && columnVisibility.entity ? "left-80" :
                                    columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                                )}></TableCell>
                              )}
                              {dept.stages.map((stage, stageIndex) => {
                                const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id)
                                const hasAllocation = stageAllocation?.applicable ?? true
                                const hasDisplay = stageAllocation?.display ?? true
                                const columnClass = stageIndex % 2 === 0 ? "bg-slate-50" : "bg-slate-100/80";

                                return (
                                  <TableCell
                                    key={`subdept-${subdept.id}-${stage.id}`}
                                    className={cn("border-x border-slate-200 p-0", columnClass)}
                                  >
                                    {!hasClasses ? (
                                      columnVisibility.controls && (
                                        <div className="grid grid-cols-2 gap-1 p-1">
                                          <div className="flex justify-center">
                                            <div
                                              className="w-full"
                                              data-subdept-id={subdept.id}
                                              data-stage-id={stage.id}
                                              onKeyDown={(e) => handleKeyDown(e, subdept.id, stage.id, !hasAllocation)}
                                            >
                                              <Select
                                                value={hasAllocation ? 'applicable' : 'not-applicable'}
                                                onValueChange={(value) => handleAllocationChangeInternal(subdept.id, stage.id, value === 'applicable')}
                                              >
                                                <SelectTrigger
                                                  className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-slate-200/50"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <SelectValue>
                                                    <div className="flex items-center gap-1">
                                                      <div className={`w-2 h-2 rounded-full ${hasAllocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                      <span className="ml-1 font-medium">{hasAllocation ? 'Yes' : 'No'}</span>
                                                    </div>
                                                  </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="applicable">
                                                    <div className="flex items-center gap-2">
                                                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                      <span>Applicable</span>
                                                    </div>
                                                  </SelectItem>
                                                  <SelectItem value="not-applicable">
                                                    <div className="flex items-center gap-2">
                                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                                      <span>Not Applicable</span>
                                                    </div>
                                                  </SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          </div>
                                          <div className="flex justify-center items-center">
                                            <Checkbox
                                              checked={hasDisplay}
                                              onCheckedChange={(checked) =>
                                                handleDisplayToggle(subdept.id, stage.id, checked as boolean)
                                              }
                                              disabled={!hasAllocation}
                                              className="h-4 w-4 text-blue-500"
                                            />
                                          </div>
                                        </div>
                                      )
                                    ) : (
                                      <div className="flex items-center justify-center p-2 text-gray-500">
                                        -
                                      </div>
                                    )}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          )

                          // Add class rows if expanded
                          if (isExpanded && hasClasses) {
                            subdept.classes?.forEach((cls, clsIndex) => {
                              const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
                              const classRowId = `class-${subdept.id}-${cls.id}`
                              const isClassExpanded = expandedRows.has(classRowId)

                              rows.push(
                                <TableRow key={classRowId} className="border-b border-gray-200">
                                  {columnVisibility.index && (
                                    <TableCell className="sticky left-0 bg-gray-50 border-r-2 border-gray-200 text-center text-sm z-10 font-semibold">
                                      {rowIndex}.{clsIndex + 1}
                                    </TableCell>
                                  )}
                                  {columnVisibility.entity && (
                                    <TableCell className={cn(
                                      "sticky bg-gray-50 border-r-2 border-gray-200 pl-8 z-10",
                                      columnVisibility.index ? "left-16" : "left-0"
                                    )}>
                                      <div className="flex justify-between items-center gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-gray-800">{cls.name}</span>
                                        </div>
                                        {hasSubClasses && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 hover:bg-gray-200"
                                            onClick={() => toggleRowExpansion(classRowId)}
                                          >
                                            {isClassExpanded ? (
                                              <Minus className="h-3 w-3 text-gray-600" />
                                            ) : (
                                              <Plus className="h-3 w-3 text-gray-600" />
                                            )}
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  )}

                                  {columnVisibility.stageName && (
                                    <TableCell className={cn(
                                      "sticky bg-gray-50 border-r-2 border-gray-200 text-center text-sm z-10",
                                      columnVisibility.index && columnVisibility.entity ? "left-80" :
                                        columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                                    )}></TableCell>
                                  )}
                                  {dept.stages.map((stage, stageIndex) => {
                                    const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id)
                                    const hasAllocation = stageAllocation?.applicable ?? true
                                    const hasDisplay = stageAllocation?.display ?? true
                                    const columnClass = stageIndex % 2 === 0 ? "bg-white" : "bg-gray-100/80";

                                    return (
                                      <TableCell
                                        key={`class-${subdept.id}-${cls.id}-${stage.id}`}
                                        className={cn("border-x border-gray-200 p-0", columnClass)}
                                      >
                                        {!hasSubClasses ? (
                                          columnVisibility.controls && (
                                            <div className="grid grid-cols-2 gap-1 p-1">
                                              <div className="flex justify-center">
                                                <Select
                                                  value={hasAllocation ? 'applicable' : 'not-applicable'}
                                                  onValueChange={(value) =>
                                                    handleAllocationChange(subdept.id, stage.id, value === 'applicable', clsIndex)
                                                  }
                                                >
                                                  <SelectTrigger className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-gray-200/50">
                                                    <SelectValue>
                                                      <div className="flex items-center gap-1">
                                                        <div className={`w-2 h-2 rounded-full ${hasAllocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                        <span className="font-medium">{hasAllocation ? 'Yes' : 'No'}</span>
                                                      </div>
                                                    </SelectValue>
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="applicable">
                                                      <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                        Applicable
                                                      </div>
                                                    </SelectItem>
                                                    <SelectItem value="not-applicable">
                                                      <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                                        Not Applicable
                                                      </div>
                                                    </SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                              <div className="flex justify-center items-center">
                                                <Checkbox
                                                  checked={hasDisplay}
                                                  onCheckedChange={(checked) =>
                                                    handleDisplayToggle(subdept.id, stage.id, checked as boolean, clsIndex)
                                                  }
                                                  disabled={!hasAllocation}
                                                  className="h-4 w-4 text-blue-500"
                                                />
                                              </div>
                                            </div>
                                          )
                                        ) : (
                                          <div className="flex items-center justify-center p-2 text-gray-500">
                                            -
                                          </div>
                                        )}
                                      </TableCell>
                                    )
                                  })}
                                </TableRow>
                              )

                              // Add subclass rows if class is expanded
                              if (isClassExpanded && hasSubClasses) {
                                cls.subClasses?.forEach((subCls, subClsIndex) => {
                                  rows.push(
                                    <TableRow key={`subclass-${subdept.id}-${cls.id}-${subCls.id}`} className="border-b border-gray-200">
                                      {columnVisibility.index && (
                                        <TableCell className="sticky left-0 bg-white border-r-2 border-gray-200 text-center text-sm z-10 font-semibold">
                                          {rowIndex}.{clsIndex + 1}.{subClsIndex + 1}
                                        </TableCell>
                                      )}
                                      {columnVisibility.entity && (
                                        <TableCell className={cn(
                                          "sticky bg-white border-r-2 border-gray-200 pl-16 z-10",
                                          columnVisibility.index ? "left-16" : "left-0"
                                        )}>
                                          <div className="flex items-center gap-2">
                                            <ChevronRight className="h-3 w-3 text-gray-500" />
                                            <span className="text-gray-700 text-sm font-medium">{subCls.name}</span>
                                          </div>
                                        </TableCell>
                                      )}

                                      {columnVisibility.stageName && (
                                        <TableCell className={cn(
                                          "sticky bg-white border-r-2 border-gray-200 text-center text-sm z-10",
                                          columnVisibility.index && columnVisibility.entity ? "left-80" :
                                            columnVisibility.index || columnVisibility.entity ? "left-64" : "left-0"
                                        )}></TableCell>
                                      )}
                                      {dept.stages.map((stage, stageIndex) => {
                                        const stageAllocation = subCls.stages?.find(s => s.stage_id === stage.id)
                                        const hasAllocation = stageAllocation?.applicable ?? true
                                        const hasDisplay = stageAllocation?.display ?? true
                                        const columnClass = stageIndex % 2 === 0 ? "bg-white" : "bg-gray-50/80";

                                        return (
                                          <TableCell
                                            key={`subclass-${subdept.id}-${cls.id}-${subCls.id}-${stage.id}`}
                                            className={cn("border-x border-gray-200 p-0", columnClass)}
                                          >
                                            {columnVisibility.controls && (
                                              <div className="grid grid-cols-2 gap-1 p-1">
                                                <div className="flex justify-center">
                                                  <Select
                                                    value={hasAllocation ? 'applicable' : 'not-applicable'}
                                                    onValueChange={(value) =>
                                                      handleAllocationChange(subdept.id, stage.id, value === 'applicable', clsIndex, subClsIndex)
                                                    }
                                                  >
                                                    <SelectTrigger className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-gray-200/50">
                                                      <SelectValue>
                                                        <div className="flex items-center gap-1">
                                                          <div className={`w-2 h-2 rounded-full ${hasAllocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                          <span className="font-medium">{hasAllocation ? 'Yes' : 'No'}</span>
                                                        </div>
                                                      </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="applicable">
                                                        <div className="flex items-center gap-2">
                                                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                          Applicable
                                                        </div>
                                                      </SelectItem>
                                                      <SelectItem value="not-applicable">
                                                        <div className="flex items-center gap-2">
                                                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                                          Not Applicable
                                                        </div>
                                                      </SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div className="flex justify-center items-center">
                                                  <Checkbox
                                                    checked={hasDisplay}
                                                    onCheckedChange={(checked) =>
                                                      handleDisplayToggle(subdept.id, stage.id, checked as boolean, clsIndex, subClsIndex)
                                                    }
                                                    disabled={!hasAllocation}
                                                    className="h-4 w-4 text-blue-500"
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </TableCell>
                                        )
                                      })}
                                    </TableRow>
                                  )
                                })
                              }
                            })
                          }

                          return rows
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <EditStageDialog
          open={!!editingStage}
          onOpenChange={(open) => {
            if (!open) {
              setEditingStage(null)
              setIsEditDialogOpen(false)
            }
          }}
          stage={editingStage}
          onSave={handleUpdateStage}
        />
      </div>
    </div>
  )
}