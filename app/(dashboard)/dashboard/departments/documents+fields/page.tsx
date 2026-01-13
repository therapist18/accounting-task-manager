// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Minus, Expand, Minimize2, Info, FileText, Users, Search, X } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { getTableFields, getGroupedFields } from "./components/formFields"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "@/app/(dashboard)/dashboard/departments/main-shared-components/column-visibility"
import { DocumentType, Subdepartment, DocumentField, ClientData, Department, SectionHeader, OptimizedCheckbox, TruncatedText } from "./components/types"
import { CATEGORY_MAPPING, DEBOUNCE_DELAY } from "./components/config"
import {
  formatFieldValue as formatFieldValueUtil,
  filterAndSortDocuments,
  getColumnKey as getColumnKeyUtil,
  toggleSetItem,
  shouldShowUnderstudy as shouldShowUnderstudyUtil,
  shouldShowReferences as shouldShowReferencesUtil,
} from "./components/utils"
import { supabase } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"

const MemoizedCheckbox = memo(OptimizedCheckbox)
const MemoizedTruncatedText = memo(TruncatedText)

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, any>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())
  const [availableColumns, setAvailableColumns] = useState<ColumnVisibilityOption[]>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    // This will be populated when availableColumns is set
    return {};
  })
  const [pendingChanges, setPendingChanges] = useState({ documents: {}, clientFields: {} })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("");
  const lastFetchTimeRef = useRef(0)
  const [allExpanded, setAllExpanded] = useState(false);

  // 1. Unified Fetch (One time)
  const fetchData = useCallback(async () => {
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 1000) return
    lastFetchTimeRef.current = now

    try {
      setLoading(true)
      const [depts, docs, requirements] = await Promise.all([
        supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`).order('order', { ascending: true }),
        supabase.from('acc_portal_kyc').select('*').order('main_category_number', { ascending: true }),
        supabase.from('tm_class_requirements').select('documents_and_fields, client_fields, job_level')
      ]);

      if (depts.error || docs.error || requirements.error) throw new Error("Fetch failed");

      const transformedDepts = (depts.data || []).map(dept => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || []).sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(sd => ({ 
            ...sd, 
            classes: (sd.classes || []).map(cls => ({
              ...cls,
              subclasses: cls.subClasses || cls.subclasses || [] // Handle both subClasses and subclasses
            })), 
            hasClasses: !!(sd.classes && sd.classes.length > 0)
          }))
      }));

      const processedDocs = (docs.data || []).map(doc => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }));

      const docAllocations = {};
      const fieldAllocations = {};
      requirements.data?.forEach(req => {
        if (!req.job_level) return;
        
        // Generate class identifier from job_level
        const classId = [
          req.job_level.department_id,
          req.job_level.subdepartment_id,
          req.job_level.class_id,
          req.job_level.subclass_id
        ].filter(id => id !== null && id !== undefined).join('_');
        
        (req.documents_and_fields || []).forEach(doc => {
          docAllocations[`${doc.id}_${classId}`] = doc;
          (doc.fields || []).forEach(f => docAllocations[`${doc.id}-${f.id}_${classId}`] = f);
        });
        (req.client_fields || []).forEach(f => fieldAllocations[`${f.id}_${classId}`] = f);
      });

      const cols = [];
      transformedDepts.forEach(dept => {
        dept.subdepartments?.forEach(sd => {
          if (sd.hasClasses) {
            sd.classes.forEach((cls, idx) => {
              if (cls.subclasses?.length) {
                cls.subclasses.forEach((sc, sidx) => cols.push({ id: getColumnKeyUtil(sd.id, idx, sidx), label: `${sd.name} > ${cls.name} > ${sc.name}`, visible: !!sc.default_display, isDefault: !!sc.default_display, group: sd.name }));
              } else cols.push({ id: getColumnKeyUtil(sd.id, idx, null), label: `${sd.name} > ${cls.name}`, visible: !!cls.default_display, isDefault: !!cls.default_display, group: sd.name });
            });
          } else cols.push({ id: getColumnKeyUtil(sd.id, null, null), label: sd.name, visible: !!sd.default_display, isDefault: !!sd.default_display, group: dept.name });
        });
      });

      startTransition(() => {
        setDepartments(transformedDepts);
        setDocuments(processedDocs);
        setDocumentAllocations(docAllocations);
        setClientFieldAllocations(fieldAllocations);
        setAvailableColumns(cols);
        if (transformedDepts.length > 0) setActiveTab(transformedDepts[0].id);
      });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData() }, [fetchData]);

  useEffect(() => {
    if (availableColumns.length > 0 && Object.keys(columnVisibility).length === 0) {
      const initialVisibility: Record<string, boolean> = {};
      availableColumns.forEach(col => {
        initialVisibility[col.id] = col.isDefault ?? true; // Use isDefault if available, otherwise default to true
      });
      setColumnVisibility(initialVisibility);
    }
  }, [availableColumns]);

  // 2. Local Instant Filtering
  const { groupedDocuments } = useMemo(() => {
    const filteredByCategory = documents.filter(doc => doc.category === CATEGORY_MAPPING[documentTab]);
    const filteredBySearch = searchQuery
      ? filteredByCategory.filter(doc =>
        (doc.display_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (doc.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        doc.fields?.some(field =>
          field?.name?.toLowerCase()?.includes(searchQuery.toLowerCase())
        )
      )
      : filteredByCategory;
    return filterAndSortDocuments(filteredBySearch, documentTab);
  }, [documents, documentTab, searchQuery]);

  const currentDepartment = useMemo(() => departments.find(d => d.id === activeTab) || null, [departments, activeTab]);

  const normalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments) return [];
    return currentDepartment.subdepartments.map(sd => ({
      ...sd,
      classes: sd.classes?.map(cls => ({ 
        ...cls, 
        subclasses: cls.subClasses || cls.subclasses || [] // Handle both subClasses and subclasses
      }))
    }));
  }, [currentDepartment]);

  // 3. Specification Filtering (FIXES THE SCREENSHOT BUG)
  const visibleColumns = useMemo(() => {
    const cols = [];
    const isIndiv = documentTab === "individual";

    normalizedSubdepartments.forEach(sd => {
      const getFilteredSpecs = (item) => {
        const raw = item?.specification
          ? Array.isArray(item.specification)
            ? item.specification
            : [item.specification]
          : ["Company"];
        return isIndiv
          ? raw.filter(s => s && s.toLowerCase() !== "company")
          : raw.filter(s => s && s.toLowerCase() === "company");
      };

      const process = (item, cIdx, scIdx) => {
        const key = getColumnKeyUtil(sd.id, cIdx, scIdx);
        if (!columnVisibility[key]) return;
        const specs = getFilteredSpecs(item);
        if (specs.length > 0) {
          cols.push({
            subdept: sd, clsIndex: cIdx, subclsIndex: scIdx, columnKey: key,
            specifications: specs,
            isExpanded: expandedColumns.has(key),
            width: expandedColumns.has(key) ? (specs.length * 120) : 120
          });
        }
      };

      if (sd.hasClasses) {
        sd.classes.forEach((cls, cIdx) => {
          if (cls.subclasses.length) cls.subclasses.forEach((sc, scIdx) => process(sc, cIdx, scIdx));
          else process(cls, cIdx, null);
        });
      } else process(sd, null, null);
    });
    return cols;
  }, [normalizedSubdepartments, columnVisibility, expandedColumns, documentTab]);

  // 4. Checkbox Logic
  const getAllocationStatus = useCallback((id, sdId, cIdx, scIdx, type) => {
    const sd = currentDepartment?.subdepartments?.find(s => s.id === sdId);
    const cls = cIdx !== null ? sd?.classes?.[cIdx] : null;
    const sc = (cls && scIdx !== null) ? cls.subclasses?.[scIdx] : null;
    const classIdPart = sc ? `${sdId}_${cls.id}_${sc.id}` : cls ? `${sdId}_${cls.id}` : `${sdId}`;
    const key = `${id}_${classIdPart}`;
    return pendingChanges.documents[key]?.[type] ?? documentAllocations[key]?.[type] ?? false;
  }, [pendingChanges, documentAllocations, currentDepartment]);

  const handleToggle = useCallback((id, sdId, cIdx, scIdx, type, checked) => {
    const sd = currentDepartment?.subdepartments?.find(s => s.id === sdId);
    const cls = cIdx !== null ? sd?.classes?.[cIdx] : null;
    const sc = (cls && scIdx !== null) ? cls.subclasses?.[scIdx] : null;
    const classIdPart = sc ? `${sdId}_${cls.id}_${sc.id}` : cls ? `${sdId}_${cls.id}` : `${sdId}`;
    const key = `${id}_${classIdPart}`;

    setPendingChanges(prev => {
      const newDocs = { ...prev.documents };
      const current = { ...(newDocs[key] || {}), [type]: checked };
      if (checked === (documentAllocations[key]?.[type] ?? false)) delete current[type];
      if (Object.keys(current).length === 0) delete newDocs[key];
      else newDocs[key] = current;
      return { ...prev, documents: newDocs };
    });
    setHasUnsavedChanges(true);
  }, [currentDepartment, documentAllocations]);

  const toggleAllRows = useCallback((expand: boolean) => {
    if (expand) {
      // Expand all categories and their documents with fields
      const newExpandedCategories = new Set<string>();
      const newExpandedItems = new Set<string>();

      Object.entries(groupedDocuments).forEach(([catKey, group]) => {
        newExpandedCategories.add(catKey);
        group.documents.forEach(doc => {
          if (doc.fields?.length > 0) {
            newExpandedItems.add(doc.id);
          }
        });
      });

      setExpandedCategories(newExpandedCategories);
      setExpandedItems(newExpandedItems);
      setAllExpanded(true);
    } else {
      // Collapse everything
      setExpandedCategories(new Set());
      setExpandedItems(new Set());
      setAllExpanded(false);
    }
  }, [groupedDocuments]);

  // 5. Dynamic Rendering Helpers
  const renderColumnHeaders = useCallback(() => {
    return visibleColumns.map(col => {
      if (!col.isExpanded) {
        return (
          <TableHead key={col.columnKey} style={{ width: '120px' }} className="border-r border-blue-400 text-center text-white text-[10px] bg-blue-300">
            <div className="flex items-center justify-center gap-1">
              <span className="truncate">{col.specifications[0]}</span>
              <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => toggleColumnExpansion(col.columnKey)}><Plus className="h-3 w-3" /></Button>
            </div>
          </TableHead>
        );
      }
      return col.specifications.map((spec, idx) => (
        <TableHead key={`${col.columnKey}-${spec}`} style={{ width: '120px' }} className="border-r border-blue-400 text-center text-white text-[10px] bg-blue-400">
          <div className="flex items-center justify-center gap-1">
            <span className="uppercase">{spec}</span>
            {idx === 0 && <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => toggleColumnExpansion(col.columnKey)}><Minus className="h-3 w-3" /></Button>}
          </div>
        </TableHead>
      ));
    }).flat();
  }, [visibleColumns]);

  const renderDocumentCheckboxes = useCallback((doc, col) => {
    if (!col.isExpanded) {
      const spec = col.specifications[0];
      return (
        <TableCell key={`${doc.id}-${col.columnKey}`} className="text-center border-r w-[120px]">
          <MemoizedCheckbox checked={getAllocationStatus(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec)} onCheckedChange={c => handleToggle(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec, c)} />
        </TableCell>
      );
    }
    return col.specifications.map(spec => (
      <TableCell key={`${doc.id}-${col.columnKey}-${spec}`} className="text-center border-r w-[120px]">
        <MemoizedCheckbox checked={getAllocationStatus(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec)} onCheckedChange={c => handleToggle(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec, c)} />
      </TableCell>
    ));
  }, [getAllocationStatus, handleToggle]);

  const toggleColumnExpansion = (key) => setExpandedColumns(prev => toggleSetItem(prev, key));
  const toggleCategoryExpansion = (key) => setExpandedCategories(prev => toggleSetItem(prev, key));
  const toggleItemExpansion = (key) => setExpandedItems(prev => toggleSetItem(prev, key));

  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({ documents: {}, clientFields: {} })
    setHasUnsavedChanges(false)
  }, [])

const handleSaveAllChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      const changesByClassId = {};

      // 1. Group all pending changes by their classId string.
      const groupChanges = (changeType) => {
        const source = pendingChanges[changeType];
        Object.entries(source).forEach(([allocationKey, changeData]) => {
          const firstUnderscoreIndex = allocationKey.indexOf('_');
          if (firstUnderscoreIndex === -1) return;

          const entityId = allocationKey.substring(0, firstUnderscoreIndex);
          const classHierarchy = allocationKey.substring(firstUnderscoreIndex + 1);

          if (!changesByClassId[classHierarchy]) {
            changesByClassId[classHierarchy] = { documents: {}, clientFields: {} };
          }

          changesByClassId[classHierarchy][changeType][entityId] = changeData;
        });
      };

      groupChanges('documents');
      groupChanges('clientFields');

      // 2. Iterate through each unique hierarchy path
      const savePromises = Object.entries(changesByClassId).map(async ([classHierarchy, classChanges]) => {
        // Parse the hierarchy string: "sdId" or "sdId_clsId" or "sdId_clsId_scId"
        const parts = classHierarchy.split('_');
        const sdId = parts[0] ? parseInt(parts[0]) : null;
        const clsId = parts[1] ? parseInt(parts[1]) : null;
        const scId = parts[2] ? parseInt(parts[2]) : null;
        const deptId = parseInt(activeTab); // The current active Department tab

        // Determine the level based on specificity
        let currentLevel = 1; // Default: Department
        if (scId) currentLevel = 4;
        else if (clsId) currentLevel = 3;
        else if (sdId) currentLevel = 2;

        const jobLevel = {
          level: currentLevel,
          department_id: deptId,
          subdepartment_id: sdId,
          class_id: clsId,
          subclass_id: scId
        };

        // 3. Fetch existing data for this specific job_level
        const { data: existingRecord, error: fetchError } = await supabase
          .from('tm_class_requirements')
          .select('id, documents_and_fields, client_fields')
          .eq('job_level->>department_id', jobLevel.department_id.toString())
          .eq('job_level->>subdepartment_id', jobLevel.subdepartment_id ? jobLevel.subdepartment_id.toString() : 'null')
          .eq('job_level->>class_id', jobLevel.class_id ? jobLevel.class_id.toString() : 'null')
          .eq('job_level->>subclass_id', jobLevel.subclass_id ? jobLevel.subclass_id.toString() : 'null')
          .maybeSingle();

        if (fetchError) throw fetchError;

        // 4. Merge Document Changes
        const documentsMap = new Map((existingRecord?.documents_and_fields || []).map(doc => [doc.id, doc]));

        Object.entries(classChanges.documents).forEach(([entityId, changeProps]) => {
          const isField = entityId.length > 37 && entityId[36] === '-';
          let docId, fieldId;

          if (isField) {
            docId = entityId.substring(0, 36);
            fieldId = entityId.substring(37);
          } else {
            docId = entityId;
            fieldId = null;
          }

          const docData = documentsMap.get(docId) || { id: docId, fields: [] };

          if (fieldId) {
            const fieldIndex = docData.fields.findIndex(f => f.id === fieldId);
            const fieldChanges = { id: fieldId, updated_at: new Date().toISOString(), ...changeProps };
            if (fieldIndex > -1) {
              docData.fields[fieldIndex] = { ...docData.fields[fieldIndex], ...fieldChanges };
            } else {
              docData.fields.push(fieldChanges);
            }
          } else {
            const docChanges = { updated_at: new Date().toISOString(), ...changeProps };
            documentsMap.set(docId, { ...docData, ...docChanges });
          }
        });

        // 5. Merge Client Field Changes
        const clientFieldsMap = new Map((existingRecord?.client_fields || []).map(field => [field.id, field]));
        Object.entries(classChanges.clientFields).forEach(([entityId, changeProps]) => {
          const fieldChanges = { id: entityId, updated_at: new Date().toISOString(), ...changeProps };
          clientFieldsMap.set(entityId, { ...clientFieldsMap.get(entityId), ...fieldChanges });
        });

        // 6. Final Payload
        const finalPayload = {
          documents_and_fields: Array.from(documentsMap.values()),
          client_fields: Array.from(clientFieldsMap.values()),
          job_level: jobLevel,
          updated_at: new Date().toISOString(),
        };

        // 7. Upsert (Update if exists, else Insert)
        let result;
        if (existingRecord?.id) {
          result = await supabase
            .from('tm_class_requirements')
            .update(finalPayload)
            .eq('id', existingRecord.id);
        } else {
          result = await supabase
            .from('tm_class_requirements')
            .insert([finalPayload]);
        }

        if (result.error) throw result.error;
      });

      await Promise.all(savePromises);

      setPendingChanges({ documents: {}, clientFields: {} });
      setHasUnsavedChanges(false);
      await refreshData();

      toast({
        title: "Success",
        description: `All hierarchical levels updated successfully.`,
      });

    } catch (error) {
      console.error('Error saving changes:', error);
      toast({
        title: "Error",
        description: `Failed to save changes: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, hasUnsavedChanges, refreshData, activeTab]);

  if (loading) return <div className="p-12 text-center animate-pulse">Loading Document Map...</div>;

  const totalBodyColspan = 2 + visibleColumns.reduce((acc, c) => acc + (c.isExpanded ? c.specifications.length : 1), 0);

  return (
    <div className="w-full min-h-screen p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Management</h1>
          {hasUnsavedChanges && <p className="text-orange-500 text-sm">Unsaved Changes Pending</p>}
        </div>
        <div className="flex gap-2">
          <ColumnVisibilityControl columns={availableColumns.map(c => ({ ...c, visible: !!columnVisibility[c.id] }))} onVisibilityChange={(id, v) => setColumnVisibility(prev => ({ ...prev, [id]: v }))} />
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllRows(!allExpanded)}
              className="h-8 text-xs"
            >
              {allExpanded ? (
                <>
                  <Minus className="h-3 w-3 mr-1" />
                  Collapse All
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 mr-1" />
                  Expand All
                </>
              )}
            </Button>
          </div>
          {hasUnsavedChanges && (
            <>
              <Button
                variant="outline"
                onClick={handleDiscardChanges}
                disabled={isSaving}
              >
                Discard Changes
              </Button>
              <Button
                onClick={handleSaveAllChanges}
                disabled={isSaving}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSaving ? 'Saving...' : 'Save All Changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          {departments.map(d => <TabsTrigger key={d.id} value={d.id}>{d.name}</TabsTrigger>)}
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="flex items-center justify-between mb-4">
            <Tabs
              value={documentTab}
              onValueChange={value => {
                setDocumentTab(value as "company" | "individual");
                setSearchQuery(""); // Reset search when changing tabs
              }}
              className="w-full"
            >
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="company">Company Documents</TabsTrigger>
                  <TabsTrigger value="individual">Individual Documents</TabsTrigger>
                </TabsList>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search documents..."
                  className="w-full pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <X
                    className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer"
                    onClick={() => setSearchQuery("")}
                  />
                )}
              </div>
              <div className="mt-4 border rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="overflow-auto max-h-[calc(100vh-250px)]">
                  <Table>
                    <TableHeader className="bg-blue-600 sticky top-0 z-20">
                      {/* Row 1: Subdepartments */}
                      <TableRow>
                        <TableHead rowSpan={4} className="bg-blue-600 text-white w-16 border-r border-blue-500 text-center">#</TableHead>
                        <TableHead rowSpan={4} className="bg-blue-600 text-white w-[300px] border-r border-blue-500 sticky left-0 z-30">Document / Field Details</TableHead>
                        {visibleColumns.reduce((acc, col, idx) => {
                          const prev = visibleColumns[idx - 1];
                          if (!prev || prev.subdept.id !== col.subdept.id) {
                            const group = visibleColumns.filter(c => c.subdept.id === col.subdept.id);
                            const span = group.reduce((s, c) => s + (c.isExpanded ? c.specifications.length : 1), 0);
                            acc.push(<TableHead key={col.subdept.id} colSpan={span} className="bg-blue-700 text-white text-center border-r border-blue-500">{col.subdept.name}</TableHead>);
                          }
                          return acc;
                        }, [])}
                      </TableRow>

                      {/* Row 2: Classes */}
                      <TableRow>
                        {visibleColumns.reduce((acc, col, idx) => {
                          const prev = visibleColumns[idx - 1];
                          const isNew = !prev || prev.subdept.id !== col.subdept.id || prev.clsIndex !== col.clsIndex;
                          if (isNew) {
                            const group = visibleColumns.filter(c => c.subdept.id === col.subdept.id && c.clsIndex === col.clsIndex);
                            const span = group.reduce((s, c) => s + (c.isExpanded ? c.specifications.length : 1), 0);
                            acc.push(<TableHead key={`cls-${idx}`} colSpan={span} className="bg-blue-600 text-white text-center border-r border-blue-500">{col.clsIndex === null ? "Direct" : col.subdept.classes[col.clsIndex].name}</TableHead>);
                          }
                          return acc;
                        }, [])}
                      </TableRow>

                      {/* Row 3: Subclasses */}
                      <TableRow>
                        {visibleColumns.map((col, idx) => (
                          <TableHead key={`sc-${idx}`} colSpan={col.isExpanded ? col.specifications.length : 1} className="bg-blue-500 text-white text-center border-r border-blue-400 text-[10px]">
                            {col.subclsIndex !== null ? col.subdept.classes[col.clsIndex].subclasses[col.subclsIndex].name : "-"}
                          </TableHead>
                        ))}
                      </TableRow>

                      {/* Row 4: Final Specifications */}
                      <TableRow>{renderColumnHeaders()}</TableRow>
                    </TableHeader>

                    <TableBody>
                      {Object.entries(groupedDocuments)
                        .sort(([a], [b]) => {
                          const aNum = parseInt(a === 'other' ? '999' : a, 10);
                          const bNum = parseInt(b === 'other' ? '999' : b, 10);
                          return aNum - bNum;
                        })
                        .map(([catKey, group]) => {
                          const isCatExpanded = expandedCategories.has(catKey);
                          const hasFields = group.documents.some(doc => doc.fields && doc.fields.length > 0);

                          return (
                            <React.Fragment key={`category-${catKey}`}>
                              <TableRow
                                className="bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                                onClick={() => toggleCategoryExpansion(catKey)}
                              >
                                <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700 w-16">
                                  {group.mainCategoryNumber}
                                </TableCell>
                                <TableCell className="sticky left-10 bg-blue-100 border-r z-[5] w-[300px]">
                                  <div className="flex items-center justify-between px-4">
                                    <span className="font-semibold text-gray-700 flex-1 min-w-0 pr-2 truncate">
                                      {group.mainCategory}
                                    </span>
                                    <span className="text-xs bg-blue-200 text-gray-700 px-2 py-1 rounded-full mr-2">
                                      {group.documents.length}
                                    </span>
                                    {isCatExpanded ? (
                                      <Minus className="h-4 w-4 text-gray-600 flex-shrink-0" />
                                    ) : (
                                      <Plus className="h-4 w-4 text-gray-600 flex-shrink-0" />
                                    )}
                                  </div>
                                </TableCell>
                                {visibleColumns.map(col => (
                                  <TableCell
                                    key={`cat-${col.columnKey}`}
                                    colSpan={col.isExpanded ? col.specifications.length : 1}
                                    className="border-r text-center bg-blue-50"
                                  >
                                    -
                                  </TableCell>
                                ))}
                              </TableRow>

                              {isCatExpanded && group.documents.map((doc, docIndex) => {
                                const isDocExpanded = expandedItems.has(doc.id);
                                const docHasFields = doc.fields && doc.fields.length > 0;

                                return (
                                  <React.Fragment key={`doc-${doc.id}`}>
                                    <TableRow className="group hover:bg-blue-50">
                                      <TableCell className="sticky left-0 bg-white group-hover:bg-blue-50 border-r z-[5] text-center font-medium text-sm w-16">
                                        {`${group.mainCategoryNumber}.${docIndex + 1}`}
                                      </TableCell>
                                      <TableCell className="sticky left-10 bg-white group-hover:bg-blue-50 border-r z-[5] w-[300px] pr-2">
                                        <div className="flex items-center justify-between px-4">
                                          <span className="font-medium text-gray-800 flex-1 min-w-0 pr-2 truncate">
                                            {doc.display_name}
                                          </span>
                                          {docHasFields && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 w-6 p-0 flex-shrink-0 text-blue-600 hover:bg-blue-200"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleItemExpansion(doc.id);
                                              }}
                                            >
                                              {isDocExpanded ? (
                                                <Minus className="h-4 w-4" />
                                              ) : (
                                                <Plus className="h-4 w-4" />
                                              )}
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                      {visibleColumns.map(col => renderDocumentCheckboxes(doc, col)).flat()}
                                    </TableRow>

                                    {isDocExpanded && docHasFields && doc.fields.map((field) => (
                                      <TableRow key={`field-${field.id}`} className="bg-gray-50/80 hover:bg-gray-100">
                                        <TableCell className="sticky left-0 bg-gray-50 hover:bg-gray-100 border-r z-[5] w-16 text-center text-xs text-gray-500">
                                          {field.path}
                                        </TableCell>
                                        <TableCell className="sticky left-10 bg-gray-50 hover:bg-gray-100 border-r z-[5] w-[300px] pl-12 pr-4">
                                          <div className="flex items-center">
                                            <span className="text-sm text-gray-600">
                                              {field.name}
                                            </span>
                                          </div>
                                        </TableCell>
                                        {visibleColumns.map(col => {
                                          const span = col.isExpanded ? col.specifications.length : 1;
                                          return (
                                            <TableCell
                                              key={`${field.id}-${col.columnKey}`}
                                              colSpan={span}
                                              className="text-center border-r text-xs bg-white"
                                            >
                                              -
                                            </TableCell>
                                          );
                                        })}
                                      </TableRow>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Tabs>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}