// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, LayoutGrid, Plus, Minus, Briefcase, FileDown, ChevronDown, FileText, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Clock, ArrowUpDown, Search, Timer, AlertCircle, CheckCircle2, Clock3, User, EyeOff, Eye, Filter, RotateCcw, X, TableProperties, Download, ArrowRight, Send, Shield, Users, Upload, Layers } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parse, isValid, differenceInDays } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver'
import { getCurrentStageStatus, getCellContent, getEnhancedImmigrationStatus, renderImmigrationStatusCell, renderCurrentStageStatusCell, ENHANCED_TABLE_HEADERS_IMMIGRATION, enhanceTasksWithIndividualData, getRawCellValue } from "../tasks/overall-view/tableUtils";
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields, fetchUploadedDocumentsForTasks, formatDateValue } from "../tasks/utils/taskManagerData";
import { getOfficerDisplayName } from "@/lib/shared-user-assignment-service";
import { fetchDepartments } from "../departments/departments/database";
import { userService } from "@/lib/shared-user-assignment-service";
import { MemorizedReportDialog } from "./MemorizedReportDialog";
import { calculateStageDate } from "../tasks/utils/dateUtils";
import { cn } from "@/lib/utils";
import { StandardReportView } from "./components/StandardReportView";
import { TransposedReportView } from "./components/TransposedReportView";
import { MobileReportView } from "./components/MobileReportView";
import { ReportsSidebar, ReportsHeader, PersonFilterStrip, StatusFilterBar } from "./components/ReportsHeader";
import { formatEstimatedMins } from "./components/reportCellRenderers";

const SPECIAL_STAGE_IDS = [
  '072b9710-45df-4a05-ba65-01b4ef29d61d',
  'caefd742-5de5-4341-a3bb-81d7b9dd2b73'
];

const WRITE_UP_STAGE_ID = '072b9710-45df-4a05-ba65-01b4ef29d61d';
const PP_ENDORSEMENT_STAGE_ID = 'caefd742-5de5-4341-a3bb-81d7b9dd2b73';

