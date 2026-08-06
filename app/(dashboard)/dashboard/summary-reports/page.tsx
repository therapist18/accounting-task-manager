// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Building2, Clock, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import { fetchDepartments } from "../departments/departments/database";
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields } from "../tasks/utils/taskManagerData";
import { enhanceTasksWithIndividualData } from "../tasks/overall-view/tableUtils";
import { userService } from "@/lib/shared-user-assignment-service";
import { supabase } from "@/lib/supabase/client";
import {
  getCanonicalCurrentStage,
  getCurrentOfficerStage,
  getStageOfficerIds,
  isTaskWithClient,
  isStageApplicableToTask,
  computeStageDateInfo,
  parseDateSafe,
} from "../reports/utils/reportStageLogic";
import { StatusTabs, PerspectiveTabs, HierarchyTabs, ColumnVisibilityDialog, } from "./components/PageHeader";
import { SummaryTable } from "./components/SummaryTable";
import { MILESTONE_STAGE_COLUMNS, DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS } from "./stageColumnConfig";

const TERMINAL_STATUSES = ['write_up_completed', 'endorsed', 'completed', 'archived', 'cancel'];
const COMPLETED_STATUSES = ['write_up_completed', 'endorsed', 'completed'];

const buildJobLevelKey = (task: any, fallbackDeptId?: string) => {
  const jl = task.job_level || {};
  return JSON.stringify({
    department_id: Number(jl.department_id || task.department_id || fallbackDeptId),
    subdepartment_id: jl.subdepartment_id || null,
    class_id: jl.class_id || null,
    subclass_id: jl.subclass_id || null,
  });
};

