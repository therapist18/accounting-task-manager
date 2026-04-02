// @ts-nocheck
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Pencil, Trash2, ArrowUp, ArrowDown, Plus, X, Check, Settings, Minus, Download, ChevronDown, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import supabase from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import * as XLSX from 'xlsx'

type RateDefinition = {
  ksh: number
  usd: number
}

const PERIOD_DENOMINATIONS = ['Months', 'Years'] as const
type PeriodDenomination = typeof PERIOD_DENOMINATIONS[number]

const ISSUANCE_PERIODS = [1, 2, 3] as const
type IssuancePeriod = typeof ISSUANCE_PERIODS[number]

type ClassRate = {
  name: string
  description: string | null
  processingFee?: {
    amount: number
    currency: 'KSH' | 'USD'
    rate?: RateDefinition
  }
  issuanceFee?: {
    amount: number
    currency: 'KSH' | 'USD'
    rate?: RateDefinition
    periodDenomination: PeriodDenomination[]
    issuancePeriods: IssuancePeriod[]
  }
  bclConsultancy?: {
    tier1?: number
    tier2?: number
    tier3?: number
  }
  officer?: {
    officer1?: number
    officer2?: number
    officer3?: number
  }
}

type SubdepartmentClass = {
  name: string
  description: string | null
  rates: ClassRate[]
}

type Subdepartment = {
  id: number
  name: string
  description: string | null
  classes?: SubdepartmentClass[]
  upload_rates?: ClassRate[]
}

type Department = {
  id: string
  name: string
  description: string
  tm_subdepartments?: Subdepartment[]
}

interface RatesProps {
  departments: Department[]
}

