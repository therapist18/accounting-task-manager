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
import { CalendarIcon, Calculator, Minus, Plus, Save, DollarSign, Clock, ChevronDown } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments } from "./database"
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
  const [rates, setRates] = useState<RateData>({ usd: 150, ksh: 1 })
  const [tempRates, setTempRates] = useState<RateData>({ usd: 150, ksh: 1 })
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false)
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false)
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [isLoading, setIsLoading] = useState(!initialDepartments)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Rate period state
  const [currentPeriod, setCurrentPeriod] = useState<RatePeriod>({
    departmentId: '',
    effectiveFrom: new Date(),
    effectiveTo: null,
    data: []
  })
  
  // Options for dropdowns
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
    }
  }, [selectedDepartment])

  const loadCurrentRates = async (departmentId: string) => {
    try {
      // Load the most recent rate period for this department
      const { data: rateHistory, error } = await supabase
        .from('rates_history')
        .select('*')
        .eq('department_id', departmentId)
        .order('effective_from', { ascending: false })
        .limit(1)

      if (error) throw error

      if (rateHistory && rateHistory.length > 0) {
        const latestRates = rateHistory[0]
        setCurrentPeriod({
          id: latestRates.id,
          departmentId: latestRates.department_id,
          effectiveFrom: new Date(latestRates.effective_from),
          effectiveTo: latestRates.effective_to ? new Date(latestRates.effective_to) : null,
          data: latestRates.data || []
        })
      } else {
        // Generate default rates for the department
        generateDefaultRates(departmentId)
      }
    } catch (error) {
      console.error('Error loading rates:', error)
      generateDefaultRates(departmentId)
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
      data: defaultRates
    })
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
    setCurrentPeriod(prev => ({
      ...prev,
      data: prev.data.map(entry => 
        entry.id === entryId ? { ...entry, ...updates } : entry
      )
    }))
  }

  const updateCurrency = (entryId: string, feeType: 'processingFee' | 'issuanceFee', currency: 'USD' | 'KSH') => {
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
      if (currentPeriod.id) {
        const { error } = await supabase
          .from('rates_history')
          .update({
            data: currentPeriod.data,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentPeriod.id)

        if (error) throw error
      } else {
        // Creating new period
        const { error } = await supabase
          .from('rates_history')
          .insert({
            department_id: selectedDepartment,
            effective_from: currentPeriod.effectiveFrom.toISOString().split('T')[0],
            effective_to: currentPeriod.effectiveTo?.toISOString().split('T')[0] || null,
            data: currentPeriod.data
          })

        if (error) throw error
      }

      toast({
        title: "Success",
        description: "Rates saved successfully.",
      })

      // Reload current rates
      await loadCurrentRates(selectedDepartment)
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
        <Button variant="outline" className="w-full justify-between text-left font-normal h-8 text-xs">
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Rates Management</h2>
          <p className="text-muted-foreground">Configure and manage department rates and fees</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Exchange Rates Dialog */}
          <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
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
                    setIsRateDialogOpen(false)
                  }}>
                    Save Rates
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Effective Dates Dialog */}
          <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4 mr-2" />
                Effective Period
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Set Effective Period
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Effective From</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(currentPeriod.effectiveFrom, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={currentPeriod.effectiveFrom}
                        onSelect={(date) => date && setCurrentPeriod(prev => ({ ...prev, effectiveFrom: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Effective To (Optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {currentPeriod.effectiveTo ? format(currentPeriod.effectiveTo, "PPP") : "No end date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={currentPeriod.effectiveTo || undefined}
                        onSelect={(date) => setCurrentPeriod(prev => ({ ...prev, effectiveTo: date || null }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setIsDateDialogOpen(false)}>
                    Apply
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

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
        </div>
      </div>

      {/* Period Info */}
      {selectedDepartment && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">USD Rate: {rates.usd}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-sm">
              Effective: {format(currentPeriod.effectiveFrom, "PPP")} 
              {currentPeriod.effectiveTo && ` - ${format(currentPeriod.effectiveTo, "PPP")}`}
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment} className="w-full">
        <TabsList className="w-full mb-4">
          {departments.map((dept) => (
            <TabsTrigger key={dept.id} value={dept.id} className="whitespace-nowrap">
              {dept.name}
              {dept.tm_subdepartments && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {dept.tm_subdepartments.length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map((dept) => (
          <TabsContent key={dept.id} value={dept.id}>
            <div className="relative overflow-auto max-h-[calc(100vh-200px)] border rounded-lg">
              <Table className="min-w-max">
                <TableHeader className="sticky top-0 z-30">
                  {/* Main Headers */}
                  <TableRow className="bg-blue-600 text-white">
                    <TableHead className="sticky left-0 bg-blue-600 border-r w-16 z-40 text-center text-white">#</TableHead>
                    <TableHead className="sticky left-16 bg-blue-600 border-r w-64 z-40 text-white">Entity</TableHead>
                    <TableHead colSpan={3} className="border-r text-center text-white">Processing Fee</TableHead>
                    <TableHead colSpan={5} className="border-r text-center text-white">Issuance Fee</TableHead>
                    <TableHead colSpan={3} className="border-r text-center text-white">BCL Consultancy</TableHead>
                    <TableHead colSpan={3} className="border-r text-center text-white">Officer</TableHead>
                    <TableHead colSpan={6} className="border-r text-center text-white">Extra Consideration</TableHead>
                    <TableHead colSpan={4} className="text-center text-white">Convenience Fee</TableHead>
                  </TableRow>
                  
                  {/* Sub Headers */}
                  <TableRow className="bg-blue-400">
                    <TableHead className="sticky left-0 bg-blue-400 border-r z-40"></TableHead>
                    <TableHead className="sticky left-16 bg-blue-400 border-r z-40"></TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Amount</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Currency</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Fee (KSH)</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Amount</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Currency</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Fee (KSH)</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Period Type</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Period Count</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Tier 1</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Tier 2</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Tier 3</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Boss Fixed</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">PA Tier 1</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">PA Editable</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Applicable / Not Applicable</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">TCC Company</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">TCC Individual</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Auditors Fee</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Degree</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">TF File</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Applicable / Not Applicable</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Alien Assistance</TableHead>
                    <TableHead className="border-r text-center text-xs text-white">Re-Entry</TableHead>
                    <TableHead className="text-center text-xs text-white">Passport Endorsement</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {Object.entries(groupedEntries).flatMap(([subdeptName, entries], groupIndex) => {
                    const rows = []
                    
                    // Group header if multiple entries
                    if (entries.length > 1) {
                      const groupRowId = `group-${subdeptName}`
                      const isExpanded = expandedRows.has(groupRowId)
                      
                      rows.push(
                        <TableRow key={groupRowId} className="bg-muted/20 hover:bg-muted/30">
                          <TableCell className="sticky left-0 bg-muted/20 border-r text-center font-mono text-sm z-30">
                            {groupIndex + 1}
                          </TableCell>
                          <TableCell className="sticky left-16 bg-muted/20 border-r font-medium z-30">
                            <div className="flex items-center gap-2">                             
                            <span>{subdeptName}</span>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleRowExpansion(groupRowId)}
                              >
                                {isExpanded ? (
                                  <Minus className="h-4 w-4" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                              </Button>
                              <Badge variant="secondary" className="text-xs">
                                {entries.length}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell colSpan={22} className="text-muted-foreground italic">
                            {entries.length} rate entries
                          </TableCell>
                        </TableRow>
                      )

                      // Show entries if expanded
                      if (isExpanded) {
                        entries.forEach((entry, entryIndex) => {
                          rows.push(renderRateRow(entry, `${groupIndex + 1}.${entryIndex + 1}`, true))
                        })
                      }
                    } else {
                      // Single entry, show directly
                      rows.push(renderRateRow(entries[0], `${groupIndex + 1}`, false))
                    }

                    return rows
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )

  function renderRateRow(entry: RateEntry, index: string, isChild: boolean) {
    return (
      <TableRow key={entry.id} className="hover:bg-muted/50">
        <TableCell className="sticky left-0 bg-background border-r text-center font-mono text-sm z-30">
          {index}
        </TableCell>
        <TableCell className="sticky left-16 bg-background border-r font-medium z-30">
          <div className={`${isChild ? 'pl-8' : ''}`}>
          {isChild && <span className="text-muted-foreground mr-2"></span>}
           <div className="flex flex-col">
             <span className="font-medium">{entry.entityName}</span>
             <span className="text-xs text-muted-foreground">{entry.entityPath}</span>
           </div>
         </div>
       </TableCell>
       
       {/* Processing Fee */}
       <TableCell className="border-r p-2">
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
           className="h-8 text-center text-xs"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Select
           value={entry.processingFee.currency}
           onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'processingFee', value)}
         >
           <SelectTrigger className="h-8 text-xs">
             <SelectValue />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="KSH">KSH</SelectItem>
             <SelectItem value="USD">USD</SelectItem>
           </SelectContent>
         </Select>
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           value={entry.processingFee.rate.toFixed(0)}
           readOnly
           className="h-8 text-center text-xs bg-muted"
         />
       </TableCell>
       
       {/* Issuance Fee */}
       <TableCell className="border-r p-2">
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
           className="h-8 text-center text-xs"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Select
           value={entry.issuanceFee.currency}
           onValueChange={(value: 'USD' | 'KSH') => updateCurrency(entry.id, 'issuanceFee', value)}
         >
           <SelectTrigger className="h-8 text-xs">
             <SelectValue />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="KSH">KSH</SelectItem>
             <SelectItem value="USD">USD</SelectItem>
           </SelectContent>
         </Select>
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           value={entry.issuanceFee.rate.toFixed(0)}
           readOnly
           className="h-8 text-center text-xs bg-muted"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <MultiSelectPopover
           entryId={entry.id}
           field="periodType"
           options={periodOptions}
           values={entry.issuanceFee.periodType}
           placeholder="Period"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <MultiSelectPopover
           entryId={entry.id}
           field="periodCount"
           options={countOptions}
           values={entry.issuanceFee.periodCount}
           placeholder="Count"
         />
       </TableCell>
       
       {/* BCL Consultancy */}
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.bclConsultancy.tier1}
           onChange={(e) => updateRateEntry(entry.id, {
             bclConsultancy: {
               ...entry.bclConsultancy,
               tier1: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.bclConsultancy.tier2}
           onChange={(e) => updateRateEntry(entry.id, {
             bclConsultancy: {
               ...entry.bclConsultancy,
               tier2: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.bclConsultancy.tier3}
           onChange={(e) => updateRateEntry(entry.id, {
             bclConsultancy: {
               ...entry.bclConsultancy,
               tier3: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
         />
       </TableCell>
       
       {/* Officer */}
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.officer.bossFixed}
           onChange={(e) => updateRateEntry(entry.id, {
             officer: {
               ...entry.officer,
               bossFixed: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.officer.paTier1}
           onChange={(e) => updateRateEntry(entry.id, {
             officer: {
               ...entry.officer,
               paTier1: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.officer.paEditable}
           onChange={(e) => updateRateEntry(entry.id, {
             officer: {
               ...entry.officer,
               paEditable: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
         />
       </TableCell>
       
       {/* Extra Consideration */}
       <TableCell className="border-r p-2">
         <Select
           value={entry.extraConsideration.applicable ? "applicable" : "not-applicable"}
           onValueChange={(value) => updateRateEntry(entry.id, {
             extraConsideration: {
               ...entry.extraConsideration,
               applicable: value === "applicable"
             }
           })}
         >
           <SelectTrigger className="h-8 text-xs">
             <SelectValue />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="applicable">Applicable</SelectItem>
             <SelectItem value="not-applicable">Not Applicable</SelectItem>
           </SelectContent>
         </Select>
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.extraConsideration.tccCompanyIgnore}
           onChange={(e) => updateRateEntry(entry.id, {
             extraConsideration: {
               ...entry.extraConsideration,
               tccCompanyIgnore: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.extraConsideration.applicable}
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.extraConsideration.tccIndividualIgnore}
           onChange={(e) => updateRateEntry(entry.id, {
             extraConsideration: {
               ...entry.extraConsideration,
               tccIndividualIgnore: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.extraConsideration.applicable}
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.extraConsideration.auditorsFee}
           onChange={(e) => updateRateEntry(entry.id, {
             extraConsideration: {
               ...entry.extraConsideration,
               auditorsFee: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.extraConsideration.applicable}
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.extraConsideration.degree}
           onChange={(e) => updateRateEntry(entry.id, {
             extraConsideration: {
               ...entry.extraConsideration,
               degree: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.extraConsideration.applicable}
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.extraConsideration.tfFile}
           onChange={(e) => updateRateEntry(entry.id, {
             extraConsideration: {
               ...entry.extraConsideration,
               tfFile: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.extraConsideration.applicable}
         />
       </TableCell>
       
       {/* Convenience Fee */}
       <TableCell className="border-r p-2">
         <Select
           value={entry.convenienceFee.applicable ? "applicable" : "not-applicable"}
           onValueChange={(value) => updateRateEntry(entry.id, {
             convenienceFee: {
               ...entry.convenienceFee,
               applicable: value === "applicable"
             }
           })}
         >
           <SelectTrigger className="h-8 text-xs">
             <SelectValue />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="applicable">Applicable</SelectItem>
             <SelectItem value="not-applicable">Not Applicable</SelectItem>
           </SelectContent>
         </Select>
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.convenienceFee.alienAssistance}
           onChange={(e) => updateRateEntry(entry.id, {
             convenienceFee: {
               ...entry.convenienceFee,
               alienAssistance: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.convenienceFee.applicable}
         />
       </TableCell>
       <TableCell className="border-r p-2">
         <Input
           type="number"
           value={entry.convenienceFee.reEntryApproval}
           onChange={(e) => updateRateEntry(entry.id, {
             convenienceFee: {
               ...entry.convenienceFee,
               reEntryApproval: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.convenienceFee.applicable}
         />
       </TableCell>
       <TableCell className="p-2">
         <Input
           type="number"
           value={entry.convenienceFee.passportEndorsement}
           onChange={(e) => updateRateEntry(entry.id, {
             convenienceFee: {
               ...entry.convenienceFee,
               passportEndorsement: parseFloat(e.target.value) || 0
             }
           })}
           className="h-8 text-center text-xs"
           disabled={!entry.convenienceFee.applicable}
         />
       </TableCell>
     </TableRow>
   )
 }
}