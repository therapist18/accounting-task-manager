// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback, memo, useRef, startTransition } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Minus, Search, X, Download } from "lucide-react"
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

export default function DocumentsFields() {
  // State
  const [departments, setDepartments] = useState<Department[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [documentAllocations, setDocumentAllocations] = useState<Record<string, any>>({})
  const [clientFieldAllocations, setClientFieldAllocations] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<string>("")
  const [documentTab, setDocumentTab] = useState<"company" | "individual" | "application">("company")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // UI State
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())
  const [availableColumns, setAvailableColumns] = useState<ColumnVisibilityOption[]>([])
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  
  // Changes State
  const [pendingChanges, setPendingChanges] = useState({ documents: {}, clientFields: {} })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("");
  const [allExpanded, setAllExpanded] = useState(false);
  
  const lastFetchTimeRef = useRef(0)

  // 1. Optimized Unified Fetch
  const fetchData = useCallback(async () => {
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 1000) return
    lastFetchTimeRef.current = now

    try {
      setLoading(true)
      const [depts, docs, requirements] = await Promise.all([
        supabase.from('tm_departments')
          .select(`*, tm_subdepartments (*, classes)`)
          .order('order', { ascending: true }),
        supabase.from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true }),
        supabase.from('tm_class_requirements')
          .select('documents_and_fields, client_fields, job_level')
      ]);

      if (depts.error || docs.error || requirements.error) throw new Error("Fetch failed");

      // Sort Subdepartments by 'order'
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

      const docAllocations = {};
      const fieldAllocations = {};
      
      requirements.data?.forEach(req => {
        if (!req.job_level) return;
        
        // Generate class identifier from job_level
        const classId = [
          req.job_level.subdepartment_id,
          req.job_level.class_id,
          req.job_level.subclass_id
        ].filter(id => id !== null && id !== undefined).join('_');
        
        // Map DB structure to internal allocation state
        (req.documents_and_fields || []).forEach(doc => {
          // Iterate over keys to find entity types (excluding standard keys like id, fields, updated_at)
          Object.keys(doc).forEach(key => {
            if (key !== 'id' && key !== 'fields' && key !== 'updated_at' && doc[key] === true) {
               docAllocations[`${doc.id}_${classId}`] = { ...docAllocations[`${doc.id}_${classId}`], [key]: true };
            }
          });

          // Map fields
          (doc.fields || []).forEach(f => {
             Object.keys(f).forEach(key => {
                if (key !== 'id' && key !== 'updated_at' && f[key] === true) {
                   docAllocations[`${doc.id}-${f.id}_${classId}`] = { ...docAllocations[`${doc.id}-${f.id}_${classId}`], [key]: true };
                }
             });
          });
        });
      });

      // Build Columns (Keep existing logic)
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
        setDocumentAllocations(docAllocations);
        setClientFieldAllocations(fieldAllocations);
        setAvailableColumns(cols);
        if (transformedDepts.length > 0 && (!activeTab || !transformedDepts.find(d => d.id === activeTab))) {
           setActiveTab(transformedDepts[0].id);
        }
      });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData() }, [fetchData]);

  useEffect(() => {
    if (availableColumns.length > 0 && Object.keys(columnVisibility).length === 0) {
      const initialVisibility: Record<string, boolean> = {};
      availableColumns.forEach(col => {
        initialVisibility[col.id] = col.isDefault ?? true; 
      });
      setColumnVisibility(initialVisibility);
    }
  }, [availableColumns]);

  // 2. Data Processing & Memoization
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
        subclasses: cls.subClasses || cls.subclasses || [] 
      }))
    }));
  }, [currentDepartment]);

  const visibleColumns = useMemo(() => {
    const cols = [];
    const isIndiv = documentTab === "individual";

    normalizedSubdepartments.forEach(sd => {
      const getFilteredEntityTypes = (item) => {
        const raw = item?.entity_types
          ? Array.isArray(item.entity_types)
            ? item.entity_types
            : JSON.parse(item.entity_types || "[]")
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
        if(specs.length === 0) specs = ["Standard"];

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
  }, [normalizedSubdepartments, columnVisibility, expandedColumns, documentTab]);

  // 3. Interaction Handlers
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


  // 4. UPDATED Save Logic
  const handleSaveAllChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      // Group changes by Class Hierarchy to process them in batches
      const changesByHierarchy = {};

      // Process Document Changes
      Object.entries(pendingChanges.documents).forEach(([allocationKey, changes]) => {
        // allocationKey format: docId_sdId_clsId_scId OR docId-fieldId_sdId_clsId_scId
        const lastUnderscore = allocationKey.indexOf('_');
        if (lastUnderscore === -1) return;

        const entityPart = allocationKey.substring(0, lastUnderscore); // docId or docId-fieldId
        const hierarchyPart = allocationKey.substring(lastUnderscore + 1); // sdId_clsId_scId or just sdId

        if (!changesByHierarchy[hierarchyPart]) {
          changesByHierarchy[hierarchyPart] = { documents: {} };
        }
        changesByHierarchy[hierarchyPart].documents[entityPart] = changes;
      });

      // Execute updates per hierarchy (Job Level)
      const savePromises = Object.entries(changesByHierarchy).map(async ([hierarchyKey, data]) => {
        const parts = hierarchyKey.split('_');
        const sdId = parts[0] ? parseInt(parts[0]) : null;
        const clsId = parts[1] ? parseInt(parts[1]) : null;
        const scId = parts[2] ? parseInt(parts[2]) : null;
        const deptId = parseInt(activeTab);

        // Determine level
        let currentLevel = 1; 
        if (scId) currentLevel = 4;
        else if (clsId) currentLevel = 3;
        else if (sdId) currentLevel = 2;

        const jobLevelQuery = {
          level: currentLevel,
          department_id: deptId,
          subdepartment_id: sdId,
          class_id: clsId,
          subclass_id: scId
        };

        // 1. Fetch Existing Record
        const { data: existingRecord, error: fetchError } = await supabase
          .from('tm_class_requirements')
          .select('id, documents_and_fields, client_fields')
          .match({ 
             'job_level->>department_id': jobLevelQuery.department_id,
             'job_level->>subdepartment_id': jobLevelQuery.subdepartment_id || 'null',
             'job_level->>class_id': jobLevelQuery.class_id || 'null',
             'job_level->>subclass_id': jobLevelQuery.subclass_id || 'null'
          })
          .maybeSingle();

        if (fetchError) throw fetchError;

        // 2. Prepare Data Structures
        // Map: DocumentID -> DocObject
        const docsMap = new Map();
        
        if (existingRecord?.documents_and_fields) {
          existingRecord.documents_and_fields.forEach(doc => docsMap.set(doc.id, doc));
        }

        // 3. Merge Changes
        const docChanges = data.documents; // { "docId": { "Company": true }, "docId-fieldId": { "Individual": false } }
        
        Object.entries(docChanges).forEach(([entityKey, typeChanges]) => {
          const isField = entityKey.includes('-');
          let docId, fieldId;

          if (isField) {
            [docId, fieldId] = entityKey.split('-');
          } else {
            docId = entityKey;
          }

          // Get or Initialize Document
          let docObj = docsMap.get(docId);
          if (!docObj) {
            docObj = { id: docId, fields: [], updated_at: new Date().toISOString() };
          } else {
            // Update timestamp on modify
            docObj.updated_at = new Date().toISOString(); 
          }

          if (isField) {
            // Handle Field Update
            if (!docObj.fields) docObj.fields = [];
            
            let fieldObj = docObj.fields.find(f => f.id === fieldId);
            if (!fieldObj) {
              fieldObj = { id: fieldId, updated_at: new Date().toISOString() };
              docObj.fields.push(fieldObj);
            } else {
               fieldObj.updated_at = new Date().toISOString();
            }

            // Apply dynamic entity types to Field (e.g. { "Company": true, "Individual": false })
            Object.entries(typeChanges).forEach(([type, value]) => {
               fieldObj[type] = value;
            });

          } else {
            // Handle Document Update
            // Apply dynamic entity types to Document (e.g. { "Company": true })
            Object.entries(typeChanges).forEach(([type, value]) => {
              docObj[type] = value;
            });
          }

          docsMap.set(docId, docObj);
        });

        const finalDocuments = Array.from(docsMap.values());

        const payload = {
          documents_and_fields: finalDocuments,
          job_level: jobLevelQuery,
          updated_at: new Date().toISOString(),
        };

        // 4. Update or Insert
        if (existingRecord?.id) {
          const { error } = await supabase
            .from('tm_class_requirements')
            .update(payload)
            .eq('id', existingRecord.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('tm_class_requirements')
            .insert([payload]);
          if (error) throw error;
        }
      });

      await Promise.all(savePromises);
      
      setPendingChanges({ documents: {}, clientFields: {} });
      setHasUnsavedChanges(false);
      await fetchData(); // Refresh data from DB
      toast({ title: "Success", description: "Changes saved successfully." });
    } catch (error) {
      console.error("Save Error:", error);
      toast({ title: "Error", description: "Failed to save changes. " + error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, hasUnsavedChanges, fetchData, activeTab]);

  const exportToExcel = async () => {
    if (!currentDepartment) return;
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${currentDepartment.name} Docs`, {
        properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
      });

      // Styling Constants
      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } }; // Dark Blue
      const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }; // Medium Blue
      const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }; // Light Blue
      const whiteFont = { color: { argb: 'FFFFFFFF' }, bold: true };
      const centerAlign = { vertical: 'middle', horizontal: 'center' };

      // --- Meta Header ---
      worksheet.mergeCells('A1:E1');
      worksheet.getCell('A1').value = `Documents for ${currentDepartment.name} - ${documentTab.toUpperCase()}`;
      worksheet.getCell('A1').font = { size: 16, bold: true };
      worksheet.getCell('A1').alignment = { vertical: 'middle' };

      // --- Column Headers Construction ---
      const headerRowStart = 3;
      
      const fixedCols = ['#', 'Document / Field Details'];
      fixedCols.forEach((text, i) => {
        const col = i + 1;
        worksheet.mergeCells(headerRowStart, col, headerRowStart + 3, col);
        const cell = worksheet.getCell(headerRowStart, col);
        cell.value = text;
        cell.fill = headerFill;
        cell.font = whiteFont;
        cell.alignment = centerAlign;
        worksheet.getColumn(col).width = i === 0 ? 8 : 50;
      });

      let colIndex = 3; 
      
      let lastSd = null, sdStart = 0;
      let lastCls = null, clsStart = 0;

      visibleColumns.forEach((col, idx) => {
        const actualColIdx = colIndex; 
        const colSpan = col.isExpanded ? col.specifications.length : 1;
        
        // 1. Subdepartment Header
        if (!lastSd || lastSd.id !== col.subdept.id) {
            if (lastSd && sdStart) {
               worksheet.mergeCells(headerRowStart, sdStart, headerRowStart, actualColIdx - 1);
            }
            lastSd = col.subdept;
            sdStart = actualColIdx;
            
            const cell = worksheet.getCell(headerRowStart, actualColIdx);
            cell.value = col.subdept.name;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
            cell.font = whiteFont;
            cell.alignment = centerAlign;
        }
        if (idx === visibleColumns.length - 1) {
             worksheet.mergeCells(headerRowStart, sdStart, headerRowStart, actualColIdx + colSpan - 1);
        }

        // 2. Class Header
        const className = col.clsIndex === null ? "Direct" : col.subdept.classes[col.clsIndex].name;
        const uniqueClassId = `${col.subdept.id}-${col.clsIndex}`;
        
        if (!lastCls || lastCls.id !== uniqueClassId) {
             if (lastCls && clsStart) {
                worksheet.mergeCells(headerRowStart + 1, clsStart, headerRowStart + 1, actualColIdx - 1);
             }
             lastCls = { id: uniqueClassId, name: className };
             clsStart = actualColIdx;

             const cell = worksheet.getCell(headerRowStart + 1, actualColIdx);
             cell.value = className;
             cell.fill = subHeaderFill;
             cell.font = whiteFont;
             cell.alignment = centerAlign;
        }
        if (idx === visibleColumns.length - 1) {
            worksheet.mergeCells(headerRowStart + 1, clsStart, headerRowStart + 1, actualColIdx + colSpan - 1);
        }

        // 3. Subclass Header
        const subclassName = col.subclsIndex !== null ? col.subdept.classes[col.clsIndex].subclasses[col.subclsIndex].name : "-";
        const scCell = worksheet.getCell(headerRowStart + 2, actualColIdx);
        scCell.value = subclassName;
        scCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
        scCell.font = { color: { argb: 'FFFFFFFF' } };
        scCell.alignment = centerAlign;
        if (colSpan > 1) {
            worksheet.mergeCells(headerRowStart + 2, actualColIdx, headerRowStart + 2, actualColIdx + colSpan - 1);
        }

        // 4. Entity Type Header
        if (col.isExpanded) {
            col.specifications.forEach((entityType, sIdx) => {
                const specCell = worksheet.getCell(headerRowStart + 3, actualColIdx + sIdx);
                specCell.value = entityType;
                specCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
                specCell.font = { bold: true };
                specCell.alignment = centerAlign;
                worksheet.getColumn(actualColIdx + sIdx).width = 15;
            });
        } else {
            const specCell = worksheet.getCell(headerRowStart + 3, actualColIdx);
            specCell.value = col.specifications[0];
            specCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
            specCell.font = { bold: true };
            specCell.alignment = centerAlign;
            worksheet.getColumn(actualColIdx).width = 15;
        }

        colIndex += colSpan;
      });

      // --- Data Rows ---
      Object.entries(groupedDocuments).sort(([a], [b]) => parseInt(a) - parseInt(b)).forEach(([catKey, group]) => {
         const catRow = worksheet.addRow([group.mainCategoryNumber, group.mainCategory]);
         catRow.outlineLevel = 0;
         catRow.font = { bold: true };
         catRow.fill = lightFill;

         group.documents.forEach((doc, dIdx) => {
             const docRowIdx = `${group.mainCategoryNumber}.${dIdx + 1}`;
             const row = worksheet.addRow([docRowIdx, doc.display_name]);
             row.outlineLevel = 1;
             
             let currentDataCol = 3;
             visibleColumns.forEach(col => {
                 const entityTypes = col.isExpanded ? col.specifications : [col.specifications[0]];
                 entityTypes.forEach(entityType => {
                     const isChecked = getAllocationStatus(doc.id, col.subdept.id, col.clsIndex, col.subclsIndex, entityType);
                     const cell = row.getCell(currentDataCol++);
                     if (isChecked) {
                         cell.value = '✓';
                         cell.alignment = centerAlign;
                         cell.font = { color: { argb: 'FF00B050' }, bold: true }; 
                     }
                 });
             });

             if (doc.fields && doc.fields.length > 0) {
                 doc.fields.forEach(field => {
                     const fieldRow = worksheet.addRow([field.path, `    ${field.name}`]);
                     fieldRow.outlineLevel = 2;
                     fieldRow.font = { italic: true, color: { argb: 'FF555555' } };
                     
                     let fieldDataCol = 3;
                     visibleColumns.forEach(col => {
                        const entityTypes = col.isExpanded ? col.specifications : [col.specifications[0]];
                        entityTypes.forEach(entityType => {
                            const isChecked = getAllocationStatus(`${doc.id}-${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, entityType);
                            const cell = fieldRow.getCell(fieldDataCol++);
                            if (isChecked) {
                                cell.value = '✓';
                                cell.alignment = centerAlign;
                                cell.font = { color: { argb: 'FF00B050' }, bold: true };
                            }
                        });
                     });
                 });
             }
         });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${currentDepartment.name}_Documents_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast({ title: "Export Successful" });

    } catch (e) {
      console.error(e);
      toast({ title: "Export Failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const toggleColumnExpansion = (key) => setExpandedColumns(prev => toggleSetItem(prev, key));
  const toggleCategoryExpansion = (key) => setExpandedCategories(prev => toggleSetItem(prev, key));
  const toggleItemExpansion = (key) => setExpandedItems(prev => toggleSetItem(prev, key));

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({ documents: {}, clientFields: {} })
    setHasUnsavedChanges(false)
  }, [])

  if (loading) return <div className="p-12 text-center animate-pulse">Loading Document Map...</div>;

  return (
    <div className="w-full min-h-screen p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Management</h1>
          {hasUnsavedChanges && <p className="text-orange-500 text-sm">Unsaved Changes Pending</p>}
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={exportToExcel} disabled={isExporting}>
             <Download className="mr-2 h-4 w-4" />
             {isExporting ? "Exporting..." : "Export Excel"}
           </Button>
          <ColumnVisibilityControl columns={availableColumns.map(c => ({ ...c, visible: !!columnVisibility[c.id] }))} onVisibilityChange={(id, v) => setColumnVisibility(prev => ({ ...prev, [id]: v }))} />
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllRows(!allExpanded)}
              className="h-8 text-xs"
            >
              {allExpanded ? <><Minus className="h-3 w-3 mr-1" />Collapse All</> : <><Plus className="h-3 w-3 mr-1" />Expand All</>}
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
          {departments.map(d => <TabsTrigger key={d.id} value={d.id}>{d.name}</TabsTrigger>)}
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
                  <TabsTrigger value="company">Company Documents</TabsTrigger>
                  <TabsTrigger value="individual">Individual Documents</TabsTrigger>
                  <TabsTrigger value="application">Application Documents</TabsTrigger>
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
                  <X className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => setSearchQuery("")} />
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
                            acc.push(<TableHead key={`sd-${col.subdept.id}`} colSpan={span} className="bg-blue-700 text-white text-center border-r border-blue-500 font-bold">{col.subdept.name}</TableHead>);
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
                            acc.push(<TableHead key={`cls-${idx}`} colSpan={span} className="bg-blue-600 text-white text-center border-r border-blue-500">{col.clsIndex === null ? "Direct" : col.subdept.classes[col.clsIndex].name}</TableHead>);
                          }
                          return acc;
                        }, [])}
                      </TableRow>
                      <TableRow>
                        {visibleColumns.map((col, idx) => (
                          <TableHead key={`sc-${idx}`} colSpan={col.isExpanded ? col.specifications.length : 1} className="bg-blue-500 text-white text-center border-r border-blue-400 text-[10px]">
                            {col.subclsIndex !== null ? col.subdept.classes[col.clsIndex].subclasses[col.subclsIndex].name : "-"}
                          </TableHead>
                        ))}
                      </TableRow>
                      <TableRow>
                        {visibleColumns.map(col => {
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
                              <TableRow className="bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer" onClick={() => toggleCategoryExpansion(catKey)}>
                                <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700 w-16">{group.mainCategoryNumber}</TableCell>
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
                                const docHasFields = doc.fields && doc.fields.length > 0;
                                return (
                                  <React.Fragment key={`doc-${doc.id}`}>
                                    <TableRow className="group hover:bg-blue-50">
                                      <TableCell className="sticky left-0 bg-white group-hover:bg-blue-50 border-r z-[5] text-center font-medium text-sm">{`${group.mainCategoryNumber}.${docIndex + 1}`}</TableCell>
                                      <TableCell className="sticky left-10 bg-white group-hover:bg-blue-50 border-r z-[5] pr-2">
                                        <div className="flex items-center justify-between px-4">
                                          <span className="font-medium text-gray-800 flex-1 min-w-0 pr-2 truncate">{doc.display_name}</span>
                                          {docHasFields && (
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-600" onClick={(e) => { e.stopPropagation(); toggleItemExpansion(doc.id); }}>
                                              {isDocExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                      {visibleColumns.map(col => {
                                         const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
                                         return specs.map(spec => (
                                           <TableCell key={`${doc.id}-${col.columnKey}-${spec}`} className="text-center border-r w-[120px]">
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
                                        <TableCell className="sticky left-0 bg-gray-50 hover:bg-gray-100 border-r z-[5] text-center text-xs text-gray-500">{field.path}</TableCell>
                                        <TableCell className="sticky left-10 bg-gray-50 hover:bg-gray-100 border-r z-[5] pl-12 pr-4"><span className="text-sm text-gray-600">{field.name}</span></TableCell>
                                        {visibleColumns.map(col => {
                                            const specs = col.isExpanded ? col.specifications : [col.specifications[0]];
                                            return specs.map(spec => (
                                              <TableCell key={`${field.id}-${col.columnKey}-${spec}`} className="text-center border-r w-[120px] bg-white">
                                                 <MemoizedCheckbox 
                                                    checked={getAllocationStatus(`${doc.id}-${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, spec)} 
                                                    onCheckedChange={c => handleToggle(`${doc.id}-${field.id}`, col.subdept.id, col.clsIndex, col.subclsIndex, spec, c)} 
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