const parseDateSafe = (s: string | null | undefined): Date | null => {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh ? Number(hh) : 0, min ? Number(min) : 0);
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
    // Utilize job_level if available to accurately determine N/A status
    const deptId = task.job_level?.department_id || task.department?.id || task.department_id;
    const subdeptId = task.job_level?.subdepartment_id || task.subdepartment?.id || task.subdepartment_id;
    const classId = task.job_level?.class_id || task.class_id;
    const subclassId = task.job_level?.subclass_id || task.subclass_id;

    const dept = departments.find(d => d.id === deptId);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) => s.id === subdeptId);
    if (!subdept) return true;

    if (subclassId) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId?.toString());
      const subCls = cls?.subClasses?.find((sc: any) => sc.id.toString() === subclassId?.toString());
      const subClassStage = subCls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (subClassStage && typeof subClassStage.applicable === 'boolean') return subClassStage.applicable;
    }

    if (classId) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId?.toString());
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
  const [reportDocDefaults, setReportDocDefaults] = useState<any[]>([]);
  const [allIndividualDocuments, setAllIndividualDocuments] = useState<Record<number, any[]>>({});
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<Record<number, any[]>>({});
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [isDocumentPreviewOpen, setIsDocumentPreviewOpen] = useState(false);
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
    if (!activeReport) return false;
    if (!silent) setLoading(true);
    let success = true;
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

      const { individualDocsMap, companyDocsMap } = await fetchUploadedDocumentsForTasks(safeTasks);
      setAllIndividualDocuments(individualDocsMap);
      setAllCompanyDocuments(companyDocsMap);

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
      success = false;
      toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
    return success;
  }, [activeReport, activeDeptId]);

  useEffect(() => { refreshData(); }, [activeReport]);

  // Manual "Refresh" button: keeps the current table on screen (silent = true skips the
  // full-page loading overlay) while showing its own spinner, then confirms with a toast
  // so the user knows the refresh actually happened.
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    const success = await refreshData(true);
    if (success) toast({ title: "Refreshed", description: "Report data has been updated." });
    setIsManualRefreshing(false);
  }, [refreshData]);

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

  // Fetch report_doc_defaults for current job level
  useEffect(() => {
    const fetchReportDocDefaults = async () => {
      if (!activeDeptId) { setReportDocDefaults([]); return; }
      try {
        // Get unique job levels from tasks in this department
        const deptTasks = tasks.filter(t => String(t.department_id) === String(activeDeptId));
        const jobLevels = new Map<string, any>();

        deptTasks.forEach(task => {
          const jl = task.job_level || {};
          const key = JSON.stringify({
            department_id: Number(jl.department_id || activeDeptId),
            subdepartment_id: jl.subdepartment_id || null,
            class_id: jl.class_id || null,
            subclass_id: jl.subclass_id || null
          });
          if (!jobLevels.has(key)) {
            jobLevels.set(key, {
              department_id: Number(jl.department_id || activeDeptId),
              subdepartment_id: jl.subdepartment_id || null,
              class_id: jl.class_id || null,
              subclass_id: jl.subclass_id || null,
              level: jl.level || 1
            });
          }
        });

        // If no tasks, try with just the department
        if (jobLevels.size === 0) {
          jobLevels.set('default', {
            department_id: Number(activeDeptId),
            subdepartment_id: null,
            class_id: null,
            subclass_id: null,
            level: 1
          });
        }

        // Fetch report_doc_defaults for all matching job levels
        const allDefaults: any[] = [];
        for (const [_, jobLevel] of jobLevels) {
          const { data, error } = await supabase
            .from('tm_class_requirements')
            .select('report_doc_defaults')
            .eq('job_level', JSON.stringify(jobLevel))
            .maybeSingle();
          if (!error && data?.report_doc_defaults) {
            allDefaults.push(...data.report_doc_defaults);
          }
        }

        // Deduplicate by documentId and filter visible
        const uniqueDefaults = Array.from(
          new Map(allDefaults
            .filter((d: any) => d.isVisible !== false)
            .map((d: any) => [d.documentId, d]))
            .values()
        ).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

        setReportDocDefaults(uniqueDefaults);
      } catch (err) {
        console.error('Error fetching report doc defaults:', err);
        setReportDocDefaults([]);
      }
    };
    fetchReportDocDefaults();
  }, [activeDeptId, activeSubDeptIds, activeClassId, activeSubClassId, tasks]);

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

  // Resolves the same "effective" date a stage_info cell displays on screen (document
  // extraction date, completedAt fallback, or manual stage date via calculateStageDate),
  // plus overdue status. Must NOT be gated on whether the report has "Docs" fields
  // configured for the stage — otherwise calculateStageDate never sees a linkedDocument
  // and falls back to stageData.date verbatim, which is sometimes garbage (e.g. literally
  // "completed", written by a bug elsewhere in stage submission). Shared by the cell
  // renderer, the sort comparator, the export, and the total-time columns.
  const computeStageDateInfo = useCallback((task: any, stage: any, col: any) => {
    const stageData = task.stages?.[col.stageId];
    const isSkipped = stageData?.status === 'skipped';
    const isCompleted = stageData?.status === 'completed' || stageData?.documentsUploaded === true;

    let docsForStage: any[] = [];
    const sourceDocRef = task.source_document_id?.[col.stageId];
    if (sourceDocRef) {
      const docIds = Array.isArray(sourceDocRef) ? sourceDocRef : [sourceDocRef];
      docsForStage = docIds.map((d: any) => {
        const docId = typeof d === 'string' ? d : d?.id;
        return allDocuments.find((ad: any) => ad.id?.toString() === docId?.toString());
      }).filter(Boolean);
    }
    if (docsForStage.length === 0 && stageData?.documents) {
      // stageData.documents holds lightweight link stubs ({id, name, status, ...}), not the
      // full document row, so resolve each stub's id against allDocuments to get the record
      // that actually carries extracted_details (falling back to the stub if not found).
      const stubs = typeof stageData.documents === 'object' ? Object.values(stageData.documents) : [];
      docsForStage = stubs
        .map((stub: any) => allDocuments.find((ad: any) => ad.id?.toString() === stub?.id?.toString()) || stub)
        .filter(Boolean);
    }

    const linkedDocument = docsForStage.length > 0 ? docsForStage[0] : null;
    const documentFields = linkedDocument?.document_type_id ? (kycDocuments.get(linkedDocument.document_type_id)?.fields || []) : [];

    const dateValue = !isSkipped ? calculateStageDate(stage, stageData, linkedDocument, documentFields, null, false) : null;

    const immigrationDateField = col.fields?.find((f: any) => f.isImmigrationDate);
    let immigrationDateValue: string | null = null;
    if (immigrationDateField && docsForStage.length > 0) {
      for (const doc of docsForStage) {
        const val = doc.extracted_details?.[immigrationDateField.fieldName] ||
          doc.edited_details?.[immigrationDateField.fieldName] ||
          doc.extracted_data?.[immigrationDateField.fieldName];
        if (val && typeof val === 'string' && val.trim()) {
          immigrationDateValue = val.trim();
          break;
        }
      }
    }

    const effectiveDateValue = dateValue || immigrationDateValue;

    let isOverdue = false;
    if (effectiveDateValue && stage.estimated_time) {
      const sortedStagesList = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      const currentStageIndex = sortedStagesList.findIndex(s => s.id === stage.id);

      let prevStage = currentStageIndex > 0 ? sortedStagesList[currentStageIndex - 1] : null;
      let prevDateStr = null;

      while (prevStage) {
        prevDateStr = task.stages?.[prevStage.id]?.date || task.stages?.[prevStage.id]?.completedAt || task.stages?.[prevStage.id]?.date_completed;
        if (prevDateStr) break;
        const prevIndex = sortedStagesList.findIndex(s => s.id === prevStage.id);
        if (prevIndex <= 0) break;
        prevStage = sortedStagesList[prevIndex - 1];
      }

      const startStr = prevDateStr || task.date_initiated || task.created_at;
      const start = parseDateSafe(startStr);
      const end = parseDateSafe(effectiveDateValue);

      if (start && end) {
        const durationMs = end.getTime() - start.getTime();
        const durationMinutes = Math.floor(durationMs / (1000 * 60));
        isOverdue = durationMinutes > stage.estimated_time;
      }
    }

    const isPending = !isCompleted && !isSkipped;

    return { stageData, isSkipped, isCompleted, isPending, docsForStage, linkedDocument, documentFields, dateValue, immigrationDateValue, effectiveDateValue, isOverdue };
  }, [stages, allDocuments, kycDocuments]);

  const getSortableValue = useCallback((task: any, col: any) => {
    if (!col) return '';
    if (col.type === 'task') return getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
    if (col.type === 'stage_info' && col.hasDate) {
      // Sort by the same resolved date the cell displays, not the raw stageData.date —
      // that field is sometimes bogus (e.g. literally "completed"), which used to sort
      // those rows as if their date were epoch 0 instead of their real, later date.
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return 0;
      const { dateValue } = computeStageDateInfo(task, stage, col);
      return dateValue ? (parseDateSafe(dateValue)?.getTime() || 0) : 0;
    }
    return '';
  }, [departments, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, stages, computeStageDateInfo]);

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

    const stageInfoCols: any[] = [];
    sortedStages.forEach((stage) => {
      const config = activeReport.configuration.stages[stage.id];
      const requiresUpload = !!(stage.documents && stage.documents.length > 0);

      const hasDate = !!config.isStageDateSelected;
      const hasOfficer = stage.follow_up?.toLowerCase() === 'officer';
      const allFields: { kycId: string; fieldId: string; fieldName: string; isImmigrationDate: boolean }[] = [];

      if (config.documents && Object.keys(config.documents).length > 0) {
        Object.entries(config.documents).forEach(([kycId, docConfig]) => {
          const kycDoc = kycDocuments.get(kycId);
          if (!kycDoc) return;
          (docConfig as any).fields?.forEach((field: any) => {
            const fieldInfo = kycDoc.fields?.find((f: any) => f.id === field.id);
            if (!fieldInfo) return;
            allFields.push({ kycId, fieldId: field.id, fieldName: fieldInfo.fieldName || field.id, isImmigrationDate: !!fieldInfo.isImmigrationDate });
          });
        });
      }

      if (hasDate || hasOfficer || allFields.length > 0 || requiresUpload) {
        stageInfoCols.push({
          id: `stage_${stage.id}_info`,
          label: stage.name,
          type: 'stage_info',
          stageId: stage.id,
          stageName: stage.name,
          hasDate,
          hasOfficer,
          requiresUpload,
          fields: allFields,
        });
      }
    });

    if (stageInfoCols.length > 0) {
      cols.push({ id: '__expected_total_time__', label: 'Expected Time', type: 'total_time_expected', relatedCols: stageInfoCols });
      cols.push({ id: '__actual_total_time__', label: 'Actual Time Taken', type: 'total_time_actual', relatedCols: stageInfoCols });
    }

    cols.push(...stageInfoCols);

    // Add Report Doc columns
    if (reportDocDefaults && reportDocDefaults.length > 0) {
      reportDocDefaults.forEach(doc => {
        cols.push({ id: `report-doc-${doc.documentId || doc.id}`, type: 'report_doc', reportDoc: doc, label: doc.documentName });
      });
    }

    return cols;
  }, [activeReport, stages, isStageApplicableToCurrentFilter, expandedStageColumns, showDocRequirementsColumns, tasks, reportDocDefaults]);

  useEffect(() => {
    if (columns.length > 0) setVisibleColumnIds(prev => Array.from(new Set([...prev, ...columns.map(c => c.id)])));
  }, [columns]);

  const filteredColumns = useMemo(() => columns.filter(c => visibleColumnIds.includes(c.id)), [columns, visibleColumnIds]);

  const renderCellValue = useCallback((task: any, col: any) => {
    if (col.type === 'task') {
      const val = getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);

      const isEmpty = !val || val === 'N/A' || val === '—' || val === 'null';
      if (isEmpty) {
        return (
          <span className="text-sm font-bold text-rose-600 uppercase tracking-tight">
            MISSING
          </span>
        );
      }

      return getCellContent(
        departments, task, col.field, enhancedTasksData, taskDependants,
        new Set(), companies, getTaskHierarchy, getStaffName,
        getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
        (t: any) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { }),
        (t: any) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper),
        () => { }, () => { }, () => { },
        unifiedOfficers, stages
      );
    }

    if (col.type === 'stage_info') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-sm text-slate-400">—</span>;

      if (!checkStageApplicableForTask(stage, task)) {
        return {
          isCombinedStageDetails: true,
          isApplicable: false,
        };
      }

      let officerNode: React.ReactNode = null;
      let docNode: React.ReactNode = null;
      let docIsPending = false;

      const {
        stageData, isSkipped, isCompleted, isPending, docsForStage,
        dateValue, immigrationDateValue, isOverdue,
      } = computeStageDateInfo(task, stage, col);

      const stageDateRawProps = {
        dateValue,
        isCompleted,
        isPending,
        isOverdue,
        requiresUpload: col.requiresUpload,
        taskId: task.id,
        stageId: col.stageId,
        subdeptId: task.job_level?.subdepartment_id || task.subdepartment_id || '',
        deptId: task.job_level?.department_id || task.department_id || activeDeptId || '',
        isSkipped,
        skipReason: stageData?.reason || stageData?.skip_reason || '',
      };

      // --- 3. Officer Rendering ---
      if (col.hasOfficer) {
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

      // --- 4. Docs Rendering (value-only, no field names) ---
      if (col.fields && col.fields.length > 0) {
        if (docsForStage.length === 0) {
          docIsPending = !!col.requiresUpload;
          docNode = <span className="text-xs text-gray-400 italic">—</span>;
        } else {
          const fieldValues: { value: any }[] = [];
          const seenFieldNames = new Set<string>();
          for (const f of col.fields) {
            let matchedDoc = docsForStage.find(d =>
              d.document_id === f.kycId ||
              d.document_type_id === f.kycId ||
              d.kyc_document_id === f.kycId
            );

            if (!matchedDoc) {
              matchedDoc = docsForStage.find(d =>
                (d.extracted_details && d.extracted_details[f.fieldName] !== undefined) ||
                (d.edited_details && d.edited_details[f.fieldName] !== undefined) ||
                (d.extracted_data && d.extracted_data[f.fieldName] !== undefined)
              );
            }

            if (matchedDoc) {
              const val = matchedDoc.extracted_details?.[f.fieldName] ||
                matchedDoc.edited_details?.[f.fieldName] ||
                matchedDoc.extracted_data?.[f.fieldName];
              if (val !== null && val !== undefined && val !== '') {
                if (!seenFieldNames.has(f.fieldName)) {
                  seenFieldNames.add(f.fieldName);
                  fieldValues.push({ value: val });
                }
              }
            }
          }

          if (fieldValues.length === 0) {
            docNode = <span className="text-xs text-gray-400 italic">—</span>;
          } else {
            docNode = (
              <div className="flex flex-col gap-0.5">
                {fieldValues.map((fv, i) => (
                  <div key={i} className="text-[11px] text-slate-700 leading-tight">
                    <span className="font-medium">{String(fv.value)}</span>
                  </div>
                ))}
              </div>
            );
          }
        }
      }

      return {
        isCombinedStageDetails: true,
        hasDate: col.hasDate,
        hasOfficer: col.hasOfficer,
        hasDocs: col.fields && col.fields.length > 0,
        docIsPending,
        isPending,
        stageDateRawProps,
        docNode,
        docIsOverdue: immigrationDateValue ? isOverdue : false,
        docDateValue: immigrationDateValue,
        docStageName: stage.name,
        docEstimatedTime: stage.estimated_time || null,
        docIsCompleted: isCompleted,
        officerNode
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

    if (col.type === 'total_time_expected') {
      let totalMinutes = 0;
      (col.relatedCols || []).forEach((c: any) => {
        const stage = stages.find(s => s.id === c.stageId);
        if (stage?.estimated_time && checkStageApplicableForTask(stage, task)) totalMinutes += stage.estimated_time;
      });
      return totalMinutes > 0 ? formatEstimatedMins(totalMinutes) : 'N/A';
    }

    if (col.type === 'total_time_actual') {
      const dates: Date[] = [];
      (col.relatedCols || []).filter((c: any) => c.hasDate).forEach((c: any) => {
        const stage = stages.find(s => s.id === c.stageId);
        if (!stage || !checkStageApplicableForTask(stage, task)) return;
        const info = computeStageDateInfo(task, stage, c);
        if (info.isSkipped || !info.effectiveDateValue) return;
        const d = parseDateSafe(formatDate(info.effectiveDateValue, false));
        if (d) dates.push(d);
      });
      if (dates.length === 0) return 'N/A';
      const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
      const latest = new Date(Math.max(...dates.map(d => d.getTime())));
      const diffDays = differenceInDays(latest, earliest);
      return `${diffDays}d`;
    }

   if (col.type === 'report_doc') {
      const docDef = col.reportDoc;

      let entityType = 'principal';
      let entityId = null;
      if (docDef.docType === 'company') {
        entityType = 'company';
        entityId = task.company_id || task.applicant_details?.id;
      } else {
        entityId = task.individual_id || task.applicant_details?.id;
      }

      const snapshot = [
        ...(task.processing_requirements_documents || []),
        ...(task.issuance_requirements_documents || [])
      ];
      const entry = snapshot.find((s: any) =>
        s.documentTypeId === docDef.documentId &&
        s.entityType === entityType &&
        Number(s.entityId) === Number(entityId)
      );

      let colRecords = [];
      if (entry) {
        const pool = entityType === 'company'
          ? (allCompanyDocuments[entityId] || [])
          : (allIndividualDocuments[entityId] || []);
        colRecords = pool.filter((d: any) => (entry.documentRecordIds || []).includes(d.id));
      } else {
        const pool = entityType === 'company'
          ? (allCompanyDocuments[entityId] || [])
          : (allIndividualDocuments[entityId] || []);
        colRecords = pool.filter((d: any) => d.document_id === docDef.documentId);
      }

      const hasFiles = colRecords.length > 0;

      let immigrationDateValue = null;
      if (hasFiles) {
        const docRecord = colRecords[0];
        const kycData = kycDocuments.get(docDef.documentId);
        if (kycData?.fields) {
          const immigrationField = kycData.fields.find((f: any) => f.isImmigrationDate);
          if (immigrationField) {
            const fieldName = immigrationField.fieldName || immigrationField.name || immigrationField.id;
            immigrationDateValue = docRecord.extracted_details?.[fieldName] ||
                                   docRecord.extracted_data?.[fieldName] ||
                                   docRecord.edited_details?.[fieldName];
          }
        }
      }

      if (hasFiles) {
        return (
          <div className="flex flex-col items-center justify-center gap-1 w-full">
            {immigrationDateValue && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-200/60 truncate max-w-full">
                {formatDateValue(immigrationDateValue)}
              </span>
            )}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-default select-none group/cell">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-medium text-slate-700 truncate max-w-[120px]">
                      Uploaded
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 text-white text-xs z-[9999]">
                  {colRecords[0]?.file_name || 'Document Uploaded'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center gap-1 w-full h-full">
          <div className="flex items-center gap-1.5 text-slate-400">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
            <span className="text-xs font-medium italic">Pending</span>
          </div>
        </div>
      );
    }

    return <span className="text-sm text-gray-400">—</span>;
  }, [
    stages, departments, kycDocuments, companies, enhancedTasksData, taskDependants,
    showTime, activeDeptId, unifiedOfficers, allDocuments,
    allIndividualDocuments, allCompanyDocuments, computeStageDateInfo // Ensure these were added to dependencies!
  ]);

  const handleSaveStageDate = useCallback(async (taskId: string, stageId: string, date: string) => {
    try {
      const { data: currentTask, error: fetchError } = await supabase
        .from('tm_tasks')
        .select('stages')
        .eq('id', taskId)
        .single();
      if (fetchError) throw fetchError;

      const existingStages = currentTask?.stages || {};
      const timestamp = new Date().toISOString();
      const updatedStages = {
        ...existingStages,
        [stageId]: {
          ...existingStages[stageId],
          date,
          status: 'completed',
          completedAt: timestamp,
          updatedAt: timestamp,
        },
      };

      const { error: updateError } = await supabase
        .from('tm_tasks')
        .update({ stages: updatedStages, updated_at: timestamp })
        .eq('id', taskId);
      if (updateError) throw updateError;

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stages: updatedStages } : t));
      toast({ title: 'Saved', description: 'Stage date updated successfully.' });
    } catch (err) {
      console.error('Failed to save stage date:', err);
      toast({ title: 'Error', description: 'Failed to save stage date.', variant: 'destructive' });
    }
  }, []);

  const getExportCellValue = useCallback((task: any, col: any, exportOpts: { showTime?: boolean } = {}): string => {
    if (col.type === 'export_delta') {
      const getResolvedDate = (c: any): Date | null => {
        const val = renderCellValue(task, c);
        const dateValue = val?.isCombinedStageDetails ? (val.stageDateRawProps?.dateValue || val.docDateValue) : null;
        return dateValue ? parseDateSafe(formatDate(dateValue, false)) : null;
      };
      const nextDate = getResolvedDate(col.nextCol);
      if (!nextDate) return '';
      // Mirror the on-screen Δ: only look for a start point once the arrival stage has
      // actually happened, reaching back past any pending/skipped predecessor to the
      // nearest stage that does have a date instead of dropping the gap entirely.
      let prevDate: Date | null = null;
      for (let i = (col.priorCols?.length || 0) - 1; i >= 0; i--) {
        const d = getResolvedDate(col.priorCols[i]);
        if (d) { prevDate = d; break; }
      }
      if (!prevDate) return '';
      const diff = differenceInDays(nextDate, prevDate);
      return diff >= 0 ? `+${diff}d` : `${diff}d`;
    }
    if (col.type === 'total_time_expected' || col.type === 'total_time_actual') {
      const val = renderCellValue(task, col);
      return typeof val === 'string' ? val : '';
    }
    if (col.type === 'task') {
      const val = getRawCellValue(departments, task, col.field, enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper);
      const isEmpty = val === null || val === undefined || val === '' || val === 'N/A' || val === '—' || val === 'null' || val === 'undefined';
      return isEmpty ? 'Missing' : String(val ?? '');
    }
    if (col.type === 'stage_info') {
      const stage = stages.find(s => s.id === col.stageId);
      if (stage && !checkStageApplicableForTask(stage, task)) return 'N/A';

      const stageData = task.stages?.[col.stageId];
      const parts: string[] = [];

      const { docsForStage, dateValue } = computeStageDateInfo(task, stage, col);

      if (col.hasDate) {
        parts.push(`Date: ${dateValue ? formatDate(dateValue, !!exportOpts.showTime) : 'Pending'}`);
      }

      if (col.fields && col.fields.length > 0) {
        if (docsForStage.length > 0) {
          const docParts: string[] = [];
          const seenFieldNames = new Set<string>();
          for (const f of col.fields) {
            let matchedDoc = docsForStage.find(d =>
              d.document_id === f.kycId ||
              d.document_type_id === f.kycId ||
              d.kyc_document_id === f.kycId
            );

            if (!matchedDoc) {
              matchedDoc = docsForStage.find(d =>
                (d.extracted_details && d.extracted_details[f.fieldName] !== undefined) ||
                (d.edited_details && d.edited_details[f.fieldName] !== undefined) ||
                (d.extracted_data && d.extracted_data[f.fieldName] !== undefined)
              );
            }

            if (matchedDoc) {
              const val = matchedDoc.extracted_details?.[f.fieldName] ||
                matchedDoc.edited_details?.[f.fieldName] ||
                matchedDoc.extracted_data?.[f.fieldName];
              if (val !== null && val !== undefined && val !== '') {
                if (!seenFieldNames.has(f.fieldName)) {
                  seenFieldNames.add(f.fieldName);
                  docParts.push(String(val));
                }
              }
            }
          }
          if (docParts.length > 0) parts.push(`Docs: ${docParts.join(', ')}`);
        }
      }

      // Officer string
      if (col.hasOfficer) {
        const officerIds = Array.isArray(stageData?.officer_ids) ? stageData.officer_ids.map(String).filter(Boolean) : [];
        if (officerIds.length) {
          const officerNames = officerIds.map(id => {
            const o = unifiedOfficers.find((u: any) => u.id.toString() === id.toString());
            return o ? getOfficerDisplayName(o) : 'Unknown';
          }).join(', ');
          parts.push(`Officers: ${officerNames}`);
        }
      }

      return parts.join(' | ');
    }
    if (col.type === 'reference_requirement') {
      const referenceDocs = task.referenceDocuments?.[col.requirementId] || [];
      if (referenceDocs.length === 0) return 'No documents';
      const latestDoc = referenceDocs.reduce((p: any, c: any) => new Date(c.created_at) > new Date(p.created_at) ? c : p);
      const docId = latestDoc.document_id || latestDoc.kyc_document_id;
      const effectiveToField = kycDocuments.get(docId)?.fields?.find((f: any) => f.isEffectiveTo);
      const isEffectiveTo = effectiveToField
        ? (latestDoc.extracted_details?.[effectiveToField.fieldName] || latestDoc.edited_details?.[effectiveToField.fieldName])
        : (latestDoc.extracted_details?.isEffectiveTo || latestDoc.edited_details?.isEffectiveTo);
      return isEffectiveTo ? String(isEffectiveTo) : '-';
    }
    if (col.type === 'report_doc') {
      // Mirror the on-screen resolution in renderCellValue: resolve the correct
      // entity (individual/company) rather than looking documents up by task id.
      const docDef = col.reportDoc;

      let entityType = 'principal';
      let entityId: any = null;
      if (docDef.docType === 'company') {
        entityType = 'company';
        entityId = task.company_id || task.applicant_details?.id;
      } else {
        entityId = task.individual_id || task.applicant_details?.id;
      }

      const snapshot = [
        ...(task.processing_requirements_documents || []),
        ...(task.issuance_requirements_documents || [])
      ];
      const entry = snapshot.find((s: any) =>
        s.documentTypeId === docDef.documentId &&
        s.entityType === entityType &&
        Number(s.entityId) === Number(entityId)
      );

      let colRecords: any[] = [];
      if (entry) {
        const pool = entityType === 'company' ? (allCompanyDocuments[entityId] || []) : (allIndividualDocuments[entityId] || []);
        colRecords = pool.filter((d: any) => (entry.documentRecordIds || []).includes(d.id));
      } else {
        const pool = entityType === 'company' ? (allCompanyDocuments[entityId] || []) : (allIndividualDocuments[entityId] || []);
        colRecords = pool.filter((d: any) => d.document_id === docDef.documentId);
      }

      if (colRecords.length === 0) return 'Pending';

      const docRecord = colRecords[0];
      let dateString = '';
      const kycData = kycDocuments.get(docDef.documentId?.toString());
      if (kycData?.fields) {
        const immigrationField = kycData.fields.find((f: any) => f.isImmigrationDate);
        if (immigrationField) {
          const fieldName = immigrationField.fieldName || immigrationField.name || immigrationField.id;
          const dateVal = docRecord.extracted_details?.[fieldName] ||
                          docRecord.extracted_data?.[fieldName] ||
                          docRecord.edited_details?.[fieldName];
          if (dateVal) {
            dateString = formatDate(dateVal, !!exportOpts.showTime) || String(dateVal);
          }
        }
      }

      return dateString ? `Uploaded (${dateString})` : 'Uploaded';
    }

    return '';
  }, [
    departments, stages, enhancedTasksData, companies, getStaffName,
    getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
    unifiedOfficers, allDocuments, kycDocuments, renderCellValue, computeStageDateInfo,
    allIndividualDocuments, allCompanyDocuments // Ensure these were added to dependencies!
  ]);

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

  const handleSendReport = useCallback(async (reportType: 'officer' | 'manager' | 'client', exportFormat: 'excel' | 'pdf', exportOptions: { includeDelta?: boolean; includeTime?: boolean } = {}) => {
    const { includeDelta = false, includeTime = false } = exportOptions;
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

    const exportCols = includeDelta
      ? (() => {
          const acc: any[] = [];
          const priorStageCols: any[] = [];
          filteredColumns.forEach((col: any, i: number) => {
            acc.push(col);
            if (col.type === 'stage_info') priorStageCols.push(col);
            const next = filteredColumns[i + 1];
            if (col.type === 'stage_info' && next?.type === 'stage_info') {
              acc.push({ id: `__export_delta__${i}`, type: 'export_delta', label: 'Δ', prevCol: col, nextCol: next, priorCols: [...priorStageCols] });
            }
          });
          return acc;
        })()
      : filteredColumns;
    const exportCellOpts = { showTime: includeTime };
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
          const dRow = ws.addRow([idx + 1, ...exportCols.map(col => getExportCellValue(task, col, exportCellOpts))]);
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

      const pdfCols = exportCols.length > 0 ? exportCols : [];

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
        if (type === 'current_stage_age' || type === 'total_process_age' || type === 'export_delta' || type === 'total_time_expected' || type === 'total_time_actual') return 'duration';
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

      // Wide landscape: fit ~12 columns per chunk. Kept lower than before so each column
      // gets enough room that wrapped (not truncated) text stays readable rather than
      // ballooning row height across dozens of near-empty slivers.
      const CHUNK = 12;
      const colChunks: any[][] = [];
      for (let i = 0; i < pdfCols.length; i += CHUNK) {
        colChunks.push(pdfCols.slice(i, i + CHUNK));
      }
      if (colChunks.length === 0) colChunks.push([]);

      // Columns don't all need the same width: a Δ cell is 2-4 chars, a combined stage
      // cell ("Date: ... | Docs: ... | Officers: ...") can run long, and name/company task
      // columns are usually the longest. Give each a relative weight and split whatever
      // page width remains (after the fixed index column) proportionally.
      const INDEX_COL_PDF_WIDTH = 7;
      const getPdfColWeight = (col: any): number => {
        if (!col) return 1;
        if (col.type === 'export_delta') return 0.55;
        if (col.type === 'total_time_expected' || col.type === 'total_time_actual') return 0.85;
        if (col.type === 'stage_info') return 1.7;
        if (col.type === 'report_doc' || col.type === 'reference_requirement') return 1;
        if (col.type === 'task') {
          const id = `${col.field || ''} ${col.label || ''}`.toLowerCase();
          return /name|company|address|remarks|comment/.test(id) ? 1.6 : 1;
        }
        return 1;
      };

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
              const v = getExportCellValue(task, col, exportCellOpts);
              return v || '—';
            })
          ]);

          const availableWidth = (pageW - 16) - INDEX_COL_PDF_WIDTH;
          const weights = chunk.map(getPdfColWeight);
          const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
          const columnStyles: Record<number, any> = { 0: { halign: 'center', cellWidth: INDEX_COL_PDF_WIDTH } };
          chunk.forEach((_col: any, idx: number) => {
            columnStyles[idx + 1] = { cellWidth: Math.max(10, (availableWidth * weights[idx]) / totalWeight) };
          });

          autoTable(doc, {
            startY,
            head: [headers],
            body: rows,
            styles: {
              fontSize: 6.5,
              cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
              overflow: 'linebreak',
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
            columnStyles,
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

  const transposedRows = useMemo(() => {
    if (!filteredByNARows.length) return [];
    const rows = [];

    // 1. Task Details Section
    rows.push({ id: 'task_details', type: 'section_header', label: 'Task Details', icon: Briefcase });
    const taskFields = activeReport?.configuration?.taskFields || [];
    taskFields.forEach((f: any) => {
      rows.push({
        id: `task_${f.id}`,
        type: 'task',
        field: f.id,
        label: ENHANCED_TABLE_HEADERS_IMMIGRATION.find(h => h.id === f.id)?.label || f.id.replace(/_/g, ' ').toUpperCase()
      });
    });

    // 2. Stages Section
    rows.push({ id: 'stages', type: 'section_header', label: 'Stages', icon: Layers });
    const activeStageIds = Object.keys(activeReport?.configuration?.stages || {});
    const sortedStages = stages.filter(s => activeStageIds.includes(s.id) && isStageApplicableToCurrentFilter(s.id)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    sortedStages.forEach((stage, idx) => {
      rows.push({
        id: `stage_${stage.id}`,
        type: 'stage_info',
        stageId: stage.id,
        label: stage.name,
        stageOrder: idx + 1,
        sectionId: 'stages',
        requiresUpload: !!(stage.documents && stage.documents.length > 0),
        fields: []
      });
    });

    // 3. Report Documents Section
    if (reportDocDefaults && reportDocDefaults.length > 0) {
      rows.push({ id: 'report_docs', type: 'section_header', label: `Report Documents (${reportDocDefaults.length})`, icon: FileText });
      reportDocDefaults.forEach((doc, idx) => {
        rows.push({
          id: `report_doc_${doc.documentId || doc.id}`,
          type: 'report_doc',
          reportDoc: doc,
          label: doc.documentName || 'Document',
          stageOrder: idx + 1,
          sectionId: 'report_docs'
        });
      });
    }
    return rows;
  }, [filteredByNARows, activeReport, stages, isStageApplicableToCurrentFilter, reportDocDefaults]);

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
          showNARows={showNARows} setShowNARows={setShowNARows}
        />
        <PersonFilterStrip
          activePerspective={activePerspective} setActivePerspective={setActivePerspective} allTasksCount={allTasksCount}
          officerTaskCounts={officerTaskCounts} taskManagerTaskCounts={taskManagerTaskCounts} clientTaskCounts={{}} availableOfficers={availableOfficers}
          activeOfficerTab={activeOfficerTab} setActiveOfficerTab={setActiveOfficerTab} officerFilterMode={officerFilterMode} setOfficerFilterMode={setOfficerFilterMode}
          availableTaskManagers={availableTaskManagers} activeTaskManagerTab={activeTaskManagerTab} setActiveTaskManagerTab={setActiveTaskManagerTab}
          taskManagerFilterMode={taskManagerFilterMode} setTaskManagerFilterMode={setTaskManagerFilterMode}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} refreshData={handleManualRefresh} loading={isManualRefreshing}
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
          ) : (
            <>
              {/* Mobile: card-per-task layout - a wide table (of either kind) doesn't work on a phone */}
              <div className="h-full md:hidden">
                <MobileReportView
                  allTasks={filteredByNARows} filteredColumns={filteredColumns}
                  renderCellValue={renderCellValue} safeRender={safeRender}
                  showTime={showTime} showOfficers={showOfficers} activeDeptId={activeDeptId}
                  onSaveStageDate={handleSaveStageDate}
                />
              </div>

              {/* Desktop/tablet: existing wide table views */}
              <div className="hidden md:block h-full">
                {view === 'standard' ? (
                  <StandardReportView
                    allTasks={filteredByNARows} filteredColumns={filteredColumns} sortConfig={sortConfig}
                    expandedStageColumns={expandedStageColumns} renderCellValue={renderCellValue} safeRender={safeRender}
                    handleSort={handleSort} toggleStageColumns={toggleStageColumns} isStageApplicableToCurrentFilter={isStageApplicableToCurrentFilter}
                    departments={departments} stages={stages} showTime={showTime} showDelta={showDelta} showOfficers={showOfficers} activeDeptId={activeDeptId}
                    onSaveStageDate={handleSaveStageDate} reportDocDefaults={reportDocDefaults}
                  />
                ) : (
                  <TransposedReportView
                    paginatedTasks={filteredByNARows} transposedRows={[]} currentPage={1} itemsPerPage={filteredByNARows.length}
                    expandedSections={expandedSections} renderCellValue={renderCellValue} toggleSection={() => { }}
                    userData={{ officers: unifiedOfficers, managers: unifiedManagers, assistants: unifiedAssistants, allUsers: [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants] }}
                    departments={departments} reportDocDefaults={reportDocDefaults}
                  />
                )}
              </div>
            </>
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