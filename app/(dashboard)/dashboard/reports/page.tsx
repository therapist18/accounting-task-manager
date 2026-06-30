// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, LayoutGrid, Plus, Minus, Briefcase, FileDown, ChevronDown, FileText, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Clock, ArrowUpDown, Search, Timer, AlertCircle, CheckCircle2, Clock3, User, EyeOff, Eye, Filter, RotateCcw, X, TableProperties, Download, ArrowRight, Send, Shield, Users, Upload } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parse, isValid } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver'
import { getCurrentStageStatus, getCellContent, getEnhancedImmigrationStatus, renderImmigrationStatusCell, renderCurrentStageStatusCell, ENHANCED_TABLE_HEADERS_IMMIGRATION, enhanceTasksWithIndividualData, getRawCellValue } from "../tasks/overall-view/tableUtils";
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields } from "../tasks/utils/taskManagerData";
import { getOfficerDisplayName } from "@/lib/shared-user-assignment-service";
import { fetchDepartments } from "../departments/departments/database";
import { userService } from "@/lib/shared-user-assignment-service";
import { MemorizedReportDialog } from "./MemorizedReportDialog";
import { findDateInObject } from "../tasks/utils/dateUtils";
import { cn } from "@/lib/utils";
import { StandardReportView } from "./components/StandardReportView";
import { TransposedReportView } from "./components/TransposedReportView";
import { ReportsSidebar, ReportsHeader, PersonFilterStrip, StatusFilterBar } from "./components/ReportsHeader";

// ... (keep earlier helper functions parseDateSafe, formatDate, formatDateTimeForDisplay, safeRender, isStageApplicableToTask exactly as they were) ...
const SPECIAL_STAGE_IDS = [
  '072b9710-45df-4a05-ba65-01b4ef29d61d',
  'caefd742-5de5-4341-a3bb-81d7b9dd2b73'
];

const WRITE_UP_STAGE_ID = '072b9710-45df-4a05-ba65-01b4ef29d61d';
const PP_ENDORSEMENT_STAGE_ID = 'caefd742-5de5-4341-a3bb-81d7b9dd2b73';

const parseDateSafe = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isValid(d) ? d : null;
  }
  try {
    const d = new Date(s);
    return isValid(d) ? d : null;
  } catch { return null; }
};

const formatDate = (dateStr: string | null, showTime: boolean): string => {
  if (!dateStr) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return showTime ? `${dateStr} 00:00` : dateStr;
  try {
    const d = new Date(dateStr);
    if (isValid(d)) return showTime ? format(d, "dd/MM/yyyy HH:mm") : format(d, "dd/MM/yyyy");
  } catch { }
  return dateStr;
};

const formatDateTimeForDisplay = (date: any): string => {
  if (!date) return '-';
  if (typeof date === 'string') {
    const t = date.trim();
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(t)) return t.endsWith(' 00:00') ? t.slice(0, -6) : t;
  }
  const d = parseDateSafe(date);
  if (!d) return '-';
  try {
    const formatted = format(d, 'dd/MM/yyyy HH:mm');
    return formatted.endsWith(' 00:00') ? formatted.slice(0, -6) : formatted;
  } catch { return '-'; }
};

