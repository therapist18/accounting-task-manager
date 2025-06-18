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
import { Settings, ChevronDown, Calculator, Plus, Minus } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { fetchDepartments, type DepartmentWithSubdepartments } from "./database"

interface RateData {
  usd: number
  ksh: number
}

interface RateRow {
  id: string
  departmentId: string
  subdepartmentId: string
  classId?: string
  subdepartment: string
  class: string
  processingFeeAmount: string
  processingFeeCurrency: string
  processingFeeRate: string
  issuanceFeeAmount: string
  issuanceFeeCurrency: string
  issuanceFeeRate: string
  issuancePeriodDenomination: string[]
  noOfIssuancePeriod: string[]
  bclTier1: string
  bclTier2: string
  bclTier3: string
  officer1: string
  officer2: string
  officer3: string
}

interface GroupedData {
  subdepartment: string
  classes: RateRow[]
  isExpanded: boolean
}

// Define the type for subdepartments (matching what's used in requirements component)
interface Subdepartment {
  id: number
  name: string
  description?: string
  classes?: Array<{
    name: string
    description: string | null
    requirements: Array<{
      name: string
      description: string | null
    }>
  }>
}

// Define the type for departments (matching what's used in requirements component)
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
  const [departments, setDepartments] = useState<Department[]>(initialDepartments || [])
  const [isLoading, setIsLoading] = useState(!initialDepartments)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')

  // Initialize table data from departments
  const [tableData, setTableData] = useState<RateRow[]>([])
  const [expandedSubdepartments, setExpandedSubdepartments] = useState<Set<string>>(new Set())

  // Fetch departments if not provided as props
  useEffect(() => {
    if (!initialDepartments) {
      const loadDepartments = async () => {
        try {
          setIsLoading(true)
          const fetchedDepartments = await fetchDepartments()
          // Transform the fetched departments to match our expected structure
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

  // Generate table data from departments
  useEffect(() => {
    if (!selectedDepartment || departments.length === 0) return

    const currentDepartment = departments.find(dept => dept.id === selectedDepartment)
    if (!currentDepartment) return

    const generatedTableData: RateRow[] = []
    const expandedSubdepts = new Set<string>()

    currentDepartment.tm_subdepartments?.forEach((subdept) => {
      // If subdepartment has classes, create rows for each class
      if (subdept.classes && subdept.classes.length > 0) {
        subdept.classes.forEach((cls, classIndex) => {
          generatedTableData.push({
            id: `${subdept.id}-${cls.name}-${classIndex}`,
            departmentId: currentDepartment.id,
            subdepartmentId: subdept.id.toString(),
            classId: cls.name,
            subdepartment: subdept.name,
            class: cls.name,
            processingFeeAmount: "5000", // Default values - these should come from database
            processingFeeCurrency: "ksh",
            processingFeeRate: "5000",
            issuanceFeeAmount: "10000",
            issuanceFeeCurrency: "usd",
            issuanceFeeRate: "1500000",
            issuancePeriodDenomination: ["years"],
            noOfIssuancePeriod: ["1", "2"],
            bclTier1: "2000",
            bclTier2: "3000",
            bclTier3: "4000",
            officer1: "1000",
            officer2: "1500",
            officer3: "2000",
          })
        })
        // Expand subdepartments with multiple classes by default
        if (subdept.classes.length > 1) {
          expandedSubdepts.add(subdept.name)
        }
      } else {
        // Create a single row for subdepartment without classes
        generatedTableData.push({
          id: `${subdept.id}-general`,
          departmentId: currentDepartment.id,
          subdepartmentId: subdept.id.toString(),
          subdepartment: subdept.name,
          class: "General",
          processingFeeAmount: "3000",
          processingFeeCurrency: "ksh",
          processingFeeRate: "3000",
          issuanceFeeAmount: "8000",
          issuanceFeeCurrency: "ksh",
          issuanceFeeRate: "8000",
          issuancePeriodDenomination: ["months"],
          noOfIssuancePeriod: ["1"],
          bclTier1: "1500",
          bclTier2: "2500",
          bclTier3: "3500",
          officer1: "800",
          officer2: "1200",
          officer3: "1800",
        })
      }
    })

    setTableData(generatedTableData)
    setExpandedSubdepartments(expandedSubdepts)
  }, [selectedDepartment, departments])

  // Group data by subdepartment
  const groupedData: GroupedData[] = tableData.reduce((acc, row) => {
    const existingGroup = acc.find((group) => group.subdepartment === row.subdepartment)
    if (existingGroup) {
      existingGroup.classes.push(row)
    } else {
      acc.push({
        subdepartment: row.subdepartment,
        classes: [row],
        isExpanded: expandedSubdepartments.has(row.subdepartment),
      })
    }
    return acc
  }, [] as GroupedData[])

  const toggleSubdepartment = (subdepartment: string) => {
    setExpandedSubdepartments((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(subdepartment)) {
        newSet.delete(subdepartment)
      } else {
        newSet.add(subdepartment)
      }
      return newSet
    })
  }

  const updateRate = (rowId: string, field: string, currency: string) => {
    setTableData((prev) =>
      prev.map((row) => {
        if (row.id === rowId) {
          const amount = field === "processingFeeRate" ? row.processingFeeAmount : row.issuanceFeeAmount
          const rate = currency === "usd" ? rates.usd : rates.ksh
          const calculatedRate = currency === "usd" ? (Number.parseFloat(amount) * rate).toString() : amount

          return {
            ...row,
            [field]: calculatedRate,
          }
        }
        return row
      }),
    )
  }

  const handleCurrencyChange = (rowId: string, field: string, currency: string) => {
    setTableData((prev) =>
      prev.map((row) => {
        if (row.id === rowId) {
          const rateField = field === "processingFeeCurrency" ? "processingFeeRate" : "issuanceFeeRate"
          const amountField = field === "processingFeeCurrency" ? "processingFeeAmount" : "issuanceFeeAmount"
          const amount = row[amountField as keyof RateRow] as string
          const rate = currency === "usd" ? rates.usd : rates.ksh
          const calculatedRate = currency === "usd" ? (Number.parseFloat(amount) * rate).toString() : amount

          return {
            ...row,
            [field]: currency,
            [rateField]: calculatedRate,
          }
        }
        return row
      }),
    )
  }

  const handleMultiSelectChange = (rowId: string, field: string, value: string, checked: boolean) => {
    setTableData((prev) =>
      prev.map((row) => {
        if (row.id === rowId) {
          const currentValues = row[field as keyof RateRow] as string[]
          const newValues = checked ? [...currentValues, value] : currentValues.filter((v) => v !== value)

          return {
            ...row,
            [field]: newValues,
          }
        }
        return row
      }),
    )
  }

  const handleSaveRates = () => {
    setRates(tempRates)
    setIsRateDialogOpen(false)
    setTableData((prev) =>
      prev.map((row) => ({
        ...row,
        processingFeeRate:
          row.processingFeeCurrency === "usd"
            ? (Number.parseFloat(row.processingFeeAmount) * tempRates.usd).toString()
            : row.processingFeeAmount,
        issuanceFeeRate:
          row.issuanceFeeCurrency === "usd"
            ? (Number.parseFloat(row.issuanceFeeAmount) * tempRates.usd).toString()
            : row.issuanceFeeAmount,
      })),
    )
  }

  const MultiSelectPopover = ({
    rowId,
    field,
    options,
    values,
    placeholder,
  }: {
    rowId: string
    field: string
    options: string[]
    values: string[]
    placeholder: string
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-left font-normal h-12">
          <span className="truncate">
            {values.length === 0 ? (
              <span className="text-gray-400">{placeholder}</span>
            ) : values.length === 1 ? (
              values[0]
            ) : (
              `${values.length} selected`
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-4">
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700 mb-3">Select Options</div>
          {options.map((option) => (
            <div key={option} className="flex items-center space-x-3">
              <Checkbox
                id={`${rowId}-${field}-${option}`}
                checked={values.includes(option)}
                onCheckedChange={(checked) => handleMultiSelectChange(rowId, field, option, checked as boolean)}
              />
              <Label
                htmlFor={`${rowId}-${field}-${option}`}
                className="text-sm font-medium leading-none cursor-pointer text-gray-700 capitalize"
              >
                {option}
              </Label>
            </div>
          ))}
        </div>
        {values.length > 0 && (
          <div className="border-t border-gray-200 pt-3 mt-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Selected:</div>
            <div className="flex flex-wrap gap-1">
              {values.map((value) => (
                <Badge key={value} variant="secondary" className="text-xs">
                  {value}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="container mx-auto space-y-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading departments...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (departments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="container mx-auto space-y-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-gray-600">No departments found. Please create departments first.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Rates Management</h1>
            <p className="text-gray-600 mt-1">Configure and manage department rates and fees</p>
          </div>
          <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gray-800 hover:bg-gray-900 text-white">
                <Settings className="h-4 w-4 mr-2" />
                Manage Rates
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-gray-800">
                  <Calculator className="h-5 w-5" />
                  Configure Exchange Rates
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="usd-rate" className="text-sm font-medium text-gray-700">
                    USD to KSH Rate
                  </Label>
                  <Input
                    id="usd-rate"
                    type="number"
                    value={tempRates.usd}
                    onChange={(e) => setTempRates((prev) => ({ ...prev, usd: Number.parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter USD to KSH rate"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ksh-rate" className="text-sm font-medium text-gray-700">
                    KSH Rate (Base)
                  </Label>
                  <Input
                    id="ksh-rate"
                    type="number"
                    value={tempRates.ksh}
                    onChange={(e) => setTempRates((prev) => ({ ...prev, ksh: Number.parseFloat(e.target.value) || 1 }))}
                    placeholder="Enter KSH base rate"
                    className="h-10"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveRates} className="bg-gray-800 hover:bg-gray-900">
                    Save Rates
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs */}
        <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment} className="w-full">
          <TabsList className="grid w-full bg-white border" style={{ gridTemplateColumns: `repeat(${Math.min(departments.length, 6)}, 1fr)` }}>
            {departments.slice(0, 6).map((dept) => (
              <TabsTrigger
                key={dept.id}
                value={dept.id}
                className="data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900 font-medium text-gray-600"
              >
                {dept.name}
                {dept.tm_subdepartments && dept.tm_subdepartments.length > 0 && (
                  <span className="ml-2 text-xs bg-muted-foreground/10 text-muted-foreground rounded-full px-2 py-0.5">
                    {dept.tm_subdepartments.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {departments.map((dept) => (
            <TabsContent key={dept.id} value={dept.id}>
              <Card className="border">
                <CardHeader className="bg-gray-100 border-b">
                  <CardTitle className="text-xl font-semibold text-gray-800">{dept.name} Rates</CardTitle>
                  {dept.description && (
                    <p className="text-sm text-gray-600">{dept.description}</p>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table className="relative h-[calc(90vh-200px)]">
                      {/* Table headers remain the same */}
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-blue-800 hover:bg-blue-800">
                          <TableHead className="sticky left-0 z-20 bg-blue-800 text-white font-semibold border-r border-blue-600 min-w-[60px] h-16 px-4 text-center">
                            #
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="sticky left-[60px] z-20 bg-blue-800 text-white font-semibold border-r border-blue-600 min-w-[160px] h-16 px-4 text-center"
                          >
                            Subdepartment
                          </TableHead>
                          <TableHead
                            rowSpan={2}
                            className="text-white font-semibold border-r border-gray-600 min-w-[120px] h-16 px-4 text-center"
                          >
                            Class
                          </TableHead>
                          <TableHead
                            colSpan={3}
                            className="text-center text-white font-semibold border-r border-gray-600 px-4"
                          >
                            Processing Fee Website Efns
                          </TableHead>
                          <TableHead
                            colSpan={5}
                            className="text-center text-white font-semibold border-r border-gray-600 px-4"
                          >
                            Issuance Fee Website Efns
                          </TableHead>
                          <TableHead
                            colSpan={3}
                            className="text-center text-white font-semibold border-r border-gray-600 px-4"
                          >
                            BCL Consultancy
                          </TableHead>
                          <TableHead colSpan={3} className="text-center text-white font-semibold px-4">
                            Officer
                          </TableHead>
                        </TableRow>
                        <TableRow className="bg-blue-700 hover:bg-blue-700">
                          <TableHead className="text-white text-sm font-medium min-w-[100px] h-12 px-4 border-r border-gray-500 text-center">
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[100px] h-12 px-4 border-r border-gray-500 text-center">
                            Amount
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 border-r border-gray-500 text-center">
                            Currency
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium border-r border-gray-600 min-w-[140px] h-12 px-4 text-center">
                            Rate
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[100px] h-12 px-4 border-r border-gray-500 text-center">
                            Amount
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 border-r border-gray-500 text-center">
                            Currency
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[140px] h-12 px-4 border-r border-gray-500 text-center">
                            Rate
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[130px] h-12 px-4 border-r border-gray-500 text-center">
                            Period Type
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium border-r border-gray-600 min-w-[130px] h-12 px-4 text-center">
                            No. of Periods
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 border-r border-gray-500 text-center">
                            Tier 1
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 border-r border-gray-500 text-center">
                            Tier 2
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium border-r border-gray-600 min-w-[90px] h-12 px-4 text-center">
                            Tier 3
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 border-r border-gray-500 text-center">
                            Officer 1
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 border-r border-gray-500 text-center">
                            Officer 2
                          </TableHead>
                          <TableHead className="text-white text-sm font-medium min-w-[90px] h-12 px-4 text-center">
                            Officer 3
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedData.length > 0 ? groupedData.map((group, groupIndex) => (
                          <>
                            {/* Subdepartment header row */}
                            <TableRow
                              key={`header-${group.subdepartment}`}
                              className="bg-blue-50 hover:bg-blue-50 border-b border-blue-200"
                            >
                              <TableCell className="sticky left-0 z-10 bg-blue-50 border-r border-blue-200 font-semibold text-blue-900 h-14 px-4">
                                {groupIndex + 1}
                              </TableCell>
                              <TableCell className="sticky left-[60px] z-10 bg-blue-50 border-r border-blue-200 font-semibold text-blue-900 h-14 px-4">
                                <div className="flex items-center gap-2">

                                  {group.subdepartment}
                                  {group.classes.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleSubdepartment(group.subdepartment)}
                                      className="h-6 w-6 p-0"
                                    >
                                      {expandedSubdepartments.has(group.subdepartment) ? (
                                        <Minus className="h-4 w-4" />
                                      ) : (
                                        <Plus className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {group.classes.length}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell colSpan={13} className="text-gray-500 italic h-14 px-4">
                                {group.classes.length === 1
                                  ? ""
                                  : `${group.classes.length} classes available`}
                              </TableCell>
                            </TableRow>

                            {/* Class rows */}
                            {(expandedSubdepartments.has(group.subdepartment) || group.classes.length === 1) &&
                              group.classes.map((row, rowIndex) => (
                                <TableRow
                                  key={row.id}
                                  className={`hover:bg-blue-50 border-b border-blue-200 ${rowIndex % 2 === 0 ? "bg-white" : "bg-blue-25"
                                    }`}
                                >
                                  <TableCell className="sticky left-0 z-10 bg-white border-r border-blue-200 text-blue-900 h-16 px-4">
                                    {groupIndex + 1}.{rowIndex + 1}
                                  </TableCell>
                                  <TableCell className="sticky left-[60px] z-10 bg-white border-r border-blue-200 font-medium text-blue-900 h-16 px-4">
                                    <div className="pl-6 text-sm">↳ {row.subdepartment}</div>
                                  </TableCell>
                                  <TableCell className="border-r border-blue-200 font-medium text-blue-800 h-16 px-4 text-center">
                                    {row.class}
                                  </TableCell>

                                  {/* All the form cells remain the same - Processing Fee, Issuance Fee, BCL, Officer sections */}
                                  {/* Processing Fee Section */}
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Input
                                      value={row.processingFeeAmount}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id ? { ...r, processingFeeAmount: e.target.value } : r,
                                          ),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Select
                                      value={row.processingFeeCurrency}
                                      onValueChange={(value) =>
                                        handleCurrencyChange(row.id, "processingFeeCurrency", value)
                                      }
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ksh">KSH</SelectItem>
                                        <SelectItem value="usd">USD</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="border-r border-gray-300 h-16 px-4">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={row.processingFeeRate}
                                        readOnly
                                        className="bg-gray-50 h-10 text-center"
                                      />
                                    </div>
                                  </TableCell>

                                  {/* Issuance Fee Section */}
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Input
                                      value={row.issuanceFeeAmount}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id ? { ...r, issuanceFeeAmount: e.target.value } : r,
                                          ),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Select
                                      value={row.issuanceFeeCurrency}
                                      onValueChange={(value) =>
                                        handleCurrencyChange(row.id, "issuanceFeeCurrency", value)
                                      }
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ksh">KSH</SelectItem>
                                        <SelectItem value="usd">USD</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={row.issuanceFeeRate}
                                        readOnly
                                        className="h-10 text-center"
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <MultiSelectPopover
                                      rowId={row.id}
                                      field="issuancePeriodDenomination"
                                      options={["months", "years"]}
                                      values={row.issuancePeriodDenomination}
                                      placeholder="Select period type"
                                    />
                                  </TableCell>
                                  <TableCell className="border-r border-gray-300 h-16 px-4">
                                    <MultiSelectPopover
                                      rowId={row.id}
                                      field="noOfIssuancePeriod"
                                      options={["1", "2", "3"]}
                                      values={row.noOfIssuancePeriod}
                                      placeholder="Select periods"
                                    />
                                  </TableCell>

                                  {/* BCL Consultancy Section */}
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Input
                                      value={row.bclTier1}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) => (r.id === row.id ? { ...r, bclTier1: e.target.value } : r)),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Input
                                      value={row.bclTier2}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) => (r.id === row.id ? { ...r, bclTier2: e.target.value } : r)),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                  <TableCell className="border-r border-gray-300 h-16 px-4">
                                    <Input
                                      value={row.bclTier3}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) => (r.id === row.id ? { ...r, bclTier3: e.target.value } : r)),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>

                                  {/* Officer Section */}
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Input
                                      value={row.officer1}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) => (r.id === row.id ? { ...r, officer1: e.target.value } : r)),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                  <TableCell className="h-16 px-4 border-r border-gray-200">
                                    <Input
                                      value={row.officer2}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) => (r.id === row.id ? { ...r, officer2: e.target.value } : r)),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                  <TableCell className="h-16 px-4">
                                    <Input
                                      value={row.officer3}
                                      onChange={(e) =>
                                        setTableData((prev) =>
                                          prev.map((r) => (r.id === row.id ? { ...r, officer3: e.target.value } : r)),
                                        )
                                      }
                                      className="h-10 text-center"
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                          </>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={14} className="h-32 text-center text-gray-500">
                              No subdepartments or classes found for this department.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}