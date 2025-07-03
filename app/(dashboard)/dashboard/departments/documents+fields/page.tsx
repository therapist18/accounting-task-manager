// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo } from "react"
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

// Memoized TruncatedText component
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

// Memoized SectionHeader component
const SectionHeader = memo(({ title, icon: Icon, count }: { title: string, icon: React.ElementType, count: number }) => (
  <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
    <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700 w-16">
      <Icon className="h-4 w-4 mx-auto" />
    </TableCell>
    <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] w-[300px]">
      <div className="flex items-center gap-2 px-4 py-2">
        <Icon className="h-5 w-5 text-slate-600" />
        <span className="font-bold text-slate-700 text-lg">{title}</span>
        <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">{count}</span>
      </div>
    </TableCell>
    <TableCell colSpan={100} className="bg-gradient-to-r from-slate-100 to-slate-50 border-r">
      <div className="h-px bg-slate-300 w-full"></div>
    </TableCell>
  </TableRow>
));
SectionHeader.displayName = 'SectionHeader';

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
  hasFields?: boolean
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

// Enhanced ClientData interface to include all form fields
interface ClientData {
  id: string
  name: string
  email: string
  company?: string
  status: string
  created_at: string
  // Company fields
  company_name?: string
  company_prefix?: string
  company_type?: string
  registration_number?: string
  office_phone_number?: string
  current_communication_email?: string
  country?: string
  city?: string
  road_name?: string
  website?: string
  industry?: string
  // Individual fields  
  first_name?: string
  middle_name?: string
  last_name?: string
  national_id?: string
  phone_number?: string
  occupation?: string
  // Platform credentials
  kra_pin?: string
  nssf_id?: string
  nhif_id?: string
  // Add other fields as needed based on your form structure
  [key: string]: any // For dynamic field access
}

