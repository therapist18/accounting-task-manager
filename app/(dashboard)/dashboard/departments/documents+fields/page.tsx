// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Minus, Expand, Minimize2, Info } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

// Memoized TruncatedText component to prevent unnecessary re-renders
const TruncatedText = memo(({ text, maxLength = 30, className = '' }: { text: string, maxLength?: number, className?: string }) => {
  if (!text) return null;
  const truncated = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;

  return text.length > maxLength ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('cursor-help', className)}>{truncated}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px] break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  ) : <span className={className}>{text}</span>;
});
TruncatedText.displayName = 'TruncatedText';

interface DocumentField {
  id: string
  name: string
  type: string
  required?: boolean
  order?: number
  level: number
  parentId: string | null
  isArrayItem: boolean
  hasChildren: boolean
  fields?: DocumentField[]
  path?: string
  index?: number
  parentPath?: string | null
  arrayConfig?: {
    maxItems?: number
    fields?: any[]
  }
  mapping?: any
}

interface DocumentType {
  id: string
  name: string
  display_name: string
  department: string
  category: string
  main_category: string
  main_category_number: string
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

interface GroupedDocuments {
  [key: string]: {
    mainCategory: string;
    mainCategoryNumber: string;
    documents: DocumentType[];
  };
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

// Enhanced function to recursively process document fields with proper hierarchical indexing
const processDocumentFields = (docs: DocumentType[]) => {
  return docs.map((doc, docIndex) => {
    const processField = (
      field: any,
      level = 0,
      parentId: string | null = null,
      parentPath: string | null = null,
      index = 0,
      baseIndex = ""
    ): DocumentField[] => {
      // Generate hierarchical path
      const currentIndex = baseIndex ? `${baseIndex}.${index + 1}` : `${docIndex + 1}.${index + 1}`;
      
      // Check if field has sub-fields (for arrays)
      const subFields = field.arrayConfig?.fields || field.fields || [];
      const hasChildren = (field.type === 'array' || field.isArray) && subFields.length > 0;

      const currentField: DocumentField = {
        ...field,
        id: field.id || `${doc.id}-${field.name}-${currentIndex}`,
        level,
        parentId,
        hasChildren,
        isArrayItem: false,
        path: currentIndex,
        index: index + 1,
        parentPath,
        required: field.required || false,
        order: field.order || index
      };

      const result: DocumentField[] = [currentField];

      // If this is an array field with children, process them only if expanded
      if (hasChildren) {
        // Process each sub-field within the array
        subFields.forEach((subField: any, subIndex: number) => {
          const subFieldResults = processField(
            subField, 
            level + 1, 
            currentField.id, 
            currentIndex, 
            subIndex,
            `${currentIndex}`
          );
          result.push(...subFieldResults);
        });
      }

      return result;
    };

    // Process all fields for this document
    const processedFields: DocumentField[] = [];
    (doc.fields || []).forEach((field, index) => {
      const fieldResults = processField(field, 0, doc.id, null, index);
      processedFields.push(...fieldResults);
    });

    return {
      ...doc,
      hasFields: processedFields.length > 0,
      fields: processedFields
    };
  });
};

// Group documents by main category
const groupDocumentsByCategory = (docs: DocumentType[]): GroupedDocuments => {
  return docs.reduce<GroupedDocuments>((acc, doc) => {
    const key = doc.main_category_number || 'other';
    if (!acc[key]) {
      acc[key] = {
        mainCategory: doc.main_category || 'Other',
        mainCategoryNumber: doc.main_category_number || '',
        documents: []
      };
    }
    acc[key].documents.push(doc);
    return acc;
  }, {});
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>("")

  // Memoized filtered documents with stable references and optimized processing
  const { filteredDocuments, groupedDocuments } = useMemo(() => {
    if (!documents.length) return { filteredDocuments: [], groupedDocuments: {} };

    // Filter and sort documents
    const sortedDocs = documents
      .filter(doc => doc.category === CATEGORY_MAPPING[documentTab])
      .sort((a, b) => {
        const aCatNum = parseInt(a.main_category_number || '999', 10);
        const bCatNum = parseInt(b.main_category_number || '999', 10);
        
        if (aCatNum !== bCatNum) return aCatNum - bCatNum;
        if (a.custom_order !== null && b.custom_order !== null) {
          return a.custom_order - b.custom_order;
        }
        if (a.custom_order !== null) return -1;
        if (b.custom_order !== null) return 1;
        return a.document_number - b.document_number;
      });

    // Process fields with optimized field processing
    const processedDocs = processDocumentFields(sortedDocs);
    
    // Group with stable references
    const grouped = groupDocumentsByCategory(processedDocs);
    
    // Convert to a stable structure
    const stableGrouped = Object.entries(grouped).reduce((acc, [key, value]) => {
      acc[key] = {
        ...value,
        documents: [...value.documents] // Ensure new array reference
      };
      return acc;
    }, {} as GroupedDocuments);

    return { 
      filteredDocuments: processedDocs, 
      groupedDocuments: stableGrouped 
    };
  }, [documents, documentTab])

  // Memoized current department with stable reference
  const currentDepartment = useMemo(() =>
    departments.find(d => d.id === activeTab) || null,
    [departments, activeTab]
  )

  // Memoized normalized subdepartments with stable references
  const normalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments?.length) {
      return [{
        id: -1,
        name: 'No Subdepartments',
        department_id: currentDepartment?.id || '',
        hasClasses: false,
        classes: []
      }];
    }
    return currentDepartment.subdepartments.map(dept => ({
      ...dept,
      classes: dept.classes?.map(cls => ({
        ...cls,
        subclasses: cls.subclasses || []
      })) || []
    }));
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
          .order('main_category_number', { ascending: true, nullsLast: true })
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

