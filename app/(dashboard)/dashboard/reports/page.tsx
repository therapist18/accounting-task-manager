// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown,
  ChevronDown, ChevronsRight, ChevronsDown, X, FileText, ArrowLeft,
  List, ChevronLeft, ChevronRight, RefreshCw, Filter, AlertTriangle
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

        if (reports && reports.length > 0) {
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
  }, []);

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
      if (depts.length > 0 && !activeDeptId) {
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
  }, [activeReport]);

  const handleSelectReport = (report: any) => {
    setActiveReport(report);
    setIsReportDialogOpen(false);
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
    console.log('Rendering cell:', {
      column: col.field,
      type: col.type,
      taskId: task.id,
      taskData: {
        job_level: task.job_level,
        officer: task.officer,
        officer_name: task.officer_name,
        task_manager: task.task_manager,
        task_manager_name: task.task_manager_name,
        assigned_to_name: task.assigned_to_name
      }
    });

    if (col.type === 'task') {
      const value = (() => {
        switch (col.field) {
          case 'job_level':
            console.log('Processing job_level field:', task.job_level);
            const jobLevel = task.job_level;
            if (!jobLevel) {
              console.log('No job level data');
              return '-';
            }

            // Handle both string and object formats
            if (typeof jobLevel === 'string') {
              const levels = jobLevel.split('>').map(s => s.trim());
              return levels[levels.length - 1] || '-';
            }

            if (typeof jobLevel === 'object' && jobLevel !== null) {
              try {
                // Find department
                const department = departments.find(d => d.id == jobLevel.department_id);
                if (!department) {
                  console.log('Department not found for job level:', jobLevel.department_id);
                  return '-';
                }

                // Find subdepartment
                let subDepartment = null;
                if (department.tm_subdepartments && jobLevel.subdepartment_id) {
                  subDepartment = department.tm_subdepartments.find(
                    sd => sd.id == jobLevel.subdepartment_id
                  );
                }

                // Find class if class_id exists
                let className = '';
                if (jobLevel.class_id && subDepartment?.classes) {
                  const classItem = subDepartment.classes.find(
                    c => c.id == jobLevel.class_id
                  );
                  className = classItem?.name || '';
                }

                // Find subclass if subclass_id exists
                if (jobLevel.subclass_id) {
                  const classItem = subDepartment?.classes?.find(
                    c => c.id == jobLevel.class_id
                  );
                  if (classItem?.subClasses) {
                    const subClassItem = classItem.subClasses.find(
                      sc => sc.id == jobLevel.subclass_id
                    );
                    if (subClassItem?.name) {
                      return subClassItem.name;
                    }
                  }
                }

                // If no subclass but has class, return class name
                if (className) {
                  return className;
                }

                // If no class but has subdepartment, return subdepartment name
                if (subDepartment?.name) {
                  return subDepartment.name;
                }

                // Fallback to department name
                return department.name || '-';
              } catch (error) {
                console.error('Error processing job level:', error);
                return '-';
              }
            }
            return '-';
          case 'officer':
            console.log('Processing officer field');
            const officerValue = task.officer_name ||
              (typeof task.officer === 'string' ? task.officer : task.officer?.name) ||
              '-';
            console.log('Officer value:', officerValue);
            return officerValue;

          case 'task_manager':
            console.log('Processing task_manager field');
            const managerValue = task.task_manager_name ||
              (typeof task.task_manager === 'string' ? task.task_manager : task.task_manager?.name) ||
              task.assigned_to_name ||
              '-';
            console.log('Task manager value:', managerValue);
            return managerValue;

          default: {
            console.log('Using getCellContent for field:', col.field);
            const cellResult = getCellContent(
              task,
              col.field,
              enhancedTasksData,
              taskDependants,
              new Set(),
              companies,
              (t) => {
                console.log('Getting department info for task:', t.id);
                return {
                  department: departments.find(d => d.id === t.department_id),
                  job_level: t.job_level,
                  officer: t.officer || t.officer_name,
                  task_manager: t.task_manager || t.task_manager_name || t.assigned_to_name
                };
              },
              getStaffName,
              getEnhancedImmigrationStatusWrapper,
              getCurrentStageStatusWrapper,
              (t) => {
                console.log('Rendering immigration status for task:', t.id);
                return renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { });
              },
              (t) => {
                console.log('Rendering current stage status for task:', t.id);
                return renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper);
              },
              () => { },
              () => { },
              () => { }
            );
            console.log('getCellContent result for', col.field, ':', cellResult);
            return cellResult;
          }
        }
      })();

      console.log('Final value for', col.field, ':', value);
      if (value === '-') {
        return <span className="text-slate-300">-</span>;
      }
      return value;
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
    return <span className="text-slate-300">-</span>;
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
          if (c.type === 'stage_date') label = "Completion Date";
          if (c.type === 'extracted_field') label = c.label.split(' - ')[1] || c.label;
          rows.push({ ...c, label, isSubRow: true });
        });
      }
    });
    return rows;
  }, [activeReport, columns, expandedSections, stages]);

  // --- 7. Export ---
  const handleExport = async (type: 'excel' | 'pdf') => {
    if (type === 'excel') {
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReportDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {activeReport ? "Change Report" : "Select Report"}
          </Button>
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
              <DropdownMenuItem onClick={() => toast({ title: "Coming Soon", description: "PDF export is being upgraded." })}>PDF (.pdf)</DropdownMenuItem>
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

        {/* --- SUB-DEPARTMENT & STATUS TABS --- */}
        {activeReport && (
          <div className="flex flex-col gap-3 bg-white p-3 rounded-lg border shadow-sm">
            {/* Sub-Department Tabs */}
            <Tabs value={activeSubDeptId} onValueChange={(v) => { setActiveSubDeptId(v); setCurrentPage(1); }}>
              <TabsList className="w-full justify-start h-10 bg-slate-50 border p-1 gap-1 overflow-x-auto">
                <TabsTrigger
                  value="all"
                  className="px-3 h-8 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm text-xs"
                >
                  All Sub-departments
                </TabsTrigger>
                {activeSubDepartments.map((sub) => (
                  <TabsTrigger
                    key={sub.id}
                    value={sub.id.toString()}
                    className="px-3 h-8 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm text-xs"
                  >
                    {sub.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Status Tabs & Pagination Controls */}
            <div className="flex items-center justify-between gap-4">
              {/* Status Filter */}
              <Tabs value={activeStatus} onValueChange={(v) => { setActiveStatus(v); setCurrentPage(1); }}>
                <TabsList className="h-9 bg-slate-100">
                  <TabsTrigger value="all" className="text-xs px-3">All Tasks</TabsTrigger>
                  <TabsTrigger value="wip" className="text-xs px-3">Work In Progress</TabsTrigger>
                  <TabsTrigger value="completed" className="text-xs px-3">Completed</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Pagination Controls */}
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-600">
                  Showing <strong>{totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</strong>-<strong>{Math.min(currentPage * itemsPerPage, totalItems)}</strong> of <strong>{totalItems}</strong> tasks
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Rows:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger className="w-[70px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8" disabled={currentPage === 1} onClick={handlePreviousPage}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium min-w-[60px] text-center">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <Button variant="outline" size="sm" className="h-8" disabled={currentPage >= totalPages} onClick={handleNextPage}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {view === 'transposed' && (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setExpandedSections(new Set([...transposedRows.map(r => r.id)]))}>
                      <ChevronsDown className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setExpandedSections(new Set())}>
                      <ChevronsRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- TABLE CONTENT --- */}
        <div className="flex-1 bg-white border-2 border-slate-300 rounded-lg shadow-sm overflow-auto relative">
          {!activeReport ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <FileText className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No Report Selected</p>
              <p className="text-sm">Please select a report from the menu to view data.</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-2" />
              <p className="text-sm font-medium text-slate-600">Fetching Report Data...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Briefcase className="h-12 w-12 mb-3 opacity-20" />
              <p className="font-medium text-slate-700">No tasks found</p>
              <p className="text-xs text-slate-500">Try changing the filters or selecting a different department.</p>
            </div>
          ) : (
            view === 'standard' ? (
              // --- STANDARD (ROWS) VIEW ---
              <Table className="border-separate border-spacing-0 w-full">
                <TableHeader className="sticky top-0 z-30 bg-slate-100/80 backdrop-blur-sm">
                  {/* Group Header Row */}
                  <TableRow className="bg-blue-600 hover:bg-blue-600">
                    <TableHead className="w-16 border-b border-r border-blue-500 bg-blue-700 text-white sticky left-0 z-40 text-center font-bold">#</TableHead>
                    {columnGroups.map((group, i) => (
                      <TableHead
                        key={i}
                        colSpan={group.span}
                        className="text-center font-bold text-white border-b border-r border-blue-500 last:border-r-0 bg-blue-600 py-3 text-sm"
                      >
                        {group.label}
                      </TableHead>
                    ))}
                  </TableRow>
                  {/* Column Header Row */}
                  <TableRow className="bg-blue-500 hover:bg-blue-500">
                    <TableHead className="w-16 border-b border-r border-blue-400 bg-blue-600 text-white sticky left-0 z-40 text-center font-semibold text-xs">#</TableHead>
                    {columns.map(col => (
                      <TableHead
                        key={col.id}
                        className="whitespace-nowrap px-4 py-3 font-semibold text-white border-b border-r border-blue-400 text-xs bg-blue-500"
                      >
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-200">
                  {paginatedTasks.map((task, idx) => (
                    <TableRow key={task.id} className="hover:bg-blue-50/50 transition-colors group">
                      <TableCell className="sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 border-r border-b border-gray-100 font-medium text-xs text-center text-slate-700">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </TableCell>
                      {columns.map(col => (
                        <TableCell key={col.id} className="border-b border-r border-gray-100 p-3 text-xs align-middle">
                          <div className="truncate max-w-[200px]">
                            {safeRender(renderCellValue(task, col))}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              // --- TRANSPOSED (COLUMNS) VIEW ---
              <Table className="border-separate border-spacing-0 w-full">
                <TableHeader className="sticky top-0 z-30 shadow-md">
                  <TableRow className="bg-blue-700 hover:bg-blue-700">
                    <TableHead className="sticky left-0 z-40 w-[280px] min-w-[280px] bg-blue-800 text-white border-r border-blue-600 font-bold text-sm p-4">
                      Fields / Tasks →
                    </TableHead>
                    {paginatedTasks.map((task, idx) => (
                      <TableHead
                        key={task.id}
                        className="min-w-[180px] w-[180px] text-center bg-blue-700 text-white border-r border-blue-600 font-semibold text-xs py-3 px-2"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-bold">#{(currentPage - 1) * itemsPerPage + idx + 1}</span>
                          <span className="truncate block max-w-full" title={task.applicant_name}>
                            {task.applicant_name}
                          </span>
                          <Badge variant="secondary" className="w-fit mx-auto text-[10px] h-4 px-1 bg-blue-600 text-blue-100 border-none">
                            ID: {task.id}
                          </Badge>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-200">
                  {transposedRows.map((row, rIdx) => {
                    // Section Header Row
                    if (row.type === 'section_header') {
                      const Icon = row.icon;
                      return (
                        <TableRow
                          key={row.id}
                          className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200 cursor-pointer"
                          onClick={() => toggleSection(row.id)}
                        >
                          <TableCell
                            className="sticky left-0 z-20 bg-slate-200 border-r border-slate-400 p-0"
                            colSpan={paginatedTasks.length + 1}
                          >
                            <div className="flex items-center justify-between px-4 py-2">
                              <div className="flex items-center gap-3">
                                {Icon && <Icon className="h-5 w-5 text-slate-600" />}
                                <span className="font-bold text-slate-700 text-base">{row.label}</span>
                              </div>
                              <div className="text-slate-600">
                                {expandedSections.has(row.id) ?
                                  <Minus className="h-4 w-4" /> :
                                  <Plus className="h-4 w-4" />
                                }
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }

                    // Data Row
                    const isSub = row.isSubRow;
                    return (
                      <TableRow key={rIdx} className="hover:bg-slate-50 group border-b border-slate-200">
                        <TableCell className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-200 py-2 px-3 text-xs font-medium text-slate-600">
                          <div
                            style={{ paddingLeft: isSub ? '24px' : '0' }}
                            className="flex items-center truncate"
                            title={row.label}
                          >
                            {safeRender(row.label)}
                          </div>
                        </TableCell>
                        {paginatedTasks.map((task) => (
                          <TableCell
                            key={task.id}
                            className="text-center border-r border-slate-100 p-3 min-w-[180px] align-middle"
                          >
                            <div className="truncate max-w-[180px] mx-auto">
                              {safeRender(renderCellValue(task, row))}
                            </div>
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