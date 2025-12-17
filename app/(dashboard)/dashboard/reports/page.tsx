// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown,
  ChevronDown, ChevronsRight, ChevronsDown, FileText,
  ChevronLeft, ChevronRight, RefreshCw, AlertTriangle,
  Clock, ArrowUpDown, Search, Timer, AlertCircle,
  CheckCircle2, Clock3, User
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parse, isValid } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import ExcelJS from 'exceljs';
import {
  getCurrentStageStatus,
  getCellContent,
  getEnhancedImmigrationStatus,
  renderImmigrationStatusCell,
  renderCurrentStageStatusCell,
  ENHANCED_TABLE_HEADERS_IMMIGRATION,
  enhanceTasksWithIndividualData,
  getRawCellValue,
  getTimeStatus,
  formatDuration,
  parseDate // Using tableUtils parseDate for consistency with other table views
} from "../tasks/overall-view/tableUtils";
import {
  fetchTasks,
  fetchStages,
  fetchCompanies,
  fetchAllDocuments,
  fetchAllKycFields,
} from "../tasks/utils/taskManagerData";
import { fetchDepartments } from "../departments/departments/database";
import { MemorizedReportDialog } from "./MemorizedReportDialog";
import { calculateStageDate, findDateInObject } from "../tasks/utils/dateUtils";

// Special stage IDs that should always show WEF and TO columns
const SPECIAL_STAGE_IDS = [
  '072b9710-45df-4a05-ba65-01b4ef29d61d', // Status stage
  'caefd742-5de5-4341-a3bb-81d7b9dd2b73'  // Endorsement stage
];

// --- CONSTANTS FOR LAYOUT ---
const COLUMN_WIDTH_CLASS = "w-[180px] min-w-[180px] max-w-[180px]";
const INDEX_WIDTH_CLASS = "w-[60px] min-w-[60px] max-w-[60px]";

// Helper for display formatting using the standardized parseDate
const formatDateForDisplay = (date: any): string => {
  if (!date) return '-';
  
  // Check if it's already a clean DD/MM/YYYY string
  if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;

  const d = parseDate(date);
  if (!d) return '-';

  try {
    return format(d, 'dd/MM/yyyy');
  } catch (e) {
    return '-';
  }
};

