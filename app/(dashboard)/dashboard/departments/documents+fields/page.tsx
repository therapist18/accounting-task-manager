// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, Pencil, Plus, X, Info, ChevronUp, ChevronDown, ChevronRight, ExpandIcon, Minimize2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type DocumentField = {
  id: string
  name: string
  type: string
  required: boolean
  order: number
}

type DocumentType = {
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

type SubdepartmentClass = {
  name: string
  description: string | null
  requirements: any[]
  document_allocations?: DocumentAllocation[]
}

type DocumentAllocation = {
  document_id: string
  display: boolean
}

type Subdepartment = {
  id: number
  name: string
  department_id: string
  classes?: SubdepartmentClass[]
  document_allocations?: DocumentAllocation[]
  hasClasses: boolean
}

type Department = {
  id: string
  name: string
  documents: DocumentType[]
  tm_subdepartments?: Subdepartment[]
  subdepartments?: Subdepartment[]
}

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<string>("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>("")

  const { toast } = useToast()

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch departments with their subdepartments
        const { data: deptsData, error: deptsError } = await supabase
          .from('tm_departments')
          .select(`
            *,
            tm_subdepartments (
              *,
              classes
            )
          `)
          .order('name')

        if (deptsError) throw deptsError

        // Fetch document types
        const { data: documentsData, error: documentsError } = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('custom_order', { ascending: true, nullsLast: true })

        if (documentsError) throw documentsError

        // Group documents by department
        const documentsByDepartment = (documentsData || []).reduce((acc, doc) => {
          if (!acc[doc.department]) {
            acc[doc.department] = []
          }
          acc[doc.department].push({
            ...doc,
            fields: Array.isArray(doc.fields) ? doc.fields : []
          })
          return acc
        }, {} as Record<string, DocumentType[]>)

        // Transform the departments data
        const transformedDepartments = (deptsData || []).map(dept => ({
          ...dept,
          documents: documentsByDepartment[dept.name] || [],
          subdepartments: (dept.tm_subdepartments || []).map((subdept: any) => ({
            ...subdept,
            document_allocations: Array.isArray(subdept.document_allocations) ? subdept.document_allocations : [],
            classes: Array.isArray(subdept.classes) ? subdept.classes : [],
            hasClasses: (subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0)
          }))
        }))

        setDepartments(transformedDepartments)

        // Set the first department as active tab
        if (transformedDepartments.length > 0) {
          setActiveTab(transformedDepartments[0].id)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const getCurrentDepartment = () => {
    return departments.find(d => d.id === activeTab)
  }

  // Filter documents based on category and document tab
  const getFilteredDocuments = () => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return []

    return currentDept.documents.filter(doc => {
      if (documentTab === "company") {
        return doc.category === "company-docs"
      } else {
        return doc.category === "directors-docs"
      }
    }).sort((a, b) => {
      // Sort by custom_order, then by document_number
      if (a.custom_order !== null && b.custom_order !== null) {
        return a.custom_order - b.custom_order
      }
      if (a.custom_order !== null) return -1
      if (b.custom_order !== null) return 1
      return a.document_number - b.document_number
    })
  }

  // Toggle document expansion
  const toggleDocumentExpansion = (documentId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(documentId)) {
        newSet.delete(documentId)
      } else {
        newSet.add(documentId)
      }
      return newSet
    })
  }

  // Expand all documents
  const expandAll = () => {
    const filteredDocs = getFilteredDocuments()
    setExpandedDocuments(new Set(filteredDocs.map(doc => doc.id)))
  }

  // Collapse all documents
  const collapseAll = () => {
    setExpandedDocuments(new Set())
  }

  // Handle display toggle for documents
  const handleDisplayToggle = async (subdeptId: number, documentId: string, checked: boolean, classIndex: number | null = null) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let documentName = currentDept.documents.find(d => d.id === documentId)?.display_name || 'this document'

      if (classIndex !== null) {
        // Handle class display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].document_allocations) {
          updatedClasses[classIndex].document_allocations = []
        }

        let docAllocation = updatedClasses[classIndex].document_allocations.find((d: DocumentAllocation) => d.document_id === documentId)
        if (!docAllocation) {
          docAllocation = { document_id: documentId, display: false }
          updatedClasses[classIndex].document_allocations.push(docAllocation)
        }

        docAllocation.display = checked
        updateData = { classes: updatedClasses }

        // Also update subdepartment document allocations
        const subdeptDocs = [...(subdept.document_allocations || [])]
        let subdeptDocAllocation = subdeptDocs.find(d => d.document_id === documentId)
        if (!subdeptDocAllocation) {
          subdeptDocAllocation = { document_id: documentId, display: false }
          subdeptDocs.push(subdeptDocAllocation)
        }
        subdeptDocAllocation.display = checked || subdeptDocs.some(d => d.document_id === documentId && d.display)
        updateData.document_allocations = subdeptDocs

      } else {
        // Handle subdepartment display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name

        const subdeptDocs = [...(subdept.document_allocations || [])]
        let docAllocation = subdeptDocs.find(d => d.document_id === documentId)
        if (!docAllocation) {
          docAllocation = { document_id: documentId, display: false }
          subdeptDocs.push(docAllocation)
        }

        docAllocation.display = checked
        updateData = { document_allocations: subdeptDocs }
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId)

      if (error) throw error

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments: dept.subdepartments?.map(subdept => {
              if (subdept.id !== subdeptId) return subdept

              if (classIndex !== null) {
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].document_allocations) {
                  updatedClasses[classIndex].document_allocations = []
                }

                let docAllocation = updatedClasses[classIndex].document_allocations.find((d: DocumentAllocation) => d.document_id === documentId)
                if (!docAllocation) {
                  docAllocation = { document_id: documentId, display: false }
                  updatedClasses[classIndex].document_allocations.push(docAllocation)
                }
                docAllocation.display = checked

                // Update subdepartment document allocations as well
                const subdeptDocs = [...(subdept.document_allocations || [])]
                let subdeptDocAllocation = subdeptDocs.find(d => d.document_id === documentId)
                if (!subdeptDocAllocation) {
                  subdeptDocAllocation = { document_id: documentId, display: false }
                  subdeptDocs.push(subdeptDocAllocation)
                }
                subdeptDocAllocation.display = checked || subdeptDocs.some(d => d.document_id === documentId && d.display)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  document_allocations: subdeptDocs
                }
              }

              const subdeptDocs = [...(subdept.document_allocations || [])]
              let docAllocation = subdeptDocs.find(d => d.document_id === documentId)
              if (!docAllocation) {
                docAllocation = { document_id: documentId, display: false }
                subdeptDocs.push(docAllocation)
              }
              docAllocation.display = checked

              return {
                ...subdept,
                document_allocations: subdeptDocs
              }
            }) || []
          }
        })
      )

      // Show success toast
      toast({
        title: "Success",
        description: `Display setting updated for ${documentName} in ${className ? `${className} (${subdeptName})` : subdeptName}`,
      })
    } catch (err) {
      console.error('Error updating display setting:', err)
      toast({
        title: "Error",
        description: "Failed to update display setting. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Handle display name edit
  const handleDisplayNameEdit = async (documentId: string, newDisplayName: string) => {
    try {
      const { error } = await supabase
        .from('acc_portal_kyc')
        .update({ display_name: newDisplayName })
        .eq('id', documentId)

      if (error) throw error

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => ({
          ...dept,
          documents: dept.documents.map(doc =>
            doc.id === documentId ? { ...doc, display_name: newDisplayName } : doc
          )
        }))
      )

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
  }

  // Move document up or down
  const moveDocument = async (documentId: string, direction: 'up' | 'down') => {
    const filteredDocs = getFilteredDocuments()
    const currentIndex = filteredDocs.findIndex(d => d.id === documentId)

    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= filteredDocs.length) return

    try {
      // Calculate new custom_order values
      const updates: { id: string, custom_order: number }[] = []
      
      if (direction === 'up') {
        updates.push({ id: filteredDocs[currentIndex].id, custom_order: currentIndex - 0.5 })
      } else {
        updates.push({ id: filteredDocs[currentIndex].id, custom_order: currentIndex + 1.5 })
      }

      // Update in database
      for (const update of updates) {
        const { error } = await supabase
          .from('acc_portal_kyc')
          .update({ custom_order: update.custom_order })
          .eq('id', update.id)

        if (error) throw error
      }

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => ({
          ...dept,
          documents: dept.documents.map(doc => {
            const update = updates.find(u => u.id === doc.id)
            return update ? { ...doc, custom_order: update.custom_order } : doc
          })
        }))
      )

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
  }

  const currentDept = getCurrentDepartment()
  const filteredDocuments = getFilteredDocuments()

  if (loading) return <div>Loading...</div>
  if (error) return <div className="text-red-500">{error}</div>
  if (!currentDept) return <div>No department selected</div>

  const getSubdepartmentColSpan = (subdept: Subdepartment) => {
    return (subdept.classes?.length || 0) || 1
  }

  // Ensure we always have at least one subdepartment
  const normalizedSubdepartments = currentDept.subdepartments && currentDept.subdepartments.length > 0
    ? currentDept.subdepartments
    : [{
      id: -1,
      name: 'N/A',
      department_id: currentDept.id,
      document_allocations: [],
      hasClasses: false,
      classes: []
    }]

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Document Types</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={expandAll}>
            <ExpandIcon className="h-4 w-4 mr-2" />
            Expand All
          </Button>
          <Button variant="outline" onClick={collapseAll}>
            <Minimize2 className="h-4 w-4 mr-2" />
            Collapse All
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full mb-4 items-start justify-start">
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id}>
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4">
            {/* Document Type Tabs */}
            <Tabs value={documentTab} onValueChange={setDocumentTab} className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="company">Company Documents</TabsTrigger>
                <TabsTrigger value="individual">Individual Documents</TabsTrigger>
              </TabsList>

              <TabsContent value={documentTab} className="space-y-4">
                <div className="relative overflow-auto max-h-[calc(100vh-400px)]">
                  <Table className="border min-w-max">
                    <TableHeader className="sticky top-0 bg-background z-10">
                      {/* Subdepartment Header Row */}
                      <TableRow className="bg-muted/50">
                        <TableHead rowSpan={3} className="sticky left-0 bg-background border-r font-bold w-12 z-20">#</TableHead>
                        <TableHead rowSpan={3} className="sticky left-12 bg-background border-r font-bold w-48 z-20 text-center">Document Details</TableHead>
                        <TableHead rowSpan={3} className="sticky left-60 bg-background border-r font-bold w-24 z-20 text-center">Order</TableHead>
                        {normalizedSubdepartments.map((subdept, subIndex) => {
                          const colSpan = getSubdepartmentColSpan(subdept);
                          return (
                            <TableHead
                              key={`subdept-${subdept.id}-${subIndex}`}
                              colSpan={colSpan}
                              className={`${subIndex === 0 ? 'border-l' : ''} border-r text-center font-bold bg-muted/30`}
                            >
                              {subdept.name}
                            </TableHead>
                          );
                        })}
                      </TableRow>

                      {/* Class Header Row */}
                      <TableRow className="bg-muted/20">
                        {normalizedSubdepartments.map(subdept =>
                          subdept.hasClasses
                            ? subdept.classes?.map((cls, clsIndex) => (
                              <TableHead
                                key={`class-${subdept.id}-${clsIndex}`}
                                className="border text-center"
                              >
                                {cls.name}
                              </TableHead>
                            ))
                            : <TableHead
                              key={`subdept-${subdept.id}-direct`}
                              className="border text-center"
                            >
                              {subdept.name}
                            </TableHead>
                        )}
                      </TableRow>

                      {/* Display Header Row */}
                      <TableRow>
                        {normalizedSubdepartments.map(subdept =>
                          subdept.hasClasses
                            ? subdept.classes?.map((cls, clsIndex) => (
                              <TableHead key={`display-${subdept.id}-${clsIndex}`} className="border text-center">
                                Display
                              </TableHead>
                            ))
                            : (
                              <TableHead key={`display-${subdept.id}-direct`} className="border text-center">
                                Display
                              </TableHead>
                            )
                        )}
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredDocuments.map((document, index) => {
                        const isExpanded = expandedDocuments.has(document.id)
                        const rowsToShow = isExpanded ? [document, ...(document.fields || [])] : [document]

                        return rowsToShow.map((item, rowIndex) => {
                          const isMainRow = rowIndex === 0
                          const field = !isMainRow ? item as DocumentField : null

                          return (
                            <TableRow key={`${document.id}-${rowIndex}`} className={`group ${!isMainRow ? 'bg-muted/20' : ''}`}>
                              {isMainRow && (
                                <>
                                  <TableCell className="sticky left-0 bg-background border-r z-10 text-center w-12">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className="sticky left-12 bg-background border-r p-0 z-10 w-48">
                                    <div className="flex items-center gap-2 p-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 p-0"
                                        onClick={() => toggleDocumentExpansion(document.id)}
                                      >
                                        <ChevronRight className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                      </Button>
                                      {editingDisplayName === document.id ? (
                                        <div className="flex items-center gap-1 flex-1">
                                          <Input
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            className="h-6 text-sm"
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
                                            size="icon"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleDisplayNameEdit(document.id, editingValue)}
                                          >
                                            ✓
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 flex-1">
                                          <span className="font-medium">
                                            {document.display_name || document.name}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                            onClick={() => {
                                              setEditingDisplayName(document.id)
                                              setEditingValue(document.display_name || document.name)
                                            }}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="sticky left-60 bg-background border-r p-0 z-10 w-24">
                                    <div className="flex items-center justify-center">
                                      <div className="flex flex-col items-center">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveDocument(document.id, 'up');
                                          }}
                                          disabled={index === 0}
                                          className={`p-1 rounded hover:bg-muted ${index === 0 ? 'opacity-30' : 'hover:bg-muted'}`}
                                        >
                                          <ChevronUp className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveDocument(document.id, 'down');
                                          }}
                                          disabled={index === filteredDocuments.length - 1}
                                          className={`p-1 rounded hover:bg-muted ${index === filteredDocuments.length - 1 ? 'opacity-30' : 'hover:bg-muted'}`}
                                        >
                                          <ChevronDown className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </TableCell>
                                </>
                              )}

                              {!isMainRow && (
                                <>
                                  <TableCell className="sticky left-0 bg-background border-r z-10 text-center w-12"></TableCell>
                                  <TableCell className="sticky left-12 bg-background border-r p-0 z-10 w-48">
                                    <div className="pl-8 p-2">
                                      <span className="text-sm text-muted-foreground">
                                        {field?.name} ({field?.type})
                                        {field?.required && <span className="text-red-500 ml-1">*</span>}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="sticky left-60 bg-background border-r p-0 z-10 w-24"></TableCell>
                                </>
                              )}

                              {normalizedSubdepartments.map(subdept => {
                                if (subdept.hasClasses) {
                                  return subdept.classes?.map((cls, clsIndex) => {
                                    if (!isMainRow) {
                                      return <TableCell key={`field-cell-${subdept.id}-${clsIndex}-${field?.id}`} className="border p-0"></TableCell>
                                    }

                                    const docAllocation = cls.document_allocations?.find(d => d.document_id === document.id)
                                    const hasDisplay = docAllocation?.display || false

                                    return (
                                      <TableCell key={`cell-${subdept.id}-${clsIndex}-${document.id}`} className="border p-0">
                                        <div className="flex items-center justify-center p-2">
                                          <Checkbox
                                            checked={hasDisplay}
                                            onCheckedChange={(checked) =>
                                              handleDisplayToggle(subdept.id, document.id, checked as boolean, clsIndex)
                                            }
                                            className="h-4 w-4"
                                          />
                                        </div>
                                      </TableCell>
                                    );
                                  });
                                } else {
                                  if (!isMainRow) {
                                    return <TableCell key={`field-cell-${subdept.id}-direct-${field?.id}`} className="border p-0"></TableCell>
                                  }

                                  const docAllocation = subdept.document_allocations?.find(d => d.document_id === document.id);
                                  const hasDisplay = docAllocation?.display || false;

                                  return (
                                    <TableCell key={`cell-${subdept.id}-direct-${document.id}`} className="border p-0">
                                      <div className="flex items-center justify-center p-2">
                                        <Checkbox
                                          checked={hasDisplay}
                                          onCheckedChange={(checked) =>
                                            handleDisplayToggle(subdept.id, document.id, checked as boolean)
                                          }
                                          className="h-4 w-4"
                                        />
                                      </div>
                                    </TableCell>
                                  );
                                }
                              })}
                            </TableRow>
                          )
                        })
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}