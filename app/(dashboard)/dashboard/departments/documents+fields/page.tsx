// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ChevronUp, ChevronDown, Pencil, Plus, Minus, Expand, Minimize2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"

interface DocumentField {
  id: string
  name: string
  type: string
  required: boolean
  order: number
}

interface DocumentType {
  id: string
  name: string
  display_name: string
  department: string
  category: string
  main_category: string
  document_number: number
  custom_order: number | null
  fields: DocumentField[]
  last_extracted_details: any
  requirements: any
  validity_days: string
  reminder_days: string
  listed: boolean
  subcategory: string
  document_type: string
}

interface SubdepartmentClass {
  name: string
  description: string | null
  requirements: any[]
  subclasses?: SubdepartmentClass[]
}

interface Subdepartment {
  id: number
  name: string
  department_id: string
  classes?: SubdepartmentClass[]
  hasClasses: boolean
}

interface Department {
  id: string
  name: string
  subdepartments?: Subdepartment[]
}

const CATEGORY_MAPPING = {
  company: "company-docs",
  individual: "directors-docs"
} as const

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>("")

  const { toast } = useToast()

  // Memoized filtered documents
  const filteredDocuments = useMemo(() => {
    if (!documents.length) return []

    return documents
      .filter(doc => doc.category === CATEGORY_MAPPING[documentTab])
      .sort((a, b) => {
        if (a.custom_order !== null && b.custom_order !== null) {
          return a.custom_order - b.custom_order
        }
        if (a.custom_order !== null) return -1
        if (b.custom_order !== null) return 1
        return a.document_number - b.document_number
      })
  }, [documents, documentTab])

  // Memoized current department
  const currentDepartment = useMemo(() =>
    departments.find(d => d.id === activeTab),
    [departments, activeTab]
  )

  // Memoized normalized subdepartments
  const normalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments?.length) {
      return [{
        id: -1,
        name: 'No Subdepartments',
        department_id: currentDepartment?.id || '',
        hasClasses: false,
        classes: []
      }]
    }
    return currentDepartment.subdepartments
  }, [currentDepartment])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      const [deptsResponse, documentsResponse] = await Promise.all([
        supabase
          .from('tm_departments')
          .select(`*, tm_subdepartments (*, classes)`)
          .order('name'),
        supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('custom_order', { ascending: true, nullsLast: true })
      ])

      if (deptsResponse.error) throw deptsResponse.error
      if (documentsResponse.error) throw documentsResponse.error

      const processedDocuments = (documentsResponse.data || []).map(doc => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }))

      const transformedDepartments = (deptsResponse.data || []).map(dept => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || []).map((subdept: any) => ({
          ...subdept,
          classes: Array.isArray(subdept.classes) ? subdept.classes : [],
          hasClasses: subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0
        }))
      }))

      setDepartments(transformedDepartments)
      setDocuments(processedDocuments)

      if (transformedDepartments.length > 0) {
        setActiveTab(transformedDepartments[0].id)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Optimized handlers
  const toggleDocumentExpansion = useCallback((documentId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(documentId)) {
        newSet.delete(documentId)
      } else {
        newSet.add(documentId)
      }
      return newSet
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedDocuments(new Set(filteredDocuments.map(doc => doc.id)))
  }, [filteredDocuments])

  const collapseAll = useCallback(() => {
    setExpandedDocuments(new Set())
  }, [])

  const handleDisplayToggle = useCallback((
    documentId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null,
    checked: boolean
  ) => {
    let allocationKey = `${documentId}-${subdeptId}`
    if (classIndex !== null) allocationKey += `-${classIndex}`
    if (subclassIndex !== null) allocationKey += `-${subclassIndex}`

    setDocumentAllocations(prev => ({
      ...prev,
      [allocationKey]: checked
    }))

    const documentName = documents.find(d => d.id === documentId)?.display_name || 'document'
    const subdept = currentDepartment?.subdepartments?.find(s => s.id === subdeptId)

    let location = subdept?.name || 'Unknown'
    if (classIndex !== null && subdept?.classes?.[classIndex]) {
      location = `${subdept.classes[classIndex].name} (${subdept.name})`
      if (subclassIndex !== null && subdept.classes[classIndex].subclasses?.[subclassIndex]) {
        location = `${subdept.classes[classIndex].subclasses[subclassIndex].name} (${location})`
      }
    }

    toast({
      title: "Success",
      description: `${documentName} ${checked ? 'enabled' : 'disabled'} for ${location}`,
    })
  }, [documents, currentDepartment, toast])

  const getAllocationStatus = useCallback((
    documentId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null
  ) => {
    let allocationKey = `${documentId}-${subdeptId}`
    if (classIndex !== null) allocationKey += `-${classIndex}`
    if (subclassIndex !== null) allocationKey += `-${subclassIndex}`

    return documentAllocations[allocationKey] || false
  }, [documentAllocations])

  const handleDisplayNameEdit = useCallback(async (documentId: string, newDisplayName: string) => {
    try {
      const { error } = await supabase
        .from('acc_portal_kyc')
        .update({ display_name: newDisplayName })
        .eq('id', documentId)

      if (error) throw error

      setDocuments(prev => prev.map(doc =>
        doc.id === documentId ? { ...doc, display_name: newDisplayName } : doc
      ))

      setEditingDisplayName(null)
      setEditingValue("")

      toast({
        title: "Success",
        description: "Display name updated successfully",
      })
    } catch (err) {
      console.error('Error updating display name:', err)
      toast({
        title: "Error",
        description: "Failed to update display name. Please try again.",
        variant: "destructive"
      })
    }
  }, [toast])

  const moveDocument = useCallback(async (documentId: string, direction: 'up' | 'down') => {
    const currentIndex = filteredDocuments.findIndex(d => d.id === documentId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= filteredDocuments.length) return

    try {
      let newCustomOrder: number

      if (direction === 'up') {
        const prevItem = filteredDocuments[currentIndex - 1]
        const prevOrder = prevItem?.custom_order ?? prevItem?.document_number ?? 0
        newCustomOrder = prevOrder - 0.1
      } else {
        const nextItem = filteredDocuments[currentIndex + 1]
        const nextOrder = nextItem?.custom_order ?? nextItem?.document_number ?? 999999
        newCustomOrder = nextOrder + 0.1
      }

      const { error } = await supabase
        .from('acc_portal_kyc')
        .update({ custom_order: newCustomOrder })
        .eq('id', documentId)

      if (error) throw error

      setDocuments(prev => prev.map(doc =>
        doc.id === documentId ? { ...doc, custom_order: newCustomOrder } : doc
      ))

      toast({
        title: "Success",
        description: `Document moved ${direction} successfully`,
      })
    } catch (err) {
      console.error('Error moving document:', err)
      toast({
        title: "Error",
        description: `Failed to move document ${direction}. Please try again.`,
        variant: "destructive"
      })
    }
  }, [filteredDocuments, toast])

  // Calculate total column span for complex headers
  const getTotalColSpan = useCallback((subdept: Subdepartment) => {
    if (!subdept.hasClasses) return 1

    return subdept.classes?.reduce((total, cls) => {
      return total + (cls.subclasses?.length || 1)
    }, 0) || 1
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 p-4 bg-red-50 border border-red-200 rounded-lg">
        {error}
      </div>
    )
  }

  if (!currentDepartment) {
    return (
      <div className="p-4 text-gray-600">No department selected</div>
    )
  }

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Document Management</h1>
            <p className="text-gray-600 mt-1">Manage document types and allocations</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={expandAll}
              className="border-gray-200 text-gray-700 hover:bg-blue-50"
            >
              <Expand className="h-4 w-4 mr-2" />
              Expand All
            </Button>
            <Button
              variant="outline"
              onClick={collapseAll}
              className="border-gray-200 text-gray-700 hover:bg-blue-50"
            >
              <Minimize2 className="h-4 w-4 mr-2" />
              Collapse All
            </Button>
          </div>
        </div>

        {/* Department Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            {departments.map(dept => (
              <TabsTrigger
                key={dept.id}
                value={dept.id}
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
              >
                {dept.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {departments.map(dept => (
            <TabsContent key={dept.id} value={dept.id} className="space-y-6">
              {/* Document Type Tabs */}
              <Tabs value={documentTab} onValueChange={setDocumentTab} className="w-full">
                <TabsList className="">
                  <TabsTrigger
                    value="company"
                    className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                  >
                    <div className="flex items-center gap-2">
                      Company Documents
                    </div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="individual"
                    className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                  >
                    <div className="flex items-center gap-2">
                      Individual Documents
                    </div>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={documentTab} className="mt-6">
                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border-2">
                      <div className="text-gray-400 text-lg">No {documentTab} documents found</div>
                      <p className="text-gray-600 mt-2">Add documents to get started</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                        <Table className="min-w-max">
                          <TableHeader className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 z-[5]">
                            {/* Main Subdepartment Header */}
                            <TableRow>
                              <TableHead rowSpan={4} className="sticky left-0 bg-blue-600 border-r border-gray-500 font-bold w-12 z-[6] text-white text-center">
                                #
                              </TableHead>
                              <TableHead rowSpan={4} className="sticky left-12 bg-blue-600 border-r border-gray-500 font-bold w-48 z-[6] text-white text-center">
                                Document Details
                              </TableHead>
                              <TableHead rowSpan={4} className="sticky left-60 bg-blue-600 border-r border-gray-500 font-bold w-24 z-[6] text-white text-center">
                                Order
                              </TableHead>
                              <TableHead rowSpan={4} className="sticky left-84 bg-blue-600 border-r border-gray-500 font-bold w-24 z-[6] text-white text-center">
                                Subdepartment
                              </TableHead>
                              {normalizedSubdepartments.map((subdept, subIndex) => {
                                const totalColSpan = getTotalColSpan(subdept)
                                return (
                                  <TableHead
                                    key={`subdept-${subdept.id}-${subIndex}`}
                                    colSpan={totalColSpan}
                                    className={cn(
                                      "border-r border-gray-500 text-center font-bold text-white",
                                      subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-700"
                                    )}
                                  >
                                    {subdept.name}
                                  </TableHead>
                                )
                              })}
                            </TableRow>

                            {/* Class Header Row */}
                            <TableRow>
                              {normalizedSubdepartments.map((subdept, subIndex) =>
                                subdept.hasClasses
                                  ? subdept.classes?.map((cls, clsIndex) => {
                                    const subclassCount = cls.subclasses?.length || 1
                                    return (
                                      <TableHead
                                        key={`class-${subdept.id}-${clsIndex}`}
                                        colSpan={subclassCount}
                                        className={cn(
                                          "border border-gray-400 text-center text-white text-sm",
                                          subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-600"
                                        )}
                                      >
                                        {cls.name}
                                      </TableHead>
                                    )
                                  })
                                  : (
                                    <TableHead
                                      key={`subdept-${subdept.id}-direct`}
                                      className={cn(
                                        "border border-gray-400 text-center text-white text-sm",
                                        subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-600"
                                      )}
                                    >
                                      Direct
                                    </TableHead>
                                  )
                              )}
                            </TableRow>

                            {/* Subclass Header Row */}
                            <TableRow>
                              {normalizedSubdepartments.map((subdept, subIndex) =>
                                subdept.hasClasses
                                  ? subdept.classes?.map((cls, clsIndex) =>
                                    cls.subclasses?.length
                                      ? cls.subclasses.map((subcls, subclsIndex) => (
                                        <TableHead
                                          key={`subclass-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                          className={cn(
                                            "border border-2 border text-center text-white text-xs",
                                            subIndex % 2 === 0 ? "bg-blue-400" : "bg-blue-500"
                                          )}
                                        >
                                          {subcls.name}
                                        </TableHead>
                                      ))
                                      : (
                                        <TableHead
                                          key={`class-direct-${subdept.id}-${clsIndex}`}
                                          className={cn(
                                            "border border-2 border text-center text-white text-xs",
                                            subIndex % 2 === 0 ? "bg-blue-400" : "bg-blue-500"
                                          )}
                                        >
                                          Main
                                        </TableHead>
                                      )
                                  )
                                  : (
                                    <TableHead
                                      className={cn(
                                        "border border-2 border text-center text-white text-xs",
                                        subIndex % 2 === 0 ? "bg-blue-400" : "bg-blue-500"
                                      )}
                                    >
                                      Main
                                    </TableHead>
                                  )
                              )}
                            </TableRow>

                            {/* Display Header Row */}
                            <TableRow>
                              {normalizedSubdepartments.map((subdept, subIndex) =>
                                subdept.hasClasses
                                  ? subdept.classes?.map((cls, clsIndex) =>
                                    cls.subclasses?.length
                                      ? cls.subclasses.map((subcls, subclsIndex) => (
                                        <TableHead
                                          className="border border-gray-200 text-center text-white text-xs bg-blue-300"
                                        >
                                          Display
                                        </TableHead>
                                      ))
                                      : (
                                        <TableHead
                                          className="border border-gray-200 text-center text-white text-xs bg-blue-300"
                                        >
                                          Display
                                        </TableHead>
                                      )
                                  )
                                  : (
                                    <TableHead
                                      className="border border-gray-200 text-center text-white text-xs bg-blue-300"
                                    >
                                      Display
                                    </TableHead>
                                  )
                              )}
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {filteredDocuments.map((document, index) => {
                              const isExpanded = expandedDocuments.has(document.id)
                              const hasFields = document.fields && document.fields.length > 0
                              const rowsToShow = isExpanded && hasFields ? [document, ...document.fields] : [document]

                              return rowsToShow.map((item, rowIndex) => {
                                const isMainRow = rowIndex === 0
                                const field = !isMainRow ? item as DocumentField : null

                                return (
                                  <TableRow
                                    key={`${document.id}-${rowIndex}`}
                                    className={cn(
                                      "group transition-colors hover:bg-blue-50",
                                      !isMainRow && "bg-blue-25"
                                    )}
                                  >
                                    {isMainRow && (
                                      <>
                                        <TableCell className="sticky left-0 bg-white border-r border-gray-200 z-[7] text-center w-12 font-medium text-gray-800">
                                          {index + 1}
                                        </TableCell>
                                        <TableCell className="sticky left-12 bg-white border-r border-gray-200 p-0 z-[7] w-48">
                                          <div className="flex gap-2 p-3">
                                            {!hasFields && <div className="w-6" />}
                                            {editingDisplayName === document.id ? (
                                              <div className="flex gap-1 flex-1">
                                                <Input
                                                  value={editingValue}
                                                  onChange={(e) => setEditingValue(e.target.value)}
                                                  className="h-7 text-sm border-gray-200 focus:border-gray-400"
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      handleDisplayNameEdit(document.id, editingValue)
                                                    } else if (e.key === 'Escape') {
                                                      setEditingDisplayName(null)
                                                      setEditingValue("")
                                                    }
                                                  }}
                                                  autoFocus
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 w-7 p-0 text-green-600 hover:bg-green-100"
                                                  onClick={() => handleDisplayNameEdit(document.id, editingValue)}
                                                >
                                                  ✓
                                                </Button>
                                              </div>
                                            ) : (
                                              <div className="flex gap-2 flex-1">
                                                <span className="font-medium text-gray-900">
                                                  {document.display_name || document.name}
                                                </span>
                                              </div>
                                            )}
                                            {hasFields && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 hover:bg-blue-100"
                                                onClick={() => toggleDocumentExpansion(document.id)}
                                              >
                                                {isExpanded ? (
                                                  <Minus className="h-4 w-4 text-gray-600" />
                                                ) : (
                                                  <Plus className="h-4 w-4 text-gray-600" />
                                                )}
                                              </Button>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="sticky left-60 bg-white border-r border-gray-200 p-0 z-[7] w-24">
                                          <div className="flex items-center justify-center p-2">
                                            <div className="flex flex-col items-center gap-1">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => moveDocument(document.id, 'up')}
                                                disabled={index === 0}
                                                className={cn(
                                                  "h-6 w-6 p-0 hover:bg-blue-100",
                                                  index === 0 && "opacity-30 cursor-not-allowed"
                                                )}
                                              >
                                                <ChevronUp className="h-3 w-3 text-gray-600" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 hover:bg-blue-100"
                                                onClick={() => {
                                                  setEditingDisplayName(document.id)
                                                  setEditingValue(document.display_name || document.name)
                                                }}
                                              >
                                                <Pencil className="h-3 w-3 text-gray-600" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => moveDocument(document.id, 'down')}
                                                disabled={index === filteredDocuments.length - 1}
                                                className={cn(
                                                  "h-6 w-6 p-0 hover:bg-blue-100",
                                                  index === filteredDocuments.length - 1 && "opacity-30 cursor-not-allowed"
                                                )}
                                              >
                                                <ChevronDown className="h-3 w-3 text-gray-600" />
                                              </Button>
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell className="sticky left-84 bg-white border-r border-gray-200 p-0 z-[7] w-24"></TableCell>

                                      </>
                                    )}

                                    {!isMainRow && (
                                      <>
                                        <TableCell className="sticky left-0 bg-blue-25 border-r border-gray-200 z-[6] text-center w-12"></TableCell>
                                        <TableCell className="sticky left-12 bg-blue-25 border-r border-gray-200 p-0 z-[6] w-48">
                                          <div className="pl-8 p-3">
                                            <span className="text-sm text-gray-700">
                                              {field?.name}
                                              <span className="text-gray-500">({field?.type})</span>
                                              {field?.required && <span className="text-red-500 ml-1">*</span>}
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell className="sticky left-60 bg-blue-25 border-r border-gray-200 p-0 z-[6] w-24"></TableCell>
                                      </>
                                    )}

                                    {normalizedSubdepartments.map((subdept, subIndex) => {
                                      if (subdept.hasClasses) {
                                        return subdept.classes?.map((cls, clsIndex) =>
                                          cls.subclasses?.length
                                            ? cls.subclasses.map((subcls, subclsIndex) => {
                                              if (!isMainRow) {
                                                return (
                                                  <TableCell
                                                    key={`field-cell-${subdept.id}-${clsIndex}-${subclsIndex}-${field?.id}`}
                                                    className="border-2 p-0 bg-blue-25"
                                                  />
                                                )
                                              }

                                              const hasDisplay = getAllocationStatus(document.id, subdept.id, clsIndex, subclsIndex)

                                              return (
                                                <TableCell
                                                  key={`cell-${subdept.id}-${clsIndex}-${subclsIndex}-${document.id}`}
                                                  className="border-2 p-0"
                                                >
                                                  <div className="flex items-center justify-center p-3">
                                                    <Checkbox
                                                      checked={hasDisplay}
                                                      onCheckedChange={(checked) =>
                                                        handleDisplayToggle(document.id, subdept.id, clsIndex, subclsIndex, checked as boolean)
                                                      }
                                                      className="h-4 w-4 border-2 border data-[state=checked]:bg-blue-600 data-[state=checked]:border-gray-600"
                                                    />
                                                  </div>
                                                </TableCell>
                                              )
                                            })
                                            : (() => {
                                              if (!isMainRow) {
                                                return (
                                                  <TableCell
                                                    key={`field-cell-${subdept.id}-${clsIndex}-${field?.id}`}
                                                    className="border-2 p-0 bg-blue-25"
                                                  />
                                                )
                                              }

                                              const hasDisplay = getAllocationStatus(document.id, subdept.id, clsIndex, null)

                                              return (
                                                <TableCell
                                                  key={`cell-${subdept.id}-${clsIndex}-${document.id}`}
                                                  className="border-2 p-0"
                                                >
                                                  <div className="flex items-center justify-center p-3">
                                                    <Checkbox
                                                      checked={hasDisplay}
                                                      onCheckedChange={(checked) =>
                                                        handleDisplayToggle(document.id, subdept.id, clsIndex, null, checked as boolean)
                                                      }
                                                      className="h-4 w-4 border-2 border data-[state=checked]:bg-blue-600 data-[state=checked]:border-gray-600"
                                                    />
                                                  </div>
                                                </TableCell>
                                              )
                                            })()
                                        )
                                      } else {
                                        if (!isMainRow) {
                                          return (
                                            <TableCell
                                              key={`field-cell-${subdept.id}-direct-${field?.id}`}
                                              className="border-2 p-0 bg-blue-25"
                                            />
                                          )
                                        }

                                        const hasDisplay = getAllocationStatus(document.id, subdept.id, null, null)

                                        return (
                                          <TableCell
                                            key={`cell-${subdept.id}-direct-${document.id}`}
                                            className="border-2 p-0"
                                          >
                                            <div className="flex items-center justify-center p-3">
                                              <Checkbox
                                                checked={hasDisplay}
                                                onCheckedChange={(checked) =>
                                                  handleDisplayToggle(document.id, subdept.id, null, null, checked as boolean)
                                                }
                                                className="h-4 w-4 border-2 border data-[state=checked]:bg-blue-600 data-[state=checked]:border-gray-600"
                                              />
                                            </div>
                                          </TableCell>
                                        )
                                      }
                                    })}
                                  </TableRow>
                                )
                              })
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}