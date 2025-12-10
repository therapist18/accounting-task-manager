// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown,
  ChevronDown, ChevronsRight, ChevronsDown, X, FileText, ArrowLeft,
  List, ChevronLeft, ChevronRight, RefreshCw, Filter, AlertTriangle,
  Calendar, ShieldCheck, Clock, ArrowUpDown, Search, Timer, AlertCircle,
  Check
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
import { format, parseISO, isValid } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

// Special stage IDs that should always show WEF and TO columns
const SPECIAL_STAGE_IDS = [
  '072b9710-45df-4a05-ba65-01b4ef29d61d', // Status stage
  'caefd742-5de5-4341-a3bb-81d7b9dd2b73'  // Endorsement stage
];

// --- 1. UPDATED DATE UTILITIES (Strict DD/MM/YYYY) ---

const parseDateString = (dateInput: any): Date | null => {
  if (!dateInput) return null;

  // If it's already a date object
  if (dateInput instanceof Date) {
    return isValid(dateInput) ? dateInput : null;
  }

  try {
    const strInput = String(dateInput).trim();

    // Handle DD/MM/YYYY format explicitly
    if (strInput.includes('/')) {
      const parts = strInput.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return isValid(d) ? d : null;
      }
    }

    // Handle ISO string (YYYY-MM-DD or ISO timestamp from DB)
    const isoDate = new Date(strInput);
    if (isValid(isoDate)) return isoDate;

    return null;
  } catch (e) {
    return null;
  }
};

