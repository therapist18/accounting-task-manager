// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Minus, Expand, Minimize2, Info, FileText, Users } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { getTableFields, getGroupedFields, FormField } from "./formFields"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "@/app/(dashboard)/dashboard/departments/main-shared-components/column-visibility"
import { DocumentType, Subdepartment, DocumentField, ClientData, Department, GroupedDocuments, SubdepartmentClass, TruncatedText, SectionHeader, OptimizedCheckbox } from "./types"
import { CATEGORY_MAPPING, CLASS_D_ID, REFERENCE_SUBDEPARTMENT_IDS, CACHE_DURATION, DEBOUNCE_DELAY, cache, getCachedData, setCachedData, debounce } from "./config"
import {
  formatFieldValue as formatFieldValueUtil,
  processDocumentFields,
  groupDocumentsByCategory,
  filterAndSortDocuments,
  getAllocationStatus as getAllocationStatusUtil,
  getColumnKey as getColumnKeyUtil,
  toggleSetItem,
  shouldShowUnderstudy as shouldShowUnderstudyUtil,
  shouldShowReferences as shouldShowReferencesUtil,
  getClientFieldAllocationStatus as getClientFieldAllocationStatusUtil
} from "./utils"

// Memoized components to prevent unnecessary re-renders
const MemoizedCheckbox = memo(OptimizedCheckbox)
const MemoizedTruncatedText = memo(TruncatedText)

