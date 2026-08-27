// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, Info, Minus, Plus, Clock, FileText, ChevronLeft, ChevronRight, FileSpreadsheet, ChevronDown, ChevronUp, Star, RotateCcw, RotateCw, Trash2, Zap, Settings, Users, Link2, ArrowDownCircle, Search, X } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { AddStageDialog } from "./components/add-stage-dialog"
import { EditStageDialog } from "./components/edit-stage-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import type { Department, Stage, DepartmentOption } from "./stagesdb"
import ColumnVisibilityControl, { type ColumnVisibilityOption } from "../main-shared-components/column-visibility"
import EntityVisibilityControl, { type EntityVisibilityOption } from "../main-shared-components/entity-visibility"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"
import { toast } from "@/lib/hooks/use-toast"
import { saveAs } from "file-saver"
import { userService, DisplayUser, getOfficerDisplayName } from "@/lib/shared-user-assignment-service"

// Simple UUID generator for client-side use
const generateId = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Enhanced recursive helper to transform KYC fields, handling nested arrays
const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []
  return fields.map((field: any) => {
    // Check for array type more comprehensively
    const isArray = field.type === "array" || field.isArray === true
    const transformedField: any = {
      id: field.id || field.fieldName || "",
      fieldName: field.name || field.fieldName || "",
      description: field.description || "",
      isRequired: field.isRequired !== false,
      fieldType: isArray ? "array" : field.type || field.fieldType || "text",
      parentField: field.parentField,
      isArray: isArray,
    }

    // Handle array configuration for nested fields
    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems || 10,
        // Recursive call for nested fields
        fields: transformKycFields(field.arrayConfig.fields),
      }
    }

    return transformedField
  })
}

const minutesToTimeString = (minutes: number | null): string => {
  if (minutes === null || minutes === 0) return "0m"
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0) parts.push(`${mins}m`)
  return parts.join(" ") || "0m"
}

// Promised Time — id-based key, mirrors buildLeafEntitiesRaw's leaf identity (subdept/class/
// subclass ids), never a filtered-array position. Kept as a pure top-level function (no
// closure over component state) so it never needs to appear in a dependency array.
const promisedTimeKey = (subdeptId: number, classId: number | string | null, subclassId: number | string | null) =>
  `${subdeptId}:${classId ?? "null"}:${subclassId ?? "null"}`

const sortByOrder = <T extends { order?: number; order_num?: number }>(items: T[]): T[] => {
  return [...items].sort((a, b) => (a.order || a.order_num || 0) - (b.order || b.order_num || 0))
}