export default function Rates({ departments: initialDepartments }: RatesProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [activeDept, setActiveDept] = useState(initialDepartments?.[0]?.id || '')
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false)
  const [expandedSubdepts, setExpandedSubdepts] = useState<Set<number>>(new Set())
  const [rateContext, setRateContext] = useState<{
    type: 'processing' | 'issuance'
    subdeptId: string
    className?: string
    rateIndex: number
  } | null>(null)
  const [rateDefinition, setRateDefinition] = useState<RateDefinition>({ ksh: 0, usd: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)

  const openRateDialog = (type: 'processing' | 'issuance', subdeptId: string, className: string | undefined, rateIndex: number) => {
    setRateContext({ type, subdeptId, className, rateIndex })

    // Get current rate definition if exists
    const currentDept = departments.find(d => d.id === activeDept)
    const subdept = currentDept?.tm_subdepartments?.find(s => s.id.toString() === subdeptId)

    let currentRate: ClassRate | undefined
    if (className && subdept?.classes) {
      const cls = subdept.classes.find(c => c.name === className)
      currentRate = cls?.rates?.[rateIndex]
    } else {
      currentRate = subdept?.upload_rates?.[rateIndex]
    }

    const existingRate = type === 'processing' ? currentRate?.processingFee?.rate : currentRate?.issuanceFee?.rate
    setRateDefinition(existingRate || { ksh: 0, usd: 0 })
    setIsRateDialogOpen(true)
  }

  const toggleSubdeptExpansion = (subdeptId: number) => {
    setExpandedSubdepts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(subdeptId)) {
        newSet.delete(subdeptId)
      } else {
        newSet.add(subdeptId)
      }
      return newSet
    })
  }

  // Get flattened data for table display with indexing
  const getFlattenedData = () => {
    const currentDept = departments.find(d => d.id === activeDept)
    if (!currentDept?.tm_subdepartments) return []

    const flatData: Array<{
      subdeptId: number
      subdeptName: string
      className?: string
      classDescription?: string
      rateIndex: number
      rate: ClassRate
      isSubdeptHeader?: boolean
      isClassHeader?: boolean
      index: string
      hasClasses?: boolean
      isExpanded?: boolean
    }> = []

    currentDept.tm_subdepartments.forEach((subdept, subdeptIdx) => {
      const subdeptIndex = (subdeptIdx + 1).toString()

      if (subdept.classes && subdept.classes.length > 0) {
        // Add subdepartment header
        flatData.push({
          subdeptId: subdept.id,
          subdeptName: subdept.name,
          rateIndex: -1,
          rate: {} as ClassRate,
          isSubdeptHeader: true,
          index: subdeptIndex,
          hasClasses: true,
          isExpanded: expandedSubdepts.has(subdept.id)
        })

        // Only show classes if expanded
        if (expandedSubdepts.has(subdept.id)) {
          subdept.classes.forEach((cls, clsIdx) => {
            const classIndex = `${subdeptIndex}.${clsIdx + 1}`

            // Add class header
            flatData.push({
              subdeptId: subdept.id,
              subdeptName: subdept.name,
              className: cls.name,
              classDescription: cls.description,
              rateIndex: -1,
              rate: {} as ClassRate,
              isClassHeader: true,
              index: classIndex
            })

            // Add class rates
            cls.rates?.forEach((rate, rateIndex) => {
              flatData.push({
                subdeptId: subdept.id,
                subdeptName: subdept.name,
                className: cls.name,
                rateIndex,
                rate,
                index: `${classIndex}.${rateIndex + 1}`
              })
            })
          })
        }
      } else {
        // Add subdepartment header
        flatData.push({
          subdeptId: subdept.id,
          subdeptName: subdept.name,
          rateIndex: -1,
          rate: {} as ClassRate,
          isSubdeptHeader: true,
          index: subdeptIndex,
          hasClasses: false
        })

        // Add subdepartment rates
        subdept.upload_rates?.forEach((rate, rateIndex) => {
          flatData.push({
            subdeptId: subdept.id,
            subdeptName: subdept.name,
            rateIndex,
            rate,
            index: `${subdeptIndex}.${rateIndex + 1}`
          })
        })
      }
    })

    return flatData
  }

  const saveRateDefinition = async () => {
    if (!rateContext) return

    // Validate rates
    if (isNaN(rateDefinition.ksh) || isNaN(rateDefinition.usd) ||
      rateDefinition.ksh <= 0 || rateDefinition.usd <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter valid positive numbers for both KSH and USD rates",
        variant: "destructive"
      })
      return
    }

    try {
      setIsSubmitting(true)

      const currentDept = departments.find(d => d.id === activeDept)
      const subdept = currentDept?.tm_subdepartments?.find(s => s.id.toString() === rateContext.subdeptId)

      if (!subdept) return

      let updatedRates: ClassRate[]

      if (rateContext.className && subdept.classes) {
        // Update class rate
        const cls = subdept.classes.find(c => c.name === rateContext.className)
        if (!cls?.rates) return

        updatedRates = [...cls.rates]
        updatedRates[rateContext.rateIndex] = {
          ...updatedRates[rateContext.rateIndex],
          [rateContext.type === 'processing' ? 'processingFee' : 'issuanceFee']: {
            ...updatedRates[rateContext.rateIndex][rateContext.type === 'processing' ? 'processingFee' : 'issuanceFee'],
            rate: rateDefinition
          }
        }

        // Update database
        const updatedClasses = subdept.classes.map(c =>
          c.name === rateContext.className
            ? { ...c, rates: updatedRates }
            : c
        )

        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ classes: updatedClasses })
          .eq('id', rateContext.subdeptId)

        if (error) throw error

        // Update local state
        setDepartments(prevDepts =>
          prevDepts.map(dept => ({
            ...dept,
            tm_subdepartments: dept.tm_subdepartments?.map(sd =>
              sd.id.toString() === rateContext.subdeptId
                ? { ...sd, classes: updatedClasses }
                : sd
            )
          }))
        )
      } else {
        // Update subdepartment rate
        if (!subdept.upload_rates) return

        updatedRates = [...subdept.upload_rates]
        updatedRates[rateContext.rateIndex] = {
          ...updatedRates[rateContext.rateIndex],
          [rateContext.type === 'processing' ? 'processingFee' : 'issuanceFee']: {
            ...updatedRates[rateContext.rateIndex][rateContext.type === 'processing' ? 'processingFee' : 'issuanceFee'],
            rate: rateDefinition
          }
        }

        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ upload_rates: updatedRates })
          .eq('id', rateContext.subdeptId)

        if (error) throw error

        // Update local state
        setDepartments(prevDepts =>
          prevDepts.map(dept => ({
            ...dept,
            tm_subdepartments: dept.tm_subdepartments?.map(sd =>
              sd.id.toString() === rateContext.subdeptId
                ? { ...sd, upload_rates: updatedRates }
                : sd
            )
          }))
        )
      }

      toast({
        title: "Success",
        description: "Rate definition saved successfully",
      })

      setIsRateDialogOpen(false)
      setRateContext(null)
    } catch (error) {
      console.error('Error saving rate definition:', error)
      toast({
        title: "Error",
        description: "Failed to save rate definition",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateRateField = async (
    subdeptId: string,
    className: string | undefined,
    rateIndex: number,
    field: string,
    value: any
  ) => {
    try {
      const currentDept = departments.find(d => d.id === activeDept)
      const subdept = currentDept?.tm_subdepartments?.find(s => s.id.toString() === subdeptId)

      if (!subdept) return

      if (className && subdept.classes) {
        // Update class rate
        const cls = subdept.classes.find(c => c.name === className)
        if (!cls?.rates) return

        const updatedRates = [...cls.rates]
        const fieldPath = field.split('.')

        // Create nested object structure if it doesn't exist
        let current = updatedRates[rateIndex]
        for (let i = 0; i < fieldPath.length - 1; i++) {
          if (!current[fieldPath[i]]) {
            current[fieldPath[i]] = {}
          }
          current = current[fieldPath[i]]
        }
        current[fieldPath[fieldPath.length - 1]] = value

        const updatedClasses = subdept.classes.map(c =>
          c.name === className
            ? { ...c, rates: updatedRates }
            : c
        )

        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ classes: updatedClasses })
          .eq('id', subdeptId)

        if (error) throw error

        // Update local state
        setDepartments(prevDepts =>
          prevDepts.map(dept => ({
            ...dept,
            tm_subdepartments: dept.tm_subdepartments?.map(sd =>
              sd.id.toString() === subdeptId
                ? { ...sd, classes: updatedClasses }
                : sd
            )
          }))
        )
      } else {
        // Update subdepartment rate
        if (!subdept.upload_rates) return

        const updatedRates = [...subdept.upload_rates]
        const fieldPath = field.split('.')

        let current = updatedRates[rateIndex]
        for (let i = 0; i < fieldPath.length - 1; i++) {
          if (!current[fieldPath[i]]) {
            current[fieldPath[i]] = {}
          }
          current = current[fieldPath[i]]
        }
        current[fieldPath[fieldPath.length - 1]] = value

        const { error } = await supabase
          .from('tm_subdepartments')
          .update({ upload_rates: updatedRates })
          .eq('id', subdeptId)

        if (error) throw error

        // Update local state
        setDepartments(prevDepts =>
          prevDepts.map(dept => ({
            ...dept,
            tm_subdepartments: dept.tm_subdepartments?.map(sd =>
              sd.id.toString() === subdeptId
                ? { ...sd, upload_rates: updatedRates }
                : sd
            )
          }))
        )
      }
    } catch (error) {
      console.error('Error updating rate field:', error)
      toast({
        title: "Error",
        description: "Failed to update rate field",
        variant: "destructive"
      })
    }
  }

  const MultiSelectDropdown = <T extends string | number>({
    value,
    options,
    onChange,
    placeholder
  }: {
    value: T[],
    options: T[],
    onChange: (value: T[]) => void,
    placeholder: string
  }) => {
    const [isOpen, setIsOpen] = useState(false)

    return (
      <div className="relative">
        <Button
          variant="outline"
          className="w-full justify-between h-8 text-xs border"
          onClick={() => setIsOpen(!isOpen)}
        >
          {value.length > 0 ? value.join(', ') : placeholder}
          <ChevronDown className="h-3 w-3" />
        </Button>
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg">
            {options.map((option) => (
              <div key={option} className="flex items-center space-x-2 p-2 hover:bg-muted">
                <Checkbox
                  checked={value.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...value, option])
                    } else {
                      onChange(value.filter(v => v !== option))
                    }
                  }}
                />
                <label className="text-xs">{option}</label>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const getRateValue = (rate: ClassRate, type: 'processing' | 'issuance', currency: 'KSH' | 'USD') => {
    const feeData = type === 'processing' ? rate.processingFee : rate.issuanceFee
    if (!feeData?.rate) return feeData?.amount || 0

    if (currency === 'KSH') {
      return feeData.currency === 'KSH' ? feeData.amount : (feeData.amount * feeData.rate.ksh)
    } else {
      return feeData.currency === 'USD' ? feeData.amount : (feeData.amount / feeData.rate.usd)
    }
  }

  const exportToExcel = () => {
    const currentDept = departments.find(d => d.id === activeDept)
    if (!currentDept) return

    const flatData = getFlattenedData()
    const exportData = flatData
      .filter(item => !item.isSubdeptHeader && !item.isClassHeader)
      .map(item => ({
        'Index': item.index,
        'Subdepartment/Class': item.className || item.subdeptName,
        'Processing Fee Amount': item.rate.processingFee?.amount || '',
        'Processing Fee Currency': item.rate.processingFee?.currency || '',
        'Processing Fee KSH/USD': getRateValue(item.rate, 'processing', item.rate.processingFee?.currency || 'KSH'),
        'Issuance Fee Amount': item.rate.issuanceFee?.amount || '',
        'Issuance Fee Currency': item.rate.issuanceFee?.currency || '',
        'Issuance Fee KSH/USD': getRateValue(item.rate, 'issuance', item.rate.issuanceFee?.currency || 'KSH'),
        'Period Denomination': item.rate.issuanceFee?.periodDenomination?.join(', ') || '',
        'Issuance Periods': item.rate.issuanceFee?.issuancePeriods?.join(', ') || '',
        'BCL Tier 1': item.rate.bclConsultancy?.tier1 || '',
        'BCL Tier 2': item.rate.bclConsultancy?.tier2 || '',
        'BCL Tier 3': item.rate.bclConsultancy?.tier3 || '',
        'Officer 1': item.rate.officer?.officer1 || '',
        'Officer 2': item.rate.officer?.officer2 || '',
        'Officer 3': item.rate.officer?.officer3 || ''
      }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${currentDept.name} Rates`)
    XLSX.writeFile(wb, `${currentDept.name}_rates.xlsx`)
  }

  if (!departments || departments.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No departments found</p>
      </div>
    )
  }

  const flatData = getFlattenedData()

  return (
    <div className="space-y-6">
      {/* Header with Export Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Rates Management</h2>
        <Button onClick={exportToExcel} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      {/* Department Tabs */}
      <Tabs value={activeDept} onValueChange={setActiveDept} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          {departments.map((dept) => (
            <TabsTrigger key={dept.id} value={dept.id}>
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map((dept) => (
          <TabsContent key={dept.id} value={dept.id} className="mt-0 space-y-4">
            <div className="border rounded-md overflow-auto">
              <Table className="min-w-[2000px]">
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead rowSpan={2} className="w-16 border whitespace-nowrap">Index</TableHead>
                    <TableHead rowSpan={2} className="w-64 border whitespace-nowrap">Subdepartment/Class</TableHead>
                    <TableHead colSpan={4} className="text-center border whitespace-nowrap">Processing Fee Website Efns</TableHead>
                    <TableHead colSpan={6} className="text-center border whitespace-nowrap">Issuance Fee Website Efns</TableHead>
                    <TableHead colSpan={3} className="text-center border whitespace-nowrap">BCL Consultancy</TableHead>
                    <TableHead colSpan={3} className="text-center border whitespace-nowrap">Officer</TableHead>
                  </TableRow>
                  <TableRow>
                    {/* Processing Fee Headers */}
                    <TableHead className="text-xs border w-32">Processing Fee Amount</TableHead>
                    <TableHead className="text-xs border w-24">Currency</TableHead>
                    <TableHead className="text-xs border w-24">KSH/USD</TableHead>
                    <TableHead className="text-xs border w-20">Rate</TableHead>

                    {/* Issuance Fee Headers */}
                    <TableHead className="text-xs border w-32">Issuance Fee Amount</TableHead>
                    <TableHead className="text-xs border w-24">Currency</TableHead>
                    <TableHead className="text-xs border w-24">KSH/USD Rate</TableHead>
                    <TableHead className="text-xs border w-40">Issuance Period Denomination</TableHead>
                    <TableHead className="text-xs border w-32">No of Issuance Period</TableHead>
                    <TableHead className="text-xs border w-20">Rate</TableHead>

                    {/* BCL Consultancy Headers */}
                    <TableHead className="text-xs border w-24">Tier 1</TableHead>
                    <TableHead className="text-xs border w-24">Tier 2</TableHead>
                    <TableHead className="text-xs border w-24">Tier 3</TableHead>

                    {/* Officer Headers */}
                    <TableHead className="text-xs border w-24">Officer 1</TableHead>
                    <TableHead className="text-xs border w-24">Officer 2</TableHead>
                    <TableHead className="text-xs border w-24">Officer 3</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatData.map((item, index) => {
                    if (item.isSubdeptHeader) {
                      return (
                        <TableRow key={`subdept-${item.subdeptId}`} className="bg-muted/50">
                          <TableCell className="font-semibold border">{item.index}</TableCell>
                          <TableCell colSpan={15} className="font-semibold border">
                            <div className="flex items-center gap-2">
                              {item.hasClasses && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleSubdeptExpansion(item.subdeptId)}
                                >
                                  {item.isExpanded ?
                                    <Minus className="h-4 w-4" /> :
                                    <Plus className="h-4 w-4" />
                                  }
                                </Button>
                              )}
                              {item.subdeptName}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }

                    if (item.isClassHeader) {
                      return (
                        <TableRow key={`class-${item.subdeptId}-${item.className}`} className="bg-muted/20">
                          <TableCell className="font-medium border">{item.index}</TableCell>
                          <TableCell colSpan={15} className="font-medium pl-8 border">
                            {item.className}
                            {item.classDescription && (
                              <span className="text-muted-foreground text-xs ml-2">
                                - {item.classDescription}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    }

                    return (
                      <TableRow key={`rate-${item.subdeptId}-${item.className || 'subdept'}-${item.rateIndex}`}>
                        <TableCell className="border text-xs">{item.index}</TableCell>
                        <TableCell className={cn("border", item.className ? "pl-12" : "pl-4")}>
                          {item.className ? item.className : item.subdeptName}
                        </TableCell>

                        {/* Processing Fee Columns */}
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.processingFee?.amount ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'processingFee.amount',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="border p-0">
                          <Select
                            value={item.rate.processingFee?.currency || 'KSH'}
                            onValueChange={(value) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'processingFee.currency',
                              value as 'KSH' | 'USD'
                            )}
                          >
                            <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-1 focus:ring-ring">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="KSH">KSH</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs border p-2">
                          {item.rate.processingFee?.rate ?
                            `${item.rate.processingFee.rate.ksh.toFixed(2)} / ${item.rate.processingFee.rate.usd.toFixed(2)}` :
                            'Set rate'}
                        </TableCell>
                        <TableCell className="border p-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full text-xs"
                            onClick={() => openRateDialog(
                              'processing',
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex
                            )}
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            Rate
                          </Button>
                        </TableCell>

                        {/* Issuance Fee Columns */}
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.issuanceFee?.amount ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'issuanceFee.amount',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="border p-0">
                          <Select
                            value={item.rate.issuanceFee?.currency || 'KSH'}
                            onValueChange={(value) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'issuanceFee.currency',
                              value as 'KSH' | 'USD'
                            )}
                          >
                            <SelectTrigger className="h-8 text-xs border-0 shadow-none focus:ring-1 focus:ring-ring">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="KSH">KSH</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs border p-2">
                          {item.rate.issuanceFee?.rate ?
                            `${item.rate.issuanceFee.rate.ksh.toFixed(2)} / ${item.rate.issuanceFee.rate.usd.toFixed(2)}` :
                            'Set rate'}
                        </TableCell>
                        <TableCell className="border p-0">
                          <div className="px-2 py-1">
                            <MultiSelectDropdown<PeriodDenomination>
                              value={item.rate.issuanceFee?.periodDenomination || []}
                              options={[...PERIOD_DENOMINATIONS]}
                              onChange={(value) => updateRateField(
                                item.subdeptId.toString(),
                                item.className,
                                item.rateIndex,
                                'issuanceFee.periodDenomination',
                                value
                              )}
                              placeholder="Select"
                              className="min-w-[120px]"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="border p-0">
                          <div className="px-2 py-1">
                            <MultiSelectDropdown<IssuancePeriod>
                              value={item.rate.issuanceFee?.issuancePeriods || []}
                              options={[...ISSUANCE_PERIODS]}
                              onChange={(value) => updateRateField(
                                item.subdeptId.toString(),
                                item.className,
                                item.rateIndex,
                                'issuanceFee.issuancePeriods',
                                value
                              )}
                              placeholder="Select"
                              className="min-w-[100px]"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="border p-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full text-xs"
                            onClick={() => openRateDialog(
                              'issuance',
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex
                            )}
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            Rate
                          </Button>
                        </TableCell>

                        {/* BCL Consultancy Columns */}
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.bclConsultancy?.tier1 ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'bclConsultancy.tier1',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.bclConsultancy?.tier2 ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'bclConsultancy.tier2',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.bclConsultancy?.tier3 ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'bclConsultancy.tier3',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>

                        {/* Officer Columns */}
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.officer?.officer1 ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'officer.officer1',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.officer?.officer2 ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'officer.officer2',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="border p-0">
                          <Input
                            type="number"
                            className="h-8 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={item.rate.officer?.officer3 ?? ''}
                            onChange={(e) => updateRateField(
                              item.subdeptId.toString(),
                              item.className,
                              item.rateIndex,
                              'officer.officer3',
                              e.target.value === '' ? '' : parseFloat(e.target.value)
                            )}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Rate Definition Dialog */}
      <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Define Exchange Rate</DialogTitle>
            <DialogDescription>
              Set the exchange rates for KSH and USD for this {rateContext?.type} fee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="ksh-rate">KSH Rate</Label>
              <Input
                id="ksh-rate"
                type="number"
                step="0.01"
                value={rateDefinition.ksh}
                onChange={(e) => setRateDefinition(prev => ({
                  ...prev,
                  ksh: parseFloat(e.target.value) || 0
                }))}
                placeholder="Enter KSH rate"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Rate to convert from USD to KSH (e.g., 130 means 1 USD = 130 KSH)
              </p>
            </div>
            <div>
              <Label htmlFor="usd-rate">USD Rate</Label>
              <Input
                id="usd-rate"
                type="number"
                step="0.01"
                value={rateDefinition.usd}
                onChange={(e) => setRateDefinition(prev => ({
                  ...prev,
                  usd: parseFloat(e.target.value) || 0
                }))}
                placeholder="Enter USD rate"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Rate to convert from KSH to USD (e.g., 0.0077 means 1 KSH = 0.0077 USD)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRateDefinition} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Rate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}