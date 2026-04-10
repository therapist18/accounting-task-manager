// @ts-nocheck
"use client";

/**
 * ReportsPage — updated to mirror the DepartmentTasksManager / EnhancedTable /
 * EditableStageCell stage-applicability system.
 *
 * KEY CHANGE: stage applicability is now evaluated **per task** using the same
 * dept → subdept → class walk as the rest of the TM system.  A stage that is
 * N/A for one task's class may be applicable for another task's class, so we
 * never hide columns globally — we render "N/A" in the individual cell instead,
 * exactly like EditableStageCell does.
 */

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
  CheckCircle2, Clock3, User, EyeOff, Eye, Filter
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
import { toast } from "@/lib/hooks/use-toast";
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
  parseDate
} from "../tasks/overall-view/tableUtils";
import {
  fetchTasks,
  fetchStages,
  fetchCompanies,
  fetchAllDocuments,
  fetchAllKycFields,
} from "../tasks/utils/taskManagerData";
import { getOfficerDisplayName } from "@/lib/shared-user-assignment-service";
import { fetchDepartments } from "../departments/departments/database";
import { userService } from "@/lib/shared-user-assignment-service";
import { MemorizedReportDialog } from "./MemorizedReportDialog";
import { calculateStageDate, findDateInObject } from "../tasks/utils/dateUtils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SPECIAL_STAGE_IDS = [
  '072b9710-45df-4a05-ba65-01b4ef29d61d',
  'caefd742-5de5-4341-a3bb-81d7b9dd2b73'
];

const COLUMN_WIDTH_CLASS = "w-[180px] min-w-[180px] max-w-[180px]";
const INDEX_WIDTH_CLASS = "w-[50px] min-w-[50px] max-w-[50px]";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const formatDateForDisplay = (date: any): string => {
  if (!date) return '-';
  if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;
  const d = parseDate(date);
  if (!d) return '-';
  try { return format(d, 'dd/MM/yyyy'); } catch { return '-'; }
};

const formatDateTimeForDisplay = (date: any): string => {
  if (!date) return '-';
  if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(date)) return date;
  const d = parseDate(date);
  if (!d) return '-';
  try { return format(d, 'dd/MM/yyyy HH:mm'); } catch { return '-'; }
};

const getElapsedMinutes = (from: Date | null, to: Date = new Date()): number | null => {
  if (!from || Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000));
};

const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string' || typeof content === 'number') return content;
  if (content === null || content === undefined) return <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">—</span>;
  if (Array.isArray(content)) return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  if (typeof content === 'object') {
    if ('status' in content) {
      const s = content.status;
      if (typeof s === 'string' || typeof s === 'number') return s;
      if (React.isValidElement(s)) return s;
      if (!s) return null;
      return JSON.stringify(s);
    }
    return <span className="text-sm text-slate-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
  }
  return String(content);
};

const isStageApplicableToTask = (stage: any, task: any, departments: any[]): boolean => {
  if (!task || !stage || !departments?.length) return true;
  try {
    const dept = departments.find(d => d.id === (task.department?.id || task.department_id));
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) =>
      s.id === (task.subdepartment?.id || task.subdepartment_id)
    );
    if (!subdept) return true;

    if (task.subclass_id) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === task.class_id?.toString());
      const subCls = cls?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString());
      const subClassStage = subCls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (subClassStage && typeof subClassStage.applicable === 'boolean') return subClassStage.applicable;
    }

    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === task.class_id?.toString());
      const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (classStage && typeof classStage.applicable === 'boolean') return classStage.applicable;
    }

    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') return subdeptStage.applicable;

    return true;
  } catch (error) {
    return true;
  }
};

