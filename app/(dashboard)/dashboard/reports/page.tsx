// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, LayoutGrid, Plus, Minus, Briefcase, FileDown, ChevronDown, FileText, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Clock, ArrowUpDown, Search, Timer, AlertCircle, CheckCircle2, Clock3, User, EyeOff, Eye, Filter, RotateCcw, X, TableProperties, Download, ArrowRight, Send, Shield, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parse, isValid } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver'
import { getCurrentStageStatus, getCellContent, getEnhancedImmigrationStatus, renderImmigrationStatusCell, renderCurrentStageStatusCell, ENHANCED_TABLE_HEADERS_IMMIGRATION, enhanceTasksWithIndividualData, getRawCellValue, getTimeStatus, formatDuration } from "../tasks/overall-view/tableUtils";
import { parseDate } from "@/app/generic-functions/dateUtils";
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields } from "../tasks/utils/taskManagerData";
import { getOfficerDisplayName } from "@/lib/shared-user-assignment-service";
import { fetchDepartments } from "../departments/departments/database";
import { userService } from "@/lib/shared-user-assignment-service";
import { MemorizedReportDialog } from "./MemorizedReportDialog";
import { calculateStageDate, findDateInObject } from "../tasks/utils/dateUtils";
import { cn } from "@/lib/utils";
import { StandardReportView } from "./components/StandardReportView";
import { TransposedReportView } from "./components/TransposedReportView";
import { ReportColumnVisibilityDialog } from "./components/ReportColumnVisibilityDialog";
import { ReportsSidebar, ReportsHeader, PersonFilterStrip, StatusFilterBar } from "./components/ReportsHeader";

const SPECIAL_STAGE_IDS = [
  '072b9710-45df-4a05-ba65-01b4ef29d61d',
  'caefd742-5de5-4341-a3bb-81d7b9dd2b73'
];

const COLUMN_WIDTH_CLASS = "w-[180px] min-w-[180px] max-w-[180px]";
const INDEX_WIDTH_CLASS = "w-[50px] min-w-[50px] max-w-[50px]";

const formatDateForDisplay = (date: any): string => {
  if (!date) return '-';
  if (typeof date === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;
  const d = parseDate(date);
  if (!d) return '-';
  try { return format(d, 'dd/MM/yyyy'); } catch { return '-'; }
};

const formatDateTimeForDisplay = (date: any): string => {
  if (!date) return '-';
  if (typeof date === 'string') {
    const t = date.trim();
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(t)) return t.endsWith(' 00:00') ? t.slice(0, -6) : t;
  }
  const d = parseDate(date);
  if (!d) return '-';
  try {
    const formatted = format(d, 'dd/MM/yyyy HH:mm');
    return formatted.endsWith(' 00:00') ? formatted.slice(0, -6) : formatted;
  } catch { return '-'; }
};

const getElapsedMinutes = (from: Date | null, to: Date = new Date()): number | null => {
  if (!from || Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000));
};