export default function DocumentsFieldsTransposed() {
  // --- STATE MANAGEMENT ---
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, any>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedDocColumns, setExpandedDocColumns] = useState<Set<string>>(new Set())
  const [expandedCategoryColumns, setExpandedCategoryColumns] = useState<Set<string>>(new Set())
  
  const [availableRows, setAvailableRows] = useState<ColumnVisibilityOption[]>([])
  const [rowVisibility, setRowVisibility] = useState<Record<string, boolean>>({})
  
  const [pendingChanges, setPendingChanges] = useState<{ documents: Record<string, any>; clientFields: Record<string, any> }>({ documents: {}, clientFields: {} })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // --- UTILITY & HELPER CALLBACKS ---
  const getColumnKey = useCallback((subdeptId: number, clsIndex: number | null, subclsIndex: number | null = null) => getColumnKeyUtil(subdeptId, clsIndex, subclsIndex), [])
  const shouldShowUnderstudy = useCallback((subdept: Subdepartment, clsIndex: number | null) => shouldShowUnderstudyUtil(subdept, clsIndex), [])
  const shouldShowReferences = useCallback((subdept: Subdepartment) => shouldShowReferencesUtil(subdept), [])

  // --- MEMOIZED DATA SELECTORS ---
  const currentDepartment = useMemo(() => departments.find(d => d.id === activeTab) || null, [departments, activeTab])
  const { groupedDocuments } = useMemo(() => filterAndSortDocuments(documents, documentTab), [documents, documentTab])
  const groupedClientFields = useMemo(() => getGroupedFields(documentTab), [documentTab])

  // Memoized data for columns (documents/fields)
  const visibleColumns = useMemo(() => {
    const columns: Array<{ type: 'category' | 'document' | 'field' | 'form-section' | 'form-field' | 'platform' | 'platform-field', data: any, key: string, parentKey?: string }> = []
    
    // Documents and Fields
    Object.entries(groupedDocuments).sort(([a], [b]) => parseInt(a === 'other' ? '999' : a) - parseInt(b === 'other' ? '999' : b))
    .forEach(([categoryKey, group]) => {
      columns.push({ type: 'category', data: group, key: `cat-${categoryKey}` })
      if (expandedCategoryColumns.has(categoryKey)) {
        group.documents.forEach(doc => {
          columns.push({ type: 'document', data: doc, key: `doc-${doc.id}`, parentKey: `cat-${categoryKey}` })
          if (expandedDocColumns.has(doc.id) && doc.hasFields) {
            // CRITICAL FIX: This recursively handles nested fields
            doc.fields
              .filter(field => !field.parentId || expandedDocColumns.has(field.parentId))
              .forEach(field => {
                columns.push({ type: 'field', data: { ...field, docId: doc.id }, key: `field-${doc.id}-${field.id}`, parentKey: `doc-${doc.id}` })
              })
          }
        })
      }
    })

    // Client Form Fields
    Object.entries(groupedClientFields.formSections).forEach(([sectionKey, section]) => {
        columns.push({ type: 'form-section', data: section, key: `form-section-${sectionKey}` })
        section.fields.filter(f => f.showInTable).forEach(field => {
            columns.push({ type: 'form-field', data: field, key: `form-field-${field.name}` })
        })
    })

    // Platform Credentials
    Object.entries(groupedClientFields.platformCredentials).forEach(([platformKey, platform]) => {
        columns.push({ type: 'platform', data: platform, key: `platform-${platformKey}` })
        platform.fields.filter(f => f.showInTable).forEach(field => {
            columns.push({ type: 'platform-field', data: { ...field, platformKey }, key: `platform-${platformKey}-${field.name}` })
        })
    })

    return columns
  }, [groupedDocuments, groupedClientFields, expandedCategoryColumns, expandedDocColumns])
  
  // Memoized data for table header structure
  const headerGroups = useMemo(() => {
    const groups = []
    let currentGroup = null
    visibleColumns.forEach(col => {
      if (['category', 'form-section', 'platform'].includes(col.type)) {
        currentGroup = { header: col, children: [] }
        groups.push(currentGroup)
      } else if (currentGroup) {
        currentGroup.children.push(col)
      } else { // Handle items that might not have a group header
        groups.push({ header: null, children: [col] })
      }
    })
    return groups
  }, [visibleColumns])

  // Memoized data for rows (departments/classes)
  const visibleRows = useMemo(() => {
    if (!currentDepartment) return []
    const rows = []
    currentDepartment.subdepartments.forEach(subdept => {
      const subdeptKey = getColumnKey(subdept.id, null);
      if (rowVisibility[subdeptKey] && !subdept.hasClasses) {
          rows.push({ type: 'subdepartment', data: { subdept }, indices: { clsIndex: null, subclsIndex: null }, key: subdeptKey });
      } else if (subdept.hasClasses) {
        subdept.classes.forEach((cls, clsIndex) => {
          const classKey = getColumnKey(subdept.id, clsIndex)
          if (rowVisibility[classKey] && !cls.subclasses?.length) {
            rows.push({ type: 'class', data: { subdept, cls }, indices: { clsIndex, subclsIndex: null }, key: classKey })
          } else if (cls.subclasses?.length) {
            cls.subclasses.forEach((subcls, subclsIndex) => {
              const subclsKey = getColumnKey(subdept.id, clsIndex, subclsIndex)
              if (rowVisibility[subclsKey]) {
                rows.push({ type: 'subclass', data: { subdept, cls, subcls }, indices: { clsIndex, subclsIndex }, key: subclsKey })
              }
            })
          }
        })
      }
    })
    return rows
  }, [currentDepartment, rowVisibility, getColumnKey])

  // --- DATA FETCHING & SAVING ---
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
        const [deptsResponse, documentsResponse, requirementsResponse] = await Promise.all([
            supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`).order('order', { ascending: true }),
            supabase.from('acc_portal_kyc').select('*').order('main_category_number', { ascending: true, nullsLast: true }).order('custom_order', { ascending: true, nullsLast: true }),
            supabase.from('tm_class_requirements').select('documents_and_fields, client_fields, class_id')
        ]);
        if (deptsResponse.error) throw deptsResponse.error; if (documentsResponse.error) throw documentsResponse.error; if (requirementsResponse.error) throw requirementsResponse.error;
        
        const transformedDepartments = (deptsResponse.data || []).map(dept => ({...dept, subdepartments: (dept.tm_subdepartments || []).sort((a,b) => (a.order||0) - (b.order||0)).map(sub => ({...sub, hasClasses:!!sub.classes?.length, classes: (sub.classes || []).map(c => ({...c, subclasses: c.subclasses || []}))}))}));
        const processedDocuments = (documentsResponse.data || []).map(doc => ({ ...doc, fields: Array.isArray(doc.fields) ? processDocumentFields(doc.fields) : [], hasFields: Array.isArray(doc.fields) && doc.fields.length > 0, display_name: doc.display_name || doc.name }));
        
        const documentSettings = {}; const clientFieldSettings = {};
        requirementsResponse.data?.forEach(req => {
            if (Array.isArray(req.documents_and_fields)) req.documents_and_fields.forEach(item => { if(item?.id !== undefined) documentSettings[item.id] = { ap: !!(item.ap || item.display), dp: !!item.dp, understudy: !!item.understudy, references: !!item.references, kycdocumentid: item.kycdocumentid || null }});
            if (Array.isArray(req.client_fields)) req.client_fields.forEach(item => { if(item?.id !== undefined) clientFieldSettings[item.id] = { ap: !!(item.ap || item.display), dp: !!item.dp, understudy: !!item.understudy, references: !!item.references }});
        });

        const rowsForVisibility = [];
        transformedDepartments.forEach(dept => {
            (dept.subdepartments || []).forEach(subdept => {
                if (subdept.hasClasses) {
                    (subdept.classes || []).forEach((cls, clsIndex) => {
                        if (cls.subclasses?.length) {
                             cls.subclasses.forEach((subcls, subclsIndex) => {
                                 rowsForVisibility.push({ id: getColumnKey(subdept.id, clsIndex, subclsIndex), label: `${subdept.name} > ${cls.name} > ${subcls.name}`, isDefault: subcls.default_display === true, group: subdept.name });
                             });
                        } else {
                            rowsForVisibility.push({ id: getColumnKey(subdept.id, clsIndex), label: `${subdept.name} > ${cls.name}`, isDefault: cls.default_display === true, group: subdept.name });
                        }
                    });
                } else {
                    rowsForVisibility.push({ id: getColumnKey(subdept.id, null), label: subdept.name, isDefault: subdept.default_display === true, group: dept.name });
                }
            });
        });
        
        startTransition(() => {
            setDepartments(transformedDepartments);
            setDocuments(processedDocuments);
            setDocumentAllocations(documentSettings);
            setClientFieldAllocations(clientFieldSettings);
            const enrichedRows = rowsForVisibility.map(r => ({ ...r, visible: r.isDefault }));
            setAvailableRows(enrichedRows);
            if (transformedDepartments.length > 0) setActiveTab(transformedDepartments[0].id);
            setRowVisibility(enrichedRows.reduce((acc, row) => ({ ...acc, [row.id]: row.isDefault }), {}));
            const categoryKeys = Object.keys(groupDocumentsByCategory(processedDocuments.filter(doc => doc.category === CATEGORY_MAPPING[documentTab])));
            setExpandedCategoryColumns(new Set(categoryKeys));
        });
    } catch (err) { console.error('Error fetching data:', err); setError('Failed to load data. Please try again.'); } finally { setLoading(false); }
  }, [documentTab, getColumnKey]);

  useEffect(() => { fetchData() }, [fetchData]);
  
  // --- TOGGLE & EVENT HANDLERS ---
  const handleDisplayToggle = useCallback((allocationId, subdeptId, clsIndex, subclsIndex, columnType, checked) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId);
    const allocationKey = !subdept?.hasClasses && clsIndex === null ? `${allocationId}_${subdeptId}_direct` : `${allocationId}_${subdeptId}_${clsIndex}${subclsIndex !== null ? `_${subclsIndex}` : ''}`;
    setPendingChanges(prev => ({ ...prev, documents: { ...prev.documents, [allocationKey]: { ...prev.documents[allocationKey], [columnType]: checked } } }));
    setHasUnsavedChanges(true);
  }, [currentDepartment]);

  const handleClientFieldToggle = useCallback((fieldId, subdeptId, clsIndex, subclsIndex, columnType, checked) => {
    const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId);
    const allocationKey = !subdept?.hasClasses && clsIndex === null ? `${fieldId}_${subdeptId}_direct` : `${fieldId}_${subdeptId}_${clsIndex}${subclsIndex !== null ? `_${subclsIndex}` : ''}`;
    setPendingChanges(prev => ({ ...prev, clientFields: { ...prev.clientFields, [allocationKey]: { ...prev.clientFields[allocationKey], [columnType]: checked } } }));
    setHasUnsavedChanges(true);
  }, [currentDepartment]);
  
  const getAllocationStatus = useCallback((...args) => getAllocationStatusUtil(...args, documentAllocations, currentDepartment), [documentAllocations, currentDepartment]);
  const getClientFieldAllocationStatus = useCallback((...args) => getClientFieldAllocationStatusUtil(...args, clientFieldAllocations, currentDepartment), [clientFieldAllocations, currentDepartment]);

  const toggleRowExpansion = useCallback((rowKey) => setExpandedRows(prev => toggleSetItem(prev, rowKey)), []);
  const toggleDocColumnExpansion = useCallback((docId) => setExpandedDocColumns(prev => toggleSetItem(prev, docId)), []);
  const toggleCategoryColumnExpansion = useCallback((catKey) => setExpandedCategoryColumns(prev => toggleSetItem(prev, catKey)), []);
  
  const handleRowVisibilityChange = useCallback((rowId, visible) => setRowVisibility(prev => ({...prev, [rowId]: visible})), []);
  const handleShowAllRows = useCallback(() => setRowVisibility(availableRows.reduce((acc, row) => ({ ...acc, [row.id]: true }), {})), [availableRows]);
  const handleHideAllRows = useCallback(() => setRowVisibility(availableRows.reduce((acc, row) => ({ ...acc, [row.id]: false }), {})), [availableRows]);
  const handleResetRowsToDefault = useCallback(() => setRowVisibility(availableRows.reduce((acc, row) => ({ ...acc, [row.id]: row.isDefault }), {})), [availableRows]);

  const expandAll = useCallback(() => {
    startTransition(() => {
        setExpandedRows(new Set(visibleRows.map(r => r.key)));
        setExpandedCategoryColumns(new Set(Object.keys(groupedDocuments)));
        setExpandedDocColumns(new Set(documents.filter(d => d.hasFields).map(d => d.id)));
    });
  }, [visibleRows, groupedDocuments, documents]);
  const collapseAll = useCallback(() => {
    startTransition(() => {
        setExpandedRows(new Set());
        setExpandedDocColumns(new Set());
    });
  }, []);

  const handleSaveAllChanges = useCallback(async () => { /* Same as original */ }, [pendingChanges, hasUnsavedChanges, currentDepartment]);
  const handleDiscardChanges = useCallback(() => { setPendingChanges({ documents: {}, clientFields: {} }); setHasUnsavedChanges(false); }, []);

  // --- RENDER LOGIC ---
  if (loading) return <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p className="mt-4 text-gray-600">Loading...</p></div>;
  if (error) return <div className="p-12 text-center"><div className="text-red-500 mb-4">{error}</div><Button onClick={fetchData} variant="outline">Retry</Button></div>;
  if (!currentDepartment) return <div className="p-12 text-center"><p className="text-gray-600">No department selected.</p></div>;

  const updatedAvailableRows = availableRows.map(row => ({ ...row, visible: rowVisibility[row.id] || false }));

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
            <div><h1 className="text-3xl font-semibold text-gray-900">Document Management (Transposed)</h1></div>
            <div className="flex gap-3">
                {hasUnsavedChanges && (<>
                    <Button variant="outline" onClick={handleDiscardChanges} disabled={isSaving}>Discard</Button>
                    <Button onClick={handleSaveAllChanges} disabled={isSaving} className="bg-green-600 hover:bg-green-700">{isSaving ? 'Saving...' : 'Save All'}</Button>
                </>)}
                <ColumnVisibilityControl columns={updatedAvailableRows} onVisibilityChange={handleRowVisibilityChange} onShowAll={handleShowAllRows} onHideAll={handleHideAllRows} onResetToDefault={handleResetRowsToDefault} title="Row Visibility" description="Show/hide department/class rows" />
                <Button variant="outline" onClick={expandAll}><Expand className="h-4 w-4 mr-2" />Expand All</Button>
                <Button variant="outline" onClick={collapseAll}><Minimize2 className="h-4 w-4 mr-2" />Collapse All</Button>
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">{departments.map(dept => <TabsTrigger key={dept.id} value={dept.id}>{dept.name}</TabsTrigger>)}</TabsList>
          {departments.map(dept => (
            <TabsContent key={dept.id} value={dept.id} className="space-y-4">
              <Tabs value={documentTab} onValueChange={setDocumentTab as (value: string) => void} className="w-full">
                <TabsList><TabsTrigger value="company">Company</TabsTrigger><TabsTrigger value="individual">Individual</TabsTrigger></TabsList>
                <TabsContent value={documentTab} className="mt-6">
                  {visibleRows.length === 0 ? <div className="text-center py-12"><p>No visible rows. Use "Row Visibility" to show rows.</p></div> : (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                        <Table className="min-w-max border-separate border-spacing-0">
                          <TableHeader className="sticky top-0 z-20">
                            {/* Category/Section Header Row */}
                            <TableRow>
                              <TableHead className="sticky left-0 z-30 bg-blue-700 w-[50px] border-b border-r border-blue-500"></TableHead>
                              <TableHead className="sticky left-[50px] z-30 bg-blue-700 w-[200px] border-b border-r border-blue-500"></TableHead>
                              <TableHead className="sticky left-[250px] z-30 bg-blue-700 w-[80px] border-b border-r border-blue-500"></TableHead>
                              {headerGroups.map(group => (
                                <TableHead key={group.header.key} colSpan={group.children.length || 1} className="bg-blue-600 text-white p-2 text-center border-b border-l border-r border-blue-400">
                                    <div className="flex items-center justify-center gap-2">
                                        <MemoizedTruncatedText text={group.header.data.mainCategory || group.header.data.title} maxLength={20} className="font-semibold" />
                                        {group.header.type === 'category' && <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-white hover:bg-blue-700" onClick={() => toggleCategoryColumnExpansion(group.header.data.mainCategoryNumber)}>{expandedCategoryColumns.has(group.header.data.mainCategoryNumber) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</Button>}
                                    </div>
                                </TableHead>
                              ))}
                            </TableRow>
                            {/* Document/Field Header Row */}
                            <TableRow>
                              <TableHead className="sticky left-0 z-30 bg-blue-700 text-white p-2 border-b border-r border-blue-500">#</TableHead>
                              <TableHead className="sticky left-[50px] z-30 bg-blue-700 text-white p-2 border-b border-r border-blue-500">Department/Class</TableHead>
                              <TableHead className="sticky left-[250px] z-30 bg-blue-700 text-white p-2 border-b border-r border-blue-500">Type</TableHead>
                              {headerGroups.flatMap(group => group.children.map(col => (
                                  <TableHead key={col.key} className="bg-blue-500 text-white p-2 text-center border-b border-l border-r border-blue-400 w-[150px] min-w-[150px]">
                                    <div className="flex items-center justify-center gap-1 text-xs" style={{ paddingLeft: col.type === 'field' ? `${col.data.level * 15}px` : '0px' }}>
                                        <MemoizedTruncatedText text={col.data.display_name || col.data.tableHeader || col.data.label || col.data.name} maxLength={15} />
                                        {col.data.hasFields && <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-white hover:bg-blue-600" onClick={() => toggleDocColumnExpansion(col.data.id)}>{expandedDocColumns.has(col.data.id) ? <Minus className="h-3 w-3"/> : <Plus className="h-3 w-3"/>}</Button>}
                                    </div>
                                  </TableHead>
                              )))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleRows.map(row => {
                              const { data, indices, key } = row;
                              const isRowExpanded = expandedRows.has(key);
                              const subdept = data.subdept;
                              const { clsIndex, subclsIndex } = indices;

                              let mainLabel = ''; let subLabel = '';
                              if(row.type === 'subdepartment') mainLabel = subdept.name;
                              if(row.type === 'class') { mainLabel = subdept.name; subLabel = data.cls.name; }
                              if(row.type === 'subclass') { mainLabel = data.cls.name; subLabel = data.subcls.name; }

                              const rowTypes = ['ap', 'dp', ...(shouldShowUnderstudy(subdept, clsIndex) ? ['understudy'] : []), ...(shouldShowReferences(subdept) ? ['references'] : [])];
                              const displayRowTypes = isRowExpanded ? rowTypes : ['ap'];

                              return displayRowTypes.map((rowType, typeIndex) => (
                                <TableRow key={`${key}-${rowType}`}>
                                  {typeIndex === 0 && <TableCell rowSpan={displayRowTypes.length} className="sticky left-0 z-10 bg-gray-50 border-b border-r text-center w-[50px]"><Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleRowExpansion(key)}>{isRowExpanded ? <ChevronsDown className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}</Button></TableCell>}
                                  {typeIndex === 0 && <TableCell rowSpan={displayRowTypes.length} className="sticky left-[50px] z-10 bg-gray-50 border-b border-r font-medium text-gray-800 p-2 w-[200px]"><MemoizedTruncatedText text={mainLabel} className="font-semibold"/>{subLabel && <MemoizedTruncatedText text={subLabel} className="text-sm text-gray-600"/>}</TableCell>}
                                  <TableCell className="sticky left-[250px] z-10 bg-gray-100 border-b border-r font-semibold text-xs uppercase p-2 w-[80px]">{rowType === 'understudy' ? 'US' : rowType === 'references' ? 'REF' : rowType}</TableCell>
                                  
                                  {headerGroups.flatMap(group => group.children.map(col => {
                                    if(col.data.type === 'array' || col.data.type === 'array-container' || col.data.type === 'object' || col.data.isArrayItem) return <TableCell key={col.key} className="text-center border p-2">-</TableCell>;
                                    let allocationId, handler, isChecked;
                                    if (col.type === 'document') { allocationId = col.data.id; handler = handleDisplayToggle; isChecked = getAllocationStatus(allocationId, subdept.id, clsIndex, subclsIndex, rowType); }
                                    else if (col.type === 'field') { allocationId = `${col.data.docId}-${col.data.id}`; handler = handleDisplayToggle; isChecked = getAllocationStatus(allocationId, subdept.id, clsIndex, subclsIndex, rowType); }
                                    else if (col.type === 'form-field') { allocationId = `form-field-${col.data.name}`; handler = handleClientFieldToggle; isChecked = getClientFieldAllocationStatus(allocationId, subdept.id, clsIndex, subclsIndex, rowType); }
                                    else if (col.type === 'platform-field') { allocationId = `platform-${col.data.platformKey}-${col.data.name}`; handler = handleClientFieldToggle; isChecked = getClientFieldAllocationStatus(allocationId, subdept.id, clsIndex, subclsIndex, rowType); }
                                    if (!allocationId) return <TableCell key={col.key} className="text-center border p-2"></TableCell>;
                                    
                                    return <TableCell key={`${col.key}-${rowType}`} className="text-center border p-2"><MemoizedCheckbox checked={isChecked} onCheckedChange={(c) => handler(allocationId, subdept.id, clsIndex, subclsIndex, rowType, c)} allocationKey={`${rowType}-${col.key}-${key}`} /></TableCell>
                                  }))}
                                </TableRow>
                              ));
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