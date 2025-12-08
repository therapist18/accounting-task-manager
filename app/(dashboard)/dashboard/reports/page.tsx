// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown, 
  ChevronDown, ChevronsRight, ChevronsDown, X, FileText, ArrowLeft,
  List, ChevronLeft, ChevronRight, RefreshCw, Filter
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  renderCurrentStageStatusCell, 
  ENHANCED_TABLE_HEADERS_IMMIGRATION
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
import { MemorizedReportDialog } from "./MemorizedReportDialog";

// Extend jsPDF types
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// --- Safe Render Utility ---
const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string' || typeof content === 'number') return content;
  if (content === null || content === undefined) return <span className="text-slate-300">-</span>;
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // --- State ---
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [availableReports, setAvailableReports] = useState<any[]>([]);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(true);

  // Data State
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());

  // Filter State
  const [activeDeptId, setActiveDeptId] = useState<string>("");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("wip"); // 'wip' | 'completed'

  // View & Pagination State
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));

  // --- 1. Initialization ---
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

        const reportIdParam = searchParams.get('id');
        if (reportIdParam) {
          const selected = reports?.find(r => r.id === reportIdParam);
          if (selected) setActiveReport(selected);
        } else if (reports && reports.length > 0) {
          setActiveReport(reports[0]);
        }
      } catch (err) {
        console.error("❌ Failed to fetch reports:", err);
        toast({ title: "Error", description: "Could not load saved reports.", variant: "destructive" });
      } finally {
        setReportLoading(false);
      }
    };
    initReports();
  }, [searchParams]);

  // --- 2. Data Fetching ---
  const refreshData = useCallback(async () => {
    if (!activeReport) return;
    setLoading(true);
    try {
      const [depts, comps, docs, kycFields] = await Promise.all([
        fetchDepartments(),
        fetchCompanies(),
        fetchAllDocuments(),
        fetchAllKycFields()
      ]);

      const deptId = activeReport.department_id?.toString();
      const [tasksData, stagesData] = await Promise.all([
        fetchTasks(deptId),
        deptId ? fetchStages(deptId, depts) : Promise.resolve([])
      ]);

      const safeTasks = Array.isArray(tasksData) ? tasksData : [];
      const enhancedMap = new Map();
      const dependantsMap = new Map();

      safeTasks.forEach(task => {
        enhancedMap.set(task.id.toString(), { ...task, age: calculateAge ? calculateAge(task.date_of_birth) : null });
        if (task.dependant_member && Array.isArray(task.dependant_member)) {
          dependantsMap.set(task.id.toString(), task.dependant_member);
        }
      });

      setDepartments(depts);
      setCompanies(comps);
      setAllDocuments(docs);
      setKycDocuments(kycFields?.kycDocsMap || new Map());
      setTasks(safeTasks);
      setStages(stagesData);
      setTaskDependants(dependantsMap);
      setEnhancedTasksData(enhancedMap);
      
      // Auto-select first department if available and not set
      if(depts.length > 0 && !activeDeptId) {
        setActiveDeptId(depts[0].id.toString());
      } else if (activeReport.department_id) {
        setActiveDeptId(activeReport.department_id.toString());
      }

      setCurrentPage(1);
    } catch (error) {
      console.error("❌ Error loading report data", error);
      toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeReport, activeDeptId]);

  useEffect(() => {
    refreshData();
  }, [activeReport]); // removed refreshData from deps to avoid loop, only trigger on report change

  const handleSelectReport = (report: any) => {
    setActiveReport(report);
    setIsReportDialogOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set('id', report.id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  // --- 3. Filtering Logic ---
  const activeDepartment = useMemo(() => 
    departments.find(d => d.id.toString() === activeDeptId), 
  [departments, activeDeptId]);

  const activeSubDepartments = useMemo(() => 
    activeDepartment?.tm_subdepartments || [], 
  [activeDepartment]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // 1. Department Filter
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      
      // 2. Sub-Department Filter
      if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;

      // 3. Status Filter
      // Define what counts as "Completed" (adjust based on your actual status strings)
      const isCompleted = ['write_up_completed', 'endorsed', 'completed', 'archived'].includes(task.status);
      
      if (activeStatus === 'wip' && isCompleted) return false;
      if (activeStatus === 'completed' && !isCompleted) return false;

      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptId, activeStatus]);

  // --- 4. Pagination Logic ---
  const totalItems = filteredTasks.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTasks.slice(start, start + itemsPerPage);
  }, [filteredTasks, currentPage, itemsPerPage]);

  const handleNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const handlePreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const handleItemsPerPageChange = (val: string) => {
    setItemsPerPage(Number(val));
    setCurrentPage(1);
  };

  // --- 5. Cell Render Logic ---
  const getCurrentStageStatusWrapper = useCallback((task) => getCurrentStageStatus(task, stages, departments, allDocuments), [stages, departments, allDocuments]);
  const getEnhancedImmigrationStatusWrapper = useCallback((task) => getEnhancedImmigrationStatus(task, stages, allDocuments, kycDocuments), [stages, allDocuments, kycDocuments]);
  const getStaffName = useCallback(() => '', []);
  const getDocumentForTaskStage = useCallback((task, stage) => {
    const linked = task.source_document_id?.[stage.id];
    if (!linked) return [];
    return (Array.isArray(linked) ? linked : [linked])
      .map(ref => allDocuments.find(d => d.id.toString() === (typeof ref === 'string' ? ref : ref.id).toString()))
      .filter(Boolean);
  }, [allDocuments]);

  const renderCellValue = (task, col) => {
    if (col.type === 'task') {
      return getCellContent(task, col.field, enhancedTasksData, taskDependants, new Set(), companies, 
        (t) => ({ department: departments.find(d => d.id === t.department_id) }), 
        getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
        (t) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => {}),
        (t) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper),
        () => {}, () => {}, () => {}
      );
    } 
    if (col.type === 'stage_date') {
      const d = task.stages?.[col.stageId]?.date;
      return d ? <span className="text-xs">{formatDateValue(d)}</span> : <span className="text-slate-300">-</span>;
    }
    if (col.type === 'extracted_field') {
      const stage = stages.find(s => s.id === col.stageId);
      const stageDocInfo = stage?.documents?.find((d) => d.kycId === col.kycId);
      if (!stage || !stageDocInfo) return <span className="text-slate-300">-</span>;
      
      const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
      if (!linked) return <Badge variant="outline" className="text-[10px] text-slate-400 font-normal px-1 h-5 border-dashed">Missing</Badge>;
      if (linked.indicator) return <Badge variant="destructive" className="text-[10px] px-1 h-5">Indicator</Badge>;
      
      const val = linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
      const isOld = linked.created_at && task.created_at && new Date(linked.created_at) < new Date(task.created_at);
      const display = col.fieldType === 'Date' ? formatDateValue(val) : val;
      
      return <span className={`text-xs ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || '-'}</span>;
    }
    return '-';
  };

  const toggleSection = (id) => setExpandedSections(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // --- 6. Configuration Building ---
  const columns = useMemo(() => {
    if (!activeReport || !stages.length) return [];
    const getLabel = (id) => id.replace(/_/g, ' ').toUpperCase();
    const cols = [];

    activeReport.configuration?.taskFields?.forEach(field => {
      cols.push({ id: `task_${field}`, label: getLabel(field), type: 'task', field });
    });

    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});
    stages.filter(s => activeStageIds.includes(s.id)).forEach(stage => {
      const config = activeReport.configuration.stages[stage.id];
      if (config.isStageDateSelected) {
        cols.push({ id: `stage_date_${stage.id}`, label: `${stage.name} (Date)`, type: 'stage_date', stageId: stage.id, stageName: stage.name });
      }
      if (config.documents) {
        Object.entries(config.documents).forEach(([kycId, docConfig]: [string, any]) => {
          const kycDoc = kycDocuments.get(kycId);
          if (!kycDoc) return;
          docConfig.fields.forEach(fieldId => {
            const field = kycDoc.fields?.find(f => f.id === fieldId);
            if (field) {
              cols.push({
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
    return cols;
  }, [activeReport, stages, kycDocuments]);

  const columnGroups = useMemo(() => {
    if (!columns.length) return [];
    const groups = [];
    const taskCols = columns.filter(c => c.type === 'task');
    if (taskCols.length) groups.push({ id: 'task_info', label: 'Task Details', span: taskCols.length });

    const stageMap = new Map();
    columns.filter(c => c.type !== 'task').forEach(col => {
      if (!stageMap.has(col.stageId)) stageMap.set(col.stageId, { id: col.stageId, label: '', count: 0 });
      const group = stageMap.get(col.stageId);
      const stageName = stages.find(s => s.id === col.stageId)?.name || 'Stage Info';
      group.label = stageName;
      group.count++;
    });
    stageMap.forEach(g => groups.push({ id: g.id, label: g.label, span: g.count }));
    return groups;
  }, [columns, stages]);

  const transposedRows = useMemo(() => {
    if (!activeReport) return [];
    const rows = [];
    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase });
    if (expandedSections.has('task_details')) {
      columns.filter(c => c.type === 'task').forEach(c => rows.push({ ...c, isSubRow: true }));
    }
    const stageGroups = new Set(columns.filter(c => c.type !== 'task').map(c => c.stageId));
    stageGroups.forEach(stageId => {
      const stage = stages.find(s => s.id === stageId);
      if (!stage) return;
      rows.push({ type: 'section_header', id: stage.id, label: stage.name, icon: stage.icon || Briefcase });
      if (expandedSections.has(stage.id)) {
        columns.filter(c => c.stageId === stageId).forEach(c => {
           let label = c.label;
           if(c.type === 'stage_date') label = "Completion Date";
           if(c.type === 'extracted_field') label = c.label.split(' - ')[1] || c.label; 
           rows.push({ ...c, label, isSubRow: true });
        });
      }
    });
    return rows;
  }, [activeReport, columns, expandedSections, stages]);

  // --- 7. Export ---
  const handleExport = async (type: 'excel' | 'pdf') => {
    if(type === 'excel') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Report');
      const headerRow = columns.map(c => c.label);
      ws.addRow(['Task ID', ...headerRow]);
      filteredTasks.forEach(t => {
        const row = [t.id, ...columns.map(c => {
          const content = renderCellValue(t, c);
          return typeof content === 'object' ? JSON.stringify(content).substring(0, 50) : content;
        })];
        ws.addRow(row);
      });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Report_${activeReport.name}.xlsx`;
      link.click();
    }
  };

  // --- RENDER ---
  if (reportLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>;

  return (
    <div className="flex flex-col h-screen bg-slate-50/50">
      
      {/* 1. TOP HEADER */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <MemorizedReportDialog
            open={isReportDialogOpen}
            onOpenChange={setIsReportDialogOpen}
            department={departments.find(d => d.id.toString() === activeDeptId) || null}
            stages={stages}
            kycDocuments={kycDocuments}
            onApplyReport={handleSelectReport}
            tableHeaders={ENHANCED_TABLE_HEADERS_IMMIGRATION}
          />

          <div className="h-8 w-px bg-slate-200" />

          <div>
             <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
               {activeReport ? activeReport.name : "Select a Report"}
             </h1>
             {activeReport && <p className="text-xs text-slate-500 hidden md:block">{activeReport.description || "Generated Report View"}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeReport && (
             <Tabs value={view} onValueChange={(v) => setView(v as any)} className="hidden md:block">
               <TabsList className="grid w-[200px] grid-cols-2">
                 <TabsTrigger value="standard" className="gap-2"><Rows className="h-3 w-3" /> Rows</TabsTrigger>
                 <TabsTrigger value="transposed" className="gap-2"><LayoutGrid className="h-3 w-3" /> Columns</TabsTrigger>
               </TabsList>
             </Tabs>
          )}

          <Button variant="outline" size="sm" onClick={() => refreshData()} disabled={loading} className="hidden sm:flex">
             <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                <FileDown className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('excel')}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast({title: "Coming Soon", description: "PDF export is being upgraded."})}>PDF (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
        
        {/* --- DEPARTMENT TABS --- */}
        {departments.length > 0 && (
          <Tabs value={activeDeptId} onValueChange={(val) => { setActiveDeptId(val); setActiveSubDeptId('all'); setCurrentPage(1); }} className="w-full">
            <TabsList className="w-full justify-start h-12 bg-white border shadow-sm p-1 gap-2 overflow-x-auto">
              {departments.map((dept) => (
                <TabsTrigger 
                  key={dept.id} 
                  value={dept.id.toString()}
                  className="px-4 h-9 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-blue-200 border border-transparent rounded-md text-slate-600"
                >
                  {dept.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* --- SECONDARY CONTROLS (Sub-Depts & Status) --- */}
        {activeReport && (
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-3 rounded-lg border shadow-sm">
             
             {/* Left: Filters */}
             <div className="flex flex-wrap items-center gap-4">
                {/* Sub-Department Filter */}
                <div className="flex items-center gap-2">
                   <Filter className="h-4 w-4 text-slate-400" />
                   <Select value={activeSubDeptId} onValueChange={(v) => { setActiveSubDeptId(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="All Sub-departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sub-departments</SelectItem>
                        {activeSubDepartments.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id.toString()}>{sub.name}</SelectItem>
                        ))}
                      </SelectContent>
                   </Select>
                </div>

                {/* Status Switcher */}
                <Tabs value={activeStatus} onValueChange={(v) => { setActiveStatus(v); setCurrentPage(1); }}>
                   <TabsList className="h-9 bg-slate-100">
                      <TabsTrigger value="wip" className="text-xs px-3">Work In Progress</TabsTrigger>
                      <TabsTrigger value="completed" className="text-xs px-3">Completed</TabsTrigger>
                   </TabsList>
                </Tabs>
             </div>

             {/* Right: Pagination */}
             <div className="flex items-center gap-4 ml-auto">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                   <span className="hidden sm:inline">Rows:</span>
                   <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                     <SelectTrigger className="w-[70px] h-8 text-xs"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       {[10, 20, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                     </SelectContent>
                   </Select>
                </div>

                <div className="flex items-center gap-1 bg-slate-50 rounded-md p-1 border">
                   <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage===1} onClick={handlePreviousPage}><ChevronLeft className="h-4 w-4"/></Button>
                   <span className="text-xs font-medium min-w-[30px] text-center">
                      {totalItems > 0 ? `${(currentPage-1)*itemsPerPage + 1}-${Math.min(currentPage*itemsPerPage, totalItems)}` : '0'} / {totalItems}
                   </span>
                   <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage >= totalPages} onClick={handleNextPage}><ChevronRight className="h-4 w-4"/></Button>
                </div>

                {view === 'transposed' && (
                  <div className="flex gap-1 ml-2">
                    <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set([...transposedRows.map(r=>r.id)]))}><ChevronsDown className="h-3 w-3"/></Button>
                    <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set())}><ChevronsRight className="h-3 w-3"/></Button>
                  </div>
                )}
             </div>
          </div>
        )}

        {/* --- TABLE CONTENT --- */}
        <div className="flex-1 bg-white border rounded-lg shadow-sm overflow-auto relative">
           {!activeReport ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <FileText className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No Report Selected</p>
                <p className="text-sm">Please select a report from the menu to view data.</p>
              </div>
           ) : loading ? (
              <div className="flex flex-col items-center justify-center h-full text-blue-600">
                <Loader2 className="h-10 w-10 animate-spin mb-2" />
                <p className="text-sm font-medium">Fetching Report Data...</p>
              </div>
           ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Briefcase className="h-12 w-12 mb-3 opacity-20" />
                <p className="font-medium">No tasks found</p>
                <p className="text-xs">Try changing the filters or selecting a different department.</p>
              </div>
           ) : (
             view === 'standard' ? (
                // --- STANDARD VIEW ---
                <Table className="border-separate border-spacing-0 w-full">
                  <TableHeader className="sticky top-0 z-30 bg-slate-100 shadow-sm">
                    {/* Group Header Row */}
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="w-12 border-b border-r bg-slate-50 sticky left-0 z-40"></TableHead>
                      {columnGroups.map((group, i) => (
                        <TableHead key={i} colSpan={group.span} className="text-center font-bold text-slate-700 border-b border-r last:border-r-0 bg-slate-100 py-2 h-auto">
                          {group.label}
                        </TableHead>
                      ))}
                    </TableRow>
                    {/* Column Header Row */}
                    <TableRow className="bg-white hover:bg-white shadow-sm">
                      <TableHead className="w-12 border-b border-r bg-slate-50 sticky left-0 z-40 text-center font-bold text-slate-500">#</TableHead>
                      {columns.map(col => (
                        <TableHead key={col.id} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600 border-b border-r text-xs h-auto bg-white">
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTasks.map((task, idx) => (
                      <TableRow key={task.id} className="hover:bg-blue-50/50 transition-colors group">
                        <TableCell className="sticky left-0 z-20 bg-slate-50 group-hover:bg-blue-100/50 border-r border-b font-medium text-xs text-center text-slate-500">
                          {(currentPage-1)*itemsPerPage + idx + 1}
                        </TableCell>
                        {columns.map(col => (
                          <TableCell key={col.id} className="border-b border-r p-2 text-xs truncate max-w-[200px]">
                            {safeRender(renderCellValue(task, col))}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
             ) : (
                // --- TRANSPOSED VIEW ---
                <Table className="border-separate border-spacing-0 w-full">
                  <TableHeader className="sticky top-0 z-30 shadow-md">
                     <TableRow className="bg-blue-700 hover:bg-blue-700">
                        <TableHead className="sticky left-0 z-40 w-[280px] min-w-[280px] bg-blue-800 text-white border-r border-blue-600 font-bold text-sm p-4">
                           Configuration / Applicants
                        </TableHead>
                        {paginatedTasks.map(task => (
                           <TableHead key={task.id} className="min-w-[160px] w-[160px] text-center bg-blue-700 text-white border-r border-blue-600 font-semibold text-xs py-3 px-2 h-auto">
                              <div className="flex flex-col gap-1">
                                <span className="truncate block max-w-full" title={task.applicant_name}>{task.applicant_name}</span>
                                <Badge variant="secondary" className="w-fit mx-auto text-[10px] h-4 px-1 bg-blue-600 text-blue-100 border-none">{task.id}</Badge>
                              </div>
                           </TableHead>
                        ))}
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                     {transposedRows.map((row, rIdx) => {
                        // Section Header Row
                        if (row.type === 'section_header') {
                          const Icon = row.icon;
                          return (
                            <TableRow key={row.id} className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSection(row.id)}>
                               <TableCell className="sticky left-0 z-20 bg-slate-100 border-r border-b border-slate-300 py-2 px-4" colSpan={paginatedTasks.length + 1}>
                                  <div className="flex items-center justify-between">
                                     <div className="flex items-center gap-2 font-bold text-slate-700">
                                        {Icon && <Icon className="h-4 w-4" />}
                                        {row.label}
                                     </div>
                                     <div className="text-slate-500">
                                        {expandedSections.has(row.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                     </div>
                                  </div>
                               </TableCell>
                            </TableRow>
                          )
                        }
                        
                        // Data Row
                        const isSub = row.isSubRow;
                        return (
                          <TableRow key={rIdx} className="hover:bg-slate-50 group">
                             <TableCell className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-b border-slate-200 py-2 px-3 text-xs font-medium text-slate-600">
                                <div style={{ paddingLeft: isSub ? '24px' : '0' }} className="flex items-center truncate" title={row.label}>
                                   {safeRender(row.label)}
                                </div>
                             </TableCell>
                             {paginatedTasks.map((task) => (
                               <TableCell key={task.id} className="text-center border-r border-b border-slate-100 p-2 min-w-[160px]">
                                  {safeRender(renderCellValue(task, row))}
                               </TableCell>
                             ))}
                          </TableRow>
                        );
                     })}
                  </TableBody>
                </Table>
             )
           )}
        </div>
      </main>
    </div>
  );
}