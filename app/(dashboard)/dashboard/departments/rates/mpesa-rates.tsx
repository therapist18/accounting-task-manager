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
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon, Calculator, Minus, Plus, Save, DollarSign, Clock, ChevronDown, History, Copy, Eye, ChevronRight, Info, Download, FileSpreadsheet, DownloadCloud, EyeOff, ChevronUp, Settings, CreditCard, Smartphone } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "../main-shared-components/column-visibility"
import ChargeCalculatorDialog from "./components/ChargeCalculatorDialog"

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

  // Return a unified blue theme, keeping distinct icons for clarity.
  return {
    color: 'bg-blue-50',          // Lighter blue for rate rows
    headerRowColor: 'bg-blue-100', // Slightly darker blue for category headers
    icon
  };
};

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
  const [calculatorDialogOpen, setCalculatorDialogOpen] = useState(false)
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({
    index: true,
    amountRange: true,
    charge: true,
    description: true,
    calculator: true,
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
      id: 'calculator',
      label: 'Calculator',
      visible: columnVisibility.calculator,
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
      calculator: true,
    })
  }

  const handleHideAllColumns = () => {
    setColumnVisibility({
      index: true,
      amountRange: true,
      charge: false,
      description: false,
      calculator: false,
    })
  }

  const handleResetToDefault = () => {
    setColumnVisibility({
      index: true,
      amountRange: true,
      charge: true,
      description: false,
      calculator: true,
    })
  }

  // Calculate charge for a given amount and transaction type
  const calculateCharge = (amount: number, transactionTypeId: string): number => {
    const transactionType = currentPeriod.transactionTypes.find(t => t.id === transactionTypeId)
    if (!transactionType) return 0

    const range = transactionType.ranges.find(r => amount >= r.amountFrom && amount <= r.amountTo)
    return range ? range.charge : 0
  }

  // Handle calculator
  const handleCalculatorAmountChange = (amount: string) => {
    setChargeCalculator(prev => ({ ...prev, amount }))

    if (amount && chargeCalculator.type) {
      const numAmount = parseFloat(amount)
      const charge = calculateCharge(numAmount, chargeCalculator.type)
      onChargeCalculated?.(numAmount, chargeCalculator.type, charge)
    }
  }

  const handleCalculatorTypeChange = (type: string) => {
    setChargeCalculator(prev => ({ ...prev, type }))

    if (chargeCalculator.amount && type) {
      const numAmount = parseFloat(chargeCalculator.amount)
      const charge = calculateCharge(numAmount, type)
      onChargeCalculated?.(numAmount, type, charge)
    }
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

  // Auto-save functionality (similar to the original rates page)
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

  // Auto-save when data changes
  useEffect(() => {
    if (hasUnsavedChanges && !isReadOnly) {
      debouncedSave()
    }
  }, [currentPeriod.transactionTypes, hasUnsavedChanges, debouncedSave, isReadOnly])

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">M-Pesa Transaction Rates</h2>
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
          {/* Charge Calculator Dialog Trigger */}
                   {/* Calculator Dialog */}
          <ChargeCalculatorDialog
            transactionTypes={currentPeriod.transactionTypes}
            onChargeCalculated={onChargeCalculated}
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
            className="ml-auto"
          >
            <DownloadCloud className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
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
                {columnVisibility.calculator && (
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
                            {categoryInfo.icon}
                            <div>
                              <div className="font-semibold text-sm relative group">
                                {transactionType.name}
                                <span className="absolute bottom-0 left-0 w-full h-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                                  <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-md p-2 shadow-md text-xs whitespace-pre-wrap">
                                    {transactionType.description}
                                  </div>
                                </span>
                              </div>
                              {transactionType.userType && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  {transactionType.userType}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {transactionType.ranges.length} ranges
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
                      <TableCell colSpan={10} className="text-slate-600 italic text-sm px-3 p-3">
                        {/* Click to {isExpanded ? 'collapse' : 'expand'} and view rate ranges */}
                      </TableCell>
                    </TableRow>

                    {/* Rate Ranges */}
                    {isExpanded && transactionType.ranges.map((range, rangeIndex) => (
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
                            <Badge variant="outline" className="bg-white border-blue-300">
                              {typeIndex + 1}.{rangeIndex + 1}
                            </Badge>
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

                        {columnVisibility.calculator && (
                          <TableCell className={cn("p-2", categoryInfo.color)}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setChargeCalculator({
                                  amount: ((range.amountFrom + range.amountTo) / 2).toString(),
                                  type: transactionType.id
                                })
                                setIsCalculatorOpen(true)
                              }}
                              className="h-7 text-xs"
                            >
                              Test
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            M-Pesa Transaction Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">Current Changes (2025)</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Standardized fees across all networks</li>
                <li>• Transfers to unregistered users discontinued </li>
                <li>• Free transactions for amounts KSh 1-100 </li>
                <li>• Maximum transaction: KSh 250,000 </li>
                <li>• Daily limit: KSh 500,000 </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">Transaction Types</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Send Money (M-Pesa, Airtel, T-Kash)</li>
                <li>• Till Number Payments</li>
                <li>• Paybill Payments</li>
                <li>• Agent Withdrawals</li>
                <li>• ATM Withdrawals</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">Key Features</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Real-time charge calculation</li>
                <li>• Historical rate periods</li>
                <li>• Editable transaction rates</li>
                <li>• Export to Excel functionality</li>
                <li>• Auto-save capabilities</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}