// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown, ChevronDown, ChevronsRight, ChevronsDown, FileText, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Clock, ArrowUpDown, Search, Timer, AlertCircle, CheckCircle2, Clock3, User, EyeOff, Eye, Filter, PanelLeftClose, PanelLeftOpen, RotateCcw, X, TableProperties, Download, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { StandardReportView } from "./components/StandardReportView";
import { TransposedReportView } from "./components/TransposedReportView";

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
  const [areTabsVisible, setAreTabsVisible] = useState(true);
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [availableReports, setAvailableReports] = useState<any[]>([]);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());
  const [tmUsers, setTmUsers] = useState<Map<string, any>>(new Map());
  const [unifiedOfficers, setUnifiedOfficers] = useState<any[]>([]);
  const [unifiedManagers, setUnifiedManagers] = useState<any[]>([]);
  const [unifiedAssistants, setUnifiedAssistants] = useState<any[]>([]);
  const [availableJobLevels, setAvailableJobLevels] = useState<any[]>([]);
  const [activeDeptId, setActiveDeptId] = useState<string>("");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassId, setActiveClassId] = useState<string>("all");
  const [activeSubClassId, setActiveSubClassId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("wip");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [activeOfficerTab, setActiveOfficerTab] = useState<string>("all");
  const [officerFilterMode, setOfficerFilterMode] = useState<'current' | 'history'>('current');
  const [allOfficers, setAllOfficers] = useState<any[]>([]);
  const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
  const [isOfficerDropdownOpen, setIsOfficerDropdownOpen] = useState(false);
  const [isFiltersDropdownOpen, setIsFiltersDropdownOpen] = useState(false);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [allManagers, setAllManagers] = useState<any[]>([]);
  const [availableManagers, setAvailableManagers] = useState<any[]>([]);
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const [selectedAssistants, setSelectedAssistants] = useState<string[]>([]);
  const [allAssistants, setAllAssistants] = useState<any[]>([]);
  const [availableAssistants, setAvailableAssistants] = useState<any[]>([]);
  const [isAssistantDropdownOpen, setIsAssistantDropdownOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details', 'time_tracking']));
  const [showTimeStatuses, setShowTimeStatuses] = useState(false);
  const [showNARows, setShowNARows] = useState(true);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [expandedStageColumns, setExpandedStageColumns] = useState<Set<string>>(new Set());
  const getStaffName = useCallback((userId: any) => {
    if (!userId) return '';
    const userIdStr = String(userId);
    const unifiedOfficer = unifiedOfficers.find(o => o.id === userIdStr);
    if (unifiedOfficer) return unifiedOfficer.full_name || unifiedOfficer.name || unifiedOfficer.displayName || `Officer ${userId}`;

    const unifiedManager = unifiedManagers.find(m => m.id === userIdStr);
    if (unifiedManager) return unifiedManager.full_name || unifiedManager.name || unifiedManager.displayName || `Manager ${userId}`;

    const unifiedAssistant = unifiedAssistants.find(a => a.id === userIdStr);
    if (unifiedAssistant) return unifiedAssistant.full_name || unifiedAssistant.name || unifiedAssistant.displayName || `Assistant ${userId}`;

    const user = tmUsers.get(userIdStr);
    if (user?.name) return user.name;
    if (userIdStr.length > 20) {
      return `Unknown (${userIdStr.substring(0, 8)}...)`;
    }

    return userIdStr;
  }, [tmUsers, unifiedOfficers, unifiedManagers, unifiedAssistants]);

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

        // Load departments first to enrich user data with role assignments
        const depts = await fetchDepartments();
        setDepartments(depts);

        // Load unified user data using userService with departments
        const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, depts);
        setUnifiedOfficers(unifiedUserData.officers || []);
        setUnifiedManagers(unifiedUserData.managers || []);
        setUnifiedAssistants(unifiedUserData.assistants || []);

        // Also populate tmUsers map for backward compatibility
        const usersMap = new Map();
        unifiedUserData.allUsers?.forEach((u: any) => usersMap.set(u.id, u));
        setTmUsers(usersMap);

        // Set allOfficers for backward compatibility with existing filtering logic
        setAllOfficers(
          (unifiedUserData.officers || []).map((officer: any) => ({
            ...officer,
            id: officer.id,
            name: getOfficerDisplayName(officer),
            email: officer.email || ""
          }))
        );

        // Set allManagers
        setAllManagers(
          (unifiedUserData.managers || []).map((manager: any) => ({
            ...manager,
            id: manager.id,
            name: manager.displayName || manager.name || `Manager ${manager.id}`,
            email: manager.email || ""
          }))
        );

        // Set allAssistants
        setAllAssistants(
          (unifiedUserData.assistants || []).map((assistant: any) => ({
            ...assistant,
            id: assistant.id,
            name: assistant.displayName || assistant.name || `Assistant ${assistant.id}`,
            email: assistant.email || ""
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
      safeTasks.forEach((task: any) => {
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
    } catch (error) {
      console.error("Error loading report data", error);
      toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeReport, activeDeptId]);

  useEffect(() => { refreshData(); }, [activeReport]);

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

    const allUsers = [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants];
    const departmentUsers = userService.getDepartmentUsers(
      allUsers,
      activeDeptId,
      activeSubDeptId === 'all' ? undefined : activeSubDeptId
    );

    const allowedIds = new Set(departmentUsers.officers.map(o => o.id));

    const final = unifiedOfficers.filter(o => allowedIds.has(o.id));
    setAvailableOfficers(final);
    setSelectedOfficers(prev => prev.filter(id => final.some(o => o.id === id)));
    setActiveOfficerTab(prev => (prev === 'all' || final.some(o => o.id === prev) ? prev : 'all'));
  }, [activeDeptId, activeSubDeptId, unifiedOfficers, activeSubDepartments]);

  useEffect(() => {
    if (!activeDeptId) {
      setAvailableManagers([]);
      setSelectedManagers([]);
      return;
    }

    const departmentUsers = userService.getDepartmentUsers(
      [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants],
      activeDeptId,
      activeSubDeptId === 'all' ? undefined : activeSubDeptId
    );

    const allowedIds = new Set(departmentUsers.managers.map(m => m.id));

    const final = unifiedManagers.filter(m => allowedIds.has(m.id));
    setAvailableManagers(final);
    setSelectedManagers(prev => prev.filter(id => final.some(m => m.id === id)));
  }, [activeDeptId, activeSubDeptId, unifiedManagers, activeSubDepartments]);

  useEffect(() => {
    if (!activeDeptId) {
      setAvailableAssistants([]);
      setSelectedAssistants([]);
      return;
    }

    const departmentUsers = userService.getDepartmentUsers(
      [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants],
      activeDeptId,
      activeSubDeptId === 'all' ? undefined : activeSubDeptId
    );

    const allowedIds = new Set(departmentUsers.assistants.map(a => a.id));

    const final = unifiedAssistants.filter(a => allowedIds.has(a.id));
    setAvailableAssistants(final);
    setSelectedAssistants(prev => prev.filter(id => final.some(a => a.id === id)));
  }, [activeDeptId, activeSubDeptId, unifiedAssistants, activeSubDepartments]);

  const effectiveOfficerIds = useMemo(() => {
    const ids = new Set(selectedOfficers);
    if (activeOfficerTab !== 'all') ids.add(activeOfficerTab);
    return Array.from(ids);
  }, [activeOfficerTab, selectedOfficers]);

  const getCurrentStageTracking = useCallback((task: any) => {
    const applicableStages = [...stages]
      .filter(stage => isStageApplicableToTask(stage, task, departments))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    let latest: { stage: any; handledAt: Date } | null = null;

    applicableStages.forEach(stage => {
      const stageData = task?.stages?.[stage?.id];
      if (!stageData) return;

      const directDate = parseDate(
        stageData.completedAt ||
        stageData.skippedAt ||
        stageData.date_completed ||
        stageData.date ||
        stageData.lastUpdated ||
        null
      );

      if (directDate) {
        if (!latest || directDate.getTime() > latest.handledAt.getTime()) {
          latest = { stage, handledAt: directDate };
        }
      }
    });

    return latest;
  }, [stages, departments]);

  const tasksByFilters = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;
      if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
      if (activeSubClassId !== 'all' && task.subclass_id?.toString() !== activeSubClassId) return false;

      if (effectiveOfficerIds.length > 0) {
        if (officerFilterMode === 'current') {
          // Filter by current stage officer (tasks in officer's basket)
          const tracking = getCurrentStageTracking(task);
          if (!tracking) return false;
          const stageData = task.stages?.[tracking.stage.id];
          const officerIds = stageData?.officer_ids || [];
          const hasOfficer = officerIds.some((id: string) => effectiveOfficerIds.includes(id.toString()));
          if (!hasOfficer) return false;
        } else {
          // Filter by history - check if officer handled any stage
          const hasOfficer = stages.some(stage => {
            const stageData = task.stages?.[stage.id];
            const officerIds = stageData?.officer_ids || [];
            return officerIds.some((id: string) => effectiveOfficerIds.includes(id.toString()));
          });
          if (!hasOfficer) return false;
        }
      }

      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptId, activeClassId, activeSubClassId, effectiveOfficerIds, officerFilterMode, stages]);

  const allTasksCount = useMemo(() => tasksByFilters.length, [tasksByFilters]);
  const wipTasksCount = useMemo(() => {
    return tasksByFilters.filter(task => {
      const isWriteUp = task.status === 'write_up_completed';
      const isEndorsed = task.status === 'endorsed';
      const isCancelled = task.status === 'cancel';
      const isCompleted = isWriteUp || isEndorsed || ['completed', 'archived'].includes(task.status);
      return !isCompleted && !isCancelled;
    }).length;
  }, [tasksByFilters]);
  const writeUpCompletedCount = useMemo(() => tasksByFilters.filter(t => t.status === 'write_up_completed').length, [tasksByFilters]);
  const endorsedCount = useMemo(() => tasksByFilters.filter(t => t.status === 'endorsed').length, [tasksByFilters]);
  const cancelledCount = useMemo(() => tasksByFilters.filter(t => t.status === 'cancel').length, [tasksByFilters]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;
      if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
      if (activeSubClassId !== 'all' && task.subclass_id?.toString() !== activeSubClassId) return false;

      if (effectiveOfficerIds.length > 0) {
        if (officerFilterMode === 'current') {
          // Filter by current stage officer (tasks in officer's basket)
          const tracking = getCurrentStageTracking(task);
          if (!tracking) return false;
          const stageData = task.stages?.[tracking.stage.id];
          const officerIds = stageData?.officer_ids || [];
          const hasOfficer = officerIds.some((id: string) => effectiveOfficerIds.includes(id.toString()));
          if (!hasOfficer) return false;
        } else {
          // Filter by history - check if officer handled any stage
          const hasOfficer = stages.some(stage => {
            const stageData = task.stages?.[stage.id];
            const officerIds = stageData?.officer_ids || [];
            return officerIds.some((id: string) => effectiveOfficerIds.includes(id.toString()));
          });
          if (!hasOfficer) return false;
        }
      }

      const isWriteUp = task.status === 'write_up_completed';
      const isEndorsed = task.status === 'endorsed';
      const isCancelled = task.status === 'cancel';
      const isCompleted = isWriteUp || isEndorsed || ['completed', 'archived'].includes(task.status);

      if (activeStatus === 'all') return true;
      if (activeStatus === 'wip' && (isCompleted || isCancelled)) return false;
      if (activeStatus === 'write_up_completed' && !isWriteUp) return false;
      if (activeStatus === 'endorsed' && !isEndorsed) return false;
      if (activeStatus === 'cancelled' && !isCancelled) return false;
      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptId, activeClassId, activeSubClassId, activeStatus, effectiveOfficerIds, officerFilterMode, stages]);

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
    return ids.map((ref: any) => {
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

  const getTaskInitiatedDate = useCallback((task: any) => parseDate(task?.date_initiated || task?.created_at || null), []);

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

    cols.push({
      id: 'current_stage_officer',
      label: 'Current Stage Officer',
      type: 'current_stage_officer'
    });

    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});
    const sortedStages = stages
      .filter(s => activeStageIds.includes(s.id))
      .filter(stage => isStageApplicableToCurrentFilter(stage.id))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    sortedStages.forEach((stage, index) => {
      const config = activeReport.configuration.stages[stage.id];
      const isSpecialStage = SPECIAL_STAGE_IDS.includes(stage.id);
      const hasDocuments = config.documents && Object.keys(config.documents).length > 0;
      const shouldShowDateColumn = config.isStageDateSelected || hasDocuments;
      const isOfficerStage = stage.follow_up?.toLowerCase() === 'officer';

      // Add officer column for stages that require officer follow-up
      if (isOfficerStage) {
        const officerColId = `stage_${stage.id}_officers`;
        if (!cols.some(c => c.id === officerColId)) {
          cols.push({
            id: officerColId,
            label: `${stage.name} (Officers)`,
            type: 'stage_officers',
            stageId: stage.id,
            stageName: stage.name,
            filterApplicable: isStageApplicableToCurrentFilter(stage.id)
          });
        }
      }

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

        // Add gap column after this stage (except for the last stage)
        if (index < sortedStages.length - 1) {
          const nextStage = sortedStages[index + 1];
          const nextConfig = activeReport.configuration.stages[nextStage.id];
          const nextShouldShowDateColumn = nextConfig.isStageDateSelected || (nextConfig.documents && Object.keys(nextConfig.documents).length > 0);

          if (nextShouldShowDateColumn) {
            cols.push({
              id: `gap_${stage.id}_to_${nextStage.id}`,
              label: `→`,
              type: 'stage_gap',
              fromStageId: stage.id,
              toStageId: nextStage.id,
              fromStageName: stage.name,
              toStageName: nextStage.name,
              filterApplicable: isStageApplicableToCurrentFilter(stage.id) || isStageApplicableToCurrentFilter(nextStage.id)
            });
          }
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

  const filteredColumns = useMemo(() => {
    return columns.filter(c => visibleColumnIds.includes(c.id));
  }, [columns, visibleColumnIds]);

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

    if (col.type === 'stage_gap') {
      const fromStage = stages.find(s => s.id === col.fromStageId);
      const toStage = stages.find(s => s.id === col.toStageId);
      if (!fromStage || !toStage) return <span className="text-sm text-slate-400">—</span>;

      const fromDate = getStageHandledDate(task, fromStage);
      const toDate = getStageHandledDate(task, toStage);

      if (!fromDate || !toDate) return <span className="text-sm text-slate-400">—</span>;

      const diffMs = toDate.getTime() - fromDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffDays = Math.floor(diffMins / (60 * 24));
      const diffHours = Math.floor((diffMins % (60 * 24)) / 60);

      let displayText = '';
      if (diffDays > 0) displayText += `${diffDays}d `;
      if (diffHours > 0) displayText += `${diffHours}h `;
      if (diffMins % 60 > 0) displayText += `${diffMins % 60}m`;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-sm font-medium text-orange-600 cursor-default">
              <ArrowRight className="h-4 w-4" />
              <span>{displayText.trim() || '0m'}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-white text-slate-700 border-slate-200 shadow-xl p-2">
            <div className="text-sm space-y-1">
              <div><span className="font-semibold text-slate-500">From:</span> {col.fromStageName}</div>
              <div><span className="font-semibold text-slate-500">To:</span> {col.toStageName}</div>
              <div><span className="font-semibold text-slate-500">Gap:</span> <span className="text-orange-600">{displayText.trim() || '0m'}</span></div>
              <div><span className="font-semibold text-slate-500">From Date:</span> {formatDateForDisplay(fromDate)}</div>
              <div><span className="font-semibold text-slate-500">To Date:</span> {formatDateForDisplay(toDate)}</div>
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
        () => { }, () => { }, () => { },
        unifiedOfficers
      );
    }

    if (col.type === 'current_stage_officer') {
      const applicableStages = [...stages]
        .filter(stage => checkStageApplicableForTask(stage, task))
        .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

      const currentStage = applicableStages.find(stage => {
        const stageData = task.stages?.[stage.id];
        return stageData && stageData.status !== 'completed' && stageData.status !== 'skipped';
      });

      if (!currentStage) {
        return <span className="text-sm text-slate-400">—</span>;
      }

      const stageData = task.stages?.[currentStage.id];
      const officerIds = stageData?.officer_ids || [];


      if (!officerIds || officerIds.length === 0) {
        return <span className="text-sm text-slate-400 italic">None assigned</span>;
      }

      const officerNames = officerIds.map((id: string) => {
        const officer = unifiedOfficers.find((o: any) => o.id.toString() === id.toString());
        return officer ? getOfficerDisplayName(officer) : 'Unknown';
      }).filter(Boolean);

      if (officerNames.length === 0) {
        return <span className="text-sm text-slate-400 italic">None assigned</span>;
      }

      return (
        <div className="flex flex-wrap gap-1">
          {officerNames.map((name: string, idx: number) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
              {name}
            </Badge>
          ))}
        </div>
      );
    }

    if (col.type === 'stage_officers') {
      const stageData = task.stages?.[col.stageId];
      const officerIds = stageData?.officer_ids || [];

      if (!officerIds || officerIds.length === 0) {
        return <span className="text-sm text-slate-400 italic">None assigned</span>;
      }

      const officerNames = officerIds.map((id: string) => {
        const officer = unifiedOfficers.find((o: any) => o.id.toString() === id.toString());
        return officer ? getOfficerDisplayName(officer) : 'Unknown';
      }).filter(Boolean);

      if (officerNames.length === 0) {
        return <span className="text-sm text-slate-400 italic">None assigned</span>;
      }

      return (
        <div className="flex flex-wrap gap-1">
          {officerNames.map((name: string, idx: number) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">
              {name}
            </Badge>
          ))}
        </div>
      );
    }

    return <span className="text-sm text-slate-400">—</span>;
  }, [
    stages, departments, kycDocuments, allDocuments, companies,
    enhancedTasksData, taskDependants, showTimeStatuses,
    checkStageApplicableForTask, isDocumentApplicable, getDocumentForTaskStage,
    getStaffName, getTaskHierarchy, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
    getCurrentStageTracking, getTaskInitiatedDate, unifiedOfficers
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

    searchedTasks.forEach((task, index) => {
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

  const columnGroups = useMemo(() => {
    if (!filteredColumns.length) return [];
    const groups: any[] = [];
    const taskCols = filteredColumns.filter(c => c.type === 'task');
    if (taskCols.length) groups.push({ id: 'task_info', label: 'Task Details', span: taskCols.length, applicable: true });
    const trackingCols = filteredColumns.filter(c => c.type === 'current_stage_age' || c.type === 'total_process_age');
    if (trackingCols.length) groups.push({ id: 'time_tracking', label: 'Time Tracking', span: trackingCols.length, applicable: true });

    const stageMap = new Map<string, { id: string; label: string; count: number; applicable: boolean }>();
    filteredColumns.filter(c => c.type !== 'task' && c.type !== 'current_stage_age' && c.type !== 'total_process_age').forEach(col => {
      // For gap columns, use fromStageId; for other stage columns, use stageId
      const stageId = col.type === 'stage_gap' ? col.fromStageId : col.stageId;
      if (!stageId) return;

      if (!stageMap.has(stageId)) {
        stageMap.set(stageId, {
          id: stageId,
          label: stages.find(s => s.id === stageId)?.name || 'Stage',
          count: 0,
          applicable: isStageApplicableToCurrentFilter(stageId)
        });
      }
      stageMap.get(stageId)!.count++;
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

  const breadcrumbParts = [
    activeReport?.name,
    activeDepartment?.name,
    activeSubDeptId !== 'all' ? activeSubDepartments.find(s => s.id.toString() === activeSubDeptId)?.name : 'All Subdepartments',
    activeStatus === 'all' ? 'All Statuses' : activeStatus.replace(/_/g, ' ').toUpperCase(),
    activeClassId !== 'all' ? `Class: ${activeSubDepartments.find(s => s.id.toString() === activeSubDeptId)?.classes?.find((c: any) => c.id.toString() === activeClassId)?.name || activeClassId}` : null
  ].filter(Boolean);

  if (reportLoading) {
    return (
      <div className="flex-1 p-8 bg-slate-50/30 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-slate-400 mx-auto" />
          <p className="text-slate-700">Loading Reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-2 px-2 bg-slate-50/30 min-h-screen">
      {/* ── Header exactly like DepartmentTasksManager ── */}
      <div className="flex justify-between items-center px-1 pt-2">
        <div className="flex gap-6">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            {activeReport ? activeReport.name : "Reports"}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setIsReportDialogOpen(true)} className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {activeReport ? "Change Report" : "Select Report"}
          </Button>
        </div>
        {!areTabsVisible && (
          <div className="text-sm text-slate-600 font-medium flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800">Viewing:</span>
            {breadcrumbParts.map((part, index) => (
              <React.Fragment key={index}>
                <span className="bg-slate-100 px-2 py-1 rounded-md">{part}</span>
                {index < breadcrumbParts.length - 1 && <ChevronRight className="h-4 w-4 text-slate-400" />}
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <TableProperties className="h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-h-96 overflow-y-auto" align="end">
              <div className="p-2 space-y-2">
                <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider pb-1 border-b">Task Details</div>
                {columns.filter(c => c.type === 'task').map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.id}`}
                      checked={visibleColumnIds.includes(col.id)}
                      onCheckedChange={(checked) => {
                        setVisibleColumnIds(prev => {
                          if (checked) return [...prev, col.id];
                          return prev.filter(id => id !== col.id);
                        });
                      }}
                    />
                    <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                  </div>
                ))}
                <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider pb-1 border-b pt-2">Time Tracking</div>
                {columns.filter(c => c.type === 'current_stage_age' || c.type === 'total_process_age' || c.type === 'current_stage_officer').map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.id}`}
                      checked={visibleColumnIds.includes(col.id)}
                      onCheckedChange={(checked) => {
                        setVisibleColumnIds(prev => {
                          if (checked) return [...prev, col.id];
                          return prev.filter(id => id !== col.id);
                        });
                      }}
                    />
                    <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                  </div>
                ))}
                <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider pb-1 border-b pt-2">Stages</div>
                {columns.filter(c => c.stageId && (c.type === 'stage_date' || c.type === 'stage_officers')).map(col => (
                  <div key={col.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.id}`}
                      checked={visibleColumnIds.includes(col.id)}
                      onCheckedChange={(checked) => {
                        setVisibleColumnIds(prev => {
                          if (checked) return [...prev, col.id];
                          return prev.filter(id => id !== col.id);
                        });
                      }}
                    />
                    <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                  </div>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAreTabsVisible(!areTabsVisible)}
            className={`transition-all ${!areTabsVisible ? 'bg-slate-100' : ''}`}
          >
            {areTabsVisible ? <PanelLeftClose className="h-4 w-4 mr-2" /> : <PanelLeftOpen className="h-4 w-4 mr-2" />}
            {areTabsVisible ? 'Hide Navigation' : 'Show Navigation'}
          </Button>
        </div>
      </div>

      {/* ── Tabs Navigation exactly like DepartmentTasksManager ── */}
      <Tabs value={activeDeptId} onValueChange={(val) => { setActiveDeptId(val); setActiveSubDeptId('all'); }} className="space-y-2">
        {areTabsVisible && departments.length > 0 && (
          <TabsList className="grid w-full rounded-lg p-1 shadow-sm bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
            {departments.map(dept => (
              <TabsTrigger key={dept.id} value={dept.id.toString()} className="text-sm font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-indigo-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                {dept.name}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {activeDepartment && (
          <TabsContent value={activeDeptId} className="space-y-4 m-0">
            {/* Subdepartments Tab */}
            {areTabsVisible && activeSubDepartments.length > 0 && (
              <Tabs value={activeSubDeptId} onValueChange={(v) => { setActiveSubDeptId(v); }}>
                <TabsList className="rounded-lg p-1 shadow-sm bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 h-auto">
                  <TabsTrigger value="all" className="text-sm font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-teal-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                    All Subdepartments
                  </TabsTrigger>
                  {activeSubDepartments.map(subdept => (
                    <TabsTrigger key={subdept.id} value={subdept.id.toString()} className="text-sm font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-teal-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                      {subdept.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {/* Statuses Tab */}
            <Tabs value={activeStatus} onValueChange={(v) => { setActiveStatus(v); }}>
              {areTabsVisible && (
                <TabsList className="rounded-lg p-1 shadow-sm bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
                  <TabsTrigger value="all" className="text-sm md:text-sm gap-2 font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-600 data-[state=active]:to-slate-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                    All Statuses <Badge variant="secondary" className="bg-slate-100 text-slate-800">{allTasksCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="wip" className="text-sm md:text-sm gap-2 font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-600 data-[state=active]:to-amber-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                    WIP Stages <Badge variant="secondary" className="bg-amber-100 text-amber-800">{wipTasksCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="write_up_completed" className="text-sm md:text-sm gap-2 font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-green-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                    Write Up Completed <Badge variant="secondary" className="bg-green-100 text-green-800">{writeUpCompletedCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="endorsed" className="text-sm md:text-sm gap-2 font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-purple-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                    Endorsement Completed <Badge variant="secondary" className="bg-purple-100 text-purple-800">{endorsedCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="cancelled" className="text-sm md:text-sm gap-2 font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600 data-[state=active]:to-red-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200">
                    Cancelled <Badge variant="secondary" className="bg-red-100 text-red-800">{cancelledCount}</Badge>
                  </TabsTrigger>
                </TabsList>
              )}

              <TabsContent value={activeStatus} className="mt-4">
                {areTabsVisible && (
                  <>
                    {availableOfficers.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Officer Filter Mode</span>
                          <Select value={officerFilterMode} onValueChange={(value: 'current' | 'history') => setOfficerFilterMode(value)}>
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="current">Current Stage</SelectItem>
                              <SelectItem value="history">History (All Stages)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Tabs value={activeOfficerTab} onValueChange={setActiveOfficerTab} className="w-full">
                          <TabsList className="rounded-lg p-1 shadow-sm bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 h-auto">
                            <TabsTrigger value="all" className="text-sm font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200 flex-1">
                              All Officers
                            </TabsTrigger>
                            {availableOfficers.map(officer => (
                              <TabsTrigger key={officer.id} value={officer.id} className="text-sm font-semibold text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-700 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:border-0 rounded-md transition-all duration-200 flex-1">
                                {officer.full_name || officer.name || officer.displayName || `Officer ${officer.id}`}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        </Tabs>
                      </div>
                    )}
                  </>
                )}

                {/* Wrapper Card */}
                <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-slate-100 flex flex-col h-[calc(100vh - 100px)]">
                  <CardHeader className="border-b border-slate-100 bg-white shrink-0 pb-3">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg text-slate-800">
                          {activeReport ? activeReport.name : "Report Viewer"}
                          {activeDeptId && ` - ${activeDepartment?.name}`}
                        </CardTitle>
                        <CardDescription className="text-slate-600">
                          {activeReport ? activeReport.description : "Select a template"}
                        </CardDescription>
                      </div>

                      {/* Action Tools aligned to right exactly like DepartmentTasksManager */}
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                          <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 w-48 sm:w-64 h-9"
                          />
                          {searchQuery && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1.5 h-6 w-6"
                              onClick={() => setSearchQuery('')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <Button onClick={() => setView(view === 'standard' ? 'transposed' : 'standard')} className="flex items-center gap-2 cursor-pointer">
                          {view === 'standard' ? <LayoutGrid className="h-4 w-4" /> : <TableProperties className="h-4 w-4" />}
                          {view === 'standard' ? 'Transposed View' : 'Standard View'}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="flex items-center gap-2">
                              <Filter className="h-4 w-4" />Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setShowTimeStatuses(!showTimeStatuses)} className="flex items-center gap-2 cursor-pointer">
                              <Clock className="h-4 w-4" />
                              {showTimeStatuses ? 'Hide Time Details' : 'Show Time Details'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowNARows(!showNARows)} className="flex items-center gap-2 cursor-pointer">
                              {showNARows ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              {showNARows ? 'Hide N/A Rows' : 'Show N/A Rows'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('excel')} className="flex items-center gap-2 cursor-pointer">
                              <Download className="h-4 w-4" />Export to Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => refreshData()} disabled={loading} className="flex items-center gap-2 cursor-pointer">
                              <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />Refresh
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {areTabsVisible && (
                          <div className="flex justify-between">
                            <DropdownMenu open={isFiltersDropdownOpen} onOpenChange={setIsFiltersDropdownOpen}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="flex items-center gap-2">
                                  <Filter className="h-4 w-4" />Filters
                                  {activeClassId !== 'all' || activeSubClassId !== 'all' || selectedOfficers.length > 0 || selectedManagers.length > 0 || selectedAssistants.length > 0 || activeOfficerTab !== 'all' ? (
                                    <Badge variant="secondary" className="ml-1 h-5 px-2">Active</Badge>
                                  ) : null}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-80 max-h-[80vh] overflow-y-auto">
                                <div className="p-4 space-y-4">
                                  {/* Class Select */}
                                  <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Class</label>
                                    <Select value={activeClassId} onValueChange={v => { setActiveClassId(v); setActiveSubClassId('all'); }}>
                                      <SelectTrigger className="w-full h-9 text-sm font-medium bg-white border-slate-200 text-slate-700">
                                        <SelectValue placeholder="All Classes" />
                                      </SelectTrigger>
                                      <SelectContent className="z-[100]">
                                        <SelectItem value="all">All Classes</SelectItem>
                                        {activeSubDepartments.find(s => s.id.toString() === (activeSubDeptId === 'all' ? activeSubDepartments[0]?.id.toString() : activeSubDeptId))?.classes?.map((cls: any) => (
                                          <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                        )) || []}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {/* Subclass Select */}
                                  {activeClassId && activeClassId !== 'all' && (
                                    <div>
                                      <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Subclass</label>
                                      <Select value={activeSubClassId} onValueChange={v => { setActiveSubClassId(v); }}>
                                        <SelectTrigger className="w-full h-9 text-sm font-medium bg-white border-slate-200 text-slate-700">
                                          <SelectValue placeholder="All Subclasses" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[100]">
                                          <SelectItem value="all">All Subclasses</SelectItem>
                                          {activeSubDepartments.find(s => s.id.toString() === (activeSubDeptId === 'all' ? activeSubDepartments[0]?.id.toString() : activeSubDeptId))?.classes?.find((c: any) => c.id.toString() === activeClassId)?.subClasses?.map((subCls: any) => (
                                            <SelectItem key={subCls.id} value={subCls.id.toString()}>{subCls.name}</SelectItem>
                                          )) || []}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}

                                  {/* Officer Dropdown */}
                                  <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Officers</label>
                                    <DropdownMenu open={isOfficerDropdownOpen} onOpenChange={setIsOfficerDropdownOpen}>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" disabled={!activeDeptId} className={cn("w-full h-9 text-sm font-medium justify-between", selectedOfficers.length > 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-700 border-slate-200")}>
                                          <span className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            {selectedOfficers.length > 0 ? `${selectedOfficers.length} Selected` : "Filter Officers"}
                                          </span>
                                          <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="w-64 p-2 z-[100] border-slate-200 shadow-xl max-h-80 overflow-y-auto">
                                        {availableOfficers.length === 0 ? (
                                          <div className="p-3 text-sm text-slate-500 text-center italic">No officers assigned</div>
                                        ) : (
                                          <>
                                            <div className="space-y-1">
                                              {availableOfficers.map(o => (
                                                <div key={o.id} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-50 rounded-md transition-colors cursor-pointer" onClick={() => { setSelectedOfficers(prev => prev.includes(o.id) ? prev.filter(id => id !== o.id) : [...prev, o.id]); }}>
                                                  <Checkbox checked={selectedOfficers.includes(o.id)} className="pointer-events-none" />
                                                  <label className="text-sm font-medium text-slate-700 cursor-pointer">{o.full_name || o.name || o.displayName || `Officer ${o.id}`}</label>
                                                </div>
                                              ))}
                                            </div>
                                            {selectedOfficers.length > 0 && (
                                              <div className="border-t border-slate-100 mt-2 pt-2">
                                                <Button variant="ghost" size="sm" className="w-full text-sm text-slate-500 hover:text-slate-800" onClick={() => { setSelectedOfficers([]); }}>Clear Selection</Button>
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Manager Dropdown */}
                                  <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Managers</label>
                                    <DropdownMenu open={isManagerDropdownOpen} onOpenChange={setIsManagerDropdownOpen}>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" disabled={!activeDeptId} className={cn("w-full h-9 text-sm font-medium justify-between", selectedManagers.length > 0 ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-white text-slate-700 border-slate-200")}>
                                          <span className="flex items-center gap-2">
                                            <Briefcase className="h-4 w-4" />
                                            {selectedManagers.length > 0 ? `${selectedManagers.length} Selected` : "Filter Managers"}
                                          </span>
                                          <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="w-64 p-2 z-[100] border-slate-200 shadow-xl max-h-80 overflow-y-auto">
                                        {availableManagers.length === 0 ? (
                                          <div className="p-3 text-sm text-slate-500 text-center italic">No managers assigned</div>
                                        ) : (
                                          <>
                                            <div className="space-y-1">
                                              {availableManagers.map(m => (
                                                <div key={m.id} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-50 rounded-md transition-colors cursor-pointer" onClick={() => { setSelectedManagers(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]); }}>
                                                  <Checkbox checked={selectedManagers.includes(m.id)} className="pointer-events-none" />
                                                  <label className="text-sm font-medium text-slate-700 cursor-pointer">{m.full_name || m.name || m.displayName || `Manager ${m.id}`}</label>
                                                </div>
                                              ))}
                                            </div>
                                            {selectedManagers.length > 0 && (
                                              <div className="border-t border-slate-100 mt-2 pt-2">
                                                <Button variant="ghost" size="sm" className="w-full text-sm text-slate-500 hover:text-slate-800" onClick={() => { setSelectedManagers([]); }}>Clear Selection</Button>
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Assistant Dropdown */}
                                  <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Assistants</label>
                                    <DropdownMenu open={isAssistantDropdownOpen} onOpenChange={setIsAssistantDropdownOpen}>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" disabled={!activeDeptId} className={cn("w-full h-9 text-sm font-medium justify-between", selectedAssistants.length > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-white text-slate-700 border-slate-200")}>
                                          <span className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            {selectedAssistants.length > 0 ? `${selectedAssistants.length} Selected` : "Filter Assistants"}
                                          </span>
                                          <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="w-64 p-2 z-[100] border-slate-200 shadow-xl max-h-80 overflow-y-auto">
                                        {availableAssistants.length === 0 ? (
                                          <div className="p-3 text-sm text-slate-500 text-center italic">No assistants assigned</div>
                                        ) : (
                                          <>
                                            <div className="space-y-1">
                                              {availableAssistants.map(a => (
                                                <div key={a.id} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-50 rounded-md transition-colors cursor-pointer" onClick={() => { setSelectedAssistants(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]); }}>
                                                  <Checkbox checked={selectedAssistants.includes(a.id)} className="pointer-events-none" />
                                                  <label className="text-sm font-medium text-slate-700 cursor-pointer">{a.full_name || a.name || a.displayName || `Assistant ${a.id}`}</label>
                                                </div>
                                              ))}
                                            </div>
                                            {selectedAssistants.length > 0 && (
                                              <div className="border-t border-slate-100 mt-2 pt-2">
                                                <Button variant="ghost" size="sm" className="w-full text-sm text-slate-500 hover:text-slate-800" onClick={() => { setSelectedAssistants([]); }}>Clear Selection</Button>
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>)}
                      </div>
                    </div>
                  </CardHeader>

                  {/* Table Main Area */}
                  <CardContent className="flex-1 p-0 overflow-hidden relative">
                    <div className="h-full w-full overflow-auto scrollbar-thin bg-white rounded-b-xl">
                      {!activeReport ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50/50">
                          <FileText className="h-16 w-16 mb-4 opacity-20 text-blue-600" />
                          <p className="text-lg font-bold text-slate-600 tracking-tight">No Report Selected</p>
                          <p className="text-sm font-medium text-slate-400 mt-2">Open the report menu to generate a view</p>
                        </div>
                      ) : loading ? (
                        <div className="flex flex-col items-center justify-center h-full bg-slate-50/50">
                          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-3" />
                          <p className="text-sm font-bold text-slate-500">Processing Report Data...</p>
                        </div>
                      ) : view === 'standard' ? (
                        <StandardReportView
                          allTasks={filteredByNARows}
                          filteredColumns={filteredColumns}
                          columnGroups={columnGroups}
                          sortConfig={sortConfig}
                          expandedStageColumns={expandedStageColumns}
                          renderCellValue={renderCellValue}
                          safeRender={safeRender}
                          handleSort={handleSort}
                          toggleStageColumns={toggleStageColumns}
                          isStageApplicableToCurrentFilter={isStageApplicableToCurrentFilter}
                          userData={{
                            officers: unifiedOfficers,
                            managers: unifiedManagers,
                            assistants: unifiedAssistants,
                            allUsers: [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants]
                          }}
                          departments={departments}
                          stages={stages}
                        />
                      ) : (
                        <TransposedReportView
                          paginatedTasks={filteredByNARows}
                          transposedRows={transposedRows}
                          currentPage={1}
                          itemsPerPage={filteredByNARows.length}
                          expandedSections={expandedSections}
                          renderCellValue={renderCellValue}
                          toggleSection={toggleSection}
                          userData={{
                            officers: unifiedOfficers,
                            managers: unifiedManagers,
                            assistants: unifiedAssistants,
                            allUsers: [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants]
                          }}
                          departments={departments}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}
      </Tabs>

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
    </div>
  );
}





