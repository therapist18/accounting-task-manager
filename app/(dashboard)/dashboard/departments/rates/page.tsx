// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { Calculator, Minus, Plus, Save, DollarSign, Clock, ChevronDown, History, Copy, Eye, Info, ChevronRight } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../departments/database"
import { supabase } from "@/lib/supabase/client"
import { HistoryDialog, NewPeriodDialog } from "./components"

interface RateData {
  usd: number
  ksh: number
}

interface RateEntry {
  id: string
  entityType: 'subdepartment' | 'class' | 'subclass'
  entityId: string
  entityName: string
  entityPath: string // For display hierarchy
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
    applicable: boolean
    tccCompanyIgnore: number
    tccIndividualIgnore: number
    auditorsFee: number
    degree: number
    tfFile: number
  }
  convenienceFee: {
    applicable: boolean
    alienAssistance: number
    reEntryApproval: number
    passportEndorsement: number
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

// Define the type for subdepartments
interface Subdepartment {
  id: number
  name: string
  description?: string
  classes?: Array<{
    id: number | string
    name: string
    description: string | null
    subClasses?: Array<{
      id: number | string
      name: string
      description: string | null
    }>
  }>
}

// Define the type for departments
interface Department {
  id: string
  name: string
  description?: string
  tm_subdepartments?: Subdepartment[]
}

interface RatesPageProps {
  departments?: Department[]
}

export default function RatesPage({ departments: initialDepartments }: RatesPageProps) {
  const [rates, setRates] = useState<RateData>({ usd: 130, ksh: 1 })
  const [tempRates, setTempRates] = useState<RateData>({ usd: 130, ksh: 1 })
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false)
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false)
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
  const [viewMode, setViewMode] = useState<'compact' | 'expanded'>('compact')
  const [density, setDensity] = useState<'comfortable' | 'compact' | 'spacious'>('comfortable')

  // Rate period state
  const [currentPeriod, setCurrentPeriod] = useState<RatePeriod>({
    departmentId: '',
    effectiveFrom: new Date(),
    effectiveTo: null,
    data: [],
    exchangeRates: { usd: 130, ksh: 1 },
    description: '',
    isActive: true
  })

  // New period form state
  const [newPeriodForm, setNewPeriodForm] = useState({
    effectiveFrom: new Date(),
    effectiveTo: null as Date | null,
    description: '',
    copyFromPeriod: null as number | null
  })
  const periodOptions = ["months", "years"]
  const countOptions = ["1", "2", "3", "6", "12"]

  // Generate ID for rate entries
  const generateRateId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }

  // Fetch departments if not provided as props
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
            tm_subdepartments: dept.subdepartments?.map(subdept => ({
              id: typeof subdept.id === 'string' ? parseInt(subdept.id) : subdept.id,
              name: subdept.name,
              description: subdept.description,
              classes: (subdept as any).classes || []
            }))
          }))
          setDepartments(transformedDepartments)
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

  // Load current rates when department changes
  useEffect(() => {
    if (selectedDepartment) {
      loadCurrentRates(selectedDepartment)
      loadHistoricalPeriods(selectedDepartment)
    }
  }, [selectedDepartment])

  const loadCurrentRates = async (departmentId: string) => {
    try {
      // Load the most recent active rate period for this department
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
      } else {
        // Generate default rates for the department
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
    const currentDepartment = departments.find(dept => dept.id === departmentId)
    if (!currentDepartment) return

    const defaultRates: RateEntry[] = []

    currentDepartment.tm_subdepartments?.forEach((subdept) => {
      if (subdept.classes && subdept.classes.length > 0) {
        subdept.classes.forEach((cls) => {
          if (cls.subClasses && cls.subClasses.length > 0) {
            // Has subclasses
            cls.subClasses.forEach((subCls) => {
              defaultRates.push(createDefaultRateEntry(
                'subclass',
                `${subdept.id}-${cls.id}-${subCls.id}`,
                subCls.name,
                `${subdept.name} → ${cls.name} → ${subCls.name}`
              ))
            })
          } else {
            // No subclasses
            defaultRates.push(createDefaultRateEntry(
              'class',
              `${subdept.id}-${cls.id}`,
              cls.name,
              `${subdept.name} → ${cls.name}`
            ))
          }
        })
      } else {
        // No classes
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
      applicable: false,
      tccCompanyIgnore: 5000,
      tccIndividualIgnore: 5000,
      auditorsFee: 5000,
      degree: 5000,
      tfFile: 5000
    },
    convenienceFee: {
      applicable: false,
      alienAssistance: 1000,
      reEntryApproval: 1000,
      passportEndorsement: 1000
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

  const handleSaveRates = async () => {
    if (!selectedDepartment || currentPeriod.data.length === 0) {
      toast({
        title: "Error",
        description: "No rates to save.",
        variant: "destructive"
      })
      return
    }

    setSaving(true)
    try {
      // If updating existing period
      if (currentPeriod.id && !isReadOnly) {
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
      } else if (!currentPeriod.id) {
        // Creating new period
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
            created_by: 'current_user' // Replace with actual user ID
          })

        if (error) throw error
      }

      toast({
        title: "Success",
        description: "Rates saved successfully.",
      })

      // Reload current rates and history
      await loadCurrentRates(selectedDepartment)
      await loadHistoricalPeriods(selectedDepartment)
    } catch (error) {
      console.error('Error saving rates:', error)
      toast({
        title: "Error",
        description: "Failed to save rates. Please try again.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNewPeriod = async () => {
    if (!selectedDepartment) return

    setSaving(true)
    try {
      // First, deactivate current active period
      if (currentPeriod.id) {
        await supabase
          .from('rates_history')
          .update({ is_active: false })
          .eq('id', currentPeriod.id)
      }

      // Prepare data for new period
      let newData = currentPeriod.data

      // If copying from a specific period
      if (newPeriodForm.copyFromPeriod) {
        const sourcePeriod = historicalPeriods.find(p => p.id === newPeriodForm.copyFromPeriod)
        if (sourcePeriod) {
          newData = sourcePeriod.data.map(entry => ({
            ...entry,
            id: generateRateId() // Generate new IDs
          }))
        }
      }

      // Create new period
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
          created_by: 'current_user' // Replace with actual user ID
        })

      if (error) throw error

      toast({
        title: "Success",
        description: "New rate period created successfully.",
      })

      // Reset form and reload data
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

  // Define renderRateRow inside the component to access state and methods
  const renderRateRow = (entry: RateEntry, index: string, isChild: boolean, depth: number = 0) => {
    const rowHeight = density === 'compact' ? 'h-10' : density === 'spacious' ? 'h-16' : 'h-12'
    const inputHeight = density === 'compact' ? 'h-7' : density === 'spacious' ? 'h-10' : 'h-8'
    const fontSize = density === 'compact' ? 'text-xs' : density === 'spacious' ? 'text-sm' : 'text-xs'

    return (
      <TableRow
        key={entry.id}
        className={`
          ${isChild ? 'bg-slate-50/50 hover:bg-slate-100/50' : 'hover:bg-muted/50'} 
          ${rowHeight} 
          transition-colors duration-150 ease-in-out
          ${depth > 0 ? 'border-l-2 border-l-blue-200' : ''}
        `}
      >
        {/* Index Column */}
        <TableCell className={`sticky left-0 bg-background border-r text-center font-mono ${fontSize} font-medium z-30 px-2`}>
          <div className="flex items-center justify-center">
            {index}
          </div>
        </TableCell>

        {/* Entity Name Column with improved hierarchy */}
        <TableCell className={`sticky left-16 bg-background border-r font-medium z-30 px-3`}>
          <div className={`flex items-center gap-2 ${depth > 0 ? `pl-${depth * 4}` : ''}`}>
            {isChild && (
              <div className="flex items-center text-muted-foreground">
                <div className="w-4 h-4 flex items-center justify-center">
                  <ChevronRight className="h-3 w-3" />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-0">
              <span className={`font-medium ${fontSize} truncate`}>{entry.entityName}</span>
              <span className={`text-xs text-muted-foreground truncate ${isChild ? 'opacity-75' : ''}`}>
                {entry.entityPath}
              </span>
            </div>
          </div>
        </TableCell>

        {/* Processing Fee Section with improved visual grouping */}
        <TableCell className="border-r border-blue-100 bg-blue-50/30 p-2">
          <Input
            type="number"
            value={entry.processingFee.amount}
            onChange={(e) => updateRateEntry(entry.id, {
              processingFee: {
                ...entry.processingFee,
                amount: parseFloat(e.target.value) || 0,
                rate: entry.processingFee.currency === 'USD'
                  ? (parseFloat(e.target.value) || 0) * rates.usd
                  : parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-blue-100 bg-blue-50/30 p-2">
          <Select
            value={entry.processingFee.currency}
            onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'processingFee', value)}
            disabled={isReadOnly}
          >
            <SelectTrigger className={`${inputHeight} border-0 bg-white/70 focus:bg-white ${fontSize}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="KSH">KSH</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="border-r border-blue-200 bg-blue-50/30 p-2">
          <div className={`${inputHeight} ${fontSize} bg-blue-100/50 rounded px-2 flex items-center justify-center font-mono text-blue-800`}>
            {entry.processingFee.rate.toLocaleString()}
          </div>
        </TableCell>

        {/* Issuance Fee Section */}
        <TableCell className="border-r border-green-100 bg-green-50/30 p-2">
          <Input
            type="number"
            value={entry.issuanceFee.amount}
            onChange={(e) => updateRateEntry(entry.id, {
              issuanceFee: {
                ...entry.issuanceFee,
                amount: parseFloat(e.target.value) || 0,
                rate: entry.issuanceFee.currency === 'USD'
                  ? (parseFloat(e.target.value) || 0) * rates.usd
                  : parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-green-100 bg-green-50/30 p-2">
          <Select
            value={entry.issuanceFee.currency}
            onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'issuanceFee', value)}
            disabled={isReadOnly}
          >
            <SelectTrigger className={`${inputHeight} border-0 bg-white/70 focus:bg-white ${fontSize}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="KSH">KSH</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="border-r border-green-100 bg-green-50/30 p-2">
          <div className={`${inputHeight} ${fontSize} bg-green-100/50 rounded px-2 flex items-center justify-center font-mono text-green-800`}>
            {entry.issuanceFee.rate.toLocaleString()}
          </div>
        </TableCell>
        <TableCell className="border-r border-green-100 bg-green-50/30 p-2">
          <MultiSelectPopover
            entryId={entry.id}
            field="periodType"
            options={periodOptions}
            values={entry.issuanceFee.periodType}
            placeholder="Types"
          />
        </TableCell>
        <TableCell className="border-r border-green-200 bg-green-50/30 p-2">
          <MultiSelectPopover
            entryId={entry.id}
            field="periodCount"
            options={countOptions}
            values={entry.issuanceFee.periodCount}
            placeholder="Counts"
          />
        </TableCell>

        {/* BCL Consultancy Section */}
        <TableCell className="border-r border-purple-100 bg-purple-50/30 p-2">
          <Input
            type="number"
            value={entry.bclConsultancy.tier1}
            onChange={(e) => updateRateEntry(entry.id, {
              bclConsultancy: {
                ...entry.bclConsultancy,
                tier1: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-purple-100 bg-purple-50/30 p-2">
          <Input
            type="number"
            value={entry.bclConsultancy.tier2}
            onChange={(e) => updateRateEntry(entry.id, {
              bclConsultancy: {
                ...entry.bclConsultancy,
                tier2: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-purple-200 bg-purple-50/30 p-2">
          <Input
            type="number"
            value={entry.bclConsultancy.tier3}
            onChange={(e) => updateRateEntry(entry.id, {
              bclConsultancy: {
                ...entry.bclConsultancy,
                tier3: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>

        {/* Officer Section */}
        <TableCell className="border-r border-orange-100 bg-orange-50/30 p-2">
          <Input
            type="number"
            value={entry.officer.bossFixed}
            onChange={(e) => updateRateEntry(entry.id, {
              officer: {
                ...entry.officer,
                bossFixed: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-orange-100 bg-orange-50/30 p-2">
          <Input
            type="number"
            value={entry.officer.paTier1}
            onChange={(e) => updateRateEntry(entry.id, {
              officer: {
                ...entry.officer,
                paTier1: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-orange-200 bg-orange-50/30 p-2">
          <Input
            type="number"
            value={entry.officer.paEditable}
            onChange={(e) => updateRateEntry(entry.id, {
              officer: {
                ...entry.officer,
                paEditable: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
            disabled={isReadOnly}
          />
        </TableCell>

        {/* Extra Consideration Section */}
        <TableCell className="border-r border-red-100 bg-red-50/30 p-2">
          <Select
            value={entry.extraConsideration.applicable ? "applicable" : "not-applicable"}
            onValueChange={(value) => updateRateEntry(entry.id, {
              extraConsideration: {
                ...entry.extraConsideration,
                applicable: value === "applicable"
              }
            })}
            disabled={isReadOnly}
          >
            <SelectTrigger className={`${inputHeight} w-full border-0 bg-white/70 focus:bg-white shadow-none ${fontSize}`}>
              <SelectValue>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${entry.extraConsideration.applicable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  {entry.extraConsideration.applicable ? 'Yes' : 'No'}
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
        </TableCell>

        {/* Extra Consideration Input Fields */}
        {['tccCompanyIgnore', 'tccIndividualIgnore', 'auditorsFee', 'degree', 'tfFile'].map((field, idx) => (
          <TableCell key={field} className={`border-r border-red-100 bg-red-50/30 p-2 ${idx === 4 ? 'border-r-red-200' : ''}`}>
            <Input
              type="number"
              value={entry.extraConsideration[field as keyof typeof entry.extraConsideration] as number}
              onChange={(e) => updateRateEntry(entry.id, {
                extraConsideration: {
                  ...entry.extraConsideration,
                  [field]: parseFloat(e.target.value) || 0
                }
              })}
              className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
              disabled={isReadOnly || !entry.extraConsideration.applicable}
            />
          </TableCell>
        ))}

        {/* Convenience Fee Section */}
        <TableCell className="border-r border-indigo-100 bg-indigo-50/30 p-2">
          <Select
            value={entry.convenienceFee.applicable ? "applicable" : "not-applicable"}
            onValueChange={(value) => updateRateEntry(entry.id, {
              convenienceFee: {
                ...entry.convenienceFee,
                applicable: value === "applicable"
              }
            })}
            disabled={isReadOnly}
          >
            <SelectTrigger className={`${inputHeight} w-full border-0 bg-white/70 focus:bg-white shadow-none ${fontSize}`}>
              <SelectValue>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${entry.convenienceFee.applicable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  {entry.convenienceFee.applicable ? 'Yes' : 'No'}
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
        </TableCell>

        {/* Convenience Fee Input Fields */}
        {['alienAssistance', 'reEntryApproval', 'passportEndorsement'].map((field, idx) => (
          <TableCell key={field} className={`p-2 bg-indigo-50/30 ${idx < 2 ? 'border-r border-indigo-100' : ''}`}>
            <Input
              type="number"
              value={entry.convenienceFee[field as keyof typeof entry.convenienceFee] as number}
              onChange={(e) => updateRateEntry(entry.id, {
                convenienceFee: {
                  ...entry.convenienceFee,
                  [field]: parseFloat(e.target.value) || 0
                }
              })}
              className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white`}
              disabled={isReadOnly || !entry.convenienceFee.applicable}
            />
          </TableCell>
        ))}
      </TableRow>
    )
  }

  // Group entries by hierarchy for display
  const groupedEntries = currentPeriod.data.reduce((acc, entry) => {
    const parts = entry.entityPath.split(' → ')
    const subdept = parts[0]

    if (!acc[subdept]) {
      acc[subdept] = []
    }
    acc[subdept].push(entry)
    return acc
  }, {} as Record<string, RateEntry[]>)

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

  return (
    <div className="w-full space-y-6">
      {/* Header with improved controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Rates Management</h2>
          <p className="text-muted-foreground">Configure and manage department rates and fees</p>
          {isReadOnly && (
            <Badge variant="secondary" className="mt-2">
              <Eye className="h-3 w-3 mr-1" />
              Viewing Historical Data
            </Badge>
          )}
        </div>

        {/* Enhanced Control Panel */}
        <div className="flex items-center gap-2">
          {/* View Options */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            <Button
              variant={density === 'compact' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDensity('compact')}
              className="h-8 px-2 text-xs"
            >
              Compact
            </Button>
            <Button
              variant={density === 'comfortable' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDensity('comfortable')}
              className="h-8 px-2 text-xs"
            >
              Comfortable
            </Button>
            <Button
              variant={density === 'spacious' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDensity('spacious')}
              className="h-8 px-2 text-xs"
            >
              Spacious
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsHistoryDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            View History
          </Button>
          {!isReadOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNewPeriodDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Period
            </Button>
          )}
          {/* Historical Periods Dialog */}
          <HistoryDialog
            isOpen={isHistoryDialogOpen}
            onOpenChange={setIsHistoryDialogOpen}
            periods={historicalPeriods}
            selectedDepartment={selectedDepartment}
            departmentName={departments.find(d => d.id === selectedDepartment)?.name || ""}
            onViewPeriod={handleViewHistoricalPeriod}
            isLoading={loadingHistory}
          />

          {/* New Period Dialog */}
          <NewPeriodDialog
            isOpen={isNewPeriodDialogOpen}
            onOpenChange={setIsNewPeriodDialogOpen}
            onSubmit={handleCreateNewPeriod}
            historicalPeriods={historicalPeriods.map(p => ({
              id: p.id!,
              description: p.description || `Period from ${format(p.effectiveFrom, 'PPP')}`
            }))}
            isSaving={saving}
          />

          {/* Exchange Rates Dialog */}
          <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isReadOnly}>
                <Calculator className="h-4 w-4 mr-2" />
                Exchange Rates
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Configure Exchange Rates
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="usd-rate">USD to KSH Rate</Label>
                  <Input
                    id="usd-rate"
                    type="number"
                    value={tempRates.usd}
                    onChange={(e) => setTempRates(prev => ({ ...prev, usd: parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter USD to KSH rate"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => {
                    setRates(tempRates)
                    setCurrentPeriod(prev => ({ ...prev, exchangeRates: tempRates }))
                    setIsRateDialogOpen(false)
                  }}>
                    Save Rates
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {!isReadOnly ? (
            <Button onClick={handleSaveRates} disabled={saving} size="sm">
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-muted border-t-current rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Rates
                </>
              )}
            </Button>
          ) : (
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

      {/* Tabs */}
      <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment} className="w-full">
        <div className="flex justify-between items-start gap-4 mb-6">
          <TabsList className="flex gap-1 bg-muted/50 p-1">
            {departments.map((dept) => (
              <TabsTrigger
                key={dept.id}
                value={dept.id}
                className="whitespace-nowrap data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span>{dept.name}</span>
                  {dept.tm_subdepartments && (
                    <Badge variant="secondary" className="text-xs">
                      {dept.tm_subdepartments.length}
                    </Badge>
                  )}
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

        {departments.map((dept) => (
          <TabsContent key={dept.id} value={dept.id}>
            <Card className="overflow-hidden">
              <div className="relative overflow-auto max-h-[calc(100vh-300px)] border-0">
                <Table className="min-w-max border-collapse">
                  <TableHeader className="sticky top-0 z-50 bg-background">
                    {/* Enhanced Main Headers with better visual separation */}
                    <TableRow className="bg-gradient-to-r from-slate-800 to-slate-700 text-white border-b-2 border-slate-600">
                      <TableHead className="sticky left-0 bg-slate-800 border-r-2 border-slate-600 w-16 z-50 text-center text-white font-semibold">#</TableHead>
                      <TableHead className="sticky left-16 bg-slate-800 border-r-2 border-slate-600 w-64 z-50 text-white font-semibold">Entity</TableHead>

                      {/* Color-coded header groups */}
                      <TableHead colSpan={3} className="border-r-4 border-blue-600 text-center text-white font-semibold bg-blue-700">
                        Processing Fee
                      </TableHead>
                      <TableHead colSpan={5} className="border-r-4 border-green-600 text-center text-white font-semibold bg-green-700">
                        Issuance Fee
                      </TableHead>
                      <TableHead colSpan={3} className="border-r-4 border-purple-600 text-center text-white font-semibold bg-purple-700">
                        BCL Consultancy
                      </TableHead>
                      <TableHead colSpan={3} className="border-r-4 border-orange-600 text-center text-white font-semibold bg-orange-700">
                        Officer
                      </TableHead>
                      <TableHead colSpan={6} className="border-r-4 border-red-600 text-center text-white font-semibold bg-red-700">
                        Extra Consideration
                      </TableHead>
                      <TableHead colSpan={4} className="text-center text-white font-semibold bg-indigo-700">
                        Convenience Fee
                      </TableHead>
                    </TableRow>

                    {/* Enhanced Sub Headers with tooltips and better organization */}
                    <TableRow className="bg-gradient-to-r from-slate-700 to-slate-600 text-white border-b border-slate-500">
                      <TableHead className="sticky left-0 bg-slate-700 border-r z-50"></TableHead>
                      <TableHead className="sticky left-16 bg-slate-700 border-r z-50"></TableHead>

                      {/* Processing Fee Sub-headers */}
                      <TableHead className="border-r border-blue-200 text-center text-xs text-white bg-blue-600/80">Amount</TableHead>
                      <TableHead className="border-r border-blue-200 text-center text-xs text-white bg-blue-600/80">Currency</TableHead>
                      <TableHead className="border-r-2 border-blue-300 text-center text-xs text-white bg-blue-600/80">Fee (KSH)</TableHead>

                      {/* Issuance Fee Sub-headers */}
                      <TableHead className="border-r border-green-200 text-center text-xs text-white bg-green-600/80">Amount</TableHead>
                      <TableHead className="border-r border-green-200 text-center text-xs text-white bg-green-600/80">Currency</TableHead>
                      <TableHead className="border-r border-green-200 text-center text-xs text-white bg-green-600/80">Fee (KSH)</TableHead>
                      <TableHead className="border-r border-green-200 text-center text-xs text-white bg-green-600/80">Period Type</TableHead>
                      <TableHead className="border-r-2 border-green-300 text-center text-xs text-white bg-green-600/80">Period Count</TableHead>

                      {/* BCL Consultancy Sub-headers */}
                      <TableHead className="border-r border-purple-200 text-center text-xs text-white bg-purple-600/80">Tier 1</TableHead>
                      <TableHead className="border-r border-purple-200 text-center text-xs text-white bg-purple-600/80">Tier 2</TableHead>
                      <TableHead className="border-r-2 border-purple-300 text-center text-xs text-white bg-purple-600/80">Tier 3</TableHead>

                      {/* Officer Sub-headers */}
                      <TableHead className="border-r border-orange-200 text-center text-xs text-white bg-orange-600/80">Boss Fixed</TableHead>
                      <TableHead className="border-r border-orange-200 text-center text-xs text-white bg-orange-600/80">PA Tier 1</TableHead>
                      <TableHead className="border-r-2 border-orange-300 text-center text-xs text-white bg-orange-600/80">PA Editable</TableHead>

                      {/* Extra Consideration Sub-headers */}
                      <TableHead className="border-r border-red-200 text-center text-xs text-white bg-red-600/80">Applicable</TableHead>
                      <TableHead className="border-r border-red-200 text-center text-xs text-white bg-red-600/80">TCC Company</TableHead>
                      <TableHead className="border-r border-red-200 text-center text-xs text-white bg-red-600/80">TCC Individual</TableHead>
                      <TableHead className="border-r border-red-200 text-center text-xs text-white bg-red-600/80">Auditors Fee</TableHead>
                      <TableHead className="border-r border-red-200 text-center text-xs text-white bg-red-600/80">Degree</TableHead>
                      <TableHead className="border-r-2 border-red-300 text-center text-xs text-white bg-red-600/80">TF File</TableHead>

                      {/* Convenience Fee Sub-headers */}
                      <TableHead className="border-r border-indigo-200 text-center text-xs text-white bg-indigo-600/80">Applicable</TableHead>
                      <TableHead className="border-r border-indigo-200 text-center text-xs text-white bg-indigo-600/80">Alien Assistance</TableHead>
                      <TableHead className="border-r border-indigo-200 text-center text-xs text-white bg-indigo-600/80">Re-Entry</TableHead>
                      <TableHead className="text-center text-xs text-white bg-indigo-600/80">Passport Endorsement</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {Object.entries(groupedEntries).flatMap(([subdeptName, entries], groupIndex) => {
                      const rows = []

                      if (entries.length > 1) {
                        const groupRowId = `group-${subdeptName}`
                        const isExpanded = expandedRows.has(groupRowId)
                        rows.push(
                          <TableRow key={groupRowId} className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-200 hover:from-slate-150 hover:to-slate-100 transition-all duration-200">
                            <TableCell className="sticky left-0 bg-slate-100 border-r text-center font-semibold text-sm z-30 px-3">
                              <div className="flex items-center justify-center">
                                <Badge variant="outline" className="bg-white">
                                  {groupIndex + 1}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="sticky left-16 bg-slate-100 border-r font-semibold z-30 px-3">
                              <div className="flex justify-between items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                  <span className="text-sm font-semibold text-slate-800">{subdeptName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {entries.length} entries
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 hover:bg-white/50"
                                    onClick={() => toggleRowExpansion(groupRowId)}
                                  >
                                    {isExpanded ? (
                                      <Minus className="h-3 w-3" />
                                    ) : (
                                      <Plus className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell colSpan={22} className="text-slate-600 italic text-sm px-3">
                              <div className="flex items-center gap-2">
                                <Info className="h-4 w-4 text-blue-500" />
                                Click to {isExpanded ? 'collapse' : 'expand'} and view individual rate entries
                              </div>
                            </TableCell>
                          </TableRow>
                        )

                        if (isExpanded) {
                          entries.forEach((entry, entryIndex) => {
                            rows.push(renderRateRow(entry, `${groupIndex + 1}.${entryIndex + 1}`, true, 1))
                          })
                        }
                      } else {
                        rows.push(renderRateRow(entries[0], `${groupIndex + 1}`, false, 0))
                      }

                      return rows
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Enhanced footer with summary info */}
              {/* <div className="border-t bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <div className="flex items-center gap-4">
                    <span>Total Entries: <span className="font-semibold">{currentPeriod.data.length}</span></span>
                    <span>|</span>
                    <span>Groups: <span className="font-semibold">{Object.keys(groupedEntries).length}</span></span>
                    <span>|</span>
                    <span>Last Updated: <span className="font-semibold">{format(currentPeriod.effectiveFrom, "PPp")}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${isReadOnly ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50'}`}>
                      {isReadOnly ? 'Read Only' : 'Editable'}
                    </Badge>
                  </div>
                </div>
              </div> */}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <History className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Rate History</h3>
                <p className="text-sm text-muted-foreground">
                  {departments.find(d => d.id === selectedDepartment)?.name}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {loadingHistory ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading historical data...</p>
              </div>
            ) : historicalPeriods.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <History className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-muted-foreground">No historical data found for this department.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historicalPeriods.map((period) => (
                  <Card
                    key={period.id}
                    className={`
                      cursor-pointer transition-all duration-200 hover:shadow-md
                      ${period.isActive
                        ? 'border-2 border-blue-500 bg-blue-50/50 shadow-sm'
                        : 'border border-slate-200 hover:border-slate-300'
                      }
                    `}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${period.isActive ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                            <span className="font-semibold text-slate-800">
                              {format(period.effectiveFrom, "PPP")}
                              {period.effectiveTo && ` - ${format(period.effectiveTo, "PPP")}`}
                            </span>
                            {period.isActive && (
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                Active
                              </Badge>
                            )}
                          </div>

                          {period.description && (
                            <p className="text-sm text-slate-600 bg-slate-50 px-3 py-1 rounded">
                              {period.description}
                            </p>
                          )}

                          <div className="flex items-center gap-6 text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              <span>USD Rate: {period.exchangeRates.usd}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Entries: {period.data.length}</span>
                            </div>
                            {period.createdAt && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Created: {format(period.createdAt, "PP")}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewHistoricalPeriod(period)}
                          className="ml-4 hover:bg-blue-50 hover:border-blue-300"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}