// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon, Calculator, Minus, Plus, Save, DollarSign, Clock, ChevronDown, History, Copy, Eye, ChevronRight, Info, Download, FileSpreadsheet, DownloadCloud, EyeOff, ChevronUp, Settings, CreditCard, Smartphone, Trash2 } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "../main-shared-components/column-visibility"
import ChargeCalculatorDialog from "./components/ChargeCalculatorDialog"
import SummaryDialog from "./components/SummaryDialog"

interface MPesaRateRange {
  id: string
  amountFrom: number
  amountTo: number
  charge: number
  description?: string
}

interface MPesaTransactionType {
  id: string
  name: string
  description: string
  category: 'send' | 'withdraw' | 'atm' | 'paybill' | 'till'
  userType?: 'registered' | 'unregistered' | 'all'
  ranges: MPesaRateRange[]
}

interface MPesaRatePeriod {
  id?: number
  effectiveFrom: Date
  effectiveTo: Date | null
  transactionTypes: MPesaTransactionType[]
  description?: string
  isActive?: boolean
  createdAt?: Date
  createdBy?: string
}

const defaultMPesaRates: MPesaTransactionType[] = [
  {
    id: 'send_registered',
    name: 'Send Money - Registered Users',
    description: 'Send money to M-Pesa, Airtel Money, and T-Kash users',
    category: 'send',
    userType: 'registered',
    ranges: [
      { id: '1', amountFrom: 1, amountTo: 100, charge: 0, description: 'Free transactions' },
      { id: '2', amountFrom: 101, amountTo: 500, charge: 7 },
      { id: '3', amountFrom: 501, amountTo: 1000, charge: 13 },
      { id: '4', amountFrom: 1001, amountTo: 1500, charge: 23 },
      { id: '5', amountFrom: 1501, amountTo: 2500, charge: 33 },
      { id: '6', amountFrom: 2501, amountTo: 3500, charge: 53 },
      { id: '7', amountFrom: 3501, amountTo: 5000, charge: 57 },
      { id: '8', amountFrom: 5001, amountTo: 7500, charge: 78 },
      { id: '9', amountFrom: 7501, amountTo: 10000, charge: 90 },
      { id: '10', amountFrom: 10001, amountTo: 15000, charge: 100 },
      { id: '11', amountFrom: 15001, amountTo: 20000, charge: 105 },
      { id: '12', amountFrom: 20001, amountTo: 35000, charge: 108 },
      { id: '13', amountFrom: 35001, amountTo: 250000, charge: 108 },
    ]
  },
  {
    id: 'till_number',
    name: 'Till Number Payments',
    description: 'Business Till to Customer payments',
    category: 'till',
    userType: 'all',
    ranges: [
      { id: '1', amountFrom: 1, amountTo: 100, charge: 0, description: 'Free transactions' },
      { id: '2', amountFrom: 101, amountTo: 500, charge: 7 },
      { id: '3', amountFrom: 501, amountTo: 1000, charge: 13 },
      { id: '4', amountFrom: 1001, amountTo: 1500, charge: 23 },
      { id: '5', amountFrom: 1501, amountTo: 2500, charge: 33 },
      { id: '6', amountFrom: 2501, amountTo: 3500, charge: 53 },
      { id: '7', amountFrom: 3501, amountTo: 5000, charge: 57 },
      { id: '8', amountFrom: 5001, amountTo: 7500, charge: 78 },
      { id: '9', amountFrom: 7501, amountTo: 10000, charge: 90 },
      { id: '10', amountFrom: 10001, amountTo: 15000, charge: 100 },
      { id: '11', amountFrom: 15001, amountTo: 20000, charge: 105 },
      { id: '12', amountFrom: 20001, amountTo: 35000, charge: 108 },
      { id: '13', amountFrom: 35001, amountTo: 250000, charge: 108 },
    ]
  },
  {
    id: 'paybill',
    name: 'Paybill Payments',
    description: 'Pay bills via Paybill numbers',
    category: 'paybill',
    userType: 'all',
    ranges: [
      { id: '1', amountFrom: 1, amountTo: 100, charge: 0, description: 'Free transactions' },
      { id: '2', amountFrom: 101, amountTo: 500, charge: 5 },
      { id: '3', amountFrom: 501, amountTo: 1000, charge: 13 },
      { id: '4', amountFrom: 1001, amountTo: 1500, charge: 23 },
      { id: '5', amountFrom: 1501, amountTo: 2500, charge: 33 },
      { id: '6', amountFrom: 2501, amountTo: 3500, charge: 53 },
      { id: '7', amountFrom: 3501, amountTo: 5000, charge: 57 },
      { id: '8', amountFrom: 5001, amountTo: 7500, charge: 78 },
      { id: '9', amountFrom: 7501, amountTo: 10000, charge: 90 },
      { id: '10', amountFrom: 10001, amountTo: 15000, charge: 100 },
      { id: '11', amountFrom: 15001, amountTo: 20000, charge: 105 },
      { id: '12', amountFrom: 20001, amountTo: 35000, charge: 108 },
      { id: '13', amountFrom: 35001, amountTo: 250000, charge: 108 },
    ]
  },
  {
    id: 'withdraw_agent',
    name: 'Agent Withdrawals',
    description: 'Withdraw money from M-Pesa agents',
    category: 'withdraw',
    userType: 'all',
    ranges: [
      { id: '1', amountFrom: 50, amountTo: 100, charge: 11, description: 'Minimum withdrawal KSh 50' },
      { id: '2', amountFrom: 101, amountTo: 500, charge: 29 },
      { id: '3', amountFrom: 501, amountTo: 1000, charge: 29 },
      { id: '4', amountFrom: 1001, amountTo: 1500, charge: 29 },
      { id: '5', amountFrom: 1501, amountTo: 2500, charge: 29 },
      { id: '6', amountFrom: 2501, amountTo: 3500, charge: 52 },
      { id: '7', amountFrom: 3501, amountTo: 5000, charge: 69 },
      { id: '8', amountFrom: 5001, amountTo: 7500, charge: 87 },
      { id: '9', amountFrom: 7501, amountTo: 10000, charge: 115 },
      { id: '10', amountFrom: 10001, amountTo: 15000, charge: 167 },
      { id: '11', amountFrom: 15001, amountTo: 20000, charge: 185 },
      { id: '12', amountFrom: 20001, amountTo: 35000, charge: 197 },
      { id: '13', amountFrom: 35001, amountTo: 50000, charge: 278 },
      { id: '14', amountFrom: 50001, amountTo: 250000, charge: 309 },
    ]
  },
  {
    id: 'atm_withdraw',
    name: 'ATM Withdrawals',
    description: 'Withdraw money from ATMs using M-Pesa',
    category: 'atm',
    userType: 'all',
    ranges: [
      { id: '1', amountFrom: 200, amountTo: 2500, charge: 35, description: 'Minimum ATM withdrawal KSh 200' },
      { id: '2', amountFrom: 2501, amountTo: 5000, charge: 69 },
      { id: '3', amountFrom: 5001, amountTo: 10000, charge: 115 },
      { id: '4', amountFrom: 10001, amountTo: 35000, charge: 203 },
    ]
  }
]

