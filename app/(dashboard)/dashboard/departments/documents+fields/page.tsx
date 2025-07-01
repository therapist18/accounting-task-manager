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
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

interface DocumentField {
  id: string
  name: string
  type: string
  required: boolean
  order: number
  // Properties for rendering nested structure
  level: number
  parentId: string | null
  isArrayItem: boolean
  hasChildren: boolean
  fields?: DocumentField[]
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
  hasFields?: boolean // Added by processing
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

// This function recursively processes document fields to handle nested arrays
// and adds metadata for rendering (level, parentId, etc.).
const processDocumentFields = (docs: DocumentType[]) => {
  return docs.map(doc => {
    // Check for fields in both 'fields' and 'arrayConfig.fields'
    const getSubFields = (field: any) => field.fields || field.arrayConfig?.fields || [];

    const processField = (field: any, level = 0, parentId: string | null = null): DocumentField[] => {
      const subFields = getSubFields(field);
      const hasChildren = field.type === 'array' && subFields.length > 0;

      const currentField: DocumentField = {
        ...field,
        id: field.id || `${parentId}-${field.name}`,
        level,
        parentId,
        hasChildren,
        isArrayItem: false
      };

      const result: DocumentField[] = [currentField];

      if (hasChildren) {
        // Create a synthetic "array item" placeholder for visual grouping
        const arrayItem: DocumentField = {
          id: `${currentField.id}[]`,
          name: '[]',
          type: 'array-item',
          level: level + 1,
          parentId: currentField.id,
          hasChildren: false,
          isArrayItem: true,
        };
        result.push(arrayItem);

        // Process the nested fields within the array
        subFields.forEach((subField: any) => {
          result.push(...processField(subField, level + 2, arrayItem.id));
        });
      }

      return result;
    };

    const processedFields: DocumentField[] = [];
    (doc.fields || []).forEach(field => {
      processedFields.push(...processField(field));
    });

    return {
      ...doc,
      hasFields: processedFields.length > 0,
      fields: processedFields
    };
  });
};


export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>("")

  // Memoized filtered documents with processed fields
  const filteredDocuments = useMemo(() => {
    if (!documents.length) return [];

    const sortedDocs = documents
      .filter(doc => doc.category === CATEGORY_MAPPING[documentTab])
      .sort((a, b) => {
        if (a.custom_order !== null && b.custom_order !== null) {
          return a.custom_order - b.custom_order;
        }
        if (a.custom_order !== null) return -1;
        if (b.custom_order !== null) return 1;
        return a.document_number - b.document_number;
      });

    // Process fields after sorting
    return processDocumentFields(sortedDocs);
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
  const toggleItemExpansion = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }, [])

  const expandAll = useCallback(() => {
    const allExpandableIds = new Set<string>();
    filteredDocuments.forEach(doc => {
      if (doc.hasFields) {
        allExpandableIds.add(doc.id);
        doc.fields.forEach(field => {
          if (field.hasChildren) {
            allExpandableIds.add(field.id);
          }
        });
      }
    });
    setExpandedItems(allExpandableIds);
  }, [filteredDocuments]);

  const collapseAll = useCallback(() => {
    setExpandedItems(new Set())
  }, [])

