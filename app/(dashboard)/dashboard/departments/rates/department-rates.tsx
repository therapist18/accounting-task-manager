// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon, Calculator, Minus, Plus, Save, DollarSign, Clock, ChevronDown, History, Copy, Eye, ChevronRight, Info, Download, FileSpreadsheet, DownloadCloud, EyeOff, ChevronUp, Settings } from "lucide-react"
import { HistoricalRatesDialog, NewPeriodDialog, ExchangeRatesDialog } from "./components/dialogs"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../departments/database"
import { supabase } from "@/lib/supabase/client"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "../main-shared-components/column-visibility"
import EntityVisibilityControl, { EntityVisibilityOption } from "../main-shared-components/entity-visibility"

interface RateData {
  usd: number
  ksh: number
}

interface RateEntry {
  id: string
  entityType: 'subdepartment' | 'class' | 'subclass'
  entityId: string
  entityName: string
  entityPath: string
  processingFee: {
    amount: number
    currency: 'USD' | 'KSH'
    rate: number
  }
  issuanceFee: {
    amount: number
    currency: 'USD' | 'KSH'
    rate: number
    periodType: string[]
    periodCount: string[]
  }
  bclConsultancy: {
    tier1: number
    tier2: number
    tier3: number
  }
  officer: {
    bossFixed: number
    paTier1: number
    paEditable: number
  }
  extraConsideration: {
    tccCompany: {
      applicable: boolean
      value: number
    }
    tccIndividual: {
      applicable: boolean
      value: number
    }
    auditorsFee: {
      applicable: boolean
      value: number
    }
    degree: {
      applicable: boolean
      value: number
    }
    tfFile: {
      applicable: boolean
      value: number
    }
  }
  convenienceFee: {
    alienAssistance: {
      applicable: boolean
      value: number
    }
    reEntryApproval: {
      applicable: boolean
      value: number
    }
    passportEndorsement: {
      applicable: boolean
      value: number
    }
  }
}

interface RatePeriod {
  id?: number
  departmentId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  data: RateEntry[]
  exchangeRates: RateData
  createdAt?: Date
  createdBy?: string
  description?: string
  isActive?: boolean
}

interface Subdepartment {
  id: number
  name: string
  description?: string
  order?: number
  default_display?: boolean
  classes?: Array<{
    id: number | string
    name: string
    description: string | null
    order?: number
    default_display?: boolean
    subClasses?: Array<{
      id: number | string
      name: string
      description: string | null
      order?: number
      default_display?: boolean
    }>
  }>
}

interface Department {
  id: string
  name: string
  description?: string
  order?: number
  default_display?: boolean
  tm_subdepartments?: Subdepartment[]
}

interface DepartmentRatesProps {
  departments?: Department[]
}

// Utility function to sort items by order field
const sortByOrder = <T extends { order?: number }>(items: T[]): T[] => {
  return [...items].sort((a, b) => (a.order || 0) - (b.order || 0))
}

// Utility function to filter items by default display
const filterByDefaultDisplay = <T extends { default_display?: boolean }>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items
  return items.filter(item => item.default_display !== false)
}

// Helper function to get alternating blue colors like in stages
const getColumnColor = (index: number) => {
  const colors = [
    'bg-blue-50/30',
    'bg-blue-50/30', 
    'bg-blue-50/30',
    'bg-blue-50/30',
    'bg-blue-50/30',
    'bg-indigo-50/30'
  ]
  return colors[index % colors.length]
}

const getHeaderColor = (index: number) => {
  return index % 2 === 0 ? 'bg-blue-700' : 'bg-blue-700'
}