const CATEGORY_MAPPING = {
  company: "company-docs",
  individual: "directors-docs"
} as const

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [clientData, setClientData] = useState<ClientData[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedClientItems, setExpandedClientItems] = useState<Set<string>>(new Set())
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set())

  const processDocumentFields = useCallback((docs: DocumentType[]) => {
    return docs.map((doc, docIndex) => {
      const processField = (
        field: any,
        level = 0,
        parentId: string | null = null,
        parentPath: string | null = null,
        index = 0,
        baseIndex = ""
      ): DocumentField[] => {
        const currentIndex = baseIndex ? `${baseIndex}.${index + 1}` : `${docIndex + 1}.${index + 1}`;
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

        if (hasChildren) {
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
  }, []);

  const groupDocumentsByCategory = useCallback((docs: DocumentType[]): GroupedDocuments => {
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
  }, []);

  // Memoized filtered documents
  const { filteredDocuments, groupedDocuments } = useMemo(() => {
    if (!documents.length) return { filteredDocuments: [], groupedDocuments: {} };

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

    const processedDocs = processDocumentFields(sortedDocs);
    const grouped = groupDocumentsByCategory(processedDocs);

    return {
      filteredDocuments: processedDocs,
      groupedDocuments: grouped
    };
  }, [documents, documentTab, processDocumentFields, groupDocumentsByCategory]);

  // Memoized current department
  const currentDepartment = useMemo(() =>
    departments.find(d => d.id === activeTab) || null,
    [departments, activeTab]
  );

  // Memoized normalized subdepartments
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
  }, [currentDepartment]);

  // Get form fields for current document tab
  const clientFormFields = useMemo(() => {
    return getTableFields(documentTab);
  }, [documentTab]);

  // Optimized data fetching with better error handling
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [deptsResponse, documentsResponse, requirementsResponse, clientDataResponse] = await Promise.all([
        supabase
          .from('tm_departments')
          .select(`*, tm_subdepartments (*, classes)`)
          .order('order', { ascending: true }),
        supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true }),
        supabase
          .from('tm_class_requirements')
          .select('documents_and_fields, class_id'),
        // Update this to match your actual client table name and structure
        supabase
          .from('clients') // Replace with your actual client table name
          .select('*')
          .limit(100) // Adjust as needed
      ]);

      // Handle errors
      if (deptsResponse.error) throw deptsResponse.error;
      if (documentsResponse.error) throw documentsResponse.error;
      if (requirementsResponse.error) throw requirementsResponse.error;
      // Note: clientDataResponse might not exist if table doesn't exist, so we'll handle it gracefully

      // Process departments
      const transformedDepartments = (deptsResponse.data || []).map(dept => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || [])
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((subdept: any) => ({
            ...subdept,
            classes: Array.isArray(subdept.classes) ? subdept.classes : [],
            hasClasses: subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0
          }))
      }));

      // Process documents
      const processedDocuments = (documentsResponse.data || []).map(doc => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }));

      // Process requirements
      const settings: Record<string, boolean> = {};
      requirementsResponse.data?.forEach(req => {
        if (Array.isArray(req.documents_and_fields)) {
          req.documents_and_fields.forEach((item: any) => {
            if (item && item.id !== undefined) {
              settings[item.id] = item.display === true;
            }
          });
        }
      });

      // Process client data
      const processedClientData = clientDataResponse?.data || [];

      // Update state
      setDepartments(transformedDepartments);
      setDocuments(processedDocuments);
      setClientData(processedClientData);
      setDocumentAllocations(settings);

      // Set active tab
      if (transformedDepartments.length > 0) {
        setActiveTab(transformedDepartments[0].id);
      }

      // Auto-expand categories
      const categoryKeys = Object.keys(groupDocumentsByCategory(processedDocuments.filter(doc => doc.category === CATEGORY_MAPPING[documentTab])));
      setExpandedCategories(new Set(categoryKeys));

    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [documentTab, groupDocumentsByCategory]);

  // Optimized refresh function for after submission
  const refreshData = useCallback(async () => {
    try {
      const { data: requirementsData, error } = await supabase
        .from('tm_class_requirements')
        .select('documents_and_fields, class_id');

      if (error) throw error;

      const settings: Record<string, boolean> = {};
      requirementsData?.forEach(req => {
        if (Array.isArray(req.documents_and_fields)) {
          req.documents_and_fields.forEach((item: any) => {
            if (item && item.id !== undefined) {
              settings[item.id] = item.display === true;
            }
          });
        }
      });

      setDocumentAllocations(settings);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Optimized toggle functions
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

  const toggleCategoryExpansion = useCallback((categoryKey: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryKey)) {
        newSet.delete(categoryKey);
      } else {
        newSet.add(categoryKey);
      }
      return newSet;
    });
  }, []);

  const toggleClientItemExpansion = useCallback((clientId: string) => {
    setExpandedClientItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allExpandableIds = new Set<string>();
    const allCategoryKeys = new Set<string>();
    const allClientIds = new Set<string>();

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

    clientData.forEach(client => {
      allClientIds.add(client.id);
    });

    setExpandedCategories(allCategoryKeys);
    setExpandedItems(allExpandableIds);
    setExpandedClientItems(allClientIds);
  }, [filteredDocuments, groupedDocuments, clientData]);

  const collapseAll = useCallback(() => {
    setExpandedItems(new Set());
    setExpandedCategories(new Set());
    setExpandedClientItems(new Set());
  }, []);

  // Optimized display toggle with immediate refresh
  const handleDisplayToggle = useCallback(async (
    allocationId: string,
    subdeptId: number,
    classIndex: number,
    subclassIndex: number | null = null,
    checked: boolean = false
  ) => {
    const allocationKey = [
      allocationId,
      subdeptId,
      classIndex,
      ...(subclassIndex !== null ? [subclassIndex] : [])
    ].join('_');

    // Add to submitting set
    setSubmittingIds(prev => new Set(prev).add(allocationKey));

    // Optimistic UI update
    setDocumentAllocations(prev => ({
      ...prev,
      [allocationKey]: checked
    }));

    try {
      const subdept = currentDepartment?.subdepartments?.find(sd => sd.id === subdeptId);
      const classItem = subdept?.classes?.[classIndex];
      
      if (!subdept || !classItem) {
        throw new Error('Could not find class or subdepartment');
      }
      
      const classId = [
        subdeptId,
        classItem.id,
        ...(subclassIndex !== null ? [subclassIndex] : [])
      ].join('_');

      const { data: existingData, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('documents_and_fields')
        .eq('class_id', classId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      const currentFields = Array.isArray(existingData?.documents_and_fields) 
        ? existingData.documents_and_fields 
        : [];
      
      const filteredFields = currentFields.filter((item: any) => item.id !== allocationKey);
      
      const updatedFields = [
        ...filteredFields,
        {
          id: allocationKey,
          display: checked,
          updated_at: new Date().toISOString()
        }
      ];

      const recordData = {
        class_id: classId,
        documents_and_fields: updatedFields,
        type: 'class',
        updated_at: new Date().toISOString()
      };

      if (!existingData) {
        recordData.created_at = new Date().toISOString();
      }

      const { error: upsertError } = await supabase
        .from('tm_class_requirements')
        .upsert(recordData, {
          onConflict: 'class_id'
        });

      if (upsertError) throw upsertError;

      // Refresh data immediately after successful submission
      await refreshData();

      toast({
        title: "Success",
        description: "Display setting updated successfully",
        variant: "default",
      });
    } catch (error) {
      console.error('Error updating display setting:', error);
      
      // Revert on error
      setDocumentAllocations(prev => ({
        ...prev,
        [allocationKey]: !checked
      }));

      toast({
        title: "Error",
        description: "Failed to update display setting",
        variant: "destructive",
      });
    } finally {
      // Remove from submitting set
      setSubmittingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(allocationKey);
        return newSet;
      });
    }
  }, [currentDepartment, refreshData]);

  // Optimized helper functions
  const getAllocationStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null
  ) => {
    const keyParts = [allocationId, subdeptId];
    if (classIndex !== null) keyParts.push(String(classIndex));
    if (subclassIndex !== null) keyParts.push(String(subclassIndex));
    const allocationKey = keyParts.join('_');
    return documentAllocations[allocationKey] || false;
  }, [documentAllocations]);

  const getTotalColSpan = useCallback((subdept: Subdepartment) => {
    if (!subdept.hasClasses) return 1;
    const colSpan = subdept.classes?.reduce((total, cls) => {
      return total + (cls.subclasses?.length || 1);
    }, 0) || 1;
    return Math.max(1, colSpan);
  }, []);

  const shouldShowCheckbox = useCallback((field: DocumentField) => {
    return field.type !== 'array' &&
      field.type !== 'array-container' &&
      !field.isArrayItem &&
      field.type !== 'object';
  }, []);

  const getSubmittingStatus = useCallback((
    allocationId: string,
    subdeptId: number,
    classIndex: number | null,
    subclassIndex: number | null = null
  ) => {
    const keyParts = [allocationId, subdeptId];
    if (classIndex !== null) keyParts.push(String(classIndex));
    if (subclassIndex !== null) keyParts.push(String(subclassIndex));
    const allocationKey = keyParts.join('_');
    return submittingIds.has(allocationKey);
  }, [submittingIds]);

  // Early returns
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
            <Button variant="outline" onClick={expandAll}>
              <Expand className="h-4 w-4 mr-2" />Expand All
            </Button>
            <Button variant="outline" onClick={collapseAll}>
              <Minimize2 className="h-4 w-4 mr-2" />Collapse All
            </Button>
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
                  {Object.keys(groupedDocuments).length === 0 && clientData.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border">No data found.</div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
                        <TooltipProvider>
                          <Table className="min-w-max">
                            <TableHeader className="sticky top-0 bg-blue-600 z-10">
                              {/* Header rows */}
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
                                  const width = colSpan * 120;
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
                                    const width = colSpan * 120;
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
                             {/* Documents & Fields Section */}
                             {Object.keys(groupedDocuments).length > 0 && (
                               <>
                                 <SectionHeader 
                                   title="Documents & Fields" 
                                   icon={FileText} 
                                   count={Object.values(groupedDocuments).reduce((total, group) => total + group.documents.length, 0)} 
                                 />
                                 
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
                                               <TableRow key={`doc-${doc.id}`} className="group bg-blue-50 hover:bg-blue-100">
                                                 <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center font-semibold w-16">
                                                   {`${group.mainCategoryNumber}.${docIndex + 1}`}
                                                 </TableCell>
                                                 <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] w-[300px] pr-2">
                                                   <div className="flex items-center gap-2 px-4">
                                                     <div className="flex items-center justify-between flex-1">
                                                       <TruncatedText
                                                         text={doc.display_name}
                                                         className="font-semibold text-gray-800 flex-1 min-w-0 pr-2"
                                                         maxLength={25}
                                                       />
                                                       {doc.hasFields && (
                                                         <Button
                                                           variant="ghost"
                                                           size="sm"
                                                           className="h-6 w-6 p-0 flex-shrink-0 text-blue-600 hover:bg-blue-200"
                                                           onClick={(e) => {
                                                             e.stopPropagation();
                                                             toggleItemExpansion(doc.id);
                                                           }}
                                                         >
                                                           {isDocExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                         </Button>
                                                       )}
                                                     </div>
                                                   </div>
                                                 </TableCell>
                                                 {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                                   subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                                     (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => {
                                                       const isSubmitting = getSubmittingStatus(doc.id, subdept.id, clsIndex, subcls ? subclsIndex : null);
                                                       return (
                                                         <TableCell key={`doc-cell-${doc.id}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border bg-blue-50 group-hover:bg-blue-100">
                                                           <Checkbox
                                                             checked={getAllocationStatus(doc.id, subdept.id, clsIndex, subcls ? subclsIndex : null)}
                                                             onCheckedChange={c => handleDisplayToggle(doc.id, subdept.id, clsIndex, subcls ? subclsIndex : null, c as boolean)}
                                                             disabled={isSubmitting}
                                                             className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                           />
                                                         </TableCell>
                                                       );
                                                     })
                                                   ) : (
                                                     <TableCell key={`doc-cell-${doc.id}-${subdept.id}`} className="text-center border bg-blue-50 group-hover:bg-blue-100">
                                                       <Checkbox
                                                         checked={getAllocationStatus(doc.id, subdept.id, null, null)}
                                                         onCheckedChange={c => handleDisplayToggle(doc.id, subdept.id, null, null, c as boolean)}
                                                         disabled={getSubmittingStatus(doc.id, subdept.id, null, null)}
                                                         className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                       />
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
                                                     (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => {
                                                       const fieldId = `${doc.id}-${field.id}`;
                                                       const isSubmitting = getSubmittingStatus(fieldId, subdept.id, clsIndex, subcls ? subclsIndex : null);
                                                       return (
                                                         <TableCell key={`field-cell-${field.id}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border">
                                                           {shouldShowCheckbox(field) && (
                                                             <Checkbox
                                                               checked={getAllocationStatus(fieldId, subdept.id, clsIndex, subcls ? subclsIndex : null)}
                                                               onCheckedChange={c => handleDisplayToggle(fieldId, subdept.id, clsIndex, subcls ? subclsIndex : null, c as boolean)}
                                                               disabled={isSubmitting}
                                                               className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                             />
                                                           )}
                                                         </TableCell>
                                                       );
                                                     })
                                                   ) : (
                                                     <TableCell key={`field-cell-${field.id}-${subdept.id}`} className="text-center border">
                                                       {shouldShowCheckbox(field) && (
                                                         <Checkbox
                                                           checked={getAllocationStatus(`${doc.id}-${field.id}`, subdept.id, null, null)}
                                                           onCheckedChange={c => handleDisplayToggle(`${doc.id}-${field.id}`, subdept.id, null, null, c as boolean)}
                                                           disabled={getSubmittingStatus(`${doc.id}-${field.id}`, subdept.id, null, null)}
                                                           className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                               </>
                             )}

                             {/* Separator between sections */}
                             {Object.keys(groupedDocuments).length > 0 && clientData.length > 0 && (
                               <TableRow>
                                 <TableCell colSpan={100} className="p-0">
                                   <Separator className="my-4" />
                                 </TableCell>
                               </TableRow>
                             )}

                             {/* Client Data Section */}
                             {clientData.length > 0 && (
                               <>
                                 <SectionHeader 
                                   title="Data from Clients" 
                                   icon={Users} 
                                   count={clientData.length} 
                                 />
                                 
                                 {clientData.map((client, clientIndex) => {
                                   const isClientExpanded = expandedClientItems.has(client.id);
                                   
                                   return [
                                     // Client Header Row
                                     <TableRow 
                                       key={`client-${client.id}`} 
                                       className="group bg-green-50 hover:bg-green-100 cursor-pointer" 
                                       onClick={() => toggleClientItemExpansion(client.id)}
                                     >
                                       <TableCell className="sticky left-0 bg-green-50 group-hover:bg-green-100 border-r z-[5] text-center font-semibold w-16">
                                         {clientIndex + 1}
                                       </TableCell>
                                       <TableCell className="sticky left-16 bg-green-50 group-hover:bg-green-100 border-r z-[5] w-[300px]">
                                         <div className="flex items-center gap-2 px-4">
                                           <div className="flex items-center justify-between flex-1">
                                             <div className="flex flex-col">
                                               <TruncatedText
                                                 text={client.name || `${client.first_name || ''} ${client.last_name || ''}`.trim()}
                                                 className="font-semibold text-gray-800"
                                                 maxLength={25}
                                               />
                                               <TruncatedText
                                                 text={client.email || client.current_communication_email || client.email_address || ''}
                                                 className="text-sm text-gray-600"
                                                 maxLength={30}
                                               />
                                               {(client.company || client.company_name) && (
                                                 <TruncatedText
                                                   text={client.company || client.company_name || ''}
                                                   className="text-xs text-gray-500"
                                                   maxLength={25}
                                                 />
                                               )}
                                             </div>
                                             <Button
                                               variant="ghost"
                                               size="sm"
                                               className="h-6 w-6 p-0 flex-shrink-0 text-green-600 hover:bg-green-200"
                                               onClick={(e) => {
                                                 e.stopPropagation();
                                                 toggleClientItemExpansion(client.id);
                                               }}
                                             >
                                               {isClientExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                             </Button>
                                           </div>
                                         </div>
                                       </TableCell>
                                       {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                         subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                           (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => (
                                             <TableCell key={`client-cell-${client.id}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border bg-green-50 group-hover:bg-green-100">
                                               <span className="text-xs text-gray-500">{client.status || '-'}</span>
                                             </TableCell>
                                           ))
                                         ) : (
                                           <TableCell key={`client-cell-${client.id}-${subdept.id}`} className="text-center border bg-green-50 group-hover:bg-green-100">
                                             <span className="text-xs text-gray-500">{client.status || '-'}</span>
                                           </TableCell>
                                         )
                                       )}
                                     </TableRow>,

                                     // Client Detail Rows (only if client is expanded)
                                     ...(isClientExpanded ? clientFormFields.map((field, fieldIndex) => {
                                       const fieldValue = client[field.name];
                                       
                                       // Only show rows that have data
                                       if (!fieldValue && fieldValue !== 0) return null;
                                       
                                       return (
                                         <TableRow key={`client-field-${client.id}-${field.name}`} className="group bg-green-25 hover:bg-green-50">
                                           <TableCell className="sticky left-0 bg-green-25 group-hover:bg-green-50 border-r z-[5] w-16 text-center text-sm text-gray-500">
                                             {clientIndex + 1}.{fieldIndex + 1}
                                           </TableCell>
                                           <TableCell className="sticky left-16 bg-green-25 group-hover:bg-green-50 border-r z-[5] w-[300px]">
                                             <div className="flex items-center px-4 pl-8">
                                               <div className="flex items-center gap-1 flex-1 min-w-0">
                                                 <span className="text-sm text-gray-700 font-medium mr-2">
                                                   {field.tableHeader || field.label}:
                                                 </span>
                                                 <TruncatedText
                                                   text={fieldValue?.toString() || ''}
                                                   className="text-sm text-gray-800"
                                                   maxLength={30}
                                                 />
                                                 {field.type && (
                                                   <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 ml-1">
                                                     ({field.type})
                                                   </span>
                                                 )}
                                               </div>
                                             </div>
                                           </TableCell>
                                           {normalizedSubdepartments.flatMap((subdept, subIndex) =>
                                             subdept.hasClasses ? subdept.classes.flatMap((cls, clsIndex) =>
                                               (cls.subclasses?.length ? cls.subclasses : [null]).map((subcls, subclsIndex) => (
                                                 <TableCell key={`client-field-cell-${client.id}-${field.name}-${subdept.id}-${clsIndex}-${subclsIndex}`} className="text-center border bg-green-25 group-hover:bg-green-50">
                                                   <span className="text-xs text-gray-400">-</span>
                                                 </TableCell>
                                               ))
                                             ) : (
                                               <TableCell key={`client-field-cell-${client.id}-${field.name}-${subdept.id}`} className="text-center border bg-green-25 group-hover:bg-green-50">
                                                 <span className="text-xs text-gray-400">-</span>
                                               </TableCell>
                                             )
                                           )}
                                         </TableRow>
                                       );
                                     }).filter(Boolean) : [])
                                   ].flat();
                                 })}
                               </>
                             )}

                             {/* Empty state */}
                             {Object.keys(groupedDocuments).length === 0 && clientData.length === 0 && (
                               <TableRow>
                                 <TableCell colSpan={100} className="text-center py-12 text-gray-500">
                                   No data available for this category.
                                 </TableCell>
                               </TableRow>
                             )}
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
 );
} 