const formatDateTimeForDisplay = (date: any): string => {
  if (!date) return '-';
  
  // Check if it's already a clean DD/MM/YYYY HH:mm string
  if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(date)) return date;

  const d = parseDate(date);
  if (!d) return '-';

  try {
    return format(d, 'dd/MM/yyyy HH:mm');
  } catch (e) {
    return '-';
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
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map());

  // Filter & Search State
  const [activeDeptId, setActiveDeptId] = useState<string>("");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("wip");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [allOfficers, setAllOfficers] = useState<{ id: string, name: string, email: string }[]>([]);
  const [availableOfficers, setAvailableOfficers] = useState<{ id: string, name: string, email: string }[]>([]);
  const [isOfficerDropdownOpen, setIsOfficerDropdownOpen] = useState(false);

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // View & Pagination State
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));
  const [showTimeStatuses, setShowTimeStatuses] = useState(false);

  // --- Column Visibility State ---
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);

  // --- State for toggling stage doc columns (Inline Expansion) ---
  const [expandedStageColumns, setExpandedStageColumns] = useState<Set<string>>(new Set());

  const toggleStageColumns = useCallback((stageId: string) => {
    setExpandedStageColumns(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  }, []);

  // --- Helpers for Cell Content ---
  const getStaffName = useCallback((userId) => {
    if (!userId) return '';
    const user = tmUsers.get(parseInt(userId.toString()));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return null
    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id?.toString())
    const subCls = cls?.subClasses?.find(sc => sc.id.toString() === task.subclass_id?.toString())
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls }
  }, [departments]);

  const getCurrentStageStatusWrapper = useCallback((task) => getCurrentStageStatus(task, stages, departments, allDocuments), [stages, departments, allDocuments]);
  const getEnhancedImmigrationStatusWrapper = useCallback((task) => getEnhancedImmigrationStatus(task, stages, allDocuments, kycDocuments), [stages, allDocuments, kycDocuments]);

  // --- 1. Initialization & 2. Data Fetching ---
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

        // Fetch Users for Staff Name resolution and officer filtering
        const { data: users } = await supabase.from('tm_users').select('*');
        const usersMap = new Map();
        users?.forEach(u => usersMap.set(u.id, u));
        setTmUsers(usersMap);

        // Set all officers for filtering
        const officerUsers = users?.filter(u => u.role === 'officer') || [];
        const formattedOfficers = officerUsers.map(o => ({
          id: o.id.toString(),
          name: o.name || o.email.split('@')[0],
          email: o.email,
          rawDepartmentId: o.department_id
        }));
        setAllOfficers(formattedOfficers);

      } catch (err) {
        console.error("❌ Failed to fetch reports:", err);
        toast({ title: "Error", description: "Could not load saved reports.", variant: "destructive" });
      } finally {
        setReportLoading(false);
      }
    };
    initReports();
  }, []);

  useEffect(() => {
    // When switching reports or on initial load, clear session fields
    if (activeReport && !activeReport.sessionIncludedFields) {
      setActiveReport(prev => ({
        ...prev!,
        sessionIncludedFields: prev!.configuration.taskFields?.map(f => f.id) || []
      }));
    }
  }, [activeReport?.id]);

  // --- 3. Filtering & Sorting Logic ---
  const activeDepartment = useMemo(() =>
    departments.find(d => d.id.toString() === activeDeptId),
    [departments, activeDeptId]);

  const activeSubDepartments = useMemo(() =>
    activeDepartment?.tm_subdepartments || [],
    [activeDepartment]);

  // Update available officers
  useEffect(() => {
    if (!activeDeptId) {
      setAvailableOfficers([]);
      setSelectedOfficers([]);
      return;
    }

    const allowedOfficerIds = new Set<string>();

    const collectFromHistory = (subDept: any) => {
      if (!subDept?.officer_history) return;
      subDept.officer_history.forEach((h: any) => {
        if (h.id && !h.end_date) {
          allowedOfficerIds.add(h.id.toString());
        }
      });
    };

    if (activeSubDeptId && activeSubDeptId !== 'all') {
      const currentSubDept = activeSubDepartments.find(s => s.id.toString() === activeSubDeptId.toString());
      collectFromHistory(currentSubDept);
    } else {
      activeSubDepartments.forEach(sub => collectFromHistory(sub));
      allOfficers.forEach(o => {
        if (o.rawDepartmentId && o.rawDepartmentId.toString() === activeDeptId.toString()) {
          allowedOfficerIds.add(o.id.toString());
        }
      });
    }

    const finalOfficers = allOfficers.filter(o => allowedOfficerIds.has(o.id.toString()));
    setAvailableOfficers(finalOfficers);

    setSelectedOfficers(prev => {
      const availableIds = finalOfficers.map(o => o.id);
      return prev.filter(id => availableIds.includes(id));
    });

  }, [activeDeptId, activeSubDeptId, allOfficers, activeSubDepartments]);

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

      const { enhancedTasksData: enhancedMap, taskDependants: dependantsMap } =
        await enhanceTasksWithIndividualData(safeTasks);

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
    setExpandedStageColumns(new Set());
    setIsReportDialogOpen(false);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;

      if (selectedOfficers.length > 0) {
        const officerId = task.officer_id?.toString();
        const assignedId = task.assigned_to?.toString();
        const isMatch = (officerId && selectedOfficers.includes(officerId)) ||
          (assignedId && selectedOfficers.includes(assignedId));
        if (!isMatch) return false;
      }

      const isWriteUpCompleted = task.status === 'write_up_completed';
      const isEndorsed = task.status === 'endorsed';
      const isCompleted = isWriteUpCompleted || isEndorsed || ['completed', 'archived'].includes(task.status);

      if (activeStatus === 'wip' && isCompleted) return false;
      if (activeStatus === 'write_up_completed' && !isWriteUpCompleted) return false;
      if (activeStatus === 'endorsed' && !isEndorsed) return false;

      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptId, activeStatus, selectedOfficers]);

  const searchedTasks = useMemo(() => {
    if (!searchQuery) return filteredTasks;
    const lowerQuery = searchQuery.toLowerCase();
    return filteredTasks.filter(t =>
      t.id.toString().includes(lowerQuery) ||
      (t.applicant_name && t.applicant_name.toLowerCase().includes(lowerQuery)) ||
      (companies.get(t.company_id)?.toLowerCase().includes(lowerQuery))
    );
  }, [filteredTasks, searchQuery, companies]);

  // Sorting Helper
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
      const d = parseDate(expiry);
      if (!d) return -9999;
      return d.getTime();
    }
    if (col.type === 'task') {
      return getRawCellValue(
        departments,
        task,
        col.field,
        enhancedTasksData,
        companies,
        getStaffName,
        getEnhancedImmigrationStatusWrapper,
        getCurrentStageStatusWrapper
      );
    }
    if (col.type === 'stage_date') {
      const d = task.stages?.[col.stageId]?.date;
      return d ? parseDate(d)?.getTime() || 0 : 0;
    }
    return '';
  };

  const handleNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const handlePreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const handleItemsPerPageChange = (val: string) => { setItemsPerPage(Number(val)); setCurrentPage(1); };

  const getDocumentForTaskStage = useCallback((task, stage) => {
    let linked = task.source_document_id?.[stage.id];
    if (!linked && task.stages?.[stage.id]?.documents) {
      linked = Object.values(task.stages[stage.id].documents).map((doc: any) =>
        doc.document_id || doc.id
      );
    }
    if (!linked) return [];
    const linkedIds = Array.isArray(linked) ? linked : [linked];
    return linkedIds
      .map(ref => {
        const docId = typeof ref === 'string' ? ref : ref.id;
        if (!docId) return null;
        return allDocuments.find(d => d.id.toString() === docId.toString());
      })
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

  const renderCellValue = (task, col) => {
    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-slate-300">-</span>;

      if (!isStageApplicableToTask(stage, task)) {
        return <span className="text-sm text-gray-300 italic">N/A</span>;
      }
      
      const currentStageStatus = getCurrentStageStatus(task, stages, departments, allDocuments);
      const currentStage = stages.find(s => s.name === currentStageStatus?.stageName);

      if (currentStage?.order_num !== undefined && stage.order_num > currentStage.order_num) {
        return <span className="text-slate-300">-</span>;
      }
      
      const stageData = task.stages?.[col.stageId];
      const estimatedMinutes = stage.estimated_time;
      
      // --- 1. CALCULATE EFFECTIVE START TIME ---
      let effectiveStartTime = task.created_at ? parseDate(task.created_at) : null;
      const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      const currentStageIndex = sortedStages.findIndex(s => s.id === col.stageId);
      
      if (currentStageIndex > 0) {
        const prevStage = sortedStages[currentStageIndex - 1];
        const prevStageData = task.stages?.[prevStage.id];
        
        if (prevStageData) {
          // Check previous stage completion time/date to use as start time
          const prevCompletionDateStr = calculateStageDate(
            prevStage,
            prevStageData,
            getDocumentForTaskStage(task, prevStage)[0], // Use first doc as proxy
            kycDocuments.get(getDocumentForTaskStage(task, prevStage)[0]?.document_id)?.fields,
            null,
            false
          );
          
          if (prevCompletionDateStr) {
             effectiveStartTime = parseDate(prevCompletionDateStr);
          } else if (prevStageData.status === 'skipped' && prevStageData.skippedAt) {
             effectiveStartTime = parseDate(prevStageData.skippedAt);
          }
        }
      }

      if (!effectiveStartTime && task.date_initiated) {
        effectiveStartTime = parseDate(task.date_initiated);
      }

      // --- 2. CHECK SKIPPED STATUS ---
      if (stageData?.status === 'skipped') {
        const reason = stageData?.reason || 'No reason provided';
        const skippedAt = stageData?.skippedAt ? parseDate(stageData.skippedAt) : null;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium cursor-help">
                <AlertCircle className="h-3.5 w-3.5" /> Skipped
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-amber-50 text-amber-900 border-amber-200">
              <div className="text-xs text-left space-y-1">
                <p><span className="font-semibold">Reason:</span> {reason}</p>
                {skippedAt && <p><span className="font-semibold">Date:</span> {formatDateTimeForDisplay(skippedAt)}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      // --- 3. DETERMINE COMPLETION DATE (Using Utils) ---
      // Get all linked docs for this stage
      let linkedDocs = [];
      if (stage.documents?.length > 0) {
        linkedDocs = stage.documents.flatMap(docConfig => {
          if (!isDocumentApplicable(docConfig, task)) return [];
          return getDocumentForTaskStage(task, { ...stage, documents: [docConfig] });
        }).filter(d => d && !d.indicator);
      }
      
      // Use the util to calculate the date. 
      // We pass the first doc if available, similar to EditableStageCell.
      // If there are multiple, the util calculates based on the passed doc. 
      // To simulate finding the "best" date among multiple docs (original behavior), we could loop, 
      // but usually the first applicable document found is the source of truth.
      const primaryDoc = linkedDocs[0]; 
      const docFields = primaryDoc ? kycDocuments.get(primaryDoc.kyc_id || primaryDoc.document_id)?.fields : [];

      const completionDateStr = calculateStageDate(
        stage, 
        stageData, 
        primaryDoc, 
        docFields, 
        null, 
        false
      );

      const completionDate = parseDate(completionDateStr);
      
      if (completionDate) {
        let isCompletedOverdue = false;
        let durationTakenText = 'N/A';
        
        if (effectiveStartTime && estimatedMinutes && estimatedMinutes > 0) {
          const durationMs = completionDate.getTime() - effectiveStartTime.getTime();
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          isCompletedOverdue = durationMinutes > estimatedMinutes;
          durationTakenText = formatDuration(durationMinutes);
        }
        
        const textColorClass = isCompletedOverdue ? "text-amber-600" : "text-emerald-600";
        const icon = isCompletedOverdue ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />;
        const borderColorClass = isCompletedOverdue ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-100";
        const statusText = isCompletedOverdue ? "Completed (Overdue)" : "Completed On Time";

        if (!showTimeStatuses) {
          return (
            <div className={`flex items-center gap-1.5 font-semibold text-xs ${textColorClass}`}>
              {icon}
              <span>{formatDateForDisplay(completionDate)}</span>
            </div>
          );
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 font-semibold text-xs ${textColorClass} cursor-default`}>
                {icon}
                <span>{formatDateForDisplay(completionDate)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className={`${borderColorClass} text-slate-900 border shadow-md`}>
              <div className="space-y-2 p-1">
                <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                  <span className={`font-bold ${textColorClass}`}>{statusText}</span>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between gap-4"><span className="text-slate-500">Completed:</span> <span>{formatDateTimeForDisplay(completionDate)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500">Duration:</span> <span>{durationTakenText}</span></div>
                  {estimatedMinutes > 0 && (
                    <div className="flex justify-between gap-4"><span className="text-slate-500">Allowed:</span> <span>{formatDuration(estimatedMinutes)}</span></div>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }
      
      // --- 4. SCENARIO B: STAGE IS IN PROGRESS ---
      if (!effectiveStartTime) {
        return <span className="text-slate-300">-</span>;
      }

      if (!showTimeStatuses) {
        return <span className="text-slate-300">-</span>;
      }

      const timeStatus = getTimeStatus(effectiveStartTime, estimatedMinutes);
      const isOverdue = timeStatus?.isOverdue || false;
      const textColorClass = isOverdue ? "text-red-600" : "text-blue-600";
      const icon = isOverdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />;
      const borderColorClass = isOverdue ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50";

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 font-medium text-xs ${textColorClass} cursor-default`}>
              {icon}
              <span>{timeStatus?.formattedElapsed}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className={`${borderColorClass} text-slate-900 border shadow-md`}>
            <div className="space-y-2 p-1">
              <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                <span className={`font-bold ${textColorClass}`}>
                  {isOverdue ? "In Progress (Overdue)" : "In Progress (On Track)"}
                </span>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Started:</span>
                  <span>{formatDateTimeForDisplay(effectiveStartTime)}</span>
                </div>
                {estimatedMinutes > 0 && (
                  <>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Remaining:</span>
                      <span className={isOverdue ? 'font-bold text-red-600' : 'text-green-600'}>
                        {isOverdue ? `Overdue by ${timeStatus?.formattedOverdue}` : timeStatus?.formattedRemaining}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Estimate:</span>
                      <span>{formatDuration(estimatedMinutes)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (col.type === 'extracted_field') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-slate-300">-</span>;
      if (!isStageApplicableToTask(stage, task)) return <span className="text-sm text-gray-300 italic">N/A</span>;

      if (col.isAutoAdded) {
        let foundValue = null;
        let foundDoc = null;
        for (const stageDocInfo of (stage.documents || [])) {
          if (!isDocumentApplicable(stageDocInfo, task)) continue;
          const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
          if (!linked || linked.indicator) continue;
          
          // Use findDateInObject if it's a date field, or direct access
          if (col.fieldType === 'date' || col.fieldType === 'Date') {
             foundValue = findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId]);
          } else {
             foundValue = linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
          }
          
          if (foundValue) { foundDoc = linked; break; }
        }
        if (!foundDoc) return <span className="text-red-500 text-xs font-bold">Missing</span>;
        const isOld = foundDoc.created_at && task.created_at && new Date(foundDoc.created_at) < new Date(task.created_at);
        const display = (col.fieldType === 'Date' || col.fieldType === 'date') ? formatDateForDisplay(foundValue) : foundValue;
        return <span className={`text-xs ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || '-'}</span>;
      }

      const stageDocInfo = stage?.documents?.find((d) => d.kycId === col.kycId);
      if (!stageDocInfo) return <span className="text-slate-300">-</span>;
      if (!isDocumentApplicable(stageDocInfo, task)) return <span className="text-sm text-gray-300 italic">N/A</span>;
      const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
      if (!linked) return <span className="text-red-500 text-xs font-bold">Missing</span>;

      if (linked.indicator) return <span className="inline-flex items-center rounded-md bg-red-50 text-red-600 border border-red-200 text-[10px] px-1.5 py-0.5">Indicator</span>;
      
      let val;
      if (col.fieldType === 'date' || col.fieldType === 'Date') {
         val = findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId]);
      } else {
         val = linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
      }

      const isOld = linked.created_at && task.created_at && new Date(linked.created_at) < new Date(task.created_at);
      const display = (col.fieldType === 'Date' || col.fieldType === 'date') ? formatDateForDisplay(val) : val;

      return <span className={`text-xs ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || '-'}</span>;
    }

    if (col.type === 'task') {
      return getCellContent(
        departments,
        task,
        col.field,
        enhancedTasksData,
        taskDependants,
        new Set(), // No expansion tracking in reports
        companies,
        getTaskHierarchy,
        getStaffName,
        getEnhancedImmigrationStatusWrapper,
        getCurrentStageStatusWrapper,
        (t) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { }),
        (t) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper),
        () => { }, () => { }, () => { } // No-op callbacks for interactions
      );
    }
    return <span className="text-slate-300">-</span>;
  };

  const toggleSection = (id) => setExpandedSections(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const columns = useMemo(() => {
    if (!activeReport || !stages.length) return [];

    const getLabel = (id: any) => {
      const constantHeader = ENHANCED_TABLE_HEADERS_IMMIGRATION.find(h => h.id === id);
      if (constantHeader) return constantHeader.label;
      if (typeof id !== 'string') return String(id || '').toUpperCase();
      return id.replace(/_/g, ' ').toUpperCase();
    };

    const cols: any[] = [];
    const fieldsToDisplay = activeReport.sessionIncludedFields ||
      activeReport.configuration?.taskFields?.map(f => f.id) || [];

    // Add task fields - only once
    fieldsToDisplay.forEach((fieldId: string) => {
      if (!fieldId) return;
      cols.push({
        id: `task_${fieldId}`,  // Add 'task_' prefix to ensure uniqueness
        label: getLabel(fieldId),
        type: 'task',
        field: fieldId
      });
    });

    // Add stage columns
    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});
    stages
      .filter(s => activeStageIds.includes(s.id))
      .filter(s => isStageApplicableToCurrentFilter(s.id))
      .forEach(stage => {
        const config = activeReport.configuration.stages[stage.id];
        const isSpecialStage = SPECIAL_STAGE_IDS.includes(stage.id);
        const hasDocuments = config.documents && Object.keys(config.documents).length > 0;
        const shouldShowDateColumn = config.isStageDateSelected || hasDocuments;

        if (shouldShowDateColumn) {
          const dateColId = `stage_${stage.id}_date`;
          if (!cols.some(c => c.id === dateColId)) {
            cols.push({
              id: dateColId,
              label: `${stage.name} (Date)`,
              type: 'stage_date',
              stageId: stage.id,
              stageName: stage.name,
              hasSubColumns: hasDocuments
            });
          }
        }

        if (hasDocuments && expandedStageColumns.has(stage.id)) {
          if (isSpecialStage) {
            let wefAdded = false, toAdded = false;

            for (const [kycId] of Object.entries(config.documents)) {
              if (wefAdded && toAdded) break;
              const kycDoc = kycDocuments.get(kycId);
              if (!kycDoc) continue;

              if (!wefAdded) {
                const wefField = kycDoc.fields?.find((f: any) => {
                  const name = (f.name || f.fieldName || '').toLowerCase();
                  return name === 'with_effect_from' || f.isEffectiveFrom === true ||
                    name.includes('effect_from') || name.includes('effective_from');
                });

                if (wefField) {
                  const fieldId = wefField.id || wefField.name;
                  const colId = `stage_${stage.id}_${kycId}_${fieldId}`;
                  if (!cols.some(c => c.id === colId)) {
                    cols.push({
                      id: colId,
                      label: `${stage.name} - WEF`,
                      type: 'extracted_field',
                      stageId: stage.id,
                      kycId,
                      fieldId,
                      fieldName: wefField.name || wefField.fieldName,
                      fieldType: wefField.type || wefField.fieldType || 'date',
                      isAutoAdded: true
                    });
                  }
                  wefAdded = true;
                }
              }

              if (!toAdded) {
                const toField = kycDoc.fields?.find((f: any) => {
                  const name = (f.name || f.fieldName || '').toLowerCase();
                  return name === 'expiry_date' || f.isEffectiveTo === true ||
                    name.includes('expiry') || name.includes('effective_to');
                });

                if (toField) {
                  const fieldId = toField.id || toField.name;
                  const colId = `stage_${stage.id}_${kycId}_${fieldId}`;
                  if (!cols.some(c => c.id === colId)) {
                    cols.push({
                      id: colId,
                      label: `${stage.name} - TO`,
                      type: 'extracted_field',
                      stageId: stage.id,
                      kycId,
                      fieldId,
                      fieldName: toField.name || toField.fieldName,
                      fieldType: toField.type || toField.fieldType || 'date',
                      isAutoAdded: true
                    });
                  }
                  toAdded = true;
                }
              }
            }
          } else {
            Object.entries(config.documents).forEach(([kycId, docConfig]: [string, any]) => {
              const kycDoc = kycDocuments.get(kycId);
              if (!kycDoc) return;

              (docConfig.fields || []).forEach((fieldId: any) => {
                const field = kycDoc.fields?.find((f: any) => f.id === fieldId);
                if (field) {
                  const colId = `stage_${stage.id}_${kycId}_${fieldId}`;
                  if (!cols.some(c => c.id === colId)) {
                    cols.push({
                      id: colId,
                      label: `${kycDoc.display_name || kycDoc.name} - ${field.fieldName || field.name}`,
                      type: 'extracted_field',
                      stageId: stage.id,
                      kycId,
                      fieldId,
                      fieldName: field.fieldName || field.name,
                      fieldType: field.fieldType || field.type
                    });
                  }
                }
              });
            });
          }
        }
      });

    return cols;
  }, [activeReport, stages, kycDocuments, isStageApplicableToCurrentFilter, expandedStageColumns]);

  useEffect(() => {
    if (columns.length > 0) {
      setVisibleColumnIds(prev => {
        const newIds = columns.map(c => c.id);
        const combined = new Set([...prev, ...newIds]);
        return Array.from(combined);
      });
    }
  }, [columns]);

  const filteredColumns = useMemo(() => {
    return columns.filter(c => visibleColumnIds.includes(c.id));
  }, [columns, visibleColumnIds]);


  const sortedTasks = useMemo(() => {
    if (!sortConfig || !filteredColumns.length) return searchedTasks;
    const sorted = [...searchedTasks];
    sorted.sort((a, b) => {
      const colDef = filteredColumns.find(c => c.id === sortConfig.key);
      if (!colDef) return 0;
      const aValue = getSortableValue(a, colDef);
      const bValue = getSortableValue(b, colDef);
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [searchedTasks, sortConfig, filteredColumns]);

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
    if (!filteredColumns.length) return [];
    const groups = [];
    const taskCols = filteredColumns.filter(c => c.type === 'task');
    if (taskCols.length) groups.push({ id: 'task_info', label: 'Task Details', span: taskCols.length });
    const stageMap = new Map();
    filteredColumns.filter(c => c.type !== 'task').forEach(col => {
      if (!stageMap.has(col.stageId)) stageMap.set(col.stageId, { id: col.stageId, label: '', count: 0 });
      const group = stageMap.get(col.stageId);
      const stageName = stages.find(s => s.id === col.stageId)?.name || 'Stage Info';
      group.label = stageName;
      group.count++;
    });
    stageMap.forEach(g => groups.push({ id: g.id, label: g.label, span: g.count }));
    return groups;
  }, [filteredColumns, stages]);

  const transposedRows = useMemo(() => {
    if (!activeReport) return [];
    const rows = [];
    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase });
    if (expandedSections.has('task_details')) {
      filteredColumns.filter(c => c.type === 'task').forEach(c => rows.push({ ...c, isSubRow: true }));
    }
    const stageGroups = new Set(filteredColumns.filter(c => c.type !== 'task').map(c => c.stageId));
    stageGroups.forEach(stageId => {
      const stage = stages.find(s => s.id === stageId);
      if (!stage) return;
      rows.push({ type: 'section_header', id: stage.id, label: stage.name, icon: stage.icon || Briefcase });
      if (expandedSections.has(stage.id)) {
        filteredColumns.filter(c => c.stageId === stageId).forEach(c => {
          let label = c.label;
          if (c.type === 'stage_date') label = "Completion Date";
          if (c.type === 'extracted_field') label = c.label.split(' - ')[1] || c.label;
          rows.push({ ...c, label, isSubRow: true });
        });
      }
    });
    return rows;
  }, [activeReport, filteredColumns, expandedSections, stages]);

const handleExport = async (type: 'excel' | 'pdf') => {
    if (type === 'excel') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Report');

      ws.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 }
      ];

      const getExportCellValue = (task: any, col: any) => {
        if (col.type === 'task') {
          return getRawCellValue(
            departments, task, col.field, enhancedTasksData, companies, 
            getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper
          );
        }

        if (col.type === 'stage_date') {
          const stage = stages.find(s => s.id === col.stageId);
          if (!stage) return '-';
          
          if (!isStageApplicableToTask(stage, task)) return 'Unallocated';

          const stageData = task.stages?.[col.stageId];

          if (stageData?.status === 'skipped') return `Skipped: ${stageData.reason || ''}`;

          // Using calculateStageDate for consistent export logic
          let linkedDocs = [];
          if (stage.documents?.length > 0) {
            linkedDocs = stage.documents.flatMap((docConfig: any) => {
              if (!isDocumentApplicable(docConfig, task)) return [];
              return getDocumentForTaskStage(task, { ...stage, documents: [docConfig] });
            }).filter((d: any) => d && !d.indicator);
          }
          const primaryDoc = linkedDocs[0];
          const docFields = primaryDoc ? kycDocuments.get(primaryDoc.kyc_id || primaryDoc.document_id)?.fields : [];

          const completionDateStr = calculateStageDate(stage, stageData, primaryDoc, docFields, null, false);

          const completionDate = parseDate(completionDateStr);
          if (completionDate) return formatDateForDisplay(completionDate);
          
          let effectiveStartTime = task.created_at ? parseDate(task.created_at) : null;
          
          if(stageData?.status === 'in_progress' || (effectiveStartTime && !completionDate)) return "-";

          return '-';
        }

        if (col.type === 'extracted_field') {
          const stage = stages.find(s => s.id === col.stageId);
          if (!stage) return '-';
          
          if (!isStageApplicableToTask(stage, task)) return 'Unallocated';
          
          let foundValue = null;
          let foundDoc = null;
          const docsToSearch = col.isAutoAdded 
            ? (stage.documents || [])
            : [stage?.documents?.find((d: any) => d.kycId === col.kycId)].filter(Boolean);

          for (const stageDocInfo of docsToSearch) {
            if (!isDocumentApplicable(stageDocInfo, task)) continue;
            const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
            if (!linked || linked.indicator) continue;
            
            if (col.fieldType === 'date' || col.fieldType === 'Date') {
                 foundValue = findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId]);
            } else {
                 foundValue = linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
            }
            
            if (foundValue) { foundDoc = linked; break; }
          }
          if (!foundDoc) return col.isAutoAdded ? 'Missing' : '-';
          if (foundDoc.indicator) return 'Indicator';
          return (col.fieldType === 'Date' || col.fieldType === 'date') ? formatDateForDisplay(foundValue) : foundValue;
        }
        return '';
      };

      ws.columns = [
        { header: 'Task ID', key: 'id', width: 10 },
        ...filteredColumns.map(col => ({
          header: col.label,
          key: col.id,
          width: 30 
        }))
      ];

      const headerRow = ws.getRow(1);
      headerRow.height = 30; 
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2563EB' }, // Blue-600
        };
        cell.font = {
          color: { argb: 'FFFFFFFF' }, // White
          bold: true,
          size: 11
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      filteredTasks.forEach((task, index) => {
        const rowData = [
          task.id,
          ...filteredColumns.map(col => {
            const val = getExportCellValue(task, col);
            return val === null || val === undefined ? '' : String(val);
          })
        ];
        
        const row = ws.addRow(rowData);
        
        const isOddRow = index % 2 !== 0; 
        const rowBackgroundColor = isOddRow ? 'FFEFF6FF' : 'FFFFFFFF'; 

        row.eachCell((cell, colNumber) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowBackgroundColor }
          };

          const isUnallocated = cell.value === 'Unallocated';

          cell.font = {
            color: { argb: isUnallocated ? 'FFFF0000' : 'FF000000' },
            bold: isUnallocated
          };

          cell.alignment = { 
            vertical: 'middle', 
            horizontal: colNumber === 1 ? 'center' : 'left',
            wrapText: false
          };

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, 
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Report_${activeReport.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
    } else {
       toast({ title: "Coming Soon", description: "PDF export is being upgraded." });
    }
  };

  if (reportLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>;

  const toggleTimeStatuses = () => {
    setShowTimeStatuses(prev => !prev);
  };

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
            {activeReport && (
              <p className="text-xs text-slate-500 hidden md:block">
                {activeReport.description || "Generated Report View"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Officer Filter */}
          <div className="relative">
            <DropdownMenu open={isOfficerDropdownOpen} onOpenChange={setIsOfficerDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center space-x-2"
                  onClick={() => setIsOfficerDropdownOpen(!isOfficerDropdownOpen)}
                  disabled={!activeDeptId}
                >
                  <User className="h-4 w-4" />
                  <span>
                    {selectedOfficers.length > 0
                      ? `${selectedOfficers.length} selected`
                      : activeSubDeptId !== 'all'
                        ? "Filter Sub-dept Officers"
                        : activeDeptId
                          ? "Filter Dept Officers" 
                          : "Select department first"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 p-2 max-h-80 overflow-y-auto">
                {!activeDeptId ? (
                  <div className="px-2 py-1.5 text-sm text-gray-500">Please select a department first</div>
                ) : availableOfficers.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-gray-500">
                    No officers found in this department
                    <div className="text-xs text-gray-400 mt-1">
                      Department ID: {activeDeptId}, Total officers: {allOfficers.length}
                    </div>
                  </div>
                ) : (
                  <>
                    {availableOfficers.map((officer) => (
                      <div key={officer.id} className="flex items-center space-x-2 p-1.5 hover:bg-gray-100 rounded">
                        <input
                          type="checkbox"
                          id={`officer-${officer.id}`}
                          checked={selectedOfficers.includes(officer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOfficers([...selectedOfficers, officer.id]);
                            } else {
                              setSelectedOfficers(selectedOfficers.filter(id => id !== officer.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`officer-${officer.id}`} className="text-sm text-gray-700">
                          {officer.name} 
                        </label>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 mt-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-sm"
                        onClick={() => setSelectedOfficers([])}
                        disabled={selectedOfficers.length === 0}
                      >
                        Clear selection
                      </Button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search Input */}
          <div className="relative w-64 hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search name, ID, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-white border-slate-200 focus:border-blue-400 focus:ring-blue-100"
            />
          </div>

          {activeReport && (
            <Tabs value={view} onValueChange={(v) => setView(v as any)} className="hidden md:block">
              <TabsList className="grid w-[160px] grid-cols-2 h-9 bg-slate-100">
                <TabsTrigger value="standard" className="gap-2 text-xs">
                  <Rows className="h-3 w-3" /> Rows
                </TabsTrigger>
                <TabsTrigger value="transposed" className="gap-2 text-xs">
                  <LayoutGrid className="h-3 w-3" /> Cols
                </TabsTrigger>
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

          <Button
            variant="outline"
            size="sm"
            onClick={toggleTimeStatuses}
            className="h-8"
          >
            <Clock3 className="h-4 w-4 mr-2" />
            {showTimeStatuses ? 'Hide Time Status' : 'Show Time Status'}
          </Button>
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
                    <TableHead className={`${INDEX_WIDTH_CLASS} border-b border-r bg-blue-700 text-white sticky left-0 z-40 text-center font-bold`}>#</TableHead>
                    {columnGroups.map((group, i) => (
                      <TableHead
                        key={i}
                        colSpan={group.span}
                        className="text-center font-bold text-white border-b border-r last:border-r-0 bg-blue-600 py-3 text-sm"
                      >
                        {group.label}
                      </TableHead>
                    ))}
                  </TableRow>
                  {/* Column Header Row */}
                  <TableRow className="bg-blue-500 hover:bg-blue-500">
                    <TableHead className={`${INDEX_WIDTH_CLASS} border-b border-r bg-blue-600 text-white sticky left-0 z-40 text-center font-semibold text-xs`}>#</TableHead>
                    {filteredColumns.map(col => (
                      <TableHead
                        key={col.id}
                        onClick={() => handleSort(col.id)}
                        className={`${COLUMN_WIDTH_CLASS} whitespace-nowrap px-4 py-3 font-semibold text-white border-b border-r text-xs bg-blue-500 cursor-pointer hover:bg-blue-600 transition-colors group`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            {col.label}
                            {col.hasSubColumns && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStageColumns(col.stageId);
                                }}
                                className="p-0.5 hover:bg-blue-400 rounded transition-colors text-white shrink-0"
                              >
                                {expandedStageColumns.has(col.stageId) ? (
                                  <Minus className="h-3 w-3" />
                                ) : (
                                  <Plus className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>

                          {sortConfig?.key === col.id ? (
                            <ArrowUpDown className={`h-3 w-3 shrink-0 ${sortConfig.direction === 'asc' ? 'text-white' : 'text-blue-200'}`} />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 shrink-0 text-white" />
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-200">
                  {paginatedTasks.length > 0 ? paginatedTasks.map((task, idx) => (
                    <TableRow key={task.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'} hover:bg-blue-100 transition-colors group`}>
                      <TableCell className={`${INDEX_WIDTH_CLASS} sticky left-0 z-20 ${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'} group-hover:bg-blue-100 border-r border-b border-gray-100 font-medium text-xs text-center text-slate-700`}>
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </TableCell>
                      {filteredColumns.map(col => (
                        <TableCell key={col.id} className={`${COLUMN_WIDTH_CLASS} border-b border-r border-gray-100 p-3 text-xs align-middle`}>
                          <div className="truncate w-full">
                            {safeRender(renderCellValue(task, col))}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={filteredColumns.length + 1} className="h-48 text-center bg-white">
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
                    {paginatedTasks.map((task) => (
                      <TableHead
                        key={task.id}
                        className={`${COLUMN_WIDTH_CLASS} text-center bg-blue-700 text-white border-r border-blue-600 font-semibold text-xs py-3 px-2`}
                      >
                        <div className="flex flex-col gap-1 w-full">
                          <span className="font-bold opacity-80">#{(currentPage - 1) * itemsPerPage + paginatedTasks.indexOf(task) + 1}</span>
                          <span className="truncate block w-full text-sm" title={task.applicant_name}>
                            {task.applicant_name}
                          </span>
                          <span className="inline-flex items-center justify-center rounded-md bg-blue-600 text-blue-100 text-[10px] px-1.5 py-0.5 mx-auto">
                            ID: {task.id}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-200">
                  {paginatedTasks.length > 0 ? transposedRows.map((row, rIdx) => {
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
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-700 text-base">{row.label}</span>
                                </div>
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
                            className={`${COLUMN_WIDTH_CLASS} text-center border-r border-slate-100 p-3 align-middle`}
                          >
                            <div className="truncate w-full mx-auto">
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