const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string') {
    if (content === 'N/A') return <span className="text-red-500">Missing</span>;
    return content;
  }
  if (typeof content === 'number') return content;
    if (content === null || content === undefined) return <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">—</span>;
  if (Array.isArray(content)) return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  if (typeof content === 'object') {
    if ('status' in content) {
      const s = content.status;
      if (typeof s === 'string' || typeof s === 'number') {
        if (s === 'N/A') return <span className="text-red-500">Missing</span>;
        return s;
      }
      if (React.isValidElement(s)) return s;
      if (!s) return null;
      return JSON.stringify(s);
    }
    return <span className="text-sm text-gray-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
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
  const [areJobLevelTabsVisible, setAreJobLevelTabsVisible] = useState(true);
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
  const [allOfficers, setAllOfficers] = useState<any[]>([]);
  const [availableOfficers, setAvailableOfficers] = useState<any[]>([]);
  const [isOfficerDropdownOpen, setIsOfficerDropdownOpen] = useState(false);
  const [selectedTaskManagers, setSelectedTaskManagers] = useState<string[]>([]);
  const [activeTaskManagerTab, setActiveTaskManagerTab] = useState<string>("all");
  const [taskManagerFilterMode, setTaskManagerFilterMode] = useState<'current' | 'history'>('current');
  const [availableTaskManagers, setAvailableTaskManagers] = useState<any[]>([]);
  const [isTaskManagerDropdownOpen, setIsTaskManagerDropdownOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [activeClientTab, setActiveClientTab] = useState<string>("all");
  const [clientFilterMode, setClientFilterMode] = useState<'current' | 'history'>('current');
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [selectedBCLs, setSelectedBCLs] = useState<string[]>([]);
  const [activeBCLTab, setActiveBCLTab] = useState<string>("all");
  const [bclFilterMode, setBCLFilterMode] = useState<'current' | 'history'>('current');
  const [availableBCLs, setAvailableBCLs] = useState<any[]>([]);
  const [isBCLDropdownOpen, setIsBCLDropdownOpen] = useState(false);
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
  const [showTimeTrackingColumns, setShowTimeTrackingColumns] = useState(false);
  const [showDocRequirementsColumns, setShowDocRequirementsColumns] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const [expandedStageColumns, setExpandedStageColumns] = useState<Set<string>>(new Set());
  const [activePerspective, setActivePerspective] = useState<'overview' | 'officers' | 'managers' | 'clients' | 'companies'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarPanelRef = useRef<any>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [showDefaultDisplayOnly, setShowDefaultDisplayOnly] = useState(false);

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
    if (userIdStr.length > 20) {
      return `Unknown (${userIdStr.substring(0, 8)}...)`;
    }

    return userIdStr;
  }, [tmUsers, unifiedOfficers, unifiedManagers, unifiedAssistants]);

  const sidebarDepartments = useMemo(() => departments.map(dept => ({
    id: dept.id.toString(),
    name: dept.name,
    description: dept.description,
    default_display: dept.default_display,
    order: dept.order_num || dept.order,
    subdepartments: (dept.tm_subdepartments || []).map((sub: any) => ({
      id: sub.id.toString(),
      name: sub.name,
      description: sub.description,
      default_display: sub.default_display,
      order: sub.order_num || sub.order,
      classes: (sub.classes || []).map((cls: any) => ({
        id: cls.id.toString(),
        name: cls.name,
        description: cls.description,
        default_display: cls.default_display,
        order: cls.order_num || cls.order,
        subClasses: (cls.subClasses || []).map((sc: any) => ({
          id: sc.id.toString(),
          name: sc.name,
          description: sc.description,
          default_display: sc.default_display,
          order: sc.order_num || sc.order,
        }))
      }))
    }))
  })), [departments]);

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

      if (silent) {
        toast({ title: "Updated", description: "Report data refreshed.", duration: 2000 });
      }
    } catch (error) {
      console.error("Error loading report data", error);
      toast({ title: "Error", description: "Failed to load report data.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
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
      activeSubDeptIds.length === 1 ? activeSubDeptIds[0] : undefined
    );

    const allowedIds = new Set(departmentUsers.officers.map(o => o.id));

    const final = unifiedOfficers.filter(o => allowedIds.has(o.id));
    setAvailableOfficers(final);
    setSelectedOfficers(prev => prev.filter(id => final.some(o => o.id === id)));
    setActiveOfficerTab(prev => (prev === 'all' || final.some(o => o.id === prev) ? prev : 'all'));
  }, [activeDeptId, activeSubDeptIds, unifiedOfficers, activeSubDepartments]);

  useEffect(() => {
    if (!activeDeptId) {
      setAvailableManagers([]);
      setSelectedManagers([]);
      return;
    }

    const departmentUsers = userService.getDepartmentUsers(
      [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants],
      activeDeptId,
      activeSubDeptIds.length === 1 ? activeSubDeptIds[0] : undefined
    );

    const allowedIds = new Set(departmentUsers.managers.map(m => m.id));

    const final = unifiedManagers.filter(m => allowedIds.has(m.id));
    setAvailableManagers(final);
    setSelectedManagers(prev => prev.filter(id => final.some(m => m.id === id)));
  }, [activeDeptId, activeSubDeptIds, unifiedManagers, activeSubDepartments]);

  useEffect(() => {
    if (!activeDeptId) {
      setAvailableAssistants([]);
      setSelectedAssistants([]);
      return;
    }

    const departmentUsers = userService.getDepartmentUsers(
      [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants],
      activeDeptId,
      activeSubDeptIds.length === 1 ? activeSubDeptIds[0] : undefined
    );

    const allowedIds = new Set(departmentUsers.assistants.map(a => a.id));

    const final = unifiedAssistants.filter(a => allowedIds.has(a.id));
    setAvailableAssistants(final);
    setSelectedAssistants(prev => prev.filter(id => final.some(a => a.id === id)));
  }, [activeDeptId, activeSubDeptIds, unifiedAssistants, activeSubDepartments]);

  // Populate availableTaskManagers (same as availableManagers)
  useEffect(() => {
    setAvailableTaskManagers(availableManagers);
    setSelectedTaskManagers(prev => prev.filter(id => availableManagers.some(m => m.id === id)));
    setActiveTaskManagerTab(prev => (prev === 'all' || availableManagers.some(m => m.id === prev) ? prev : 'all'));
  }, [availableManagers]);

  const getTaskCompanyParticipant = useCallback((task: any) => {
    return task.participants_details?.find((p: any) => {
      const role = p.role?.toString().toLowerCase() || '';
      const type = p.type?.toString().toLowerCase() || '';
      return type === 'company' || role.includes('sponsor') || role.includes('company');
    });
  }, []);

  // Populate availableClients (company participants for the By Company tab)
  useEffect(() => {
    const clientsMap = new Map<string, any>();
    tasks.forEach(task => {
      const company = getTaskCompanyParticipant(task);
      if (company && company.name) {
        const clientId = company.name;
        if (!clientsMap.has(clientId)) {
          clientsMap.set(clientId, {
            id: clientId,
            name: company.name,
            full_name: company.name,
            displayName: company.name
          });
        }
      }
    });
    setAvailableClients(Array.from(clientsMap.values()));
  }, [tasks, getTaskCompanyParticipant]);

  // Populate availableBCLs (same as availableAssistants)
  useEffect(() => {
    setAvailableBCLs(availableAssistants);
    setSelectedBCLs(prev => prev.filter(id => availableAssistants.some(a => a.id === id)));
    setActiveBCLTab(prev => (prev === 'all' || availableAssistants.some(a => a.id === prev) ? prev : 'all'));
  }, [availableAssistants]);

  const effectiveOfficerIds = useMemo(() => {
    const ids = new Set(selectedOfficers);
    if (activeOfficerTab !== 'all' && activeOfficerTab !== '__unallocated__') ids.add(activeOfficerTab);
    return Array.from(ids);
  }, [activeOfficerTab, selectedOfficers]);

  const effectiveTaskManagerIds = useMemo(() => {
    const ids = new Set(selectedTaskManagers);
    if (activeTaskManagerTab !== 'all' && activeTaskManagerTab !== '__unallocated__') ids.add(activeTaskManagerTab);
    return Array.from(ids);
  }, [activeTaskManagerTab, selectedTaskManagers]);

  const effectiveClientIds = useMemo(() => {
    const ids = new Set(selectedClients);
    if (activeClientTab !== 'all') ids.add(activeClientTab);
    return Array.from(ids);
  }, [activeClientTab, selectedClients]);

  const effectiveBCLIds = useMemo(() => {
    const ids = new Set(selectedBCLs);
    if (activeBCLTab !== 'all') ids.add(activeBCLTab);
    return Array.from(ids);
  }, [activeBCLTab, selectedBCLs]);

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

  const getCurrentOfficerStage = useCallback((task: any) => {
    const applicableStages = [...stages]
      .filter(stage => isStageApplicableToTask(stage, task, departments))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    return applicableStages.find(stage => {
      const stageData = task?.stages?.[stage.id];
      const status = stageData?.status?.toString().toLowerCase();
      return (
        stageData &&
        stage.follow_up?.toLowerCase() === 'officer' &&
        status !== 'completed' &&
        status !== 'skipped'
      );
    }) || null;
  }, [stages, departments]);

  const getStageOfficerIds = useCallback((task: any, mode: 'current' | 'history' = 'current') => {
    const normalizeIds = (ids: any) =>
      Array.isArray(ids) ? ids.map(id => id?.toString()).filter(Boolean) : [];

    if (mode === 'current') {
      const currentOfficerStage = getCurrentOfficerStage(task);
      return normalizeIds(currentOfficerStage ? task?.stages?.[currentOfficerStage.id]?.officer_ids : []);
    }

    const officerIds = new Set<string>();
    Object.values(task?.stages || {}).forEach((stageData: any) => {
      normalizeIds(stageData?.officer_ids).forEach(id => officerIds.add(id));
    });
    return Array.from(officerIds);
  }, [getCurrentOfficerStage]);

  const taskHasStageOfficer = useCallback((task: any, officerIds: string[], mode: 'current' | 'history') => {
    if (!officerIds.length) return true;
    const allocatedOfficerIds = getStageOfficerIds(task, mode);
    return allocatedOfficerIds.some(id => officerIds.includes(id));
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

      // Officer filtering — only when officers perspective is active
      if (activePerspective === 'officers') {
        if (activeOfficerTab === '__unallocated__') {
          if (getStageOfficerIds(task, 'current').length !== 0) return false;
        } else if (effectiveOfficerIds.length > 0) {
          if (!taskHasStageOfficer(task, effectiveOfficerIds, officerFilterMode)) return false;
        }
      }

      // Task Manager filtering — only when managers perspective is active
      if (activePerspective === 'managers') {
        const tracking = getCurrentStageTracking(task);
        if (activeTaskManagerTab === '__unallocated__') {
          if (!tracking || tracking.stage.follow_up !== 'BCL') return false;
          if (task.task_manager?.id) return false;
        } else if (effectiveTaskManagerIds.length > 0) {
          if (!tracking) return false;
          if (tracking.stage.follow_up !== 'BCL') return false;
          const taskManager = task.task_manager;
          if (!taskManager || !taskManager.id) return false;
          if (!effectiveTaskManagerIds.includes(taskManager.id.toString())) return false;
        }
      }

      // Client filtering means the current task stage is waiting on the client.
      if (activePerspective === 'clients' && !isTaskWithClient(task)) {
        return false;
      }

      // Company filtering uses company/sponsor participants.
      if (activePerspective === 'companies' && effectiveClientIds.length > 0) {
        const company = getTaskCompanyParticipant(task);
        if (!company || !company.name) return false;
        if (!effectiveClientIds.includes(company.name)) return false;
      }

      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptIds, activeClassId, activeSubClassId, activePerspective, activeOfficerTab, activeTaskManagerTab, effectiveOfficerIds, officerFilterMode, effectiveTaskManagerIds, taskManagerFilterMode, effectiveClientIds, clientFilterMode, stages, getCurrentStageTracking, taskHasStageOfficer, isTaskWithClient, getTaskCompanyParticipant, getStageOfficerIds]);

  // Dept/subdept/class filter only — used for stable status tab counts (unaffected by officer/TM/BCL tabs)
  const tasksByDeptFilter = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptIds.length > 0 && !activeSubDeptIds.includes(task.subdepartment_id?.toString())) return false;
      if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
      if (activeSubClassId !== 'all' && task.subclass_id?.toString() !== activeSubClassId) return false;
      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptIds, activeClassId, activeSubClassId]);

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

  // Count tasks per officer — respects officerFilterMode for per-officer badges; 'current' for unallocated
  const officerTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, __unallocated__: 0 };
    availableOfficers.forEach(officer => { counts[officer.id] = 0; });

    tasksByDeptFilter.forEach(task => {
      counts.all++;
      const modeIds = getStageOfficerIds(task, officerFilterMode);
      modeIds.forEach(id => { if (counts[id] !== undefined) counts[id]++; });
      if (getStageOfficerIds(task, 'current').length === 0) counts.__unallocated__++;
    });

    return counts;
  }, [tasksByDeptFilter, availableOfficers, getStageOfficerIds, officerFilterMode]);

  // Count tasks per task manager — unallocated = BCL stage with no manager assigned
  const taskManagerTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, __unallocated__: 0 };
    availableTaskManagers.forEach(tm => { counts[tm.id] = 0; });

    tasksByDeptFilter.forEach(task => {
      const tracking = getCurrentStageTracking(task);
      if (tracking && tracking.stage.follow_up === 'BCL') {
        counts.all++;
        const tm = task.task_manager;
        if (tm?.id && counts[tm.id.toString()] !== undefined) {
          counts[tm.id.toString()]++;
        } else {
          counts.__unallocated__++;
        }
      }
    });

    return counts;
  }, [tasksByDeptFilter, availableTaskManagers, getCurrentStageTracking]);

  // Count tasks waiting on the client.
  const clientTaskCounts = useMemo(() => {
    return { all: tasksByDeptFilter.filter(task => isTaskWithClient(task)).length };
  }, [tasksByDeptFilter, isTaskWithClient]);

  // Count tasks per company participant.
  const companyTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    availableClients.forEach(client => {
      counts[client.id] = 0;
    });

    tasksByDeptFilter.forEach(task => {
      const company = getTaskCompanyParticipant(task);
      if (company && company.name) {
        counts.all++;
        const client = availableClients.find(c => c.id === company.name);
        if (client && counts[client.id] !== undefined) {
          counts[client.id]++;
        }
      }
    });

    return counts;
  }, [tasksByDeptFilter, availableClients, getTaskCompanyParticipant]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeDeptId && task.department_id?.toString() !== activeDeptId) return false;
      if (activeSubDeptIds.length > 0 && !activeSubDeptIds.includes(task.subdepartment_id?.toString())) return false;
      if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
      if (activeSubClassId !== 'all' && task.subclass_id?.toString() !== activeSubClassId) return false;

      // Status filtering
      if (activeStatus === 'wip') {
        const isWriteUp = task.status === 'write_up_completed';
        const isEndorsed = task.status === 'endorsed';
        const isCancelled = task.status === 'cancel';
        const isCompleted = isWriteUp || isEndorsed || ['completed', 'archived'].includes(task.status);
        if (isCompleted || isCancelled) return false;
      } else if (activeStatus === 'write_up_completed') {
        if (task.status !== 'write_up_completed') return false;
      } else if (activeStatus === 'endorsed') {
        if (task.status !== 'endorsed') return false;
      } else if (activeStatus === 'cancelled') {
        if (task.status !== 'cancel') return false;
      }

      // Officer filtering — only when officers perspective is active
      if (activePerspective === 'officers') {
        if (activeOfficerTab === '__unallocated__') {
          if (getStageOfficerIds(task, 'current').length !== 0) return false;
        } else if (effectiveOfficerIds.length > 0) {
          if (!taskHasStageOfficer(task, effectiveOfficerIds, officerFilterMode)) return false;
        }
      }

      // Task Manager filtering — only when managers perspective is active
      if (activePerspective === 'managers') {
        const tracking = getCurrentStageTracking(task);
        if (activeTaskManagerTab === '__unallocated__') {
          if (!tracking || tracking.stage.follow_up !== 'BCL') return false;
          if (task.task_manager?.id) return false;
        } else if (effectiveTaskManagerIds.length > 0) {
          if (!tracking) return false;
          if (tracking.stage.follow_up !== 'BCL') return false;
          const taskManager = task.task_manager;
          if (!taskManager || !taskManager.id) return false;
          if (!effectiveTaskManagerIds.includes(taskManager.id.toString())) return false;
        }
      }

      // Client filtering — tasks where current stage is waiting on the client
      if (activePerspective === 'clients' && !isTaskWithClient(task)) {
        return false;
      }

      return true;
    });
  }, [tasks, activeDeptId, activeSubDeptIds, activeClassId, activeSubClassId, activeStatus, activePerspective, activeOfficerTab, activeTaskManagerTab, effectiveOfficerIds, officerFilterMode, effectiveTaskManagerIds, taskManagerFilterMode, stages, getCurrentStageTracking, taskHasStageOfficer, isTaskWithClient, getStageOfficerIds]);

  const searchedTasks = useMemo(() => {
    if (!searchQuery) return filteredTasks;
    const q = searchQuery.toLowerCase();
    return filteredTasks.filter(t =>
      t.id.toString().includes(q) ||
      (t.applicant_name && t.applicant_name.toLowerCase().includes(q)) ||
      (t.company_name && t.company_name.toLowerCase().includes(q)) ||
      (companies.get(t.company_id)?.name?.toLowerCase().includes(q))
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
    const subdept = activeSubDeptIds.length === 1
      ? dept.tm_subdepartments?.find((s: any) => s.id.toString() === activeSubDeptIds[0])
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
  }, [activeDeptId, activeSubDeptIds, activeClassId, activeSubClassId, departments]);

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
    // Use taskFields array directly to preserve custom order, fallback to sessionIncludedFields
    const taskFieldsConfig = activeReport.configuration?.taskFields || [];
    const fieldsToDisplay = activeReport.sessionIncludedFields?.length > 0
      ? activeReport.sessionIncludedFields
      : taskFieldsConfig.map((f: any) => f.id);

    // If using sessionIncludedFields, we need to sort them based on the taskFields order
    const orderedFieldsToDisplay = activeReport.sessionIncludedFields?.length > 0
      ? [...activeReport.sessionIncludedFields].sort((a, b) => {
        const indexA = taskFieldsConfig.findIndex((f: any) => f.id === a);
        const indexB = taskFieldsConfig.findIndex((f: any) => f.id === b);
        // If both are in taskFields, sort by their order
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        // If only one is in taskFields, it comes first
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // If neither is in taskFields, maintain original order
        return 0;
      })
      : fieldsToDisplay;

    orderedFieldsToDisplay.forEach((fieldId: string) => {
      if (!fieldId) return;
      cols.push({ id: `task_${fieldId}`, label: getLabel(fieldId), type: 'task', field: fieldId });
    });

    // Add columns for Document Requirements (displayed before time tracking and stage columns)
    if (showDocRequirementsColumns) {
      // Collect Document Requirements from all tasks
      const referenceRequirements = new Map<string, any>();
      tasks.forEach(task => {
        if (task.requirements && Array.isArray(task.requirements)) {
          task.requirements.forEach((req: any) => {
            if (req.category === 'reference') {
              const reqId = `req_${req.id || req.name}`;
              if (!referenceRequirements.has(reqId)) {
                referenceRequirements.set(reqId, req);
              }
            }
          });
        }
      });

      // Add columns for each unique reference requirement
      referenceRequirements.forEach((req, reqId) => {
        cols.push({
          id: reqId,
          label: req.name || 'Reference Requirement',
          type: 'reference_requirement',
          requirementId: req.id,
          requirementName: req.name,
          sourceTable: req.sourceTable,
          linkingVariable: req.linkingVariable
        });
      });
    }

    if (showTimeTrackingColumns) {
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
    }

    const activeStageIds = Object.keys(activeReport.configuration?.stages || {});
    const sortedStages = stages
      .filter(s => activeStageIds.includes(s.id))
      .filter(stage => isStageApplicableToCurrentFilter(stage.id))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    sortedStages.forEach((stage, index) => {
      const config = activeReport.configuration.stages[stage.id];
      const isSpecialStage = SPECIAL_STAGE_IDS.includes(stage.id);
      const hasDocuments = config.documents && Object.keys(config.documents).length > 0;
      const shouldShowDateColumn = config.isStageDateSelected;
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
          const nextShouldShowDateColumn = nextConfig.isStageDateSelected;

          if (nextShouldShowDateColumn && showTimeTrackingColumns) {
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

      if (hasDocuments) {
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
            (docConfig.fields || []).forEach((fieldConfig: any) => {
              const fieldId = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.id;
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
  }, [activeReport, stages, kycDocuments, isStageApplicableToCurrentFilter, expandedStageColumns, showTimeTrackingColumns, showDocRequirementsColumns, tasks]);

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

      if (!tracking || elapsedMinutes == null) return <span className="text-sm text-gray-400">—</span>;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm font-medium text-blue-700">
              <Clock3 className="h-4 w-4" />
              <span>{formatDuration(elapsedMinutes)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="border-gray-200 shadow-xl text-sm bg-white text-gray-700">
            <div className="space-y-1">
              <div><span className="font-semibold text-gray-500">Stage:</span> {tracking.stage?.name || '-'}</div>
              <div><span className="font-semibold text-gray-500">Handled:</span> {formatDateTimeForDisplay(tracking.handledAt)}</div>
              <div><span className="font-semibold text-gray-500">Elapsed:</span> <span className="text-blue-600">{formatDuration(elapsedMinutes)}</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (col.type === 'total_process_age') {
      const initiatedAt = getTaskInitiatedDate(task);
      const elapsedMinutes = getElapsedMinutes(initiatedAt);

      if (!initiatedAt || elapsedMinutes == null) return <span className="text-sm text-gray-400">—</span>;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm font-medium text-violet-700">
              <Timer className="h-4 w-4" />
              <span>{formatDuration(elapsedMinutes)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="border-gray-200 shadow-xl text-sm bg-white text-gray-700">
            <div className="space-y-1">
              <div><span className="font-semibold text-gray-500">Initiated:</span> {formatDateTimeForDisplay(initiatedAt)}</div>
              <div><span className="font-semibold text-gray-500">Elapsed:</span> <span className="text-violet-600">{formatDuration(elapsedMinutes)}</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (col.type === 'stage_gap') {
      const fromStage = stages.find(s => s.id === col.fromStageId);
      const toStage = stages.find(s => s.id === col.toStageId);
      if (!fromStage || !toStage) return <span className="text-sm text-gray-400">—</span>;

      const fromDate = getStageHandledDate(task, fromStage);
      const toDate = getStageHandledDate(task, toStage);

      if (!fromDate || !toDate) return <span className="text-sm text-gray-400">—</span>;

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
          <TooltipContent className="bg-white text-gray-700 border-gray-200 shadow-xl p-2">
            <div className="text-sm space-y-1">
              <div><span className="font-semibold text-gray-500">From:</span> {col.fromStageName}</div>
              <div><span className="font-semibold text-gray-500">To:</span> {col.toStageName}</div>
              <div><span className="font-semibold text-gray-500">Gap:</span> <span className="text-orange-600">{displayText.trim() || '0m'}</span></div>
              <div><span className="font-semibold text-gray-500">From Date:</span> {formatDateForDisplay(fromDate)}</div>
              <div><span className="font-semibold text-gray-500">To Date:</span> {formatDateForDisplay(toDate)}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return <span className="text-sm text-gray-400">—</span>;

      if (!checkStageApplicableForTask(stage, task)) {
        return <span className="text-sm text-red-500">Missing</span>;
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
            <TooltipContent className="bg-white text-gray-700 border-gray-200 shadow-xl p-2">
              <div className="text-sm space-y-1">
                <p><span className="font-semibold text-gray-500">Reason:</span> {reason}</p>
                {skippedAt && <p><span className="font-semibold text-gray-500">Date:</span> {formatDateTimeForDisplay(skippedAt)}</p>}
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
            <TooltipContent className={`bg-white text-gray-700 border-gray-200 shadow-xl p-2`}>
              <div className="space-y-2 p-1">
                <div className={`font-semibold text-sm ${textColor} border-b border-gray-100 pb-1.5`}>{statusText}</div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between gap-4"><span className="text-gray-500 font-semibold">Completed:</span><span className="text-gray-700">{formatDateTimeForDisplay(completionDate)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-gray-500 font-semibold">Duration:</span><span className="text-gray-700">{durationTakenText}</span></div>
                  {estimatedMinutes > 0 && <div className="flex justify-between gap-4"><span className="text-gray-500 font-semibold">Allowed:</span><span className="text-gray-700">{formatDuration(estimatedMinutes)}</span></div>}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      if (!effectiveStartTime || !showTimeStatuses) return <span className="text-sm text-gray-400">—</span>;

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
          <TooltipContent className={`bg-white text-gray-700 border-gray-200 shadow-xl p-2`}>
            <div className="space-y-2 p-1">
              <div className={`font-semibold text-sm ${textColor} border-b border-gray-100 pb-1.5`}>
                {isOverdue ? "In Progress (Overdue)" : "In Progress (On Track)"}
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between gap-4"><span className="text-gray-500 font-semibold">Started:</span><span className="text-gray-700">{formatDateTimeForDisplay(effectiveStartTime)}</span></div>
                {estimatedMinutes > 0 && (
                  <>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500 font-semibold">Remaining:</span>
                      <span className={isOverdue ? 'font-semibold text-red-600' : 'text-emerald-600'}>
                        {isOverdue ? `Overdue by ${timeStatus?.formattedOverdue}` : timeStatus?.formattedRemaining}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4"><span className="text-gray-500 font-semibold">Estimate:</span><span className="text-gray-700">{formatDuration(estimatedMinutes)}</span></div>
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
      if (!stage) return <span className="text-sm text-gray-400">—</span>;

      if (!checkStageApplicableForTask(stage, task)) {
        return <span className="text-sm text-red-500">Missing</span>;
      }

      if (col.isAutoAdded) {
        let foundValue: any = null, foundDoc = null;
        const isDateTimeField = col.fieldType === 'date_and_time' || col.fieldName === 'date_and_time';
        const isDateLike = col.fieldType === 'date' || col.fieldType === 'Date' || isDateTimeField;
        const dtPat = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
        for (const stageDocInfo of (stage.documents || [])) {
          if (!isDocumentApplicable(stageDocInfo, task)) continue;
          const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
          if (!linked || linked.indicator) continue;
          foundValue = isDateLike
            ? (findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId])
              || linked.extracted_details?.[col.fieldName]
              || linked.extracted_details?.[col.fieldId])
            : linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
          if (!foundValue && isDateTimeField) {
            foundValue = (Object.values(linked.extracted_details || {}) as any[]).find(
              (v) => typeof v === 'string' && dtPat.test(v)
            );
          }
          if (foundValue) { foundDoc = linked; break; }
        }
        if (!foundDoc) return <span className="text-sm text-red-500">Missing</span>;
        const display = isDateTimeField
          ? formatDateTimeForDisplay(foundValue)
          : isDateLike ? formatDateForDisplay(foundValue) : foundValue;
        const isOld = foundDoc.created_at && task.created_at && new Date(foundDoc.created_at) < new Date(task.created_at);
        return <span className={`text-sm ${isOld ? 'text-amber-600 italic' : 'text-gray-700'}`}>{display || <span className="text-gray-400">—</span>}</span>;
      }

      const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === col.kycId);
      if (!stageDocInfo) return <span className="text-sm text-gray-400">—</span>;
      if (!isDocumentApplicable(stageDocInfo, task)) return <span className="text-sm text-red-500">Missing</span>;

      const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
      if (!linked) return <span className="text-sm text-red-500">Missing</span>;
      if (linked.indicator) return <span className="inline-flex items-center rounded-sm bg-red-50 text-red-600 border border-red-200 text-xs font-medium px-2 py-1">Indicator</span>;

      const isDateTimeField2 = col.fieldType === 'date_and_time' || col.fieldName === 'date_and_time';
      const isDateLike2 = col.fieldType === 'date' || col.fieldType === 'Date' || isDateTimeField2;
      let val = isDateLike2
        ? (findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId])
          || linked.extracted_details?.[col.fieldName]
          || linked.extracted_details?.[col.fieldId])
        : linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];

      // Pattern fallback: find any dd/MM/yyyy HH:mm value in extracted_details when key lookup failed
      if (!val && isDateTimeField2) {
        const dtPat = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
        val = (Object.values(linked.extracted_details || {}) as any[]).find(
          (v) => typeof v === 'string' && dtPat.test(v)
        );
      }

      const isOld = linked.created_at && task.created_at && new Date(linked.created_at) < new Date(task.created_at);
      const display = isDateTimeField2
        ? formatDateTimeForDisplay(val)
        : isDateLike2 ? formatDateForDisplay(val) : val;
      return <span className={`text-sm ${isOld ? 'text-amber-600 italic' : 'text-gray-700'}`}>{display || <span className="text-gray-400">—</span>}</span>;
    }

    if (col.type === 'task') {
      return getCellContent(
        departments, task, col.field, enhancedTasksData, taskDependants,
        new Set(), companies, getTaskHierarchy, getStaffName,
        getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
        (t: any) => renderImmigrationStatusCell(t, getEnhancedImmigrationStatusWrapper, new Set(), () => { }),
        (t: any) => renderCurrentStageStatusCell(t, getCurrentStageStatusWrapper),
        () => { }, () => { }, () => { },
        unifiedOfficers,
        stages
      );
    }

    if (col.type === 'reference_requirement') {
      // Find the requirement in the task's requirements
      const requirement = task.requirements?.find((r: any) =>
        r.category === 'reference' && (r.id === col.requirementId || r.name === col.requirementName)
      );

      if (!requirement) {
        return <span className="text-sm text-gray-400">—</span>;
      }

      // Check if task has fetched reference documents
      const referenceDocs = task.referenceDocuments?.[col.requirementId] || [];

      if (referenceDocs.length === 0) {
        return (
          <div className="text-gray-400 italic">No documents found</div>
        );
      }

      // Display the isEffectiveTo field value from the latest document
      const latestDoc = referenceDocs.reduce((prev, curr) =>
        new Date(curr.created_at) > new Date(prev.created_at) ? curr : prev
      );

      // Find the field with isEffectiveTo: true from the KYC metadata
      const docId = latestDoc.document_id || latestDoc.kyc_document_id;
      const kycMetadata = kycDocuments.get(docId);
      const effectiveToField = kycMetadata?.fields?.find((field: any) => field.isEffectiveTo === true);

      // Extract the value from the field with isEffectiveTo: true
      const isEffectiveTo = effectiveToField
        ? (latestDoc.extracted_details?.[effectiveToField.fieldName] || latestDoc.edited_details?.[effectiveToField.fieldName])
        : (latestDoc.extracted_details?.isEffectiveTo || latestDoc.edited_details?.isEffectiveTo);


      return (
        <div className="text-gray-500"><span className="font-medium text-gray-700">{isEffectiveTo || '-'}</span></div>
      );
    }

    if (col.type === 'current_stage_officer') {
      const currentStage = getCurrentOfficerStage(task);

      if (!currentStage) {
        return <span className="text-sm text-gray-400">—</span>;
      }

      const officerIds = getStageOfficerIds(task, 'current');

      if (!officerIds || officerIds.length === 0) {
        return <span className="text-sm text-gray-400 italic">None assigned</span>;
      }

      const officerNames = officerIds.map((id: string) => {
        const officer = unifiedOfficers.find((o: any) => o.id.toString() === id.toString());
        return officer ? getOfficerDisplayName(officer) : 'Unknown';
      }).filter(Boolean);

      if (officerNames.length === 0) {
        return <span className="text-sm text-gray-400 italic">None assigned</span>;
      }

      return (
        <div className="flex flex-wrap gap-1">
          {officerNames.map((name: string, idx: number) => (
            <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
              {name}
            </Badge>
          ))}
        </div>
      );
    }

    if (col.type === 'stage_officers') {
      const officerIds = Array.isArray(task.stages?.[col.stageId]?.officer_ids)
        ? task.stages[col.stageId].officer_ids.map((id: any) => id?.toString()).filter(Boolean)
        : [];

      if (!officerIds || officerIds.length === 0) {
        return <span className="text-sm text-gray-400 italic">None assigned</span>;
      }

      const officerNames = officerIds.map((id: string) => {
        const officer = unifiedOfficers.find((o: any) => o.id.toString() === id.toString());
        return officer ? getOfficerDisplayName(officer) : 'Unknown';
      }).filter(Boolean);

      if (officerNames.length === 0) {
        return <span className="text-sm text-gray-400 italic">None assigned</span>;
      }

      return (
        <div className="flex flex-wrap gap-1">
          {officerNames.map((name: string, idx: number) => (
            <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">
              {name}
            </Badge>
          ))}
        </div>
      );
    }

    return <span className="text-sm text-gray-400">—</span>;
  }, [
    stages, departments, kycDocuments, allDocuments, companies,
    enhancedTasksData, taskDependants, showTimeStatuses,
    checkStageApplicableForTask, isDocumentApplicable, getDocumentForTaskStage,
    getStaffName, getTaskHierarchy, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper,
    getCurrentStageTracking, getTaskInitiatedDate, getCurrentOfficerStage, getStageOfficerIds, unifiedOfficers
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

    if (col.type === 'current_stage_officer') {
      const officerIds = getStageOfficerIds(task, 'current');
      if (!officerIds.length) return 'None assigned';
      return officerIds.map((id: string) => {
        const officer = unifiedOfficers.find((o: any) => o.id.toString() === id.toString());
        return officer ? getOfficerDisplayName(officer) : 'Unknown';
      }).join(', ');
    }

    if (col.type === 'stage_officers') {
      const officerIds = Array.isArray(task.stages?.[col.stageId]?.officer_ids)
        ? task.stages[col.stageId].officer_ids.map((id: any) => id?.toString()).filter(Boolean)
        : [];
      if (!officerIds.length) return 'None assigned';
      return officerIds.map((id: string) => {
        const officer = unifiedOfficers.find((o: any) => o.id.toString() === id.toString());
        return officer ? getOfficerDisplayName(officer) : 'Unknown';
      }).join(', ');
    }

    if (col.type === 'stage_date') {
      const stage = stages.find(s => s.id === col.stageId);
      if (!stage) return '-';
      if (!checkStageApplicableForTask(stage, task)) return 'Missing';

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
      if (!checkStageApplicableForTask(stage, task)) return 'Missing';

      let foundValue: any = null, foundDoc = null;
      const docsToSearch = col.isAutoAdded
        ? (stage.documents || [])
        : [stage?.documents?.find((d: any) => d.kycId === col.kycId)].filter(Boolean);

      const isDateTimeFieldExport = col.fieldType === 'date_and_time' || col.fieldName === 'date_and_time';
      const isDateLike = col.fieldType === 'date' || col.fieldType === 'Date' || isDateTimeFieldExport;
      const dtPatExport = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
      for (const stageDocInfo of docsToSearch) {
        if (!isDocumentApplicable(stageDocInfo, task)) continue;
        const linked = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] })[0];
        if (!linked || linked.indicator) continue;
        foundValue = isDateLike
          ? (findDateInObject(linked.extracted_details || {}, [col.fieldName, col.fieldId])
            || linked.extracted_details?.[col.fieldName]
            || linked.extracted_details?.[col.fieldId])
          : linked.extracted_details?.[col.fieldName] || linked.extracted_details?.[col.fieldId];
        if (!foundValue && isDateTimeFieldExport) {
          foundValue = (Object.values(linked.extracted_details || {}) as any[]).find(
            (v) => typeof v === 'string' && dtPatExport.test(v)
          );
        }
        if (foundValue) { foundDoc = linked; break; }
      }
      if (!foundDoc) return col.isAutoAdded ? 'Missing' : '-';
      if ((foundDoc as any).indicator) return 'Indicator';
      return isDateTimeFieldExport
        ? formatDateTimeForDisplay(foundValue)
        : isDateLike ? formatDateForDisplay(foundValue) : String(foundValue || '-');
    }
    return '';
  }, [departments, stages, kycDocuments, companies, enhancedTasksData, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, checkStageApplicableForTask, isDocumentApplicable, getDocumentForTaskStage, getCurrentStageTracking, getTaskInitiatedDate, getStageOfficerIds, unifiedOfficers]);

  const handleExport = async (type: 'excel' | 'pdf') => {
    const dateStr = format(new Date(), 'dd MMM yyyy HH:mm');
    const reportName = activeReport?.name || 'Task Report';
    const deptLabel = activeDepartment?.name || 'All Departments';
    const totalCols = filteredColumns.length + 1; // +1 for # index

    // ── Shared helper: apply semantic colour to a cell based on its text value ──
    const applySemanticColor = (cell: ExcelJS.Cell) => {
      const v = String(cell.value ?? '');
      if (v === 'Missing' || v === 'N/A' || v.toLowerCase().includes('missing')) {
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FFDC2626' }, italic: true };
      } else if (v.toLowerCase().includes('completed')) {
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF15803D' }, bold: true };
      } else if (v.toLowerCase().includes('wip') || v.toLowerCase().includes('in progress')) {
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FFB45309' }, bold: true };
      } else if (v.toLowerCase().includes('cancel')) {
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FFBE123C' } };
      } else if (v.toLowerCase().includes('skipped')) {
        cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF6B7280' }, italic: true };
      }
    };

    if (type === 'excel') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Task Manager';
      wb.created = new Date();
      const ws = wb.addWorksheet('Report', { views: [{ showGridLines: false }] });

      const accentArgb = 'FF4F46E5'; // blue-600
      const accentLightArgb = 'FFF5F3FF'; // blue-50
      const headerFg = 'FF1E1B4B'; // dark blue
      const rowAlt = 'FFF8F9FF';
      const borderColor = 'FFCBD5E1';

      // ── Row 1: Full-width branded cover ──────────────────────────────────
      ws.mergeCells(1, 1, 1, totalCols);
      const coverCell = ws.getCell('A1');
      coverCell.value = reportName.toUpperCase();
      coverCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      coverCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
      coverCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
      ws.getRow(1).height = 36;

      // ── Row 2: Metadata subtitle ─────────────────────────────────────────
      ws.mergeCells(2, 1, 2, totalCols);
      const metaCell = ws.getCell('A2');
      metaCell.value = `${deptLabel}   ·   ${dateStr}   ·   ${searchedTasks.length} records`;
      metaCell.font = { name: 'Calibri', size: 9, color: { argb: 'FFB0A8F0' } };
      metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFg } };
      metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 };
      ws.getRow(2).height = 20;

      // ── Row 3: Stats pill strip ──────────────────────────────────────────
      const pillLabels = ['Total', 'WIP', 'Completed', 'Endorsed', 'Cancelled'];
      const pillValues = [allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount];
      const pillArgbs = ['FF4F46E5', 'FFF59E0B', 'FF16A34A', 'FF0284C7', 'FFDC2626'];
      const pillLightArgbs = ['FFF5F3FF', 'FFFEF3C7', 'FFF0FDF4', 'FFE0F2FE', 'FFFEF2F2'];
      pillLabels.forEach((label, i) => {
        const col = i + 1;
        const labelCell = ws.getCell(3, col);
        labelCell.value = label;
        labelCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: pillArgbs[i] } };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pillLightArgbs[i] } };
        labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
        labelCell.border = { top: { style: 'thin', color: { argb: pillArgbs[i] } }, bottom: { style: 'thin', color: { argb: pillArgbs[i] } } };

        const valCell = ws.getCell(4, col);
        valCell.value = pillValues[i];
        valCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: pillArgbs[i] } };
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pillLightArgbs[i] } };
        valCell.alignment = { vertical: 'middle', horizontal: 'center' };
        valCell.border = { bottom: { style: 'medium', color: { argb: pillArgbs[i] } } };
      });
      ws.getRow(3).height = 18;
      ws.getRow(4).height = 30;

      // ── Spacer row ────────────────────────────────────────────────────────
      ws.getRow(5).height = 8;

      // ── Row 6: Column Headers ─────────────────────────────────────────────
      const colHeaders = ['#', ...filteredColumns.map(c => c.label)];
      const hRow = ws.getRow(6);
      hRow.values = colHeaders;
      hRow.height = 26;
      hRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF374151' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false };
        cell.border = {
          top: { style: 'thin', color: { argb: borderColor } },
          bottom: { style: 'medium', color: { argb: accentArgb } }
        };
      });

      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 6, showGridLines: false }];

      // ── Data rows ─────────────────────────────────────────────────────────
      searchedTasks.forEach((task, idx) => {
        const vals = [idx + 1, ...filteredColumns.map(col => getExportCellValue(task, col))];
        const row = ws.addRow(vals); // row 7+
        row.height = 20;
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          const isEven = idx % 2 === 0;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : rowAlt } };
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF1F2937' } };
          cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left', indent: c === 1 ? 0 : 1 };
          cell.border = { bottom: { style: 'hair', color: { argb: borderColor } } };
          applySemanticColor(cell);
        });
      });

      // ── Column widths ──────────────────────────────────────────────────────
      ws.getColumn(1).width = 5;
      filteredColumns.forEach((col, i) => {
        ws.getColumn(i + 2).width = Math.min(45, Math.max(18, col.label.length * 1.4));
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Report_${reportName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      link.click();
      toast({ title: 'Export Complete', description: `${searchedTasks.length} rows exported to Excel.` });

    } else {
      // ── PDF export ────────────────────────────────────────────────────────
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const accentRgb: [number, number, number] = [79, 70, 229];
      const greyDark: [number, number, number] = [15, 23, 42];
      const greyMid: [number, number, number] = [100, 116, 139];
      const greyLight: [number, number, number] = [226, 232, 240];

      // Modern header
      doc.setFillColor(...accentRgb);
      doc.rect(0, 0, pageW, 3, 'F');
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 3, pageW, 18, 'F');
      doc.setTextColor(...greyDark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(reportName.toUpperCase(), 14, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...greyMid);
      doc.text(`${deptLabel}  ·  ${dateStr}  ·  ${searchedTasks.length} records`, 14, 19.5);
      doc.setDrawColor(...greyLight);
      doc.setLineWidth(0.3);
      doc.line(10, 22, pageW - 10, 22);

      autoTable(doc, {
        startY: 26,
        head: [['#', ...filteredColumns.map(c => c.label)]],
        body: searchedTasks.map((t, i) => [i + 1, ...filteredColumns.map(col => getExportCellValue(t, col))]),
        headStyles: { fillColor: greyDark, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center', minCellHeight: 7, lineWidth: 0 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [31, 41, 55], lineColor: [241, 245, 249] },
        styles: { fontSize: 6.5, cellPadding: { top: 1.5, right: 2.5, bottom: 1.5, left: 2.5 }, textColor: [31, 41, 55], overflow: 'ellipsize', lineWidth: 0.15 },
        columnStyles: { 0: { cellWidth: 7, halign: 'center' } },
        margin: { left: 10, right: 10, top: 26, bottom: 12 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const v = String(data.cell.raw ?? '');
            if (v === 'Missing' || v === 'N/A') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'italic'; }
            else if (v.toLowerCase().includes('completed')) { data.cell.styles.textColor = [21, 128, 61]; data.cell.styles.fontStyle = 'bold'; }
            else if (v.toLowerCase().includes('wip')) { data.cell.styles.textColor = [180, 83, 9]; data.cell.styles.fontStyle = 'bold'; }
            else if (v.toLowerCase().includes('cancel')) { data.cell.styles.textColor = [190, 18, 60]; }
          }
        },
        didDrawPage: (data) => {
          const pg = doc.getNumberOfPages();
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.line(10, pageH - 8, pageW - 10, pageH - 8);
          doc.setFontSize(6.5);
          doc.setTextColor(148, 163, 184);
          doc.setFont('helvetica', 'normal');
          doc.text(`${reportName}  ·  ${dateStr}`, 14, pageH - 3.5);
          doc.text(`Page ${pg}`, pageW - 14, pageH - 3.5, { align: 'right' });
        }
      });

      doc.save(`Report_${reportName.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'Export Complete', description: `${searchedTasks.length} rows exported to PDF.` });
    }
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
        if (type === 'task' || type === 'current_stage_officer') return 'task';
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

                if (raw === 'N/A' || raw === 'Missing') {
                  data.cell.styles.textColor = RED_TEXT;
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
    const referenceReqCols = filteredColumns.filter(c => c.type === 'reference_requirement');
    if (referenceReqCols.length) groups.push({ id: 'reference_requirements', label: 'Document Requirements', span: referenceReqCols.length, applicable: true });
    const trackingCols = filteredColumns.filter(c => c.type === 'current_stage_age' || c.type === 'total_process_age');
    if (trackingCols.length) groups.push({ id: 'time_tracking', label: 'Time Tracking', span: trackingCols.length, applicable: true });

    const stageMap = new Map<string, { id: string; label: string; count: number; applicable: boolean }>();
    filteredColumns.filter(c => c.type !== 'task' && c.type !== 'current_stage_age' && c.type !== 'total_process_age').forEach(col => {
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

  // Full hierarchy path (Department → Sub-department → Class) for the report's configured job level
  const jobLevelPath = useMemo(() => {
    if (!activeReport?.job_level) return null;
    const jl = activeReport.job_level;

    let dept: any = null;
    let subdept: any = null;
    let cls: any = null;

    if (jl.class_id) {
      outer: for (const d of departments) {
        for (const s of (d.tm_subdepartments || [])) {
          const c = (s.classes || []).find((c: any) => c.id.toString() === jl.class_id.toString());
          if (c) { dept = d; subdept = s; cls = c; break outer; }
        }
      }
      if (!cls) return [`Class ${jl.class_id}`];
    } else if (jl.subdepartment_id) {
      for (const d of departments) {
        const s = (d.tm_subdepartments || []).find((s: any) => s.id.toString() === jl.subdepartment_id.toString());
        if (s) { dept = d; subdept = s; break; }
      }
      if (!subdept) return [`Subdept ${jl.subdepartment_id}`];
    } else if (jl.department_id) {
      dept = departments.find((d: any) => d.id.toString() === jl.department_id.toString());
      if (!dept) return [`Dept ${jl.department_id}`];
    } else {
      return null;
    }

    return [dept?.name, subdept?.name, cls?.name].filter(Boolean);
  }, [activeReport, departments]);

  const breadcrumbParts = [
    activeReport?.name,
    activeDepartment?.name,
    activeSubDeptIds.length > 0
      ? activeSubDeptIds.map(id => activeSubDepartments.find(s => s.id.toString() === id)?.name).filter(Boolean).join(', ')
      : 'All Subdepartments',
    activeStatus === 'all' ? 'All Statuses' : activeStatus.replace(/_/g, ' ').toUpperCase(),
    activeClassId !== 'all' ? `Class: ${activeSubDepartments.flatMap((s: any) => s.classes || []).find((c: any) => c.id.toString() === activeClassId)?.name || activeClassId}` : null
  ].filter(Boolean);

  if (reportLoading) {
    return (
      <div className="flex-1 p-8 bg-gray-50 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-gray-400 mx-auto" />
          <p className="text-sm font-medium text-gray-500">Loading Reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 1. Sidebar */}
      <ReportsSidebar
        departments={departments}
        activeDeptId={activeDeptId}
        setActiveDeptId={setActiveDeptId}
        activeSubDepartments={activeSubDepartments}
        activeSubDeptIds={activeSubDeptIds}
        setActiveSubDeptIds={setActiveSubDeptIds}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
      />

      {/* 2. Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header Bar */}
        <ReportsHeader
          activeReport={activeReport}
          setIsReportDialogOpen={setIsReportDialogOpen}
          columns={columns}
          visibleColumnIds={visibleColumnIds}
          setVisibleColumnIds={setVisibleColumnIds}
          showTimeTrackingColumns={showTimeTrackingColumns}
          setShowTimeTrackingColumns={setShowTimeTrackingColumns}
          showDocRequirementsColumns={showDocRequirementsColumns}
          setShowDocRequirementsColumns={setShowDocRequirementsColumns}
          view={view}
          setView={setView}
          handleSendReport={handleSendReport}
          refreshData={() => refreshData(true)}
          loading={loading}
          activeDepartment={activeDepartment}
          activeSubDepartments={activeSubDepartments}
          activeSubDeptIds={activeSubDeptIds}
          allTasksCount={allTasksCount}
          wipTasksCount={wipTasksCount}
          writeUpCompletedCount={writeUpCompletedCount}
          endorsedCount={endorsedCount}
          cancelledCount={cancelledCount}
        />

        {/* Person Filter Strip */}
        <PersonFilterStrip
          activePerspective={activePerspective}
          setActivePerspective={setActivePerspective}
          allTasksCount={allTasksCount}
          officerTaskCounts={officerTaskCounts}
          taskManagerTaskCounts={taskManagerTaskCounts}
          clientTaskCounts={clientTaskCounts}
          availableOfficers={availableOfficers}
          activeOfficerTab={activeOfficerTab}
          setActiveOfficerTab={setActiveOfficerTab}
          officerFilterMode={officerFilterMode}
          setOfficerFilterMode={setOfficerFilterMode}
          availableTaskManagers={availableTaskManagers}
          activeTaskManagerTab={activeTaskManagerTab}
          setActiveTaskManagerTab={setActiveTaskManagerTab}
          taskManagerFilterMode={taskManagerFilterMode}
          setTaskManagerFilterMode={setTaskManagerFilterMode}
        />

        {/* Status + Search Bar */}
        <StatusFilterBar
          activeStatus={activeStatus}
          setActiveStatus={setActiveStatus}
          allTasksCount={allTasksCount}
          wipTasksCount={wipTasksCount}
          writeUpCompletedCount={writeUpCompletedCount}
          endorsedCount={endorsedCount}
          cancelledCount={cancelledCount}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeClassId={activeClassId}
          setActiveClassId={setActiveClassId}
          activeSubClassId={activeSubClassId}
          setActiveSubClassId={setActiveSubClassId}
          activeSubDeptIds={activeSubDeptIds}
          activeSubDepartments={activeSubDepartments}
          isFiltersDropdownOpen={isFiltersDropdownOpen}
          setIsFiltersDropdownOpen={setIsFiltersDropdownOpen}
        />

        {/* Table Area */}
        <div className="flex-1 overflow-hidden pt-6">
          {!activeReport ? (
            <div className="h-full flex flex-col items-center justify-center bg-white">
              <FileText className="h-10 w-10 mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No Report Selected</p>
              <p className="text-xs text-gray-400 mt-1">Select a report template to view data</p>
              <Button size="sm" className="mt-4" onClick={() => setIsReportDialogOpen(true)}>
                <Filter className="h-3.5 w-3.5 mr-1.5" />Select Report
              </Button>
            </div>
          ) : loading ? (
            <div className="h-full flex flex-col items-center justify-center bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
              <p className="text-sm font-medium text-gray-500">Processing Report Data...</p>
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
              userData={{ officers: unifiedOfficers, managers: unifiedManagers, assistants: unifiedAssistants, allUsers: [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants] }}
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
              userData={{ officers: unifiedOfficers, managers: unifiedManagers, assistants: unifiedAssistants, allUsers: [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants] }}
              departments={departments}
            />
          )}
        </div>
      </div>

      <MemorizedReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        department={departments.find((d: any) => d.id.toString() === activeDeptId) || null}
        stages={stages}
        kycDocuments={kycDocuments}
        onApplyReport={(report) => { setActiveReport(report); setExpandedStageColumns(new Set()); setIsReportDialogOpen(false); }}
        tableHeaders={ENHANCED_TABLE_HEADERS_IMMIGRATION}
        availableJobLevels={availableJobLevels}
        departments={departments}
        subdepartments={departments.flatMap((d: any) => d.tm_subdepartments || [])}
        classes={departments.flatMap((d: any) => (d.tm_subdepartments || []).flatMap((s: any) => s.classes || []))}
      />
    </div>
  );
}
