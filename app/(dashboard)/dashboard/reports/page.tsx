// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown, 
  ChevronDown, ChevronsRight, ChevronsDown, X, FileText, ArrowLeft,
  List, ChevronLeft, ChevronRight, AlertTriangle
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

// --- Helper for Safe Rendering ---
const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string' || typeof content === 'number') return content;
  if (content === null || content === undefined) return null;
  if (Array.isArray(content)) {
    return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  }
  if (typeof content === 'object') {
    if ('status' in content) {
       const status = content.status;
       if (typeof status === 'string' || typeof status === 'number') return status;
       if (React.isValidElement(status)) return status;
       if (!status) return null;
       return JSON.stringify(status);
    }
    return <span className="text-xs text-gray-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
  }
  return String(content);
};

export default function ReportsPage() {

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

  // View State (Pagination & Expansion)
  const [currentPage, setCurrentPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(10);
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));

  // --- 1. INITIALIZATION: Fetch Report Definitions ---
  useEffect(() => {
    const initReports = async () => {
      setReportLoading(true);
      try {
        const { data: reports, error } = await supabase
          .from('tm_memorized_reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAvailableReports(reports || []);
        
        // Just use the first report by default
        if (reports && reports.length > 0) {
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
  }, []);

  // --- 2. DATA LOADING ---
  useEffect(() => {
    if (!activeReport) return;

    const loadTableData = async () => {
      setLoading(true);
      try {
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
        const deptId = activeReport.department_id?.toString();
        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(deptId),
          deptId ? fetchStages(deptId, deptsData) : Promise.resolve([]) 
        ]);

        const safeTasks = Array.isArray(tasksData) ? tasksData : [];
        const dependantsMap = new Map<string, any[]>();
        const enhancedMap = new Map<string, any>();

        safeTasks.forEach(task => {
          const age = calculateAge ? calculateAge(task.date_of_birth) : null;
          enhancedMap.set(task.id.toString(), { ...task, age });

          if (task.dependant_member && Array.isArray(task.dependant_member)) {
            dependantsMap.set(task.id.toString(), task.dependant_member);
          }
        });

        setDepartments(deptsData || []);
        setCompanies(companiesData || new Map());
        setAllDocuments(docsData || []);
        setKycDocuments(kycDocsMap);
        setTmUsers(usersMap || new Map());
        setTasks(safeTasks);
        setStages(stagesData || []);
        setTaskDependants(dependantsMap);
        setEnhancedTasksData(enhancedMap);
        setCurrentPage(1); // Reset pagination on new report load

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
  };

  // --- 3. HELPER FUNCTIONS ---
  const getCurrentStageStatusWrapper = useCallback((task: any) => {
    return getCurrentStageStatus(task, stages, departments, allDocuments);
  }, [stages, departments, allDocuments]);

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

  // --- 4. DATA PROCESSING ---
  
  // A. Pagination Logic
  const totalColumns = tasks.length;
  const totalPages = Math.ceil(totalColumns / columnsPerPage);
  
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * columnsPerPage;
    return tasks.slice(startIndex, startIndex + columnsPerPage);
  }, [tasks, currentPage, columnsPerPage]);

  const handleNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const handlePreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const handleColumnsPerPageChange = (val: string) => {
    setColumnsPerPage(Number(val));
    setCurrentPage(1);
  };

  // B. Row Structure Logic
  const transposedTableRows = useMemo(() => {
    if (!activeReport) return [];
    const rows: any[] = [];
    const config = activeReport.configuration;
    const getHeaderLabel = (id: string) => id.replace(/_/g, ' ').toUpperCase();

    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase });
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
        rows.push({ type: 'section_header', id: stage.id, label: stage.name, icon: stage.icon || Briefcase });
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
        return getCellContent(
          task, 
          column.field, 
          enhancedTasksData, 
          taskDependants, 
          new Set(), 
          companies, 
          getTaskHierarchy, 
          getStaffName, 
          getEnhancedImmigrationStatusWrapper,
          getCurrentStageStatusWrapper,
          (t) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => {}), 
          (t) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper), 
          () => { }, () => { }, () => { }
        );
      case 'stage_date': {
        const stageData = task.stages?.[column.stageId];
        return stageData?.date ? <div className="text-xs text-slate-700">{formatDateValue(stageData.date)}</div> : <div className="text-slate-300">-</div>;
      }
      case 'extracted_field': {
        const stage = stages.find(s => s.id === column.stageId);
        const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === column.kycId);
        if (!stage || !stageDocInfo) return <span className="text-slate-300">-</span>;
        const linkedDocs = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
        const linkedDocument = linkedDocs[0];
        if (!linkedDocument) return <Badge variant="outline" className="text-[10px] border-dashed text-slate-400 font-normal px-1 py-0 h-5">No Doc</Badge>;
        if (linkedDocument.indicator) return <Badge variant="destructive" className="text-[10px] font-normal px-1 py-0 h-5">Indicator</Badge>;
        const rawVal = linkedDocument.extracted_details?.[column.fieldName] || linkedDocument.extracted_details?.[column.fieldId];
        const displayVal = (column.fieldType?.toLowerCase() === 'date') ? formatDateValue(rawVal) : rawVal;
        const isOld = isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);
        return <div className="flex items-center gap-1"><span className={`text-xs ${isOld ? 'text-slate-400 italic' : 'text-slate-700'}`}>{displayVal || '-'}</span></div>;
      }
      default: return '-';
    }
  };

  const toggleSectionExpansion = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- 6. EXPORT ---
  const handleExportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    const headerStyle = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00529B' } }, font: { color: { argb: 'FFFFFFFF' }, bold: true }, alignment: { vertical: 'middle', horizontal: 'center' } };

    const headers = ['Details', ...tasks.map(t => t.applicant_name)];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell(cell => cell.style = headerStyle as any);
    transposedTableRows.forEach(row => {
      if (row.type === 'section_header') sheet.addRow([row.label]).getCell(1).font = { bold: true };
      else sheet.addRow([row.label, ...tasks.map(task => getPlainTextCellContent(task, row))]);
    });

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
    let head = [['Details', ...tasks.map(t => t.applicant_name)]];
    let body = transposedTableRows.filter(r => r.type !== 'section_header').map(row => [row.label, ...tasks.map(task => getPlainTextCellContent(task, row))]);
    doc.autoTable({ head, body, startY: 25, theme: 'grid', styles: { fontSize: 8 } });
    doc.save(`report_${activeReport.name.replace(/\s+/g, '_')}.pdf`);
  };

  // --- 7. RENDER ---
  
  if (reportLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-4 p-4 bg-white min-h-screen">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
           {/* Report Switcher */}
           <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-white border-blue-300 text-blue-700 hover:bg-blue-100 gap-2">
                  <List className="h-4 w-4" /> Switch Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Select a Report</DialogTitle></DialogHeader>
                <div className="grid gap-2 mt-4">
                  {availableReports.length > 0 ? availableReports.map((rpt) => (
                      <div key={rpt.id} onClick={() => handleSelectReport(rpt)} className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeReport?.id === rpt.id ? 'bg-blue-100 border-blue-500' : 'hover:bg-slate-50 border-slate-200'}`}>
                        <div className="font-semibold text-sm">{rpt.name}</div>
                        {rpt.description && <div className="text-xs text-slate-500">{rpt.description}</div>}
                      </div>
                    )) : <div className="text-center py-4 text-slate-500">No saved reports found.</div>
                  }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2 bg-white"><FileDown className="h-4 w-4" /> Export <ChevronDown className="h-4 w-4 opacity-50" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportToExcel}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportToPDF}>PDF (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pagination & Controls */}
      <div className="flex items-center justify-end gap-4 px-4 py-2 bg-slate-50 border border-slate-200 rounded-t-lg">
         <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Showing <strong>{Math.min((currentPage - 1) * columnsPerPage + 1, totalColumns)}</strong>-<strong>{Math.min(currentPage * columnsPerPage, totalColumns)}</strong> of <strong>{totalColumns}</strong> tasks</span>
            <Select onValueChange={handleColumnsPerPageChange} defaultValue={columnsPerPage.toString()}>
              <SelectTrigger className="w-20 h-8 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20, 50].map(val => <SelectItem key={val} value={val.toString()}>{val}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-1 ml-2">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-white" onClick={handlePreviousPage} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-white" onClick={handleNextPage} disabled={currentPage >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            
            <div className="ml-4 flex gap-1">
                <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set([...Array.from(expandedSections), ...transposedTableRows.map(r => r.id)]))}><ChevronsDown className="h-3 w-3 mr-1" /> Expand All</Button>
                <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set())}><ChevronsRight className="h-3 w-3 mr-1" /> Collapse All</Button>
            </div>
         </div>
      </div>

      {/* ENHANCED TABLE RENDER */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>
      ) : activeReport ? (
        <div className="border-x-2 border-b-2 border-slate-300 rounded-b-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 250px)' }}>
          <Table className="min-w-full border-separate border-spacing-0">
            {/* 1. Header Row (Tasks) */}
            <TableHeader className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-sm">
                <TableRow className="bg-blue-600 text-white shadow-md">
                  {/* Sticky Corner Cell */}
                  <TableCell className="sticky left-0 z-30 bg-blue-700 text-white font-bold text-sm p-3 border-r border-blue-500 w-[250px] min-w-[250px]">
                      Details
                  </TableCell>
                  {/* Task Columns */}
                  {paginatedTasks.map((task, idx) => (
                    <TableCell key={task.id} className="text-center font-semibold text-sm py-2 px-1 border-r border-blue-500 bg-blue-600 text-white min-w-[150px]">
                        <div className="flex flex-col gap-0.5">
                            <span className="truncate max-w-[140px] mx-auto" title={task.applicant_name}>{task.applicant_name}</span>
                            <span className="text-[10px] opacity-75 font-normal">{task.id}</span>
                        </div>
                    </TableCell>
                  ))}
                </TableRow>
            </TableHeader>
            
            {/* 2. Body Rows (Fields/Stages) */}
            <TableBody>
                {transposedTableRows.map((row, index) => {
                  // Section Header
                  if (row.type === 'section_header') {
                    const Icon = row.icon;
                    return (
                      <TableRow key={row.id} className="bg-slate-200 border-y-2 border-slate-300 hover:bg-slate-300 transition-colors cursor-pointer" onClick={() => toggleSectionExpansion(row.id)}>
                        <TableCell colSpan={paginatedTasks.length + 1} className="p-0">
                            <div className="flex items-center justify-between px-3 py-2 sticky left-0">
                                <div className="flex items-center gap-3">
                                    {Icon && <Icon className="h-5 w-5 text-slate-600" />}
                                    <span className="font-bold text-slate-700 text-base">{row.label}</span>
                                </div>
                                <div className="bg-slate-300 rounded-full p-0.5">
                                    {expandedSections.has(row.id) ? <Minus className="h-4 w-4 text-slate-700" /> : <Plus className="h-4 w-4 text-slate-700" />}
                                </div>
                            </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // Data Row
                  const rowBg = row.isSubRow ? 'bg-slate-50' : 'bg-white';
                  
                  return (
                    <TableRow key={`${row.type}-${row.label}-${index}`} className={`${rowBg} hover:bg-blue-50/30 transition-colors border-b border-slate-100`}>
                      {/* Sticky Label Column */}
                      <TableCell className={`sticky left-0 z-10 ${rowBg} border-r border-slate-200 font-medium text-xs text-slate-600 p-2 min-w-[250px]`}>
                         <div style={{ paddingLeft: row.isSubRow ? '24px' : '8px' }} className="flex items-center">
                            {safeRender(row.label)}
                         </div>
                      </TableCell>
                      
                      {/* Data Columns */}
                      {paginatedTasks.map(task => (
                        <TableCell key={`${task.id}-${row.label}`} className="text-center p-2 border-r border-slate-100 min-w-[150px]">
                           {safeRender(renderCell(task, row))}  
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-16 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
             <FileText className="h-12 w-12 text-slate-300 mb-3" />
             <p className="text-slate-500 font-medium">Please create a report to view data.</p>
        </div>
      )}
    </div>
  );
}