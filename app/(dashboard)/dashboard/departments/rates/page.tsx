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
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { 
  CalendarIcon, 
  Calculator, 
  Minus, 
  Plus, 
  Save, 
  DollarSign, 
  Clock, 
  ChevronDown, 
  History, 
  Copy, 
  Eye,
  ChevronRight,
  Info,
  Download,
  FileSpreadsheet
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "../departments/database"
import { supabase } from "@/lib/supabase/client"

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

  // Export function
  const exportToCSV = () => {
    const currentDept = departments.find(d => d.id === selectedDepartment)
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
      'Entity Type',
      'Entity Name',
      'Entity Path',
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
      'Extra Consideration Applicable',
      'TCC Company',
      'TCC Individual',
      'Auditors Fee',
      'Degree',
      'TF File',
      'Convenience Fee Applicable',
      'Alien Assistance',
      'Re-Entry Approval',
      'Passport Endorsement'
    ]

    const csvData = currentPeriod.data.map((entry, index) => [
      index + 1,
      entry.entityType,
      entry.entityName,
      entry.entityPath,
      entry.processingFee.amount,
      entry.processingFee.currency,
      entry.processingFee.rate,
      entry.issuanceFee.amount,
      entry.issuanceFee.currency,
      entry.issuanceFee.rate,
      entry.issuanceFee.periodType.join('; '),
      entry.issuanceFee.periodCount.join('; '),
      entry.bclConsultancy.tier1,
      entry.bclConsultancy.tier2,
      entry.bclConsultancy.tier3,
      entry.officer.bossFixed,
      entry.officer.paTier1,
      entry.officer.paEditable,
      entry.extraConsideration.applicable ? 'Yes' : 'No',
      entry.extraConsideration.tccCompanyIgnore,
      entry.extraConsideration.tccIndividualIgnore,
      entry.extraConsideration.auditorsFee,
      entry.extraConsideration.degree,
      entry.extraConsideration.tfFile,
      entry.convenienceFee.applicable ? 'Yes' : 'No',
      entry.convenienceFee.alienAssistance,
      entry.convenienceFee.reEntryApproval,
      entry.convenienceFee.passportEndorsement
    ])

    const csvContent = [headers, ...csvData]
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
      description: `Exported ${currentPeriod.data.length} rate entries to CSV`,
    })
  }

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
    const currentDepartment = departments.find(dept => dept.id === departmentId)
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

      toast({
        title: "Success",
        description: "Rates saved successfully.",
      })

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
    
    return (
      <TableRow 
        key={entry.id} 
        className={`
          ${isChild ? (depth === 1 ? 'bg-slate-50/50' : depth === 2 ? 'bg-purple-50/30' : 'bg-slate-100/50') : ''} 
          hover:bg-muted/50
          ${rowHeight} 
          transition-colors duration-150 ease-in-out
          ${depth > 0 ? `border-l-2 ${depth === 1 ? 'border-l-blue-200' : 'border-l-purple-200'}` : ''}
        `}
      >
        <TableCell className={`sticky left-0 bg-background border-r text-center font-mono ${fontSize} font-medium z-30 px-2`}>
          <div className="flex items-center justify-center">
            {index}
          </div>
        </TableCell>
        
        <TableCell className={`sticky left-16 bg-background border-r font-medium z-30 px-3`}>
          <div className={`flex items-center gap-2 ${paddingLeft}`}>
            {isChild && (
              <div className="flex items-center text-muted-foreground">
                <div className="w-4 h-4 flex items-center justify-center">
                  <ChevronRight className={`h-3 w-3 ${depth === 2 ? 'text-purple-500' : 'text-blue-500'}`} />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-0">
              <span className={`font-medium ${fontSize} truncate ${depth === 2 ? 'text-purple-700' : depth === 1 ? 'text-blue-700' : ''}`}>
                {entry.entityName}
              </span>
              <span className={`text-xs text-muted-foreground truncate ${isChild ? 'opacity-75' : ''}`}>
                {entry.entityPath}
              </span>
            </div>
          </div>
        </TableCell>

        {/* Processing Fee Section */}
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
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white transition-colors`}
            disabled={isReadOnly}
          />
        </TableCell>
        <TableCell className="border-r border-blue-100 bg-blue-50/30 p-2">
          <Select
            value={entry.processingFee.currency}
            onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'processingFee', value)}
            disabled={isReadOnly}
          >
            <SelectTrigger className={`${inputHeight} border-0 bg-white/70 focus:bg-white ${fontSize} transition-colors`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="KSH">KSH</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="border-r border-blue-200 bg-blue-50/30 p-2">
          <div className={`${inputHeight} ${fontSize} bg-blue-100/50 rounded px-2 flex items-center justify-center font-mono text-blue-800 font-semibold`}>
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
          className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white transition-colors`}
          disabled={isReadOnly}
        />
      </TableCell>
      <TableCell className="border-r border-green-100 bg-green-50/30 p-2">
        <Select
          value={entry.issuanceFee.currency}
          onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'issuanceFee', value)}
          disabled={isReadOnly}
        >
          <SelectTrigger className={`${inputHeight} border-0 bg-white/70 focus:bg-white ${fontSize} transition-colors`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="KSH">KSH</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="border-r border-green-100 bg-green-50/30 p-2">
        <div className={`${inputHeight} ${fontSize} bg-green-100/50 rounded px-2 flex items-center justify-center font-mono text-green-800 font-semibold`}>
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
      {['tier1', 'tier2', 'tier3'].map((tier, idx) => (
        <TableCell key={tier} className={`border-r border-purple-100 bg-purple-50/30 p-2 ${idx === 2 ? 'border-r-purple-200' : ''}`}>
          <Input
            type="number"
            value={entry.bclConsultancy[tier as keyof typeof entry.bclConsultancy]}
            onChange={(e) => updateRateEntry(entry.id, {
              bclConsultancy: {
                ...entry.bclConsultancy,
                [tier]: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white transition-colors`}
            disabled={isReadOnly}
          />
        </TableCell>
      ))}

      {/* Officer Section */}
      {['bossFixed', 'paTier1', 'paEditable'].map((field, idx) => (
        <TableCell key={field} className={`border-r border-orange-100 bg-orange-50/30 p-2 ${idx === 2 ? 'border-r-orange-200' : ''}`}>
          <Input
            type="number"
            value={entry.officer[field as keyof typeof entry.officer]}
            onChange={(e) => updateRateEntry(entry.id, {
              officer: {
                ...entry.officer,
                [field]: parseFloat(e.target.value) || 0
              }
            })}
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white transition-colors`}
            disabled={isReadOnly}
          />
        </TableCell>
      ))}

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
          <SelectTrigger className={`${inputHeight} w-full border-0 bg-white/70 focus:bg-white shadow-none ${fontSize} transition-colors`}>
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
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white transition-colors`}
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
          <SelectTrigger className={`${inputHeight} w-full border-0 bg-white/70 focus:bg-white shadow-none ${fontSize} transition-colors`}>
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
            className={`${inputHeight} text-center ${fontSize} border-0 bg-white/70 focus:bg-white transition-colors`}
            disabled={isReadOnly || !entry.convenienceFee.applicable}
          />
        </TableCell>
      ))}
    </TableRow>
  )
}

// Enhanced grouping for nested structure
const groupedEntries = currentPeriod.data.reduce((acc, entry) => {
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
        {/* Export Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={exportToCSV}
          disabled={!selectedDepartment || currentPeriod.data.length === 0}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export CSV
        </Button>

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

        {/* Historical Periods Dialog */}
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </DialogTrigger>
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

        {/* New Period Dialog */}
        <Dialog open={isNewPeriodDialogOpen} onOpenChange={setIsNewPeriodDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Period
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Plus className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Create New Rate Period</h3>
                  <p className="text-sm text-muted-foreground">Set up a new rate period for this department</p>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Description (Optional)</Label>
                <Input
                  value={newPeriodForm.description}
                  onChange={(e) => setNewPeriodForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Q2 2025 Rate Update"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">Add a descriptive name for this rate period</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Effective From</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(newPeriodForm.effectiveFrom, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newPeriodForm.effectiveFrom}
                        onSelect={(date) => date && setNewPeriodForm(prev => ({ ...prev, effectiveFrom: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Effective To (Optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newPeriodForm.effectiveTo ? format(newPeriodForm.effectiveTo, "PPP") : "No end date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newPeriodForm.effectiveTo || undefined}
                        onSelect={(date) => setNewPeriodForm(prev => ({ ...prev, effectiveTo: date || null }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Copy Rates From (Optional)</Label>
                <Select
                  value={newPeriodForm.copyFromPeriod?.toString() || "current"}
                  onValueChange={(value) => setNewPeriodForm(prev => ({
                    ...prev,
                    copyFromPeriod: value === "current" ? null : parseInt(value)
                  }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a period to copy rates from" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">
                      <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4" />
                        Start with current rates
                      </div>
                    </SelectItem>
                    {historicalPeriods.map((period) => (
                      <SelectItem key={period.id} value={period.id!.toString()}>
                        <div className="flex items-center gap-2">
                          <History className="h-4 w-4" />
                          <span>
                            {format(period.effectiveFrom, "PPP")}
                            {period.description && ` - ${period.description}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose existing rates to copy, or start fresh with current rates
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setIsNewPeriodDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateNewPeriod} 
                disabled={saving}
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Period
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Exchange Rates Dialog */}
        <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isReadOnly}>
              <Calculator className="h-4 w-4 mr-2" />
              Exchange Rates
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Calculator className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Configure Exchange Rates</h3>
                  <p className="text-sm text-muted-foreground">Set the USD to KSH conversion rate</p>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="usd-rate" className="text-sm font-medium">USD to KSH Rate</Label>
                <Input
                  id="usd-rate"
                  type="number"
                  value={tempRates.usd}
                  onChange={(e) => setTempRates(prev => ({ ...prev, usd: parseFloat(e.target.value) || 0 }))}
                  placeholder="Enter USD to KSH rate"
                  className="text-lg font-mono text-center"
                />
                <p className="text-xs text-muted-foreground">
                  Current rate: 1 USD = {tempRates.usd} KSH
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 mb-1">Important</p>
                    <p className="text-blue-700">
                      This rate will be used to automatically convert USD amounts to KSH for all calculations in this period.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setTempRates(rates)
                  setIsRateDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  setRates(tempRates)
                  setCurrentPeriod(prev => ({ ...prev, exchangeRates: tempRates }))
                  setIsRateDialogOpen(false)
                  toast({
                    title: "Exchange Rate Updated",
                    description: `USD rate set to ${tempRates.usd} KSH`,
                  })
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Save Rates
              </Button>
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

    {/* Tabs with improved styling */}
    <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment} className="w-full">
      <div className="flex justify-between items-start gap-4 mb-6">
        <TabsList className=" gap-1 bg-muted/50 p-1">
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
                    {/* Sticky Headers */}
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
                      {Object.entries(groupedEntries).flatMap(([subdeptName, subdeptData], groupIndex) => {
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
                            <TableRow key={groupRowId} className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-200 hover:from-slate-150 hover:to-slate-100 transition-all duration-200">
                              <TableCell className="sticky left-0 bg-slate-100 border-r text-center font-semibold text-sm z-30 px-3">
                                <Badge variant="outline" className="bg-white">
                                  {groupIndex + 1}
                                </Badge>
                              </TableCell>
                              <TableCell className="sticky left-16 bg-slate-100 border-r font-semibold z-30 px-3">
                                <div className="flex justify-between items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                    <span className="text-sm font-semibold text-slate-800">{subdeptName}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {totalEntries} entries
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
                              <TableCell colSpan={22} className="text-slate-600 italic text-sm px-3">
                                <div className="flex items-center gap-2">
                                  <Info className="h-4 w-4 text-blue-500" />
                                  Click to {isExpanded ? 'collapse' : 'expand'} and view rate entries
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
                                    <TableRow key={classRowId} className="bg-gradient-to-r from-blue-50 to-blue-25 border-b border-blue-100">
                                      <TableCell className="sticky left-0 bg-blue-50 border-r text-center font-semibold text-sm z-30 px-3">
                                        <Badge variant="outline" className="bg-white border-blue-300">
                                          {groupIndex + 1}.{entryCount}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-50 border-r font-semibold z-30 px-3 pl-8">
                                        <div className="flex justify-between items-center gap-3">
                                          <div className="flex items-center gap-2">
                                            <ChevronRight className="h-3 w-3 text-blue-500" />
                                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                            <span className="text-sm font-semibold text-blue-800">{className}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-xs bg-blue-100">
                                              {classEntryCount} entries
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
                                      <TableCell colSpan={22} className="text-blue-600 italic text-sm px-3">
                                        <div className="flex items-center gap-2">
                                          <Info className="h-4 w-4 text-purple-500" />
                                          Click to {isClassExpanded ? 'collapse' : 'expand'} and view {hasSubclasses ? 'subclass' : 'class'} entries
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
                                          <TableRow key={subclassRowId} className="bg-gradient-to-r from-purple-50 to-purple-25 border-b border-purple-100">
                                            <TableCell className="sticky left-0 bg-purple-50 border-r text-center font-semibold text-sm z-30 px-3">
                                              <Badge variant="outline" className="bg-white border-purple-300">
                                                {groupIndex + 1}.{entryCount}.{subCount}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="sticky left-16 bg-purple-50 border-r font-semibold z-30 px-3 pl-12">
                                              <div className="flex justify-between items-center gap-3">
                                                <div className="flex items-center gap-2">
                                                  <ChevronRight className="h-3 w-3 text-purple-500" />
                                                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                                  <span className="text-sm font-semibold text-purple-800">{subclassName}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <Badge variant="secondary" className="text-xs bg-purple-100">
                                                    {subclassEntries.length} entries
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
                                            <TableCell colSpan={22} className="text-purple-600 italic text-sm px-3">
                                              <div className="flex items-center gap-2">
                                                <Info className="h-4 w-4 text-orange-500" />
                                                Click to {isSubclassExpanded ? 'collapse' : 'expand'} and view subclass entries
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
                    </TableBody>
                  </Table>
                </div>
                
                {/* Enhanced footer with summary info */}
                <div className="border-t bg-slate-50 p-4">
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
                </div>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    )
   }