export default function SummaryReportsPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, { name: string; prefix: string }>>(new Map());
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [stagesByDept, setStagesByDept] = useState<Map<string, any[]>>(new Map());
  const [unifiedOfficers, setUnifiedOfficers] = useState<any[]>([]);
  const [unifiedManagers, setUnifiedManagers] = useState<any[]>([]);
  const [unifiedAssistants, setUnifiedAssistants] = useState<any[]>([]);
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());
  const [expectedTimeByJobLevel, setExpectedTimeByJobLevel] = useState<Map<string, number>>(new Map());

  const [activeDeptId, setActiveDeptId] = useState<string>("all");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassIds, setActiveClassIds] = useState<string[]>([]);
  const [activeSubClassIds, setActiveSubClassIds] = useState<string[]>([]);
  const [activeTaskStatus, setActiveTaskStatus] = useState<'all' | 'enquiry' | 'wip' | 'completed' | 'overdue'>('all');

  const [activePerspective, setActivePerspective] = useState<'all' | 'officers' | 'managers' | 'clients'>('all');
  const [activeOfficerId, setActiveOfficerId] = useState<string>("all");
  const [activeManagerId, setActiveManagerId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showTime, setShowTime] = useState(false);
  const [showDelta, setShowDelta] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS);

  const loadAllData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const depts = await fetchDepartments();
      setDepartments(depts);

      const comps = await fetchCompanies();
      setCompanies(comps);

      const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, depts);
      setUnifiedOfficers(unifiedUserData.officers || []);
      setUnifiedManagers(unifiedUserData.managers || []);
      setUnifiedAssistants(unifiedUserData.assistants || []);

      const results = await Promise.all(depts.map(async (d: any) => {
        const deptId = d.id.toString();
        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(deptId, undefined, comps),
          fetchStages(deptId, depts),
        ]);
        return { deptId, tasks: Array.isArray(tasksData) ? tasksData : [], stages: stagesData || [] };
      }));

      const newAllTasks: any[] = [];
      const newStagesByDept = new Map<string, any[]>();
      results.forEach(r => {
        newAllTasks.push(...r.tasks);
        newStagesByDept.set(r.deptId, r.stages);
      });
      setAllTasks(newAllTasks);
      setStagesByDept(newStagesByDept);

      const [docs, kycFields, { enhancedTasksData: enhancedMap }] = await Promise.all([
        fetchAllDocuments(),
        fetchAllKycFields(),
        enhanceTasksWithIndividualData(newAllTasks),
      ]);
      setAllDocuments(docs);
      setKycDocuments(kycFields?.kycDocsMap || new Map());
      setEnhancedTasksData(enhancedMap);

      // Expected total time per job level (tm_class_requirements.expected_total_time_minutes),
      // same source ReportsPage's "Expected Time" column reads from — fetched here across
      // every unique job level actually present in the loaded tasks, since this page spans
      // every department at once rather than one department at a time.
      const jobLevels = new Map<string, any>();
      newAllTasks.forEach((task: any) => {
        const key = buildJobLevelKey(task);
        if (!jobLevels.has(key)) {
          const jl = task.job_level || {};
          jobLevels.set(key, {
            department_id: Number(jl.department_id || task.department_id),
            subdepartment_id: jl.subdepartment_id || null,
            class_id: jl.class_id || null,
            subclass_id: jl.subclass_id || null,
            level: jl.level || 1,
          });
        }
      });
      const newExpectedTimeMap = new Map<string, number>();
      await Promise.all(Array.from(jobLevels.entries()).map(async ([key, jobLevel]) => {
        const { data, error } = await supabase
          .from('tm_class_requirements')
          .select('expected_total_time_minutes')
          .eq('job_level', JSON.stringify(jobLevel))
          .maybeSingle();
        if (!error && typeof data?.expected_total_time_minutes === 'number') {
          newExpectedTimeMap.set(key, data.expected_total_time_minutes);
        }
      }));
      setExpectedTimeByJobLevel(newExpectedTimeMap);
    } catch (err) {
      toast({ title: "Error", description: "Could not load summary reports data.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAllData(true);
    setIsRefreshing(false);
    toast({ title: "Refreshed", description: "Summary report data has been updated." });
  }, [loadAllData]);

  // Every current-stage lookup must use the stage list for the task's OWN department —
  // merging stages across departments would corrupt applicability checks for tasks whose
  // department doesn't carry a given stage.
  const getTaskStages = useCallback((task: any) => stagesByDept.get(task.department_id?.toString()) || [], [stagesByDept]);
  const getCanonicalCurrentStageForTask = useCallback((task: any) => getCanonicalCurrentStage(task, getTaskStages(task), departments), [getTaskStages, departments]);
  const getCurrentOfficerStageForTask = useCallback((task: any) => getCurrentOfficerStage(task, getTaskStages(task), departments), [getTaskStages, departments]);
  const getStageOfficerIdsForTask = useCallback((task: any, mode: 'current' | 'history' = 'current') => getStageOfficerIds(task, getTaskStages(task), mode, departments), [getTaskStages, departments]);
  const isTaskWithClientForTask = useCallback((task: any) => isTaskWithClient(task, getTaskStages(task), departments), [getTaskStages, departments]);
  const computeStageDateInfoForTask = useCallback((task: any, stage: any, col: any) =>
    computeStageDateInfo(task, stage, col, { stages: getTaskStages(task), allDocuments, kycDocuments }),
    [getTaskStages, allDocuments, kycDocuments]);

  // ── Expected / Actual total time — same source & math as ReportsPage's "Expected Time" /
  // "Actual Time Taken" columns, reused here for the Planned/Actual Execution columns and
  // for the Overdue(Delayed) status tab. ──
  const getExpectedMinutesForTask = useCallback((task: any) => {
    const stored = expectedTimeByJobLevel.get(buildJobLevelKey(task));
    if (typeof stored === 'number') return stored;
    let total = 0;
    getTaskStages(task).forEach((stage: any) => {
      if (stage.estimated_time && isStageApplicableToTask(stage, task, departments)) total += stage.estimated_time;
    });
    return total;
  }, [expectedTimeByJobLevel, getTaskStages, departments]);

  // Returns null if there's no first stage / no effective start date yet; otherwise
  // { diffDays, expectedMinutes, isOverdue, exceededMinutes }.
  const getActualTimeInfoForTask = useCallback((task: any) => {
    const applicableStagesSorted = [...getTaskStages(task)]
      .filter((s: any) => isStageApplicableToTask(s, task, departments))
      .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));
    const firstStage = applicableStagesSorted[0];
    if (!firstStage) return null;

    const info = computeStageDateInfoForTask(task, firstStage, { stageId: firstStage.id, hasDate: true, fields: [] });
    if (info.isSkipped || !info.effectiveDateValue) return null;

    const startDate = parseDateSafe(info.effectiveDateValue);
    if (!startDate) return null;

    const diffDays = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const actualMinutes = diffDays * 24 * 60;
    const expectedMinutes = getExpectedMinutesForTask(task);
    const isOverdue = expectedMinutes > 0 && actualMinutes > expectedMinutes;
    return { diffDays, expectedMinutes, actualMinutes, isOverdue, exceededMinutes: isOverdue ? actualMinutes - expectedMinutes : 0 };
  }, [getTaskStages, departments, computeStageDateInfoForTask, getExpectedMinutesForTask]);

  const isTaskOverdue = useCallback((task: any) => {
    if (TERMINAL_STATUSES.includes(task.status)) return false;
    return getActualTimeInfoForTask(task)?.isOverdue ?? false;
  }, [getActualTimeInfoForTask]);

  // ── Task status scoping (Enquiry / WIP / Completed / Overdue) ──
  const matchesActiveTaskStatus = useCallback((task: any) => {
    if (activeTaskStatus === 'all') return true;
    if (activeTaskStatus === 'enquiry') return task.status === 'enquiry';
    if (activeTaskStatus === 'wip') return task.status !== 'enquiry' && !TERMINAL_STATUSES.includes(task.status);
    if (activeTaskStatus === 'completed') return COMPLETED_STATUSES.includes(task.status);
    if (activeTaskStatus === 'overdue') return isTaskOverdue(task);
    return true;
  }, [activeTaskStatus, isTaskOverdue]);

  // ── Hierarchy scoping (dept → subdept) ──
  const hierarchyScopedTasks = useMemo(() => allTasks.filter(task => {
    if (activeDeptId !== 'all' && task.department_id?.toString() !== activeDeptId) return false;
    if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;
    return true;
  }), [allTasks, activeDeptId, activeSubDeptId]);

  // + the Class / Sub-Class multiselect dropdowns. Kept on top of hierarchyScopedTasks so
  // the dropdown badge counts below are never narrowed by the selection itself.
  const deptScopedTasks = useMemo(() => hierarchyScopedTasks.filter(task => {
    if (activeClassIds.length > 0 && !activeClassIds.includes(task.class_id?.toString())) return false;
    if (activeSubClassIds.length > 0 && !activeSubClassIds.includes(task.subclass_id?.toString())) return false;
    return true;
  }), [hierarchyScopedTasks, activeClassIds, activeSubClassIds]);

  const tasksInActiveDept = useMemo(() => activeDeptId === 'all' ? [] : allTasks.filter(t => t.department_id?.toString() === activeDeptId), [allTasks, activeDeptId]);
  const tasksInActiveSubDept = useMemo(() => activeSubDeptId === 'all' ? [] : tasksInActiveDept.filter(t => t.subdepartment_id?.toString() === activeSubDeptId), [tasksInActiveDept, activeSubDeptId]);

  const deptTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allTasks.length };
    departments.forEach((d: any) => { counts[d.id.toString()] = allTasks.filter(t => t.department_id?.toString() === d.id.toString()).length; });
    return counts;
  }, [allTasks, departments]);

  const subDeptTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasksInActiveDept.length };
    const activeDepartment = departments.find((d: any) => d.id.toString() === activeDeptId);
    (activeDepartment?.tm_subdepartments || []).forEach((s: any) => { counts[s.id.toString()] = tasksInActiveDept.filter(t => t.subdepartment_id?.toString() === s.id.toString()).length; });
    return counts;
  }, [tasksInActiveDept, departments, activeDeptId]);

  // Classes / Sub-Classes available within the current dept → subdept scope (deduped by id).
  const availableClasses = useMemo(() => {
    const map = new Map<string, any>();
    const collect = (subDepts: any[]) => (subDepts || []).forEach((s: any) => (s.classes || []).forEach((c: any) => {
      if (!map.has(c.id.toString())) map.set(c.id.toString(), { ...c, subdepartmentId: s.id, subDepartmentName: s.name });
    }));
    if (activeSubDeptId !== 'all') {
      const sub = departments.find((d: any) => d.id.toString() === activeDeptId)?.tm_subdepartments?.find((s: any) => s.id.toString() === activeSubDeptId);
      if (sub) collect([sub]);
    } else if (activeDeptId !== 'all') {
      collect(departments.find((d: any) => d.id.toString() === activeDeptId)?.tm_subdepartments || []);
    } else {
      departments.forEach((d: any) => collect(d.tm_subdepartments || []));
    }
    return Array.from(map.values());
  }, [departments, activeDeptId, activeSubDeptId]);

  // Sub-Classes follow the selected Class(es); with none selected they span every class in scope.
  const availableSubClasses = useMemo(() => {
    const map = new Map<string, any>();
    const pool = activeClassIds.length > 0
      ? availableClasses.filter((c: any) => activeClassIds.includes(c.id.toString()))
      : availableClasses;
    pool.forEach((c: any) => (c.subClasses || []).forEach((sc: any) => {
      if (!map.has(sc.id.toString())) map.set(sc.id.toString(), { ...sc, classId: c.id, className: c.name });
    }));
    return Array.from(map.values());
  }, [availableClasses, activeClassIds]);

  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    hierarchyScopedTasks.forEach((t: any) => { const cid = t.class_id?.toString(); if (cid) counts[cid] = (counts[cid] || 0) + 1; });
    return counts;
  }, [hierarchyScopedTasks]);

  const subClassCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    hierarchyScopedTasks.forEach((t: any) => { const sid = t.subclass_id?.toString(); if (sid) counts[sid] = (counts[sid] || 0) + 1; });
    return counts;
  }, [hierarchyScopedTasks]);

  // Task-status tab badges: totals per status, unaffected by which status tab is currently
  // selected (sourced from deptScopedTasks, not statusScopedTasks) so switching tabs never
  // zeroes out the others' counts — same convention as ReportsPage's StatusFilterBar.
  const taskStatusCounts = useMemo(() => ({
    all: deptScopedTasks.length,
    enquiry: deptScopedTasks.filter(t => t.status === 'enquiry').length,
    wip: deptScopedTasks.filter(t => t.status !== 'enquiry' && !TERMINAL_STATUSES.includes(t.status)).length,
    completed: deptScopedTasks.filter(t => COMPLETED_STATUSES.includes(t.status)).length,
    overdue: deptScopedTasks.filter(t => isTaskOverdue(t)).length,
  }), [deptScopedTasks, isTaskOverdue]);

  // + the active StatusTabs selection — this is the pool everything downstream (perspective
  // badges, search, rendered rows) narrows from.
  const statusScopedTasks = useMemo(() => deptScopedTasks.filter(matchesActiveTaskStatus), [deptScopedTasks, matchesActiveTaskStatus]);

  // ── Perspective scoping (Officers / Managers / Clients) ──
  const availableOfficers = useMemo(() => {
    if (activeDeptId === 'all') return [];
    const allUsers = [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants];
    const departmentUsers = userService.getDepartmentUsers(allUsers, activeDeptId, activeSubDeptId !== 'all' ? activeSubDeptId : undefined);
    const allowedIds = new Set(departmentUsers.officers.map((o: any) => o.id));
    return unifiedOfficers.filter((o: any) => allowedIds.has(o.id));
  }, [activeDeptId, activeSubDeptId, unifiedOfficers, unifiedManagers, unifiedAssistants]);

  const availableTaskManagers = useMemo(() => {
    if (activeDeptId === 'all') return [];
    const departmentUsers = userService.getDepartmentUsers([...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants], activeDeptId, activeSubDeptId !== 'all' ? activeSubDeptId : undefined);
    const allowedIds = new Set(departmentUsers.managers.map((m: any) => m.id));
    return unifiedManagers.filter((m: any) => allowedIds.has(m.id));
  }, [activeDeptId, activeSubDeptId, unifiedOfficers, unifiedManagers, unifiedAssistants]);

  const officersCount = useMemo(() => statusScopedTasks.filter(t => !!getCurrentOfficerStageForTask(t)).length, [statusScopedTasks, getCurrentOfficerStageForTask]);
  const managersCount = useMemo(() => statusScopedTasks.filter(t => getCanonicalCurrentStageForTask(t)?.follow_up?.toLowerCase() === 'bcl').length, [statusScopedTasks, getCanonicalCurrentStageForTask]);
  const clientsCount = useMemo(() => statusScopedTasks.filter(t => isTaskWithClientForTask(t)).length, [statusScopedTasks, isTaskWithClientForTask]);

  const officerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const pool = statusScopedTasks.filter(t => getCurrentOfficerStageForTask(t) !== null);
    availableOfficers.forEach((o: any) => {
      const c = pool.filter(t => getStageOfficerIdsForTask(t, 'current').includes(o.id.toString())).length;
      counts[o.id.toString()] = c;
      counts.all += c;
    });
    return counts;
  }, [statusScopedTasks, availableOfficers, getCurrentOfficerStageForTask, getStageOfficerIdsForTask]);

  const managerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const pool = statusScopedTasks.filter(t => getCanonicalCurrentStageForTask(t)?.follow_up?.toLowerCase() === 'bcl');
    availableTaskManagers.forEach((m: any) => {
      const c = pool.filter(t => t.task_manager?.id?.toString() === m.id.toString()).length;
      counts[m.id.toString()] = c;
      counts.all += c;
    });
    return counts;
  }, [statusScopedTasks, availableTaskManagers, getCanonicalCurrentStageForTask]);

  const perspectiveScopedTasks = useMemo(() => statusScopedTasks.filter(task => {
    if (activePerspective === 'officers') {
      const officerStage = getCurrentOfficerStageForTask(task);
      if (!officerStage) return false;
      if (activeOfficerId !== 'all' && !getStageOfficerIdsForTask(task, 'current').includes(activeOfficerId)) return false;
    }
    if (activePerspective === 'managers') {
      if (getCanonicalCurrentStageForTask(task)?.follow_up?.toLowerCase() !== 'bcl') return false;
      if (activeManagerId !== 'all' && task.task_manager?.id?.toString() !== activeManagerId) return false;
    }
    if (activePerspective === 'clients' && !isTaskWithClientForTask(task)) return false;
    return true;
  }), [statusScopedTasks, activePerspective, activeOfficerId, activeManagerId, getCurrentOfficerStageForTask, getStageOfficerIdsForTask, getCanonicalCurrentStageForTask, isTaskWithClientForTask]);

  const searchedTasks = useMemo(() => {
    if (!searchQuery) return perspectiveScopedTasks;
    const q = searchQuery.toLowerCase();
    return perspectiveScopedTasks.filter(t =>
      (t.applicant_name && t.applicant_name.toLowerCase().includes(q)) ||
      (t.company_name && t.company_name.toLowerCase().includes(q)) ||
      (companies.get(t.company_id)?.name?.toLowerCase().includes(q))
    );
  }, [perspectiveScopedTasks, searchQuery, companies]);

  const getSortableValue = useCallback((task: any, columnId: string) => {
    if (columnId === 'company') return (companies.get(task.company_id)?.name || task.company_name || '').toLowerCase();
    if (columnId === 'applicant') return (task.applicant_name || '').toLowerCase();
    if (columnId === 'job_description') return (task.job_description || '').toLowerCase();
    if (columnId === 'company_prefix' || columnId === 'sponsor_name' || columnId === 'application_type' || columnId === 'duration') return '';
    if (columnId === 'planned_execution') return getExpectedMinutesForTask(task);
    if (columnId === 'actual_execution') return getActualTimeInfoForTask(task)?.actualMinutes ?? 0;
    const milestone = MILESTONE_STAGE_COLUMNS.find(c => c.key === columnId);
    if (milestone) {
      const stageData = task.stages?.[milestone.stageId];
      const raw = stageData?.date || stageData?.completedAt || null;
      const parsed = raw ? parseDateSafe(raw) : null;
      return parsed ? parsed.getTime() : 0;
    }
    return '';
  }, [companies, getExpectedMinutesForTask, getActualTimeInfoForTask]);

  const handleSort = useCallback((columnId: string) => {
    setSortConfig(cur => cur?.key === columnId ? { key: columnId, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key: columnId, direction: 'asc' });
  }, []);

  const sortedTasks = useMemo(() => {
    if (!sortConfig) return searchedTasks;
    return [...searchedTasks].sort((a, b) => {
      const av = getSortableValue(a, sortConfig.key);
      const bv = getSortableValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [searchedTasks, sortConfig, getSortableValue]);

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-slate-100 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Summary Reports...</p>
        </div>
      </div>
    );
  }

  const activeDepartment = departments.find((d: any) => d.id.toString() === activeDeptId);
  const activeSubDepartment = (activeDepartment?.tm_subdepartments || []).find((s: any) => s.id.toString() === activeSubDeptId);
  const breadcrumbSubtext = activeSubDepartment?.name || (activeDeptId !== 'all' ? 'All Sub-units' : 'All Departments');

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-slate-50">
      {/* Title Bar — matches ReportsHeader: the title alone is the focal point, with a
          breadcrumb under it. */}
      <div className="border-b border-slate-200 bg-white px-8 py-5 antialiased flex flex-col justify-center">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex flex-col gap-1.5">
            <h1 className="text-[22px] font-bold text-slate-900 uppercase tracking-wide truncate leading-none">
              Summary Reports Dashboard
            </h1>
            <div className="flex items-center text-sm text-slate-500 font-semibold gap-1">
              <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-blue-600 font-bold">{activeDepartment?.name || "All Departments"}</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className="truncate text-slate-500">{breadcrumbSubtext}</span>
            </div>
          </div>

          {/* Secondary controls — same ghost-styled rounded-full toggles as ReportsHeader. */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ColumnVisibilityDialog visibleColumnIds={visibleColumnIds} setVisibleColumnIds={setVisibleColumnIds} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTime((v) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showTime ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {showTime ? "Hide Time" : "Show Time"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDelta((v) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showDelta ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {showDelta ? "Hide Δ" : "Show Δ"}
            </Button>
          </div>
        </div>
      </div>

      {/* Scope card — Department → Sub-Department tabs grouped as one visual unit, with
          Class / Sub-Class searchable multiselect dropdowns in the same card. */}
      <div className="mx-6 mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <HierarchyTabs
          departments={departments}
          activeDeptId={activeDeptId} setActiveDeptId={setActiveDeptId}
          activeSubDeptId={activeSubDeptId} setActiveSubDeptId={setActiveSubDeptId}
          deptTaskCounts={deptTaskCounts} subDeptTaskCounts={subDeptTaskCounts}
          availableClasses={availableClasses} activeClassIds={activeClassIds} setActiveClassIds={setActiveClassIds} classCounts={classCounts}
          availableSubClasses={availableSubClasses} activeSubClassIds={activeSubClassIds} setActiveSubClassIds={setActiveSubClassIds} subClassCounts={subClassCounts}
        />
        <StatusTabs activeTaskStatus={activeTaskStatus} setActiveTaskStatus={setActiveTaskStatus} counts={taskStatusCounts} />
      </div>

      {/* View card — perspective switcher + search, a separate concern from Scope/Status */}
      <div className="mx-6 mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <PerspectiveTabs
          activePerspective={activePerspective} setActivePerspective={setActivePerspective}
          allCount={statusScopedTasks.length} officersCount={officersCount} managersCount={managersCount} clientsCount={clientsCount}
          availableOfficers={availableOfficers} activeOfficerId={activeOfficerId} setActiveOfficerId={setActiveOfficerId} officerCounts={officerCounts}
          availableTaskManagers={availableTaskManagers} activeManagerId={activeManagerId} setActiveManagerId={setActiveManagerId} managerCounts={managerCounts}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          refreshData={handleRefresh} loading={isRefreshing}
        />
      </div>

      <SummaryTable
        tasks={sortedTasks} companies={companies} departments={departments}
        showTime={showTime} showDelta={showDelta}
        sortConfig={sortConfig} handleSort={handleSort}
        enhancedTasksData={enhancedTasksData}
        getExpectedMinutesForTask={getExpectedMinutesForTask}
        getActualTimeInfoForTask={getActualTimeInfoForTask}
        visibleColumnIds={visibleColumnIds}
      />
    </div>
  );
}