// Helper function to get category color and icon
const getCategoryInfo = (category: string) => {
  let icon;
  switch (category) {
    case 'send':
      icon = <Smartphone className="h-4 w-4" />;
      break;
    case 'till':
      icon = <Calculator className="h-4 w-4" />;
      break;
    case 'paybill':
      icon = <FileSpreadsheet className="h-4 w-4" />;
      break;
    case 'withdraw':
    case 'atm':
      icon = <CreditCard className="h-4 w-4" />;
      break;
    default:
      icon = <Calculator className="h-4 w-4" />;
      break;
  }

  return {
    color: 'bg-blue-50',
    headerRowColor: 'bg-blue-100',
    icon
  };
};

// Historical Periods Dialog Component
const HistoricalPeriodsDialog = ({
  isOpen,
  onOpenChange,
  historicalPeriods,
  loadingHistory,
  onViewHistoricalPeriod
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  historicalPeriods: MPesaRatePeriod[]
  loadingHistory: boolean
  onViewHistoricalPeriod: (period: MPesaRatePeriod) => void
}) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm">
        <History className="h-4 w-4 mr-2" />
        History
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>M-Pesa Rates History</DialogTitle>
      </DialogHeader>

      {loadingHistory ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {historicalPeriods.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No historical periods found.</p>
          ) : (
            <div className="space-y-2">
              {historicalPeriods.map((period) => (
                <Card key={period.id} className={cn(
                  "cursor-pointer transition-colors hover:bg-muted/50",
                  period.isActive ? "border-blue-500 bg-blue-50/30" : ""
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {format(period.effectiveFrom, "PPP")}
                            {period.effectiveTo && ` - ${format(period.effectiveTo, "PPP")}`}
                          </span>
                          {period.isActive && (
                            <Badge variant="default" className="bg-blue-600">
                              Active
                            </Badge>
                          )}
                        </div>
                        {period.description && (
                          <p className="text-sm text-muted-foreground">{period.description}</p>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Created: {period.createdAt ? format(period.createdAt, "PPp") : 'Unknown'}
                          {period.createdBy && ` by ${period.createdBy}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {period.transactionTypes.reduce((total, type) => total + type.ranges.length, 0)} ranges
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewHistoricalPeriod(period)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </DialogContent>
  </Dialog>
)

// New Period Dialog Component
const NewPeriodDialog = ({
  isOpen,
  onOpenChange,
  historicalPeriods,
  onCreatePeriod,
  saving
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  historicalPeriods: MPesaRatePeriod[]
  onCreatePeriod: (formData: any) => Promise<void>
  saving: boolean
}) => {
  const [formData, setFormData] = useState({
    effectiveFrom: new Date(),
    effectiveTo: null as Date | null,
    description: '',
    copyFromPeriod: null as number | null
  })

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Period
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Rate Period</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Effective From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(formData.effectiveFrom, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.effectiveFrom}
                  onSelect={(date) => date && setFormData(prev => ({ ...prev, effectiveFrom: date }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Effective To (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.effectiveTo ? format(formData.effectiveTo, "PPP") : "No end date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.effectiveTo}
                  onSelect={(date) => setFormData(prev => ({ ...prev, effectiveTo: date }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="Optional description for this period"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Copy From Period (Optional)</Label>
            <Select
              value={formData.copyFromPeriod?.toString() || ""}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                copyFromPeriod: value ? parseInt(value) : null
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select period to copy from" />
              </SelectTrigger>
              <SelectContent>
                {historicalPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id!.toString()}>
                    {format(period.effectiveFrom, "PPP")}
                    {period.description && ` - ${period.description}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => onCreatePeriod(formData)}
              className="flex-1"
              disabled={saving}
            >
              {saving ? "Creating..." : "Create Period"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface MPesaRatesProps {
  onChargeCalculated?: (amount: number, transactionType: string, charge: number) => void
}

export default function MPesaRates({ onChargeCalculated }: MPesaRatesProps) {
  const [currentPeriod, setCurrentPeriod] = useState<MPesaRatePeriod>({
    effectiveFrom: new Date(),
    effectiveTo: null,
    transactionTypes: defaultMPesaRates,
    description: 'Current M-Pesa Rates 2025',
    isActive: true
  })

  const [historicalPeriods, setHistoricalPeriods] = useState<MPesaRatePeriod[]>([])
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [isNewPeriodDialogOpen, setIsNewPeriodDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())
  const [chargeCalculator, setChargeCalculator] = useState({ amount: '', type: '' })
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({
    index: true,
    amountRange: true,
    charge: true,
    description: true,
    actions: true,
  })

  // Column visibility options
  const columnVisibilityOptions: ColumnVisibilityOption[] = useMemo(() => [
    {
      id: 'index',
      label: 'Index (#)',
      visible: columnVisibility.index,
      disabled: true,
      isDefault: true,
      group: 'Basic'
    },
    {
      id: 'amountRange',
      label: 'Amount Range',
      visible: columnVisibility.amountRange,
      disabled: true,
      isDefault: true,
      group: 'Basic'
    },
    {
      id: 'charge',
      label: 'Charge (KSh)',
      visible: columnVisibility.charge,
      isDefault: true,
      group: 'Fees'
    },
    {
      id: 'description',
      label: 'Description',
      visible: columnVisibility.description,
      isDefault: false,
      group: 'Additional'
    },
    {
      id: 'actions',
      label: 'Actions',
      visible: columnVisibility.actions,
      isDefault: true,
      group: 'Tools'
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
      amountRange: true,
      charge: true,
      description: true,
      actions: true,
    })
  }

  const handleHideAllColumns = () => {
    setColumnVisibility({
      index: true,
      amountRange: true,
      charge: false,
      description: false,
      actions: false,
    })
  }

  const handleResetToDefault = () => {
    setColumnVisibility({
      index: true,
      amountRange: true,
      charge: true,
      description: false,
      actions: true,
    })
  }

  // Generate unique ID for new ranges
  const generateRangeId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }

  // Calculate charge for a given amount and transaction type
  const calculateCharge = (amount: number, transactionTypeId: string): number => {
    const transactionType = currentPeriod.transactionTypes.find(t => t.id === transactionTypeId)
    if (!transactionType) return 0

    const range = transactionType.ranges.find(r => amount >= r.amountFrom && amount <= r.amountTo)
    return range ? range.charge : 0
  }

  // Toggle transaction type expansion
  const toggleTypeExpansion = (typeId: string) => {
    setExpandedTypes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(typeId)) {
        newSet.delete(typeId)
      } else {
        newSet.add(typeId)
      }
      return newSet
    })
  }

  // Expand/Collapse All functionality
  const expandAllTypes = () => {
    setExpandedTypes(new Set(currentPeriod.transactionTypes.map(t => t.id)))
  }

  const collapseAllTypes = () => {
    setExpandedTypes(new Set())
  }

  const areAllTypesExpanded = expandedTypes.size === currentPeriod.transactionTypes.length

  // Update range data
  const updateRange = (typeId: string, rangeId: string, updates: Partial<MPesaRateRange>) => {
    if (isReadOnly) return

    setCurrentPeriod(prev => ({
      ...prev,
      transactionTypes: prev.transactionTypes.map(type =>
        type.id === typeId
          ? {
            ...type,
            ranges: type.ranges.map(range =>
              range.id === rangeId ? { ...range, ...updates } : range
            )
          }
          : type
      )
    }))
    setHasUnsavedChanges(true)
  }

  // Add new range to transaction type
  const addNewRange = (typeId: string) => {
    if (isReadOnly) return

    const transactionType = currentPeriod.transactionTypes.find(t => t.id === typeId)
    if (!transactionType) return

    // Get the last range to determine the next amount range
    const lastRange = transactionType.ranges[transactionType.ranges.length - 1]
    const newAmountFrom = lastRange ? lastRange.amountTo + 1 : 1
    const newAmountTo = newAmountFrom + 999

    const newRange: MPesaRateRange = {
      id: generateRangeId(),
      amountFrom: newAmountFrom,
      amountTo: newAmountTo,
      charge: 0,
      description: ''
    }

    setCurrentPeriod(prev => ({
      ...prev,
      transactionTypes: prev.transactionTypes.map(type =>
        type.id === typeId
          ? { ...type, ranges: [...type.ranges, newRange] }
          : type
      )
    }))
    setHasUnsavedChanges(true)

    toast({
      title: "Range Added",
      description: `New range added to ${transactionType.name}`,
    })
  }

  // Delete range from transaction type
  const deleteRange = (typeId: string, rangeId: string) => {
    if (isReadOnly) return

    setCurrentPeriod(prev => ({
      ...prev,
      transactionTypes: prev.transactionTypes.map(type =>
        type.id === typeId
          ? { ...type, ranges: type.ranges.filter(range => range.id !== rangeId) }
          : type
      )
    }))
    setHasUnsavedChanges(true)

    toast({
      title: "Range Deleted",
      description: "Transaction range has been removed",
    })
  }

  // Load current M-Pesa rates
  const loadCurrentRates = async () => {
    try {
      const { data: rateHistory, error } = await supabase
        .from('mpesa_rates_history')
        .select('*')
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)

      if (error) throw error

      if (rateHistory && rateHistory.length > 0) {
        const latestRates = rateHistory[0]
        const period: MPesaRatePeriod = {
          id: latestRates.id,
          effectiveFrom: new Date(latestRates.effective_from),
          effectiveTo: latestRates.effective_to ? new Date(latestRates.effective_to) : null,
          transactionTypes: latestRates.transaction_types || defaultMPesaRates,
          description: latestRates.description || '',
          isActive: true
        }
        setCurrentPeriod(period)
        setIsReadOnly(false)
        setHasUnsavedChanges(false)
      } else {
        // Create initial period if none exists
        const { data, error } = await supabase
          .from('mpesa_rates_history')
          .insert({
            effective_from: new Date().toISOString().split('T')[0],
            transaction_types: defaultMPesaRates,
            description: 'Current M-Pesa Rates 2025',
            is_active: true,
            created_by: 'current_user'
          })
          .select()
          .single()

        if (error) throw error

        const period: MPesaRatePeriod = {
          id: data.id,
          effectiveFrom: new Date(data.effective_from),
          effectiveTo: null,
          transactionTypes: data.transaction_types || defaultMPesaRates,
          description: data.description || '',
          isActive: true
        }
        setCurrentPeriod(period)
        setIsReadOnly(false)
        setHasUnsavedChanges(false)
      }
    } catch (error) {
      console.error('Error loading M-Pesa rates:', error)
      toast({
        title: "Error",
        description: "Failed to load M-Pesa rates. Using defaults.",
        variant: "destructive"
      })
    }
  }

  // Load historical periods
  const loadHistoricalPeriods = async () => {
    try {
      setLoadingHistory(true)
      const { data: history, error } = await supabase
        .from('mpesa_rates_history')
        .select('*')
        .order('effective_from', { ascending: false })

      if (error) throw error

      const periods: MPesaRatePeriod[] = (history || []).map(record => ({
        id: record.id,
        effectiveFrom: new Date(record.effective_from),
        effectiveTo: record.effective_to ? new Date(record.effective_to) : null,
        transactionTypes: record.transaction_types || [],
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

  // Handle viewing historical period
  const handleViewHistoricalPeriod = (period: MPesaRatePeriod) => {
    setCurrentPeriod(period)
    setIsReadOnly(!period.isActive)
    setIsHistoryDialogOpen(false)
    setHasUnsavedChanges(false)

    toast({
      title: "Historical Period Loaded",
      description: `Viewing rates from ${format(period.effectiveFrom, "PPP")}${period.isActive ? " (Active)" : " (Historical)"}`,
    })
  }

  // Handle updating period
  const handleUpdatePeriod = async (formData: any) => {
    setSaving(true)
    try {
      // Get the current active period
      const { data: activePeriod, error: activeError } = await supabase
        .from('mpesa_rates_history')
        .select('*')
        .eq('is_active', true)
        .single()

      if (activeError) throw activeError

      // If no active period exists, create a new one
      if (!activePeriod) {
        const { error } = await supabase
          .from('mpesa_rates_history')
          .insert({
            effective_from: formData.effectiveFrom.toISOString().split('T')[0],
            effective_to: formData.effectiveTo?.toISOString().split('T')[0] || null,
            transaction_types: currentPeriod.transactionTypes,
            description: formData.description,
            is_active: true,
            created_by: 'current_user'
          })

        if (error) throw error
      } else {
        // Update the existing active period's transaction_types only
        const { error } = await supabase
          .from('mpesa_rates_history')
          .update({
            transaction_types: currentPeriod.transactionTypes,
            description: formData.description,
            updated_at: new Date().toISOString()
          })
          .eq('id', activePeriod.id)

        if (error) throw error
      }

      toast({
        title: "Success",
        description: "M-Pesa rate period updated successfully.",
      })

      setIsNewPeriodDialogOpen(false)

      // Reload current rates and history
      await loadCurrentRates()
      await loadHistoricalPeriods()
    } catch (error) {
      console.error('Error updating period:', error)
      toast({
        title: "Error",
        description: "Failed to update period. Please try again.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  // Auto-save functionality
  const debouncedSave = useCallback(
    debounce(async () => {
      if (currentPeriod.transactionTypes.length === 0 || isReadOnly) {
        return
      }

      setSaving(true)
      try {
        if (currentPeriod.id) {
          const { error } = await supabase
            .from('mpesa_rates_history')
            .update({
              transaction_types: currentPeriod.transactionTypes,
              description: currentPeriod.description,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentPeriod.id)

          if (error) throw error
        } else {
          const { error } = await supabase
            .from('mpesa_rates_history')
            .insert({
              effective_from: currentPeriod.effectiveFrom.toISOString().split('T')[0],
              effective_to: currentPeriod.effectiveTo?.toISOString().split('T')[0] || null,
              transaction_types: currentPeriod.transactionTypes,
              description: currentPeriod.description || '',
              is_active: true,
              created_by: 'current_user'
            })

          if (error) throw error
        }

        setHasUnsavedChanges(false)
      } catch (error) {
        console.error('Error auto-saving M-Pesa rates:', error)
        toast({
          title: "Auto-save failed",
          description: "Your changes are temporarily saved locally. Try refreshing the page.",
          variant: "destructive"
        })
      } finally {
        setSaving(false)
      }
    }, 1000),
    [currentPeriod, isReadOnly]
  )

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

  // Export to CSV functionality
  const exportToCSV = () => {
    if (currentPeriod.transactionTypes.length === 0) {
      toast({
        title: "No data to export",
        description: "Please ensure there are M-Pesa rates to export",
        variant: "destructive"
      })
      return
    }

    const headers = [
      'Transaction Type',
      'Category',
      'User Type',
      'Amount From',
      'Amount To',
      'Charge (KSh)',
      'Description'
    ]

    const csvData: string[][] = []

    currentPeriod.transactionTypes.forEach(type => {
      type.ranges.forEach(range => {
        csvData.push([
          type.name,
          type.category,
          type.userType || 'all',
          range.amountFrom.toString(),
          range.amountTo.toString(),
          range.charge.toString(),
          range.description || ''
        ])
      })
    })

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `mpesa_transaction_rates_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Export Successful",
      description: `Exported M-Pesa transaction rates to CSV`,
    })
  }

  // Auto-save when data changes
  useEffect(() => {
    if (hasUnsavedChanges && !isReadOnly) {
      debouncedSave()
    }
  }, [currentPeriod.transactionTypes, hasUnsavedChanges, debouncedSave, isReadOnly])

  // Load data on component mount
  useEffect(() => {
    loadCurrentRates()
    loadHistoricalPeriods()
  }, [])

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-4">
            M-Pesa Transaction Rates
            <SummaryDialog currentPeriod={currentPeriod} />
          </h2>
          <p className="text-muted-foreground">Manage M-Pesa transaction charges and fees for petty cash calculations</p>
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

        {/* Control Panel */}
        <div className="flex items-center gap-2">
          {/* Charge Calculator Dialog */}
          <ChargeCalculatorDialog
            transactionTypes={currentPeriod.transactionTypes}
            onChargeCalculated={onChargeCalculated}
          />

          {/* Historical Periods Dialog */}
          <HistoricalPeriodsDialog
            isOpen={isHistoryDialogOpen}
            onOpenChange={setIsHistoryDialogOpen}
            historicalPeriods={historicalPeriods}
            loadingHistory={loadingHistory}
            onViewHistoricalPeriod={handleViewHistoricalPeriod}
          />

          {/* New Period Dialog */}
          <NewPeriodDialog
            isOpen={isNewPeriodDialogOpen}
            onOpenChange={setIsNewPeriodDialogOpen}
            historicalPeriods={historicalPeriods}
            onCreatePeriod={handleUpdatePeriod}
            saving={saving}
          />

          {/* Expand/Collapse All */}
          <Button
            variant="outline"
            onClick={areAllTypesExpanded ? collapseAllTypes : expandAllTypes}
            className="flex items-center gap-2"
          >
            {areAllTypesExpanded ? (
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

          {/* Column Visibility Control */}
          <ColumnVisibilityControl
            columns={columnVisibilityOptions}
            onVisibilityChange={handleColumnVisibilityChange}
            onShowAll={handleShowAllColumns}
            onHideAll={handleHideAllColumns}
            onResetToDefault={handleResetToDefault}
            title="Column Visibility"
            description="Toggle M-Pesa rates table columns"
          />

          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={currentPeriod.transactionTypes.length === 0}
          >
            <DownloadCloud className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>

          {isReadOnly && (
            <Button
              onClick={loadCurrentRates}
              variant="outline"
              size="sm"
            >
              Back to Current
            </Button>
          )}
        </div>
      </div>

      {/* Period Information */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-600" />
                <span className="font-medium">
                  Effective: {format(currentPeriod.effectiveFrom, "PPP")}
                  {currentPeriod.effectiveTo && ` - ${format(currentPeriod.effectiveTo, "PPP")}`}
                </span>
              </div>
              {currentPeriod.description && (
                <Badge variant="outline" className="text-xs">
                  {currentPeriod.description}
                </Badge>
              )}
              <div className="text-muted-foreground">
                Last updated: {format(new Date(), "PPp")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Transaction limits: Max KSh 250,000 per transaction | Daily limit KSh 500,000
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Card className="overflow-hidden">
        <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
          <Table className="min-w-max">
            <TableHeader className="sticky top-0 z-50">
              <TableRow className="bg-blue-700 text-white border-b border-slate-300">
                {columnVisibility.index && (
                  <TableHead className="sticky left-0 bg-blue-700 border-r-2 border-white/20 w-16 z-50 text-center text-white font-semibold p-2">
                    #
                  </TableHead>
                )}
                <TableHead className={cn(
                  "sticky bg-blue-700 border-r-2 border-white/20 w-64 z-50 text-white font-semibold p-2",
                  columnVisibility.index ? "left-16" : "left-0"
                )}>
                  Transaction Type
                </TableHead>
                {columnVisibility.amountRange && (
                  <TableHead className="border-r border-white/20 text-center text-white font-semibold bg-blue-700 p-2 min-w-40">
                    Amount Range (KSh)
                  </TableHead>
                )}
                {columnVisibility.charge && (
                  <TableHead className="border-r border-white/20 text-center text-white font-semibold bg-blue-700 p-2 min-w-32">
                    Charge (KSh)
                  </TableHead>
                )}
                {columnVisibility.description && (
                  <TableHead className="border-r border-white/20 text-center text-white font-semibold bg-blue-700 p-2 min-w-48">
                    Description
                  </TableHead>
                )}
                {columnVisibility.actions && (
                  <TableHead className="text-center text-white font-semibold bg-blue-700 p-2 min-w-32">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {currentPeriod.transactionTypes.map((transactionType, typeIndex) => {
                const isExpanded = expandedTypes.has(transactionType.id)
                const categoryInfo = getCategoryInfo(transactionType.category)

                return (
                  <React.Fragment key={transactionType.id}>
                    {/* Transaction Type Header Row */}
                    <TableRow
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-blue-200/50",
                        categoryInfo.headerRowColor
                      )}
                      onClick={() => toggleTypeExpansion(transactionType.id)}
                    >
                      {columnVisibility.index && (
                        <TableCell className="sticky left-0 bg-blue-100 border-r text-center font-semibold text-sm z-30 px-3 p-3">
                          {typeIndex + 1}
                        </TableCell>
                      )}
                      <TableCell className={cn(
                        "sticky bg-blue-100 border-r font-semibold z-30 px-3 p-3",
                        columnVisibility.index ? "left-16" : "left-0"
                      )}>
                        <div className="flex justify-between items-center gap-3">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="font-semibold text-sm">{transactionType.name}</div>
                              <div className="text-xs text-muted-foreground">{transactionType.description}</div>
                              {transactionType.userType && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  {transactionType.userType}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs bg-blue-200 font-medium">
                              {transactionType.ranges.length}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-white/50"
                            >
                              {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell colSpan={10} className="text-slate-600 italic text-sm px-3 p-3 text-center">
                        {/* Click to {isExpanded ? 'collapse' : 'expand'} and view ranges */}
                        -
                      </TableCell>
                    </TableRow>

                    {/* Rate Ranges */}
                    {isExpanded && (
                      <>
                        {transactionType.ranges.map((range, rangeIndex) => (
                          <TableRow
                            key={range.id}
                            className={cn(
                              "hover:bg-blue-100/60 transition-colors",
                              categoryInfo.color,
                              "border-l-2 border-l-blue-200"
                            )}
                          >
                            {columnVisibility.index && (
                              <TableCell className="sticky left-0 bg-blue-50 border-r text-center text-sm z-30 px-3 p-2">
                                {typeIndex + 1}.{rangeIndex + 1}
                              </TableCell>
                            )}
                            <TableCell className={cn(
                              "sticky bg-blue-50 border-r z-30 px-3 pl-12 p-2",
                              columnVisibility.index ? "left-16" : "left-0"
                            )}>
                              <div className="flex items-center gap-2">
                                <ChevronRight className="h-3 w-3 text-blue-500" />
                                <span className="text-sm text-blue-700">Range {rangeIndex + 1}</span>
                              </div>
                            </TableCell>

                            {columnVisibility.amountRange && (
                              <TableCell className={cn("border-r border-gray-200 p-2", categoryInfo.color)}>
                                <div className="flex items-center gap-1 text-xs">
                                  <Input
                                    type="number"
                                    value={range.amountFrom}
                                    onChange={(e) => updateRange(transactionType.id, range.id, {
                                      amountFrom: parseFloat(e.target.value) || 0
                                    })}
                                    className="h-7 w-20 text-center text-xs border-gray-200 bg-white/70 focus:bg-white"
                                    disabled={isReadOnly}
                                  />
                                  <span>-</span>
                                  <Input
                                    type="number"
                                    value={range.amountTo}
                                    onChange={(e) => updateRange(transactionType.id, range.id, {
                                      amountTo: parseFloat(e.target.value) || 0
                                    })}
                                    className="h-7 w-20 text-center text-xs border-gray-200 bg-white/70 focus:bg-white"
                                    disabled={isReadOnly}
                                  />
                                </div>
                              </TableCell>
                            )}

                            {columnVisibility.charge && (
                              <TableCell className={cn("border-r border-gray-200 p-2", categoryInfo.color)}>
                                <Input
                                  type="number"
                                  value={range.charge}
                                  onChange={(e) => updateRange(transactionType.id, range.id, {
                                    charge: parseFloat(e.target.value) || 0
                                  })}
                                  className="h-7 text-center text-xs border-gray-200 bg-white/70 focus:bg-white"
                                  disabled={isReadOnly}
                                />
                              </TableCell>
                            )}

                            {columnVisibility.description && (
                              <TableCell className={cn("border-r border-gray-200 p-2", categoryInfo.color)}>
                                <Input
                                  type="text"
                                  value={range.description || ''}
                                  onChange={(e) => updateRange(transactionType.id, range.id, {
                                    description: e.target.value
                                  })}
                                  placeholder="Optional description"
                                  className="h-7 text-xs border-gray-200 bg-white/70 focus:bg-white"
                                  disabled={isReadOnly}
                                />
                              </TableCell>
                            )}

                            {columnVisibility.actions && (
                              <TableCell className={cn("p-2", categoryInfo.color)}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setChargeCalculator({
                                        amount: ((range.amountFrom + range.amountTo) / 2).toString(),
                                        type: transactionType.id
                                      })
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    Test
                                  </Button>
                                  {!isReadOnly && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => deleteRange(transactionType.id, range.id)}
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}

                        {/* Add New Range Row */}
                        {!isReadOnly && (
                          <TableRow className={cn("border-l-2 border-l-blue-200", categoryInfo.color)}>
                            {columnVisibility.index && (
                              <TableCell className="sticky left-0 bg-blue-50 border-r text-center text-sm z-30 px-3 p-2">
                                <Plus className="h-3 w-3 text-blue-500" />
                              </TableCell>
                            )}
                            <TableCell
                              className={cn(
                                "sticky bg-blue-50 border-r z-30 px-3 pl-12 p-2",
                                columnVisibility.index ? "left-16" : "left-0"
                              )}
                              colSpan={10}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => addNewRange(transactionType.id)}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                              >
                                <Plus className="h-3 w-3 mr-2" />
                                Add New Range
                              </Button>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}