const filterByDefaultDisplay = <T extends { default_display?: boolean }>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items
  // Ensure we only keep items where default_display is explicitly true
  return items.filter((item) => item.default_display === true)
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
  const [isTransposed, setIsTransposed] = useState(false)
  const [allKycDocuments, setAllKycDocuments] = useState<Map<string, any>>(new Map())
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map())
  const [kycDocumentsLoading, setKycDocumentsLoading] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState({ index: true, entity: true, stageName: true, duration: true, followUp: true, status: true, controls: true })
  const [isRecalculatingExpectedTimes, setIsRecalculatingExpectedTimes] = useState(false)
  const [entityVisibility, setEntityVisibility] = useState<Record<string, boolean>>({})
  const [userData, setUserData] = useState<{
    officers: DisplayUser[];
    managers: DisplayUser[];
    assistants: DisplayUser[];
    allUsers: DisplayUser[];
  }>({ officers: [], managers: [], assistants: [], allUsers: [] })
  const [standardPage, setStandardPage] = useState(1)
  const [standardPageSize, setStandardPageSize] = useState(25)
  // Promised Time: manually entered per job level (subdept/class/subclass leaf), keyed by
  // `${subdeptId}:${classId ?? 'null'}:${subclassId ?? 'null'}` — plain id-based keys, not
  // array positions, so this stays correct regardless of entity-visibility filtering.
  // `defaultMinutes` applies when the task's Application Type doesn't match any condition;
  // `conditions` lets staff give a different Promised Time per Application Type value
  // (Renewal/New/whatever they type in) — Summary Reports resolves the task's own
  // application_type against these to pick the right Promised Time.
  const [promisedTimeByJobLevel, setPromisedTimeByJobLevel] = useState<
    Map<string, { defaultMinutes: number | null; conditions: { value: string; minutes: number }[] }>
  >(new Map())
  const [savingPromisedTimeKey, setSavingPromisedTimeKey] = useState<string | null>(null)
  const [stageSearchQuery, setStageSearchQuery] = useState("")

  const currentDept = departments.find((d) => d.id === activeTab)
  const filteredStages = useMemo(() => {
    if (!currentDept?.stages) return []
    if (!stageSearchQuery.trim()) return currentDept.stages
    const q = stageSearchQuery.toLowerCase()
    return currentDept.stages.filter((stage) =>
      stage.name?.toLowerCase().includes(q) ||
      stage.description?.toLowerCase().includes(q) ||
      stage.id?.toString().includes(q)
    )
  }, [currentDept?.stages, stageSearchQuery])

  const getEntityAutomation = (stage: Stage, entityKey: string) => {
    if (!stage.documents) return null;

    // Search through all documents in the stage
    for (const doc of stage.documents) {
      if (doc.targetEntities && Array.isArray(doc.targetEntities)) {
        // Find the specific entity in this document's target list
        const match = doc.targetEntities.find(te => {
          // Construct the key from the nested job_level to compare
          const teKey = te.job_level ?
            `${te.job_level.subdepartment_id}:${te.job_level.class_id || 0}:${te.job_level.subclass_id || 0}` :
            "";
          return teKey === entityKey;
        });

        if (match?.automationId) {
          return {
            automationId: match.automationId,
            docName: doc.name
          };
        }
      }
    }
    return null;
  };

  // Updated: Check if the stage has any automation configured for any entity
  const hasAnyAutomation = (stage: Stage) => {
    return stage.documents?.some(doc =>
      doc.targetEntities?.some(te => !!te.automationId)
    );
  };

  // Enhanced function to get KYC fields for a document
  const getKycFields = useCallback(
    (doc: any) => {
      if (!doc.kycId) {
        // Fallback to extractionSpecs only if no kycId is provided
        console.warn(`Document ${doc.name || "Unknown"} has no kycId, falling back to extractionSpecs`)
        return transformKycFields(doc.extractionSpecs || [])
      }

      const kycDoc = kycDocuments.get(doc.kycId)
      if (!kycDoc) {
        console.warn(`KYC document not found for kycId: ${doc.kycId}`)
        return transformKycFields(doc.extractionSpecs || [])
      }

      return kycDoc.fields || []
    },
    [kycDocuments],
  )
  // Enhanced function to get document information from KYC
  const getDocumentInfo = useCallback(
    (doc: any) => {
      if (!doc.kycId) {
        return {
          displayName: doc.name || "Unknown Document",
          documentType: doc.documentType || "document",
          category: doc.category || "",
          subcategory: doc.subcategory || "",
          isKycSynced: false,
          kycDoc: null,
        }
      }

      const kycDoc = allKycDocuments.get(doc.kycId)
      if (!kycDoc) {
        console.warn(`KYC document not found for kycId: ${doc.kycId}`)
        return {
          displayName: doc.name || "Unknown Document",
          documentType: doc.documentType || "document",
          category: doc.category || "",
          subcategory: doc.subcategory || "",
          isKycSynced: false,
          kycDoc: null,
        }
      }

      return {
        displayName: kycDoc.display_name || kycDoc.name || doc.name || "Unknown Document",
        documentType: kycDoc.document_type || doc.documentType || "document",
        category: kycDoc.category || doc.category || "",
        subcategory: kycDoc.subcategory || doc.subcategory || "",
        isKycSynced: true,
        kycDoc: kycDoc,
      }
    },
    [allKycDocuments],
  )

  // Enhanced document display component using KYC data exclusively
  const DocumentDisplay = useCallback(
    ({ doc, stage }: { doc: any; stage: any }) => {
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
            console.error("Error loading KYC fields:", error)
            setKycFields([])
          } finally {
            setFieldsLoading(false)
          }
        }

        loadKycFields()
      }, [doc, getKycFields])

      const renderArrayField = (field: any, depth = 0) => {
        const indentClass = depth > 0 ? `ml-${depth * 4}` : ""

        return (
          <div
            key={field.id}
            className={cn("bg-white p-3 rounded-lg border-l-4 border-purple-400 space-y-2", indentClass)}
          >
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

            {field.description && <div className="text-gray-600 text-xs">{field.description}</div>}

            {/* Array sub-fields */}
            {field.arrayConfig?.fields && field.arrayConfig.fields.length > 0 && (
              <div className="space-y-2 border-l-2 border-gray-200 pl-3 ml-2">
                <div className="text-xs font-medium text-gray-500 mb-2">
                  Array contains {field.arrayConfig.fields.length} field
                  {field.arrayConfig.fields.length !== 1 ? "s" : ""}:
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
                      {subField.description && <div className="text-gray-600">{subField.description}</div>}
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
          {field.description && <div className="text-gray-600">{field.description}</div>}
        </div>
      )

      return (
        <div
          className={cn(
            "p-3 rounded-lg space-y-3",
            doc.isSpecial ? "bg-amber-50 border border-amber-200" : "bg-gray-50",
          )}
        >
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
                    {doc.targetEntities && doc.targetEntities.length > 0 && (
                      <div className="space-y-1 mt-2 pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                          <Users className="h-3 w-3" />
                          <span>Target Entities & Automations:</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {doc.targetEntities.map((entity, entityIndex) => (
                            <div key={entityIndex} className="flex items-center justify-between bg-white p-1.5 rounded border text-[10px]">
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-slate-700">{entity.entityName}</span>
                                <Badge variant="outline" className="px-1 py-0 h-3 text-[8px] uppercase">
                                  {entity.job_level?.level ? `L${entity.job_level.level}` : entity.entityType}
                                </Badge>
                              </div>
                              {entity.automationId ? (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 h-4 px-1 gap-0.5">
                                  <Zap className="h-2 w-2 fill-amber-700" />
                                  Auto
                                </Badge>
                              ) : (
                                <span className="text-slate-400">Manual</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {doc.description && <div className="text-gray-600 text-xs">{doc.description}</div>}
          {doc.docType && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Info className="h-3 w-3" />
                <span>Document Type:</span>
              </div>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {doc.docType}
              </Badge>
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
                {documentInfo.isKycSynced ? "KYC Fields" : "Legacy Fields"} ({kycFields.length})
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
          ) : doc.kycId ? (
            <div className="text-xs text-gray-500 italic">
              No fields configured for this KYC document (ID: {doc.kycId}).
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">No field specifications available for this document.</div>
          )}

          {/* Additional KYC metadata if available */}
          {documentInfo.kycDoc && (
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-500 space-y-1">
                {documentInfo.kycDoc.validity_days && <div>Validity: {documentInfo.kycDoc.validity_days} days</div>}
                {documentInfo.kycDoc.reminder_days && (
                  <div>Reminder: {documentInfo.kycDoc.reminder_days} days before expiry</div>
                )}
                {documentInfo.kycDoc.main_category && <div>Category: {documentInfo.kycDoc.main_category}</div>}
              </div>
            </div>
          )}
        </div>
      )
    },
    [getKycFields, getDocumentInfo],
  )

  const columnVisibilityOptions: ColumnVisibilityOption[] = useMemo(
    () => [
      {
        id: "index",
        label: "Index (#)",
        visible: columnVisibility.index,
        disabled: true, // Always show index
        isDefault: true,
        group: "Basic",
      },
      {
        id: "entity",
        label: isTransposed ? "Stage Info" : "Department / Entity",
        visible: columnVisibility.entity,
        disabled: true, // Always show entity
        isDefault: true,
        group: "Basic",
      },
      {
        id: "stageName",
        label: isTransposed ? "Stage Details" : "Stage Names",
        visible: columnVisibility.stageName,
        isDefault: true,
        group: "Stage Info",
      },
      {
        id: "duration",
        label: "Duration",
        visible: columnVisibility.duration,
        isDefault: true,
        group: "Stage Info",
      },
      {
        id: "followUp",
        label: "Follow Up",
        visible: columnVisibility.followUp,
        isDefault: true,
        group: "Stage Info",
      },
      {
        id: "status",
        label: "Status",
        visible: columnVisibility.status,
        isDefault: true,
        group: "Stage Info",
      },
      {
        id: "controls",
        label: "Controls (Applicable/Display)",
        visible: columnVisibility.controls,
        isDefault: true,
        group: "Controls",
      },
    ],
    [columnVisibility, isTransposed],
  )

  const entityVisibilityOptions: EntityVisibilityOption[] = useMemo(() => {
    const currentDept = departments.find((d) => d.id === activeTab)
    if (!currentDept) return []

    const entities: EntityVisibilityOption[] = []

    // Use sortByOrder to maintain consistent ordering
    sortByOrder(currentDept.subdepartments || []).forEach((subdept) => {
      const subdeptId = `subdept-${subdept.id}`
      entities.push({
        id: subdeptId,
        name: subdept.name,
        type: "subdepartment",
        visible: entityVisibility[subdeptId] !== false,
        level: 0,
        path: subdept.name,
        hasChildren: !!(subdept.classes && subdept.classes.length > 0),
        default_display: subdept.default_display === true, // Read from API data
      })

      sortByOrder(subdept.classes || []).forEach((cls, clsIndex) => {
        const classId = `class-${subdept.id}-${cls.id || clsIndex}`
        entities.push({
          id: classId,
          name: cls.name,
          type: "class",
          parentId: subdeptId,
          visible: entityVisibility[classId] !== false,
          level: 1,
          path: `${subdept.name} → ${cls.name}`,
          hasChildren: !!(cls.subClasses && cls.subClasses.length > 0),
          default_display: cls.default_display === true, // Read from API data
        })

        sortByOrder(cls.subClasses || []).forEach((subCls, subClsIndex) => {
          const subclassId = `subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`
          entities.push({
            id: subclassId,
            name: subCls.name,
            type: "subclass",
            parentId: classId,
            visible: entityVisibility[subclassId] !== false,
            level: 2,
            path: `${subdept.name} → ${cls.name} → ${subCls.name}`,
            default_display: subCls.default_display === true, // Read from API data
          })
        })
      })
    })

    return entities
  }, [departments, activeTab, entityVisibility])

  useEffect(() => {
    if (entityVisibilityOptions.length > 0 && Object.keys(entityVisibility).length === 0) {
      const initialVisibility: Record<string, boolean> = {}
      entityVisibilityOptions.forEach((entity) => {
        // Initialize with default_display value instead of always true
        initialVisibility[entity.id] = entity.default_display === true
      })
      setEntityVisibility(initialVisibility)
    }
  }, [entityVisibilityOptions])

  useEffect(() => {
    setStandardPage(1)
  }, [activeTab])

  const handleColumnVisibilityChange = (columnId: string, visible: boolean) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [columnId]: visible,
    }))
  }

  const handleShowAllColumns = () => {
    setColumnVisibility({
      index: true,
      entity: true,
      stageName: true,
      duration: true,
      followUp: true,
      status: true,
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
      status: false,
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
      status: true,
      controls: true,
    })
  }

  const handleEntityVisibilityChange = (entityId: string, visible: boolean) => {
    setEntityVisibility((prev) => ({
      ...prev,
      [entityId]: visible,
    }))
  }

  const handleShowAllEntities = () => {
    const newVisibility: Record<string, boolean> = {}
    entityVisibilityOptions.forEach((entity) => {
      newVisibility[entity.id] = true
    })
    setEntityVisibility(newVisibility)
  }

  const handleHideAllEntities = () => {
    const newVisibility: Record<string, boolean> = {}
    entityVisibilityOptions.forEach((entity) => {
      newVisibility[entity.id] = false
    })
    setEntityVisibility(newVisibility)
  }

  const handleResetEntitiesToDefault = () => {
    const newVisibility: Record<string, boolean> = {}
    entityVisibilityOptions.forEach((entity) => {
      newVisibility[entity.id] = entity.default_display === true
    })
    setEntityVisibility(newVisibility)
  }

  const handleKeyDown = (e: React.KeyboardEvent, subdeptId: number, stageId: string, shouldAllocate: boolean) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAllocationChangeInternal(subdeptId, stageId, shouldAllocate)
    }
  }

  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows((prev) => {
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
    return departments.find((d) => d.id === activeTab)
  }

  const getProcessedSubdepartments = useCallback((dept: Department) => {
    if (!dept?.subdepartments) return []

    let subdepartments = sortByOrder(dept.subdepartments)

    // First, filter based on the global "Show Default Only" toggle
    if (showDefaultDisplayOnly) {
      subdepartments = filterByDefaultDisplay(subdepartments, true)
    }

    // Then, filter based on individual visibility settings
    subdepartments = subdepartments.filter((subdept) => {
      const subdeptId = `subdept-${subdept.id}`
      return entityVisibility[subdeptId] !== false
    })

    // Process classes and subclasses within each visible subdepartment
    return subdepartments.map((subdept) => {
      let classes = sortByOrder(subdept.classes || [])

      if (showDefaultDisplayOnly) {
        classes = filterByDefaultDisplay(classes, true)
      }

      classes = classes.filter((cls, clsIndex) => {
        const classId = `class-${subdept.id}-${cls.id || clsIndex}`
        return entityVisibility[classId] !== false
      })

      return {
        ...subdept,
        classes: classes.map((cls, clsIndex) => {
          let subClasses = sortByOrder(cls.subClasses || [])

          if (showDefaultDisplayOnly) {
            subClasses = filterByDefaultDisplay(subClasses, true)
          }

          subClasses = subClasses.filter((subCls, subClsIndex) => {
            const subclassId = `subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`
            return entityVisibility[subclassId] !== false
          })

          return { ...cls, subClasses }
        }),
      }
    })
  }, [showDefaultDisplayOnly, entityVisibility, departments, activeTab]);

  const getLeafEntities = (dept: Department) => {
    const processedSubdepartments = getProcessedSubdepartments(dept)
    const leafEntities: Array<{
      id: string
      name: string
      type: "subdepartment" | "class" | "subclass"
      subdeptId: number
      classIndex?: number
      subclassIndex?: number
      classId?: number | string | null
      subclassId?: number | string | null
      path: string
      default_display: boolean // Add this property
    }> = []

    processedSubdepartments.forEach((subdept, subdeptIndex) => {
      const hasClasses = subdept.classes && subdept.classes.length > 0

      if (!hasClasses) {
        leafEntities.push({
          id: `subdept-${subdept.id}`,
          name: subdept.name,
          type: "subdepartment",
          subdeptId: subdept.id,
          path: subdept.name,
          default_display: subdept.default_display === true, // Include default_display
        })
      } else {
        subdept.classes.forEach((cls, clsIndex) => {
          const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
          if (!hasSubClasses) {
            leafEntities.push({
              id: `class-${subdept.id}-${cls.id || clsIndex}`,
              name: cls.name,
              type: "class",
              subdeptId: subdept.id,
              classIndex: clsIndex,
              // Stable id, captured from the already-filtered entity itself — the
              // fix consumers should use to locate this class in the RAW/unfiltered
              // data instead of reusing this filtered-array position as an index
              // into it (that mismatch is what silently mutated the wrong class
              // whenever entity-visibility filters hid rows above it).
              classId: cls.id ?? null,
              path: `${subdept.name} → ${cls.name}`,
              default_display: cls.default_display === true, // Include default_display
            })
          } else {
            cls.subClasses.forEach((subCls, subClsIndex) => {
              leafEntities.push({
                id: `subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`,
                name: subCls.name,
                type: "subclass",
                subdeptId: subdept.id,
                classIndex: clsIndex,
                subclassIndex: subClsIndex,
                classId: cls.id ?? null,
                subclassId: subCls.id ?? null,
                path: `${subdept.name} → ${cls.name} → ${subCls.name}`,
                default_display: subCls.default_display === true, // Include default_display
              })
            })
          }
        })
      }
    })
    return leafEntities
  }

  const expandAllRows = () => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const rowIds = new Set<string>()

    if (isTransposed) {
      // In transposed view, we might want to expand stage documents
      currentDept.stages.forEach((stage) => {
        if (stage.documents && stage.documents.length > 0) {
          rowIds.add(`stage-${stage.id}`)
        }
      })
    } else {
      // Get all potential row IDs for normal view
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
    }

    setExpandedRows(rowIds)
  }

  const collapseAllRows = () => {
    setExpandedRows(new Set())
  }

  // Check if all expandable rows are expanded
  const areAllRowsExpanded = useMemo(() => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return false

    if (isTransposed) {
      // For transposed view, check if all stages with documents are expanded
      const stagesWithDocs = currentDept.stages.filter((stage) => stage.documents && stage.documents.length > 0)
      return stagesWithDocs.length > 0 && stagesWithDocs.every((stage) => expandedRows.has(`stage-${stage.id}`))
    } else {
      // For normal view
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
    }
  }, [expandedRows, departments, activeTab, getProcessedSubdepartments, isTransposed])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const { data: deptsData, error: deptsError } = await supabase
          .from("tm_departments")
          .select(`
            *,
            tm_subdepartments (
              *,
              classes
            )
          `)
          .order("order", { ascending: true })

        if (deptsError) throw deptsError

        // Transform and sort the data properly
        const transformedDepartments = (deptsData || []).map((dept) => ({
          ...dept,
          stages: dept.stages ? (Array.isArray(dept.stages) ? sortByOrder(dept.stages) : []) : [],
          subdepartments: sortByOrder(
            (dept.tm_subdepartments || []).map((subdept: any) => ({
              ...subdept,
              stages: Array.isArray(subdept.stages) ? subdept.stages : [],
              classes: sortByOrder(
                Array.isArray(subdept.classes)
                  ? subdept.classes.map((cls: any) => ({
                    ...cls,
                    subClasses: sortByOrder(Array.isArray(cls.subClasses) ? cls.subClasses : []),
                  }))
                  : [],
              ),
              hasClasses: subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0,
            })),
          ),
        }))

        // Sort departments by order
        const sortedDepartments = sortByOrder(transformedDepartments)
        setDepartments(sortedDepartments)

        // Load officer data
        try {
          const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, sortedDepartments)
          setUserData(unifiedUserData)
        } catch (error) {
          console.error('Failed to load users:', error)
        }

        if (sortedDepartments.length > 0) {
          setActiveTab(sortedDepartments[0].id)
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load data. Please try again.");
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const departmentList = useMemo(
    (): DepartmentOption[] =>
      departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
      })),
    [departments],
  )

  const handleAllocationChangeInternal = async (subdeptId: number, stageId: string, shouldAllocate: boolean) => {
    return handleAllocationChange(subdeptId, stageId, shouldAllocate)
  }

  const handleAllocationChange = async (
    subdeptId: number,
    stageId: string,
    shouldAllocate: boolean,
    classId: number | string | null = null,
    subclassId: number | string | null = null,
  ) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ""
      let className = ""
      const stageName = currentDept.stages.find((s) => s.id === stageId)?.name || "this stage"

      if (classId !== null && subclassId !== null) {
        // Handle subclass allocation. Always locate the class/subclass by their stable id
        // within the RAW (unfiltered) subdepartment — never by a positional index, since
        // any caller's index could be a position within an entity-visibility-filtered list
        // that doesn't line up with this raw array once rows above it are hidden.
        const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
        const rawClass = subdept?.classes?.find((c: any) => c.id === classId)
        const rawSubClass = rawClass?.subClasses?.find((sc: any) => sc.id === subclassId)
        if (!subdept || !rawClass || !rawSubClass) {
          toast({
            title: "Error",
            description: "Subclass not found",
            variant: "destructive",
          })
          return
        }

        subdeptName = subdept.name
        className = rawClass.name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
        const updatedClass = updatedClasses.find((c: any) => c.id === classId)
        const updatedSubClass = updatedClass.subClasses.find((sc: any) => sc.id === subclassId)
        if (!updatedSubClass.stages) {
          updatedSubClass.stages = []
        }

        let stageAllocation = updatedSubClass.stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedSubClass.stages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { classes: updatedClasses }

        // Update parent class and subdepartment stages as well
        if (!updatedClass.stages) {
          updatedClass.stages = []
        }

        let classStageAllocation = updatedClass.stages.find((s: any) => s.stage_id === stageId)
        if (!classStageAllocation) {
          classStageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClass.stages.push(classStageAllocation)
        }

        classStageAllocation.applicable =
          shouldAllocate ||
          updatedClass.subClasses?.some((sc: any) =>
            sc.stages?.some((s: any) => s.stage_id === stageId && s.applicable),
          )

        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }

        subdeptStageAllocation.applicable =
          shouldAllocate || subdeptStages.some((s) => s.stage_id === stageId && s.applicable)
        updateData.stages = subdeptStages
      } else if (classId !== null) {
        // Handle class allocation — same id-based lookup as above.
        const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
        const rawClass = subdept?.classes?.find((c: any) => c.id === classId)
        if (!subdept || !rawClass) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive",
          })
          return
        }

        subdeptName = subdept.name
        className = rawClass.name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
        const updatedClass = updatedClasses.find((c: any) => c.id === classId)
        if (!updatedClass.stages) {
          updatedClass.stages = []
        }

        let stageAllocation = updatedClass.stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClass.stages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { classes: updatedClasses }

        // Also update subdepartment stages
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }

        subdeptStageAllocation.applicable =
          shouldAllocate || subdeptStages.some((s) => s.stage_id === stageId && s.applicable)
        updateData.stages = subdeptStages
      } else {
        // Handle subdepartment allocation
        const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive",
          })
          return
        }

        subdeptName = subdept.name

        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
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
      const { error } = await supabase.from("tm_subdepartments").update(updateData).eq("id", subdeptId)

      if (error) throw error

      // updateData only ever carries `classes` and/or `stages` — spread it over the
      // original subdept so recalcExpectedTimeTotals sees the freshly-updated allocation
      // arrays without waiting on the (async, same-tick-stale) setDepartments below.
      const originalSubdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
      recalcExpectedTimeTotals({
        departmentId: currentDept.id,
        stages: currentDept.stages,
        subdepartments: originalSubdept ? [{ ...originalSubdept, ...updateData }] : [],
        scope: { type: "subdepartment", subdeptId },
      })

      // Update local state
      setDepartments((prevDepartments) =>
        prevDepartments.map((dept) => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments:
              dept.subdepartments?.map((subdept) => {
                if (subdept.id !== subdeptId) return subdept

                if (classId !== null && subclassId !== null) {
                  // Update subclass
                  const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
                  const updatedClass = updatedClasses.find((c: any) => c.id === classId)
                  const updatedSubClass = updatedClass?.subClasses?.find((sc: any) => sc.id === subclassId)
                  if (!updatedClass || !updatedSubClass) return subdept
                  if (!updatedSubClass.stages) {
                    updatedSubClass.stages = []
                  }

                  let stageAllocation = updatedSubClass.stages.find((s: any) => s.stage_id === stageId)
                  if (!stageAllocation) {
                    stageAllocation = { stage_id: stageId, applicable: true, display: true }
                    updatedSubClass.stages.push(stageAllocation)
                  }

                  stageAllocation.applicable = shouldAllocate
                  if (!shouldAllocate) {
                    stageAllocation.display = false
                  }

                  return {
                    ...subdept,
                    classes: updatedClasses,
                  }
                } else if (classId !== null) {
                  // Update class
                  const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
                  const updatedClass = updatedClasses.find((c: any) => c.id === classId)
                  if (!updatedClass) return subdept
                  if (!updatedClass.stages) {
                    updatedClass.stages = []
                  }

                  let stageAllocation = updatedClass.stages.find((s: any) => s.stage_id === stageId)
                  if (!stageAllocation) {
                    stageAllocation = { stage_id: stageId, applicable: true, display: true }
                    updatedClass.stages.push(stageAllocation)
                  }

                  stageAllocation.applicable = shouldAllocate
                  if (!shouldAllocate) {
                    stageAllocation.display = false
                  }

                  const subdeptStages = [...(subdept.stages || [])]
                  let subdeptStageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
                  if (!subdeptStageAllocation) {
                    subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
                    subdeptStages.push(subdeptStageAllocation)
                  }

                  subdeptStageAllocation.applicable =
                    shouldAllocate || subdeptStages.some((s) => s.stage_id === stageId && s.applicable)

                  return {
                    ...subdept,
                    classes: updatedClasses,
                    stages: subdeptStages,
                  }
                }

                // Update subdepartment
                const subdeptStages = [...(subdept.stages || [])]
                let stageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
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
                  stages: subdeptStages,
                }
              }) || [],
          }
        }),
      )

      toast({
        title: "Success",
        description: `${stageName} has been ${shouldAllocate ? "applied to" : "removed from"} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
      })
    } catch (err) {
      console.error("Error updating allocation:", err)
      toast({
        title: "Error",
        description: "Failed to update allocation. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDisplayToggle = async (
    subdeptId: number,
    stageId: string,
    checked: boolean,
    classId: number | string | null = null,
    subclassId: number | string | null = null,
  ) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ""
      let className = ""
      const stageName = currentDept.stages.find((s) => s.id === stageId)?.name || "this stage"

      if (classId !== null && subclassId !== null) {
        // Handle subclass display toggle. Same id-based lookup into the RAW/unfiltered
        // data as handleAllocationChange — see the comment there for why this can't be a
        // positional index sourced from an entity-visibility-filtered render list.
        const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
        const rawClass = subdept?.classes?.find((c: any) => c.id === classId)
        const rawSubClass = rawClass?.subClasses?.find((sc: any) => sc.id === subclassId)
        if (!subdept || !rawClass || !rawSubClass) {
          toast({
            title: "Error",
            description: "Subclass not found",
            variant: "destructive",
          })
          return
        }

        subdeptName = subdept.name
        className = rawClass.name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
        const updatedClass = updatedClasses.find((c: any) => c.id === classId)
        const updatedSubClass = updatedClass.subClasses.find((sc: any) => sc.id === subclassId)
        if (!updatedSubClass.stages) {
          updatedSubClass.stages = []
        }

        let stageAllocation = updatedSubClass.stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedSubClass.stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }
      } else if (classId !== null) {
        // Handle class display toggle
        const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
        const rawClass = subdept?.classes?.find((c: any) => c.id === classId)
        if (!subdept || !rawClass) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive",
          })
          return
        }

        subdeptName = subdept.name
        className = rawClass.name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
        const updatedClass = updatedClasses.find((c: any) => c.id === classId)
        if (!updatedClass.stages) {
          updatedClass.stages = []
        }

        let stageAllocation = updatedClass.stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClass.stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }

        subdeptStageAllocation.display = checked || subdeptStages.some((s) => s.stage_id === stageId && s.display)
        updateData.stages = subdeptStages
      } else {
        // Handle subdepartment display toggle
        const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive",
          })
          return
        }

        subdeptName = subdept.name

        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { stages: subdeptStages }
      }

      // Update in Supabase
      const { error } = await supabase.from("tm_subdepartments").update(updateData).eq("id", subdeptId)

      if (error) throw error

      // Update local state
      setDepartments((prevDepartments) =>
        prevDepartments.map((dept) => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments:
              dept.subdepartments?.map((subdept) => {
                if (subdept.id !== subdeptId) return subdept

                if (classId !== null && subclassId !== null) {
                  const updatedClasses = JSON.parse(JSON.stringify(subdept.classes || []))
                  const updatedClass = updatedClasses.find((c: any) => c.id === classId)
                  const updatedSubClass = updatedClass?.subClasses?.find((sc: any) => sc.id === subclassId)
                  if (!updatedClass || !updatedSubClass) return subdept
                  if (!updatedSubClass.stages) {
                    updatedSubClass.stages = []
                  }

                  let stageAllocation = updatedSubClass.stages.find((s: any) => s.stage_id === stageId)
                  if (!stageAllocation) {
                    stageAllocation = { stage_id: stageId, applicable: true, display: true }
                    updatedSubClass.stages.push(stageAllocation)
                  }

                  stageAllocation.display = checked

                  return {
                    ...subdept,
                    classes: updatedClasses,
                  }
                } else if (classId !== null) {
                  const updatedClasses = JSON.parse(JSON.stringify(subdept.classes || []))
                  const updatedClass = updatedClasses.find((c: any) => c.id === classId)
                  if (!updatedClass) return subdept
                  if (!updatedClass.stages) {
                    updatedClass.stages = []
                  }

                  let stageAllocation = updatedClass.stages.find((s: any) => s.stage_id === stageId)
                  if (!stageAllocation) {
                    stageAllocation = { stage_id: stageId, applicable: true, display: true }
                    updatedClass.stages.push(stageAllocation)
                  }

                  stageAllocation.display = checked

                  const subdeptStages = [...(subdept.stages || [])]
                  let subdeptStageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
                  if (!subdeptStageAllocation) {
                    subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
                    subdeptStages.push(subdeptStageAllocation)
                  }

                  subdeptStageAllocation.display =
                    checked || subdeptStages.some((s) => s.stage_id === stageId && s.display)

                  return {
                    ...subdept,
                    classes: updatedClasses,
                    stages: subdeptStages,
                  }
                }

                const subdeptStages = [...(subdept.stages || [])]
                let stageAllocation = subdeptStages.find((s) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  subdeptStages.push(stageAllocation)
                }

                stageAllocation.display = checked

                return {
                  ...subdept,
                  stages: subdeptStages,
                }
              }) || [],
          }
        }),
      )

      toast({
        title: "Success",
        description: `Display setting updated for ${stageName} in ${className ? `${className} (${subdeptName})` : subdeptName}`,
      })
    } catch (err) {
      console.error("Error updating display setting:", err)
      toast({
        title: "Error",
        description: "Failed to update display setting. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Bulk version of handleDisplayToggle — sets `display` for every given stage_id on ONE
  // entity (subdept/class/subclass) in a single read-modify-write. Looping the single-stage
  // handler instead would race: each call re-reads component state fresh via getCurrentDepartment(),
  // so N sequential calls targeting the same entity within one event-handler execution would
  // each build their update from the same stale pre-loop snapshot, and the last write would
  // silently undo everything but its own change. Used by the "Default Display" column header's
  // bulk select/deselect-all checkbox, which only ever passes the currently-FILTERED stage ids
  // (filteredStages), so the bulk action respects whatever search/filter is in place.
  const handleBulkDisplayToggle = async (
    entity: { subdeptId: number; classId?: number | string | null; subclassId?: number | string | null },
    stageIds: string[],
    checked: boolean,
  ) => {
    if (stageIds.length === 0) return
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const { subdeptId, classId = null, subclassId = null } = entity
      const subdept = currentDept.subdepartments?.find((sd) => sd.id === subdeptId)
      if (!subdept) {
        toast({ title: "Error", description: "Subdepartment not found", variant: "destructive" })
        return
      }

      const ensureAllocation = (list: any[], stageId: string) => {
        let allocation = list.find((s: any) => s.stage_id === stageId)
        if (!allocation) {
          allocation = { stage_id: stageId, applicable: true, display: true }
          list.push(allocation)
        }
        return allocation
      }

      let updateData: any = {}

      if (classId !== null && subclassId !== null) {
        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes || []))
        const updatedClass = updatedClasses.find((c: any) => c.id === classId)
        const updatedSubClass = updatedClass?.subClasses?.find((sc: any) => sc.id === subclassId)
        if (!updatedClass || !updatedSubClass) {
          toast({ title: "Error", description: "Subclass not found", variant: "destructive" })
          return
        }
        if (!updatedSubClass.stages) updatedSubClass.stages = []
        stageIds.forEach((stageId) => {
          ensureAllocation(updatedSubClass.stages, stageId).display = checked
        })
        updateData = { classes: updatedClasses }
      } else if (classId !== null) {
        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes || []))
        const updatedClass = updatedClasses.find((c: any) => c.id === classId)
        if (!updatedClass) {
          toast({ title: "Error", description: "Class not found", variant: "destructive" })
          return
        }
        if (!updatedClass.stages) updatedClass.stages = []
        stageIds.forEach((stageId) => {
          ensureAllocation(updatedClass.stages, stageId).display = checked
        })

        const subdeptStages = [...(subdept.stages || [])]
        stageIds.forEach((stageId) => {
          const allocation = ensureAllocation(subdeptStages, stageId)
          allocation.display = checked || subdeptStages.some((s) => s.stage_id === stageId && s.display)
        })
        updateData = { classes: updatedClasses, stages: subdeptStages }
      } else {
        const subdeptStages = [...(subdept.stages || [])]
        stageIds.forEach((stageId) => {
          ensureAllocation(subdeptStages, stageId).display = checked
        })
        updateData = { stages: subdeptStages }
      }

      const { error } = await supabase.from("tm_subdepartments").update(updateData).eq("id", subdeptId)
      if (error) throw error

      setDepartments((prevDepartments) =>
        prevDepartments.map((dept) => {
          if (dept.id !== activeTab) return dept
          return {
            ...dept,
            subdepartments: dept.subdepartments?.map((sd) => (sd.id === subdeptId ? { ...sd, ...updateData } : sd)) || [],
          }
        }),
      )

      toast({
        title: "Success",
        description: `Default Display ${checked ? "enabled" : "disabled"} for ${stageIds.length} stage${stageIds.length === 1 ? "" : "s"}`,
      })
    } catch (err) {
      console.error("Error bulk-updating display setting:", err)
      toast({
        title: "Error",
        description: "Failed to update display settings. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleAddStages = async (stages: any[], departmentId: string) => {
    const currentDept = departments.find((d) => d.id === departmentId)
    if (!currentDept) {
      toast({
        title: "Error",
        description: "Department not found. Please try again.",
        variant: "destructive",
      })
      return
    }

    try {
      const newStagesData = stages
        .filter((stage) => stage.name.trim() !== "")
        .map((stage, index) => {
          if (stage.isSpecial) {
            const timeConfigs = Array.isArray(stage.timeConfigs)
              ? stage.timeConfigs.map((config) => ({
                applicationType: config.applicationType || "Default",
                days: Number(config.days) || 0,
                hours: Number(config.hours) || 0,
                minutes: Number(config.minutes) || 0,
              }))
              : []

            const firstConfig = timeConfigs[0] || { days: 0, hours: 0, minutes: 0 }
            const totalMinutes = firstConfig.days * 24 * 60 + firstConfig.hours * 60 + firstConfig.minutes

            return {
              id: generateId(),
              name: stage.name.trim(),
              description: stage.description || "",
              estimated_time: totalMinutes,
              order_num: currentDept.stages.length + index + 1,
              follow_up: stage.followUp === "none" ? null : (stage.followUp as "Client" | "Officer" | "BCL"),
              isSpecial: true,
              timeConfigs: timeConfigs.length > 0 ? timeConfigs : undefined,
              documents: stage.documents || [],
              allocations: {},
            }
          }

          const days = Number(stage.days) || 0
          const hours = Number(stage.hours) || 0
          const minutes = Number(stage.minutes) || 0
          const totalMinutes = days * 24 * 60 + hours * 60 + minutes

          return {
            id: generateId(),
            name: stage.name.trim(),
            description: stage.description || "",
            estimated_time: totalMinutes,
            order_num: currentDept.stages.length + index + 1,
            follow_up: stage.followUp === "none" ? null : (stage.followUp as "Client" | "Officer" | "BCL"),
            isSpecial: false,
            timeConfigs: undefined,
            documents: stage.documents || [],
            allocations: {},
          }
        })

      if (newStagesData.length === 0) {
        toast({
          title: "No valid stages to add",
          description: "Please enter at least one stage name",
          variant: "destructive",
        })
        return
      }

      const updatedStages = [...currentDept.stages, ...newStagesData]

      const { data: updatedDept, error: updateError } = await supabase
        .from("tm_departments")
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentDept.id)
        .select()
        .single()

      if (updateError) throw updateError

      setDepartments(
        departments.map((dept) => (dept.id === currentDept.id ? { ...dept, stages: updatedStages } : dept)),
      )
      recalcExpectedTimeTotals({
        departmentId: currentDept.id,
        stages: updatedStages,
        subdepartments: currentDept.subdepartments || [],
        scope: { type: "department" },
      })

      setIsDialogOpen(false)

      toast({
        title: "Success",
        description: `Added ${newStagesData.length} stage${newStagesData.length > 1 ? "s" : ""} successfully.`,
      })
    } catch (err) {
      console.error("Error adding stages:", err)
      toast({
        title: "Error",
        description: "Failed to add stages. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSaveAutomation = async (automation: any) => {
    try {
      // If there's an existing automation (editing)
      if (currentAutomation) {
        const { error } = await supabase
          .from('tm_automations')
          .update(automation)
          .eq('id', currentAutomation.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Automation updated successfully",
        });
      } else {
        // Creating a new automation
        const { data, error } = await supabase
          .from('tm_automations')
          .insert([automation])
          .select()
          .single();

        if (error) throw error;

        toast({
          title: "Success",
          description: "Automation created successfully",
        });
      }

      setIsAutomationDialogOpen(false);
      setCurrentAutomation(null);

      // TODO: Refresh automations list if needed

    } catch (error) {
      console.error('Error saving automation:', error);
      toast({
        title: "Error",
        description: "Failed to save automation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStage = async (updatedStage: Stage) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const updatedStages = currentDept.stages.map((s) => (s.id === updatedStage.id ? updatedStage : s))

      const { error } = await supabase
        .from("tm_departments")
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeTab)

      if (error) throw error

      setDepartments((prev) => prev.map((dept) => (dept.id === activeTab ? { ...dept, stages: updatedStages } : dept)))
      recalcExpectedTimeTotals({
        departmentId: activeTab,
        stages: updatedStages,
        subdepartments: currentDept.subdepartments || [],
        scope: { type: "department" },
      })

      toast({
        title: "Success",
        description: "Stage updated successfully",
      })

      setEditingStage(null)
      setIsEditDialogOpen(false)
    } catch (err) {
      console.error("Error updating stage:", err)
      toast({
        title: "Error",
        description: "Failed to update stage. Please try again.",
        variant: "destructive",
      })
    }
  }

  const moveStage = async (stageId: string, direction: "up" | "down") => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const currentStages = JSON.parse(JSON.stringify(currentDept.stages))
    const currentIndex = currentStages.findIndex((s: Stage) => s.id === stageId)

    if (currentIndex === -1) return

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentStages.length) return

    const newStages = [...currentStages]
    const [movedStage] = newStages.splice(currentIndex, 1)
    newStages.splice(newIndex, 0, movedStage)

    const updatedStages = newStages.map((stage: Stage, index: number) => ({
      ...stage,
      order_num: index + 1,
    }))

    try {
      const { data: currentDeptData, error: fetchError } = await supabase
        .from("tm_departments")
        .select("*")
        .eq("id", activeTab)
        .single()

      if (fetchError) throw fetchError

      const { error } = await supabase
        .from("tm_departments")
        .update({
          ...currentDeptData,
          stages: updatedStages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeTab)

      if (error) throw error

      setDepartments((prev) => prev.map((dept) => (dept.id === activeTab ? { ...dept, stages: updatedStages } : dept)))
    } catch (err) {
      console.error("Error moving stage:", err)
      toast({
        title: "Error",
        description: `Failed to move stage ${direction}. Please try again.`,
        variant: "destructive",
      })
    }
  }

  const deleteKYCDocument = async (kycId: string) => {
    try {
      const { error } = await supabase.from("acc_portal_kyc").delete().eq("id", kycId)

      if (error) throw error

      // Update local state
      setAllKycDocuments((prev) => {
        const newMap = new Map(prev)
        newMap.delete(kycId)
        return newMap
      })

      setKycDocuments((prev) => {
        const newMap = new Map(prev)
        newMap.delete(kycId)
        return newMap
      })

      toast({
        title: "Success",
        description: "KYC document deleted successfully",
      })
    } catch (err) {
      console.error("Error deleting KYC document:", err)
      toast({
        title: "Error",
        description: "Failed to delete KYC document. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!window.confirm("Are you sure you want to delete this stage? All associated document configurations will also be removed. This action cannot be undone.")) {
      return
    }

    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const stageToDelete = currentDept.stages.find((s) => s.id === stageId)
      if (!stageToDelete) return

      if (stageToDelete.documents) {
        await Promise.all(
          stageToDelete.documents.filter((doc) => doc.kycId).map((doc) => deleteKYCDocument(doc.kycId!)),
        )
      }

      const updatedStages = currentDept.stages
        .filter((s) => s.id !== stageId)
        .map((stage, index) => ({ ...stage, order_num: index + 1 }))

      const { error } = await supabase
        .from("tm_departments")
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeTab)

      if (error) throw error

      setDepartments((prev) => prev.map((dept) => (dept.id === activeTab ? { ...dept, stages: updatedStages } : dept)))
      recalcExpectedTimeTotals({
        departmentId: activeTab,
        stages: updatedStages,
        subdepartments: currentDept.subdepartments || [],
        scope: { type: "department" },
      })

      toast({
        title: "Success",
        description: `Stage "${stageToDelete.name}" and associated documents deleted successfully.`,
      })
    } catch (err) {
      console.error("Error deleting stage:", err)
      toast({
        title: "Error",
        description: "Failed to delete stage. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Raw (unfiltered) leaf-entity walk for the "Overall Expected Time" total — deliberately
  // NOT the same as getLeafEntities/getStageAllocation, which route through
  // getProcessedSubdepartments and apply UI-only filters (showDefaultDisplayOnly,
  // entityVisibility). The persisted total must reflect every job level regardless of what
  // happens to be visible in the current viewer's session.
  const buildLeafEntitiesRaw = (subdepartments: any[]): Array<{
    type: "subdepartment" | "class" | "subclass"
    subdeptId: number
    classId: number | null
    subclassId: number | null
    ownStages: any[]
  }> => {
    const leaves: Array<{ type: "subdepartment" | "class" | "subclass"; subdeptId: number; classId: number | null; subclassId: number | null; ownStages: any[] }> = []
    ;(subdepartments || []).forEach((subdept) => {
      const classes = subdept.classes || []
      if (classes.length === 0) {
        leaves.push({ type: "subdepartment", subdeptId: subdept.id, classId: null, subclassId: null, ownStages: subdept.stages || [] })
        return
      }
      classes.forEach((cls: any) => {
        const subClasses = cls.subClasses || []
        if (subClasses.length === 0) {
          leaves.push({ type: "class", subdeptId: subdept.id, classId: cls.id, subclassId: null, ownStages: cls.stages || [] })
          return
        }
        subClasses.forEach((subCls: any) => {
          leaves.push({ type: "subclass", subdeptId: subdept.id, classId: cls.id, subclassId: subCls.id, ownStages: subCls.stages || [] })
        })
      })
    })
    return leaves
  }

  const resolveStageApplicable = (entityStages: any[] | undefined, stageId: string): boolean => {
    return entityStages?.find((s: any) => s.stage_id === stageId)?.applicable ?? true
  }

  // Shared calc+persist for the "Overall Expected Time" total. Always call with the
  // handler's own freshly-built LOCAL data (never currentDept/getCurrentDepartment()),
  // since React state hasn't committed yet in the same tick as the mutation that triggered
  // this. This is a derived/cache write — it must never fail or block the caller's own
  // success path, hence the outer try/catch that only logs.
  const recalcExpectedTimeTotals = async ({
    departmentId,
    stages,
    subdepartments,
    scope,
  }: {
    departmentId: string | number
    stages: Stage[]
    subdepartments: any[]
    scope: { type: "subdepartment"; subdeptId: number } | { type: "department" }
  }): Promise<void> => {
    try {
      const allLeaves = buildLeafEntitiesRaw(subdepartments)
      const leaves = scope.type === "subdepartment" ? allLeaves.filter((l) => l.subdeptId === scope.subdeptId) : allLeaves
      if (leaves.length === 0) return

      const leavesWithTotals = leaves.map((leaf) => {
        const totalMinutes = stages.reduce((sum, stage) => {
          return resolveStageApplicable(leaf.ownStages, stage.id) ? sum + (stage.estimated_time || 0) : sum
        }, 0)
        const jobLevel = {
          department_id: Number(departmentId),
          subdepartment_id: Number(leaf.subdeptId),
          class_id: leaf.classId != null ? Number(leaf.classId) : null,
          subclass_id: leaf.subclassId != null ? Number(leaf.subclassId) : null,
          level: leaf.type === "subdepartment" ? 2 : leaf.type === "class" ? 3 : 4,
        }
        return { totalMinutes, jobLevel }
      })

      let existingQuery = supabase
        .from("tm_class_requirements")
        .select("id, job_level")
        .eq("job_level->>department_id", String(departmentId))
      if (scope.type === "subdepartment") {
        existingQuery = existingQuery.eq("job_level->>subdepartment_id", String(scope.subdeptId))
      }
      const { data: existingRows, error: fetchError } = await existingQuery
      if (fetchError) throw fetchError

      const keyPart = (v: any) => (v === null || v === undefined ? "null" : String(v))
      const findExisting = (jobLevel: any) =>
        (existingRows || []).find((row: any) => {
          const jl = row.job_level || {}
          return (
            keyPart(jl.subdepartment_id) === keyPart(jobLevel.subdepartment_id) &&
            keyPart(jl.class_id) === keyPart(jobLevel.class_id) &&
            keyPart(jl.subclass_id) === keyPart(jobLevel.subclass_id)
          )
        })

      await Promise.all(
        leavesWithTotals.map(async ({ totalMinutes, jobLevel }) => {
          const existing = findExisting(jobLevel)
          if (existing) {
            const { error } = await supabase
              .from("tm_class_requirements")
              .update({ expected_total_time_minutes: totalMinutes, updated_at: new Date().toISOString() })
              .eq("id", existing.id)
            if (error) throw error
          } else {
            const { error } = await supabase
              .from("tm_class_requirements")
              .insert({ job_level: jobLevel, expected_total_time_minutes: totalMinutes, created_at: new Date().toISOString() })
            if (error) throw error
          }
        }),
      )
    } catch (err) {
      console.error("Error recalculating expected time totals:", err)
    }
  }

  // Reconciles every leaf entity's stored total for the active department in one go —
  // also doubles as the backfill for job levels that existed before this feature shipped
  // (nothing else populates expected_total_time_minutes for those).
  const handleRecalculateExpectedTimes = async () => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return
    setIsRecalculatingExpectedTimes(true)
    try {
      const leafCount = buildLeafEntitiesRaw(currentDept.subdepartments || []).length
      await recalcExpectedTimeTotals({
        departmentId: currentDept.id,
        stages: currentDept.stages,
        subdepartments: currentDept.subdepartments || [],
        scope: { type: "department" },
      })
      toast({
        title: "Success",
        description: `Recalculated Overall Expected Time for ${leafCount} job level${leafCount === 1 ? "" : "s"}.`,
      })
    } catch (err) {
      console.error("Error recalculating expected times:", err)
      toast({
        title: "Error",
        description: "Failed to recalculate expected times. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsRecalculatingExpectedTimes(false)
    }
  }

  // Load every stored Promised Time for the active department whenever it changes —
  // unlike Overall Expected Time, this value isn't derivable from stages, so it has to be
  // read back from tm_class_requirements rather than recomputed client-side.
  useEffect(() => {
    if (!activeTab) return
    let cancelled = false

    const loadPromisedTimes = async () => {
      const { data, error } = await supabase
        .from("tm_class_requirements")
        .select("job_level, promised_time")
        .eq("job_level->>department_id", String(activeTab))

      if (cancelled) return
      if (error) {
        console.error("Error loading promised times:", error)
        return
      }

      const map = new Map<string, { defaultMinutes: number | null; conditions: { value: string; minutes: number }[] }>()
      ;(data || []).forEach((row: any) => {
        const jl = row.job_level || {}
        if (jl.subdepartment_id == null) return
        const pt = row.promised_time || {}
        const hasDefault = typeof pt.defaultMinutes === "number"
        const conditions = Array.isArray(pt.conditions)
          ? pt.conditions.filter((c: any) => c && typeof c.value === "string" && typeof c.minutes === "number")
          : []
        if (!hasDefault && conditions.length === 0) return
        map.set(promisedTimeKey(Number(jl.subdepartment_id), jl.class_id ?? null, jl.subclass_id ?? null), {
          defaultMinutes: hasDefault ? pt.defaultMinutes : null,
          conditions,
        })
      })
      setPromisedTimeByJobLevel(map)
    }

    loadPromisedTimes()
    return () => {
      cancelled = true
    }
  }, [activeTab])

  // Persists one leaf's Promised Time. `leaf` always carries the entity's real database
  // ids (never a filtered-array index — see getLeafEntities/getProcessedSubdepartments),
  // so this writes to the same job level the user is actually looking at regardless of
  // which entity-visibility filters happen to be active.
  //
  // Wrapped in useCallback (stable identity as long as activeTab doesn't change) because
  // PromisedTimeCell below depends on it and is itself memoized — see that component's
  // comment for why an unstable identity here would matter.
  const savePromisedTime = useCallback(async (
    leaf: { subdeptId: number; classId: number | string | null; subclassId: number | string | null; level: number },
    value: { defaultMinutes: number | null; conditions: { value: string; minutes: number }[] },
  ) => {
    const key = promisedTimeKey(leaf.subdeptId, leaf.classId, leaf.subclassId)
    setSavingPromisedTimeKey(key)
    try {
      const jobLevel = {
        department_id: Number(activeTab),
        subdepartment_id: Number(leaf.subdeptId),
        class_id: leaf.classId != null ? leaf.classId : null,
        subclass_id: leaf.subclassId != null ? leaf.subclassId : null,
        level: leaf.level,
      }

      const { data: existingRows, error: fetchError } = await supabase
        .from("tm_class_requirements")
        .select("id, job_level")
        .eq("job_level->>department_id", String(activeTab))
        .eq("job_level->>subdepartment_id", String(leaf.subdeptId))
      if (fetchError) throw fetchError

      const keyPart = (v: any) => (v === null || v === undefined ? "null" : String(v))
      const existing = (existingRows || []).find((row: any) => {
        const jl = row.job_level || {}
        return keyPart(jl.class_id) === keyPart(jobLevel.class_id) && keyPart(jl.subclass_id) === keyPart(jobLevel.subclass_id)
      })

      const payload = { promised_time: value }

      if (existing) {
        const { error } = await supabase
          .from("tm_class_requirements")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("tm_class_requirements")
          .insert({ job_level: jobLevel, ...payload, created_at: new Date().toISOString() })
        if (error) throw error
      }

      setPromisedTimeByJobLevel((prev) => {
        const next = new Map(prev)
        next.set(key, value)
        return next
      })

      toast({ title: "Success", description: "Promised time saved." })
    } catch (err) {
      console.error("Error saving promised time:", err)
      toast({
        title: "Error",
        description: "Failed to save promised time. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSavingPromisedTimeKey(null)
    }
  }, [activeTab])

  // Inline-editable "Promised Time" cell for a single leaf job level (subdept/class/subclass
  // with no children). Popover form mirrors EditStageDialog's days/hours/minutes inputs for
  // estimated_time, so entering a promised time uses the same UX as entering a stage duration.
  //
  // Wrapped in useCallback so its identity stays stable across unrelated re-renders of this
  // (very large, frequently-re-rendering) page. Without this, every row-expand, filter toggle,
  // or search keystroke elsewhere on the page would redefine PromisedTimeCell as a "new"
  // component type, and React would unmount+remount every instance of it — silently closing
  // any open popover and discarding whatever days/hours/minutes the user had half-typed.
  // (Same reasoning as DocumentDisplay above, which uses the same pattern.)
  const PromisedTimeCell = useCallback(({
    leaf,
  }: {
    leaf: { subdeptId: number; classId: number | string | null; subclassId: number | string | null; level: number }
  }) => {
    const key = promisedTimeKey(leaf.subdeptId, leaf.classId, leaf.subclassId)
    const stored = promisedTimeByJobLevel.get(key)
    const isSaving = savingPromisedTimeKey === key
    const [open, setOpen] = useState(false)
    // Default (fallback) Promised Time, as day/hour/minute inputs.
    const [days, setDays] = useState(0)
    const [hours, setHours] = useState(0)
    const [mins, setMins] = useState(0)
    // Per-Application-Type overrides — each row is its own day/hour/minute triple, so the
    // draft state is a flat array rather than reusing storedMinutes-style totals directly.
    const [conditions, setConditions] = useState<{ value: string; days: number; hours: number; mins: number }[]>([])

    const handleOpenChange = (next: boolean) => {
      if (next) {
        const total = stored?.defaultMinutes || 0
        setDays(Math.floor(total / (24 * 60)))
        setHours(Math.floor((total % (24 * 60)) / 60))
        setMins(total % 60)
        setConditions(
          (stored?.conditions || []).map((c) => ({
            value: c.value,
            days: Math.floor(c.minutes / (24 * 60)),
            hours: Math.floor((c.minutes % (24 * 60)) / 60),
            mins: c.minutes % 60,
          })),
        )
      }
      setOpen(next)
    }

    const updateCondition = (index: number, patch: Partial<{ value: string; days: number; hours: number; mins: number }>) => {
      setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
    }

    const removeCondition = (index: number) => {
      setConditions((prev) => prev.filter((_, i) => i !== index))
    }

    const addCondition = () => {
      setConditions((prev) => [...prev, { value: "", days: 0, hours: 0, mins: 0 }])
    }

    const handleSave = async () => {
      const defaultMinutes = days * 24 * 60 + hours * 60 + mins
      const resolvedConditions = conditions
        .filter((c) => c.value.trim() !== "")
        .map((c) => ({ value: c.value.trim(), minutes: c.days * 24 * 60 + c.hours * 60 + c.mins }))
      await savePromisedTime(leaf, { defaultMinutes: defaultMinutes > 0 ? defaultMinutes : null, conditions: resolvedConditions })
      setOpen(false)
    }

    const conditionCount = stored?.conditions?.length || 0

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full h-full px-2 py-1.5 text-sm font-semibold rounded transition-colors text-center flex items-center justify-center gap-1.5",
              stored?.defaultMinutes ? "text-emerald-700 hover:bg-emerald-50" : "text-slate-400 italic hover:bg-slate-100",
            )}
          >
            {stored?.defaultMinutes ? minutesToTimeString(stored.defaultMinutes) : "Set time"}
            {conditionCount > 0 && (
              <span className="not-italic text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                +{conditionCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-3" align="center">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Default Promised Time</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Input
                type="number"
                min="0"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 0)}
                className="h-8 text-center text-sm"
              />
              <Label className="block text-center text-[10px] text-muted-foreground mt-1">Days</Label>
            </div>
            <div>
              <Input
                type="number"
                min="0"
                max="23"
                value={hours}
                onChange={(e) => setHours(Math.min(23, parseInt(e.target.value) || 0))}
                className="h-8 text-center text-sm"
              />
              <Label className="block text-center text-[10px] text-muted-foreground mt-1">Hours</Label>
            </div>
            <div>
              <Input
                type="number"
                min="0"
                max="59"
                value={mins}
                onChange={(e) => setMins(Math.min(59, parseInt(e.target.value) || 0))}
                className="h-8 text-center text-sm"
              />
              <Label className="block text-center text-[10px] text-muted-foreground mt-1">Mins</Label>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 mb-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Conditions (by Application Type)
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-50" onClick={addCondition}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>

          {conditions.length === 0 ? (
            <p className="text-xs text-slate-400 italic mb-1">
              No conditions — every task at this job level uses the default above.
            </p>
          ) : (
            <div className="space-y-2 mb-1">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1.5">
                  <Input
                    placeholder="e.g. Renewal"
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    className="h-7 text-xs flex-1 min-w-0"
                  />
                  <Input
                    type="number"
                    min="0"
                    value={c.days}
                    onChange={(e) => updateCondition(i, { days: parseInt(e.target.value) || 0 })}
                    className="h-7 w-12 text-center text-xs px-1"
                    title="Days"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={c.hours}
                    onChange={(e) => updateCondition(i, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                    className="h-7 w-12 text-center text-xs px-1"
                    title="Hours"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={c.mins}
                    onChange={(e) => updateCondition(i, { mins: Math.min(59, parseInt(e.target.value) || 0) })}
                    className="h-7 w-12 text-center text-xs px-1"
                    title="Minutes"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-red-500 hover:bg-red-50"
                    onClick={() => removeCondition(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button size="sm" className="w-full mt-3 h-8 text-xs" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </PopoverContent>
      </Popover>
    )
  }, [promisedTimeByJobLevel, savingPromisedTimeKey, savePromisedTime])

  // Effect to fetch all KYC documents
  useEffect(() => {
    const fetchAllKycDocuments = async () => {
      try {
        setKycDocumentsLoading(true)

        // Fetch ALL KYC documents from acc_portal_kyc table
        const { data, error } = await supabase.from("acc_portal_kyc").select("*")

        if (error) throw error

        // Transform and cache all documents
        const documentsMap = new Map()
        data?.forEach((doc) => {
          const transformedDoc = {
            ...doc,
            fields: transformKycFields(doc.fields || []),
          }
          documentsMap.set(doc.id, transformedDoc)
        })

        setAllKycDocuments(documentsMap)
        console.log(`Loaded ${documentsMap.size} KYC documents`)
      } catch (error) {
        console.error("Error fetching KYC documents:", error)
        toast({
          title: "Warning",
          description: "Failed to load KYC documents. Some document information may be incomplete.",
          variant: "destructive",
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
    departments.forEach((dept) => {
      dept.subdepartments?.forEach((subdept) => {
        subdept.classes?.forEach((cls) => {
          cls.subClasses?.forEach((subCls) => {
            subCls.documents?.forEach((doc) => {
              if (doc.kycId) {
                allKycIds.add(doc.kycId)
              }
            })
          })
        })
      })
    })

    // Add stages documents too
    departments.forEach((dept) => {
      dept.stages?.forEach((stage) => {
        stage.documents?.forEach((doc) => {
          if (doc.kycId) {
            allKycIds.add(doc.kycId)
          }
        })
      })
    })

    // Filter and add only the required documents
    allKycIds.forEach((kycId) => {
      const doc = allKycDocuments.get(kycId)
      if (doc) {
        filteredDocuments.set(kycId, doc)
      }
    })

    setKycDocuments(filteredDocuments)
  }

  const styleCell = (cell: ExcelJS.Cell, customStyle: Partial<ExcelJS.Style> = {}) => {
    cell.font = { name: 'Calibri', size: 11, ...customStyle.font };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, ...customStyle.alignment };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD4D4D4' } },
      left: { style: 'thin', color: { argb: 'FFD4D4D4' } },
      right: { style: 'thin', color: { argb: 'FFD4D4D4' } },
      bottom: { style: 'thin', color: { argb: 'FFD4D4D4' } },
    };
    if (customStyle.fill) {
      cell.fill = customStyle.fill;
    }
  };

  // 3. REPLACE THE handleExportToExcel FUNCTION
  const handleExportToExcel = async () => {
    if (!currentDept) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const viewType = isTransposed ? "Transposed" : "Standard";
      const worksheet = workbook.addWorksheet(`${viewType} View`, {
        properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
      });

      // --- COMMON HEADER METADATA ---
      worksheet.mergeCells('A1:E1');
      worksheet.getCell('A1').value = `Stages: ${currentDept.name}`;
      worksheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };

      worksheet.mergeCells('A2:E2');
      worksheet.getCell('A2').value = `Export Date: ${new Date().toLocaleDateString()}`;
      worksheet.getCell('A2').font = { name: 'Calibri', size: 12 };

      // Set outline levels base
      worksheet.properties.outlineLevels = { row: 3, column: 0 };

      if (isTransposed) {
        // ==========================================
        // TRANSPOSED VIEW (Stages as Rows, Entities as Columns)
        // ==========================================
        const headerTree = buildHeaderTree(currentDept);
        const leafEntities = getLeafEntities(currentDept);

        // 1. Calculate Header Depth
        let maxDepth = 0;
        const findDepth = (nodes: any[], d: number) => {
          maxDepth = Math.max(maxDepth, d);
          nodes.forEach(n => n.children && findDepth(n.children, d + 1));
        };
        findDepth(headerTree, 1);

        const headerStartRow = 4;
        const totalHeaderRows = maxDepth + (columnVisibility.controls ? 1 : 0);
        const dataStartRow = headerStartRow + totalHeaderRows;

        // 2. Setup Fixed Columns (Index, Stage Name, Duration, Follow-up)
        let colIndex = 1;
        const fixedCols = [];
        if (columnVisibility.index) fixedCols.push({ header: '#', width: 6 });
        if (columnVisibility.entity) fixedCols.push({ header: 'Stage Name', width: 30 });
        if (columnVisibility.stageName) {
          fixedCols.push({ header: 'Duration', width: 12 });
          fixedCols.push({ header: 'Follow-up', width: 20 });
          fixedCols.push({ header: 'Actions', width: 15 });
        }

        fixedCols.forEach(fc => {
          worksheet.mergeCells(headerStartRow, colIndex, headerStartRow + totalHeaderRows - 1, colIndex);
          const cell = worksheet.getCell(headerStartRow, colIndex);
          cell.value = fc.header;
          worksheet.getColumn(colIndex).width = fc.width;
          styleCell(cell, {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } },
            alignment: { horizontal: 'center' }
          });
          colIndex++;
        });

        const entityStartCol = colIndex;

        // 3. Recursive Header Drawing & Column Outlining
        const drawHeader = (nodes: any[], currentRow: number, currentCol: number, level: number) => {
          let offset = 0;
          nodes.forEach(node => {
            const span = node.colspan * (columnVisibility.controls ? 2 : 1);
            const cell = worksheet.getCell(currentRow, currentCol + offset);

            cell.value = node.name;

            // Style based on depth
            const colors = ['FF0070C0', 'FF2F75B5', 'FF5B9BD5']; // Dark to lighter blue
            styleCell(cell, {
              font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 - level },
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: colors[level] || 'FF5B9BD5' } },
              alignment: { horizontal: 'center' }
            });

            // Set column outline levels for children (nesting controls)
            if (level > 0) {
              for (let i = 0; i < span; i++) {
                worksheet.getColumn(currentCol + offset + i).outlineLevel = level;
              }
            }

            if (node.children && node.children.length > 0) {
              // Merge horizontally across children
              worksheet.mergeCells(currentRow, currentCol + offset, currentRow, currentCol + offset + span - 1);
              drawHeader(node.children, currentRow + 1, currentCol + offset, level + 1);
            } else {
              // It's a leaf: Merge vertically down to the end of hierarchy
              const verticalTarget = headerStartRow + maxDepth - 1;
              if (verticalTarget > currentRow) {
                worksheet.mergeCells(currentRow, currentCol + offset, verticalTarget, currentCol + offset + span - 1);
              } else if (span > 1) {
                worksheet.mergeCells(currentRow, currentCol + offset, currentRow, currentCol + offset + span - 1);
              }

              // Draw the "Applicable / Display" labels if enabled
              if (columnVisibility.controls) {
                const labelRow = headerStartRow + maxDepth;
                const cApp = worksheet.getCell(labelRow, currentCol + offset);
                const cDisp = worksheet.getCell(labelRow, currentCol + offset + 1);

                cApp.value = "App.";
                cDisp.value = "Disp.";

                [cApp, cDisp].forEach(c => styleCell(c, {
                  font: { size: 9, bold: true },
                  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } },
                  alignment: { horizontal: 'center' }
                }));

                worksheet.getColumn(currentCol + offset).width = 9;
                worksheet.getColumn(currentCol + offset + 1).width = 9;
              } else {
                worksheet.getColumn(currentCol + offset).width = 15;
              }
            }
            offset += span;
          });
        };

        drawHeader(headerTree, headerStartRow, entityStartCol, 0);

        // 4. Write Stage Data Rows
        currentDept.stages.forEach((stage) => {
          const row = worksheet.addRow([]);
          let currCol = 1;

          // Fixed Meta Data
          if (columnVisibility.index) {
            const c = row.getCell(currCol++);
            c.value = stage.order_num;
            styleCell(c, { alignment: { horizontal: 'center' } });
          }
          if (columnVisibility.entity) {
            const c = row.getCell(currCol++);
            c.value = stage.name;
            styleCell(c, { font: { bold: true } });
          }
          if (columnVisibility.stageName) {
            const cDur = row.getCell(currCol++);
            cDur.value = minutesToTimeString(stage.estimated_time);
            styleCell(cDur, { alignment: { horizontal: 'center' } });

            const cFol = row.getCell(currCol++);
            const officerIds = stage.officer_ids && stage.officer_ids.length > 0 ? stage.officer_ids : (stage.officer_id ? [stage.officer_id] : []);
            cFol.value = stage.follow_up === 'Officer' && officerIds.length > 0
              ? officerIds.map(id => (userData?.officers || []).find(o => o.id === id)?.displayName).filter(Boolean).join(', ') || stage.follow_up
              : stage.follow_up || '-';
            styleCell(cFol);

            const cAct = row.getCell(currCol++);
            cAct.value = stage.status || '-'; // Simplified actions/status for excel
            styleCell(cAct, { alignment: { horizontal: 'center' } });
          }

          // Entity Specific Data
          leafEntities.forEach(entity => {
            const allocation = getStageAllocation(stage, entity);

            if (columnVisibility.controls) {
              // Applicable Cell
              const cApp = row.getCell(currCol++);
              cApp.value = allocation.applicable ? "Yes" : "No";
              styleCell(cApp, {
                font: { color: { argb: allocation.applicable ? 'FF006100' : 'FF9C0006' }, bold: true },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: allocation.applicable ? 'FFC6EFCE' : 'FFFFC7CE' } },
                alignment: { horizontal: 'center' }
              });

              // Display Cell
              const cDisp = row.getCell(currCol++);
              cDisp.value = allocation.display ? "Yes" : "No";
              styleCell(cDisp, {
                alignment: { horizontal: 'center' },
                font: { color: { argb: allocation.display ? 'FF000000' : 'FF999999' } }
              });
            } else {
              const cStat = row.getCell(currCol++);
              cStat.value = allocation.applicable ? "Active" : "-";
              styleCell(cStat, { alignment: { horizontal: 'center' } });
            }
          });
        });
      } else {
        // ==========================================
        // STANDARD VIEW (Entities as Rows - HIERARCHICAL)
        // ==========================================

        // 1. Calculate Dynamic Columns per Stage
        // What columns do we show for each stage?
        const stageSubCols = [];
        if (columnVisibility.duration) stageSubCols.push({ label: 'Dur.', width: 8 });
        if (columnVisibility.followUp) stageSubCols.push({ label: 'F/U', width: 8 });
        if (columnVisibility.status) stageSubCols.push({ label: 'Status', width: 10 });
        if (columnVisibility.controls) {
          stageSubCols.push({ label: 'App.', width: 6 });
          stageSubCols.push({ label: 'Disp.', width: 6 });
        }

        const colsPerStage = stageSubCols.length;
        if (colsPerStage === 0) {
          toast({ title: "No stage columns visible", variant: "destructive" });
          return;
        }

        const headerStartRow = 4;
        const mainHeaderRow = worksheet.getRow(headerStartRow);
        const subHeaderRow = worksheet.getRow(headerStartRow + 1);
        mainHeaderRow.height = 25;

        // 2. Build Headers
        let colIndex = 1;

        // Static Headers (Index, Entity)
        if (columnVisibility.index) {
          worksheet.mergeCells(headerStartRow, colIndex, headerStartRow + 1, colIndex);
          const c = mainHeaderRow.getCell(colIndex);
          c.value = "#";
          worksheet.getColumn(colIndex).width = 6;
          styleCell(c, {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } },
            alignment: { horizontal: 'center' }
          });
          colIndex++;
        }

        if (columnVisibility.entity) {
          worksheet.mergeCells(headerStartRow, colIndex, headerStartRow + 1, colIndex);
          const c = mainHeaderRow.getCell(colIndex);
          c.value = "Department / Entity";
          worksheet.getColumn(colIndex).width = 40;
          styleCell(c, {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } }
          });
          colIndex++;
        }

        // Dynamic Stage Headers
        currentDept.stages.forEach(stage => {
          // Merge cells for Stage Name
          worksheet.mergeCells(headerStartRow, colIndex, headerStartRow, colIndex + colsPerStage - 1);
          const mainC = mainHeaderRow.getCell(colIndex);
          mainC.value = stage.name;
          styleCell(mainC, {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }, // Medium Blue
            alignment: { horizontal: 'center' }
          });

          // Sub columns
          stageSubCols.forEach((subCol, i) => {
            const subC = subHeaderRow.getCell(colIndex + i);
            subC.value = subCol.label;
            worksheet.getColumn(colIndex + i).width = subCol.width;
            styleCell(subC, {
              font: { size: 10, bold: true },
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } }, // Light Gray
              alignment: { horizontal: 'center' }
            });
          });

          colIndex += colsPerStage;
        });

        // 3. Write Data with Hierarchy
        const processedSubdepartments = getProcessedSubdepartments(currentDept);
        let rowCounter = 0;

        // Helper to add a row
        const addEntityRow = (entityName: string, entityObj: any, level: number, subdeptId: number, clsId: number | null, subClsId: number | null) => {
          rowCounter++;
          const row = worksheet.addRow([]);
          row.outlineLevel = level;
          let currCell = 1;

          // Index
          if (columnVisibility.index) {
            row.getCell(currCell++).value = rowCounter; // Could make this 1.1, 1.1.1 if desired
          }

          // Entity Name with indentation
          if (columnVisibility.entity) {
            const c = row.getCell(currCell++);
            c.value = entityName;
            styleCell(c, { alignment: { indent: level } });
          }

          // Background colors for group rows
          const bgColors = ['FFDDEBF7', 'FFF2F2F2', 'FFFFFFFF']; // Level 0 (Blue), 1 (Gray), 2 (White)
          const bgColor = bgColors[level] || 'FFFFFFFF';
          const isGroupHeader = (level === 0) || (level === 1 && subClsId === null && entityObj.subClasses && entityObj.subClasses.length > 0);

          if (isGroupHeader) {
            row.eachCell({ includeEmpty: true }, c => {
              c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
              c.font = { bold: true };
              c.border = { bottom: { style: 'thin', color: { argb: 'FFD4D4D4' } } };
            });
          }

          // Stage Data
          currentDept.stages.forEach(stage => {
            // Calculate allocation manually based on ids passed
            let stageAllocation;

            if (subClsId !== null && clsId !== null) {
              // Subclass
              stageAllocation = entityObj.stages?.find((s: any) => s.stage_id === stage.id);
            } else if (clsId !== null) {
              // Class
              stageAllocation = entityObj.stages?.find((s: any) => s.stage_id === stage.id);
              // Check inheritance if visual only (not done here for raw data export, sticking to direct allocation)
            } else {
              // Subdept
              stageAllocation = entityObj.stages?.find((s: any) => s.stage_id === stage.id);
            }

            const isApp = stageAllocation?.applicable ?? true;
            const isDisp = stageAllocation?.display ?? true;

            // Write columns
            if (columnVisibility.duration) {
              const c = row.getCell(currCell++);
              c.value = minutesToTimeString(stage.estimated_time);
              c.alignment = { horizontal: 'center' };
            }
            if (columnVisibility.followUp) {
              const c = row.getCell(currCell++);
              const officerIds = stage.officer_ids && stage.officer_ids.length > 0 ? stage.officer_ids : (stage.officer_id ? [stage.officer_id] : []);
              c.value = stage.follow_up === 'Officer' && officerIds.length > 0
                ? officerIds.map(id => (userData?.officers || []).find(o => o.id === id)?.displayName).filter(Boolean).join(', ') || stage.follow_up
                : stage.follow_up || '-';
              c.alignment = { horizontal: 'center' };
            }
            if (columnVisibility.status) {
              const c = row.getCell(currCell++);
              c.value = stage.status || '-';
              c.alignment = { horizontal: 'center' };
            }
            if (columnVisibility.controls) {
              // Applicable
              const cApp = row.getCell(currCell++);
              if (!hasClasses(entityObj, level)) { // Only show controls for "leaves" or editable rows? 
                // Current logic allows editing everywhere, so show everywhere
                cApp.value = isApp ? "Yes" : "No";
                styleCell(cApp, {
                  font: { color: { argb: isApp ? 'FF006100' : 'FF9C0006' }, size: 10 },
                  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: isApp ? 'FFC6EFCE' : 'FFFFC7CE' } },
                  alignment: { horizontal: 'center' }
                });
              } else {
                cApp.value = "-"; // Group header visual filler
              }

              // Display
              const cDisp = row.getCell(currCell++);
              if (!hasClasses(entityObj, level)) {
                cDisp.value = isDisp ? "Yes" : "No";
                styleCell(cDisp, { alignment: { horizontal: 'center' }, font: { size: 10 } });
              } else {
                cDisp.value = "-";
              }
            }
          });
        };

        // Helper to check if an object acts as a group header (has children)
        const hasClasses = (obj: any, level: number) => {
          if (level === 0) return obj.classes && obj.classes.length > 0;
          if (level === 1) return obj.subClasses && obj.subClasses.length > 0;
          return false;
        };

        // Iterate Hierarchy
        processedSubdepartments.forEach(subdept => {
          addEntityRow(subdept.name, subdept, 0, subdept.id, null, null);

          if (subdept.classes && subdept.classes.length > 0) {
            subdept.classes.forEach((cls: any, clsIndex: number) => {
              addEntityRow(cls.name, cls, 1, subdept.id, cls.id || clsIndex, null);

              if (cls.subClasses && cls.subClasses.length > 0) {
                cls.subClasses.forEach((subCls: any, subClsIndex: number) => {
                  addEntityRow(subCls.name, subCls, 2, subdept.id, cls.id || clsIndex, subCls.id || subClsIndex);
                });
              }
            });
          }
        });
      }

      // --- SAVE FILE ---
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const kycDocCount = allKycDocuments.size;
      saveAs(blob, `${currentDept.name}_Stages_${viewType}_${kycDocCount}Docs_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: "Export Successful",
        description: `Exported ${viewType} view to Excel`
      });

    } catch (error) {
      console.error("Export to Excel failed:", error);
      toast({ title: "Export Failed", description: "Check console for details", variant: "destructive" });
    }
  };

  // Function to get stage allocation for an entity
  const getStageAllocation = (stage: Stage, entity: any) => {
    if (!currentDept) return { applicable: true, display: true };

    const processedSubdepartments = getProcessedSubdepartments(currentDept);
    let stageAllocation;

    const subdept = processedSubdepartments.find((sd) => sd.id === entity.subdeptId);
    if (!subdept) return { applicable: true, display: true };

    // Resolve directly by the entity's own stable classId/subclassId (captured in
    // getLeafEntities off the already-filtered class/subclass), never by re-indexing
    // into currentDept's raw/unfiltered arrays with a position that was only ever valid
    // within the filtered list — that mismatch used to return the wrong class/subclass
    // (or throw, when the index ran past the raw array's length) whenever entity-visibility
    // filters hid any rows above the one being read.
    if (entity.type === "subdepartment") {
      stageAllocation = subdept.stages?.find((s) => s.stage_id === stage.id);
    } else if (entity.type === "class" && entity.classId != null) {
      const processedClass = subdept.classes?.find((c) => c.id === entity.classId);
      stageAllocation = processedClass?.stages?.find((s) => s.stage_id === stage.id);
    } else if (entity.type === "subclass" && entity.classId != null && entity.subclassId != null) {
      const processedClass = subdept.classes?.find((c) => c.id === entity.classId);
      const processedSubClass = processedClass?.subClasses?.find((sc) => sc.id === entity.subclassId);
      stageAllocation = processedSubClass?.stages?.find((s) => s.stage_id === stage.id);
    }

    return {
      applicable: stageAllocation?.applicable ?? true,
      display: stageAllocation?.display ?? true,
    };
  };

  const buildHeaderTree = useCallback(
    (dept: Department) => {
      if (!dept) return []
      const processedSubdepartments = getProcessedSubdepartments(dept)
      const tree: any[] = []

      processedSubdepartments.forEach((subdept) => {
        const subdeptNode: any = {
          id: `header-subdept-${subdept.id}`,
          name: subdept.name,
          type: "subdepartment",
          colspan: 0,
          children: [],
          default_display: subdept.default_display === true, // Include default_display
        }

        const hasClasses = subdept.classes && subdept.classes.length > 0
        if (!hasClasses) {
          subdeptNode.colspan = 1
        } else {
          subdept.classes?.forEach((cls, clsIndex) => {
            const classNode: any = {
              id: `header-class-${subdept.id}-${cls.id || clsIndex}`,
              name: cls.name,
              type: "class",
              colspan: 0,
              children: [],
              default_display: cls.default_display === true, // Include default_display
            }

            const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
            if (!hasSubClasses) {
              classNode.colspan = 1
            } else {
              cls.subClasses?.forEach((subCls, subClsIndex) => {
                const subClassNode: any = {
                  id: `header-subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`,
                  name: subCls.name,
                  type: "subclass",
                  colspan: 1,
                  children: [],
                  default_display: subCls.default_display === true, // Include default_display
                }
                classNode.children.push(subClassNode)
              })
              classNode.colspan = classNode.children.reduce((sum, child) => sum + child.colspan, 0)
            }
            subdeptNode.children.push(classNode)
          })
          subdeptNode.colspan = subdeptNode.children.reduce((sum, child) => sum + child.colspan, 0)
        }
        tree.push(subdeptNode)
      })
      return tree
    },
    [getProcessedSubdepartments],
  )

  const generateHeaderRows = (tree: any[]) => {
    if (!tree || tree.length === 0) return { rows: [], maxDepth: 0 }

    let maxDepth = 0
    const findMaxDepth = (nodes: any[], depth: number) => {
      maxDepth = Math.max(maxDepth, depth)
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          findMaxDepth(node.children, depth + 1)
        }
      })
    }
    findMaxDepth(tree, 1)

    const rows: any[][] = Array.from({ length: maxDepth }, () => [])

    function traverse(node: any, depth: number) {
      const rowspan = !node.children || node.children.length === 0 ? maxDepth - depth + 1 : 1
      const colspan = node.colspan * (columnVisibility.controls ? 2 : 1) // Each leaf has 2 controls columns if visible

      rows[depth - 1].push({
        ...node,
        rowspan,
        colspan,
      })

      if (node.children && node.children.length > 0) {
        node.children.forEach((child) => traverse(child, depth + 1))
      }
    }

    tree.forEach((node) => traverse(node, 1))
    return { rows, maxDepth }
  }
  // Render transposed table
  const renderTransposedTable = () => {
    if (!currentDept) return null;

    const leafEntities = getLeafEntities(currentDept);
    const headerTree = buildHeaderTree(currentDept);
    const { rows: headerRowsData, maxDepth } = generateHeaderRows(headerTree);

    // Total rows in the header, including the final controls row if visible
    const totalHeaderRows = maxDepth + (columnVisibility.controls ? 1 : 0);

    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
          <Table className="min-w-max">
            {/* Sticky Headers for Transposed View with Hierarchy */}
            <TableHeader className="sticky top-0 z-30">
              {/* Static columns + First level of hierarchy */}
              <TableRow className="border-b-0">
                {columnVisibility.index && (
                  <TableHead
                    className="sticky left-0 bg-blue-700 border-r-2 border-blue-500 font-bold w-16 z-40 text-center text-white align-middle"
                    rowSpan={totalHeaderRows}
                  >
                    #
                  </TableHead>
                )}
                {columnVisibility.entity && (
                  <TableHead
                    className={cn(
                      "sticky bg-blue-700 border-r-2 border-blue-500 font-bold w-64 z-40 text-white align-middle",
                      columnVisibility.index ? "left-16" : "left-0",
                    )}
                    rowSpan={totalHeaderRows}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Stage Information
                    </div>
                  </TableHead>
                )}
                {columnVisibility.stageName && (
                  <React.Fragment>
                    <TableHead
                      className={cn(
                        "sticky bg-blue-700 border-r border-blue-500 z-20 text-white align-middle",
                        columnVisibility.index && columnVisibility.entity
                          ? "left-80"
                          : columnVisibility.index || columnVisibility.entity
                            ? "left-64"
                            : "left-0",
                      )}
                      rowSpan={totalHeaderRows}
                    >
                      Duration
                    </TableHead>
                    <TableHead
                      className={cn(
                        "sticky bg-blue-700 border-r-2 border-blue-500 z-20 text-white align-middle",
                        columnVisibility.index && columnVisibility.entity
                          ? "left-100"
                          : columnVisibility.index || columnVisibility.entity
                            ? "left-164"
                            : "left-0",
                      )}
                      rowSpan={totalHeaderRows}
                    >
                      Follow-up
                    </TableHead>
                    <TableHead
                      className={cn(
                        "sticky bg-blue-700 border-r-2 border-blue-500 z-20 text-white align-middle",
                        columnVisibility.index && columnVisibility.entity
                          ? "left-120"
                          : columnVisibility.index || columnVisibility.entity
                            ? "left-164"
                            : "left-0",
                      )}
                      rowSpan={totalHeaderRows}
                    >
                      Actions
                    </TableHead>
                  </React.Fragment>
                )}

              </TableRow>
              {/* Render the first level of the hierarchy */}
              {(headerRowsData[0] || []).map((node) => (
                <TableHead
                  key={node.id}
                  colSpan={node.colspan}
                  rowSpan={node.rowspan}
                  className="border-r border-blue-500 text-center font-bold text-white min-w-[120px] bg-blue-700 p-2 align-middle"
                >
                  <div className="flex flex-col items-center space-y-1">
                    <div className="font-medium text-sm truncate max-w-[200px]" title={node.name}>
                      {node.name}
                    </div>
                    {/* <Badge variant="secondary" className="text-xs capitalize">{node.type}</Badge> */}
                  </div>
                </TableHead>
              ))}

              {/* Subsequent hierarchical rows */}
              {headerRowsData.slice(1).map((row, rowIndex) => (
                <TableRow key={`header-row-${rowIndex + 1}`} className="border-b-0">
                  {row.map((node) => (
                    <TableHead
                      key={node.id}
                      colSpan={node.colspan}
                      rowSpan={node.rowspan}
                      className={cn(
                        "border-r border-t border-blue-400 text-center font-semibold text-white min-w-[120px] p-2 align-middle",
                        rowIndex === 0 ? "bg-blue-600" : "bg-blue-500" // different color for depth
                      )}
                    >
                      <div className="flex flex-col items-center space-y-1">
                        <div className="font-medium text-sm truncate max-w-[200px]" title={node.name}>
                          {node.name}
                        </div>
                        {/* <Badge variant="secondary" className="text-xs capitalize">{node.type}</Badge> */}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
              <TableRow className="border-b-0">
                <TableCell className="sticky left-0 bg-slate-500 border-r-2 border-slate-300 z-10" rowSpan={2} colSpan={3}></TableCell>
                <TableCell className="bg-slate-500 border-r-2 border-slate-300 z-20" rowSpan={2} colSpan={2}></TableCell>
              </TableRow>
              {/* Applicable/Display Controls Header Row */}
              {columnVisibility.controls && (
                <TableRow className="border-b-0">
                  {leafEntities.map((entity) => {
                    // Bulk select/deselect for this entity's "Default Display" column — scoped
                    // to filteredStages (the same search/filter-narrowed row set the table body
                    // is currently rendering) and further narrowed to stages actually applicable
                    // to this entity, matching the single-row checkbox's own disabled-when-not-
                    // applicable rule.
                    const applicableFilteredStages = filteredStages.filter(
                      (stage) => getStageAllocation(stage, entity).applicable,
                    )
                    const allDisplayed =
                      applicableFilteredStages.length > 0 &&
                      applicableFilteredStages.every((stage) => getStageAllocation(stage, entity).display)
                    const someDisplayed = applicableFilteredStages.some(
                      (stage) => getStageAllocation(stage, entity).display,
                    )

                    return (
                      <React.Fragment key={`controls-${entity.id}`}>
                        <TableHead className="border-r border-slate-300 bg-slate-500 text-center text-xs font-medium text-white w-16 p-1">
                          Applicable
                        </TableHead>
                        <TableHead className="border-r border-slate-300 bg-slate-500 text-center text-xs font-medium text-white w-16 p-1">
                          <div
                            className="flex items-center justify-center gap-1"
                            title={`${allDisplayed ? "Deselect all" : "Select all"} (${applicableFilteredStages.length} visible stage${applicableFilteredStages.length === 1 ? "" : "s"})`}
                          >
                            <span>Default Display</span>
                            <Checkbox
                              checked={allDisplayed ? true : someDisplayed ? "indeterminate" : false}
                              onCheckedChange={() =>
                                handleBulkDisplayToggle(
                                  entity,
                                  applicableFilteredStages.map((stage) => stage.id),
                                  !allDisplayed,
                                )
                              }
                              disabled={applicableFilteredStages.length === 0}
                              className="h-3.5 w-3.5 border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-700"
                            />
                          </div>
                        </TableHead>
                      </React.Fragment>
                    )
                  })}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {filteredStages.map((stage, stageIndex) => (
                <TableRow key={stage.id} className="border-b border-slate-300">
                  {columnVisibility.index && (
                    <TableCell className="sticky left-0 bg-slate-100 border-r-2 border-slate-300 text-center text-sm z-10 font-medium">
                      {stage.order_num}
                    </TableCell>
                  )}
                  {columnVisibility.entity && (
                    <TableCell
                      className={cn(
                        "sticky bg-slate-100 border-r-2 border-slate-300 font-medium z-10",
                        columnVisibility.index ? "left-16" : "left-0",
                      )}
                    >
                      <div className="flex justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{stage.name}</span>
                          {stage.stageInputType && stage.stageInputType !== 'document' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">
                              {stage.stageInputType}
                            </Badge>
                          )}
                          {stage.linkedMasterFieldIds && stage.linkedMasterFieldIds.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-50 text-green-700 border-green-200">
                              <Link2 className="h-2.5 w-2.5 mr-0.5" />
                              {stage.linkedMasterFieldIds.length} linked
                            </Badge>
                          )}
                          {stage.dependencies && stage.dependencies.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                              <ArrowDownCircle className="h-2.5 w-2.5 mr-0.5" />
                              {stage.dependencies.length} dep
                            </Badge>
                          )}
                        </div>
                        <div>  {stage.documents && stage.documents.length > 0 && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0 relative bg-purple-600 shadow-sm hover:bg-purple-700"
                              >
                                <FileText className="h-3 w-3 text-white" />
                                <Badge
                                  variant="secondary"
                                  className="absolute -top-1 -right-1 h-4 w-4 text-xs p-0 flex items-center justify-center rounded-full"
                                >
                                  {stage.documents.length}
                                </Badge>
                                {stage.documents.some((doc) => doc.kycId) && (
                                  <div className="absolute -bottom-1 -left-1 h-3 w-3 bg-green-500 rounded-full p-0.5 flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">K</span>
                                  </div>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-96 max-h-96 overflow-y-auto z-50">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium">Stage Documents</h4>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {stage.documents.length} document{stage.documents.length > 1 ? "s" : ""}
                                    </Badge>
                                    {stage.documents.some((doc) => doc.kycId) && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs bg-green-50 text-green-700 border-green-200"
                                      >
                                        {stage.documents.filter((doc) => doc.kycId).length} KYC Synced
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  {stage.documents.map((doc, i) => (
                                    <DocumentDisplay key={doc.id || i} doc={doc} stage={stage} />
                                  ))}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}</div>
                      </div>
                    </TableCell>
                  )}
                  {columnVisibility.stageName && (
                    <>
                      <TableCell
                        className={cn(
                          "sticky bg-slate-100 border-r border-slate-300 z-10",
                          columnVisibility.index && columnVisibility.entity
                            ? "left-80"
                            : columnVisibility.index || columnVisibility.entity
                              ? "left-64"
                              : "left-0",
                        )}
                      >
                        <div className="font-medium text-sm text-center">
                          {minutesToTimeString(stage.estimated_time) || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="sticky bg-slate-100 border-r-2 border-slate-300 z-10">
                        <div className="text-gray-700 text-sm">
                          {(() => {
                            const officerIds = stage.officer_ids && stage.officer_ids.length > 0 ? stage.officer_ids : (stage.officer_id ? [stage.officer_id] : []);
                            return stage.follow_up === 'Officer' && officerIds.length > 0
                              ? officerIds.map(id => (userData?.officers || []).find(o => o.id === id)?.displayName).filter(Boolean).join(', ') || stage.follow_up
                              : stage.follow_up || "-";
                          })()}
                        </div>
                      </TableCell>
                    </>
                  )}
                  {columnVisibility.stageName && (
                    <>
                      <TableCell className="sticky bg-slate-100 border-r-2 border-slate-300 z-10">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 hover:bg-slate-300/50"
                              onClick={() => moveStage(stage.id, "up")}
                              disabled={stage.order_num === 1}
                            >
                              <ChevronUp className="h-3 w-3 text-slate-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 hover:bg-slate-300/50"
                              onClick={() => moveStage(stage.id, "down")}
                              disabled={stage.order_num === currentDept.stages.length}
                            >
                              <ChevronDown className="h-3 w-3 text-slate-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 hover:bg-slate-300/50"
                              onClick={() => {
                                setEditingStage(stage);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3 text-slate-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 hover:bg-red-200"
                              onClick={() => handleDeleteStage(stage.id)}
                              title={`Delete stage "${stage.name}"`}
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </>
                  )}
                  {leafEntities.map((entity, entityIndex) => {
                    const entityKey = `${entity.subdeptId}:${entity.id.includes('class') ? entity.id.split('-').pop() : (entity.class_id || 0)}:${entity.id.includes('subclass') ? entity.id.split('-').pop() : (entity.subclass_id || 0)}`;

                    const allocation = getStageAllocation(stage, entity);
                    const automation = getEntityAutomation(stage, entityKey);
                    const columnClass = entityIndex % 2 === 0 ? "bg-white" : "bg-gray-50/80";

                    return (
                      <React.Fragment key={`${stage.id}-${entity.id}`}>
                        <TableCell className={cn("border-x border-gray-200 p-1", columnClass)}>
                          <div className="flex items-center justify-center gap-1">
                            {/* Status Select */}
                            <Select
                              value={allocation.applicable ? "applicable" : "not-applicable"}
                              onValueChange={(val) => handleAllocationChange(entity.subdeptId, stage.id, val === "applicable", entity.classId ?? null, entity.subclassId ?? null)}
                            >
                              <SelectTrigger className="h-7 border-0 shadow-none text-xs bg-transparent hover:bg-gray-200/50">
                                <SelectValue />
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
                            {automation && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="cursor-help p-1 bg-amber-100 rounded-full">
                                    <Zap className="h-3 w-3 text-amber-600 fill-amber-600" />
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-2">
                                  <p className="text-[10px] font-bold text-amber-800 uppercase">Automation Linked</p>
                                  <p className="text-xs text-slate-600">ID: {automation.automationId}</p>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn("border-x border-gray-200 p-1", columnClass)}>
                          <div className="flex justify-center items-center">
                            <Checkbox
                              checked={allocation.display}
                              onCheckedChange={(checked) =>
                                handleDisplayToggle(
                                  entity.subdeptId,
                                  stage.id,
                                  checked as boolean,
                                  entity.classId ?? null,
                                  entity.subclassId ?? null,
                                )
                              }
                              disabled={!allocation.applicable}
                              className="h-4 w-4 text-blue-500"
                            />
                          </div>
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // Render normal table (existing implementation)
  const renderNormalTable = () => {
    if (!currentDept) return null

    const headerRowCount =
      1 +
      (columnVisibility.duration ? 1 : 0) +
      (columnVisibility.followUp ? 1 : 0) +
      (columnVisibility.automation ? 1 : 0) +
      (columnVisibility.status ? 1 : 0) +
      (columnVisibility.controls ? 1 : 0)

    const processedSubdepartments = getProcessedSubdepartments(currentDept)
    const normalizedSubdepartments =
      processedSubdepartments.length > 0
        ? processedSubdepartments
        : [
          {
            id: -1,
            name: "No Subdepartments",
            department_id: currentDept.id,
            stages: [],
            hasClasses: false,
            classes: [],
          },
        ]

    const totalItems = normalizedSubdepartments.length
    const totalPages = Math.ceil(totalItems / standardPageSize)
    const paginatedSubdepartments = normalizedSubdepartments.slice(
      (standardPage - 1) * standardPageSize,
      standardPage * standardPageSize,
    )

    // The "Overall Expected Time" and "Promised Time" columns sit between Entity and Stage
    // Name (in that order), so every sticky-left offset that used to start at Stage Name
    // shifts right by both their widths (w-32 each).
    const expectedTimeLeftClass = columnVisibility.index && columnVisibility.entity
      ? "left-80"
      : columnVisibility.index || columnVisibility.entity
        ? "left-64"
        : "left-0"
    const promisedTimeLeftClass = columnVisibility.index && columnVisibility.entity
      ? "left-[28rem]"
      : columnVisibility.index || columnVisibility.entity
        ? "left-96"
        : "left-32"
    const stageNameLeftClass = columnVisibility.index && columnVisibility.entity
      ? "left-[36rem]"
      : columnVisibility.index || columnVisibility.entity
        ? "left-[32rem]"
        : "left-64"

    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
          <Table className="min-w-max">
            {/* Sticky Headers */}
            <TableHeader className="sticky top-0 z-30">
              {/* Stage Names Row */}
              <TableRow className="border-b-0">
                {columnVisibility.index && (
                  <TableHead
                    className="sticky left-0 bg-blue-700 border-r-2 border-blue-500 font-bold w-16 z-40 text-center text-white"
                    rowSpan={headerRowCount}
                  >
                    #
                  </TableHead>
                )}
                {columnVisibility.entity && (
                  <TableHead
                    className={cn(
                      "sticky bg-blue-700 border-r-2 border-blue-500 font-bold w-64 z-40 text-white",
                      columnVisibility.index ? "left-16" : "left-0",
                    )}
                    rowSpan={headerRowCount}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Department / Entity
                    </div>
                  </TableHead>
                )}
                <TableHead
                  className={cn("sticky bg-blue-700 border-r-2 border-blue-500 font-bold w-32 z-40 text-white text-center", expectedTimeLeftClass)}
                  rowSpan={headerRowCount}
                >
                  Overall Expected Time
                </TableHead>
                <TableHead
                  className={cn("sticky bg-blue-700 border-r-2 border-blue-500 font-bold w-32 z-40 text-white text-center", promisedTimeLeftClass)}
                  rowSpan={headerRowCount}
                >
                  Promised Time
                </TableHead>
                {columnVisibility.stageName && (
                  <TableHead
                    className={cn("sticky bg-blue-700 border-r-2 border-blue-500 z-20 text-white", stageNameLeftClass)}
                  >
                    Stage Name
                  </TableHead>
                )}
                {filteredStages.map((stage, index) => (
                  <TableHead
                    key={stage.id}
                    className="border-r border-blue-500 text-center font-bold text-white min-w-[200px] bg-blue-700"
                  >
                    <div className="flex flex-col items-center p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {stage.order_num}. {stage.name}
                        </span>
                      </div>
                      {/* {stage.web_automation?.automationName && (
                        <div className="flex items-center gap-1 bg-blue-600/50 px-2 py-0.5 rounded-full text-xs">
                          <Zap className="h-3 w-3 text-amber-300" />
                          <span className="truncate max-w-[180px]" title={stage.web_automation?.automationName}>
                            {stage.web_automation?.automationName}
                          </span>
                        </div>
                      )} */}
                      <div className="flex items-center gap-2 text-xs">
                        {stage.documents && stage.documents.length > 0 && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0 relative bg-purple-600 shadow-sm hover:bg-purple-700"
                              >
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
                                {stage.documents.some((doc) => doc.kycId) && (
                                  <div className="absolute -bottom-1 -left-1 h-3 w-3 bg-green-500 rounded-full p-0.5 flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">K</span>
                                  </div>
                                )}
                                {/* Special document indicator */}
                                {stage.documents.some((doc) => doc.isSpecial) && (
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
                                      {stage.documents.length} document{stage.documents.length > 1 ? "s" : ""}
                                    </Badge>
                                    {stage.documents.some((doc) => doc.kycId) && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs bg-green-50 text-green-700 border-green-200"
                                      >
                                        {stage.documents.filter((doc) => doc.kycId).length} KYC Synced
                                      </Badge>
                                    )}
                                    {stage.documents.some((doc) => doc.isSpecial) && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                                      >
                                        <Star className="h-3 w-3 mr-1" />
                                        {stage.documents.filter((doc) => doc.isSpecial).length} Special
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
                                    {stage.documents.some((doc) => doc.isSpecial) && (
                                      <span className="block mt-1 text-amber-600 font-medium">
                                        ⭐ Special documents are entity-specific and will only appear for their target
                                        entities.
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0 bg-orange-500 hover:bg-orange-600 rounded"
                              >
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
                                      <div className="font-medium">{config.applicationType || "Default"}</div>
                                      <div className="text-gray-600">
                                        {config.days > 0 && `${config.days}d `}
                                        {config.hours > 0 && `${config.hours}h `}
                                        {config.minutes > 0 ? `${config.minutes}m` : ""}
                                        {!config.days && !config.hours && !config.minutes ? "0m" : ""}
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
                            onClick={() => moveStage(stage.id, "up")}
                            disabled={stage.order_num === 1}
                          >
                            <ChevronLeft className="h-3 w-3 text-white" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-white/20"
                            onClick={() => moveStage(stage.id, "down")}
                            disabled={stage.order_num === currentDept.stages.length}
                          >
                            <ChevronRight className="h-3 w-3 text-white" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-white/20"
                            onClick={() => {
                              setEditingStage(stage);
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3 text-white" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-red-500/50"
                            onClick={() => handleDeleteStage(stage.id)}
                            title={`Delete stage "${stage.name}"`}
                          >
                            <Trash2 className="h-3 w-3 text-white" />
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
                    <TableHead
                      className={cn("sticky bg-blue-600 border-r-2 border-blue-400 z-20 text-white", stageNameLeftClass)}
                    >
                      Duration
                    </TableHead>
                  )}
                  {filteredStages.map((stage, index) => (
                    <TableHead
                      key={`duration-${stage.id}`}
                      className="border-r border-blue-400 text-center bg-blue-600"
                    >
                      <div className="font-bold text-sm text-white py-2">
                        {minutesToTimeString(stage.estimated_time)}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              )}
              {/* Follow Up Row */}
              {columnVisibility.followUp && (
                <TableRow className="border-b-0">
                  {columnVisibility.stageName && (
                    <TableHead
                      className={cn("sticky bg-blue-600 border-r-2 border-blue-400 z-20 text-white", stageNameLeftClass)}
                    >
                      Follow Up
                    </TableHead>
                  )}
                  {filteredStages.map((stage) => (
                    <TableHead
                      key={`followup-${stage.id}`}
                      className="border-r border-blue-400 text-center bg-blue-600"
                    >
                      <div className="font-bold text-sm text-white py-2">
                        {(() => {
                          const officerIds = stage.officer_ids && stage.officer_ids.length > 0 ? stage.officer_ids : (stage.officer_id ? [stage.officer_id] : []);
                          return stage.follow_up === 'Officer' && officerIds.length > 0
                            ? officerIds.map(id => (userData?.officers || []).find(o => o.id === id)?.displayName).filter(Boolean).join(', ') || stage.follow_up
                            : stage.follow_up || "-";
                        })()}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              )}
              {/* Automation Row */}
              {/* Automation Row in Standard View */}
              <TableRow className="border-b-0">
                {columnVisibility.stageName && (
                  <TableHead className={cn("sticky bg-blue-600 border-r-2 border-blue-400 z-20 text-white", stageNameLeftClass)}>
                    Automation
                  </TableHead>
                )}
                {filteredStages.map((stage) => {
                  const isAutomated = hasAnyAutomation(stage);
                  return (
                    <TableHead key={`auto-${stage.id}`} className="border-r border-blue-400 text-center bg-blue-600">
                      {isAutomated ? (
                        <div className="flex items-center justify-center gap-1 bg-amber-400/20 py-1 px-2 rounded-md mx-4">
                          <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
                          <span className="text-[10px] text-white font-bold uppercase tracking-tighter">Automated</span>
                        </div>
                      ) : (
                        <span className="text-blue-400 text-xs">-</span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
              {/* Status Row */}
              {columnVisibility.status && (
                <TableRow className="border-b-0">
                  {columnVisibility.stageName && (
                    <TableHead
                      className={cn("sticky bg-blue-600 border-r-2 border-blue-400 z-20 text-white", stageNameLeftClass)}
                    >
                      Status
                    </TableHead>
                  )}
                  {filteredStages.map((stage) => (
                    <TableHead
                      key={`status-${stage.id}`}
                      className="border-r border-blue-400 text-center bg-blue-600"
                    >
                      <div className="font-bold text-sm text-white py-2">{stage.status || "-"}</div>
                    </TableHead>
                  ))}
                </TableRow>
              )}
              {/* Applicable/Display Headers Row */}
              <TableRow>
                <TableHead className="sticky left-0 bg-blue-700 border-r-2 border-blue-500 font-bold w-16 z-40 text-center text-white" rowSpan={2} colSpan={3}></TableHead>
              </TableRow>
              {columnVisibility.controls && (
                <TableRow className="border-b-0">
                  {columnVisibility.stageName && (
                    <TableHead
                      className={cn("sticky bg-slate-500 border-r-2 border-slate-300 z-20", stageNameLeftClass)}
                    ></TableHead>
                  )}
                  {filteredStages.map((stage, index) => (
                    <TableHead key={`controls-${stage.id}`} className="border-r border-slate-300 bg-slate-500">
                      <div className="grid grid-cols-2 gap-1 p-1">
                        <div className="text-center text-xs font-medium text-white">Applicable</div>
                        <div className="text-center text-xs font-medium text-white">Default Display</div>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {paginatedSubdepartments.flatMap((subdept, subdeptIndex) => {
                const subdeptRowId = `subdept-${subdept.id}`
                const isExpanded = expandedRows.has(subdeptRowId)
                const rows = []
                const rowIndex = subdeptIndex + 1
                const hasClasses = subdept.classes && subdept.classes.length > 0

                rows.push(
                  <TableRow key={subdeptRowId} className="border-b border-slate-300">
                    {columnVisibility.index && (
                      <TableCell className="sticky left-0 bg-slate-100 border-r-2 border-slate-300 text-center text-sm z-10 font-medium">
                        {rowIndex}
                      </TableCell>
                    )}
                    {columnVisibility.entity && (
                      <TableCell
                        className={cn(
                          "sticky bg-slate-100 border-r-2 border-slate-300 font-medium z-10",
                          columnVisibility.index ? "left-16" : "left-0",
                        )}
                      >
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
                    <TableCell className={cn("sticky bg-slate-100 border-r-2 border-slate-300 text-center text-sm font-semibold text-slate-700 z-10", expectedTimeLeftClass)}>
                      {hasClasses
                        ? "-"
                        : minutesToTimeString(
                          currentDept.stages.reduce(
                            (sum, stage) => (resolveStageApplicable(subdept.stages, stage.id) ? sum + (stage.estimated_time || 0) : sum),
                            0,
                          ),
                        )}
                    </TableCell>
                    <TableCell className={cn("sticky bg-slate-100 border-r-2 border-slate-300 text-center text-sm z-10 p-0", promisedTimeLeftClass)}>
                      {hasClasses ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <PromisedTimeCell leaf={{ subdeptId: subdept.id, classId: null, subclassId: null, level: 2 }} />
                      )}
                    </TableCell>
                    {columnVisibility.stageName && (
                      <TableCell
                        className={cn("sticky bg-slate-100 border-r-2 border-slate-300 text-center text-sm z-10", stageNameLeftClass)}
                      ></TableCell>
                    )}
                    {filteredStages.map((stage, stageIndex) => {
                      const stageAllocation = subdept.stages?.find((s) => s.stage_id === stage.id)
                      const hasAllocation = stageAllocation?.applicable ?? true
                      const hasDisplay = stageAllocation?.display ?? true
                      const columnClass = stageIndex % 2 === 0 ? "bg-slate-50" : "bg-slate-100/80"

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
                                      value={hasAllocation ? "applicable" : "not-applicable"}
                                      onValueChange={(value) =>
                                        handleAllocationChangeInternal(subdept.id, stage.id, value === "applicable")
                                      }
                                    >
                                      <SelectTrigger
                                        className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-slate-200/50"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <SelectValue>
                                          <div className="flex items-center gap-1">
                                            <div
                                              className={`w-2 h-2 rounded-full ${hasAllocation ? "bg-green-500" : "bg-red-500"}`}
                                            ></div>
                                            <span className="ml-1 font-medium">{hasAllocation ? "Yes" : "No"}</span>
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
                            <div className="flex items-center justify-center p-2 text-gray-500">-</div>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>,
                )

                // Add class rows if expanded
                if (isExpanded && hasClasses) {
                  subdept.classes?.forEach((cls, clsIndex) => {
                    const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
                    const classRowId = `class-${subdept.id}-${cls.id || clsIndex}`
                    const isClassExpanded = expandedRows.has(classRowId)

                    rows.push(
                      <TableRow key={classRowId} className="border-b border-gray-200">
                        {columnVisibility.index && (
                          <TableCell className="sticky left-0 bg-gray-50 border-r-2 border-gray-200 text-center text-sm z-10 font-semibold">
                            {rowIndex}.{clsIndex + 1}
                          </TableCell>
                        )}
                        {columnVisibility.entity && (
                          <TableCell
                            className={cn(
                              "sticky bg-gray-50 border-r-2 border-gray-200 pl-8 z-10",
                              columnVisibility.index ? "left-16" : "left-0",
                            )}
                          >
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
                        <TableCell className={cn("sticky bg-gray-50 border-r-2 border-gray-200 text-center text-sm font-semibold text-slate-700 z-10", expectedTimeLeftClass)}>
                          {hasSubClasses
                            ? "-"
                            : minutesToTimeString(
                              currentDept.stages.reduce(
                                (sum, stage) => (resolveStageApplicable(cls.stages, stage.id) ? sum + (stage.estimated_time || 0) : sum),
                                0,
                              ),
                            )}
                        </TableCell>
                        <TableCell className={cn("sticky bg-gray-50 border-r-2 border-gray-200 text-center text-sm z-10 p-0", promisedTimeLeftClass)}>
                          {hasSubClasses ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <PromisedTimeCell leaf={{ subdeptId: subdept.id, classId: cls.id, subclassId: null, level: 3 }} />
                          )}
                        </TableCell>
                        {columnVisibility.stageName && (
                          <TableCell
                            className={cn("sticky bg-gray-50 border-r-2 border-gray-200 text-center text-sm z-10", stageNameLeftClass)}
                          ></TableCell>
                        )}
                        {filteredStages.map((stage, stageIndex) => {
                          const stageAllocation = cls.stages?.find((s) => s.stage_id === stage.id)
                          const hasAllocation = stageAllocation?.applicable ?? true
                          const hasDisplay = stageAllocation?.display ?? true
                          const columnClass = stageIndex % 2 === 0 ? "bg-white" : "bg-gray-100/80"

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
                                        value={hasAllocation ? "applicable" : "not-applicable"}
                                        onValueChange={(value) =>
                                          handleAllocationChange(subdept.id, stage.id, value === "applicable", cls.id)
                                        }
                                      >
                                        <SelectTrigger className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-gray-200/50">
                                          <SelectValue>
                                            <div className="flex items-center gap-1">
                                              <div
                                                className={`w-2 h-2 rounded-full ${hasAllocation ? "bg-green-500" : "bg-red-500"}`}
                                              ></div>
                                              <span className="font-medium">{hasAllocation ? "Yes" : "No"}</span>
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
                                          handleDisplayToggle(subdept.id, stage.id, checked as boolean, cls.id)
                                        }
                                        disabled={!hasAllocation}
                                        className="h-4 w-4 text-blue-500"
                                      />
                                    </div>
                                  </div>
                                )
                              ) : (
                                <div className="flex items-center justify-center p-2 text-gray-500">-</div>
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>,
                    )

                    // Add subclass rows if class is expanded
                    if (isClassExpanded && hasSubClasses) {
                      cls.subClasses?.forEach((subCls, subClsIndex) => {
                        rows.push(
                          <TableRow
                            key={`subclass-${subdept.id}-${cls.id}-${subCls.id}`}
                            className="border-b border-gray-200"
                          >
                            {columnVisibility.index && (
                              <TableCell className="sticky left-0 bg-white border-r-2 border-gray-200 text-center text-sm z-10 font-semibold">
                                {rowIndex}.{clsIndex + 1}.{subClsIndex + 1}
                              </TableCell>
                            )}
                            {columnVisibility.entity && (
                              <TableCell
                                className={cn(
                                  "sticky bg-white border-r-2 border-gray-200 pl-16 z-10",
                                  columnVisibility.index ? "left-16" : "left-0",
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="h-3 w-3 text-gray-500" />
                                  <span className="text-gray-700 text-sm font-medium">{subCls.name}</span>
                                </div>
                              </TableCell>
                            )}
                            <TableCell className={cn("sticky bg-white border-r-2 border-gray-200 text-center text-sm font-semibold text-slate-700 z-10", expectedTimeLeftClass)}>
                              {minutesToTimeString(
                                currentDept.stages.reduce(
                                  (sum, stage) => (resolveStageApplicable(subCls.stages, stage.id) ? sum + (stage.estimated_time || 0) : sum),
                                  0,
                                ),
                              )}
                            </TableCell>
                            <TableCell className={cn("sticky bg-white border-r-2 border-gray-200 text-center text-sm z-10 p-0", promisedTimeLeftClass)}>
                              <PromisedTimeCell leaf={{ subdeptId: subdept.id, classId: cls.id, subclassId: subCls.id, level: 4 }} />
                            </TableCell>
                            {columnVisibility.stageName && (
                              <TableCell
                                className={cn("sticky bg-white border-r-2 border-gray-200 text-center text-sm z-10", stageNameLeftClass)}
                              ></TableCell>
                            )}
                            {filteredStages.map((stage, stageIndex) => {
                              const stageAllocation = subCls.stages?.find((s) => s.stage_id === stage.id)
                              const hasAllocation = stageAllocation?.applicable ?? true
                              const hasDisplay = stageAllocation?.display ?? true
                              const columnClass = stageIndex % 2 === 0 ? "bg-white" : "bg-gray-50/80"

                              return (
                                <TableCell
                                  key={`subclass-${subdept.id}-${cls.id}-${subCls.id}-${stage.id}`}
                                  className={cn("border-x border-gray-200 p-0", columnClass)}
                                >
                                  {columnVisibility.controls && (
                                    <div className="grid grid-cols-2 gap-1 p-1">
                                      <div className="flex justify-center">
                                        <Select
                                          value={hasAllocation ? "applicable" : "not-applicable"}
                                          onValueChange={(value) =>
                                            handleAllocationChange(
                                              subdept.id,
                                              stage.id,
                                              value === "applicable",
                                              cls.id,
                                              subCls.id,
                                            )
                                          }
                                        >
                                          <SelectTrigger className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-gray-200/50">
                                            <SelectValue>
                                              <div className="flex items-center gap-1">
                                                <div
                                                  className={`w-2 h-2 rounded-full ${hasAllocation ? "bg-green-500" : "bg-red-500"}`}
                                                ></div>
                                                <span className="font-medium">{hasAllocation ? "Yes" : "No"}</span>
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
                                            handleDisplayToggle(
                                              subdept.id,
                                              stage.id,
                                              checked as boolean,
                                              cls.id,
                                              subCls.id,
                                            )
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
                          </TableRow>,
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
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-slate-50/50">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Showing {((standardPage - 1) * standardPageSize) + 1}–{Math.min(standardPage * standardPageSize, totalItems)} of {totalItems} subdepartments</span>
              <Select value={String(standardPageSize)} onValueChange={(val) => { setStandardPageSize(Number(val)); setStandardPage(1) }}>
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setStandardPage(1)} disabled={standardPage === 1} className="h-8">
                <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStandardPage(p => Math.max(1, p - 1))} disabled={standardPage === 1} className="h-8">
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-sm font-medium text-gray-700 px-3">Page {standardPage} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setStandardPage(p => Math.min(totalPages, p + 1))} disabled={standardPage === totalPages} className="h-8">
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStandardPage(totalPages)} disabled={standardPage === totalPages} className="h-8">
                <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

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

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-4">
        {/* Header Bar */}
        <div className="border-b border-slate-200 bg-white px-8 py-4 flex items-center justify-between antialiased">
          <div className="flex items-center gap-8">
            <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight leading-none text-center">Stages Management</h1>
            <div className="flex items-center text-base font-bold gap-2">
              <span className="text-slate-900">{currentDept?.name || "Select Department"}</span>
              {isTransposed && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-500">Transposed View</span>
                </>
              )}
              {stageSearchQuery && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className="text-amber-600">Searching: "{stageSearchQuery}"</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Stage Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search stages..."
                value={stageSearchQuery}
                onChange={(e) => setStageSearchQuery(e.target.value)}
                className="w-56 h-9 pl-9 pr-8 bg-white border-slate-300 rounded-md text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
              {stageSearchQuery && (
                <button
                  onClick={() => setStageSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* View Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTransposed(!isTransposed)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                isTransposed
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {isTransposed ? <RotateCcw className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
              {isTransposed ? 'Normal View' : 'Transposed View'}
            </Button>

            {/* Expand/Collapse All */}
            <Button
              variant="outline"
              size="sm"
              onClick={areAllRowsExpanded ? collapseAllRows : expandAllRows}
              className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              {areAllRowsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {areAllRowsExpanded ? 'Collapse All' : 'Expand All'}
            </Button>

            {/* Column Visibility */}
            <ColumnVisibilityControl
              columns={columnVisibilityOptions}
              onVisibilityChange={handleColumnVisibilityChange}
              onShowAll={handleShowAllColumns}
              onHideAll={handleHideAllColumns}
              onResetToDefault={handleResetToDefault}
              title="Column Visibility"
              description="Control which columns are visible in the table"
            />

            {/* Entity Visibility */}
            <EntityVisibilityControl
              entities={entityVisibilityOptions}
              onVisibilityChange={handleEntityVisibilityChange}
              onShowAll={handleShowAllEntities}
              onHideAll={handleHideAllEntities}
              onResetToDefault={handleResetEntitiesToDefault}
              showDefaultDisplayOnly={showDefaultDisplayOnly}
              onToggleDefaultDisplay={() => setShowDefaultDisplayOnly(!showDefaultDisplayOnly)}
              title={isTransposed ? "Entity Column Visibility" : "Entity Row Visibility"}
              description={
                isTransposed
                  ? "Control which entities are visible as columns. Items marked with ★ are set as default display."
                  : "Control which departments, classes, and subclasses are visible as rows. Items marked with ★ are set as default display."
              }
            />

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToExcel}
              disabled={!currentDept || !currentDept.stages || currentDept.stages.length === 0}
              className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculateExpectedTimes}
              disabled={!currentDept || isRecalculatingExpectedTimes}
              className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
              title="Recompute and persist Overall Expected Time for every job level in this department"
            >
              <Clock className={cn("h-3.5 w-3.5", isRecalculatingExpectedTimes && "animate-spin")} />
              {isRecalculatingExpectedTimes ? 'Recalculating...' : 'Recalculate Times'}
            </Button>

            <AddStageDialog
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              onAddStages={handleAddStages}
              departments={departmentList}
              officers={userData.officers}
            />
          </div>
        </div>

        {/* Department Tabs */}
        <div className="px-8 py-3 flex items-center border-b border-slate-200 bg-white">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
            {departments.map((dept) => {
              const isActive = activeTab === dept.id
              return (
                <button
                  key={dept.id}
                  onClick={() => setActiveTab(dept.id)}
                  className={cn(
                    "group px-5 py-2 text-sm font-bold rounded-full transition-all flex items-center gap-2",
                    isActive
                      ? "bg-custom-blue text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {dept.name}
                  {dept.stages.length > 0 && (
                    <span
                      className="inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm"
                      style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' } : { backgroundColor: '#376bae', color: '#fff' }}
                    >
                      {dept.stages.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tabs Content */}
        <div className="px-8 py-4">

          {(() => {
            const dept = departments.find(d => d.id === activeTab)
            if (!dept) return null
            return (
              <div className="space-y-4">
                {dept.stages.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No stages yet</h3>
                    <p className="text-sm text-gray-500 mb-4">Create your first stage to get started with the workflow</p>
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Stage
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <span className="font-medium">Current View:</span>
                      <Badge variant="outline" className="text-xs">
                        {isTransposed ? "Transposed (Stages as Rows)" : "Standard (Entities as Rows)"}
                      </Badge>
                    </div>
                    {isTransposed ? renderTransposedTable() : renderNormalTable()}
                  </>
                )}
              </div>
            )
          })()}
        </div>

        <EditStageDialog
          open={isEditDialogOpen || !!editingStage}
          onOpenChange={(open) => {
            if (!open) {
              setEditingStage(null)
              setIsEditDialogOpen(false)
            }
          }}
          stage={editingStage}
          onSave={handleUpdateStage}
          officers={userData.officers}
          departmentName={currentDept?.name}
        />
      </div>
    </div>
  )
}