const formatDateForDisplay = (date: any): string => {
  const d = parseDateString(date);
  if (!d) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// --- Time Formatting Helpers ---
const formatDuration = (minutes: number): string => {
  if (isNaN(minutes) || !isFinite(minutes)) return 'N/A';

  const absMinutes = Math.abs(Math.round(minutes));
  const days = Math.floor(absMinutes / (60 * 24));
  const hours = Math.floor((absMinutes % (60 * 24)) / 60);
  const mins = absMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

  return parts.join(' ');
};

const getTimeStatus = (startTime: Date | string | null, estimatedMinutes: number) => {
  if (!startTime) return null;

  try {
    // Ensure we have a Date object using the strict parser
    const startDate = parseDateString(startTime);

    if (!startDate) return null;

    const now = new Date();
    const elapsedMs = now.getTime() - startDate.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // If no estimated minutes, just return elapsed
    if (!estimatedMinutes || estimatedMinutes <= 0) {
      return {
        elapsed: Math.max(0, elapsedMinutes),
        remaining: 0,
        isOverdue: false,
        progress: 100,
        percentage: '100%',
        formattedElapsed: formatDuration(elapsedMinutes),
        formattedRemaining: '-',
        formattedOverdue: '-'
      };
    }

    const remainingMinutes = Math.max(0, estimatedMinutes - elapsedMinutes);
    const isOverdue = elapsedMinutes > estimatedMinutes;
    const progress = Math.min(100, Math.max(0, (elapsedMinutes / estimatedMinutes) * 100));

    return {
      elapsed: Math.max(0, elapsedMinutes),
      remaining: remainingMinutes,
      isOverdue,
      progress,
      percentage: `${Math.round(progress)}%`,
      formattedElapsed: formatDuration(elapsedMinutes),
      formattedRemaining: formatDuration(remainingMinutes),
      formattedOverdue: isOverdue ? formatDuration(elapsedMinutes - estimatedMinutes) : '0m'
    };
  } catch (e) {
    console.error("Error in getTimeStatus:", e);
    return null;
  }
};

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

  // Filter & Search State
  const [activeDeptId, setActiveDeptId] = useState<string>("");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("wip");
  const [searchQuery, setSearchQuery] = useState("");

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // View & Pagination State
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // Default 100
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

  // --- 3. Filtering & Sorting Logic ---

  const activeDepartment = useMemo(() =>
    departments.find(d => d.id.toString() === activeDeptId),
    [departments, activeDeptId]);

  const activeSubDepartments = useMemo(() =>
    activeDepartment?.tm_subdepartments || [],
    [activeDepartment]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;

      const isWriteUpCompleted = task.status === 'write_up_completed';
      const isEndorsed = task.status === 'endorsed';
      const isCompleted = isWriteUpCompleted || isEndorsed || ['completed', 'archived'].includes(task.status);

      if (activeStatus === 'wip' && isCompleted) return false;
      if (activeStatus === 'write_up_completed' && !isWriteUpCompleted) return false;
      if (activeStatus === 'endorsed' && !isEndorsed) return false;
      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptId, activeStatus]);

  const searchedTasks = useMemo(() => {
    if (!searchQuery) return filteredTasks;
    const lowerQuery = searchQuery.toLowerCase();
    return filteredTasks.filter(t =>
      t.id.toString().includes(lowerQuery) ||
      (t.applicant_name && t.applicant_name.toLowerCase().includes(lowerQuery)) ||
      (companies.get(t.company_id)?.toLowerCase().includes(lowerQuery))
    );
  }, [filteredTasks, searchQuery, companies]);

  // Helper to extract value for sorting
  const getSortableValue = (task: any, col: any) => {
    if (!col) return '';

    if (col.type === 'imm_status_days') {
      const statusData = getEnhancedImmigrationStatusWrapper(task);
      const currentDoc = statusData?.current;
      if (!currentDoc) return -9999;

      let expiry = null;
      const kycConfig = kycDocuments.get(currentDoc.document_id || currentDoc.kyc_id);
      const extracted = currentDoc.extracted_details || {};

      if (kycConfig?.fields) {
        const effTo = kycConfig.fields.find(f => f.isEffectiveTo === true);
        if (effTo) expiry = extracted[effTo.name];
      }
      if (!expiry) {
        const keys = Object.keys(extracted);
        const expiryKey = keys.find(k => k.toLowerCase() === 'expiry_date' || k.toLowerCase() === 'valid_until');
        if (expiryKey) expiry = extracted[expiryKey];
      }

      const d = parseDateString(expiry);
      if (!d) return -9999;
      return d.getTime();
    }

    if (col.type === 'task') {
      if (col.field === 'applicant_name') return task.applicant_name || '';
      if (col.field === 'company_name') return companies.get(task.company_id) || '';
      if (col.field === 'current_stage_name') {
        const stage = stages.find(s => s.id === task.current_stage_id);
        return stage ? stage.name : '';
      }
      return task[col.field] || '';
    }

    if (col.type === 'stage_date') {
      const d = task.stages?.[col.stageId]?.date;
      return d ? parseDateString(d)?.getTime() || 0 : 0;
    }

    return '';
  };


  const handleNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const handlePreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const handleItemsPerPageChange = (val: string) => { setItemsPerPage(Number(val)); setCurrentPage(1); };

  // --- 4. Cell Render Helpers ---
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

  // --- 5. Applicability Helpers ---
  const isStageApplicableToTask = useCallback((stage: any, task: any): boolean => {
    if (!task || !stage || !departments?.length) return true;
    try {
      const dept = departments.find(d => d?.id === (task.department?.id || task.department_id));
      if (!dept) return true;
      const subdept = dept.tm_subdepartments?.find((s: any) =>
        s?.id === (task.subdepartment?.id || task.subdepartment_id)
      );
      if (!subdept) return true;
      if (task.class_id) {
        const cls = subdept.classes?.find((c: any) =>
          c?.id?.toString() === task.class_id?.toString()
        );
        const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && typeof classStage.applicable === 'boolean') return classStage.applicable;
      }
      const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
      if (subdeptStage && typeof subdeptStage.applicable === 'boolean') return subdeptStage.applicable;
      const deptStage = dept.stages?.find((s: any) => s.stage_id === stage.id);
      return deptStage?.applicable !== false;
    } catch (error) { return true; }
  }, [departments]);

  const isDocumentApplicable = useCallback((doc: any, task: any): boolean => {
    if (!doc || !task) return false;
    if (doc.isSpecial !== true) return true;
    if (!Array.isArray(doc.targetEntities) || doc.targetEntities.length === 0) return false;
    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();
    return doc.targetEntities.some((entity: any) => {
      const classMatch = !entity.class_id || entity.class_id.toString() === taskClassId;
      const subdeptMatch = !entity.subdept_id || entity.subdept_id.toString() === taskSubdeptId;
      return classMatch && subdeptMatch;
    });
  }, []);

  const isStageApplicableToCurrentFilter = useCallback((stageId: string) => {
    if (!activeSubDeptId || activeSubDeptId === 'all') return true;
    const subDept = activeSubDepartments.find(s => s.id.toString() === activeSubDeptId);
    if (!subDept) return true;
    const stageConfig = subDept.stages?.find((s: any) => s.stage_id === stageId);
    if (stageConfig && typeof stageConfig.applicable === 'boolean') {
      return stageConfig.applicable;
    }
    return true;
  }, [activeSubDeptId, activeSubDepartments]);


  // --- 6. Render Logic ---
  const renderCellValue = (task, col) => {
    // --- Current Stage & Time Status ---
    if (col.type === 'task' && col.field === 'current_stage_status') {
      const stageStatus = getCurrentStageStatus(task, stages, departments, allDocuments);

      if (!stageStatus || stageStatus.stageName === 'No Stage') return <span className="text-slate-300 text-xs">-</span>;
      const stage = stages.find(s => s.name === stageStatus.stageName);
      const startTimeStr = task.current_stage_started_at || task.created_at;
      const startedAt = parseDateString(startTimeStr);
      const allowedMinutes = stage?.estimated_time;
      const timeStatus = getTimeStatus(startedAt, allowedMinutes);
      if (!allowedMinutes || allowedMinutes <= 0) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] px-1 gap-1">
                <ShieldCheck className="h-3 w-3" /> {stageStatus.stageName}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Status: {stageStatus.stageStatus}</p>
              {startedAt && <p>Started: {formatDateForDisplay(startedAt)}</p>}
            </TooltipContent>
          </Tooltip>
        );
      }
      const progress = timeStatus ? Math.min(100, Math.max(0, timeStatus.progress)) : 0;
      const isOverdue = timeStatus?.isOverdue || false;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-1.5">
                <Badge variant={isOverdue ? "destructive" : "outline"} className={`${isOverdue ? "bg-red-50 text-red-600 border-red-200" : "bg-green-50 text-green-600 border-green-200"} text-[10px] px-1 gap-1`}>
                  {isOverdue ? <AlertCircle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {stageStatus.stageName}
                </Badge>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} /></div>
              <div className="text-[10px] text-gray-500">{timeStatus?.formattedElapsed} / {formatDuration(allowedMinutes)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="space-y-1">
              <div className="flex justify-between"><span className="font-medium">Stage:</span><span>{stageStatus.stageName}</span></div>
              <div className="flex justify-between"><span className="font-medium">Status:</span><span className={isOverdue ? 'text-red-600' : 'text-green-600'}>{isOverdue ? 'Overdue' : 'In Progress'}</span></div>
              <div className="flex justify-between"><span className="font-medium">Time Elapsed:</span><span>{timeStatus?.formattedElapsed}</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }
    if (col.type === 'task' && col.field === 'current_stage_name') {
      const stageStatus = getCurrentStageStatus(task, stages, departments, allDocuments);
      return <div className="flex flex-col"><span className="text-xs font-medium text-blue-700">{stageStatus?.stageName || 'No Stage'}</span>{stageStatus?.stageStatus && <span className="text-xs text-slate-500">{stageStatus.stageStatus}</span>}</div>;
    }
    if (['imm_status_doc', 'imm_status_expiry', 'imm_status_days'].includes(col.type)) {
      const statusData = getEnhancedImmigrationStatusWrapper(task);
      const currentDoc = statusData?.current;
      if (col.type === 'imm_status_doc') return currentDoc ? <span className="text-xs font-medium text-slate-700">{currentDoc.name || 'Document'}</span> : <span className="text-red-500 text-xs font-semibold">Missing</span>;
      let expiry = null;
      if (currentDoc) {
        const kycConfig = kycDocuments.get(currentDoc.document_id || currentDoc.kyc_id);
        const extracted = currentDoc.extracted_details || {};
        if (kycConfig?.fields) {
          const effectiveToField = kycConfig.fields.find(f => f.isEffectiveTo === true);
          if (effectiveToField) expiry = extracted[effectiveToField.name];
        }
      } else if (statusData) expiry = statusData.date;
      const expiryDate = parseDateString(expiry);
      if (col.type === 'imm_status_expiry') return <span className="text-xs text-slate-700">{expiryDate ? formatDateForDisplay(expiryDate) : 'N/A'}</span>;
      if (col.type === 'imm_status_days') {
        if (!expiryDate) return <span className="text-gray-400 text-xs">-</span>;
        const days = Math.ceil((expiryDate.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
        return <span className={`text-xs ${days < 0 ? 'text-red-600 font-bold' : 'text-green-600'}`}>{days} days</span>;
      }
    }

    // ==================================================================================
    // ⬇️⬇️⬇️ UPDATED SECTION: STAGE DATE WITH SKIPPED BADGE & PREVIOUS DATE FIX ⬇️⬇️⬇️
    // ==================================================================================
    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-slate-300">-</span>;
      if (!isStageApplicableToTask(stage, task)) return <span className="text-sm text-gray-400 italic">N/A</span>;

      const stageData = task.stages?.[col.stageId];
      const estimatedMinutes = stage.estimated_time;

      // --- 1. HANDLE SKIPPED STATUS ---
      if (stageData?.status === 'skipped') {
        const reason = stageData?.reason || 'No reason provided';
        const skippedAt = stageData?.skippedAt ? parseDateString(stageData.skippedAt) : null;

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 cursor-help font-normal text-[10px] px-2">
                Skipped
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-900 text-white border-slate-800">
              <div className="text-xs text-left space-y-1">
                <p><span className="font-semibold text-slate-300">Reason:</span> {reason}</p>
                {skippedAt && <p><span className="font-semibold text-slate-300">Date:</span> {formatDateForDisplay(skippedAt)}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      // --- 2. DETERMINE COMPLETION DATE (Priority: Manually entered Date > Extracted > Timestamp) ---
      let completionDateStr = stageData?.date;

      if (!completionDateStr && stage.documents?.length > 0) {
        const docConfig = stage.documents.find(d => isDocumentApplicable(d, task));
        if (docConfig) {
          const linkedDocs = getDocumentForTaskStage(task, { ...stage, documents: [docConfig] });
          const linkedDoc = linkedDocs[0];
          if (linkedDoc && !linkedDoc.indicator) {
            const dateFields = ['date', 'Date', 'application_date', 'upload_date', 'created_date', 'With_Effect_From'];
            const details = linkedDoc.extracted_details || {};
            for (const field of dateFields) {
              if (details[field]) { completionDateStr = details[field]; break; }
            }
          }
        }
      }

      if (!completionDateStr && stageData?.status === 'completed' && stageData?.completedAt) {
        completionDateStr = stageData.completedAt;
      }

      const completionDate = parseDateString(completionDateStr);

      // --- SCENARIO A: STAGE IS COMPLETED ---
      if (completionDate) {
        return (
          <div className="flex flex-col gap-1 min-w-[100px]">
            <span className="text-xs font-medium text-green-700 flex items-center gap-1">
              <Check className="h-3 w-3" />
              {formatDateForDisplay(completionDate)}
            </span>
            <span className="text-[9px] text-slate-400">Completed</span>
          </div>
        );
      }

      // --- SCENARIO B: STAGE IS IN PROGRESS (Fix Calculation Logic) ---

      // Calculate Start Time: Look at previous stage's MANUAL date first
      let effectiveStartTime = task.created_at ? parseDateString(task.created_at) : null;

      // Sort stages to find sequence
      const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      const currentStageIndex = sortedStages.findIndex(s => s.id === col.stageId);

      // If there is a previous stage, assume start time is when previous stage finished
      if (currentStageIndex > 0) {
        const prevStage = sortedStages[currentStageIndex - 1];
        const prevStageData = task.stages?.[prevStage.id];

        if (prevStageData) {
          // Priority: Manual Date > SkippedAt > CompletedAt
          if (prevStageData.date) {
            effectiveStartTime = parseDateString(prevStageData.date);
          } else if (prevStageData.status === 'skipped' && prevStageData.skippedAt) {
            effectiveStartTime = parseDateString(prevStageData.skippedAt);
          } else if (prevStageData.completedAt) {
            effectiveStartTime = parseDateString(prevStageData.completedAt);
          }
        }
      }

      // Fallback to task initiation if explicit start time missing
      if (!effectiveStartTime && task.date_initiated) {
        effectiveStartTime = parseDateString(task.date_initiated);
      }

      if (!effectiveStartTime) return <span className="text-slate-300">-</span>;

      // Calculate time status
      const timeStatus = getTimeStatus(effectiveStartTime, estimatedMinutes);
      const isOverdue = timeStatus?.isOverdue || false;
      const progress = timeStatus?.progress || 0;
      const hasEstimate = estimatedMinutes && estimatedMinutes > 0;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <span className="text-xs font-medium text-slate-700">In Progress</span>
              {hasEstimate ? (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-0.5">
                    <div
                      className={`h-1.5 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-gray-500">
                    <span>{timeStatus?.formattedElapsed}</span>
                    {isOverdue && <span className="text-red-500 font-bold">!</span>}
                  </div>
                </>
              ) : (
                <span className="text-[9px] text-slate-400">{timeStatus?.formattedElapsed} elapsed</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[250px]">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Stage:</span>
                <span>{stage.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Started:</span>
                {/* Shows the calculated effective start time (e.g. 03/12/2025) */}
                <span>{formatDateForDisplay(effectiveStartTime)}</span>
              </div>
              {hasEstimate && (
                <>
                  <div className="flex justify-between">
                    <span className="font-medium">Time Remaining:</span>
                    <span className={isOverdue ? 'text-red-600' : ''}>
                      {isOverdue
                        ? `Overdue by ${timeStatus?.formattedOverdue || '-'}`
                        : timeStatus?.formattedRemaining || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Estimated Duration:</span>
                    <span>{formatDuration(estimatedMinutes)}</span>
                  </div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }
    if (col.type === 'extracted_field') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-slate-300">-</span>;
      if (!isStageApplicableToTask(stage, task)) return <span className="text-sm text-gray-400 italic">N/A</span>;

      if (col.isAutoAdded) {
        let foundValue = null;
        let foundDoc = null;
        for (const stageDocInfo of (stage.documents || [])) {
          if (!isDocumentApplicable(stageDocInfo, task)) continue;
          const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
          if (!linked || linked.indicator) continue;
          const val = linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
          if (val) { foundValue = val; foundDoc = linked; break; }
        }

        // UPDATED: Red text for Missing extracted fields
        if (!foundDoc) return <span className="text-red-500 text-xs font-bold">Missing</span>;

        const isOld = foundDoc.created_at && task.created_at && new Date(foundDoc.created_at) < new Date(task.created_at);
        const display = col.fieldType === 'Date' ? formatDateForDisplay(foundValue) : foundValue;
        return <span className={`text-xs ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || '-'}</span>;
      }

      const stageDocInfo = stage?.documents?.find((d) => d.kycId === col.kycId);
      if (!stageDocInfo) return <span className="text-slate-300">-</span>;
      if (!isDocumentApplicable(stageDocInfo, task)) return <span className="text-sm text-gray-400 italic">N/A</span>;
      const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];

      // UPDATED: Red text for Missing extracted fields
      if (!linked) return <span className="text-red-500 text-xs font-bold">Missing</span>;

      if (linked.indicator) return <Badge variant="destructive" className="text-[10px] px-1 h-5">Indicator</Badge>;
      const val = linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
      const isOld = linked.created_at && task.created_at && new Date(linked.created_at) < new Date(task.created_at);

      // Use helper for DD/MM/YYYY
      const display = col.fieldType === 'Date' ? formatDateForDisplay(val) : val;

      return <span className={`text-xs ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || '-'}</span>;
    }

    if (col.type === 'task') {
      const value = (() => {
        switch (col.field) {
          case 'applicant_name': return task.applicant_name || enhancedTasksData.get(task.id.toString())?.applicant_name || 'N/A';
          case 'company_name': return task.company_id ? (companies.get(task.company_id) || 'N/A') : 'N/A';
          case 'job_level':
            const jobLevel = task.job_level;
            if (!jobLevel) return '-';
            if (typeof jobLevel === 'string') return jobLevel.split('>').pop() || '-';
            if (typeof jobLevel === 'object') {
              try {
                const dept = departments.find(d => d.id == jobLevel.department_id);
                if (!dept) return '-';
                let sub = dept.tm_subdepartments?.find(sd => sd.id == jobLevel.subdepartment_id);
                if (jobLevel.class_id && sub?.classes) {
                  const cls = sub.classes.find(c => c.id == jobLevel.class_id);
                  if (cls?.subClasses && jobLevel.subclass_id) {
                    const subc = cls.subClasses.find(sc => sc.id == jobLevel.subclass_id);
                    if (subc) return subc.name;
                  }
                  if (cls) return cls.name;
                }
                return sub?.name || dept.name || '-';
              } catch (e) { return '-'; }
            }
            return '-';
          case 'officer': return task.officer_name || (typeof task.officer === 'string' ? task.officer : task.officer?.name) || '-';
          case 'task_manager': return task.task_manager_name || (typeof task.task_manager === 'string' ? task.task_manager : task.task_manager?.name) || task.assigned_to_name || '-';
          default:
            return getCellContent(
              task, col.field, enhancedTasksData, taskDependants, new Set(), companies,
              (t) => ({ department: departments.find(d => d.id === t.department_id), job_level: t.job_level, officer: t.officer || t.officer_name, task_manager: t.task_manager || t.task_manager_name || t.assigned_to_name }),
              getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
              (t) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { }),
              (t) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper),
              () => { }, () => { }, () => { }
            );
        }
      })();
      return value === '-' ? <span className="text-slate-300">-</span> : value;
    }
    return <span className="text-slate-300">-</span>;
  };

  const toggleSection = (id) => setExpandedSections(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // --- 7. Configuration Building ---
  const columns = useMemo(() => {
    if (!activeReport || !stages.length) return [];

    const getLabel = (id: string) => id.replace(/_/g, ' ').toUpperCase();
    const cols: any[] = [];

    // Add Task Fields
    activeReport.configuration?.taskFields?.forEach((field: any) => {
      cols.push({ id: `task_${field}`, label: getLabel(field), type: 'task', field });
    });

    // --- ADD NEW: Current Stage Columns ---
    cols.push({ id: 'current_stage_name', label: 'Current Stage', type: 'task', field: 'current_stage_name' });
    cols.push({ id: 'current_stage_status', label: 'Stage Status', type: 'task', field: 'current_stage_status' });

    // --- ADD NEW: Immigration Status Columns ---
    cols.push({ id: 'imm_status_doc', label: 'Imm Status', type: 'imm_status_doc' });
    cols.push({ id: 'imm_status_expiry', label: 'Expiry Date', type: 'imm_status_expiry' });
    cols.push({ id: 'imm_status_days', label: 'Days To Go', type: 'imm_status_days' });

    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});

    stages.filter(s => activeStageIds.includes(s.id)).forEach(stage => {

      if (!isStageApplicableToCurrentFilter(stage.id)) {
        return;
      }

      const config = activeReport.configuration.stages[stage.id];
      const isSpecialStage = SPECIAL_STAGE_IDS.includes(stage.id);

      if (config.isStageDateSelected) {
        cols.push({
          id: `stage_date_${stage.id}`, label: `${stage.name} (Date)`, type: 'stage_date', stageId: stage.id, stageName: stage.name
        });
      }

      if (config.documents) {
        if (isSpecialStage) {
          let wefAdded = false, toAdded = false;
          for (const [kycId] of Object.entries(config.documents)) {
            if (wefAdded && toAdded) break;
            const kycDoc = kycDocuments.get(kycId);
            if (!kycDoc) continue;

            if (!wefAdded) {
              const wefField = kycDoc.fields?.find((f: any) => {
                const name = (f.name || f.fieldName || '').toLowerCase();
                return name === 'with_effect_from' || f.isEffectiveFrom === true || name.includes('effect_from') || name.includes('effective_from');
              });
              if (wefField) {
                cols.push({ id: `field_${stage.id}_wef`, label: `${stage.name} - WEF`, type: 'extracted_field', stageId: stage.id, kycId, fieldId: wefField.id || wefField.name, fieldName: wefField.name || wefField.fieldName, fieldType: wefField.type || wefField.fieldType || 'date', isAutoAdded: true });
                wefAdded = true;
              }
            }
            if (!toAdded) {
              const toField = kycDoc.fields?.find((f: any) => {
                const name = (f.name || f.fieldName || '').toLowerCase();
                return name === 'expiry_date' || f.isEffectiveTo === true || name.includes('expiry') || name.includes('effective_to');
              });
              if (toField) {
                cols.push({ id: `field_${stage.id}_to`, label: `${stage.name} - TO`, type: 'extracted_field', stageId: stage.id, kycId, fieldId: toField.id || toField.name, fieldName: toField.name || toField.fieldName, fieldType: toField.type || toField.fieldType || 'date', isAutoAdded: true });
                toAdded = true;
              }
            }
          }
        }
        if (!isSpecialStage) {
          Object.entries(config.documents).forEach(([kycId, docConfig]: [string, any]) => {
            const kycDoc = kycDocuments.get(kycId);
            if (!kycDoc) return;
            docConfig.fields?.forEach((fieldId: any) => {
              const field = kycDoc.fields?.find((f: any) => f.id === fieldId);
              if (field) {
                cols.push({ id: `field_${stage.id}_${kycId}_${fieldId}`, label: `${kycDoc.display_name || kycDoc.name} - ${field.fieldName || field.name}`, type: 'extracted_field', stageId: stage.id, kycId, fieldId, fieldName: field.fieldName || field.name, fieldType: field.fieldType || field.type });
              }
            });
          });
        }
      }
    });
    return cols;
  }, [activeReport, stages, kycDocuments, isStageApplicableToCurrentFilter]);

  const sortedTasks = useMemo(() => {
    if (!sortConfig || !columns.length) return searchedTasks;
    const sorted = [...searchedTasks];

    sorted.sort((a, b) => {
      const colDef = columns.find(c => c.id === sortConfig.key);
      if (!colDef) return 0;

      const aValue = getSortableValue(a, colDef);
      const bValue = getSortableValue(b, colDef);

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [searchedTasks, sortConfig, columns]);

  const handleSort = (columnId: string) => {
    setSortConfig(current => {
      if (current?.key === columnId) {
        return { key: columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key: columnId, direction: 'asc' };
    });
  };
  const totalItems = sortedTasks.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedTasks.slice(start, start + itemsPerPage);
  }, [sortedTasks, currentPage, itemsPerPage]);

  const columnGroups = useMemo(() => {
    if (!columns.length) return [];
    const groups = [];
    const taskCols = columns.filter(c => c.type === 'task');
    // Task columns + 3 Imm Status columns
    const immStatusColsCount = 3;
    const taskSpan = taskCols.length + immStatusColsCount;

    if (taskCols.length) groups.push({ id: 'task_info', label: 'Task Details', span: taskSpan });

    const stageMap = new Map();
    columns.filter(c => c.type !== 'task' && !['imm_status_doc', 'imm_status_expiry', 'imm_status_days'].includes(c.type)).forEach(col => {
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
      columns.filter(c => c.type === 'task' || ['imm_status_doc', 'imm_status_expiry', 'imm_status_days'].includes(c.type)).forEach(c => rows.push({ ...c, isSubRow: true }));
    }
    const stageGroups = new Set(columns.filter(c => c.type !== 'task' && !['imm_status_doc', 'imm_status_expiry', 'imm_status_days'].includes(c.type)).map(c => c.stageId));
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

  // --- 8. Export ---
  const handleExport = async (type: 'excel' | 'pdf') => {
    if (type === 'excel') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Report');
      const headerRow = columns.map(c => c.label);
      ws.addRow(['Task ID', ...headerRow]);
      filteredTasks.forEach(t => {
        const row = [t.id, ...columns.map(c => {
          const content = renderCellValue(t, c);
          if (React.isValidElement(content)) {
            if (content.props && content.props.children) return content.props.children;
            return '-';
          }
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
          {/* SEARCH INPUT */}
          {activeReport && (
            <div className="relative w-64 hidden md:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search name, ID, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs bg-white border-slate-200 focus:border-blue-400 focus:ring-blue-100"
              />
            </div>
          )}

          {activeReport && (
            <Tabs value={view} onValueChange={(v) => setView(v as any)} className="hidden md:block">
              <TabsList className="grid w-[160px] grid-cols-2 h-9 bg-slate-100">
                <TabsTrigger value="standard" className="gap-2 text-xs"><Rows className="h-3 w-3" /> Rows</TabsTrigger>
                <TabsTrigger value="transposed" className="gap-2 text-xs"><LayoutGrid className="h-3 w-3" /> Cols</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Button variant="outline" size="sm" onClick={() => refreshData()} disabled={loading} className="hidden sm:flex h-9 w-9 p-0">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-9 text-xs">
                <FileDown className="h-3 w-3" /> Export
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
                  className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
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
                  className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  All Sub-departments
                </TabsTrigger>
                {activeSubDepartments.map((sub) => (
                  <TabsTrigger
                    key={sub.id}
                    value={sub.id.toString()}
                    className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                    {sub.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Status Tabs & Pagination Controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Status Filter */}
              <Tabs value={activeStatus} onValueChange={(v) => { setActiveStatus(v); setCurrentPage(1); }}>
                <TabsList className="h-9 bg-slate-100">
                  <TabsTrigger value="all" className="text-xs px-3">All Tasks</TabsTrigger>
                  <TabsTrigger value="wip" className="text-xs px-3">Work In Progress</TabsTrigger>
                  <TabsTrigger value="write_up_completed" className="text-xs px-3">Write Up Completed</TabsTrigger>
                  <TabsTrigger value="endorsed" className="text-xs px-3">Endorsed</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Pagination Controls */}
              <div className="flex items-center gap-4">
                <div className="text-xs text-slate-500 hidden md:block">
                  Showing <strong>{totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</strong>-<strong>{Math.min(currentPage * itemsPerPage, totalItems)}</strong> of <strong>{totalItems}</strong> tasks
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Rows:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger className="w-[70px] h-8 text-xs bg-white border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[100, 200, 500].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === 1} onClick={handlePreviousPage}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium min-w-[60px] text-center text-slate-600">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage >= totalPages} onClick={handleNextPage}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {view === 'transposed' && (
                  <div className="flex gap-1 border-l border-slate-200 pl-3 ml-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpandedSections(new Set([...transposedRows.map(r => r.id)]))}>
                      <ChevronsDown className="h-3 w-3 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpandedSections(new Set())}>
                      <ChevronsRight className="h-3 w-3 text-slate-500" />
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
                        onClick={() => handleSort(col.id)}
                        className="whitespace-nowrap px-4 py-3 font-semibold text-white border-b border-r border-blue-400 text-xs bg-blue-500 cursor-pointer hover:bg-blue-600 transition-colors group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          {col.label}
                          {sortConfig?.key === col.id ? (
                            <ArrowUpDown className={`h-3 w-3 ${sortConfig.direction === 'asc' ? 'text-white' : 'text-blue-200'}`} />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-200">
                  {paginatedTasks.length > 0 ? paginatedTasks.map((task, idx) => (
                    <TableRow key={task.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'} hover:bg-blue-100 transition-colors group`}>
                      <TableCell className={`sticky left-0 z-20 ${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'} group-hover:bg-blue-100 border-r border-b border-gray-100 font-medium text-xs text-center text-slate-700`}>
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
                  )) : (
                    // --- EMPTY STATE BODY ---
                    <TableRow>
                      <TableCell colSpan={columns.length + 1} className="h-48 text-center bg-white">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Briefcase className="h-10 w-10 mb-2 opacity-20" />
                          <p className="text-sm font-medium">No matching tasks found</p>
                          <p className="text-xs">Adjust your search or filters.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
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
                  {paginatedTasks.length > 0 ? transposedRows.map((row, rIdx) => {
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
                  }) : (
                    <TableRow>
                      <TableCell colSpan={2} className="h-32 text-center text-slate-400">No data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )
          )}
        </div>
      </main>
    </div>
  );
}