export default function ReportsPage() {
  // ── Report state ───────────────────────────────────────────────────────────
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [availableReports, setAvailableReports] = useState<any[]>([]);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(true);

  // ── Data state ─────────────────────────────────────────────────────────────
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
  const [availableJobLevels, setAvailableJobLevels] = useState<any[]>([]);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [activeDeptId, setActiveDeptId] = useState<string>("");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassId, setActiveClassId] = useState<string>("all");
  const [activeSubClassId, setActiveSubClassId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("wip");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [activeOfficerTab, setActiveOfficerTab] = useState<string>("all");
  const [allOfficers, setAllOfficers] = useState<any[]>([]);
  const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
  const [isOfficerDropdownOpen, setIsOfficerDropdownOpen] = useState(false);

  // ── Sort / view state ──────────────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details', 'time_tracking']));
  const [showTimeStatuses, setShowTimeStatuses] = useState(false);
  const [showNARows, setShowNARows] = useState(true);

  // ── Column state ───────────────────────────────────────────────────────────
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [expandedStageColumns, setExpandedStageColumns] = useState<Set<string>>(new Set());

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization & Fetching
  // ─────────────────────────────────────────────────────────────────────────

  const getStaffName = useCallback((userId: any) => {
    if (!userId) return '';
    const user = tmUsers.get(parseInt(userId.toString()));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null;
    const dept = departments.find(d => d.id === task.department?.id);
    if (!dept) return null;
    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id);
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id?.toString());
    const subCls = cls?.subClasses?.find(sc => sc.id.toString() === task.subclass_id?.toString());
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls };
  }, [departments]);

  const getCurrentStageStatusWrapper = useCallback((task: any) =>
    getCurrentStageStatus(task, stages, departments, allDocuments),
    [stages, departments, allDocuments]);

  const getEnhancedImmigrationStatusWrapper = useCallback((task: any) =>
    getEnhancedImmigrationStatus(task, stages, allDocuments, kycDocuments),
    [stages, allDocuments, kycDocuments]);

  const toggleStageColumns = useCallback((stageId: string) => {
    setExpandedStageColumns(prev => {
      const next = new Set(prev);
      next.has(stageId) ? next.delete(stageId) : next.add(stageId);
      return next;
    });
  }, []);

  useEffect(() => {
    const init = async () => {
      setReportLoading(true);
      try {
        const { data: reports, error } = await supabase
          .from('tm_memorized_reports')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setAvailableReports(reports || []);
        if (reports?.length > 0) setActiveReport(reports[0]);

        const [usersResponse, authOfficers] = await Promise.all([
          fetch('/api/auth/users/unified?payrollAccess=true').then(res => res.json()),
          fetchAuthOfficers()
        ]);

        const users = usersResponse.data || [];
        const usersMap = new Map();
        users?.forEach(u => usersMap.set(u.id, u));
        setTmUsers(usersMap);
        setAllOfficers(
          (authOfficers || []).map((officer: any) => ({
            ...officer,
            id: officer.id.toString(),
            name: getOfficerDisplayName(officer),
            email: officer.email || ""
          }))
        );
      } catch (err) {
        console.error("Failed to fetch reports:", err);
        toast({ title: "Error", description: "Could not load saved reports.", variant: "destructive" });
      } finally {
        setReportLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (activeReport && !activeReport.sessionIncludedFields) {
      setActiveReport((prev: any) => ({
        ...prev,
        sessionIncludedFields: prev.configuration.taskFields?.map((f: any) => f.id) || []
      }));
    }
  }, [activeReport?.id]);

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

      const uniqueJobLevels = new Map();
      safeTasks.forEach(task => {
        if (task.job_level) {
          const key = JSON.stringify(task.job_level);
          if (!uniqueJobLevels.has(key)) uniqueJobLevels.set(key, task.job_level);
        }
      });
      setAvailableJobLevels(Array.from(uniqueJobLevels.values()));

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

      if (!activeDeptId) {
        if (activeReport.department_id) {
          setActiveDeptId(activeReport.department_id.toString());
        } else if (depts.length > 0) {
          setActiveDeptId(depts[0].id.toString());
        }
      }
      setCurrentPage(1);
    } catch (error) {
      console.error("Error loading report data", error);
      toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeReport, activeDeptId]);

  useEffect(() => { refreshData(); }, [activeReport]);

  // ─────────────────────────────────────────────────────────────────────────
  // Filtering & Computed Maps
  // ─────────────────────────────────────────────────────────────────────────

  const activeDepartment = useMemo(() =>
    departments.find(d => d.id.toString() === activeDeptId),
    [departments, activeDeptId]);

  const activeSubDepartments = useMemo(() =>
    activeDepartment?.tm_subdepartments || [],
    [activeDepartment]);

  useEffect(() => {
    if (!activeDeptId) {
      setAvailableOfficers([]);
      setSelectedOfficers([]);
      setActiveOfficerTab('all');
      return;
    }

    const departmentUsers = userService.getDepartmentUsers(
      allOfficers.map(o => ({
        id: o.id,
        displayName: getOfficerDisplayName(o),
        email: o.email,
        role: 'officer',
        firstName: o.firstName,
        lastName: o.lastName,
        isActive: o.isActive
      })),
      activeDeptId,
      activeSubDeptId === 'all' ? undefined : activeSubDeptId
    );

    const allowedIds = new Set(departmentUsers.officers.map(o => o.id));

    const final = allOfficers.filter(o => allowedIds.has(o.id));
    setAvailableOfficers(final);
    setSelectedOfficers(prev => prev.filter(id => final.some(o => o.id === id)));
    setActiveOfficerTab(prev => (prev === 'all' || final.some(o => o.id === prev) ? prev : 'all'));
  }, [activeDeptId, activeSubDeptId, allOfficers, activeSubDepartments]);

  const effectiveOfficerIds = useMemo(() => {
    const ids = new Set(selectedOfficers);
    if (activeOfficerTab !== 'all') ids.add(activeOfficerTab);
    return Array.from(ids);
  }, [activeOfficerTab, selectedOfficers]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;
      if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
      if (activeSubClassId !== 'all' && task.subclass_id?.toString() !== activeSubClassId) return false;

      if (effectiveOfficerIds.length > 0) {
        const oid = task.officer_id?.toString();
        const aid = task.assigned_to?.toString();
        if (!(oid && effectiveOfficerIds.includes(oid)) && !(aid && effectiveOfficerIds.includes(aid))) return false;
      }

      const isWriteUp = task.status === 'write_up_completed';
      const isEndorsed = task.status === 'endorsed';
      const isCompleted = isWriteUp || isEndorsed || ['completed', 'archived'].includes(task.status);

      if (activeStatus === 'wip' && isCompleted) return false;
      if (activeStatus === 'write_up_completed' && !isWriteUp) return false;
      if (activeStatus === 'endorsed' && !isEndorsed) return false;
      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptId, activeClassId, activeSubClassId, activeStatus, effectiveOfficerIds]);

  const searchedTasks = useMemo(() => {
    if (!searchQuery) return filteredTasks;
    const q = searchQuery.toLowerCase();
    return filteredTasks.filter(t =>
      t.id.toString().includes(q) ||
      (t.applicant_name && t.applicant_name.toLowerCase().includes(q)) ||
      (t.company_name && t.company_name.toLowerCase().includes(q)) ||
      (companies.get(t.company_id)?.toLowerCase().includes(q))
    );
  }, [filteredTasks, searchQuery, companies]);

  const getDocumentForTaskStage = useCallback((task: any, stage: any) => {
    let linked = task.source_document_id?.[stage.id];
    if (!linked && task.stages?.[stage.id]?.documents) {
      linked = Object.values(task.stages[stage.id].documents).map((doc: any) => doc.document_id || doc.id);
    }
    if (!linked) return [];
    const ids = Array.isArray(linked) ? linked : [linked];
    return ids.map(ref => {
      const docId = typeof ref === 'string' ? ref : ref.id;
      if (!docId) return null;
      return allDocuments.find(d => d.id.toString() === docId.toString());
    }).filter(Boolean);
  }, [allDocuments]);

  const isDocumentApplicable = useCallback((doc: any, task: any): boolean => {
    if (!doc || !task) return false;
    if (doc.isSpecial !== true) return true;
    if (!Array.isArray(doc.targetEntities) || doc.targetEntities.length === 0) return false;
    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();
    return doc.targetEntities.some((e: any) => {
      const classMatch = !e.class_id || e.class_id.toString() === taskClassId;
      const subdeptMatch = !e.subdept_id || e.subdept_id.toString() === taskSubdeptId;
      return classMatch && subdeptMatch;
    });
  }, []);

  const getTaskInitiatedDate = useCallback((task: any) => {
    return parseDate(task?.date_initiated || task?.created_at || null);
  }, []);

  const getStageHandledDate = useCallback((task: any, stage: any) => {
    const stageData = task?.stages?.[stage?.id];
    if (!stageData) return null;

    const directDate = parseDate(
      stageData.completedAt ||
      stageData.skippedAt ||
      stageData.date_completed ||
      stageData.date ||
      stageData.lastUpdated ||
      null
    );

    if (directDate) return directDate;

    let linkedDocs: any[] = [];
    if (stage?.documents?.length > 0) {
      linkedDocs = stage.documents.flatMap((docConfig: any) => {
        if (!isDocumentApplicable(docConfig, task)) return [];
        return getDocumentForTaskStage(task, { ...stage, documents: [docConfig] });
      }).filter((d: any) => d && !d.indicator);
    }

    const primaryDoc = linkedDocs[0];
    const docFields = primaryDoc ? kycDocuments.get(primaryDoc.kyc_id || primaryDoc.document_id)?.fields : [];
    const completionDateStr = calculateStageDate(stage, stageData, primaryDoc, docFields, null, false);
    return parseDate(completionDateStr);
  }, [getDocumentForTaskStage, isDocumentApplicable, kycDocuments]);

  const getCurrentStageTracking = useCallback((task: any) => {
    const applicableStages = [...stages]
      .filter(stage => checkStageApplicableForTask(stage, task))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    let latest: { stage: any; handledAt: Date } | null = null;

    applicableStages.forEach(stage => {
      const handledAt = getStageHandledDate(task, stage);
      if (!handledAt) return;
      if (!latest || handledAt.getTime() > latest.handledAt.getTime()) {
        latest = { stage, handledAt };
      }
    });

    return latest;
  }, [stages, getStageHandledDate]);

  function checkStageApplicableForTask(stage: any, task: any): boolean {
    return isStageApplicableToTask(stage, task, departments);
  }

  const isStageApplicableToCurrentFilter = useCallback((stageId: string): boolean => {
    if (!activeDeptId || activeDeptId === 'all') return true;

    const dept = departments.find(d => d.id.toString() === activeDeptId);
    if (!dept) return true;

    const subdept = activeSubDeptId && activeSubDeptId !== 'all'
      ? dept.tm_subdepartments?.find((s: any) => s.id.toString() === activeSubDeptId)
      : null;

    if (!subdept) {
      return dept.tm_subdepartments?.some((s: any) => {
        const subdeptStage = s.stages?.find((st: any) => st.stage_id === stageId);
        if (subdeptStage && typeof subdeptStage.applicable === 'boolean') return subdeptStage.applicable;
        if (activeClassId && activeClassId !== 'all') {
          const cls = s.classes?.find((c: any) => c.id.toString() === activeClassId);
          if (cls) {
            const classStage = cls.stages?.find((st: any) => st.stage_id === stageId);
            if (classStage && typeof classStage.applicable === 'boolean') return classStage.applicable;
          }
        }
        return true;
      }) ?? true;
    }

    if (activeClassId && activeClassId !== 'all') {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === activeClassId);
      if (cls) {
        const classStage = cls.stages?.find((s: any) => s.stage_id === stageId);
        if (classStage && typeof classStage.applicable === 'boolean') return classStage.applicable;
        if (activeSubClassId && activeSubClassId !== 'all') {
          const subCls = cls.subClasses?.find((sc: any) => sc.id.toString() === activeSubClassId);
          if (subCls) {
            const subClassStage = subCls.stages?.find((s: any) => s.stage_id === stageId);
            if (subClassStage && typeof subClassStage.applicable === 'boolean') return subClassStage.applicable;
          }
        }
      }
    }

    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stageId);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') return subdeptStage.applicable;

    return true;
  }, [activeDeptId, activeSubDeptId, activeClassId, activeSubClassId, departments]);

  const getSortableValue = useCallback((task: any, col: any) => {
    if (!col) return '';
    if (col.type === 'imm_status_days') {
      const statusData = getEnhancedImmigrationStatusWrapper(task);
      const currentDoc = statusData?.current;
      if (!currentDoc) return -9999;
      let expiry = null;
      const kycConfig = kycDocuments.get(currentDoc.document_id || currentDoc.kyc_id);
      const extracted = currentDoc.extracted_details || {};
      if (kycConfig?.fields) {
        const effTo = kycConfig.fields.find((f: any) => f.isEffectiveTo === true);
        if (effTo) expiry = extracted[effTo.name];
      }
      if (!expiry) {
        const keys = Object.keys(extracted);
        const ek = keys.find(k => k.toLowerCase() === 'expiry_date' || k.toLowerCase() === 'valid_until');
        if (ek) expiry = extracted[ek];
      }
      const d = parseDate(expiry);
      return d ? d.getTime() : -9999;
    }
    if (col.type === 'task') {
      return getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
    }
    if (col.type === 'current_stage_age') {
      const tracking = getCurrentStageTracking(task);
      return getElapsedMinutes(tracking?.handledAt || null) ?? -1;
    }
    if (col.type === 'total_process_age') {
      return getElapsedMinutes(getTaskInitiatedDate(task)) ?? -1;
    }
    if (col.type === 'stage_date') {
      const d = task.stages?.[col.stageId]?.date;
      return d ? parseDate(d)?.getTime() || 0 : 0;
    }
    return '';
  }, [departments, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, kycDocuments, getCurrentStageTracking, getTaskInitiatedDate]);

  const handleSort = (columnId: string) => {
    setSortConfig(cur => {
      if (cur?.key === columnId) return { key: columnId, direction: cur.direction === 'asc' ? 'desc' : 'asc' };
      return { key: columnId, direction: 'asc' };
    });
  };

  const columns = useMemo(() => {
    if (!activeReport || !stages.length) return [];

    const getLabel = (id: any) => {
      const h = ENHANCED_TABLE_HEADERS_IMMIGRATION.find(h => h.id === id);
      if (h) return h.label;
      if (typeof id !== 'string') return String(id || '').toUpperCase();
      return id.replace(/_/g, ' ').toUpperCase();
    };

    const cols: any[] = [];
    const fieldsToDisplay = activeReport.sessionIncludedFields ||
      activeReport.configuration?.taskFields?.map((f: any) => f.id) || [];

    fieldsToDisplay.forEach((fieldId: string) => {
      if (!fieldId) return;
      cols.push({ id: `task_${fieldId}`, label: getLabel(fieldId), type: 'task', field: fieldId });
    });

    cols.push({
      id: 'current_stage_age',
      label: 'Days In Current Stage',
      type: 'current_stage_age'
    });

    cols.push({
      id: 'total_process_age',
      label: 'Total Process Time',
      type: 'total_process_age'
    });

    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});
    stages
      .filter(s => activeStageIds.includes(s.id))
      .filter(stage => isStageApplicableToCurrentFilter(stage.id))
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
              hasSubColumns: hasDocuments,
              filterApplicable: isStageApplicableToCurrentFilter(stage.id)
            });
          }
        }

        if (hasDocuments && expandedStageColumns.has(stage.id)) {
          if (isSpecialStage) {
            let wefAdded = false, toAdded = false;
            for (const [kycId] of Object.entries(config.documents)) {
              if (wefAdded && toAdded) break;
              const kycDoc = kycDocuments.get(kycId as string);
              if (!kycDoc) continue;

              if (!wefAdded) {
                const wefField = kycDoc.fields?.find((f: any) => {
                  const n = (f.name || f.fieldName || '').toLowerCase();
                  return n === 'with_effect_from' || f.isEffectiveFrom === true || n.includes('effect_from') || n.includes('effective_from');
                });
                if (wefField) {
                  const fieldId = wefField.id || wefField.name;
                  const colId = `stage_${stage.id}_${kycId}_${fieldId}`;
                  if (!cols.some(c => c.id === colId)) {
                    cols.push({ id: colId, label: `${stage.name} - WEF`, type: 'extracted_field', stageId: stage.id, kycId, fieldId, fieldName: wefField.name || wefField.fieldName, fieldType: wefField.type || wefField.fieldType || 'date', isAutoAdded: true });
                  }
                  wefAdded = true;
                }
              }
              if (!toAdded) {
                const toField = kycDoc.fields?.find((f: any) => {
                  const n = (f.name || f.fieldName || '').toLowerCase();
                  return n === 'expiry_date' || f.isEffectiveTo === true || n.includes('expiry') || n.includes('effective_to');
                });
                if (toField) {
                  const fieldId = toField.id || toField.name;
                  const colId = `stage_${stage.id}_${kycId}_${fieldId}`;
                  if (!cols.some(c => c.id === colId)) {
                    cols.push({ id: colId, label: `${stage.name} - TO`, type: 'extracted_field', stageId: stage.id, kycId, fieldId, fieldName: toField.name || toField.fieldName, fieldType: toField.type || toField.fieldType || 'date', isAutoAdded: true });
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
                    cols.push({ id: colId, label: `${kycDoc.display_name || kycDoc.name} - ${field.fieldName || field.name}`, type: 'extracted_field', stageId: stage.id, kycId, fieldId, fieldName: field.fieldName || field.name, fieldType: field.fieldType || field.type });
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
        const combined = new Set([...prev, ...columns.map(c => c.id)]);
        return Array.from(combined);
      });
    }
  }, [columns]);

  const filteredColumns = useMemo(() =>
    columns.filter(c => visibleColumnIds.includes(c.id)),
    [columns, visibleColumnIds]);

  const renderCellValue = useCallback((task: any, col: any) => {
    if (col.type === 'current_stage_age') {
      const tracking = getCurrentStageTracking(task);
      const elapsedMinutes = getElapsedMinutes(tracking?.handledAt || null);

      if (!tracking || elapsedMinutes == null) return <span className="text-sm text-slate-400">—</span>;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
              <Clock3 className="h-4 w-4" />
              <span>{formatDuration(elapsedMinutes)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="border-slate-200 shadow-xl text-sm bg-white text-slate-700">
            <div className="space-y-1">
              <div><span className="font-semibold text-slate-500">Stage:</span> {tracking.stage?.name || '-'}</div>
              <div><span className="font-semibold text-slate-500">Handled:</span> {formatDateTimeForDisplay(tracking.handledAt)}</div>
              <div><span className="font-semibold text-slate-500">Elapsed:</span> <span className="text-blue-600">{formatDuration(elapsedMinutes)}</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (col.type === 'total_process_age') {
      const initiatedAt = getTaskInitiatedDate(task);
      const elapsedMinutes = getElapsedMinutes(initiatedAt);

      if (!initiatedAt || elapsedMinutes == null) return <span className="text-sm text-slate-400">—</span>;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm font-medium text-violet-700">
              <Timer className="h-4 w-4" />
              <span>{formatDuration(elapsedMinutes)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="border-slate-200 shadow-xl text-sm bg-white text-slate-700">
            <div className="space-y-1">
              <div><span className="font-semibold text-slate-500">Initiated:</span> {formatDateTimeForDisplay(initiatedAt)}</div>
              <div><span className="font-semibold text-slate-500">Elapsed:</span> <span className="text-violet-600">{formatDuration(elapsedMinutes)}</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-sm text-slate-400">—</span>;

      if (!checkStageApplicableForTask(stage, task)) {
        return <span className="text-sm text-slate-400">N/A</span>;
      }

      const stageData = task.stages?.[col.stageId];
      const estimatedMinutes = stage.estimated_time;

      let effectiveStartTime: Date | null = task.date_initiated ? parseDate(task.date_initiated) : null;
      if (!effectiveStartTime && task.created_at) effectiveStartTime = parseDate(task.created_at);

      const sortedStagesList = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      const currentStageIndex = sortedStagesList.findIndex(s => s.id === col.stageId);

      if (currentStageIndex > 0) {
        const prevStage = sortedStagesList[currentStageIndex - 1];
        const prevStageData = task.stages?.[prevStage.id];
        if (prevStageData) {
          const prevCompletionStr = calculateStageDate(
            prevStage, prevStageData,
            getDocumentForTaskStage(task, prevStage)[0],
            kycDocuments.get(getDocumentForTaskStage(task, prevStage)[0]?.document_id)?.fields,
            null, false
          );
          if (prevCompletionStr) effectiveStartTime = parseDate(prevCompletionStr);
          else if (prevStageData.status === 'skipped' && prevStageData.skippedAt) {
            effectiveStartTime = parseDate(prevStageData.skippedAt);
          }
        }
      }

      if (stageData?.status === 'skipped') {
        const reason = stageData?.reason || 'No reason provided';
        const skippedAt = stageData?.skippedAt ? parseDate(stageData.skippedAt) : null;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-sm text-amber-600 font-medium cursor-help">
                <AlertCircle className="h-4 w-4" /> Skipped
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-white text-slate-700 border-slate-200 shadow-xl p-2">
              <div className="text-sm space-y-1">
                <p><span className="font-semibold text-slate-500">Reason:</span> {reason}</p>
                {skippedAt && <p><span className="font-semibold text-slate-500">Date:</span> {formatDateTimeForDisplay(skippedAt)}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      let linkedDocs: any[] = [];
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

      if (completionDate) {
        let isCompletedOverdue = false;
        let durationTakenText = 'N/A';

        if (effectiveStartTime && estimatedMinutes && estimatedMinutes > 0) {
          const ms = completionDate.getTime() - effectiveStartTime.getTime();
          const mins = Math.floor(ms / 60000);
          isCompletedOverdue = mins > estimatedMinutes;
          durationTakenText = formatDuration(mins);
        }

        const textColor = isCompletedOverdue ? "text-amber-600" : "text-emerald-600";
        const icon = isCompletedOverdue ? <Clock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />;
        const statusText = isCompletedOverdue ? "Completed (Overdue)" : "Completed On Time";

        if (!showTimeStatuses) {
          return (
            <div className={`flex items-center gap-1.5 font-medium text-sm ${textColor}`}>
              {icon}<span>{formatDateForDisplay(completionDate)}</span>
            </div>
          );
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 font-medium text-sm ${textColor} cursor-default`}>
                {icon}<span>{formatDateForDisplay(completionDate)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className={`bg-white text-slate-700 border-slate-200 shadow-xl p-2`}>
              <div className="space-y-2 p-1">
                <div className={`font-semibold text-sm ${textColor} border-b border-slate-100 pb-1.5`}>{statusText}</div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between gap-4"><span className="text-slate-500 font-semibold">Completed:</span><span className="text-slate-700">{formatDateTimeForDisplay(completionDate)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500 font-semibold">Duration:</span><span className="text-slate-700">{durationTakenText}</span></div>
                  {estimatedMinutes > 0 && <div className="flex justify-between gap-4"><span className="text-slate-500 font-semibold">Allowed:</span><span className="text-slate-700">{formatDuration(estimatedMinutes)}</span></div>}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      if (!effectiveStartTime || !showTimeStatuses) return <span className="text-sm text-slate-400">—</span>;

      const timeStatus = getTimeStatus(effectiveStartTime, estimatedMinutes);
      const isOverdue = timeStatus?.isOverdue || false;
      const textColor = isOverdue ? "text-red-600" : "text-blue-600";
      const icon = isOverdue ? <AlertTriangle className="h-4 w-4" /> : <Timer className="h-4 w-4" />;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 font-medium text-sm ${textColor} cursor-default`}>
              {icon}<span>{timeStatus?.formattedElapsed}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className={`bg-white text-slate-700 border-slate-200 shadow-xl p-2`}>
            <div className="space-y-2 p-1">
              <div className={`font-semibold text-sm ${textColor} border-b border-slate-100 pb-1.5`}>
                {isOverdue ? "In Progress (Overdue)" : "In Progress (On Track)"}
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between gap-4"><span className="text-slate-500 font-semibold">Started:</span><span className="text-slate-700">{formatDateTimeForDisplay(effectiveStartTime)}</span></div>
                {estimatedMinutes > 0 && (
                  <>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500 font-semibold">Remaining:</span>
                      <span className={isOverdue ? 'font-semibold text-red-600' : 'text-emerald-600'}>
                        {isOverdue ? `Overdue by ${timeStatus?.formattedOverdue}` : timeStatus?.formattedRemaining}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4"><span className="text-slate-500 font-semibold">Estimate:</span><span className="text-slate-700">{formatDuration(estimatedMinutes)}</span></div>
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
      if (!stage) return <span className="text-sm text-slate-400">—</span>;

      if (!checkStageApplicableForTask(stage, task)) {
        return <span className="text-sm text-slate-400">N/A</span>;
      }

      if (col.isAutoAdded) {
        let foundValue = null, foundDoc = null;
        for (const stageDocInfo of (stage.documents || [])) {
          if (!isDocumentApplicable(stageDocInfo, task)) continue;
          const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
          if (!linked || linked.indicator) continue;
          foundValue = (col.fieldType === 'date' || col.fieldType === 'Date')
            ? findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId])
            : linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
          if (foundValue) { foundDoc = linked; break; }
        }
        if (!foundDoc) return <span className="text-sm text-red-500">Missing</span>;
        const display = (col.fieldType === 'Date' || col.fieldType === 'date') ? formatDateForDisplay(foundValue) : foundValue;
        const isOld = foundDoc.created_at && task.created_at && new Date(foundDoc.created_at) < new Date(task.created_at);
        return <span className={`text-sm ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || <span className="text-slate-400">—</span>}</span>;
      }

      const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === col.kycId);
      if (!stageDocInfo) return <span className="text-sm text-slate-400">—</span>;
      if (!isDocumentApplicable(stageDocInfo, task)) return <span className="text-sm text-slate-400">N/A</span>;

      const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
      if (!linked) return <span className="text-sm text-red-500">Missing</span>;
      if (linked.indicator) return <span className="inline-flex items-center rounded-sm bg-red-50 text-red-600 border border-red-200 text-xs font-medium px-2 py-1">Indicator</span>;

      let val = (col.fieldType === 'date' || col.fieldType === 'Date')
        ? findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId])
        : linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];

      const isOld = linked.created_at && task.created_at && new Date(linked.created_at) < new Date(task.created_at);
      const display = (col.fieldType === 'Date' || col.fieldType === 'date') ? formatDateForDisplay(val) : val;
      return <span className={`text-sm ${isOld ? 'text-amber-600 italic' : 'text-slate-700'}`}>{display || <span className="text-slate-400">—</span>}</span>;
    }

    if (col.type === 'task') {
      return getCellContent(
        departments, task, col.field, enhancedTasksData, taskDependants,
        new Set(), companies, getTaskHierarchy, getStaffName,
        getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
        (t: any) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { }),
        (t: any) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper),
        () => { }, () => { }, () => { }
      );
    }

    return <span className="text-sm text-slate-400">—</span>;
  }, [
    stages, departments, kycDocuments, allDocuments, companies,
    enhancedTasksData, taskDependants, showTimeStatuses,
    checkStageApplicableForTask, isDocumentApplicable, getDocumentForTaskStage,
    getStaffName, getTaskHierarchy, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
    getCurrentStageTracking, getTaskInitiatedDate
  ]);

  const getExportCellValue = useCallback((task: any, col: any): string => {
    if (col.type === 'task') {
      const val = getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
      return val == null ? '' : String(val);
    }

    if (col.type === 'current_stage_age') {
      const tracking = getCurrentStageTracking(task);
      const elapsedMinutes = getElapsedMinutes(tracking?.handledAt || null);
      if (!tracking || elapsedMinutes == null) return '-';
      return `${formatDuration(elapsedMinutes)} (${tracking.stage?.name || 'Stage'} since ${formatDateTimeForDisplay(tracking.handledAt)})`;
    }

    if (col.type === 'total_process_age') {
      const initiatedAt = getTaskInitiatedDate(task);
      const elapsedMinutes = getElapsedMinutes(initiatedAt);
      if (!initiatedAt || elapsedMinutes == null) return '-';
      return `${formatDuration(elapsedMinutes)} (since ${formatDateTimeForDisplay(initiatedAt)})`;
    }

    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return '-';
      if (!checkStageApplicableForTask(stage, task)) return 'N/A';

      const stageData = task.stages?.[col.stageId];
      if (stageData?.status === 'skipped') return `Skipped: ${stageData.reason || ''}`;

      let linkedDocs: any[] = [];
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
      return completionDate ? formatDateForDisplay(completionDate) : '-';
    }

    if (col.type === 'extracted_field') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return '-';
      if (!checkStageApplicableForTask(stage, task)) return 'N/A';

      let foundValue = null, foundDoc = null;
      const docsToSearch = col.isAutoAdded
        ? (stage.documents || [])
        : [stage?.documents?.find((d: any) => d.kycId === col.kycId)].filter(Boolean);

      for (const stageDocInfo of docsToSearch) {
        if (!isDocumentApplicable(stageDocInfo, task)) continue;
        const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
        if (!linked || linked.indicator) continue;
        foundValue = (col.fieldType === 'date' || col.fieldType === 'Date')
          ? findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId])
          : linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
        if (foundValue) { foundDoc = linked; break; }
      }
      if (!foundDoc) return col.isAutoAdded ? 'Missing' : '-';
      if ((foundDoc as any).indicator) return 'Indicator';
      return (col.fieldType === 'Date' || col.fieldType === 'date') ? formatDateForDisplay(foundValue) : String(foundValue || '-');
    }
    return '';
  }, [departments, stages, kycDocuments, companies, enhancedTasksData, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, checkStageApplicableForTask, isDocumentApplicable, getDocumentForTaskStage, getCurrentStageTracking, getTaskInitiatedDate]);

  const handleExport = async (type: 'excel' | 'pdf') => {
    if (type !== 'excel') {
      toast({ title: "Coming Soon", description: "PDF export is being upgraded." });
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    ws.columns = [
      { header: 'Task ID', key: 'id', width: 10 },
      ...filteredColumns.map(col => ({ header: col.label, key: col.id, width: 30 }))
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    filteredTasks.forEach((task, index) => {
      const rowData = [task.id, ...filteredColumns.map(col => getExportCellValue(task, col))];
      const row = ws.addRow(rowData);
      const isOdd = index % 2 !== 0;
      const bg = isOdd ? 'FFEFF6FF' : 'FFFFFFFF';
      row.eachCell((cell, colNumber) => {
        const isNA = cell.value === 'N/A';
        const isUnallocated = cell.value === 'Unallocated';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { color: { argb: (isNA || isUnallocated) ? 'FFFF0000' : 'FF000000' }, bold: isUnallocated };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
        cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Report_${activeReport.name}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    link.click();
  };

  const sortedTasks = useMemo(() => {
    if (!sortConfig || !filteredColumns.length) return searchedTasks;
    const sorted = [...searchedTasks];
    sorted.sort((a, b) => {
      const colDef = filteredColumns.find(c => c.id === sortConfig.key);
      if (!colDef) return 0;
      const av = getSortableValue(a, colDef);
      const bv = getSortableValue(b, colDef);
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [searchedTasks, sortConfig, filteredColumns, getSortableValue]);

  const totalItems = sortedTasks.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const stageOnlyColumns = useMemo(() => filteredColumns.filter(c => c.type !== 'task'), [filteredColumns]);

  const filteredByNARows = useMemo(() => {
    if (showNARows || stageOnlyColumns.length === 0) return sortedTasks;
    return sortedTasks.filter(task =>
      stageOnlyColumns.some(col => {
        const stage = stages.find((s: any) => s.id === col.stageId);
        return stage ? checkStageApplicableForTask(stage, task) : true;
      })
    );
  }, [sortedTasks, showNARows, stageOnlyColumns, stages, checkStageApplicableForTask]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredByNARows.slice(start, start + itemsPerPage);
  }, [filteredByNARows, currentPage, itemsPerPage]);

  const handleNextPage = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const handlePreviousPage = () => setCurrentPage(p => Math.max(p - 1, 1));
  const handleItemsPerPageChange = (val: string) => { setItemsPerPage(Number(val)); setCurrentPage(1); };

  const columnGroups = useMemo(() => {
    if (!filteredColumns.length) return [];
    const groups: any[] = [];
    const taskCols = filteredColumns.filter(c => c.type === 'task');
    if (taskCols.length) groups.push({ id: 'task_info', label: 'Task Details', span: taskCols.length, applicable: true });
    const trackingCols = filteredColumns.filter(c => c.type === 'current_stage_age' || c.type === 'total_process_age');
    if (trackingCols.length) groups.push({ id: 'time_tracking', label: 'Time Tracking', span: trackingCols.length, applicable: true });

    const stageMap = new Map<string, { id: string; label: string; count: number; applicable: boolean }>();
    filteredColumns.filter(c => c.type !== 'task' && c.type !== 'current_stage_age' && c.type !== 'total_process_age').forEach(col => {
      if (!stageMap.has(col.stageId)) {
        stageMap.set(col.stageId, {
          id: col.stageId,
          label: stages.find(s => s.id === col.stageId)?.name || 'Stage',
          count: 0,
          applicable: isStageApplicableToCurrentFilter(col.stageId)
        });
      }
      stageMap.get(col.stageId)!.count++;
    });
    stageMap.forEach(g => groups.push({ id: g.id, label: g.label, span: g.count, applicable: g.applicable }));
    return groups;
  }, [filteredColumns, stages, isStageApplicableToCurrentFilter]);

  const toggleSection = (id: string) => setExpandedSections(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const transposedRows = useMemo(() => {
    if (!activeReport) return [];
    const rows: any[] = [];
    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase });
    if (expandedSections.has('task_details')) {
      filteredColumns.filter(c => c.type === 'task').forEach(c => rows.push({ ...c, isSubRow: true }));
    }
    rows.push({ type: 'section_header', id: 'time_tracking', label: 'Time Tracking', icon: Clock3 });
    if (expandedSections.has('time_tracking')) {
      filteredColumns
        .filter(c => c.type === 'current_stage_age' || c.type === 'total_process_age')
        .forEach(c => rows.push({ ...c, isSubRow: true }));
    }
    const stageGroups = new Set(
      filteredColumns
        .filter(c => c.type !== 'task' && c.type !== 'current_stage_age' && c.type !== 'total_process_age')
        .map(c => c.stageId)
    );
    stageGroups.forEach(stageId => {
      const stage = stages.find(s => s.id === stageId);
      if (!stage) return;
      const filterApplicable = isStageApplicableToCurrentFilter(stageId);
      rows.push({ type: 'section_header', id: stage.id, label: stage.name, icon: Briefcase, filterApplicable });
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
  }, [activeReport, filteredColumns, expandedSections, stages, isStageApplicableToCurrentFilter]);

  if (reportLoading) {
    return <div className="h-screen flex flex-col items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" /><p className="text-sm text-slate-500">Loading Reports...</p></div>;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50/50">
      {/* ── TOP HEADER ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm sticky top-0 z-50 gap-4">
        <div className="flex flex-col">
          <h3 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight flex items-center gap-2.5">
            <FileText className="h-6 w-6 text-blue-600" strokeWidth={2.5} />
            {activeReport ? activeReport.name : "Report Viewer"}
          </h3>
          <p className="text-base text-slate-500 mt-1">
            {activeReport ? (activeReport.description || "Generated Data Report View") : "Select a report template to begin analysis"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setIsReportDialogOpen(true)} className="h-8 text-sm font-semibold text-slate-700 bg-white border-slate-200 shadow-sm hover:bg-slate-50">
            <Filter className="mr-1.5 h-4 w-4 text-blue-500" />
            {activeReport ? "Change Report" : "Select Report"}
          </Button>

          <MemorizedReportDialog
            open={isReportDialogOpen}
            onOpenChange={setIsReportDialogOpen}
            department={departments.find(d => d.id.toString() === activeDeptId) || null}
            stages={stages}
            kycDocuments={kycDocuments}
            onApplyReport={(report) => { setActiveReport(report); setExpandedStageColumns(new Set()); setIsReportDialogOpen(false); }}
            tableHeaders={ENHANCED_TABLE_HEADERS_IMMIGRATION}
            availableJobLevels={availableJobLevels}
            departments={departments}
            subdepartments={departments.flatMap(d => d.tm_subdepartments || [])}
            classes={departments.flatMap(d => (d.tm_subdepartments || []).flatMap((s: any) => s.classes || []))}
          />

          <div className="h-5 w-[1px] bg-slate-300 mx-1" />

          {activeReport && (
            <Tabs value={view} onValueChange={(v: any) => setView(v)} className="hidden md:block">
              <TabsList className="h-8 bg-slate-100/80 p-0.5 border border-slate-200">
                <TabsTrigger value="standard" className="text-[11px] h-6 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm"><Rows className="h-3 w-3 mr-1.5 text-blue-600" /> Rows</TabsTrigger>
                <TabsTrigger value="transposed" className="text-[11px] h-6 px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm"><LayoutGrid className="h-3 w-3 mr-1.5 text-blue-600" /> Cols</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Button variant="outline" size="sm" onClick={() => refreshData()} disabled={loading} className="h-8 text-xs bg-white border-slate-200 shadow-sm px-2.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold px-3">
                <FileDown className="h-3.5 w-3.5 mr-1.5" /> Export Data
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 text-xs font-medium">
              <DropdownMenuItem onClick={() => handleExport('excel')} className="py-2 cursor-pointer">Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast({ title: "Coming Soon", description: "PDF export is being upgraded." })} className="py-2 cursor-pointer">PDF (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
        {/* Unified Filter Bar Block */}
        {activeReport && departments.length > 0 && (
          <div className="flex flex-col gap-2">

            {/* Row 1: Dept & Subdept Routing */}
            <Tabs value={activeDeptId} onValueChange={val => { setActiveDeptId(val); setActiveSubDeptId('all'); setCurrentPage(1); }}>
              <TabsList className="h-8 bg-transparent p-0 gap-1">
                {departments.map(dept => (
                  <TabsTrigger key={dept.id} value={dept.id.toString()} className="text-[11px] font-bold uppercase tracking-wider text-slate-500 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded px-3 py-1.5">
                    {dept.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs value={activeSubDeptId} onValueChange={v => { setActiveSubDeptId(v); setCurrentPage(1); }}>
              <TabsList className="h-8 bg-transparent p-0 gap-1">
                <TabsTrigger value="all" className="text-[11px] font-bold uppercase tracking-wider text-slate-500 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded px-3 py-1.5">
                  All Sub-Depts
                </TabsTrigger>
                {activeSubDepartments.map(sub => (
                  <TabsTrigger key={sub.id} value={sub.id.toString()} className="text-[11px] font-bold uppercase tracking-wider text-slate-500 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded px-3 py-1.5">
                    {sub.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {/* Row 2: Secondary Filters & Settings */}
            <div className="flex items-center justify-between gap-3 bg-slate-50 p-1.5 rounded-lg border border-slate-200/60 shadow-sm">
              <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-thin">
                <div className="relative w-full max-w-[250px] shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white pl-8 h-8 text-xs font-medium border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-500" />
                </div>

                <div className="h-4 w-[1px] bg-slate-300 mx-1 shrink-0" />

                <Select value={activeClassId} onValueChange={v => { setActiveClassId(v); setActiveSubClassId('all'); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[140px] h-8 text-[11px] font-bold uppercase tracking-wide bg-white border-slate-200 text-slate-600 shrink-0">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="all" className="text-xs font-medium">All Classes</SelectItem>
                    {activeSubDepartments.find(s => s.id.toString() === (activeSubDeptId === 'all' ? activeSubDepartments[0]?.id.toString() : activeSubDeptId))?.classes?.map((cls: any) => (
                      <SelectItem key={cls.id} value={cls.id.toString()} className="text-xs font-medium">{cls.name}</SelectItem>
                    )) || []}
                  </SelectContent>
                </Select>

                {activeClassId && activeClassId !== 'all' && (
                  <Select value={activeSubClassId} onValueChange={v => { setActiveSubClassId(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px] h-8 text-[11px] font-bold uppercase tracking-wide bg-white border-slate-200 text-slate-600 shrink-0">
                      <SelectValue placeholder="All Subclasses" />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="all" className="text-xs font-medium">All Subclasses</SelectItem>
                      {activeSubDepartments.find(s => s.id.toString() === (activeSubDeptId === 'all' ? activeSubDepartments[0]?.id.toString() : activeSubDeptId))?.classes?.find((c: any) => c.id.toString() === activeClassId)?.subClasses?.map((subCls: any) => (
                        <SelectItem key={subCls.id} value={subCls.id.toString()} className="text-xs font-medium">{subCls.name}</SelectItem>
                      )) || []}
                    </SelectContent>
                  </Select>
                )}

                <div className="h-4 w-[1px] bg-slate-300 mx-1 shrink-0" />

                {/* Status Toggles */}
                <Tabs value={activeStatus} onValueChange={v => { setActiveStatus(v); setCurrentPage(1); }} className="shrink-0">
                  <TabsList className="h-8 bg-white border border-slate-200 p-0.5">
                    <TabsTrigger value="all" className="text-[11px] font-bold uppercase tracking-widest px-2.5 data-[state=active]:bg-slate-700 data-[state=active]:text-white">All</TabsTrigger>
                    <TabsTrigger value="wip" className="text-[11px] font-bold uppercase tracking-widest px-2.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">WIP</TabsTrigger>
                    <TabsTrigger value="write_up_completed" className="text-[11px] font-bold uppercase tracking-widest px-2.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Write Up</TabsTrigger>
                    <TabsTrigger value="endorsed" className="text-[11px] font-bold uppercase tracking-widest px-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">Endorsed</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="h-4 w-[1px] bg-slate-300 mx-1 shrink-0" />

                <DropdownMenu open={isOfficerDropdownOpen} onOpenChange={setIsOfficerDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!activeDeptId} className={cn("h-8 text-[11px] font-bold uppercase tracking-wide shrink-0", selectedOfficers.length > 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-600 border-slate-200")}>
                      <User className="mr-1.5 h-3.5 w-3.5" />
                      {selectedOfficers.length > 0 ? `${selectedOfficers.length} Selected` : "Officers"}
                      <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64 p-2 z-[100] border-slate-200 shadow-xl max-h-80 overflow-y-auto">
                    {availableOfficers.length === 0 ? (
                      <div className="p-3 text-[11px] font-medium text-slate-500 text-center italic">No officers assigned to view</div>
                    ) : (
                      <>
                        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Filter by Officer</div>
                        <div className="space-y-1">
                          {availableOfficers.map(o => (
                            <div key={o.id} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-50 rounded-md transition-colors cursor-pointer" onClick={() => { setCurrentPage(1); setSelectedOfficers(prev => prev.includes(o.id) ? prev.filter(id => id !== o.id) : [...prev, o.id]); }}>
                              <Checkbox checked={selectedOfficers.includes(o.id)} className="h-4 w-4 border-slate-300 data-[state=checked]:bg-blue-600 pointer-events-none" />
                              <label className="text-[11px] font-semibold text-slate-700 cursor-pointer select-none">{o.name}</label>
                            </div>
                          ))}
                        </div>
                        {selectedOfficers.length > 0 && (
                          <div className="border-t border-slate-100 mt-2 pt-2">
                            <Button variant="ghost" size="sm" className="w-full h-7 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 bg-slate-100" onClick={() => { setSelectedOfficers([]); setCurrentPage(1); }}>Clear Selection</Button>
                          </div>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* View Toggles */}
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  <Button variant="outline" size="sm" onClick={() => setShowTimeStatuses(p => !p)} className={cn("h-8 text-[11px] font-bold uppercase tracking-wide px-2.5 transition-colors", showTimeStatuses ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100")}>
                    <Clock3 className="mr-1.5 h-3.5 w-3.5" /> {showTimeStatuses ? 'Hide Time' : 'Show Time'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowNARows(p => !p)} className={cn("h-8 text-[11px] font-bold uppercase tracking-wide px-2.5 transition-colors", !showNARows ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100")}>
                    {showNARows ? <EyeOff className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> : <Eye className="mr-1.5 h-3.5 w-3.5 text-amber-600" />}
                    {showNARows ? 'Hide N/A Rows' : 'Show N/A Rows'}
                  </Button>
                </div>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 shrink-0">
                <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                  <SelectTrigger className="w-[70px] h-8 text-[11px] font-bold bg-white border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    {[100, 200, 500].map(n => <SelectItem key={n} value={n.toString()} className="text-[11px] font-semibold">{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 rounded-sm hover:bg-slate-100" disabled={currentPage === 1} onClick={handlePreviousPage}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-[11px] font-bold text-slate-600 min-w-[50px] text-center uppercase tracking-widest">{currentPage} / {totalPages || 1}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 rounded-sm hover:bg-slate-100" disabled={currentPage >= totalPages} onClick={handleNextPage}><ChevronRight className="h-4 w-4" /></Button>
                </div>
                {view === 'transposed' && (
                  <div className="flex gap-1 ml-1 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 rounded-sm hover:bg-slate-100" onClick={() => setExpandedSections(new Set(transposedRows.map(r => r.id)))} title="Expand All">
                      <ChevronsDown className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 rounded-sm hover:bg-slate-100" onClick={() => setExpandedSections(new Set())} title="Collapse All">
                      <ChevronsRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TABLE ── */}
        <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto relative scrollbar-thin">
          {!activeReport ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50/50">
              <FileText className="h-16 w-16 mb-4 opacity-20 text-blue-600" />
              <p className="text-lg font-bold text-slate-600 tracking-tight">No Report Selected</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-2">Open the report menu to generate a view</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full bg-slate-50/50">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-3" />
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Processing Report Data...</p>
            </div>
          ) : view === 'standard' ? (
            // ── STANDARD VIEW ───────────────────────────────────────────────
            <Table className="border-separate border-spacing-0 w-full min-w-max">
              <TableHeader className="sticky top-0 z-30 shadow-md">
                {/* Group header */}
                <TableRow className="bg-blue-700 hover:bg-blue-700">
                  <TableHead className={`${INDEX_WIDTH_CLASS} border-b border-white/20 border-r bg-blue-800 text-white sticky left-0 z-40 text-center font-bold text-[11px] uppercase tracking-widest shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>IDX</TableHead>
                  {columnGroups.map((group, i) => (
                    <TableHead key={i} colSpan={group.span}
                      className={`text-center font-bold text-white border-b border-white/20 border-r last:border-r-0 py-2.5 text-[11px] uppercase tracking-widest ${!group.applicable ? 'bg-blue-800/80' : 'bg-blue-700'}`}>
                      <div className="flex items-center justify-center gap-2">
                        {group.label}
                        {!group.applicable && <span className="text-[11px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold shadow-sm">FILTER N/A</span>}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
                {/* Column header */}
                <TableRow className="bg-blue-600 hover:bg-blue-600">
                  <TableHead className={`${INDEX_WIDTH_CLASS} border-b border-slate-200 border-r bg-blue-700 text-white sticky left-0 z-40 text-center font-bold text-[11px] uppercase tracking-widest shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>#</TableHead>
                  {filteredColumns.map(col => {
                    const isColFilterNA = col.stageId ? !isStageApplicableToCurrentFilter(col.stageId) : false;
                    return (
                      <TableHead key={col.id} onClick={() => handleSort(col.id)}
                        className={`${COLUMN_WIDTH_CLASS} whitespace-nowrap px-3 py-2.5 font-bold text-white border-b border-slate-200 border-r text-[11px] uppercase tracking-widest cursor-pointer hover:bg-blue-500 transition-colors group ${isColFilterNA ? 'bg-blue-700/80' : 'bg-blue-600'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className="truncate">{col.label}</span>
                            {isColFilterNA && <span className="text-[11px] bg-amber-500 text-white px-1 py-0.5 rounded shrink-0 font-bold shadow-sm">N/A</span>}
                            {col.hasSubColumns && (
                              <button onClick={e => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                                className="p-0.5 hover:bg-white/20 rounded text-white shrink-0 transition-colors">
                                {expandedStageColumns.has(col.stageId) ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                          <ArrowUpDown className={`h-3 w-3 shrink-0 transition-colors ${sortConfig?.key === col.id ? 'text-white opacity-100' : 'text-white/40 opacity-0 group-hover:opacity-100'}`} />
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 bg-white">
                {paginatedTasks.length > 0 ? paginatedTasks.map((task, idx) => (
                  <TableRow key={task.id} className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/50 transition-colors group">
                    <TableCell className={`${INDEX_WIDTH_CLASS} sticky left-0 z-20 odd:bg-white even:bg-slate-50/50 group-hover:bg-blue-50/80 border-r border-slate-200 font-bold text-[11px] text-center text-slate-500 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)]`}>
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </TableCell>
                    {filteredColumns.map(col => (
                      <TableCell key={col.id} className={`${COLUMN_WIDTH_CLASS} border-r border-slate-100 p-2.5 text-[11px] font-medium text-slate-700 align-middle`}>
                        <div className="truncate w-full">{safeRender(renderCellValue(task, col))}</div>
                      </TableCell>
                    ))}
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={filteredColumns.length + 1} className="h-48 text-center bg-slate-50/50">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Briefcase className="h-10 w-10 mb-3 opacity-20 text-blue-500" />
                        <p className="text-[13px] font-bold text-slate-600 tracking-tight">No matching tasks found</p>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mt-1">Adjust your search or active filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            // ── TRANSPOSED VIEW ─────────────────────────────────────────────
            <Table className="border-separate border-spacing-0 w-full min-w-max">
              <TableHeader className="sticky top-0 z-30 shadow-md">
                <TableRow className="bg-blue-700 hover:bg-blue-700">
                  <TableHead className="sticky left-0 z-40 w-[280px] min-w-[280px] bg-blue-800 text-white border-r border-blue-600 font-bold text-[11px] uppercase tracking-widest p-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Fields / Tasks →
                  </TableHead>
                  {paginatedTasks.map(task => (
                    <TableHead key={task.id} className={`${COLUMN_WIDTH_CLASS} text-center bg-blue-700 text-white border-r border-blue-600 font-bold text-[11px] py-2.5 px-2`}>
                      <div className="flex flex-col gap-1 w-full items-center justify-center">
                        <span className="font-bold opacity-60 text-[11px] uppercase tracking-widest">IDX #{(currentPage - 1) * itemsPerPage + paginatedTasks.indexOf(task) + 1}</span>
                        <span className="truncate w-full font-bold" title={task.applicant_name}>{task.applicant_name}</span>
                        <Badge variant="outline" className="bg-blue-600 text-blue-100 border-blue-500 text-[11px] px-1.5 py-0">ID: {task.id}</Badge>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 bg-white">
                {paginatedTasks.length > 0 ? transposedRows.map((row, rIdx) => {
                  if (row.type === 'section_header') {
                    const Icon = row.icon;
                    const isFilterNA = row.filterApplicable === false;
                    return (
                      <TableRow key={row.id} className={`border-y-2 border-slate-300 hover:bg-slate-200 cursor-pointer transition-colors ${isFilterNA ? 'bg-amber-50/80' : 'bg-slate-100'}`}
                        onClick={() => toggleSection(row.id)}>
                        <TableCell className={`sticky left-0 z-20 border-r border-slate-300 p-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${isFilterNA ? 'bg-amber-50/80' : 'bg-slate-100'}`} colSpan={paginatedTasks.length + 1}>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <Icon className={cn("h-4 w-4", isFilterNA ? "text-amber-500" : "text-blue-600")} />
                              <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">{row.label}</span>
                              {isFilterNA && <span className="text-[11px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold shadow-sm">FILTER N/A</span>}
                            </div>
                            <div className="text-slate-400">
                              {expandedSections.has(row.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={rIdx} className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/50 group border-b border-slate-100 transition-colors">
                      <TableCell className="sticky left-0 z-20 odd:bg-white even:bg-slate-50/50 group-hover:bg-blue-50/80 border-r border-slate-200 py-2.5 px-3 text-[11px] font-bold text-slate-600 uppercase tracking-widest shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)]">
                        <div style={{ paddingLeft: row.isSubRow ? '24px' : '0' }} className="flex items-center truncate" title={row.label}>
                          {safeRender(row.label)}
                        </div>
                      </TableCell>
                      {paginatedTasks.map(task => (
                        <TableCell key={task.id} className={`${COLUMN_WIDTH_CLASS} text-center border-r border-slate-100 p-2.5 align-middle`}>
                          <div className="truncate w-full mx-auto">
                            {safeRender(renderCellValue(task, row))}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={2} className="h-32 text-center text-slate-400 bg-slate-50/50">
                      <div className="text-[11px] font-bold uppercase tracking-widest">No data available</div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}