const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string') {
    if (content === 'N/A') return <span className="inline-flex items-center gap-1 text-sm text-slate-400 font-medium italic"><span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />N/A</span>;
    return content;
  }
  if (typeof content === 'number') return content;
  if (content === null || content === undefined) return <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">—</span>;
  if (Array.isArray(content)) return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  if (typeof content === 'object') {
    if ('status' in content) {
      const s = content.status;
      if (typeof s === 'string' || typeof s === 'number') {
        if (s === 'N/A') return <span className="inline-flex items-center gap-1 text-sm text-slate-400 font-medium italic"><span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />N/A</span>;
        return s;
      }
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
  // ... (keep all state and shared hooks up to useMemo for columns) ...
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [availableReports, setAvailableReports] = useState<any[]>([]);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, { name: string; prefix: string }>>(new Map());
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
  const [activeSubDeptIds, setActiveSubDeptIds] = useState<string[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>("all");
  const [activeSubClassId, setActiveSubClassId] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("wip");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [activeOfficerTab, setActiveOfficerTab] = useState<string>("all");
  const [officerFilterMode, setOfficerFilterMode] = useState<'current' | 'history'>('current');
  const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
  const [selectedTaskManagers, setSelectedTaskManagers] = useState<string[]>([]);
  const [activeTaskManagerTab, setActiveTaskManagerTab] = useState<string>("all");
  const [taskManagerFilterMode, setTaskManagerFilterMode] = useState<'current' | 'history'>('current');
  const [availableTaskManagers, setAvailableTaskManagers] = useState<any[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [activeClientTab, setActiveClientTab] = useState<string>("all");
  const [clientFilterMode, setClientFilterMode] = useState<'current' | 'history'>('current');
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [showTime, setShowTime] = useState(false);
  const [showDelta, setShowDelta] = useState(false);
  const [showOfficers, setShowOfficers] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));
  const [showNARows, setShowNARows] = useState(true);
  const [showDocRequirementsColumns, setShowDocRequirementsColumns] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [expandedStageColumns, setExpandedStageColumns] = useState<Set<string>>(new Set());
  const [activePerspective, setActivePerspective] = useState<'overview' | 'officers' | 'managers' | 'clients' | 'companies'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarPanelRef = useRef<any>(null);

  const handleSidebarToggle = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (panel) {
      sidebarCollapsed ? panel.expand() : panel.collapse();
    } else {
      setSidebarCollapsed(prev => !prev);
    }
  }, [sidebarCollapsed]);

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

        const depts = await fetchDepartments();
        setDepartments(depts);

        const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, depts);
        setUnifiedOfficers(unifiedUserData.officers || []);
        setUnifiedManagers(unifiedUserData.managers || []);
        setUnifiedAssistants(unifiedUserData.assistants || []);

        const usersMap = new Map();
        unifiedUserData.allUsers?.forEach((u: any) => usersMap.set(u.id, u));
        setTmUsers(usersMap);
      } catch (err) {
        toast({ title: "Error", description: "Could not load saved reports.", variant: "destructive" });
      } finally {
        setReportLoading(false);
      }
    };
    init();
  }, []);

  const refreshData = useCallback(async (silent = false) => {
    if (!activeReport) return;
    if (!silent) setLoading(true);
    try {
      const [depts, comps, docs, kycFields] = await Promise.all([
        fetchDepartments(),
        fetchCompanies(),
        fetchAllDocuments(),
        fetchAllKycFields()
      ]);

      const deptId = activeReport.department_id?.toString();
      const [tasksData, stagesData] = await Promise.all([
        fetchTasks(deptId, undefined, comps),
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

      if (!activeDeptId) {
        if (activeReport.department_id) setActiveDeptId(activeReport.department_id.toString());
        else if (depts.length > 0) setActiveDeptId(depts[0].id.toString());
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeReport, activeDeptId]);

  useEffect(() => { refreshData(); }, [activeReport]);

  const activeDepartment = useMemo(() => departments.find(d => d.id.toString() === activeDeptId), [departments, activeDeptId]);
  const activeSubDepartments = useMemo(() => activeDepartment?.tm_subdepartments || [], [activeDepartment]);

  useEffect(() => {
    if (!activeDeptId) return;
    const allUsers = [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants];
    const departmentUsers = userService.getDepartmentUsers(
      allUsers, activeDeptId, activeSubDeptIds.length === 1 ? activeSubDeptIds[0] : undefined
    );
    const allowedIds = new Set(departmentUsers.officers.map(o => o.id));
    setAvailableOfficers(unifiedOfficers.filter(o => allowedIds.has(o.id)));
  }, [activeDeptId, activeSubDeptIds, unifiedOfficers, activeSubDepartments]);

  useEffect(() => {
    if (!activeDeptId) return;
    const departmentUsers = userService.getDepartmentUsers(
      [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants], activeDeptId, activeSubDeptIds.length === 1 ? activeSubDeptIds[0] : undefined
    );
    const allowedIds = new Set(departmentUsers.managers.map(m => m.id));
    setAvailableTaskManagers(unifiedManagers.filter(m => allowedIds.has(m.id)));
  }, [activeDeptId, activeSubDeptIds, unifiedManagers, activeSubDepartments]);

  const getTaskCompanyParticipant = useCallback((task: any) => {
    return task.participants_details?.find((p: any) => {
      const role = p.role?.toString().toLowerCase() || '';
      const type = p.type?.toString().toLowerCase() || '';
      return type === 'company' || role.includes('sponsor') || role.includes('company');
    });
  }, []);

  useEffect(() => {
    const clientsMap = new Map<string, any>();
    tasks.forEach(task => {
      const company = getTaskCompanyParticipant(task);
      if (company && company.name) {
        if (!clientsMap.has(company.name)) {
          clientsMap.set(company.name, { id: company.name, name: company.name, full_name: company.name });
        }
      }
    });
    setAvailableClients(Array.from(clientsMap.values()));
  }, [tasks, getTaskCompanyParticipant]);

  const effectiveOfficerIds = useMemo(() => Array.from(new Set(activeOfficerTab !== 'all' && activeOfficerTab !== '__unallocated__' ? [activeOfficerTab, ...selectedOfficers] : selectedOfficers)), [activeOfficerTab, selectedOfficers]);
  const effectiveTaskManagerIds = useMemo(() => Array.from(new Set(activeTaskManagerTab !== 'all' && activeTaskManagerTab !== '__unallocated__' ? [activeTaskManagerTab, ...selectedTaskManagers] : selectedTaskManagers)), [activeTaskManagerTab, selectedTaskManagers]);
  const effectiveClientIds = useMemo(() => Array.from(new Set(activeClientTab !== 'all' ? [activeClientTab, ...selectedClients] : selectedClients)), [activeClientTab, selectedClients]);

  const getCurrentStageTracking = useCallback((task: any) => {
    const applicableStages = [...stages].filter(stage => isStageApplicableToTask(stage, task, departments)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    let latest: { stage: any; handledAt: Date } | null = null;
    applicableStages.forEach(stage => {
      const stageData = task?.stages?.[stage?.id];
      if (!stageData) return;
      const directDate = parseDateSafe(stageData.completedAt || stageData.skippedAt || stageData.date_completed || stageData.date || stageData.lastUpdated || null);
      if (directDate) {
        if (!latest || directDate.getTime() > latest.handledAt.getTime()) latest = { stage, handledAt: directDate };
      }
    });
    return latest;
  }, [stages, departments]);

  const getCurrentOfficerStage = useCallback((task: any) => {
    const applicableStages = [...stages].filter(stage => isStageApplicableToTask(stage, task, departments)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    return applicableStages.find(stage => {
      const stageData = task?.stages?.[stage.id];
      const status = stageData?.status?.toString().toLowerCase();
      return stageData && stage.follow_up?.toLowerCase() === 'officer' && status !== 'completed' && status !== 'skipped';
    }) || null;
  }, [stages, departments]);

  const getStageOfficerIds = useCallback((task: any, mode: 'current' | 'history' = 'current') => {
    const normalizeIds = (ids: any) => Array.isArray(ids) ? ids.map(id => id?.toString()).filter(Boolean) : [];
    if (mode === 'current') {
      const currentOfficerStage = getCurrentOfficerStage(task);
      return normalizeIds(currentOfficerStage ? task?.stages?.[currentOfficerStage.id]?.officer_ids : []);
    }
    const officerIds = new Set<string>();
    Object.values(task?.stages || {}).forEach((stageData: any) => normalizeIds(stageData?.officer_ids).forEach(id => officerIds.add(id)));
    return Array.from(officerIds);
  }, [getCurrentOfficerStage]);

  const taskHasStageOfficer = useCallback((task: any, officerIds: string[], mode: 'current' | 'history') => {
    if (!officerIds.length) return true;
    return getStageOfficerIds(task, mode).some(id => officerIds.includes(id));
  }, [getStageOfficerIds]);

  const isTaskWithClient = useCallback((task: any) => {
    const tracking = getCurrentStageTracking(task);
    return tracking?.stage?.follow_up?.toString().toLowerCase() === 'client';
  }, [getCurrentStageTracking]);

  const tasksByFilters = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptIds.length > 0 && !activeSubDeptIds.includes(task.subdepartment_id?.toString())) return false;
      if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
      if (activeSubClassId !== 'all' && task.subclass_id?.toString() !== activeSubClassId) return false;
      if (activePerspective === 'officers') {
        if (activeOfficerTab === '__unallocated__' && getStageOfficerIds(task, 'current').length !== 0) return false;
        else if (effectiveOfficerIds.length > 0 && !taskHasStageOfficer(task, effectiveOfficerIds, officerFilterMode)) return false;
      }
      if (activePerspective === 'managers') {
        const tracking = getCurrentStageTracking(task);
        if (activeTaskManagerTab === '__unallocated__') {
          if (!tracking || tracking.stage.follow_up !== 'BCL' || task.task_manager?.id) return false;
        } else if (effectiveTaskManagerIds.length > 0) {
          if (!tracking || tracking.stage.follow_up !== 'BCL' || !task.task_manager?.id || !effectiveTaskManagerIds.includes(task.task_manager.id.toString())) return false;
        }
      }
      if (activePerspective === 'clients' && !isTaskWithClient(task)) return false;
      if (activePerspective === 'companies' && effectiveClientIds.length > 0) {
        const company = getTaskCompanyParticipant(task);
        if (!company || !company.name || !effectiveClientIds.includes(company.name)) return false;
      }
      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptIds, activeClassId, activeSubClassId, activePerspective, activeOfficerTab, activeTaskManagerTab, effectiveOfficerIds, officerFilterMode, effectiveTaskManagerIds, taskManagerFilterMode, effectiveClientIds, clientFilterMode, stages, getCurrentStageTracking, taskHasStageOfficer, isTaskWithClient, getTaskCompanyParticipant, getStageOfficerIds]);

  const allTasksCount = useMemo(() => tasksByFilters.length, [tasksByFilters]);
  const wipTasksCount = useMemo(() => tasksByFilters.filter(task => !['write_up_completed', 'endorsed', 'completed', 'archived', 'cancel'].includes(task.status)).length, [tasksByFilters]);
  const writeUpCompletedCount = useMemo(() => tasksByFilters.filter(t => t.status === 'write_up_completed').length, [tasksByFilters]);
  const endorsedCount = useMemo(() => tasksByFilters.filter(t => t.status === 'endorsed').length, [tasksByFilters]);
  const cancelledCount = useMemo(() => tasksByFilters.filter(t => t.status === 'cancel').length, [tasksByFilters]);

  const officerTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const o of availableOfficers) {
      const oTasks = tasksByFilters.filter(t => getStageOfficerIds(t, 'current').includes(o.id.toString()));
      counts[o.id.toString()] = oTasks.length;
      counts.all += oTasks.length;
    }
    const unallocated = tasksByFilters.filter(t => getStageOfficerIds(t, 'current').length === 0);
    counts.__unallocated__ = unallocated.length;
    counts.all += unallocated.length;
    return counts;
  }, [tasksByFilters, availableOfficers, getStageOfficerIds]);

  const taskManagerTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const tm of availableTaskManagers) {
      const tmTasks = tasksByFilters.filter(t => t.task_manager?.id?.toString() === tm.id.toString());
      counts[tm.id.toString()] = tmTasks.length;
      counts.all += tmTasks.length;
    }
    const unallocated = tasksByFilters.filter(t => !t.task_manager?.id);
    counts.__unallocated__ = unallocated.length;
    counts.all += unallocated.length;
    return counts;
  }, [tasksByFilters, availableTaskManagers]);

  const searchedTasks = useMemo(() => {
    let filtered = tasksByFilters.filter(task => {
      if (activeStatus === 'wip' && ['write_up_completed', 'endorsed', 'completed', 'archived', 'cancel'].includes(task.status)) return false;
      if (activeStatus === 'write_up_completed' && task.status !== 'write_up_completed') return false;
      if (activeStatus === 'endorsed' && task.status !== 'endorsed') return false;
      if (activeStatus === 'cancelled' && task.status !== 'cancel') return false;
      return true;
    });
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.id.toString().includes(q) || (t.applicant_name && t.applicant_name.toLowerCase().includes(q)) || (t.company_name && t.company_name.toLowerCase().includes(q)) || (companies.get(t.company_id)?.name?.toLowerCase().includes(q)));
    }
    return filtered;
  }, [tasksByFilters, activeStatus, searchQuery, companies]);

  function checkStageApplicableForTask(stage: any, task: any): boolean {
    return isStageApplicableToTask(stage, task, departments);
  }

  const isStageApplicableToCurrentFilter = useCallback((stageId: string): boolean => {
    if (!activeDeptId || activeDeptId === 'all') return true;
    const dept = departments.find(d => d.id.toString() === activeDeptId);
    if (!dept) return true;
    const subdept = activeSubDeptIds.length === 1 ? dept.tm_subdepartments?.find((s: any) => s.id.toString() === activeSubDeptIds[0]) : null;
    if (!subdept) return true;
    if (activeClassId && activeClassId !== 'all') {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === activeClassId);
      if (cls?.stages?.find((s: any) => s.stage_id === stageId)?.applicable === false) return false;
    }
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stageId);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') return subdeptStage.applicable;
    return true;
  }, [activeDeptId, activeSubDeptIds, activeClassId, departments]);

  const getSortableValue = useCallback((task: any, col: any) => {
    if (!col) return '';
    if (col.type === 'task') return getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
    if (col.type === 'stage_date') return task.stages?.[col.stageId]?.date ? parseDateSafe(task.stages[col.stageId].date)?.getTime() || 0 : 0;
    return '';
  }, [departments, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper]);

  const handleSort = (columnId: string) => {
    setSortConfig(cur => cur?.key === columnId ? { key: columnId, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key: columnId, direction: 'asc' });
  };

  const columns = useMemo(() => {
    if (!activeReport || !stages.length) return [];
    const getLabel = (id: any) => ENHANCED_TABLE_HEADERS_IMMIGRATION.find(h => h.id === id)?.label || String(id || '').replace(/_/g, ' ').toUpperCase();
    const cols: any[] = [];
    const fieldsToDisplay = activeReport.sessionIncludedFields?.length > 0 ? activeReport.sessionIncludedFields : activeReport.configuration?.taskFields?.map((f: any) => f.id) || [];
    fieldsToDisplay.forEach((fieldId: string) => { if (fieldId) cols.push({ id: `task_${fieldId}`, label: getLabel(fieldId), type: 'task', field: fieldId }); });

    if (showDocRequirementsColumns) {
      const referenceRequirements = new Map<string, any>();
      tasks.forEach(task => task.requirements?.forEach((req: any) => req.category === 'reference' && referenceRequirements.set(`req_${req.id || req.name}`, req)));
      referenceRequirements.forEach((req, reqId) => cols.push({ id: reqId, label: req.name || 'Reference Requirement', type: 'reference_requirement', requirementId: req.id, requirementName: req.name }));
    }

    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});
    const sortedStages = stages.filter(s => activeStageIds.includes(s.id) && isStageApplicableToCurrentFilter(s.id)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    sortedStages.forEach((stage) => {
      const config = activeReport.configuration.stages[stage.id];
      const requiresUpload = !!(stage.documents && stage.documents.length > 0);

      if (config.isStageDateSelected && !cols.some(c => c.id === `stage_${stage.id}_date`)) {
        cols.push({ id: `stage_${stage.id}_date`, label: stage.name, type: 'stage_date', stageId: stage.id, stageName: stage.name, requiresUpload });
      }

      const hasOfficer = stage.follow_up?.toLowerCase() === 'officer';
      const allFields: { kycId: string; fieldId: string; fieldName: string }[] = [];

      if (config.documents && Object.keys(config.documents).length > 0) {
        Object.entries(config.documents).forEach(([kycId, docConfig]) => {
          const kycDoc = kycDocuments.get(kycId);
          if (!kycDoc) return;
          (docConfig as any).fields?.forEach((field: any) => {
            const fieldInfo = kycDoc.fields?.find((f: any) => f.id === field.id);
            if (!fieldInfo) return;
            allFields.push({ kycId, fieldId: field.id, fieldName: fieldInfo.fieldName || field.id });
          });
        });
      }

      if (hasOfficer || allFields.length > 0) {
        cols.push({
          id: `stage_${stage.id}_details`,
          label: `${stage.name} (Info)`,
          type: 'stage_details',
          stageId: stage.id,
          stageName: stage.name,
          hasOfficer,
          fields: allFields,
        });
      }
    });
    return cols;
  }, [activeReport, stages, isStageApplicableToCurrentFilter, expandedStageColumns, showDocRequirementsColumns, tasks]);

  useEffect(() => {
    if (columns.length > 0) setVisibleColumnIds(prev => Array.from(new Set([...prev, ...columns.map(c => c.id)])));
  }, [columns]);

  const filteredColumns = useMemo(() => columns.filter(c => visibleColumnIds.includes(c.id)), [columns, visibleColumnIds]);

  const renderCellValue = useCallback((task: any, col: any) => {
    if (col.type === 'task') {
      const val = getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
      const isEmpty = val === null || val === undefined || val === '' || val === 'N/A' || val === '—' || val === 'null' || val === 'undefined';
      if (isEmpty) {
        return <span className="text-sm font-semibold text-red-500 italic">Missing</span>;
      }
      return getCellContent(departments, task, col.field, enhancedTasksData, taskDependants, new Set(), companies, getTaskHierarchy, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, (t: any) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { }), (t: any) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper), () => { }, () => { }, () => { }, unifiedOfficers, stages);
    }

    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-sm text-slate-400">—</span>;

      if (!checkStageApplicableForTask(stage, task)) {
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 font-medium italic cursor-default">
                  <span className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
                  N/A
                </span>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-50 text-slate-600 border-slate-200 shadow-xl p-2 text-xs">
                <span>Stage not applicable for this task</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      const stageData = task.stages?.[col.stageId];
      if (stageData?.status === 'skipped') {
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-sm text-amber-600 font-medium cursor-help">
                  <AlertCircle className="h-4 w-4" /> Skipped
                </span>
              </TooltipTrigger>
              <TooltipContent className="bg-white text-gray-700 border-gray-200 shadow-xl p-2 text-sm space-y-1">
                <p><span className="font-semibold text-gray-500">Reason:</span> {stageData.reason || 'None provided'}</p>
                {stageData.skippedAt && <p><span className="font-semibold text-gray-500">Date:</span> {formatDateTimeForDisplay(stageData.skippedAt)}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      const dateValue = stageData?.date || stageData?.completedAt || null;
      const hasDate = !!dateValue;
      let isOverdue = false;

      if (hasDate && stage.estimated_time) {
        const sortedStagesList = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
        const currentStageIndex = sortedStagesList.findIndex(s => s.id === stage.id);
        const prevStage = currentStageIndex > 0 ? sortedStagesList[currentStageIndex - 1] : null;

        const startStr = prevStage ? (task.stages?.[prevStage.id]?.date || task.stages?.[prevStage.id]?.completedAt) : (task.date_initiated || task.created_at);
        const start = parseDateSafe(startStr);
        const end = parseDateSafe(dateValue);
        if (start && end) isOverdue = (end.getTime() - start.getTime()) / 60000 > stage.estimated_time;
      }

      if (hasDate) {
        const completedBlock = (
          <div className="flex items-center gap-1.5 cursor-default select-none">
            {isOverdue ? <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /> : <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
            <span className={cn("text-sm font-semibold whitespace-nowrap", isOverdue ? "text-amber-700" : "text-slate-800")}>
              {formatDate(dateValue, showTime)}
            </span>
            {isOverdue && <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase">LATE</span>}
          </div>
        );

        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>{completedBlock}</TooltipTrigger>
              <TooltipContent side="top" className={cn("border shadow-md text-xs rounded-lg px-3 py-2 z-[100]", isOverdue ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900")}>
                <p className="font-bold mb-0.5">{isOverdue ? "Completed — Overdue" : "Completed On Time"}</p>
                <p className="text-slate-600 text-sm">{formatDate(dateValue, true)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      if (col.requiresUpload) {
        const subDeptId = task.subdepartment_id || task.job_level?.subdepartment_id || '';
        return (
          <Link
            href={`/dashboard/tasks?deptId=${activeDeptId || ''}&subDeptId=${subDeptId}&taskId=${task.id}&stageId=${stage.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 group/cell text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-2 w-2 rounded-full bg-slate-300 shrink-0 group-hover/cell:bg-blue-400 transition-colors" />
            <span className="text-sm font-medium italic">Pending</span>
            <Upload className="h-3 w-3 opacity-0 group-hover/cell:opacity-100 transition-opacity ml-0.5 shrink-0" />
          </Link>
        );
      }

      return (
        <Link
          href={`/dashboard/tasks?deptId=${activeDeptId || ''}&subDeptId=${task.subdepartment_id || task.job_level?.subdepartment_id || ''}&taskId=${task.id}&stageId=${stage.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 group/cell text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
          onClick={e => e.stopPropagation()}
        >
          <Clock className="h-3 w-3 shrink-0" />
          <span className="text-sm font-medium italic">Add Date</span>
        </Link>
      );
    }

    if (col.type === 'stage_details') {
      let officerNode: React.ReactNode = null;
      if (col.hasOfficer) {
        const stageData = task.stages?.[col.stageId];
        const officerIds = Array.isArray(stageData?.officer_ids) ? stageData.officer_ids.map(String).filter(Boolean) : [];
        if (!officerIds.length) {
          officerNode = <span className="text-xs text-gray-400 italic">—</span>;
        } else {
          const names = officerIds.map(id => {
            const o = unifiedOfficers.find((u: any) => u.id.toString() === id.toString());
            return o ? getOfficerDisplayName(o) : 'Unknown';
          }).filter(Boolean);
          officerNode = (
            <div className="flex flex-wrap gap-1">
              {names.map((n: string, i: number) => <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">{n}</Badge>)}
            </div>
          );
        }
      }

      let docNode: React.ReactNode = null;
      if (col.fields && col.fields.length > 0) {
        const sourceDocRef = task.source_document_id?.[col.stageId];
        let doc: any = null;

        if (sourceDocRef) {
          const docIds = Array.isArray(sourceDocRef) ? sourceDocRef : [sourceDocRef];
          const firstRef = docIds[0];
          if (firstRef) {
            const docId = typeof firstRef === 'string' ? firstRef : firstRef?.id;
            if (docId) {
              doc = allDocuments.find((d: any) => d.id?.toString() === docId?.toString());
            }
          }
        }

        if (!doc) {
          const stageData = task.stages?.[col.stageId];
          if (stageData?.documents) {
            const docs = typeof stageData.documents === 'object' ? Object.values(stageData.documents) : [];
            if (docs.length > 0) doc = docs[0];
          }
        }

        if (!doc) {
          docNode = <span className="text-xs text-gray-400 italic">—</span>;
        } else {
          const fieldValues: { fieldName: string; value: any }[] = [];
          for (const f of col.fields) {
            const val = doc.extracted_details?.[f.fieldName] || doc.edited_details?.[f.fieldName] || doc.extracted_data?.[f.fieldName];
            if (val !== null && val !== undefined && val !== '') {
              fieldValues.push({ fieldName: f.fieldName, value: val });
            }
          }

          if (fieldValues.length === 0) {
            docNode = <span className="text-xs text-gray-400 italic">—</span>;
          } else {
            docNode = (
              <div className="flex flex-col gap-0.5">
                {fieldValues.map((fv, i) => {
                  let displayVal = String(fv.value);
                  if (typeof fv.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fv.value)) {
                    try {
                      const d = new Date(fv.value);
                      if (isValid(d)) displayVal = format(d, 'dd/MM/yyyy');
                    } catch { }
                  }
                  return (
                    <div key={i} className="text-xs text-slate-700 leading-tight">
                      <span className="text-[10px] font-medium text-slate-500 uppercase">{fv.fieldName}:</span>{' '}
                      <span className="font-medium">{displayVal}</span>
                    </div>
                  );
                })}
              </div>
            );
          }
        }
      }

      return {
        isCombinedStageDetails: true,
        hasOfficer: col.hasOfficer,
        hasDocs: col.fields && col.fields.length > 0,
        officerNode,
        docNode
      };
    }

    if (col.type === 'reference_requirement') {
      const referenceDocs = task.referenceDocuments?.[col.requirementId] || [];
      if (referenceDocs.length === 0) return <div className="text-gray-400 italic">No documents</div>;
      const latestDoc = referenceDocs.reduce((p, c) => new Date(c.created_at) > new Date(p.created_at) ? c : p);
      const docId = latestDoc.document_id || latestDoc.kyc_document_id;
      const effectiveToField = kycDocuments.get(docId)?.fields?.find((f: any) => f.isEffectiveTo);
      const isEffectiveTo = effectiveToField ? (latestDoc.extracted_details?.[effectiveToField.fieldName] || latestDoc.edited_details?.[effectiveToField.fieldName]) : (latestDoc.extracted_details?.isEffectiveTo || latestDoc.edited_details?.isEffectiveTo);
      return <div className="text-gray-500"><span className="font-medium text-gray-700">{isEffectiveTo || '-'}</span></div>;
    }

    return <span className="text-sm text-gray-400">—</span>;
  }, [stages, departments, kycDocuments, companies, enhancedTasksData, taskDependants, showTime, activeDeptId, unifiedOfficers, allDocuments]);

  const getExportCellValue = useCallback((task: any, col: any): string => {
    if (col.type === 'task') {
      const val = getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
      const isEmpty = val === null || val === undefined || val === '' || val === 'N/A' || val === '—' || val === 'null' || val === 'undefined';
      return isEmpty ? 'Missing' : String(val ?? '');
    }
    if (col.type === 'stage_date') {
      const dateVal = task.stages?.[col.stageId]?.date || task.stages?.[col.stageId]?.completedAt;
      return dateVal ? formatDate(dateVal, false) : 'Pending';
    }
    if (col.type === 'stage_details') {
      let officerText = '';
      if (col.hasOfficer) {
        const stageData = task.stages?.[col.stageId];
        const officerIds = Array.isArray(stageData?.officer_ids) ? stageData.officer_ids.map(String).filter(Boolean) : [];
        if (officerIds.length) {
          officerText = officerIds.map(id => {
            const o = unifiedOfficers.find((u: any) => u.id.toString() === id.toString());
            return o ? getOfficerDisplayName(o) : 'Unknown';
          }).join(', ');
        }
      }

      let docText = '';
      if (col.fields && col.fields.length > 0) {
        const sourceDocRef = task.source_document_id?.[col.stageId];
        let doc: any = null;
        if (sourceDocRef) {
          const docIds = Array.isArray(sourceDocRef) ? sourceDocRef : [sourceDocRef];
          const firstRef = docIds[0];
          if (firstRef) {
            const docId = typeof firstRef === 'string' ? firstRef : firstRef?.id;
            if (docId) doc = allDocuments.find((d: any) => d.id?.toString() === docId?.toString());
          }
        }
        if (!doc) {
          const stageData = task.stages?.[col.stageId];
          if (stageData?.documents) {
            const docs = typeof stageData.documents === 'object' ? Object.values(stageData.documents) : [];
            if (docs.length > 0) doc = docs[0];
          }
        }
        if (doc) {
          const parts: string[] = [];
          for (const f of col.fields) {
            const val = doc.extracted_details?.[f.fieldName] || doc.edited_details?.[f.fieldName] || doc.extracted_data?.[f.fieldName];
            if (val !== null && val !== undefined && val !== '') parts.push(`${f.fieldName}: ${val}`);
          }
          docText = parts.join(', ');
        }
      }

      if (col.hasOfficer && col.fields?.length > 0) {
        return `Docs: ${docText || 'N/A'} | Officers: ${officerText || 'N/A'}`;
      }
      return docText || officerText || '';
    }
    return '';
  }, [departments, stages, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, unifiedOfficers, allDocuments]);

  const sortedTasks = useMemo(() => {
    if (!sortConfig || !filteredColumns.length) return searchedTasks;
    return [...searchedTasks].sort((a, b) => {
      const col = filteredColumns.find(c => c.id === sortConfig.key);
      const av = getSortableValue(a, col);
      const bv = getSortableValue(b, col);
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [searchedTasks, sortConfig, filteredColumns, getSortableValue]);

  const stageOnlyColumns = useMemo(() => filteredColumns.filter(c => c.type !== 'task'), [filteredColumns]);
  const filteredByNARows = useMemo(() => {
    if (showNARows || stageOnlyColumns.length === 0) return sortedTasks;
    return sortedTasks.filter(task => stageOnlyColumns.some(col => {
      const stage = stages.find((s: any) => s.id === col.stageId);
      return stage ? checkStageApplicableForTask(stage, task) : true;
    }));
  }, [sortedTasks, showNARows, stageOnlyColumns, stages, checkStageApplicableForTask]);

  const handleSendReport = useCallback(async (reportType: 'officer' | 'manager' | 'client', exportFormat: 'excel' | 'pdf') => {
    const deptName = activeDepartment?.name || 'All Departments';
    const subdeptLabel = activeSubDeptIds.length > 0
      ? activeSubDeptIds.map(id => activeSubDepartments.find((s: any) => s.id.toString() === id)?.name).filter(Boolean).join(', ') || 'Selected Subdepartments'
      : 'All Subdepartments';
    const statusLabel = activeStatus === 'all' ? 'All Statuses'
      : activeStatus === 'wip' ? 'WIP'
        : activeStatus === 'write_up_completed' ? 'Write-Up Completed'
          : activeStatus === 'endorsed' ? 'Endorsed'
            : activeStatus === 'cancelled' ? 'Cancelled'
              : activeStatus;
    const dateStr = format(new Date(), 'dd MMM yyyy');
    const reportTitle = reportType === 'officer' ? 'Officer Report'
      : reportType === 'manager' ? 'Manager Report'
        : 'Client Follow-Up Report';
    const accentHex = reportType === 'officer' ? '2563EB' : reportType === 'manager' ? '7C3AED' : 'EA580C';

    type Group = { name: string; tasks: any[] };
    const groups: Group[] = [];

    if (reportType === 'officer') {
      for (const o of availableOfficers) {
        const oTasks = filteredByNARows.filter(t => getStageOfficerIds(t, 'current').includes(o.id));
        if (oTasks.length > 0) groups.push({ name: o.full_name || o.name || o.displayName || `Officer ${o.id}`, tasks: oTasks });
      }
      const unallocated = filteredByNARows.filter(t => getStageOfficerIds(t, 'current').length === 0);
      if (unallocated.length > 0) groups.push({ name: 'Unallocated', tasks: unallocated });
    } else if (reportType === 'manager') {
      for (const tm of availableTaskManagers) {
        const tmTasks = filteredByNARows.filter(t => t.task_manager?.id?.toString() === tm.id);
        if (tmTasks.length > 0) groups.push({ name: tm.full_name || tm.name || tm.displayName || `Manager ${tm.id}`, tasks: tmTasks });
      }
      const unallocated = filteredByNARows.filter(t => !t.task_manager?.id);
      if (unallocated.length > 0) groups.push({ name: 'Unallocated', tasks: unallocated });
    } else {
      const clientTasks = filteredByNARows.filter(t => isTaskWithClient(t));
      groups.push({ name: 'Tasks Awaiting Client Response', tasks: clientTasks });
    }

    const totalTasks = groups.reduce((s, g) => s + g.tasks.length, 0);
    if (totalTasks === 0) {
      toast({ title: 'No Data', description: 'No tasks available for this report.' });
      return;
    }

    const exportCols = filteredColumns;
    const numDataCols = exportCols.length + 1;
    const safeDept = deptName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)}_Report_${safeDept}_${format(new Date(), 'yyyy-MM-dd')}`;

    if (exportFormat === 'excel') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Task Manager System';
      wb.created = new Date();
      const ws = wb.addWorksheet(reportTitle);

      // Title row
      ws.mergeCells(1, 1, 1, numDataCols);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = reportTitle.toUpperCase();
      titleCell.font = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${accentHex}` } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 44;

      // Subtitle row
      ws.mergeCells(2, 1, 2, numDataCols);
      const subCell = ws.getCell(2, 1);
      subCell.value = `${deptName}  ·  ${subdeptLabel}  ·  ${statusLabel}  ·  Generated: ${dateStr}  ·  Total: ${totalTasks} tasks`;
      subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 22;

      // Spacer
      ws.addRow([]);
      ws.getRow(3).height = 8;

      let currentRow = 4;

      for (const group of groups) {
        if (group.tasks.length === 0) continue;
        const isUnalloc = group.name === 'Unallocated';
        const groupFg = isUnalloc ? 'FF64748B' : `FF${accentHex}`;

        // Group section header
        ws.mergeCells(currentRow, 1, currentRow, numDataCols);
        const ghCell = ws.getCell(currentRow, 1);
        ghCell.value = `  ${group.name.toUpperCase()}    (${group.tasks.length} ${group.tasks.length === 1 ? 'task' : 'tasks'})`;
        ghCell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        ghCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: groupFg } };
        ghCell.alignment = { horizontal: 'left', vertical: 'middle' };
        ws.getRow(currentRow).height = 26;
        currentRow++;

        // Column headers
        const hRow = ws.addRow(['#', ...exportCols.map(c => c.label)]);
        hRow.height = 20;
        hRow.eachCell(cell => {
          cell.font = { name: 'Calibri', bold: true, size: 9, color: { argb: 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { bottom: { style: 'medium', color: { argb: 'FF94A3B8' } }, right: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
        });
        currentRow++;

        // Data rows
        group.tasks.forEach((task, idx) => {
          const dRow = ws.addRow([idx + 1, ...exportCols.map(col => getExportCellValue(task, col))]);
          dRow.height = 16;
          const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
          dRow.eachCell((cell, colNum) => {
            const v = String(cell.value ?? '');
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = {
              name: 'Calibri', size: 9, bold: v === 'Unallocated',
              color: { argb: v === 'N/A' ? 'FFEF4444' : v === 'Unallocated' ? 'FFF59E0B' : 'FF334155' }
            };
            cell.alignment = { horizontal: colNum === 1 ? 'center' : 'left', vertical: 'middle' };
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } }, right: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
          });
          currentRow++;
        });

        // Spacer between groups
        ws.addRow([]);
        ws.getRow(currentRow).height = 10;
        currentRow++;
      }

      // Column widths
      ws.getColumn(1).width = 5;
      exportCols.forEach((col, i) => {
        const id = (col.id || '').toLowerCase();
        ws.getColumn(i + 2).width = id.includes('name') || id.includes('stage') ? 34 : 22;
      });
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } else {
      // PDF using jsPDF + autoTable (dynamic import to keep bundle lean)
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const pdfCols = filteredColumns.length > 0 ? filteredColumns : [];

      const hexToRgb = (hex: string): [number, number, number] => [
        parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)
      ];
      const accent = hexToRgb(accentHex);

      // ── Colour helpers ─────────────────────────────────────────────────────────
      const GREY_DARK: [number, number, number] = [15, 23, 42];       // gray-950
      const GREY_MID: [number, number, number] = [71, 85, 105];       // gray-600
      const GREY_LIGHT: [number, number, number] = [226, 232, 240];   // gray-200
      const WHITE: [number, number, number] = [255, 255, 255];
      const ROW_ALT: [number, number, number] = [248, 250, 252];      // gray-50
      const AMBER_BG: [number, number, number] = [255, 251, 235];     // amber-50
      const AMBER_TEXT: [number, number, number] = [146, 64, 14];     // amber-800
      const RED_TEXT: [number, number, number] = [220, 38, 38];
      const ORANGE_TEXT: [number, number, number] = [234, 88, 12];
      const gray_TEXT: [number, number, number] = [100, 116, 139];
      const GREEN_TEXT: [number, number, number] = [21, 128, 61];

      const pdfBucket = (type: string) => {
        if (type === 'current_stage_age' || type === 'total_process_age') return 'duration';
        if (type === 'task') return 'task';
        if (type === 'reference_requirement') return 'reference';
        return 'stage';
      };

      // ── Modern page header ─────────────────────────────────────────────────────
      const paintPageHeader = (pageNum: number) => {
        // Thin accent top border
        doc.setFillColor(...accent);
        doc.rect(0, 0, pageW, 3, 'F');

        // White header area
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 3, pageW, 20, 'F');

        // Title
        doc.setTextColor(...GREY_DARK);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(reportTitle.toUpperCase(), 14, 15);

        // Meta line
        doc.setTextColor(...GREY_MID);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `${deptName}  ·  ${subdeptLabel}  ·  ${statusLabel}  ·  ${dateStr}  ·  ${totalTasks} tasks`,
          14, 20.5
        );

        // Subtle bottom line
        doc.setDrawColor(...GREY_LIGHT);
        doc.setLineWidth(0.3);
        doc.line(10, 23, pageW - 10, 23);
      };

      // ── Footer ─────────────────────────────────────────────────────────────────
      const paintFooter = (pageNum: number) => {
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(10, pageH - 8, pageW - 10, pageH - 8);
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.text(`${reportTitle}  ·  ${deptName}  ·  ${dateStr}`, 14, pageH - 3.5);
        doc.text(`Page ${pageNum}`, pageW - 14, pageH - 3.5, { align: 'right' });
      };

      paintPageHeader(1);
      let startY = 26;

      // Wide landscape: fit ~18 columns per chunk
      const CHUNK = 18;
      const colChunks: any[][] = [];
      for (let i = 0; i < pdfCols.length; i += CHUNK) {
        colChunks.push(pdfCols.slice(i, i + CHUNK));
      }
      if (colChunks.length === 0) colChunks.push([]);

      // ── Per-group rendering ────────────────────────────────────────────────────
      for (const group of groups) {
        if (group.tasks.length === 0) continue;
        const isUnalloc = group.name === 'Unallocated';
        const gColor: [number, number, number] = isUnalloc ? [100, 116, 139] : accent;

        for (let ci = 0; ci < colChunks.length; ci++) {
          const chunk = colChunks[ci];
          const isFirstChunk = ci === 0;

          if (startY > pageH - 40) {
            doc.addPage();
            paintPageHeader(doc.getNumberOfPages());
            startY = 26;
          }

          // ── Group banner ───────────────────────────────────────────────────────
          doc.setFillColor(...gColor);
          doc.roundedRect(8, startY, pageW - 16, 7, 1.5, 1.5, 'F');
          doc.setTextColor(...WHITE);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          const groupLabel = isFirstChunk
            ? group.name.toUpperCase()
            : `${group.name.toUpperCase()} (cont. — cols ${ci * CHUNK + 1}–${Math.min(ci * CHUNK + chunk.length, pdfCols.length)})`;
          const countLabel = `${group.tasks.length} task${group.tasks.length !== 1 ? 's' : ''}`;
          doc.text(`  ${groupLabel}`, 11, startY + 4.8);
          if (isFirstChunk) doc.text(countLabel, pageW - 11, startY + 4.8, { align: 'right' });
          startY += 9.5;

          // ── Build head styles per column ───────────────────────────────────────
          const buildHeadStyle = (colIndex: number): any => {
            if (colIndex === 0) return { fillColor: GREY_DARK, textColor: WHITE };
            const col = chunk[colIndex - 1];
            if (!col) return { fillColor: GREY_DARK, textColor: WHITE };
            const b = pdfBucket(col.type ?? 'stage');
            if (b === 'duration') return { fillColor: [180, 83, 9], textColor: WHITE };
            if (b === 'reference') return { fillColor: [6, 78, 59], textColor: WHITE };
            if (b === 'stage') return { fillColor: [55, 48, 163], textColor: WHITE };
            return { fillColor: [30, 58, 138], textColor: WHITE };
          };

          const headers = ['#', ...chunk.map(c => c.label)];
          const rows = group.tasks.map((task: any, i: number) => [
            String(i + 1),
            ...chunk.map((col: any) => {
              const v = getExportCellValue(task, col);
              return v || '—';
            })
          ]);

          autoTable(doc, {
            startY,
            head: [headers],
            body: rows,
            styles: {
              fontSize: 6.5,
              cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
              overflow: 'ellipsize',
              lineColor: GREY_LIGHT,
              lineWidth: 0.15,
              valign: 'middle',
            },
            headStyles: {
              fontStyle: 'bold',
              fontSize: 6.5,
              halign: 'center',
              minCellHeight: 7,
              lineWidth: 0,
            },
            bodyStyles: {
              textColor: [31, 41, 55],
              lineColor: [241, 245, 249],
            },
            alternateRowStyles: { fillColor: ROW_ALT },
            columnStyles: { 0: { halign: 'center', cellWidth: 7 } },
            margin: { left: 8, right: 8, top: 26, bottom: 12 },
            didParseCell: (data: any) => {
              if (data.section === 'head') {
                const hs = buildHeadStyle(data.column.index);
                data.cell.styles.fillColor = hs.fillColor;
                data.cell.styles.textColor = hs.textColor;
              }
              if (data.section === 'body') {
                const raw = String(data.cell.raw ?? '');
                const col = data.column.index > 0 ? chunk[data.column.index - 1] : null;

                if (raw === 'N/A') {
                  data.cell.styles.textColor = gray_TEXT;
                  data.cell.styles.fontStyle = 'italic';
                } else if (raw === 'Pending') {
                  data.cell.styles.textColor = gray_TEXT;
                  data.cell.styles.fontStyle = 'italic';
                } else if (raw === 'Unallocated') {
                  data.cell.styles.textColor = ORANGE_TEXT;
                } else if (raw.startsWith('Skipped')) {
                  data.cell.styles.textColor = gray_TEXT;
                  data.cell.styles.fontStyle = 'italic';
                } else if (raw.toLowerCase().includes('completed')) {
                  data.cell.styles.textColor = GREEN_TEXT;
                  data.cell.styles.fontStyle = 'bold';
                }

                if (col && (col.type === 'current_stage_age' || col.type === 'total_process_age')) {
                  data.cell.styles.fillColor = AMBER_BG;
                  data.cell.styles.textColor = AMBER_TEXT;
                }
              }
            },
            didDrawPage: (data: any) => {
              const pg = doc.getNumberOfPages();
              paintPageHeader(pg);
              paintFooter(pg);
            },
          });

          startY = (doc as any).lastAutoTable.finalY + 5;

          if (ci < colChunks.length - 1) {
            doc.addPage();
            paintPageHeader(doc.getNumberOfPages());
            startY = 26;
          }
        }

        startY += 3;
      }

      paintFooter(doc.getNumberOfPages());

      doc.save(`${fileName}.pdf`);
    }

    toast({ title: 'Report Downloaded', description: `${reportTitle} exported as ${exportFormat.toUpperCase()}.` });
  }, [activeDepartment, activeSubDeptIds, activeSubDepartments, activeStatus, filteredColumns, filteredByNARows, availableOfficers, availableTaskManagers, getStageOfficerIds, isTaskWithClient, getExportCellValue]);

  const columnGroups = useMemo(() => {
    if (!filteredColumns.length) return [];
    const groups: any[] = [];
    const taskCols = filteredColumns.filter(c => c.type === 'task');
    if (taskCols.length) groups.push({ id: 'task_info', label: 'Task Details', span: taskCols.length, applicable: true });
    return groups;
  }, [filteredColumns]);

  if (reportLoading) {
    return (
      <div className="flex-1 p-8 bg-slate-100 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <ReportsSidebar
        departments={departments} activeDeptId={activeDeptId} setActiveDeptId={setActiveDeptId}
        activeSubDepartments={activeSubDepartments} activeSubDeptIds={activeSubDeptIds} setActiveSubDeptIds={setActiveSubDeptIds}
        isCollapsed={sidebarCollapsed} onToggleCollapse={handleSidebarToggle}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <ReportsHeader
          activeReport={activeReport} setIsReportDialogOpen={setIsReportDialogOpen} columns={columns}
          visibleColumnIds={visibleColumnIds} setVisibleColumnIds={setVisibleColumnIds} view={view} setView={setView}
          handleSendReport={handleSendReport} activeDepartment={activeDepartment} activeSubDepartments={activeSubDepartments}
          activeSubDeptIds={activeSubDeptIds} showTime={showTime} setShowTime={setShowTime} showDelta={showDelta} setShowDelta={setShowDelta}
          showOfficers={showOfficers} setShowOfficers={setShowOfficers}
        />
        <PersonFilterStrip
          activePerspective={activePerspective} setActivePerspective={setActivePerspective} allTasksCount={allTasksCount}
          officerTaskCounts={officerTaskCounts} taskManagerTaskCounts={taskManagerTaskCounts} clientTaskCounts={{}} availableOfficers={availableOfficers}
          activeOfficerTab={activeOfficerTab} setActiveOfficerTab={setActiveOfficerTab} officerFilterMode={officerFilterMode} setOfficerFilterMode={setOfficerFilterMode}
          availableTaskManagers={availableTaskManagers} activeTaskManagerTab={activeTaskManagerTab} setActiveTaskManagerTab={setActiveTaskManagerTab}
          taskManagerFilterMode={taskManagerFilterMode} setTaskManagerFilterMode={setTaskManagerFilterMode}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} refreshData={refreshData} loading={loading}
          activeClassId={activeClassId} setActiveClassId={setActiveClassId} activeSubClassId={activeSubClassId} setActiveSubClassId={setActiveSubClassId}
          activeSubDepartments={activeSubDepartments} activeSubDeptIds={activeSubDeptIds}
        />
        <StatusFilterBar
          activeStatus={activeStatus} setActiveStatus={setActiveStatus} allTasksCount={allTasksCount}
          wipTasksCount={wipTasksCount} writeUpCompletedCount={writeUpCompletedCount} endorsedCount={endorsedCount} cancelledCount={cancelledCount}
        />
        <div className="flex-1 overflow-hidden">
          {!activeReport ? (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-lg mx-4 shadow-sm border border-slate-200">
              <FileText className="h-10 w-10 mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Report Selected</p>
              <Button size="sm" className="mt-4 hover:bg-blue-700 text-white" onClick={() => setIsReportDialogOpen(true)} style={{ backgroundColor: '#376bae' }}><Filter className="h-3.5 w-3.5 mr-1.5" />Select Report</Button>
            </div>
          ) : loading ? (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-lg mx-4 shadow-sm border border-slate-200">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
            </div>
          ) : view === 'standard' ? (
            <StandardReportView
              allTasks={filteredByNARows} filteredColumns={filteredColumns} sortConfig={sortConfig}
              expandedStageColumns={expandedStageColumns} renderCellValue={renderCellValue} safeRender={safeRender}
              handleSort={handleSort} toggleStageColumns={toggleStageColumns} isStageApplicableToCurrentFilter={isStageApplicableToCurrentFilter}
              departments={departments} stages={stages} showTime={showTime} showDelta={showDelta} showOfficers={showOfficers} activeDeptId={activeDeptId}
            />
          ) : (
            <TransposedReportView
              paginatedTasks={filteredByNARows} transposedRows={[]} currentPage={1} itemsPerPage={filteredByNARows.length}
              expandedSections={expandedSections} renderCellValue={renderCellValue} toggleSection={() => { }}
              userData={{ officers: unifiedOfficers, managers: unifiedManagers, assistants: unifiedAssistants, allUsers: [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants] }}
              departments={departments}
            />
          )}
        </div>
      </div>
      <MemorizedReportDialog
        open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} department={departments.find((d: any) => d.id.toString() === activeDeptId) || null}
        stages={stages} kycDocuments={kycDocuments} onApplyReport={(report) => { setActiveReport(report); setExpandedStageColumns(new Set()); setIsReportDialogOpen(false); }}
        tableHeaders={ENHANCED_TABLE_HEADERS_IMMIGRATION} availableJobLevels={availableJobLevels} departments={departments}
        subdepartments={departments.flatMap((d: any) => d.tm_subdepartments || [])} classes={departments.flatMap((d: any) => (d.tm_subdepartments || []).flatMap((s: any) => s.classes || []))}
      />
    </div>
  );
}