  const handleDisplayToggle = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null,
    checked: boolean
  ) => {
    let allocationKey = `${allocationId}-${subdeptId}`
    if (classIndex !== null) allocationKey += `-${classIndex}`
    if (subclassIndex !== null) allocationKey += `-${subclassIndex}`

    setDocumentAllocations(prev => ({
      ...prev,
      [allocationKey]: checked
    }))

    // In a real app, you would persist this change to the backend.
    toast({
      title: "Configuration updated",
      description: `Display setting changed for allocation key: ${allocationKey}`,
    })
  }, [toast])

  const getAllocationStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null
  ) => {
    let allocationKey = `${allocationId}-${subdeptId}`
    if (classIndex !== null) allocationKey += `-${classIndex}`
    if (subclassIndex !== null) allocationKey += `-${subclassIndex}`

    return documentAllocations[allocationKey] || false
  }, [documentAllocations])

  // Calculate total column span for complex headers
  const getTotalColSpan = useCallback((subdept: Subdepartment) => {
    if (!subdept.hasClasses) return 1

    return subdept.classes?.reduce((total, cls) => {
      return total + (cls.subclasses?.length || 1)
    }, 0) || 1
  }, [])

  if (loading) return <div className="p-12 text-center">Loading...</div>
  if (error) return <div className="p-12 text-center text-red-500">{error}</div>
  if (!currentDepartment) return <div className="p-12 text-center">No department selected.</div>

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Document Management</h1>
            <p className="text-gray-600 mt-1">Manage document types and allocations</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={expandAll}><Expand className="h-4 w-4 mr-2" />Expand All</Button>
            <Button variant="outline" onClick={collapseAll}><Minimize2 className="h-4 w-4 mr-2" />Collapse All</Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            {departments.map(dept => (
              <TabsTrigger key={dept.id} value={dept.id}>{dept.name}</TabsTrigger>
            ))}
          </TabsList>

          {departments.map(dept => (
            <TabsContent key={dept.id} value={dept.id} className="space-y-6">
              <Tabs value={documentTab} onValueChange={setDocumentTab as (value: string) => void} className="w-full">
                <TabsList>
                  <TabsTrigger value="company">Company Documents</TabsTrigger>
                  <TabsTrigger value="individual">Individual Documents</TabsTrigger>
                </TabsList>

                <TabsContent value={documentTab} className="mt-6">
                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border">No documents found.</div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                        <Table className="min-w-max">
                          <TableHeader className="sticky top-0 bg-blue-600 z-10">
                            {/* Main Subdepartment Header */}
                            <TableRow>
                              <TableHead rowSpan={4} className="sticky left-0 bg-blue-600 border-r border-blue-500 w-12 z-20 text-white text-center">#</TableHead>
                              <TableHead rowSpan={4} className="sticky left-12 bg-blue-600 border-r border-blue-500 w-64 z-20 text-white text-center">Document / Field Details</TableHead>
                              {normalizedSubdepartments.map((subdept, subIndex) => (
                                <TableHead
                                  key={`subdept-header-${subdept.id}`}
                                  colSpan={getTotalColSpan(subdept)}
                                  className={cn("border-r border-blue-400 text-center font-bold text-white", subIndex % 2 === 0 ? "bg-blue-700" : "bg-blue-600")}
                                >
                                  {subdept.name}
                                </TableHead>
                              ))}
                            </TableRow>

                            {/* Class Header Row */}
                            <TableRow>
                              {normalizedSubdepartments.map((subdept, subIndex) =>
                                subdept.hasClasses ? subdept.classes?.map((cls, clsIndex) => (
                                  <TableHead key={`class-header-${clsIndex}`} colSpan={cls.subclasses?.length || 1} className={cn("border-r border-blue-400 text-center text-white text-sm", subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500")}>
                                    {cls.name}
                                  </TableHead>
                                )) : <TableHead key={`subdept-direct-${subdept.id}`} className={cn("border-r border-blue-400 text-center text-white text-sm", subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500")}>-</TableHead>
                              )}
                            </TableRow>

                            {/* Subclass Header Row */}
                            <TableRow>
                              {normalizedSubdepartments.map((subdept, subIndex) =>
                                subdept.hasClasses ? subdept.classes?.flatMap(cls =>
                                  cls.subclasses?.length ? cls.subclasses.map((subcls, subclsIndex) => (
                                    <TableHead key={`subclass-header-${subclsIndex}`} className={cn("border-r border-blue-400 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}>{subcls.name}</TableHead>
                                  )) : <TableHead key={`class-direct-${cls.name}`} className={cn("border-r border-blue-400 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}>-</TableHead>
                                ) : <TableHead key={`subdept-main-${subdept.id}`} className={cn("border-r border-blue-400 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}>-</TableHead>
                              )}
                            </TableRow>

                            {/* Display Header Row */}
                            <TableRow>
                              {normalizedSubdepartments.flatMap(subdept =>
                                subdept.hasClasses ? subdept.classes?.flatMap(cls =>
                                  cls.subclasses?.length ? cls.subclasses.map((_, i) => <TableHead key={`d-h-1-${i}`} className="border-r border-blue-400 text-center text-white text-xs bg-blue-300">Display</TableHead>)
                                    : <TableHead key={`d-h-2-${cls.name}`} className="border-r border-blue-400 text-center text-white text-xs bg-blue-300">Display</TableHead>
                                ) : <TableHead key={`d-h-3-${subdept.id}`} className="border-r border-blue-400 text-center text-white text-xs bg-blue-300">Display</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {filteredDocuments.map((doc, docIndex) => {
                              const isDocExpanded = expandedItems.has(doc.id);
                              const allItems = [
                                { ...doc, isMainRow: true, level: 0 },
                                ...(isDocExpanded && doc.hasFields ? doc.fields : [])
                              ];

                              return allItems.map((item, itemIndex) => {
                                if (item.isMainRow) {
                                  // RENDER DOCUMENT ROW
                                  return (
                                    <TableRow key={doc.id} className="group bg-white hover:bg-gray-50">
                                      <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center font-medium">{docIndex + 1}</TableCell>
                                      <TableCell className="sticky left-12 bg-white group-hover:bg-gray-50 border-r z-[5] w-64">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-gray-800">{doc.display_name}</span>

                                          {doc.hasFields && (
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleItemExpansion(doc.id)}>
                                              {isDocExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                      {/* Render empty cells if doc has fields, or checkboxes if not */}
                                      {normalizedSubdepartments.flatMap(subdept =>
                                        subdept.hasClasses ? subdept.classes.flatMap(cls =>
                                          (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, i) => (
                                            <TableCell key={`cell-${i}`} className="text-center border">
                                              {!doc.hasFields && (
                                                <Checkbox
                                                  checked={getAllocationStatus(doc.id, subdept.id, subdept.classes.indexOf(cls), subcls ? i : null)}
                                                  onCheckedChange={c => handleDisplayToggle(doc.id, subdept.id, subdept.classes.indexOf(cls), subcls ? i : null, c as boolean)}
                                                />
                                              )}
                                            </TableCell>
                                          ))
                                        ) : (
                                          <TableCell key={`cell-direct`} className="text-center border">
                                            {!doc.hasFields && (
                                              <Checkbox
                                                checked={getAllocationStatus(doc.id, subdept.id, null, null)}
                                                onCheckedChange={c => handleDisplayToggle(doc.id, subdept.id, null, null, c as boolean)}
                                              />
                                            )}
                                          </TableCell>
                                        )
                                      )}
                                    </TableRow>
                                  );
                                } else {
                                  // RENDER FIELD ROW
                                  const field = item as DocumentField;
                                  const isFieldExpanded = expandedItems.has(field.id);
                                  // Hide nested fields of a collapsed array
                                  if (field.parentId && !expandedItems.has(field.parentId)) return null;

                                  return (
                                    <TableRow key={field.id} className="group bg-blue-25 hover:bg-blue-50">
                                      <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5]"></TableCell>
                                      <TableCell className="sticky left-12 bg-blue-25 group-hover:bg-blue-50 border-r z-[5]">
                                        <div className="flex items-center gap-2" style={{ paddingLeft: `${field.level * 1.25}rem` }}>
                                          {field.hasChildren && (
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleItemExpansion(field.id)}>
                                              {isFieldExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                            </Button>
                                          )}
                                          <span className={cn('text-sm', field.type === 'array-item' && 'italic text-gray-500', !field.hasChildren && 'ml-8')}>
                                            {field.name}
                                            {field.type !== 'array-item' && <span className="text-xs text-gray-400 ml-2">({field.type})</span>}
                                          </span>
                                        </div>
                                      </TableCell>
                                      {/* Render checkboxes for fields */}
                                      {normalizedSubdepartments.flatMap(subdept =>
                                        subdept.hasClasses ? subdept.classes.flatMap(cls =>
                                          (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, i) => (
                                            <TableCell key={`f-cell-${i}`} className="text-center border">
                                              {field.type !== 'array' && field.type !== 'array-item' && (
                                                <Checkbox
                                                  checked={getAllocationStatus(`${doc.id}-${field.id}`, subdept.id, subdept.classes.indexOf(cls), subcls ? i : null)}
                                                  onCheckedChange={c => handleDisplayToggle(`${doc.id}-${field.id}`, subdept.id, subdept.classes.indexOf(cls), subcls ? i : null, c as boolean)}
                                                />
                                              )}
                                            </TableCell>
                                          ))
                                        ) : (
                                          <TableCell key={`f-cell-direct`} className="text-center border">
                                            {field.type !== 'array' && field.type !== 'array-item' && (
                                              <Checkbox
                                                checked={getAllocationStatus(`${doc.id}-${field.id}`, subdept.id, null, null)}
                                                onCheckedChange={c => handleDisplayToggle(`${doc.id}-${field.id}`, subdept.id, null, null, c as boolean)}
                                              />
                                            )}
                                          </TableCell>
                                        )
                                      )}
                                    </TableRow>
                                  );
                                }
                              });
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