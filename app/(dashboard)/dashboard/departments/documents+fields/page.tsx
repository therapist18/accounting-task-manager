// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Minus, Search, X, Download, Upload } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "@/app/(dashboard)/dashboard/departments/main-shared-components/column-visibility"
import { DocumentType, Department, OptimizedCheckbox } from "./components/types"
import { CATEGORY_MAPPING } from "./components/config"
import {
  filterAndSortDocuments,
  getColumnKey as getColumnKeyUtil,
  toggleSetItem,
} from "./components/utils"
import { supabase } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { format } from "date-fns"

const MemoizedCheckbox = memo(OptimizedCheckbox)

// Shared tab definitions used for export sheet names & import sheet lookup
const DOC_TABS = [
  { value: "company",     label: "Company Documents" },
  { value: "individual",  label: "Individual Documents" },
  { value: "application", label: "Application Documents" },
] as const

export default function DocumentsFields() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, any>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual" | "application">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())
  const [availableColumns, setAvailableColumns] = useState<ColumnVisibilityOption[]>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [pendingChanges, setPendingChanges] = useState({ documents: {}, clientFields: {} })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("");
  const [allExpanded, setAllExpanded] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null)
  const lastFetchTimeRef = useRef(0)

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH  (accepts force=true to bypass 1-second debounce after saves)
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetchTimeRef.current < 1000) return
    lastFetchTimeRef.current = now

    try {
      setLoading(true)
      const [depts, docs, requirements] = await Promise.all([
        supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`).order('order', { ascending: true }),
        supabase.from('acc_portal_kyc').select('*').order('main_category_number', { ascending: true }),
        supabase.from('tm_class_requirements').select('documents_and_fields, job_level')
      ]);

      if (depts.error || docs.error || requirements.error) throw new Error("Fetch failed");

      const transformedDepts = (depts.data || []).map(dept => ({
        ...dept,
        subdepartments: (dept.tm_subdepartments || [])
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(sd => ({
            ...sd,
            classes: (sd.classes || []).map(cls => ({
              ...cls,
              subclasses: cls.subClasses || cls.subclasses || []
            })),
            hasClasses: !!(sd.classes && sd.classes.length > 0)
          }))
      }));

      const processedDocs = (docs.data || []).map(doc => ({
        ...doc,
        fields: Array.isArray(doc.fields) ? doc.fields : [],
        display_name: doc.display_name || doc.name
      }));

      // Build allocation lookup:  `entityId::hierarchyKey` → { boolType: true }
      const docAllocations = {};
      requirements.data?.forEach(req => {
        if (!req.job_level) return;
        const classId = [
          req.job_level.subdepartment_id,
          req.job_level.class_id,
          req.job_level.subclass_id
        ].filter(id => id !== null && id !== undefined).join('_');

        (req.documents_and_fields || []).forEach(doc => {
          const docId = String(doc.id);
          // Doc-level booleans
          Object.keys(doc).forEach(key => {
            if (!['id', 'fields', 'updated_at'].includes(key) && doc[key] === true) {
              docAllocations[`${docId}::${classId}`] = {
                ...docAllocations[`${docId}::${classId}`],
                [key]: true
              };
            }
          });
          // Field-level booleans  (separator: | between docId and fieldId)
          (doc.fields || []).forEach(f => {
            const fieldId = String(f.id);
            Object.keys(f).forEach(key => {
              if (!['id', 'updated_at'].includes(key) && f[key] === true) {
                docAllocations[`${docId}|${fieldId}::${classId}`] = {
                  ...docAllocations[`${docId}|${fieldId}::${classId}`],
                  [key]: true
                };
              }
            });
          });
        });
      });

      // Build column list
      const cols = [];
      transformedDepts.forEach(dept => {
        dept.subdepartments?.forEach(sd => {
          if (sd.hasClasses) {
            sd.classes.forEach((cls, idx) => {
              if (cls.subclasses?.length) {
                cls.subclasses.forEach((sc, sidx) => cols.push({
                  id: getColumnKeyUtil(sd.id, idx, sidx),
                  label: `${sd.name} > ${cls.name} > ${sc.name}`,
                  visible: !!sc.default_display,
                  isDefault: !!sc.default_display,
                  group: sd.name
                }));
              } else cols.push({
                id: getColumnKeyUtil(sd.id, idx, null),
                label: `${sd.name} > ${cls.name}`,
                visible: !!cls.default_display,
                isDefault: !!cls.default_display,
                group: sd.name
              });
            });
          } else cols.push({
            id: getColumnKeyUtil(sd.id, null, null),
            label: sd.name,
            visible: !!sd.default_display,
            isDefault: !!sd.default_display,
            group: dept.name
          });
        });
      });

      startTransition(() => {
        setDepartments(transformedDepts);
        setDocuments(processedDocs);
        setDocumentAllocations(docAllocations);   // ← fresh allocation state → checkboxes re-render
        setAvailableColumns(cols);
        if (transformedDepts.length > 0 && (!activeTab || !transformedDepts.find(d => String(d.id) === activeTab))) {
          setActiveTab(String(transformedDepts[0].id));
        }
      });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { fetchData() }, [fetchData]);

  useEffect(() => {
    if (availableColumns.length > 0 && Object.keys(columnVisibility).length === 0) {
      const initialVisibility: Record<string, boolean> = {};
      availableColumns.forEach(col => { initialVisibility[col.id] = col.isDefault ?? true; });
      setColumnVisibility(initialVisibility);
    }
  }, [availableColumns]);

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────
  const { groupedDocuments } = useMemo(() => {
    const filteredByCategory = documents.filter(doc => doc.category === CATEGORY_MAPPING[documentTab]);
    const filteredBySearch = searchQuery
      ? filteredByCategory.filter(doc =>
          (doc.display_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
          (doc.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
          doc.fields?.some(field => field?.name?.toLowerCase()?.includes(searchQuery.toLowerCase()))
        )
      : filteredByCategory;
    return filterAndSortDocuments(filteredBySearch, documentTab);
  }, [documents, documentTab, searchQuery]);

  // Pre-grouped docs for ALL tabs (used by export & import logic)
  const groupedDocsByTab = useMemo(() => {
    const result: Record<string, any> = {};
    DOC_TABS.forEach(tab => {
      const filtered = documents.filter(doc => doc.category === CATEGORY_MAPPING[tab.value]);
      result[tab.value] = filterAndSortDocuments(filtered, tab.value).groupedDocuments;
    });
    return result;
  }, [documents]);

  const currentDepartment = useMemo(
    () => departments.find(d => String(d.id) === activeTab) || null,
    [departments, activeTab]
  );

  const normalizedSubdepartments = useMemo(() => {
    if (!currentDepartment?.subdepartments) return [];
    return currentDepartment.subdepartments.map(sd => ({
      ...sd,
      classes: sd.classes?.map(cls => ({
        ...cls,
        subclasses: cls.subClasses || cls.subclasses || []
      }))
    }));
  }, [currentDepartment]);

  // Reusable column builder (used for current tab display AND per-tab export/import)
  const buildVisibleColumns = useCallback((tabValue: string, subdepts: any[]) => {
    const cols = [];
    const isIndiv = tabValue === "individual";

    subdepts.forEach(sd => {
      const getFilteredEntityTypes = (item) => {
        const raw = item?.entity_types
          ? Array.isArray(item.entity_types) ? item.entity_types : JSON.parse(item.entity_types || "[]")
          : [];
        const entityTypes = raw.length > 0 ? raw : ["Company"];
        return isIndiv
          ? entityTypes.filter(s => s && s.toLowerCase() !== "company")
          : entityTypes.filter(s => s && s.toLowerCase() === "company");
      };
      const process = (item, cIdx, scIdx) => {
        const key = getColumnKeyUtil(sd.id, cIdx, scIdx);
        if (!columnVisibility[key]) return;
        let specs = getFilteredEntityTypes(item);
        if (specs.length === 0) specs = ["Standard"];
        cols.push({
          subdept: sd, clsIndex: cIdx, subclsIndex: scIdx, columnKey: key,
          specifications: specs,
          isExpanded: expandedColumns.has(key),
          width: expandedColumns.has(key) ? (specs.length * 120) : 120
        });
      };

      if (sd.hasClasses) {
        sd.classes.forEach((cls, cIdx) => {
          if (cls.subclasses.length) cls.subclasses.forEach((sc, scIdx) => process(sc, cIdx, scIdx));
          else process(cls, cIdx, null);
        });
      } else process(sd, null, null);
    });
    return cols;
  }, [columnVisibility, expandedColumns]);

  // Column builder for export that includes ALL columns regardless of visibility
  const buildAllColumns = useCallback((tabValue: string, subdepts: any[]) => {
    const cols = [];
    const isIndiv = tabValue === "individual";

    subdepts.forEach(sd => {
      const getFilteredEntityTypes = (item) => {
        const raw = item?.entity_types
          ? Array.isArray(item.entity_types) ? item.entity_types : JSON.parse(item.entity_types || "[]")
          : [];
        const entityTypes = raw.length > 0 ? raw : ["Company"];
        return isIndiv
          ? entityTypes.filter(s => s && s.toLowerCase() !== "company")
          : entityTypes.filter(s => s && s.toLowerCase() === "company");
      };
      const process = (item, cIdx, scIdx) => {
        const key = getColumnKeyUtil(sd.id, cIdx, scIdx);
        let specs = getFilteredEntityTypes(item);
        if (specs.length === 0) specs = ["Standard"];
        cols.push({
          subdept: sd, clsIndex: cIdx, subclsIndex: scIdx, columnKey: key,
          specifications: specs,
          isExpanded: expandedColumns.has(key),
          width: expandedColumns.has(key) ? (specs.length * 120) : 120
        });
      };

      if (sd.hasClasses) {
        sd.classes.forEach((cls, cIdx) => {
          if (cls.subclasses.length) cls.subclasses.forEach((sc, scIdx) => process(sc, cIdx, scIdx));
          else process(cls, cIdx, null);
        });
      } else process(sd, null, null);
    });
    return cols;
  }, [expandedColumns]);

  const visibleColumns = useMemo(
    () => buildVisibleColumns(documentTab, normalizedSubdepartments),
    [buildVisibleColumns, documentTab, normalizedSubdepartments]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ALLOCATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  const resolveClassIdPart = useCallback((sdId, cIdx, scIdx) => {
    const sd = currentDepartment?.subdepartments?.find(s => s.id === sdId);
    const cls = cIdx !== null ? sd?.classes?.[cIdx] : null;
    const sc = (cls && scIdx !== null) ? cls.subclasses?.[scIdx] : null;
    return sc ? `${sdId}_${cls.id}_${sc.id}` : cls ? `${sdId}_${cls.id}` : `${sdId}`;
  }, [currentDepartment]);

  const getAllocationStatus = useCallback((id, sdId, cIdx, scIdx, type) => {
    const classIdPart = resolveClassIdPart(sdId, cIdx, scIdx);
    const key = `${id}::${classIdPart}`;
    return pendingChanges.documents[key]?.[type] ?? documentAllocations[key]?.[type] ?? false;
  }, [pendingChanges, documentAllocations, resolveClassIdPart]);

  const handleToggle = useCallback((id, sdId, cIdx, scIdx, type, checked) => {
    const classIdPart = resolveClassIdPart(sdId, cIdx, scIdx);
    const key = `${id}::${classIdPart}`;

    setPendingChanges(prev => {
      const newDocs = { ...prev.documents };
      const current = { ...(newDocs[key] || {}), [type]: checked };
      if (checked === (documentAllocations[key]?.[type] ?? false)) delete current[type];
      if (Object.keys(current).length === 0) delete newDocs[key];
      else newDocs[key] = current;
      return { ...prev, documents: newDocs };
    });
    setHasUnsavedChanges(true);
  }, [resolveClassIdPart, documentAllocations]);

  const toggleAllRows = useCallback((expand: boolean) => {
    if (expand) {
      const newExpandedCategories = new Set(Object.keys(groupedDocuments));
      const newExpandedItems = new Set<string>();
      Object.values(groupedDocuments).forEach(group => {
        group.documents.forEach(doc => { if (doc.fields?.length > 0) newExpandedItems.add(doc.id); });
      });
      setExpandedCategories(newExpandedCategories);
      setExpandedItems(newExpandedItems);
      setAllExpanded(true);
    } else {
      setExpandedCategories(new Set());
      setExpandedItems(new Set());
      setAllExpanded(false);
    }
  }, [groupedDocuments]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE — clear pending + force-refresh so checkboxes update immediately
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSaveAllChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      // Group changes by hierarchy
      const changesByHierarchy: Record<string, { documents: Record<string, Record<string, boolean>> }> = {};
      Object.entries(pendingChanges.documents).forEach(([allocationKey, changes]) => {
        const [entityPart, hierarchyPart] = allocationKey.split('::');
        if (!hierarchyPart) return;
        if (!changesByHierarchy[hierarchyPart]) changesByHierarchy[hierarchyPart] = { documents: {} };
        changesByHierarchy[hierarchyPart].documents[entityPart] = changes as Record<string, boolean>;
      });

      // Fetch existing records for this department in one query
      const deptId = parseInt(activeTab);
      const { data: allRequirements, error: fetchAllError } = await supabase
        .from('tm_class_requirements')
        .select('id, documents_and_fields, job_level')
        .eq('job_level->>department_id', String(deptId));
      if (fetchAllError) throw fetchAllError;

      const existingByHierarchy: Record<string, { id: string; documents_and_fields: any[] }> = {};
      (allRequirements || []).forEach(req => {
        if (!req.job_level) return;
        const hKey = [req.job_level.subdepartment_id, req.job_level.class_id, req.job_level.subclass_id]
          .filter(id => id !== null && id !== undefined).join('_');
        existingByHierarchy[hKey] = {
          id: req.id,
          documents_and_fields: Array.isArray(req.documents_and_fields) ? req.documents_and_fields : []
        };
      });

      const savePromises = Object.entries(changesByHierarchy).map(async ([hierarchyKey, data]) => {
        const parts = hierarchyKey.split('_');
        const sdId  = parts[0] ? parseInt(parts[0]) : null;
        const clsId = parts[1] ? parseInt(parts[1]) : null;
        const scId  = parts[2] ? parseInt(parts[2]) : null;

        let level = 2;
        if (scId) level = 4;
        else if (clsId) level = 3;

        const jobLevelObj = {
          level, department_id: deptId,
          subdepartment_id: sdId, class_id: clsId ?? null, subclass_id: scId ?? null
        };
        const existingRecord = existingByHierarchy[hierarchyKey];

        const docsMap = new Map<string, any>();
        (existingRecord?.documents_and_fields || []).forEach(doc => {
          docsMap.set(String(doc.id), { ...doc, fields: Array.isArray(doc.fields) ? doc.fields : [] });
        });

        Object.entries(data.documents).forEach(([entityKey, typeChanges]) => {
          const isField = entityKey.includes('|');
          let docId: string, fieldId: string | undefined;
          if (isField) [docId, fieldId] = entityKey.split('|');
          else docId = entityKey;

          let docObj = docsMap.get(String(docId)) || {
            id: String(docId), fields: [], updated_at: new Date().toISOString()
          };

          if (isField && fieldId) {
            let fieldObj = docObj.fields.find((f: any) => String(f.id) === String(fieldId));
            if (!fieldObj) {
              fieldObj = { id: String(fieldId), updated_at: new Date().toISOString() };
              docObj.fields.push(fieldObj);
            }
            Object.entries(typeChanges).forEach(([type, val]) => {
              if (val) fieldObj[type] = true; else delete fieldObj[type];
            });
            const remainingKeys = Object.keys(fieldObj).filter(k => !['id', 'updated_at'].includes(k));
            if (remainingKeys.length === 0) {
              docObj.fields = docObj.fields.filter((f: any) => String(f.id) !== String(fieldId));
            }
          } else {
            Object.entries(typeChanges).forEach(([type, val]) => {
              if (val) docObj[type] = true; else delete docObj[type];
            });
          }

          docObj.updated_at = new Date().toISOString();
          docsMap.set(String(docId), docObj);
        });

        const finalDocs = Array.from(docsMap.values()).filter(doc => {
          const docBooleans = Object.keys(doc).filter(k => !['id', 'fields', 'updated_at'].includes(k));
          const fieldBooleans = (doc.fields || []).some((f: any) =>
            Object.keys(f).some(k => !['id', 'updated_at'].includes(k))
          );
          return docBooleans.length > 0 || fieldBooleans;
        });

        const finalPayload = {
          job_level: jobLevelObj,
          documents_and_fields: finalDocs,
          updated_at: new Date().toISOString()
        };

        console.log(`[Save] ${existingRecord ? `Updating ID ${existingRecord.id}` : 'Inserting NEW'}:`, finalPayload);

        if (existingRecord?.id) {
          return supabase.from('tm_class_requirements').update(finalPayload).eq('id', existingRecord.id);
        } else {
          return supabase.from('tm_class_requirements').insert([finalPayload]);
        }
      });

      const results = await Promise.all(savePromises);
      const err = results.find(r => r?.error);
      if (err) throw err.error;

      // ── Clear pending changes first, then force-refresh allocations ──────────
      setPendingChanges({ documents: {}, clientFields: {} });
      setHasUnsavedChanges(false);
      await fetchData(true);   // force=true bypasses the 1s debounce
      toast({ title: "✅ Saved successfully", description: "Allocations updated. Table refreshed." });
    } catch (error) {
      console.error("[Save] Error:", error);
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, hasUnsavedChanges, fetchData, activeTab]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPORT — one worksheet per tab (Company / Individual / Application)
  // ─────────────────────────────────────────────────────────────────────────────
  const writeSheetForTab = useCallback((
    worksheet: ExcelJS.Worksheet,
    tabValue: string,
    tabCols: any[]
  ) => {
    const tabGrouped = groupedDocsByTab[tabValue] || {};

    const headerFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
    const lightFill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    const whiteFont     = { color: { argb: 'FFFFFFFF' }, bold: true };
    const centerAlign   = { vertical: 'middle', horizontal: 'center' };

    const HEADER_START = 3; // rows 1-2 are meta/instructions, rows 3-6 are 4-level column headers

    // Row 1 — title
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${currentDepartment?.name} — ${DOC_TABS.find(t => t.value === tabValue)?.label}  |  Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`;
    titleCell.font = { size: 13, bold: true };
    titleCell.alignment = { vertical: 'middle' };

    // Row 2 — import guide
    worksheet.mergeCells('A2:B2');
    const instrCell = worksheet.getCell('A2');
    instrCell.value = 'IMPORT GUIDE: Type "Yes" in any cell to enable that allocation. Leave blank to disable. Do not add or remove rows.';
    instrCell.font = { italic: true, color: { argb: 'FF595959' }, size: 10 };

    // Fixed columns: #, Name, Document ID, Field ID (cols 1-4)
    const fixedHeaders = ['#', 'Document / Field Name', 'Document ID', 'Field ID'];
    const fixedWidths  = [8, 52, 38, 14];
    fixedHeaders.forEach((text, i) => {
      const colNum = i + 1;
      worksheet.mergeCells(HEADER_START, colNum, HEADER_START + 3, colNum);
      const cell = worksheet.getCell(HEADER_START, colNum);
      cell.value = text;
      cell.fill  = headerFill;
      cell.font  = whiteFont;
      cell.alignment = centerAlign;
      worksheet.getColumn(colNum).width = fixedWidths[i];
    });

    // Hide ID columns — present for import, invisible to users
    worksheet.getColumn(3).hidden = true;  // Document ID
    worksheet.getColumn(4).hidden = true;  // Field ID

    // Dynamic columns starting at col 5
    let colIndex = 5;
    let lastSd = null, sdStart = 0;
    let lastCls = null, clsStart = 0;
    const subdepartmentBoundaries = []; // Track where each subdepartment ends for borders

    tabCols.forEach((col, idx) => {
      const actualColIdx = colIndex;
      const colSpan = col.isExpanded ? col.specifications.length : 1;

      // Subdept header (row HEADER_START)
      if (!lastSd || lastSd.id !== col.subdept.id) {
        if (lastSd && sdStart) {
          // Add border to the right of the previous subdepartment
          subdepartmentBoundaries.push(actualColIdx - 1);
          try { worksheet.mergeCells(HEADER_START, sdStart, HEADER_START, actualColIdx - 1); } catch {}
        }
        lastSd = col.subdept; sdStart = actualColIdx;
        const cell = worksheet.getCell(HEADER_START, actualColIdx);
        cell.value = col.subdept.name;
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.font  = whiteFont; cell.alignment = centerAlign;
      }
      if (idx === tabCols.length - 1) {
        // Add border to the right of the last subdepartment
        subdepartmentBoundaries.push(actualColIdx + colSpan - 1);
        try { worksheet.mergeCells(HEADER_START, sdStart, HEADER_START, actualColIdx + colSpan - 1); } catch {}
      }

      // Class header (row HEADER_START+1)
      const className = col.clsIndex === null ? "Direct" : col.subdept.classes?.[col.clsIndex]?.name ?? '';
      const uniqueClassId = `${col.subdept.id}-${col.clsIndex}`;
      if (!lastCls || lastCls.id !== uniqueClassId) {
        if (lastCls && clsStart) {
          try { worksheet.mergeCells(HEADER_START + 1, clsStart, HEADER_START + 1, actualColIdx - 1); } catch {}
        }
        lastCls = { id: uniqueClassId }; clsStart = actualColIdx;
        const cell = worksheet.getCell(HEADER_START + 1, actualColIdx);
        cell.value = className;
        cell.fill  = subHeaderFill; cell.font = whiteFont; cell.alignment = centerAlign;
      }
      if (idx === tabCols.length - 1) {
        try { worksheet.mergeCells(HEADER_START + 1, clsStart, HEADER_START + 1, actualColIdx + colSpan - 1); } catch {}
      }

      // Subclass header (row HEADER_START+2)
      const subclassName = (col.subclsIndex !== null && col.clsIndex !== null)
        ? col.subdept.classes?.[col.clsIndex]?.subclasses?.[col.subclsIndex]?.name ?? '-'
        : '-';
      const scCell = worksheet.getCell(HEADER_START + 2, actualColIdx);
      scCell.value = subclassName;
      scCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
      scCell.font  = { color: { argb: 'FFFFFFFF' } }; scCell.alignment = centerAlign;
      if (colSpan > 1) {
        try { worksheet.mergeCells(HEADER_START + 2, actualColIdx, HEADER_START + 2, actualColIdx + colSpan - 1); } catch {}
      }

      // Entity-type header (row HEADER_START+3)
      const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
      specs.forEach((entityType, sIdx) => {
        const specCell = worksheet.getCell(HEADER_START + 3, actualColIdx + sIdx);
        specCell.value = entityType;
        specCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
        specCell.font  = { bold: true }; specCell.alignment = centerAlign;
        worksheet.getColumn(actualColIdx + sIdx).width = 15;
      });

      colIndex += colSpan;
    });

    // Helper: allocation lookup for export
    const getAlloc = (id: string, sdId, cIdx, scIdx, type) => {
      const sd  = currentDepartment?.subdepartments?.find(s => s.id === sdId);
      const cls = cIdx !== null ? sd?.classes?.[cIdx] : null;
      const sc  = (cls && scIdx !== null) ? cls.subclasses?.[scIdx] : null;
      const classIdPart = sc ? `${sdId}_${cls.id}_${sc.id}` : cls ? `${sdId}_${cls.id}` : `${sdId}`;
      const key = `${id}::${classIdPart}`;
      return (pendingChanges.documents[key]?.[type] ?? documentAllocations[key]?.[type]) === true;
    };

    // Data rows
    Object.entries(tabGrouped)
      .sort(([a], [b]) => parseInt(a === 'other' ? '999' : a) - parseInt(b === 'other' ? '999' : b))
      .forEach(([, group]) => {
        // Category row
        const catRow = worksheet.addRow([group.mainCategoryNumber, group.mainCategory, '', '']);
        catRow.outlineLevel = 0;
        catRow.font = { bold: true };
        catRow.fill = lightFill;

        group.documents.forEach((doc, dIdx) => {
          const rowLabel = `${group.mainCategoryNumber}.${dIdx + 1}`;
          const docRow = worksheet.addRow([rowLabel, doc.display_name, doc.id, '']);
          docRow.outlineLevel = 1;

          let dataCol = 5;
          tabCols.forEach(col => {
            const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
            specs.forEach(spec => {
              const checked = getAlloc(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec);
              const cell = docRow.getCell(dataCol++);
              if (checked) {
                cell.value = 'Yes';
                cell.alignment = centerAlign;
                cell.font = { color: { argb: 'FF00B050' }, bold: true };
              }
            });
          });

          // Field rows
          if (doc.fields?.length) {
            doc.fields.forEach(field => {
              const fieldRow = worksheet.addRow([field.path, `    ${field.name}`, doc.id, field.id]);
              fieldRow.outlineLevel = 2;
              fieldRow.font = { italic: true, color: { argb: 'FF555555' } };

              let fDataCol = 5;
              tabCols.forEach(col => {
                const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
                specs.forEach(spec => {
                  const checked = getAlloc(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, spec);
                  const cell = fieldRow.getCell(fDataCol++);
                  if (checked) {
                    cell.value = 'Yes';
                    cell.alignment = centerAlign;
                    cell.font = { color: { argb: 'FF00B050' }, bold: true };
                  }
                });
              });
            });
          }
        });
      });

    // Apply distinguishable borders between subdepartments
    const thickBorder = { style: 'thick', color: { argb: 'FF000000' } };
    subdepartmentBoundaries.forEach(colIndex => {
      // Apply thick right border to all rows in this column
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= HEADER_START) { // Only apply to header and data rows
          const cell = row.getCell(colIndex);
          cell.border = {
            ...cell.border,
            right: thickBorder
          };
        }
      });
    });

    // Freeze pane: first 4 columns + 6 header rows
    worksheet.views = [{ state: 'frozen', xSplit: 4, ySplit: HEADER_START + 4 }];
  }, [groupedDocsByTab, currentDepartment, documentAllocations, pendingChanges]);

  const exportToExcel = useCallback(async () => {
    if (!currentDepartment) return;
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Document Management';
      workbook.created = new Date();

      DOC_TABS.forEach(tab => {
        const ws = workbook.addWorksheet(tab.label, {
          properties: { outlineProperties: { summaryBelow: false, summaryRight: false } }
        });
        const tabCols = buildAllColumns(tab.value, normalizedSubdepartments);
        writeSheetForTab(ws, tab.value, tabCols);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${currentDepartment.name}_Documents_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast({ title: "✅ Export Successful", description: `3 sheets: ${DOC_TABS.map(t => t.label).join(', ')}` });
    } catch (e) {
      console.error('[Export] Failed:', e);
      toast({ title: "Export Failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [currentDepartment, buildAllColumns, normalizedSubdepartments, writeSheetForTab]);

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORT — reads "Yes" cells from each sheet and upserts to Supabase
  // ─────────────────────────────────────────────────────────────────────────────
  const handleImport = useCallback(async (file: File) => {
    if (!currentDepartment) return;
    setIsImporting(true);
    console.log(`[Import] ──────────────────────────────────────────`);
    console.log(`[Import] Starting import | File: ${file.name} | Dept: ${currentDepartment.name}`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      console.log(`[Import] Workbook loaded | Sheets: ${workbook.worksheets.map(w => w.name).join(' | ')}`);

      const deptId = parseInt(activeTab);

      // Fetch ALL current requirements for this department
      const { data: allRequirements, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('id, documents_and_fields, job_level')
        .eq('job_level->>department_id', String(deptId));
      if (fetchError) throw fetchError;
      console.log(`[Import] Existing requirement records fetched: ${allRequirements?.length ?? 0}`);

      const existingByHierarchy: Record<string, { id: string; documents_and_fields: any[] }> = {};
      (allRequirements || []).forEach(req => {
        if (!req.job_level) return;
        const hKey = [req.job_level.subdepartment_id, req.job_level.class_id, req.job_level.subclass_id]
          .filter(id => id !== null && id !== undefined).join('_');
        existingByHierarchy[hKey] = {
          id: req.id,
          documents_and_fields: Array.isArray(req.documents_and_fields) ? req.documents_and_fields : []
        };
      });

      // importChanges[hierarchyKey][entityKey] = { [boolType]: true }
      // entityKey is either docId (doc-level) or docId|fieldId (field-level)
      const importChanges: Record<string, Record<string, Record<string, boolean>>> = {};
      let totalCellsScanned = 0;
      let totalYesFound = 0;

      for (const tab of DOC_TABS) {
        const worksheet = workbook.getWorksheet(tab.label);
        if (!worksheet) {
          console.warn(`[Import] Sheet "${tab.label}" NOT FOUND — skipping`);
          continue;
        }

        const tabCols = buildVisibleColumns(tab.value, normalizedSubdepartments);
        console.log(`[Import] Sheet: "${tab.label}" | Columns mapped: ${tabCols.length}`);

        // Map Excel column index (1-based) → column metadata
        // Fixed cols: 1=#, 2=Name, 3=DocId, 4=FieldId → data starts at col 5
        const colMetaMap: Record<number, { subdept: any; clsIndex: number | null; subclsIndex: number | null; spec: string }> = {};
        let cIdx = 5;
        tabCols.forEach(col => {
          const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
          specs.forEach(spec => {
            colMetaMap[cIdx] = {
              subdept:     col.subdept,
              clsIndex:    col.clsIndex,
              subclsIndex: col.subclsIndex,
              spec
            };
            cIdx++;
          });
        });
        const maxDataCol = cIdx - 1;

        let sheetYes = 0;
        // Rows 1-6 are headers — data starts at row 7
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber < 7) return;

          const docId   = String(row.getCell(3).value ?? '').trim();
          const fieldId = String(row.getCell(4).value ?? '').trim();
          if (!docId) return; // category summary row — no docId

          let rowYes = 0;
          for (let c = 5; c <= maxDataCol; c++) {
            totalCellsScanned++;
            const meta = colMetaMap[c];
            if (!meta) continue;

            const rawVal = row.getCell(c).value;
            const cellStr = String(rawVal ?? '').trim().toLowerCase();
            if (cellStr !== 'yes') continue;

            totalYesFound++;
            sheetYes++;
            rowYes++;

            // Derive hierarchy key from column metadata
            const sd  = meta.subdept;
            const cls = meta.clsIndex !== null ? sd.classes?.[meta.clsIndex] : null;
            const sc  = (cls && meta.subclsIndex !== null) ? cls.subclasses?.[meta.subclsIndex] : null;
            const hierarchyKey = [sd.id, cls?.id, sc?.id]
              .filter(id => id !== null && id !== undefined)
              .join('_');

            // entityKey: docId for doc-level, docId|fieldId for field-level
            const entityKey = fieldId ? `${docId}|${fieldId}` : docId;

            if (!importChanges[hierarchyKey]) importChanges[hierarchyKey] = {};
            if (!importChanges[hierarchyKey][entityKey]) importChanges[hierarchyKey][entityKey] = {};
            importChanges[hierarchyKey][entityKey][meta.spec] = true;

            console.log(`[Import]   ✓ Row ${rowNumber} | Doc: ${docId} | Field: ${fieldId || '-'} | Col: ${meta.spec} | Hierarchy: ${hierarchyKey}`);
          }
        });

        console.log(`[Import] Sheet "${tab.label}" done | "Yes" cells: ${sheetYes}`);
      }

      console.log(`[Import] ── Scan complete ──────────────────────────`);
      console.log(`[Import] Cells scanned: ${totalCellsScanned} | "Yes" found: ${totalYesFound} | Hierarchy groups: ${Object.keys(importChanges).length}`);

      if (totalYesFound === 0) {
        toast({ title: "Import", description: "No 'Yes' values found. Nothing was changed." });
        return;
      }

      // ── Build upserts ─────────────────────────────────────────────────────
      const upsertPromises = Object.entries(importChanges).map(async ([hierarchyKey, entityMap]) => {
        const parts = hierarchyKey.split('_');
        const sdId  = parts[0] ? parseInt(parts[0]) : null;
        const clsId = parts[1] ? parseInt(parts[1]) : null;
        const scId  = parts[2] ? parseInt(parts[2]) : null;

        let level = 2;
        if (scId) level = 4;
        else if (clsId) level = 3;

        const jobLevelObj = {
          level, department_id: deptId,
          subdepartment_id: sdId, class_id: clsId ?? null, subclass_id: scId ?? null
        };
        const existingRecord = existingByHierarchy[hierarchyKey];

        // Start from existing documents
        const docsMap = new Map<string, any>();
        (existingRecord?.documents_and_fields || []).forEach(doc => {
          docsMap.set(String(doc.id), { ...doc, fields: Array.isArray(doc.fields) ? doc.fields : [] });
        });

        // Apply imported "Yes" values
        Object.entries(entityMap).forEach(([entityKey, typeFlags]) => {
          const isField = entityKey.includes('|');
          let docId: string, fieldId: string | undefined;
          if (isField) [docId, fieldId] = entityKey.split('|');
          else docId = entityKey;

          let docObj = docsMap.get(String(docId)) || {
            id: String(docId), fields: [], updated_at: new Date().toISOString()
          };

          if (isField && fieldId) {
            // Field-level: apply boolean flags onto the field object
            let fieldObj = docObj.fields.find((f: any) => String(f.id) === String(fieldId));
            if (!fieldObj) {
              fieldObj = { id: String(fieldId), updated_at: new Date().toISOString() };
              docObj.fields.push(fieldObj);
            }
            Object.entries(typeFlags).forEach(([type, val]) => {
              if (val) fieldObj[type] = true; else delete fieldObj[type];
            });
          } else {
            // Doc-level: apply boolean flags directly on the doc object
            Object.entries(typeFlags).forEach(([type, val]) => {
              if (val) docObj[type] = true; else delete docObj[type];
            });
          }

          docObj.updated_at = new Date().toISOString();
          docsMap.set(String(docId), docObj);
        });

        // Prune empty docs
        const finalDocs = Array.from(docsMap.values()).filter(doc => {
          const hasDocFlags   = Object.keys(doc).some(k => !['id', 'fields', 'updated_at'].includes(k) && doc[k] === true);
          const hasFieldFlags = (doc.fields || []).some((f: any) =>
            Object.keys(f).some(k => !['id', 'updated_at'].includes(k) && f[k] === true)
          );
          return hasDocFlags || hasFieldFlags;
        });

        const finalPayload = {
          job_level: jobLevelObj,
          documents_and_fields: finalDocs,
          updated_at: new Date().toISOString()
        };

        console.log(`[Import] ${existingRecord ? `UPDATE id=${existingRecord.id}` : 'INSERT new'} | Hierarchy: ${hierarchyKey} | Docs: ${finalDocs.length}`);

        if (existingRecord?.id) {
          return supabase.from('tm_class_requirements').update(finalPayload).eq('id', existingRecord.id);
        } else {
          return supabase.from('tm_class_requirements').insert([finalPayload]);
        }
      });

      const results = await Promise.all(upsertPromises);
      const err = results.find(r => r?.error);
      if (err) throw err.error;

      console.log(`[Import] All upserts complete. Refreshing UI...`);
      await fetchData(true);
      toast({
        title: "✅ Import Successful",
        description: `${totalYesFound} allocations applied across ${Object.keys(importChanges).length} hierarchy groups.`
      });
    } catch (e) {
      console.error('[Import] Failed:', e);
      toast({ title: "Import Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }, [currentDepartment, activeTab, fetchData, buildVisibleColumns, normalizedSubdepartments]);

  // ─────────────────────────────────────────────────────────────────────────────
  // UI helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleColumnExpansion   = (key) => setExpandedColumns(prev => toggleSetItem(prev, key));
  const toggleCategoryExpansion = (key) => setExpandedCategories(prev => toggleSetItem(prev, key));
  const toggleItemExpansion     = (key) => setExpandedItems(prev => toggleSetItem(prev, key));

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({ documents: {}, clientFields: {} });
    setHasUnsavedChanges(false);
  }, []);

  if (loading) return <div className="p-12 text-center animate-pulse">Loading Document Map...</div>;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen p-4">
      {/* Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
        }}
      />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Management</h1>
          {hasUnsavedChanges && <p className="text-orange-500 text-sm mt-1">Unsaved Changes Pending</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="outline" size="sm" onClick={exportToExcel} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importFileRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : "Import Excel"}
          </Button>
          <ColumnVisibilityControl
            columns={availableColumns.map(c => ({ ...c, visible: !!columnVisibility[c.id] }))}
            onVisibilityChange={(id, v) => setColumnVisibility(prev => ({ ...prev, [id]: v }))}
          />
          <div className="flex items-center gap-2 ml-2">
            <Button variant="outline" size="sm" onClick={() => toggleAllRows(!allExpanded)} className="h-8 text-xs">
              {allExpanded
                ? <><Minus className="h-3 w-3 mr-1" />Collapse All</>
                : <><Plus className="h-3 w-3 mr-1" />Expand All</>}
            </Button>
          </div>
          {hasUnsavedChanges && (
            <>
              <Button variant="outline" onClick={handleDiscardChanges} disabled={isSaving}>Discard</Button>
              <Button onClick={handleSaveAllChanges} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          {departments.map(d => (
            <TabsTrigger key={d.id} value={String(d.id)}>{d.name}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="flex items-center justify-between mb-4">
            <Tabs
              value={documentTab}
              onValueChange={value => {
                setDocumentTab(value as "company" | "individual" | "application");
                setSearchQuery("");
              }}
              className="w-full"
            >
              <div className="flex items-center justify-between">
                <TabsList>
                  {DOC_TABS.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="relative w-64 mt-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search documents..."
                  className="w-full pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <X className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer"
                    onClick={() => setSearchQuery("")} />
                )}
              </div>

              <div className="mt-4 border rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="overflow-auto max-h-[calc(100vh-250px)]">
                  <Table>
                    <TableHeader className="bg-blue-600 sticky top-0 z-20 shadow-sm">
                      <TableRow>
                        <TableHead rowSpan={4} className="bg-blue-600 text-white w-16 border-r border-blue-500 text-center">#</TableHead>
                        <TableHead rowSpan={4} className="bg-blue-600 text-white w-[300px] border-r border-blue-500 sticky left-0 z-30">Document / Field Details</TableHead>
                        {visibleColumns.reduce((acc, col, idx) => {
                          const prev = visibleColumns[idx - 1];
                          if (!prev || prev.subdept.id !== col.subdept.id) {
                            const group = visibleColumns.filter(c => c.subdept.id === col.subdept.id);
                            const span = group.reduce((s, c) => s + (c.isExpanded ? c.specifications.length : 1), 0);
                            acc.push(
                              <TableHead key={`sd-${col.subdept.id}`} colSpan={span}
                                className="bg-blue-700 text-white text-center border-r border-blue-500 font-bold">
                                {col.subdept.name}
                              </TableHead>
                            );
                          }
                          return acc;
                        }, [])}
                      </TableRow>
                      <TableRow>
                        {visibleColumns.reduce((acc, col, idx) => {
                          const prev = visibleColumns[idx - 1];
                          const isNew = !prev || prev.subdept.id !== col.subdept.id || prev.clsIndex !== col.clsIndex;
                          if (isNew) {
                            const group = visibleColumns.filter(c => c.subdept.id === col.subdept.id && c.clsIndex === col.clsIndex);
                            const span = group.reduce((s, c) => s + (c.isExpanded ? c.specifications.length : 1), 0);
                            acc.push(
                              <TableHead key={`cls-${idx}`} colSpan={span}
                                className="bg-blue-600 text-white text-center border-r border-blue-500">
                                {col.clsIndex === null ? "Direct" : col.subdept.classes[col.clsIndex].name}
                              </TableHead>
                            );
                          }
                          return acc;
                        }, [])}
                      </TableRow>
                      <TableRow>
                        {visibleColumns.map((col, idx) => (
                          <TableHead key={`sc-${idx}`} colSpan={col.isExpanded ? col.specifications.length : 1}
                            className="bg-blue-500 text-white text-center border-r border-blue-400 text-[10px]">
                            {col.subclsIndex !== null
                              ? col.subdept.classes[col.clsIndex].subclasses[col.subclsIndex].name
                              : "-"}
                          </TableHead>
                        ))}
                      </TableRow>
                      <TableRow>
                        {visibleColumns.map(col => {
                          if (!col.isExpanded) {
                            return (
                              <TableHead key={col.columnKey} style={{ width: '120px' }}
                                className="border-r border-blue-400 text-center text-white text-[10px] bg-blue-300">
                                <div className="flex items-center justify-center gap-1">
                                  <span className="truncate">{col.specifications[0]}</span>
                                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0"
                                    onClick={() => toggleColumnExpansion(col.columnKey)}>
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableHead>
                            );
                          }
                          return col.specifications.map((spec, idx) => (
                            <TableHead key={`${col.columnKey}-${spec}`} style={{ width: '120px' }}
                              className="border-r border-blue-400 text-center text-white text-[10px] bg-blue-400">
                              <div className="flex items-center justify-center gap-1">
                                <span className="uppercase">{spec}</span>
                                {idx === 0 && (
                                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0"
                                    onClick={() => toggleColumnExpansion(col.columnKey)}>
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableHead>
                          ));
                        }).flat()}
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {Object.entries(groupedDocuments)
                        .sort(([a], [b]) => parseInt(a === 'other' ? '999' : a) - parseInt(b === 'other' ? '999' : b))
                        .map(([catKey, group]) => {
                          const isCatExpanded = expandedCategories.has(catKey);
                          return (
                            <React.Fragment key={`category-${catKey}`}>
                              <TableRow
                                className="bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                                onClick={() => toggleCategoryExpansion(catKey)}>
                                <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700 w-16">
                                  {group.mainCategoryNumber}
                                </TableCell>
                                <TableCell className="sticky left-10 bg-blue-100 border-r z-[5] w-[300px]">
                                  <div className="flex items-center justify-between px-4">
                                    <span className="font-semibold text-gray-700 flex-1 min-w-0 pr-2 truncate">{group.mainCategory}</span>
                                    <span className="text-xs bg-blue-200 text-gray-700 px-2 py-1 rounded-full mr-2">{group.documents.length}</span>
                                    {isCatExpanded ? <Minus className="h-4 w-4 text-gray-600" /> : <Plus className="h-4 w-4 text-gray-600" />}
                                  </div>
                                </TableCell>
                                <TableCell colSpan={999} className="bg-blue-50" />
                              </TableRow>

                              {isCatExpanded && group.documents.map((doc, docIndex) => {
                                const isDocExpanded = expandedItems.has(doc.id);
                                const docHasFields  = doc.fields && doc.fields.length > 0;
                                return (
                                  <React.Fragment key={`doc-${doc.id}`}>
                                    <TableRow className="group hover:bg-blue-50">
                                      <TableCell className="sticky left-0 bg-white group-hover:bg-blue-50 border-r z-[5] text-center font-medium text-sm">
                                        {`${group.mainCategoryNumber}.${docIndex + 1}`}
                                      </TableCell>
                                      <TableCell className="sticky left-10 bg-white group-hover:bg-blue-50 border-r z-[5] pr-2">
                                        <div className="flex items-center justify-between px-4">
                                          <span className="font-medium text-gray-800 flex-1 min-w-0 pr-2 truncate">{doc.display_name}</span>
                                          {docHasFields && (
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-600"
                                              onClick={(e) => { e.stopPropagation(); toggleItemExpansion(doc.id); }}>
                                              {isDocExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                      {visibleColumns.map(col => {
                                        const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
                                        return specs.map(spec => (
                                          <TableCell key={`${doc.id}-${col.columnKey}-${spec}`}
                                            className="text-center border-r w-[120px]">
                                            <MemoizedCheckbox
                                              checked={getAllocationStatus(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec)}
                                              onCheckedChange={c => handleToggle(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, spec, c)}
                                            />
                                          </TableCell>
                                        ));
                                      })}
                                    </TableRow>

                                    {isDocExpanded && docHasFields && doc.fields.map((field) => (
                                      <TableRow key={`field-${field.id}`} className="bg-gray-50/80 hover:bg-gray-100">
                                        <TableCell className="sticky left-0 bg-gray-50 hover:bg-gray-100 border-r z-[5] text-center text-xs text-gray-500">
                                          {field.path}
                                        </TableCell>
                                        <TableCell className="sticky left-10 bg-gray-50 hover:bg-gray-100 border-r z-[5] pl-12 pr-4">
                                          <span className="text-sm text-gray-600">{field.name}</span>
                                        </TableCell>
                                        {visibleColumns.map(col => {
                                          const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
                                          return specs.map(spec => (
                                            <TableCell key={`${field.id}-${col.columnKey}-${spec}`}
                                              className="text-center border-r w-[120px] bg-white">
                                              <MemoizedCheckbox
                                                checked={getAllocationStatus(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, spec)}
                                                onCheckedChange={c => handleToggle(`${doc.id}|${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, spec, c)}
                                              />
                                            </TableCell>
                                          ));
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