export default function DepartmentRates({ departments: initialDepartments }: DepartmentRatesProps) {
  const [rates, setRates] = useState<RateData>({ usd: 130, ksh: 1 })
  const [tempRates, setTempRates] = useState<RateData>({ usd: 130, ksh: 1 })
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isNewPeriodDialogOpen, setIsNewPeriodDialogOpen] = useState(false)
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [isLoading, setIsLoading] = useState(!initialDepartments)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [historicalPeriods, setHistoricalPeriods] = useState<RatePeriod[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [density, setDensity] = useState<'comfortable' | 'compact' | 'spacious'>('comfortable')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showDefaultDisplayOnly, setShowDefaultDisplayOnly] = useState(false)

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({
    index: true,
    entity: true,
    processingFee: true,
    issuanceFee: true,
    bclConsultancy: true,
    officer: true,
    extraConsideration: true,
    convenienceFee: true,
  })

  // Entity visibility state
  const [entityVisibility, setEntityVisibility] = useState<Record<string, boolean>>({})

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
      label: 'Entity',
      visible: columnVisibility.entity,
      disabled: true, // Always show entity
      isDefault: true,
      group: 'Basic'
    },
    {
      id: 'processingFee',
      label: 'Processing Fee',
      visible: columnVisibility.processingFee,
      isDefault: true,
      group: 'Fees'
    },
    {
      id: 'issuanceFee',
      label: 'Issuance Fee',
      visible: columnVisibility.issuanceFee,
      isDefault: true,
      group: 'Fees'
    },
    {
      id: 'bclConsultancy',
      label: 'BCL Consultancy',
      visible: columnVisibility.bclConsultancy,
      isDefault: true,
      group: 'Services'
    },
    {
      id: 'officer',
      label: 'Officer',
      visible: columnVisibility.officer,
      isDefault: true,
      group: 'Services'
    },
    {
      id: 'extraConsideration',
      label: 'Extra Consideration',
      visible: columnVisibility.extraConsideration,
      isDefault: false,
      group: 'Additional'
    },
    {
      id: 'convenienceFee',
      label: 'Convenience Fee',
      visible: columnVisibility.convenienceFee,
      isDefault: false,
      group: 'Additional'
    }
  ], [columnVisibility])

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
      processingFee: true,
      issuanceFee: true,
      bclConsultancy: true,
      officer: true,
      extraConsideration: true,
      convenienceFee: true,
    })
  }

  const handleHideAllColumns = () => {
    setColumnVisibility({
      index: true, // Keep required columns
      entity: true, // Keep required columns
      processingFee: false,
      issuanceFee: false,
      bclConsultancy: false,
      officer: false,
      extraConsideration: false,
      convenienceFee: false,
    })
  }

  const handleResetToDefault = () => {
    setColumnVisibility({
      index: true,
      entity: true,
      processingFee: true,
      issuanceFee: true,
      bclConsultancy: true,
      officer: true,
      extraConsideration: false,
      convenienceFee: false,
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

  const [currentPeriod, setCurrentPeriod] = useState<RatePeriod>({
    departmentId: '',
    effectiveFrom: new Date(),
    effectiveTo: null,
    data: [],
    exchangeRates: { usd: 130, ksh: 1 },
    description: '',
    isActive: true
  })

  const [newPeriodForm, setNewPeriodForm] = useState({
    effectiveFrom: new Date(),
    effectiveTo: null as Date | null,
    description: '',
    copyFromPeriod: null as number | null
  })

  const periodOptions = ["months", "years"]
  const countOptions = ["1", "2", "3", "6", "12"]

  const generateRateId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }

  // Process departments based on display settings
  const getProcessedDepartments = () => {
    let processedDepts = [...departments]
    
    // Sort departments by order
    processedDepts = sortByOrder(processedDepts)
    
    // Filter by default display if needed
    processedDepts = filterByDefaultDisplay(processedDepts, showDefaultDisplayOnly)
    
    // Process subdepartments, classes, and subclasses within each department
    return processedDepts.map(dept => ({
      ...dept,
      tm_subdepartments: filterByDefaultDisplay(
        sortByOrder(dept.tm_subdepartments || []).map(subdept => ({
          ...subdept,
          classes: filterByDefaultDisplay(
            sortByOrder(subdept.classes || []).map(cls => ({
              ...cls,
              subClasses: filterByDefaultDisplay(
                sortByOrder(cls.subClasses || []),
                showDefaultDisplayOnly
              )
            })),
            showDefaultDisplayOnly
          )
        })),
        showDefaultDisplayOnly
      )
    }))
  }

   // Generate entity visibility options based on current department
   const entityVisibilityOptions: EntityVisibilityOption[] = useMemo(() => {
    const processedDepts = getProcessedDepartments()
    const currentDept = processedDepts.find(d => d.id === selectedDepartment)
    if (!currentDept) return []

    const entities: EntityVisibilityOption[] = []

    currentDept.tm_subdepartments?.forEach((subdept) => {
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
  }, [departments, selectedDepartment, entityVisibility])
  
  // Get grouped entries based on processed data and entity visibility
  const getGroupedEntries = (dept: Department) => {
    return currentPeriod.data
      .filter(entry => {
        // Filter by entity visibility
        const parts = entry.entityPath.split(' → ')
        const subdept = parts[0]
        const cls = parts[1]
        const subcls = parts[2]

        const subdeptId = `subdept-${entry.entityId.split('-')[0]}`
        if (entityVisibility[subdeptId] === false) return false

        if (cls) {
          const classId = `class-${entry.entityId.split('-')[0]}-${entry.entityId.split('-')[1]}`
          if (entityVisibility[classId] === false) return false

          if (subcls) {
            const subclassId = `subclass-${entry.entityId}`
            if (entityVisibility[subclassId] === false) return false
          }
        }

        return true
      })
      .reduce((acc, entry) => {
        const parts = entry.entityPath.split(' → ')
        const subdept = parts[0]
        const cls = parts[1]
        const subcls = parts[2]
   
        if (!acc[subdept]) {
          acc[subdept] = { direct: [], classes: {} }
        }
   
        if (cls) {
          if (!acc[subdept].classes[cls]) {
            acc[subdept].classes[cls] = { direct: [], subclasses: {} }
          }
   
          if (subcls) {
            if (!acc[subdept].classes[cls].subclasses[subcls]) {
              acc[subdept].classes[cls].subclasses[subcls] = []
            }
            acc[subdept].classes[cls].subclasses[subcls].push(entry)
          } else {
            acc[subdept].classes[cls].direct.push(entry)
          }
        } else {
          acc[subdept].direct.push(entry)
        }
   
        return acc
      }, {} as Record<string, { direct: RateEntry[], classes: Record<string, { direct: RateEntry[], subclasses: Record<string, RateEntry[]> }> }>)
  }

  // Expand/Collapse All functionality
  const expandAllRows = () => {
    const currentDept = getProcessedDepartments().find(d => d.id === selectedDepartment)
    if (!currentDept) return

    const rowIds = new Set<string>()
    
    // Get all potential row IDs based on processed data
    const groupedEntries = getGroupedEntries(currentDept)
    
    Object.entries(groupedEntries).forEach(([subdeptName, subdeptData]) => {
      const totalEntries = subdeptData.direct.length + Object.values(subdeptData.classes).reduce((sum, cls) =>
        sum + cls.direct.length + Object.values(cls.subclasses).reduce((subSum, subEntries) => subSum + subEntries.length, 0), 0
      )

      if (totalEntries > 1) {
        const groupRowId = `group-${subdeptName}`
        rowIds.add(groupRowId)

        Object.entries(subdeptData.classes).forEach(([className, classData]) => {
          const classEntryCount = classData.direct.length + Object.values(classData.subclasses).reduce((sum, entries) => sum + entries.length, 0)
          if (classEntryCount > 1 || Object.keys(classData.subclasses).length > 0) {
            const classRowId = `class-${subdeptName}-${className}`
            rowIds.add(classRowId)

            Object.entries(classData.subclasses).forEach(([subclassName, subclassEntries]) => {
              if (subclassEntries.length > 1) {
                const subclassRowId = `subclass-${subdeptName}-${className}-${subclassName}`
                rowIds.add(subclassRowId)
              }
            })
          }
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
    const currentDept = getProcessedDepartments().find(d => d.id === selectedDepartment)
    if (!currentDept) return false

    const groupedEntries = getGroupedEntries(currentDept)
    let totalExpandableRows = 0
    let expandedCount = 0

    Object.entries(groupedEntries).forEach(([subdeptName, subdeptData]) => {
      const totalEntries = subdeptData.direct.length + Object.values(subdeptData.classes).reduce((sum, cls) =>
        sum + cls.direct.length + Object.values(cls.subclasses).reduce((subSum, subEntries) => subSum + subEntries.length, 0), 0
      )

      if (totalEntries > 1) {
        const groupRowId = `group-${subdeptName}`
        totalExpandableRows++
        if (expandedRows.has(groupRowId)) {
          expandedCount++
        }

        Object.entries(subdeptData.classes).forEach(([className, classData]) => {
          const classEntryCount = classData.direct.length + Object.values(classData.subclasses).reduce((sum, entries) => sum + entries.length, 0)
          if (classEntryCount > 1 || Object.keys(classData.subclasses).length > 0) {
            const classRowId = `class-${subdeptName}-${className}`
            totalExpandableRows++
            if (expandedRows.has(classRowId)) {
              expandedCount++
            }

            Object.entries(classData.subclasses).forEach(([subclassName, subclassEntries]) => {
              if (subclassEntries.length > 1) {
                const subclassRowId = `subclass-${subdeptName}-${className}-${subclassName}`
                totalExpandableRows++
                if (expandedRows.has(subclassRowId)) {
                  expandedCount++
                }
              }
            })
          }
        })
      }
    })

    return totalExpandableRows > 0 && expandedCount === totalExpandableRows
  }, [expandedRows, selectedDepartment, departments, showDefaultDisplayOnly, entityVisibility])

  // Helper function to safely access extraConsideration fields
  const getExtraConsiderationField = (entry: RateEntry, fieldKey: string) => {
    const field = entry.extraConsideration?.[fieldKey as keyof typeof entry.extraConsideration];
    return field || { applicable: false, value: 0 };
  };

  // Helper function to safely access convenienceFee fields
  const getConvenienceFeeField = (entry: RateEntry, fieldKey: string) => {
    const field = entry.convenienceFee?.[fieldKey as keyof typeof entry.convenienceFee];
    return field || { applicable: false, value: 0 };
  };

  // Calculate totals for each column - FIXED VERSION
  const calculateTotals = () => {
    // Only calculate totals for visible entries
    const currentDept = getProcessedDepartments().find(d => d.id === selectedDepartment)
    if (!currentDept) return {
      processingFeeRate: 0, issuanceFeeRate: 0, bclTier1: 0, bclTier2: 0, bclTier3: 0,
      officerBossFixed: 0, officerPaTier1: 0, officerPaEditable: 0,
      extraTccCompany: 0, extraTccIndividual: 0, extraAuditorsFee: 0, extraDegree: 0, extraTfFile: 0,
      convenienceAlienAssistance: 0, convenienceReEntryApproval: 0, conveniencePassportEndorsement: 0,
    }

    const visibleEntries = currentPeriod.data.filter(entry => {
      const parts = entry.entityPath.split(' → ')
      const subdept = parts[0]
      const cls = parts[1]
      const subcls = parts[2]

      const subdeptId = `subdept-${entry.entityId.split('-')[0]}`
      if (entityVisibility[subdeptId] === false) return false

      if (cls) {
        const classId = `class-${entry.entityId.split('-')[0]}-${entry.entityId.split('-')[1]}`
        if (entityVisibility[classId] === false) return false

        if (subcls) {
          const subclassId = `subclass-${entry.entityId}`
          if (entityVisibility[subclassId] === false) return false
        }
      }

      return true
    })

    return visibleEntries.reduce((totals, entry) => {
      // Safe access to nested properties
      const processingFee = entry.processingFee || { rate: 0 }
      const issuanceFee = entry.issuanceFee || { rate: 0 }
      const bclConsultancy = entry.bclConsultancy || { tier1: 0, tier2: 0, tier3: 0 }
      const officer = entry.officer || { bossFixed: 0, paTier1: 0, paEditable: 0 }

      return {
        processingFeeRate: totals.processingFeeRate + (processingFee.rate || 0),
        issuanceFeeRate: totals.issuanceFeeRate + (issuanceFee.rate || 0),
        bclTier1: totals.bclTier1 + (bclConsultancy.tier1 || 0),
        bclTier2: totals.bclTier2 + (bclConsultancy.tier2 || 0),
        bclTier3: totals.bclTier3 + (bclConsultancy.tier3 || 0),
        officerBossFixed: totals.officerBossFixed + (officer.bossFixed || 0),
        officerPaTier1: totals.officerPaTier1 + (officer.paTier1 || 0),
        officerPaEditable: totals.officerPaEditable + (officer.paEditable || 0),
        // Use safe helper functions for extraConsideration
        extraTccCompany: totals.extraTccCompany + (getExtraConsiderationField(entry, 'tccCompany').applicable ? getExtraConsiderationField(entry, 'tccCompany').value : 0),
        extraTccIndividual: totals.extraTccIndividual + (getExtraConsiderationField(entry, 'tccIndividual').applicable ? getExtraConsiderationField(entry, 'tccIndividual').value : 0),
        extraAuditorsFee: totals.extraAuditorsFee + (getExtraConsiderationField(entry, 'auditorsFee').applicable ? getExtraConsiderationField(entry, 'auditorsFee').value : 0),
        extraDegree: totals.extraDegree + (getExtraConsiderationField(entry, 'degree').applicable ? getExtraConsiderationField(entry, 'degree').value : 0),
        extraTfFile: totals.extraTfFile + (getExtraConsiderationField(entry, 'tfFile').applicable ? getExtraConsiderationField(entry, 'tfFile').value : 0),
        // Use safe helper functions for convenienceFee
        convenienceAlienAssistance: totals.convenienceAlienAssistance + (getConvenienceFeeField(entry, 'alienAssistance').applicable ? getConvenienceFeeField(entry, 'alienAssistance').value : 0),
        convenienceReEntryApproval: totals.convenienceReEntryApproval + (getConvenienceFeeField(entry, 'reEntryApproval').applicable ? getConvenienceFeeField(entry, 'reEntryApproval').value : 0),
        conveniencePassportEndorsement: totals.conveniencePassportEndorsement + (getConvenienceFeeField(entry, 'passportEndorsement').applicable ? getConvenienceFeeField(entry, 'passportEndorsement').value : 0),
      }
    }, {
      processingFeeRate: 0,
      issuanceFeeRate: 0,
      bclTier1: 0,
      bclTier2: 0,
      bclTier3: 0,
      officerBossFixed: 0,
      officerPaTier1: 0,
      officerPaEditable: 0,
      extraTccCompany: 0,
      extraTccIndividual: 0,
      extraAuditorsFee: 0,
      extraDegree: 0,
      extraTfFile: 0,
      convenienceAlienAssistance: 0,
      convenienceReEntryApproval: 0,
      conveniencePassportEndorsement: 0,
    })
  }

  // Auto-save function with debounce
  const debouncedSave = useCallback(
    debounce(async () => {
      if (!selectedDepartment || currentPeriod.data.length === 0 || isReadOnly) {
        return
      }

      setSaving(true)
      try {
        if (currentPeriod.id) {
          const { error } = await supabase
            .from('rates_history')
            .update({
              rates_data: currentPeriod.data,
              exchange_rates: rates,
              description: currentPeriod.description,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentPeriod.id)

          if (error) throw error
        } else {
          const { error } = await supabase
            .from('rates_history')
            .insert({
              department_id: selectedDepartment,
              effective_from: currentPeriod.effectiveFrom.toISOString().split('T')[0],
              effective_to: currentPeriod.effectiveTo?.toISOString().split('T')[0] || null,
              rates_data: currentPeriod.data,
              exchange_rates: rates,
              description: currentPeriod.description || '',
              is_active: true,
              created_by: 'current_user'
            })

          if (error) throw error
        }

        setHasUnsavedChanges(false)

        // Silent success - no toast for auto-save
        await loadCurrentRates(selectedDepartment)
      } catch (error) {
        console.error('Error auto-saving rates:', error)
        // Only show error toast
        toast({
          title: "Auto-save failed",
          description: "Your changes are temporarily saved locally. Try refreshing the page.",
          variant: "destructive"
        })
      } finally {
        setSaving(false)
      }
    }, 1000),
    [selectedDepartment, currentPeriod, rates, isReadOnly]
  )

  // Debounce utility function
  function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        if (!isReadOnly) {
          debouncedSave()
          toast({
            title: "Saving...",
            description: "Your changes are being saved.",
          })
        }
      }

      if (event.key === 'Escape') {
        // Clear focus from any input
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [debouncedSave, isReadOnly])

  // Export function
  const exportToCSV = () => {
    const processedDepts = getProcessedDepartments()
    const currentDept = processedDepts.find(d => d.id === selectedDepartment)
    if (!currentDept || currentPeriod.data.length === 0) {
      toast({
        title: "No data to export",
        description: "Please select a department with rate data",
        variant: "destructive"
      })
      return
    }

    const headers = [
      'Index',
      'Entity Name',
      'Processing Fee Amount',
      'Processing Fee Currency',
      'Processing Fee (KSH)',
      'Issuance Fee Amount',
      'Issuance Fee Currency',
      'Issuance Fee (KSH)',
      'Period Types',
      'Period Counts',
      'BCL Tier 1',
      'BCL Tier 2',
      'BCL Tier 3',
      'Officer Boss Fixed',
      'Officer PA Tier 1',
      'Officer PA Editable',
      // Extra Consideration fields
      'TCC Company Applicable',
      'TCC Company Value',
      'TCC Individual Applicable',
      'TCC Individual Value',
      'Auditors Fee Applicable',
      'Auditors Fee Value',
      'Degree Applicable',
      'Degree Value',
      'TF File Applicable',
      'TF File Value',
      // Convenience Fee fields
      'Alien Assistance Applicable',
      'Alien Assistance Value',
      'Re-Entry Approval Applicable',
      'Re-Entry Approval Value',
      'Passport Endorsement Applicable',
      'Passport Endorsement Value'
    ]

    const totals = calculateTotals()

    // Only export visible entries
    const visibleEntries = currentPeriod.data.filter(entry => {
      const parts = entry.entityPath.split(' → ')
      const subdept = parts[0]
      const cls = parts[1]
      const subcls = parts[2]

      const subdeptId = `subdept-${entry.entityId.split('-')[0]}`
      if (entityVisibility[subdeptId] === false) return false

      if (cls) {
        const classId = `class-${entry.entityId.split('-')[0]}-${entry.entityId.split('-')[1]}`
        if (entityVisibility[classId] === false) return false

        if (subcls) {
          const subclassId = `subclass-${entry.entityId}`
          if (entityVisibility[subclassId] === false) return false
        }
      }

      return true
    })

    const csvData = visibleEntries.map((entry, index) => [
      index + 1,
      entry.entityName,
      entry.processingFee?.amount || 0,
      entry.processingFee?.currency || 'KSH',
      entry.processingFee?.rate || 0,
      entry.issuanceFee?.amount || 0,
      entry.issuanceFee?.currency || 'KSH',
      entry.issuanceFee?.rate || 0,
      entry.issuanceFee?.periodType?.join('; ') || '',
      entry.issuanceFee?.periodCount?.join('; ') || '',
      entry.bclConsultancy?.tier1 || 0,
      entry.bclConsultancy?.tier2 || 0,
      entry.bclConsultancy?.tier3 || 0,
      entry.officer?.bossFixed || 0,
      entry.officer?.paTier1 || 0,
      entry.officer?.paEditable || 0,
      // Extra Consideration fields
      getExtraConsiderationField(entry, 'tccCompany').applicable ? 'Yes' : 'No',
      getExtraConsiderationField(entry, 'tccCompany').value,
      getExtraConsiderationField(entry, 'tccIndividual').applicable ? 'Yes' : 'No',
      getExtraConsiderationField(entry, 'tccIndividual').value,
      getExtraConsiderationField(entry, 'auditorsFee').value,
      getExtraConsiderationField(entry, 'degree').applicable ? 'Yes' : 'No',
      getExtraConsiderationField(entry, 'degree').value,
      getExtraConsiderationField(entry, 'tfFile').applicable ? 'Yes' : 'No',
      getExtraConsiderationField(entry, 'tfFile').value,
      // Convenience Fee fields
      getConvenienceFeeField(entry, 'alienAssistance').applicable ? 'Yes' : 'No',
      getConvenienceFeeField(entry, 'alienAssistance').value,
      getConvenienceFeeField(entry, 'reEntryApproval').applicable ? 'Yes' : 'No',
      getConvenienceFeeField(entry, 'reEntryApproval').value,
      getConvenienceFeeField(entry, 'passportEndorsement').applicable ? 'Yes' : 'No',
      getConvenienceFeeField(entry, 'passportEndorsement').value
    ])

    // Add totals row
    const totalsRow = [
      'TOTALS',
      '',
      '',
      '',
      totals.processingFeeRate,
      '',
      '',
      totals.issuanceFeeRate,
      '',
      '',
      totals.bclTier1,
      totals.bclTier2,
      totals.bclTier3,
      totals.officerBossFixed,
      totals.officerPaTier1,
      totals.officerPaEditable,
      '',
      totals.extraTccCompany,
      '',
      totals.extraTccIndividual,
      '',
      totals.extraAuditorsFee,
      '',
      totals.extraDegree,
      '',
      totals.extraTfFile,
      '',
      totals.convenienceAlienAssistance,
      '',
      totals.convenienceReEntryApproval,
      '',
      totals.conveniencePassportEndorsement
    ]

    const csvContent = [headers, ...csvData, totalsRow]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${currentDept.name}_rates_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Export Successful",
      description: `Exported ${visibleEntries.length} visible rate entries with totals to CSV`,
    })
  }

  // Auto-save when data changes
  useEffect(() => {
    if (hasUnsavedChanges && !isReadOnly) {
      debouncedSave()
    }
  }, [currentPeriod.data, rates, hasUnsavedChanges, debouncedSave, isReadOnly])

  useEffect(() => {
    if (!initialDepartments) {
      const loadDepartments = async () => {
        try {
          setIsLoading(true)
          const fetchedDepartments = await fetchDepartments()
          const transformedDepartments = fetchedDepartments.map(dept => ({
            id: dept.id,
            name: dept.name,
            description: dept.description,
            order: dept.order,
            default_display: dept.default_display,
            tm_subdepartments: sortByOrder((dept.subdepartments || []).map(subdept => ({
              id: typeof subdept.id === 'string' ? parseInt(subdept.id) : subdept.id,
              name: subdept.name,
              description: subdept.description,
              order: subdept.order,
              default_display: subdept.default_display,
              classes: sortByOrder(((subdept as any).classes || []).map((cls: any) => ({
                ...cls,
                subClasses: sortByOrder(cls.subClasses || [])
              })))
            })))
          }))
          setDepartments(sortByOrder(transformedDepartments))
          if (transformedDepartments.length > 0) {
            setSelectedDepartment(transformedDepartments[0].id)
          }
        } catch (error) {
          console.error('Error fetching departments:', error)
          toast({
            title: "Error",
            description: "Failed to load departments. Please refresh the page.",
            variant: "destructive"
          })
        } finally {
          setIsLoading(false)
        }
      }
      loadDepartments()
    } else if (initialDepartments.length > 0) {
      setSelectedDepartment(initialDepartments[0].id)
    }
  }, [initialDepartments])

  useEffect(() => {
    if (selectedDepartment) {
      loadCurrentRates(selectedDepartment)
      loadHistoricalPeriods(selectedDepartment)
    }
  }, [selectedDepartment])

  const loadCurrentRates = async (departmentId: string) => {
    try {
      const { data: rateHistory, error } = await supabase
        .from('rates_history')
        .select('*')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)

      if (error) throw error

      if (rateHistory && rateHistory.length > 0) {
        const latestRates = rateHistory[0]
        const period: RatePeriod = {
          id: latestRates.id,
          departmentId: latestRates.department_id,
          effectiveFrom: new Date(latestRates.effective_from),
          effectiveTo: latestRates.effective_to ? new Date(latestRates.effective_to) : null,
          data: latestRates.rates_data || [],
          exchangeRates: latestRates.exchange_rates || { usd: 130, ksh: 1 },
          description: latestRates.description || '',
          isActive: latestRates.is_active,
          createdAt: new Date(latestRates.created_at),
          createdBy: latestRates.created_by
        }
        setCurrentPeriod(period)
        setRates(period.exchangeRates)
        setTempRates(period.exchangeRates)
        setIsReadOnly(false)
        setHasUnsavedChanges(false)
      } else {
        generateDefaultRates(departmentId)
      }
    } catch (error) {
      console.error('Error loading rates:', error)
      generateDefaultRates(departmentId)
    }
  }

  const loadHistoricalPeriods = async (departmentId: string) => {
    try {
      setLoadingHistory(true)
      const { data: history, error } = await supabase
        .from('rates_history')
        .select('*')
        .eq('department_id', departmentId)
        .order('effective_from', { ascending: false })

      if (error) throw error

      const periods: RatePeriod[] = (history || []).map(record => ({
        id: record.id,
        departmentId: record.department_id,
        effectiveFrom: new Date(record.effective_from),
        effectiveTo: record.effective_to ? new Date(record.effective_to) : null,
        data: record.rates_data || [],
        exchangeRates: record.exchange_rates || { usd: 130, ksh: 1 },
        description: record.description || '',
        isActive: record.is_active,
        createdAt: new Date(record.created_at),
        createdBy: record.created_by
      }))

      setHistoricalPeriods(periods)
    } catch (error) {
      console.error('Error loading historical periods:', error)
      toast({
        title: "Error",
        description: "Failed to load historical data.",
        variant: "destructive"
      })
    } finally {
      setLoadingHistory(false)
    }
  }

  const generateDefaultRates = (departmentId: string) => {
    const processedDepts = getProcessedDepartments()
    const currentDepartment = processedDepts.find(dept => dept.id === departmentId)
    if (!currentDepartment) return

    const defaultRates: RateEntry[] = []

    currentDepartment.tm_subdepartments?.forEach((subdept) => {
      if (subdept.classes && subdept.classes.length > 0) {
        subdept.classes.forEach((cls) => {
          if (cls.subClasses && cls.subClasses.length > 0) {
            cls.subClasses.forEach((subCls) => {
              defaultRates.push(createDefaultRateEntry(
                'subclass',
                `${subdept.id}-${cls.id}-${subCls.id}`,
                subCls.name,
                `${subdept.name} → ${cls.name} → ${subCls.name}`
              ))
            })
          } else {
            defaultRates.push(createDefaultRateEntry(
              'class',
              `${subdept.id}-${cls.id}`,
              cls.name,
              `${subdept.name} → ${cls.name}`
            ))
          }
        })
      } else {
        defaultRates.push(createDefaultRateEntry(
          'subdepartment',
          subdept.id.toString(),
          subdept.name,
          subdept.name
        ))
      }
    })

    setCurrentPeriod({
      departmentId,
      effectiveFrom: new Date(),
      effectiveTo: null,
      data: defaultRates,
      exchangeRates: rates,
      isActive: true
    })
    setIsReadOnly(false)
    setHasUnsavedChanges(true)
  }

  const createDefaultRateEntry = (
    entityType: 'subdepartment' | 'class' | 'subclass',
    entityId: string,
    entityName: string,
    entityPath: string
  ): RateEntry => ({
    id: generateRateId(),
    entityType,
    entityId,
    entityName,
    entityPath,
    processingFee: {
      amount: 5000,
      currency: 'KSH',
      rate: 5000
    },
    issuanceFee: {
      amount: 10000,
      currency: 'KSH',
      rate: 10000,
      periodType: ['years'],
      periodCount: ['1']
    },
    bclConsultancy: {
      tier1: 10000,
      tier2: 20000,
      tier3: 0
    },
    officer: {
      bossFixed: 5000,
      paTier1: 6000,
      paEditable: 0
    },
    extraConsideration: {
      tccCompany: { applicable: false, value: 5000 },
      tccIndividual: { applicable: false, value: 5000 },
      auditorsFee: { applicable: false, value: 5000 },
      degree: { applicable: false, value: 5000 },
      tfFile: { applicable: false, value: 5000 }
    },
    convenienceFee: {
      alienAssistance: { applicable: false, value: 1000 },
      reEntryApproval: { applicable: false, value: 1000 },
      passportEndorsement: { applicable: false, value: 1000 }
    }
  })

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

  const updateRateEntry = (entryId: string, updates: Partial<RateEntry>) => {
    if (isReadOnly) return

    setCurrentPeriod(prev => ({
      ...prev,
      data: prev.data.map(entry =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      )
    }))
    setHasUnsavedChanges(true)
  }

  const updateCurrency = (entryId: string, feeType: 'processingFee' | 'issuanceFee', currency: 'USD' | 'KSH') => {
    if (isReadOnly) return

    const entry = currentPeriod.data.find(e => e.id === entryId)
    if (!entry) return

    const rate = currency === 'USD' ? rates.usd : 1
    const amount = entry[feeType].amount
    const calculatedRate = currency === 'USD' ? amount * rate : amount

    updateRateEntry(entryId, {
      [feeType]: {
        ...entry[feeType],
        currency,
        rate: calculatedRate
      }
    })
  }
 
  const updateMultiSelect = (entryId: string, field: 'periodType' | 'periodCount', value: string, checked: boolean) => {
    if (isReadOnly) return
 
    const entry = currentPeriod.data.find(e => e.id === entryId)
    if (!entry) return
 
    const currentValues = entry.issuanceFee[field]
    const newValues = checked
      ? [...currentValues, value]
      : currentValues.filter(v => v !== value)
 
    updateRateEntry(entryId, {
      issuanceFee: {
        ...entry.issuanceFee,
        [field]: newValues
      }
    })
  }
 
  const handleCreateNewPeriod = async () => {
    if (!selectedDepartment) return
 
    setSaving(true)
    try {
      if (currentPeriod.id) {
        await supabase
          .from('rates_history')
          .update({ is_active: false })
          .eq('id', currentPeriod.id)
      }
 
      let newData = currentPeriod.data
 
      if (newPeriodForm.copyFromPeriod) {
        const sourcePeriod = historicalPeriods.find(p => p.id === newPeriodForm.copyFromPeriod)
        if (sourcePeriod) {
          newData = sourcePeriod.data.map(entry => ({
            ...entry,
            id: generateRateId()
          }))
        }
      }
 
      const { error } = await supabase
        .from('rates_history')
        .insert({
          department_id: selectedDepartment,
          effective_from: newPeriodForm.effectiveFrom.toISOString().split('T')[0],
          effective_to: newPeriodForm.effectiveTo?.toISOString().split('T')[0] || null,
          rates_data: newData,
          exchange_rates: rates,
          description: newPeriodForm.description,
          is_active: true,
          created_by: 'current_user'
        })
 
      if (error) throw error
 
      toast({
        title: "Success",
        description: "New rate period created successfully.",
      })
 
      setNewPeriodForm({
        effectiveFrom: new Date(),
        effectiveTo: null,
        description: '',
        copyFromPeriod: null
      })
      setIsNewPeriodDialogOpen(false)
 
      await loadCurrentRates(selectedDepartment)
      await loadHistoricalPeriods(selectedDepartment)
    } catch (error) {
      console.error('Error creating new period:', error)
      toast({
        title: "Error",
        description: "Failed to create new period. Please try again.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }
 
  const handleViewHistoricalPeriod = (period: RatePeriod) => {
    setCurrentPeriod(period)
    setRates(period.exchangeRates)
    setTempRates(period.exchangeRates)
    setIsReadOnly(!period.isActive)
    setIsHistoryDialogOpen(false)
    setHasUnsavedChanges(false)
 
    toast({
      title: "Historical Period Loaded",
      description: `Viewing rates from ${format(period.effectiveFrom, "PPP")}${period.isActive ? " (Active)" : " (Historical)"}`,
    })
  }
 
  const MultiSelectPopover = ({
    entryId,
    field,
    options,
    values,
    placeholder,
  }: {
    entryId: string
    field: 'periodType' | 'periodCount'
    options: string[]
    values: string[]
    placeholder: string
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left font-normal h-8 text-xs"
          disabled={isReadOnly}
        >
          <span className="truncate">
            {values.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : values.length === 1 ? (
              values[0]
            ) : (
              `${values.length} selected`
            )}
          </span>
          <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">Select Options</div>
          {options.map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <Checkbox
                id={`${entryId}-${field}-${option}`}
                checked={values.includes(option)}
                onCheckedChange={(checked) => updateMultiSelect(entryId, field, option, checked as boolean)}
                disabled={isReadOnly}
              />
              <Label
                htmlFor={`${entryId}-${field}-${option}`}
                className="text-sm cursor-pointer"
              >
                {option}
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
 
  const renderRateRow = (entry: RateEntry, index: string, isChild: boolean, depth: number = 0) => {
    const rowHeight = density === 'compact' ? 'h-10' : density === 'spacious' ? 'h-16' : 'h-12'
    const inputHeight = density === 'compact' ? 'h-7' : density === 'spacious' ? 'h-10' : 'h-8'
    const fontSize = density === 'compact' ? 'text-xs' : density === 'spacious' ? 'text-sm' : 'text-xs'
 
    const paddingLeft = depth === 0 ? '' : depth === 1 ? 'pl-6' : depth === 2 ? 'pl-12' : 'pl-16'
 
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (!isReadOnly) {
          // Move to next input or trigger save
          const inputs = document.querySelectorAll('input[type="number"], select')
          const currentIndex = Array.from(inputs).indexOf(e.target as HTMLElement)
          const nextInput = inputs[currentIndex + 1] as HTMLElement
          if (nextInput) {
            nextInput.focus()
          }
        }
      }
    }
 
    return (
      <TableRow
        key={entry.id}
        className={cn(
          isChild ? (depth === 1 ? 'bg-slate-50/50' : depth === 2 ? 'bg-blue-50/30' : 'bg-slate-100/50') : '',
          'hover:bg-muted/50',
          rowHeight,
          'transition-colors duration-150 ease-in-out',
          depth > 0 ? `border-l-2 ${depth === 1 ? 'border-l-blue-200' : 'border-l-blue-200'}` : ''
        )}
      >
        {columnVisibility.index && (
          <TableCell className={cn("sticky left-0 bg-blue-100 border-r-2 text-center z-30 px-2", fontSize, "font-medium")}>
            <div className="flex items-center justify-center">
              {index}
            </div>
          </TableCell>
        )}
 
        {columnVisibility.entity && (
          <TableCell className={cn(
            "sticky bg-blue-100 border-r-2 font-medium z-30 px-3",
            columnVisibility.index ? "left-16" : "left-0"
          )}>
            <div className={cn("flex items-center gap-2", paddingLeft)}>
              {isChild && (
                <div className="flex items-center text-muted-foreground">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <ChevronRight className={cn("h-3 w-3", depth === 2 ? 'text-blue-500' : 'text-blue-500')} />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <span className={cn("font-medium truncate", fontSize, depth === 2 ? 'text-blue-700' : depth === 1 ? 'text-blue-700' : '')}>
                  {entry.entityName}
                </span>
                <span className={cn("text-xs text-muted-foreground truncate", isChild ? 'opacity-75' : '')}>
                  {entry.entityPath}
                </span>
              </div>
            </div>
          </TableCell>
        )}
 
        {/* Processing Fee Section */}
        {columnVisibility.processingFee && (
          <>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <Input
                type="number"
                value={entry.processingFee?.amount || 0}
                onChange={(e) => updateRateEntry(entry.id, {
                  processingFee: {
                    ...entry.processingFee,
                    amount: parseFloat(e.target.value) || 0,
                    rate: entry.processingFee?.currency === 'USD'
                      ? (parseFloat(e.target.value) || 0) * rates.usd
                      : parseFloat(e.target.value) || 0
                  }
                })}
                onKeyDown={handleKeyDown}
                className={cn(inputHeight, "text-center", fontSize, "border-0 bg-white/70 focus:bg-white transition-colors")}
                disabled={isReadOnly}
              />
            </TableCell>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <Select
                value={entry.processingFee?.currency || 'KSH'}
                onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'processingFee', value)}
                disabled={isReadOnly}
              >
                <SelectTrigger className={cn(inputHeight, "border-0 bg-white/70 focus:bg-white", fontSize, "transition-colors")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="KSH">KSH</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <div className={cn(inputHeight, fontSize, "bg-blue-100/50 rounded px-2 flex items-center justify-center text-blue-800 font-semibold")}>
                {(entry.processingFee?.rate || 0).toLocaleString()}
              </div>
            </TableCell>
          </>
        )}
 
        {/* Issuance Fee Section */}
        {columnVisibility.issuanceFee && (
          <>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <Input
                type="number"
                value={entry.issuanceFee?.amount || 0}
                onChange={(e) => updateRateEntry(entry.id, {
                  issuanceFee: {
                    ...entry.issuanceFee,
                    amount: parseFloat(e.target.value) || 0,
                    rate: entry.issuanceFee?.currency === 'USD'
                      ? (parseFloat(e.target.value) || 0) * rates.usd
                      : parseFloat(e.target.value) || 0
                  }
                })}
                onKeyDown={handleKeyDown}
                className={cn(inputHeight, "text-center", fontSize, "border-0 bg-white/70 focus:bg-white transition-colors")}
                disabled={isReadOnly}
              />
            </TableCell>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <Select
                value={entry.issuanceFee?.currency || 'KSH'}
                onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'issuanceFee', value)}
                disabled={isReadOnly}
              >
                <SelectTrigger className={cn(inputHeight, "border-0 bg-white/70 focus:bg-white", fontSize, "transition-colors")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="KSH">KSH</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <div className={cn(inputHeight, fontSize, "bg-blue-100/50 rounded px-2 flex items-center justify-center text-blue-800 font-semibold")}>
                {(entry.issuanceFee?.rate || 0).toLocaleString()}
              </div>
            </TableCell>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <MultiSelectPopover
                entryId={entry.id}
                field="periodType"
                options={periodOptions}
                values={entry.issuanceFee?.periodType || []}
                placeholder="Types"
              />
            </TableCell>
            <TableCell className="border-r border-gray-200 bg-blue-50/30 p-2">
              <MultiSelectPopover
                entryId={entry.id}
                field="periodCount"
                options={countOptions}
                values={entry.issuanceFee?.periodCount || []}
                placeholder="Counts"
              />
            </TableCell>
          </>
        )}
 
        {/* BCL Consultancy Section */}
        {columnVisibility.bclConsultancy && (
          <>
            {['tier1', 'tier2', 'tier3'].map((tier, idx) => (
              <TableCell key={tier} className={cn("border-r border-gray-200 bg-blue-50/30 p-2", idx === 2 ? 'border-r-gray-200' : '')}>
                <Input
                  type="number"
                  value={entry.bclConsultancy?.[tier as keyof typeof entry.bclConsultancy] || 0}
                  onChange={(e) => updateRateEntry(entry.id, {
                    bclConsultancy: {
                      ...entry.bclConsultancy,
                      [tier]: parseFloat(e.target.value) || 0
                    }
                  })}
                  onKeyDown={handleKeyDown}
                  className={cn(inputHeight, "text-center", fontSize, "border-gray-200 bg-white/70 focus:bg-white transition-colors")}
                  disabled={isReadOnly}
                />
              </TableCell>
            ))}
          </>
        )}
 
        {/* Officer Section */}
        {columnVisibility.officer && (
          <>
            {['bossFixed', 'paTier1', 'paEditable'].map((field, idx) => (
              <TableCell key={field} className={cn("border-r border-gray-200 bg-blue-50/30 p-2", idx === 2 ? 'border-r-gray-200' : '')}>
                <Input
                  type="number"
                  value={entry.officer?.[field as keyof typeof entry.officer] || 0}
                  onChange={(e) => updateRateEntry(entry.id, {
                    officer: {
                      ...entry.officer,
                      [field]: parseFloat(e.target.value) || 0
                    }
                  })}
                  onKeyDown={handleKeyDown}
                  className={cn(inputHeight, "text-center", fontSize, "border-gray-200 bg-white/70 focus:bg-white transition-colors")}
                  disabled={isReadOnly}
                />
              </TableCell>
            ))}
          </>
        )}
 
        {/* Extra Consideration Section */}
        {columnVisibility.extraConsideration && (
          <>
            {[
              { key: 'tccCompany', label: 'TCC Company' },
              { key: 'tccIndividual', label: 'TCC Individual' },
              { key: 'auditorsFee', label: 'Auditors Fee' },
              { key: 'degree', label: 'Degree' },
              { key: 'tfFile', label: 'TF File' }
            ].map((field, idx) => (
              <TableCell key={field.key} className={cn("border-r border-gray-400 bg-blue-50/30 p-2", idx === 4 ? 'border-r-gray-200' : '')}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Select
                      value={getExtraConsiderationField(entry, field.key).applicable ? "applicable" : "not-applicable"}
                      onValueChange={(value) => {
                        const newValue = value === "applicable";
                        updateRateEntry(entry.id, {
                          extraConsideration: {
                            ...entry.extraConsideration,
                            [field.key]: {
                              ...getExtraConsiderationField(entry, field.key),
                              applicable: newValue
                            }
                          }
                        });
                      }}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-6 w-full border-gray-200 focus:border-gray-200 focus:bg-white shadow-none text-xs">
                        <SelectValue>
                          <div className="flex items-center gap-1">
                            <div className={cn("w-2 h-2 rounded-full", getExtraConsiderationField(entry, field.key).applicable
                              ? 'bg-blue-500'
                              : 'bg-blue-500'
                            )}></div>
                            {getExtraConsiderationField(entry, field.key).applicable ? 'Applicable' : 'Not Applicable'}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="applicable">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            Applicable
                          </div>
                        </SelectItem>
                        <SelectItem value="not-applicable">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            Not Applicable
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={getExtraConsiderationField(entry, field.key).value}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value) || 0;
                        updateRateEntry(entry.id, {
                          extraConsideration: {
                            ...entry.extraConsideration,
                            [field.key]: {
                              ...getExtraConsiderationField(entry, field.key),
                              value: newValue
                            }
                          }
                        });
                      }}
                      onKeyDown={handleKeyDown}
                      className="h-6 w-full text-center text-xs border-gray-200 focus:border-gray-200 focus:bg-white transition-colors"
                      disabled={isReadOnly || !getExtraConsiderationField(entry, field.key).applicable}
                    />
                  </div>
                </div>
              </TableCell>
            ))}
          </>
        )}
 
        {/* Convenience Fee Section */}
        {columnVisibility.convenienceFee && (
          <>
            {[
              { key: 'alienAssistance', label: 'Alien Assistance' },
              { key: 'reEntryApproval', label: 'Re-Entry Approval' },
              { key: 'passportEndorsement', label: 'Passport Endorsement' }
            ].map((field, idx) => (
              <TableCell key={field.key} className={cn("p-2 bg-indigo-50/30", idx < 2 ? 'border-r border-gray-200' : '')}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Select
                      value={getConvenienceFeeField(entry, field.key).applicable ? "applicable" : "not-applicable"}
                      onValueChange={(value) => {
                        const newValue = value === "applicable";
                        updateRateEntry(entry.id, {
                          convenienceFee: {
                            ...entry.convenienceFee,
                            [field.key]: {
                              ...getConvenienceFeeField(entry, field.key),
                              applicable: newValue
                            }
                          }
                        });
                      }}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-6 w-full border-gray-200 bg-white/70 focus:border-gray-200 focus:bg-white shadow-none text-xs">
                        <SelectValue>
                          <div className="flex items-center gap-1">
                            <div className={cn("w-2 h-2 rounded-full", getConvenienceFeeField(entry, field.key).applicable
                              ? 'bg-blue-500'
                              : 'bg-red-500'
                            )}></div>
                            {getConvenienceFeeField(entry, field.key).applicable ? 'Applicable' : 'Not Applicable'}
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="applicable">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
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
                    <Input
                      type="number"
                      value={getConvenienceFeeField(entry, field.key).value}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value) || 0;
                        updateRateEntry(entry.id, {
                          convenienceFee: {
                            ...entry.convenienceFee,
                            [field.key]: {
                              ...getConvenienceFeeField(entry, field.key),
                              value: newValue
                            }
                          }
                        });
                      }}
                      onKeyDown={handleKeyDown}
                      className="h-6 w-full text-center text-xs border-gray-200 focus:border-gray-200 focus:bg-white transition-colors"
                      disabled={isReadOnly || !getConvenienceFeeField(entry, field.key).applicable}
                    />
                  </div>
                </div>
              </TableCell>
            ))}
          </>
        )}
      </TableRow>
    )
  }

  const totals = calculateTotals()
 
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading departments...</p>
        </div>
      </div>
    )
  }
 
  if (departments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600">No departments found. Please create departments first.</p>
        </div>
      </div>
    )
  }

  const processedDepartments = getProcessedDepartments()
 
  return (
    <div className="w-full space-y-6">
      {/* Header with improved controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Rates Management</h2>
          <p className="text-muted-foreground">Configure and manage department rates and fees</p>
          <div className="flex items-center gap-2 mt-2">
            {isReadOnly && (
              <Badge variant="secondary">
                <Eye className="h-3 w-3 mr-1" />
                Viewing Historical Data
              </Badge>
            )}
            {hasUnsavedChanges && !isReadOnly && (
              <Badge variant="outline" className="text-blue-600 border-blue-200">
                <Clock className="h-3 w-3 mr-1" />
                Auto-saving changes...
              </Badge>
            )}
            {saving && (
              <Badge variant="outline" className="text-blue-600 border-blue-200">
                <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                Saving...
              </Badge>
            )}
          </div>
        </div>
 
        {/* Enhanced Control Panel */}
        <div className="flex items-center gap-2">
          {/* Default Display Toggle */}
          <Button
            variant={showDefaultDisplayOnly ? "default" : "outline"}
            onClick={() => setShowDefaultDisplayOnly(!showDefaultDisplayOnly)}
            className="flex items-center gap-2"
          >
            {showDefaultDisplayOnly ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showDefaultDisplayOnly ? 'Default Display' : 'Show All'}
          </Button>

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
            title="Entity Visibility"
            description="Control which departments, classes, and subclasses are visible in the rates table"
          />

          {/* Column Visibility Control */}
          <ColumnVisibilityControl
            columns={columnVisibilityOptions}
            onVisibilityChange={handleColumnVisibilityChange}
            onShowAll={handleShowAllColumns}
            onHideAll={handleHideAllColumns}
            onResetToDefault={handleResetToDefault}
            title="Column Visibility"
            description="Toggle rate table columns"
          />

          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={!selectedDepartment || currentPeriod.data.length === 0}
          >
            <DownloadCloud className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
 
          {/* Historical Periods Dialog */}
          <HistoricalRatesDialog
            isOpen={isHistoryDialogOpen}
            onOpenChange={setIsHistoryDialogOpen}
            departments={processedDepartments}
            selectedDepartment={selectedDepartment}
            historicalPeriods={historicalPeriods}
            loadingHistory={loadingHistory}
            onViewHistoricalPeriod={handleViewHistoricalPeriod}
          />
 
          {/* New Period Dialog */}
          <NewPeriodDialog
            isOpen={isNewPeriodDialogOpen}
            onOpenChange={setIsNewPeriodDialogOpen}
            historicalPeriods={historicalPeriods}
            onCreatePeriod={async (formData) => {
              setSaving(true);
              try {
                if (currentPeriod.id) {
                  await supabase
                    .from('rates_history')
                    .update({ is_active: false })
                    .eq('id', currentPeriod.id);
                }
 
                let newData = currentPeriod.data;
 
                if (formData.copyFromPeriod) {
                  const sourcePeriod = historicalPeriods.find(p => p.id === formData.copyFromPeriod);
                  if (sourcePeriod) {
                    newData = sourcePeriod.data.map(entry => ({
                      ...entry,
                      id: generateRateId()
                    }));
                  }
                }
 
                const { error } = await supabase
                  .from('rates_history')
                  .insert({
                    department_id: selectedDepartment,
                    effective_from: formData.effectiveFrom.toISOString().split('T')[0],
                    effective_to: formData.effectiveTo?.toISOString().split('T')[0] || null,
                    rates_data: newData,
                    exchange_rates: rates,
                    description: formData.description,
                    is_active: true,
                    created_by: 'current_user'
                  });
 
                if (error) throw error;
 
                toast({
                  title: "Success",
                  description: "New rate period created successfully.",
                });
 
                setNewPeriodForm({
                  effectiveFrom: new Date(),
                  effectiveTo: null,
                  description: '',
                  copyFromPeriod: null
                });
 
                await loadCurrentRates(selectedDepartment);
                await loadHistoricalPeriods(selectedDepartment);
                setIsNewPeriodDialogOpen(false);
              } catch (error) {
                console.error('Error creating new period:', error);
                toast({
                  title: "Error",
                  description: "Failed to create new period. Please try again.",
                  variant: "destructive"
                });
              } finally {
                setSaving(false);
              }
            }}
            saving={saving}
          />
 
          {/* Exchange Rates Dialog */}
          <ExchangeRatesDialog
            isOpen={isRateDialogOpen}
            onOpenChange={setIsRateDialogOpen}
            currentRate={rates.usd}
            onSave={(rate) => {
              const newRates = { usd: rate, ksh: 1 };
              setRates(newRates);
              setCurrentPeriod(prev => ({ ...prev, exchangeRates: newRates }));
              setHasUnsavedChanges(true);
              toast({
                title: "Exchange Rate Updated",
                description: `USD rate set to ${rate} KSH`,
              });
            }}
            isReadOnly={isReadOnly}
          />
 
          {isReadOnly && (
            <Button
              onClick={() => loadCurrentRates(selectedDepartment)}
              variant="outline"
              size="sm"
            >
              Back to Current
            </Button>
          )}
        </div>
      </div>
 
      {/* Tabs with improved styling */}
      <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment} className="w-full">
        <div className="flex justify-between items-start gap-4 mb-6">
          <TabsList className="gap-1 bg-muted/50 p-1">
            {processedDepartments.map((dept) => (
              <TabsTrigger
                key={dept.id}
                value={dept.id}
                className="whitespace-nowrap data-[state=active]:bg-blue-700 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
               <div className="flex items-center gap-2">
                 <span>{dept.name}</span>
               </div>
             </TabsTrigger>
           ))}
         </TabsList>

         {/* Enhanced info panel */}
         {selectedDepartment && (
           <Card className="min-w-fit">
             <CardContent className="p-4">
               <div className="flex items-center gap-6 text-sm">
                 <div className="flex items-center gap-2">
                   <DollarSign className="h-4 w-4 text-green-600" />
                   <span className="font-medium">USD Rate: {rates.usd}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <Clock className="h-4 w-4 text-blue-600" />
                   <span>
                     Effective: {format(currentPeriod.effectiveFrom, "PPP")}
                     {currentPeriod.effectiveTo && ` - ${format(currentPeriod.effectiveTo, "PPP")}`}
                   </span>
                 </div>
                 {currentPeriod.description && (
                   <Badge variant="outline" className="text-xs">
                     {currentPeriod.description}
                   </Badge>
                 )}
               </div>
             </CardContent>
           </Card>
         )}
       </div>

       {processedDepartments.map((dept) => (
         <TabsContent key={dept.id} value={dept.id}>
           <Card className="overflow-hidden">
             <div className="relative overflow-auto max-h-[calc(100vh-300px)] border-0">
               <Table className="min-w-max">
                 {/* Sticky Headers */}
                 <TableHeader className="sticky top-0 z-50">
                   {/* Main Headers Row */}
                   <TableRow className="bg-blue-700 text-white border-b border-slate-300">
                     {columnVisibility.index && (
                       <TableHead className="sticky left-0 bg-blue-700 border-r-2 border-white/20 w-16 z-50 text-center text-white font-semibold p-2">
                         #
                       </TableHead>
                     )}
                     {columnVisibility.entity && (
                       <TableHead className={cn(
                         "sticky bg-blue-700 border-r-2 border-white/20 w-64 z-50 text-white font-semibold p-2",
                         columnVisibility.index ? "left-16" : "left-0"
                       )}>
                         Entity
                       </TableHead>
                     )}

                     {/* Processing Fee - Blue background */}
                     {columnVisibility.processingFee && (
                       <TableHead colSpan={3} className="border-r-4 border-slate-300 text-center text-white font-semibold bg-blue-700 p-2">
                         Processing Fee
                       </TableHead>
                     )}
                     {/* Issuance Fee - Green background */}
                     {columnVisibility.issuanceFee && (
                       <TableHead colSpan={5} className="border-r-4 border-slate-300 text-center text-white font-semibold bg-blue-700 p-2">
                         Issuance Fee
                       </TableHead>
                     )}
                     {/* BCL Consultancy - Purple background */}
                     {columnVisibility.bclConsultancy && (
                       <TableHead colSpan={3} className="border-r-4 border-slate-300 text-center text-white font-semibold bg-blue-700 p-2">
                         BCL Consultancy
                       </TableHead>
                     )}
                     {/* Officer - Orange background */}
                     {columnVisibility.officer && (
                       <TableHead colSpan={3} className="border-r-4 border-slate-300 text-center text-white font-semibold bg-blue-700 p-2">
                         Officer
                       </TableHead>
                     )}
                     {/* Extra Consideration - Red background */}
                     {columnVisibility.extraConsideration && (
                       <TableHead colSpan={5} className="border-r-4 border-slate-300 text-center text-white font-semibold bg-blue-700 p-2">
                         Extra Consideration
                       </TableHead>
                     )}
                     {/* Convenience Fee - Indigo background */}
                     {columnVisibility.convenienceFee && (
                       <TableHead colSpan={3} className="text-center text-white font-semibold bg-blue-700 p-2">
                         Convenience Fee
                       </TableHead>
                     )}
                   </TableRow>

                   {/* Sub Headers Row */}
                   <TableRow className="bg-blue-500 border-b border-slate-200">
                     {columnVisibility.index && (
                       <TableHead className="sticky left-0 bg-blue-500 border-r z-50 p-2"></TableHead>
                     )}
                     {columnVisibility.entity && (
                       <TableHead className={cn(
                         "sticky bg-blue-500 border-r z-50 p-2",
                         columnVisibility.index ? "left-16" : "left-0"
                       )}></TableHead>
                     )}

                     {/* Processing Fee Sub-headers */}
                     {columnVisibility.processingFee && (
                       <>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Amount
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Currency
                         </TableHead>
                         <TableHead className="border-r-4 border-slate-300 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Fee (KSH)
                         </TableHead>
                       </>
                     )}

                     {/* Issuance Fee Sub-headers */}
                     {columnVisibility.issuanceFee && (
                       <>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Amount
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Currency
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Fee (KSH)
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Period Type
                         </TableHead>
                         <TableHead className="border-r-4 border-slate-300 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Period Count
                         </TableHead>
                       </>
                     )}

                     {/* BCL Consultancy Sub-headers */}
                     {columnVisibility.bclConsultancy && (
                       <>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Tier 1
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Tier 2
                         </TableHead>
                         <TableHead className="border-r-4 border-slate-300 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Tier 3
                         </TableHead>
                       </>
                     )}

                     {/* Officer Sub-headers */}
                     {columnVisibility.officer && (
                       <>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Boss Fixed
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           PA Tier 1
                         </TableHead>
                         <TableHead className="border-r-4 border-slate-300 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           PA Editable
                         </TableHead>
                       </>
                     )}

                     {/* Extra Consideration Sub-headers */}
                     {columnVisibility.extraConsideration && (
                       <>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           TCC Company
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           TCC Individual
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Auditors Fee
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Degree
                         </TableHead>
                         <TableHead className="border-r-4 border-slate-300 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           TF File
                         </TableHead>
                       </>
                     )}

                     {/* Convenience Fee Sub-headers */}
                     {columnVisibility.convenienceFee && (
                       <>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Alien Assistance
                         </TableHead>
                         <TableHead className="border-r border-slate-200 text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Re-Entry
                         </TableHead>
                         <TableHead className="text-center text-xs text-white font-semibold bg-blue-500 p-2">
                           Passport Endorsement
                         </TableHead>
                       </>
                     )}
                   </TableRow>
                 </TableHeader>

                 <TableBody>
                   {Object.entries(getGroupedEntries(dept)).flatMap(([subdeptName, subdeptData], groupIndex) => {
                     const rows = []
                     const totalEntries = subdeptData.direct.length + Object.values(subdeptData.classes).reduce((sum, cls) =>
                       sum + cls.direct.length + Object.values(cls.subclasses).reduce((subSum, subEntries) => subSum + subEntries.length, 0), 0
                     )

                     const hasMultipleEntries = totalEntries > 1

                     if (hasMultipleEntries) {
                       const groupRowId = `group-${subdeptName}`
                       const isExpanded = expandedRows.has(groupRowId)

                       // Subdepartment group header
                       rows.push(
                         <TableRow key={groupRowId} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                           {columnVisibility.index && (
                             <TableCell className="sticky left-0 bg-blue-100 border-r text-center font-semibold text-sm z-30 px-3 p-2">
                                 {groupIndex + 1}
                             </TableCell>
                           )}
                           {columnVisibility.entity && (
                             <TableCell className={cn(
                               "sticky bg-blue-100 border-r font-semibold z-30 px-3 p-2",
                               columnVisibility.index ? "left-16" : "left-0"
                             )}>
                               <div className="flex justify-between items-center gap-3">
                                 <div className="flex items-center gap-2">
                                   <span className="text-sm font-semibold text-slate-800">{subdeptName}</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <Badge variant="outline" className="text-xs ">
                                     {totalEntries}
                                   </Badge>
                                   <Button
                                     variant="ghost"
                                     size="sm"
                                     className="h-6 w-6 p-0 hover:bg-white/50"
                                     onClick={() => toggleRowExpansion(groupRowId)}
                                   >
                                     {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                   </Button>
                                 </div>
                               </div>
                             </TableCell>
                           )}
                           <TableCell colSpan={22} className="text-slate-600 italic text-sm px-3 p-2">
                             <div className="flex items-center gap-2">
                               {/* Click to {isExpanded ? 'collapse' : 'expand'} and view rate entries */}
                             </div>
                           </TableCell>
                         </TableRow>
                       )

                       if (isExpanded) {
                         let entryCount = 0

                         // Add direct subdepartment entries
                         subdeptData.direct.forEach((entry) => {
                           entryCount++
                           rows.push(renderRateRow(entry, `${groupIndex + 1}.${entryCount}`, true, 1))
                         })

                         // Add class entries
                         Object.entries(subdeptData.classes).forEach(([className, classData]) => {
                           const hasSubclasses = Object.keys(classData.subclasses).length > 0
                           const classRowId = `class-${subdeptName}-${className}`
                           const isClassExpanded = expandedRows.has(classRowId)
                           const classEntryCount = classData.direct.length + Object.values(classData.subclasses).reduce((sum, entries) => sum + entries.length, 0)

                           if (hasSubclasses || classData.direct.length > 0) {
                             if (classEntryCount > 1 || hasSubclasses) {
                               // Class group header
                               entryCount++
                               rows.push(
                                 <TableRow key={classRowId} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                                   {columnVisibility.index && (
                                     <TableCell className="sticky left-0 bg-blue-50 border-r text-center font-semibold text-sm z-30 px-3 p-2">
                                       <Badge variant="outline" className="bg-white border-blue-300">
                                         {groupIndex + 1}.{entryCount}
                                       </Badge>
                                     </TableCell>
                                   )}
                                   {columnVisibility.entity && (
                                     <TableCell className={cn(
                                       "sticky bg-blue-50 border-r font-semibold z-30 px-3 pl-8 p-2",
                                       columnVisibility.index ? "left-16" : "left-0"
                                     )}>
                                       <div className="flex justify-between items-center gap-3">
                                       <div className="flex items-center gap-2">
                                           <span className="text-sm font-semibold text-blue-800">{className}</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                           <Badge variant="secondary" className="text-xs bg-blue-100">
                                             {classEntryCount}
                                           </Badge>
                                           <Button
                                             variant="ghost"
                                             size="sm"
                                             className="h-5 w-5 p-0 hover:bg-white/50"
                                             onClick={() => toggleRowExpansion(classRowId)}
                                           >
                                             {isClassExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                           </Button>
                                         </div>
                                       </div>
                                     </TableCell>
                                   )}
                                   <TableCell colSpan={22} className="text-blue-600 italic text-sm px-3 p-2">
                                     <div className="flex items-center gap-2">
                                       {/* Click to {isClassExpanded ? 'collapse' : 'expand'} and view {hasSubclasses ? 'subclass' : 'class'} entries */}
                                     </div>
                                   </TableCell>
                                 </TableRow>
                               )

                               if (isClassExpanded) {
                                 let subCount = 0

                                 // Add direct class entries
                                 classData.direct.forEach((entry) => {
                                   subCount++
                                   rows.push(renderRateRow(entry, `${groupIndex + 1}.${entryCount}.${subCount}`, true, 2))
                                 })

                                 // Add subclass entries
                                 Object.entries(classData.subclasses).forEach(([subclassName, subclassEntries]) => {
                                   if (subclassEntries.length > 1) {
                                     // Subclass group header
                                     subCount++
                                     const subclassRowId = `subclass-${subdeptName}-${className}-${subclassName}`
                                     const isSubclassExpanded = expandedRows.has(subclassRowId)

                                     rows.push(
                                       <TableRow key={subclassRowId} className="bg-blue-50 hover:bg-blue-50/80 transition-colors">
                                         {columnVisibility.index && (
                                           <TableCell className="sticky left-0 bg-blue-50 border-r text-center font-semibold text-sm z-30 px-3 p-2">
                                             <Badge variant="outline" className="bg-white border-blue-300">
                                               {groupIndex + 1}.{entryCount}.{subCount}
                                             </Badge>
                                           </TableCell>
                                         )}
                                         {columnVisibility.entity && (
                                           <TableCell className={cn(
                                             "sticky bg-blue-50 border-r font-semibold z-30 px-3 pl-12 p-2",
                                             columnVisibility.index ? "left-16" : "left-0"
                                           )}>
                                             <div className="flex justify-between items-center gap-3">
                                               <div className="flex items-center gap-2">
                                                 <span className="text-sm font-semibold text-blue-800">{subclassName}</span>
                                               </div>
                                               <div className="flex items-center gap-2">
                                                 <Badge variant="secondary" className="text-xs bg-blue-100">
                                                   {subclassEntries.length}
                                                 </Badge>
                                                 <Button
                                                   variant="ghost"
                                                   size="sm"
                                                   className="h-5 w-5 p-0 hover:bg-white/50"
                                                   onClick={() => toggleRowExpansion(subclassRowId)}
                                                 >
                                                   {isSubclassExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                                 </Button>
                                               </div>
                                             </div>
                                           </TableCell>
                                         )}
                                         <TableCell colSpan={22} className="text-blue-600 italic text-sm px-3 p-2">
                                           <div className="flex items-center gap-2">
                                             {/* Click to {isSubclassExpanded ? 'collapse' : 'expand'} and view subclass entries */}
                                           </div>
                                         </TableCell>
                                       </TableRow>
                                     )

                                     if (isSubclassExpanded) {
                                       subclassEntries.forEach((entry, subEntryIndex) => {
                                         rows.push(renderRateRow(entry, `${groupIndex + 1}.${entryCount}.${subCount}.${subEntryIndex + 1}`, true, 3))
                                       })
                                     }
                                   } else {
                                     // Single subclass entry
                                     subCount++
                                     rows.push(renderRateRow(subclassEntries[0], `${groupIndex + 1}.${entryCount}.${subCount}`, true, 2))
                                   }
                                 })
                               }
                             } else {
                               // Single class entry
                               entryCount++
                               rows.push(renderRateRow(classData.direct[0], `${groupIndex + 1}.${entryCount}`, true, 1))
                             }
                           }
                         })
                       }
                     } else {
                       // Single entry - render directly
                       const singleEntry = subdeptData.direct[0] ||
                         Object.values(subdeptData.classes)[0]?.direct[0] ||
                         Object.values(Object.values(subdeptData.classes)[0]?.subclasses || {})[0]?.[0]

                       if (singleEntry) {
                         rows.push(renderRateRow(singleEntry, `${groupIndex + 1}`, false, 0))
                       }
                     }

                     return rows
                   })}

                   {/* Totals Row */}
                   {Object.keys(getGroupedEntries(dept)).length > 0 && (
                     <TableRow className="bg-gradient-to-r from-blue-100 to-blue-50 border-t-4 border-blue-300 font-bold text-sm">
                       {columnVisibility.index && (
                         <TableCell className="sticky left-0 bg-blue-100 border-r text-center font-bold text-sm z-30 px-2 p-3">
                           <Badge variant="outline" className="bg-blue-200 border-blue-400 text-slate-800 font-bold">
                             TOTALS
                           </Badge>
                         </TableCell>
                       )}
                       {columnVisibility.entity && (
                         <TableCell className={cn(
                           "sticky bg-blue-100 border-r font-bold z-30 px-3 p-3",
                           columnVisibility.index ? "left-16" : "left-0"
                         )}>
                           <span className="text-sm font-bold text-slate-800">
                             Summary ({Object.values(getGroupedEntries(dept)).reduce((sum, subdeptData) =>
                               sum + subdeptData.direct.length + Object.values(subdeptData.classes).reduce((classSum, cls) =>
                                 classSum + cls.direct.length + Object.values(cls.subclasses).reduce((subSum, subEntries) => subSum + subEntries.length, 0), 0), 0
                             )} visible entries)
                           </span>
                         </TableCell>
                       )}

                       {/* Processing Fee Totals */}
                       {columnVisibility.processingFee && (
                         <>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">-</TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">-</TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.processingFeeRate.toLocaleString()}
                           </TableCell>
                         </>
                       )}

                       {/* Issuance Fee Totals */}
                       {columnVisibility.issuanceFee && (
                         <>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-green-800">-</TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-green-800">-</TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-green-800">
                             {totals.issuanceFeeRate.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-green-800">-</TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-green-800">-</TableCell>
                         </>
                       )}

                       {/* BCL Consultancy Totals */}
                       {columnVisibility.bclConsultancy && (
                         <>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.bclTier1.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.bclTier2.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.bclTier3.toLocaleString()}
                           </TableCell>
                         </>
                       )}

                       {/* Officer Totals */}
                       {columnVisibility.officer && (
                         <>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.officerBossFixed.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.officerPaTier1.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.officerPaEditable.toLocaleString()}
                           </TableCell>
                         </>
                       )}

                       {/* Extra Consideration Totals */}
                       {columnVisibility.extraConsideration && (
                         <>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.extraTccCompany.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.extraTccIndividual.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.extraAuditorsFee.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.extraDegree.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-blue-100/70 p-3 text-center font-bold text-blue-800">
                             {totals.extraTfFile.toLocaleString()}
                           </TableCell>
                         </>
                       )}

                       {/* Convenience Fee Totals */}
                       {columnVisibility.convenienceFee && (
                         <>
                           <TableCell className="border-r border-gray-200 bg-indigo-100/70 p-3 text-center font-bold text-indigo-800">
                             {totals.convenienceAlienAssistance.toLocaleString()}
                           </TableCell>
                           <TableCell className="border-r border-gray-200 bg-indigo-100/70 p-3 text-center font-bold text-indigo-800">
                             {totals.convenienceReEntryApproval.toLocaleString()}
                           </TableCell>
                           <TableCell className="bg-indigo-100/70 p-3 text-center font-bold text-indigo-800">
                             {totals.conveniencePassportEndorsement.toLocaleString()}
                           </TableCell>
                         </>
                       )}
                     </TableRow>
                   )}
                 </TableBody>
               </Table>
             </div>
           </Card>
         </TabsContent>
       ))}
     </Tabs>
   </div>
 )
}