      // Auto-expand all categories initially
      const categoryKeys = Object.keys(groupDocumentsByCategory(processedDocuments.filter(doc => doc.category === CATEGORY_MAPPING[documentTab])));
      setExpandedCategories(new Set(categoryKeys));
      
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [documentTab])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Optimized expansion toggles with stable references
  const toggleItemExpansion = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);
  
  // Memoized toggle functions for better performance
  const getToggleHandler = useCallback((itemId: string) => 
    () => toggleItemExpansion(itemId),
    [toggleItemExpansion]
  );

  const toggleCategoryExpansion = useCallback((categoryKey: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryKey)) {
        newSet.delete(categoryKey)
      } else {
        newSet.add(categoryKey)
      }
      return newSet
    })
  }, [])

  const expandAll = useCallback(() => {
    const allExpandableIds = new Set<string>();
    const allCategoryKeys = new Set<string>();
    
    Object.keys(groupedDocuments).forEach(key => {
      allCategoryKeys.add(key);
    });
    
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
    
    setExpandedCategories(allCategoryKeys);
    setExpandedItems(allExpandableIds);
  }, [filteredDocuments, groupedDocuments]);

  const collapseAll = useCallback(() => {
    setExpandedItems(new Set())
    setExpandedCategories(new Set())
  }, [])

  // Memoized display toggle handler with stable reference
  const handleDisplayToggle = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null,
    checked: boolean
  ) => {
    const keyParts = [allocationId, subdeptId];
    if (classIndex !== null) keyParts.push(String(classIndex));
    if (subclassIndex !== null) keyParts.push(String(subclassIndex));
    const allocationKey = keyParts.join('-')

    setDocumentAllocations(prev => ({
      ...prev,
      [allocationKey]: checked
    }));

    // Debounce or batch these toasts in a real app
    toast({
      title: "Configuration updated",
      description: `Display setting changed for allocation key: ${allocationKey}`,
    });
  }, []);

  // Memoized checkbox change handler factory
  const getCheckboxChangeHandler = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null = null,
    subclassIndex: number | null = null
  ) => (checked: boolean) => {
    handleDisplayToggle(allocationId, subdeptId, classIndex, subclassIndex, checked);
  }, [handleDisplayToggle]);

  // Memoized allocation status checker with stable reference
  const getAllocationStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null
  ) => {
    const keyParts = [allocationId, subdeptId];
    if (classIndex !== null) keyParts.push(String(classIndex));
    if (subclassIndex !== null) keyParts.push(String(subclassIndex));
    const allocationKey = keyParts.join('-')

    return documentAllocations[allocationKey] || false;
  }, [documentAllocations]);

  // Memoized checkbox status getter factory
  const getCheckboxStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null = null,
    subclassIndex: number | null = null
  ) => {
    return getAllocationStatus(allocationId, subdeptId, classIndex, subclassIndex);
  }, [getAllocationStatus]);

  // Memoized calculation for column spans
  const getTotalColSpan = useCallback((subdept: Subdepartment) => {
    if (!subdept.hasClasses) return 1;
    
    const colSpan = subdept.classes?.reduce((total, cls) => {
      return total + (cls.subclasses?.length || 1);
    }, 0) || 1;
    
    return Math.max(1, colSpan);
  }, [])

  // Memoized helper function to determine if a field should show checkboxes
  const shouldShowCheckbox = useCallback((field: DocumentField) => {
    return field.type !== 'array' && 
           field.type !== 'array-container' && 
           !field.isArrayItem &&
           field.type !== 'object';
  }, [])

  // Early returns for loading/error states
  if (loading) return <div className="p-12 text-center">Loading...</div>;
  if (error) return <div className="p-12 text-center text-red-500">{error}</div>;
  if (!currentDepartment) return <div className="p-12 text-center">No department selected.</div>;

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Document Management</h1>
            <p className="text-gray-600 mt-1">Manage document types and allocations</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={expandAll}><Expand className="h-4 w-4 mr-2" />Expand All</Button>
            <Button variant="outline" onClick={collapseAll}><Minimize2 className="h-4 w-4 mr-2" />Collapse All</Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            {departments.map(dept => (
              <TabsTrigger key={dept.id} value={dept.id}>{dept.name}</TabsTrigger>
            ))}
          </TabsList>

          {departments.map(dept => (
            <TabsContent key={dept.id} value={dept.id} className="space-y-4">
              <Tabs value={documentTab} onValueChange={setDocumentTab as (value: string) => void} className="w-full">
                <TabsList>
                  <TabsTrigger value="company">Company Documents</TabsTrigger>
                  <TabsTrigger value="individual">Individual Documents</TabsTrigger>
                </TabsList>

                <TabsContent value={documentTab} className="mt-6">
                  {Object.keys(groupedDocuments).length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border">No documents found.</div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                        <TooltipProvider>
                          <Table className="min-w-max">
                            <TableHeader className="sticky top-0 bg-blue-600 z-10">
                              {/* Main Subdepartment Header */}
                              <TableRow>
                                <TableHead rowSpan={4} className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center">#</TableHead>
                                <TableHead rowSpan={4} className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white">
                                  <div className="flex items-center justify-between px-4">
                                    <span className="truncate">Document / Field Details</span>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-gray-200 flex-shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[300px]">
                                        <p>Hover over truncated text to see full content. Click + to expand array fields.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TableHead>
                                {normalizedSubdepartments.map((subdept, subIndex) => {
                                  const colSpan = getTotalColSpan(subdept);
                                  const width = colSpan * 120; // 120px per column
                                  return (
                                    <TableHead
                                      key={`subdept-header-${subdept.id}`}
                                      colSpan={colSpan}
                                      style={{ width: `${width}px` }}
                                      className={cn("border-r border-blue-400 px-2 text-center font-semibold text-white", subIndex % 2 === 0 ? "bg-blue-700" : "bg-blue-600")}
                                    >
                                      <div className="flex items-center justify-center">
                                        <TruncatedText
                                          text={subdept.name}
                                          className="font-semibold text-white"
                                          maxLength={15}
                                        />
                                      </div>
                                    </TableHead>
                                  );
                                })}
                              </TableRow>

                              {/* Class Header Row */}
                              <TableRow>
                                {normalizedSubdepartments.map((subdept, subIndex) =>
                                  subdept.hasClasses ? subdept.classes?.map((cls, clsIndex) => {
                                    const colSpan = cls.subclasses?.length || 1;
                                    const width = colSpan * 120; // 120px per column
                                    return (
                                      <TableHead
                                        key={`class-header-${subdept.id}-${clsIndex}`}
                                        colSpan={colSpan}
                                        style={{ width: `${width}px` }}
                                        className={cn("border-r border-blue-400 px-2 text-center text-white text-sm", subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500")}
                                      >
                                        <div className="flex items-center justify-center">
                                          <TruncatedText
                                            text={cls.name}
                                            className="text-sm text-white"
                                            maxLength={15}
                                          />
                                        </div>
                                      </TableHead>
                                    );
                                  }) : (
                                    <TableHead
                                      key={`subdept-direct-${subdept.id}`}
                                      style={{ width: '120px' }}
                                      className={cn("border-r border-blue-400 text-center text-white text-sm", subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500")}
                                    >
                                      -
                                    </TableHead>
                                  )
                                )}
                              </TableRow>

                              {/* Subclass Header Row */}
                              <TableRow>
                                {normalizedSubdepartments.map((subdept, subIndex) =>
                                  subdept.hasClasses ? subdept.classes?.flatMap((cls, clsIndex) =>
                                    cls.subclasses?.length ? cls.subclasses.map((subcls, subclsIndex) => (
                                      <TableHead
                                        key={`subclass-header-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                        style={{ width: '120px' }}
                                        className={cn("border-r border-blue-400 px-2 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}
                                      >
                                        <div className="flex items-center justify-center">
                                          <TruncatedText
                                            text={subcls.name}
                                            className="text-xs text-white"
                                            maxLength={10}
                                          />
                                        </div>
                                      </TableHead>
                                    )) : (
                                      <TableHead
                                        key={`class-direct-${subdept.id}-${clsIndex}`}
                                        style={{ width: '120px' }}
                                        className={cn("border-r border-blue-400 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}
                                      >
                                        -
                                      </TableHead>
                                    )
                                  ) : (
                                    <TableHead
                                      key={`subdept-main-${subdept.id}`}
                                      style={{ width: '120px' }}
                                      className={cn("border-r border-blue-400 text-center text-white text-xs", subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400")}
                                    >
                                      -
                                    </TableHead>
                                  )
                                )}
                              </TableRow>

                              {/* Display Header Row */}
                              <TableRow>
                                {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                  subdept.hasClasses ? subdept.classes?.flatMap((cls, clsIndex) =>
                                    cls.subclasses?.length ? cls.subclasses.map((_, subclsIndex) => (
                                      <TableHead
                                        key={`d-h-${subdept.id}-${clsIndex}-${subclsIndex}`}
                                        style={{ width: '120px' }}
                                        className="border-r border-blue-400 px-2 text-center text-white text-xs bg-blue-300"
                                      >
                                        <div className="flex items-center justify-center">
                                          <span className="truncate">Display</span>
                                        </div>
                                      </TableHead>
                                    )) : (
                                      <TableHead
                                        key={`d-h-${subdept.id}-${clsIndex}`}
                                        style={{ width: '120px' }}
                                        className="border-r border-blue-400 text-center text-white text-xs bg-blue-300"
                                      >
                                        Display
                                      </TableHead>
                                    )
                                  ) : (
                                    <TableHead
                                      key={`d-h-${subdept.id}`}
                                      style={{ width: '120px' }}
                                      className="border-r border-blue-400 text-center text-white text-xs bg-blue-300"
                                    >
                                      Display
                                    </TableHead>
                                  )
                                )}
                              </TableRow>
                            </TableHeader>

                            <TableBody>
                              {Object.entries(groupedDocuments)
                                .sort(([a], [b]) => {
                                  const aNum = parseInt(a === 'other' ? '999' : a, 10);
                                  const bNum = parseInt(b === 'other' ? '999' : b, 10);
                                  return aNum - bNum;
                                })
                                .map(([categoryKey, group]) => {
                                  const isCategoryExpanded = expandedCategories.has(categoryKey);
                                  
                                  return [
                                    // Category Header Row
                                    <TableRow key={`category-${categoryKey}`} className="bg-blue-50 hover:bg-blue-50/80 transition-colors cursor-pointer" onClick={() => toggleCategoryExpansion(categoryKey)}>
                                      <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700 w-16">
                                        {group.mainCategoryNumber}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] w-[300px]">
                                        <div className="flex items-center justify-between px-4">
                                          <TruncatedText
                                            text={group.mainCategory}
                                            className="font-semibold text-gray-700 flex-1 min-w-0 pr-2"
                                            maxLength={35}
                                          />
                                          <span className="text-xs bg-blue-200 text-gray-700 px-2 py-1 rounded-full mr-2">{group.documents.length}</span>
                                          {isCategoryExpanded ? <Minus className="h-4 w-4 text-gray-600" /> : <Plus className="h-4 w-4 text-gray-600" />}
                                        </div>
                                      </TableCell>
                                      {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                        subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                          (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => (
                                            <TableCell key={`cat-cell-${categoryKey}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border bg-blue-100">
                                              -
                                            </TableCell>
                                          ))
                                        ) : (
                                          <TableCell key={`cat-cell-${categoryKey}-${subdept.id}`} className="text-center border bg-blue-100">
                                            -
                                          </TableCell>
                                        )
                                      )}
                                    </TableRow>,
                                    
                                    // Document Rows (only if category is expanded)
                                    ...(isCategoryExpanded ? group.documents.map((doc, docIndex) => {
                                      const isDocExpanded = expandedItems.has(doc.id);
                                      const allItems = [
                                        { ...doc, isMainRow: true, level: 0 },
                                        ...(isDocExpanded && doc.hasFields ? doc.fields.filter(field => !field.parentId || expandedItems.has(field.parentId)) : [])
                                      ];

                                      return allItems.map((item, itemIndex) => {
                                        if (item.isMainRow) {
                                          // RENDER DOCUMENT ROW
                                          return (
                                            <TableRow key={`doc-${doc.id}`} className="group bg-white hover:bg-gray-50">
                                              <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center font-semibold w-16">
                                                {`${group.mainCategoryNumber}.${docIndex + 1}`}
                                              </TableCell>
                                              <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5] w-[300px]">
                                                <div className="flex items-center justify-between px-4 pl-8">
                                                  <TruncatedText
                                                    text={doc.display_name}
                                                    className="font-semibold text-gray-700 flex-1 min-w-0 pr-2"
                                                    maxLength={30}
                                                  />
                                                  {doc.hasFields && (
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={() => toggleItemExpansion(doc.id)}>
                                                      {isDocExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                    </Button>
                                                  )}
                                                </div>
                                              </TableCell>
                                              {/* Render checkboxes for documents without fields */}
                                              {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                  (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => (
                                                    <TableCell key={`doc-cell-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border">
                                                      {!doc.hasFields && (
                                                        <Checkbox
                                                          checked={getAllocationStatus(doc.id, subdept.id, clsIndex, subcls ? subclsIndex : null)}
                                                          onCheckedChange={c => handleDisplayToggle(doc.id, subdept.id, clsIndex, subcls ? subclsIndex : null, c as boolean)}
                                                        />
                                                      )}
                                                    </TableCell>
                                                  ))
                                                ) : (
                                                  <TableCell key={`doc-cell-${doc.id}-${subdept.id}`} className="text-center border">
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
                                         
                                         // Hide nested fields of a collapsed parent
                                         if (field.parentId && !expandedItems.has(field.parentId)) {
                                           return null;
                                         }

                                         return (
                                           <TableRow key={`field-${field.id}`} className="group bg-blue-25 hover:bg-blue-50">
                                             <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-16 text-center text-sm text-gray-500">
                                               {field.path}
                                             </TableCell>
                                             <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] w-[300px]">
                                               <div className="flex items-center px-4" style={{ paddingLeft: `${(field.level + 2) * 1.25}rem` }}>
                                                 <div className="flex items-center gap-1 flex-1 min-w-0">
                                                   <TruncatedText
                                                     text={field.name}
                                                     className={cn(
                                                       'text-sm flex-shrink-0', 
                                                       field.type === 'array' ? 'text-gray-600 font-semibold' :
                                                       'text-gray-700'
                                                     )}
                                                     maxLength={field.level > 1 ? 20 : 30}
                                                   />
                                                   {field.type && (
                                                     <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                                       ({field.type})
                                                       {field.required && <span className="text-red-500 ml-1">*</span>}
                                                     </span>
                                                   )}
                                                 </div>
                                                 {field.hasChildren && field.type === 'array' && (
                                                   <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={() => toggleItemExpansion(field.id)}>
                                                     {isFieldExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                   </Button>
                                                 )}
                                               </div>
                                             </TableCell>
                                             {/* Render checkboxes for appropriate field types */}
                                             {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                               subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                 (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => (
                                                   <TableCell key={`field-cell-${field.id}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border">
                                                     {shouldShowCheckbox(field) && (
                                                       <Checkbox
                                                         checked={getAllocationStatus(`${doc.id}-${field.id}`, subdept.id, clsIndex, subcls ? subclsIndex : null)}
                                                         onCheckedChange={c => handleDisplayToggle(`${doc.id}-${field.id}`, subdept.id, clsIndex, subcls ? subclsIndex : null, c as boolean)}
                                                       />
                                                     )}
                                                   </TableCell>
                                                 ))
                                               ) : (
                                                 <TableCell key={`field-cell-${field.id}-${subdept.id}`} className="text-center border">
                                                   {shouldShowCheckbox(field) && (
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
                                   }) : [])
                                 ].flat();
                               })}
                           </TableBody>
                         </Table>
                       </TooltipProvider>
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