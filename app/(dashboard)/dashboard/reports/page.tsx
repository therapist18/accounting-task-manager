// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown, 
  ChevronDown, ChevronsRight, ChevronsDown, X, FileText, ArrowLeft,
  List
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { 
  getCurrentStageStatus,
  getCellContent,
  getEnhancedImmigrationStatus,
  renderImmigrationStatusCell,
  renderCurrentStageStatusCell 
} from "../tasks/overall-view/tableUtils";
import { calculateAge } from "@/lib/utils/utils"; 
import {
  fetchTasks, 
  fetchStages,
  fetchCompanies,
  fetchAllDocuments,
  fetchAllKycFields,
  formatDateValue,
} from "../tasks/utils/taskManagerData";
import { fetchDepartments } from "../departments/departments/database";

// Extend jsPDF types
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // State for Report Management
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [availableReports, setAvailableReports] = useState<any[]>([]);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(true);

  // State for Table Data
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map());
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());

  // View State
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));

  // --- 1. INITIALIZATION: Fetch Report Definitions ---
  useEffect(() => {
    const initReports = async () => {
      setReportLoading(true);
      try {
        // Fetch list of all saved reports
        const { data: reports, error } = await supabase
          .from('tm_memorized_reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAvailableReports(reports || []);

        const reportIdParam = searchParams.get('id');
        
        if (reportIdParam) {
          // 1. Try to load from URL ID
          const selected = reports?.find(r => r.id === reportIdParam);
          if (selected) {
            setActiveReport(selected);
          }
        } else if (reports && reports.length > 0) {
          // 2. Default to the first report if no ID provided
          setActiveReport(reports[0]);
        }
      } catch (err) {
        console.error("❌ Failed to fetch reports list:", err);
        toast({ title: "Error", description: "Could not load saved reports.", variant: "destructive" });
      } finally {
        setReportLoading(false);
      }
    };

    initReports();
  }, [searchParams]); // Removed pathname/router deps to prevent loops


  // --- 2. DATA LOADING: Triggered when activeReport changes ---
  useEffect(() => {
    if (!activeReport) return;

    const loadTableData = async () => {
      console.log("🚀 ReportsPage: Starting data fetch for report:", activeReport.name);
      setLoading(true);
      try {
        // 1. Fetch Context
        const [
          deptsData,
          companiesData,
          docsData,
          kycFieldsData,
          usersMap
        ] = await Promise.all([
          fetchDepartments(),
          fetchCompanies(),
          fetchAllDocuments(),
          fetchAllKycFields()
        ]);

        const kycDocsMap = kycFieldsData?.kycDocsMap || new Map();

        // 2. Fetch Tasks & Stages (Scoped by Department if report has one)
        const deptId = activeReport.department_id?.toString();
        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(deptId),
          deptId ? fetchStages(deptId, deptsData) : Promise.resolve([]) 
        ]);

        const safeTasks = Array.isArray(tasksData) ? tasksData : [];

        // 3. Process Dependants
        const dependantsMap = new Map<string, any[]>();
        const enhancedMap = new Map<string, any>();

        safeTasks.forEach(task => {
          const age = calculateAge ? calculateAge(task.date_of_birth) : null;
          enhancedMap.set(task.id.toString(), { ...task, age });

          if (task.dependant_member && Array.isArray(task.dependant_member)) {
            dependantsMap.set(task.id.toString(), task.dependant_member);
          }
        });

        // 4. Update State
        setDepartments(deptsData || []);
        setCompanies(companiesData || new Map());
        setAllDocuments(docsData || []);
        setKycDocuments(kycDocsMap);
        setTmUsers(usersMap || new Map());
        setTasks(safeTasks);
        setStages(stagesData || []);
        setTaskDependants(dependantsMap);
        setEnhancedTasksData(enhancedMap);

      } catch (error) {
        console.error("❌ ReportsPage: Failed to load table data", error);
        toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    loadTableData();
  }, [activeReport]);

  const handleSelectReport = (report: any) => {
    setActiveReport(report);
    setIsReportDialogOpen(false);
    // Update URL
    const params = new URLSearchParams(searchParams);
    params.set('id', report.id);
    router.replace(`${pathname}?${params.toString()}`);
  };


  // --- 3. HELPER FUNCTIONS ---
  
  // WRAPPER 1: Fixes "stages.length is undefined" error for Stage Status
  const getCurrentStageStatusWrapper = useCallback((task: any) => {
    return getCurrentStageStatus(task, stages, departments, allDocuments);
  }, [stages, departments, allDocuments]);

  // WRAPPER 2: Fixes Immigration Status calculation
  const getEnhancedImmigrationStatusWrapper = useCallback((task: any) => {
    return getEnhancedImmigrationStatus(task, stages, allDocuments, kycDocuments);
  }, [stages, allDocuments, kycDocuments]);

  const getStaffName = useCallback((userId: number) => {
    if (!userId) return '';
    const user = tmUsers.get(Number(userId));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id || d.id === task.department_id)
    if (!dept) return null
    const subdept = dept.tm_subdepartments?.find((s: any) => s.id === task.subdepartment?.id || s.id === task.subdepartment_id)
    const cls = subdept?.classes?.find((c: any) => c.id.toString() === task.class_id?.toString())
    const subCls = cls?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString())
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls }
  }, [departments]);

  const getDocumentForTaskStage = useCallback((task: any, stage: any) => {
    const linkedDocumentData = task.source_document_id?.[stage.id];
    if (!linkedDocumentData) return [];
    const documentRefs = Array.isArray(linkedDocumentData) ? linkedDocumentData : [linkedDocumentData];
    return documentRefs.map(ref => {
      const documentId = typeof ref === 'string' ? ref : ref.id;
      return allDocuments.find(doc => doc.id.toString() === documentId.toString());
    }).filter(Boolean);
  }, [allDocuments]);

  const isDocumentOlderThanTask = (documentDate: string, taskDate: string) => {
    if (!documentDate || !taskDate) return false;
    try { return new Date(documentDate) < new Date(taskDate); } catch { return false; }
  };

  const getPlainTextCellContent = (task: any, column: any) => {
    switch (column.type) {
      case 'task': return task[column.field]?.toString() || task[column.field] || '-';
      case 'stage_date': {
        const stageData = task.stages?.[column.stageId];
        return stageData?.date ? formatDateValue(stageData.date) : '-';
      }
      case 'extracted_field': {
        const stage = stages.find(s => s.id === column.stageId);
        const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === column.kycId);
        if (!stage || !stageDocInfo) return 'N/A';
        const linkedDocs = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
        const linkedDocument = linkedDocs[0];
        if (!linkedDocument) return 'Not Linked';
        if (linkedDocument.indicator) return 'Indicator';
        const fieldValueRaw = linkedDocument.extracted_details?.[column.fieldName] || linkedDocument.extracted_details?.[column.fieldId];
        const isOld = isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);
        return isOld ? `${fieldValueRaw} (Old)` : (fieldValueRaw || '-');
      }
      default: return '-';
    }
  };

  // --- 4. COLUMN CONFIGURATION ---
  const columns = useMemo(() => {
    if (!activeReport || !stages.length) return [];
    const getHeaderLabel = (id: string) => id.replace(/_/g, ' ').toUpperCase();

    const generatedColumns: any[] = [];
    if (activeReport.configuration?.taskFields) {
      activeReport.configuration.taskFields.forEach((fieldId: string) => {
        generatedColumns.push({ id: `task_${fieldId}`, label: getHeaderLabel(fieldId), type: 'task', field: fieldId });
      });
    }
    if (activeReport.configuration?.stages) {
      const configuredStageIds = Object.keys(activeReport.configuration.stages);
      const orderedStages = stages.filter(s => configuredStageIds.includes(s.id));
      orderedStages.forEach(stage => {
        const stageConfig = activeReport.configuration.stages[stage.id];
        if (!stageConfig) return;
        if (stageConfig.isStageDateSelected) {
          generatedColumns.push({ id: `stage_date_${stage.id}`, label: `${stage.name} Date`, type: 'stage_date', stageId: stage.id });
        }
        if (stageConfig.documents) {
          Object.entries(stageConfig.documents).forEach(([kycId, docConfig]: [string, any]) => {
            const kycDoc = kycDocuments.get(kycId);
            if (!kycDoc) return;
            docConfig.fields.forEach((fieldId: string) => {
              const field = kycDoc.fields?.find((f: any) => f.id === fieldId);
              if (field) {
                generatedColumns.push({
                  id: `field_${stage.id}_${kycId}_${fieldId}`,
                  label: `${kycDoc.display_name || kycDoc.name} - ${field.fieldName}`,
                  type: 'extracted_field',
                  stageId: stage.id, kycId, fieldId, fieldName: field.fieldName, fieldType: field.fieldType
                });
              }
            });
          });
        }
      });
    }
    return generatedColumns;
  }, [activeReport, stages, kycDocuments]);

  const columnGroups = useMemo(() => {
    if (!columns.length) return [];
    const taskGroup = { id: 'task_details', label: "Task Details", columns: [] as any[] };
    const stageGroups = new Map();
    columns.forEach(col => {
      if (col.type === 'task') taskGroup.columns.push(col);
      else if (col.type === 'stage_date' || col.type === 'extracted_field') {
        if (!stageGroups.has(col.stageId)) {
          const stage = stages.find(s => s.id === col.stageId);
          stageGroups.set(col.stageId, { id: `stage_group_${col.stageId}`, label: stage?.name || 'Unknown', columns: [] });
        }
        stageGroups.get(col.stageId).columns.push(col);
      }
    });
    const result = [];
    if (taskGroup.columns.length > 0) result.push(taskGroup);
    result.push(...Array.from(stageGroups.values()));
    return result;
  }, [columns, stages]);

  const transposedTableRows = useMemo(() => {
    if (!activeReport) return [];
    const rows: any[] = [];
    const config = activeReport.configuration;
    const getHeaderLabel = (id: string) => id.replace(/_/g, ' ').toUpperCase();

    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase, isExpanded: expandedSections.has('task_details') });
    if (expandedSections.has('task_details') && config?.taskFields) {
      config.taskFields.forEach((fieldId: string) => {
        rows.push({ type: 'task', field: fieldId, label: getHeaderLabel(fieldId), isSubRow: true });
      });
    }
    if (config?.stages) {
      const configuredStageIds = Object.keys(config.stages);
      const orderedStages = stages.filter(s => configuredStageIds.includes(s.id));
      orderedStages.forEach(stage => {
        const stageConfig = config.stages[stage.id];
        if (!stage) return;
        rows.push({ type: 'section_header', id: stage.id, label: stage.name, icon: stage.icon || Briefcase, isExpanded: expandedSections.has(stage.id) });
        if (expandedSections.has(stage.id)) {
          if (stageConfig.isStageDateSelected) rows.push({ type: 'stage_date', stageId: stage.id, label: 'Completion Date', isSubRow: true });
          if (stageConfig.documents) {
            Object.entries(stageConfig.documents).forEach(([kycId, docConfig]: [string, any]) => {
              const kycDoc = kycDocuments.get(kycId);
              if (!kycDoc) return;
              docConfig.fields.forEach((fieldId: string) => {
                const field = kycDoc.fields?.find((f: any) => f.id === fieldId);
                if (field) rows.push({ type: 'extracted_field', stageId: stage.id, kycId, fieldId, fieldName: field.fieldName, fieldType: field.fieldType, label: `${kycDoc.display_name} - ${field.fieldName}`, isSubRow: true });
              });
            });
          }
        }
      });
    }
    return rows;
  }, [activeReport, expandedSections, stages, kycDocuments]);

  // --- 5. RENDER CELL ---
  const renderCell = (task: any, column: any) => {
    switch (column.type) {
      case 'task':
        // FIXED: Passing Wrappers instead of raw functions
        return getCellContent(
          task, 
          column.field, 
          enhancedTasksData, 
          taskDependants, 
          new Set(), 
          companies, 
          getTaskHierarchy, 
          getStaffName, 
          getEnhancedImmigrationStatusWrapper, // Passed wrapper
          getCurrentStageStatusWrapper, // Passed wrapper
          (t) => renderImmigrationStatusCell(
            t, 
            getEnhancedImmigrationStatusWrapper,
            new Set(),
            () => {} // No-op for toggle since we're not using expansion in reports
          ), 
          (t) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper), 
          () => { }, 
          () => { }, 
          () => { }
        );
      case 'stage_date': {
        const stageData = task.stages?.[column.stageId];
        return stageData?.date ? <div>{formatDateValue(stageData.date)}</div> : <div className="text-red-400">-</div>;
      }
      case 'extracted_field': {
        const stage = stages.find(s => s.id === column.stageId);
        const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === column.kycId);
        if (!stage || !stageDocInfo) return <span className="text-slate-300">-</span>;
        const linkedDocs = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
        const linkedDocument = linkedDocs[0];
        if (!linkedDocument) return <Badge variant="outline" className="text-xs border-dashed text-slate-400 font-normal">No Doc</Badge>;
        if (linkedDocument.indicator) return <Badge variant="destructive" className="text-xs font-normal">Indicator</Badge>;
        const rawVal = linkedDocument.extracted_details?.[column.fieldName] || linkedDocument.extracted_details?.[column.fieldId];
        const displayVal = (column.fieldType?.toLowerCase() === 'date') ? formatDateValue(rawVal) : rawVal;
        const isOld = isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);
        return <div className="flex items-center gap-1"><span className={`text-sm ${isOld ? 'text-slate-500' : 'text-slate-700'}`}>{displayVal || '-'}</span></div>;
      }
      default: return '-';
    }
  };

  // --- 6. EXPORT ---
  const handleExportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    const headerStyle = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00529B' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true }, alignment: { vertical: 'middle', horizontal: 'center' } };

    if (view === 'standard') {
      const headers = columns.map(c => c.label);
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => cell.style = headerStyle as any);
      tasks.forEach(task => sheet.addRow(columns.map(col => getPlainTextCellContent(task, col))));
    } else {
      const headers = ['Details', ...tasks.map(t => t.applicant_name)];
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => cell.style = headerStyle as any);
      transposedTableRows.forEach(row => {
        if (row.type === 'section_header') sheet.addRow([row.label]).getCell(1).font = { bold: true };
        else sheet.addRow([row.label, ...tasks.map(task => getPlainTextCellContent(task, row))]);
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `report_${activeReport.name.replace(/\s+/g, '_')}.xlsx`;
    link.click();
  };

  const handleExportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text(`Report: ${activeReport.name}`, 14, 16);
    let head = view === 'standard' ? [columns.map(c => c.label)] : [['Details', ...tasks.map(t => t.applicant_name)]];
    let body = view === 'standard' 
      ? tasks.map(task => columns.map(col => getPlainTextCellContent(task, col))) 
      : transposedTableRows.filter(r => r.type !== 'section_header').map(row => [row.label, ...tasks.map(task => getPlainTextCellContent(task, row))]);
    
    doc.autoTable({ head, body, startY: 25, theme: 'grid', styles: { fontSize: 8 } });
    doc.save(`report_${activeReport.name.replace(/\s+/g, '_')}.pdf`);
  };

  // --- 7. RENDER ---
  
  if (reportLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  // If no report selected and loading finished, we still show the structure but with an overlay or empty state if strictly needed.
  // However, the useEffect auto-selects the first report, so activeReport should be present unless 0 reports exist.

  return (
    <div className="space-y-4 p-4 bg-white min-h-screen">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
           {/* Report Switcher Dialog */}
           <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-white border-blue-300 text-blue-700 hover:bg-blue-100 gap-2">
                  <List className="h-4 w-4" /> Switch Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Select a Report</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 mt-4">
                  {availableReports.length > 0 ? (
                    availableReports.map((rpt) => (
                      <div 
                        key={rpt.id} 
                        onClick={() => handleSelectReport(rpt)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeReport?.id === rpt.id ? 'bg-blue-100 border-blue-500' : 'hover:bg-slate-50 border-slate-200'}`}
                      >
                        <div className="font-semibold text-sm">{rpt.name}</div>
                        {rpt.description && <div className="text-xs text-slate-500">{rpt.description}</div>}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-slate-500">No saved reports found.</div>
                  )}
                </div>
              </DialogContent>
           </Dialog>

           <div>
             {activeReport ? (
               <>
                 <h3 className="font-bold text-xl text-blue-900 flex items-center gap-2">{activeReport.name}</h3>
                 <p className="text-sm text-blue-700">{activeReport.description}</p>
               </>
             ) : (
               <h3 className="font-bold text-xl text-slate-400">No Report Selected</h3>
             )}
           </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-md border flex">
            <Button variant={view === 'standard' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('standard')} className="gap-2"><Rows className="h-4 w-4" /> Standard</Button>
            <div className="w-px bg-slate-200 my-1"></div>
            <Button variant={view === 'transposed' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('transposed')} className="gap-2"><LayoutGrid className="h-4 w-4" /> Transposed</Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2 bg-white"><FileDown className="h-4 w-4" /> Export <ChevronDown className="h-4 w-4 opacity-50" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportToExcel}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportToPDF}>PDF (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {view === 'transposed' && (
        <div className="flex justify-end gap-2 mb-2">
          <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set([...Array.from(expandedSections), ...transposedTableRows.map(r => r.id)]))}><ChevronsDown className="h-3 w-3 mr-1" /> Expand All</Button>
          <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set())}><ChevronsRight className="h-3 w-3 mr-1" /> Collapse All</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>
      ) : activeReport ? (
        <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <Table className="min-w-full border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-sm">
              {view === 'standard' ? (
                <>
                  <TableRow>
                    <TableHead rowSpan={2} className="sticky left-0 z-30 bg-slate-200 border-b-2 border-slate-400 w-12 text-center">#</TableHead>
                    {columnGroups.map((group: any) => (
                      <TableHead key={group.id} colSpan={group.columns.length} className="p-2 text-white font-semibold border-b-2 border-slate-400 bg-blue-600 text-center">{group.label}</TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {columns.map((col: any) => (
                      <TableHead key={col.id} className="whitespace-nowrap p-2 text-slate-700 font-medium bg-slate-200 border-b-2 border-slate-400">{col.label}</TableHead>
                    ))}
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableHead className="sticky left-0 z-30 bg-blue-700 min-w-[250px] p-2 text-white font-semibold border-r">Details / Applicant</TableHead>
                  {tasks.map(task => (
                    <TableHead key={task.id} className="whitespace-nowrap min-w-[200px] p-2 border-x border-blue-500 bg-blue-600 text-white">{task.applicant_name}</TableHead>
                  ))}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {view === 'standard' ? (
                tasks.length > 0 ? tasks.map((task, index) => (
                  <TableRow key={task.id} className="hover:bg-slate-50">
                    <TableCell className="sticky left-0 z-10 bg-white border-r text-center text-slate-500 text-xs">{index + 1}</TableCell>
                    {columns.map((col: any) => <TableCell key={`${task.id}-${col.id}`} className="text-sm p-2 border">{renderCell(task, col)}</TableCell>)}
                  </TableRow>
                )) : <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-8 text-slate-500">No tasks found matching this report criteria.</TableCell></TableRow>
              ) : (
                transposedTableRows.map((row: any, index: number) => {
                  if (row.type === 'section_header') {
                    const Icon = row.icon;
                    return (
                      <TableRow key={row.id} className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => setExpandedSections(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}>
                        <TableCell className="sticky left-0 z-10 bg-slate-100 border-r py-2 px-3" colSpan={tasks.length + 1}>
                          <div className="flex items-center gap-2">{row.isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{Icon && <Icon className="h-4 w-4 text-slate-500" />}<span className="font-semibold text-slate-700">{row.label}</span></div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={`${row.type}-${row.label}-${index}`} className="group border-b">
                      <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-blue-50 border-r font-medium text-sm text-slate-600 p-2 pl-8">{row.label}</TableCell>
                      {tasks.map(task => <TableCell key={`${task.id}-${row.label}`} className="text-sm p-2 border-r group-hover:bg-blue-50/30">{renderCell(task, row)}</TableCell>)}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-20 text-slate-400">Please create a report to view data.</div>
      )}
    </div>
  );
}