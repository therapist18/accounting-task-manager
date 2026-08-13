// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Building2, Clock, GitCompare, FileDown, FileSpreadsheet, FileText, ChevronDown, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { fetchDepartments } from "../departments/departments/database";
import { fetchTasks, fetchStages, fetchCompanies, fetchClassRequirements } from "../tasks/utils/taskManagerData";
import { enhanceTasksWithIndividualData } from "../tasks/overall-view/tableUtils";
import { userService } from "@/lib/shared-user-assignment-service";
import { EnquiryDialog } from "../tasks/components/EnquiryDialog";
import { CancelConfirmationDialog } from "../tasks/components/CancelConfirmationDialog";
import { DeleteConfirmationDialog } from "../tasks/components/DeleteConfirmationDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getCanonicalCurrentStage,
  getCurrentOfficerStage,
  getStageOfficerIds,
  isTaskWithClient,
  isStageApplicableToTask,
  parseDateSafe,
} from "../reports/utils/reportStageLogic";
import { StatusTabs, PerspectiveTabs, HierarchyTabs, ColumnVisibilityDialog, } from "./components/PageHeader";
import { SummaryTable, resolveCompanyName } from "./components/SummaryTable";
import { MILESTONE_STAGE_COLUMNS, DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS, SUMMARY_COLUMNS } from "./stageColumnConfig";
import { exportSummaryReportToExcel, exportSummaryReportToPDF } from "./utils/exportSummary";
import {
  buildJobLevelKey,
  getApplicationTypeForTask as getApplicationTypeForTaskShared,
  getPromisedTimeResolution,
  getReqReceivedCompletedDate,
  getPlannedExecutionDate,
  getActualExecutionInfo,
} from "./utils/executionMath";

const TERMINAL_STATUSES = ['write_up_completed', 'endorsed', 'completed', 'archived', 'cancel'];
const STATUS_LABELS: Record<string, string> = {
  all: 'All Applications', enquiry: 'Enquiry', wip: 'WIP', completed: 'Completed', overdue: 'Overdue',
};
const COMPLETED_STATUSES = ['write_up_completed', 'endorsed', 'completed'];

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
  // Full { officers, managers, assistants, allUsers } payload, kept as-is (not just the split-out
  // lists above) so it can be handed straight to EnquiryDialog's `userData` prop — same shape
  // DepartmentTasksManager passes it, letting the dialog skip its own staff refetch.
  const [unifiedUserData, setUnifiedUserData] = useState<any>(null);
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());
  const [expectedTimeByJobLevel, setExpectedTimeByJobLevel] = useState<Map<string, number>>(new Map());
  // Promised Time (Stages module) per job level — defaultMinutes is the fallback, conditions
  // let a job level give a different Promised Time per Application Type value.
  const [promisedTimeByJobLevel, setPromisedTimeByJobLevel] = useState<
    Map<string, { defaultMinutes: number | null; conditions: { value: string; minutes: number }[] }>
  >(new Map());

  const [activeDeptId, setActiveDeptId] = useState<string>("all");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassIds, setActiveClassIds] = useState<string[]>([]);
  const [activeSubClassIds, setActiveSubClassIds] = useState<string[]>([]);
  const [activeTaskStatus, setActiveTaskStatus] = useState<'all' | 'enquiry' | 'wip' | 'completed' | 'overdue'>('enquiry');

  const [activePerspective, setActivePerspective] = useState<'all' | 'officers' | 'managers' | 'clients'>('all');
  const [officerFilterMode, setOfficerFilterMode] = useState<'current' | 'history'>('current');
  const [activeOfficerId, setActiveOfficerId] = useState<string>("all");
  const [activeManagerId, setActiveManagerId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showTime, setShowTime] = useState(false);
  const [showDelta, setShowDelta] = useState(false);
  // "Show All" also renders a "No tasks associated" placeholder section for every
  // sub-department tab that's genuinely empty (see SummaryTable's showEmptyGroups); "Show
  // With Tasks" hides those and only lists sub-departments that actually have rows.
  const [showEmptySubDepts, setShowEmptySubDepts] = useState(true);
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS);

  // ── Row actions (Edit / Cancel / Reactivate / Delete) — same dialogs and tm_tasks writes
  // DepartmentTasksManager's renderActionButtons uses, driven from this page's own allTasks
  // state instead of that module's task list.
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [taskToCancel, setTaskToCancel] = useState<any>(null);
  const [uncancelDialogOpen, setUncancelDialogOpen] = useState(false);
  const [taskToUncancel, setTaskToUncancel] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [isMutatingTask, setIsMutatingTask] = useState(false);

  const loadAllData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Departments and companies don't depend on each other — fetch both up front in
      // parallel instead of chaining them, since fetchTasks/fetchStages/getAllUserData all
      // need depts (and fetchTasks additionally needs comps).
      const [depts, comps] = await Promise.all([fetchDepartments(), fetchCompanies()]);
      setDepartments(depts);
      setCompanies(comps);

      // fetchTasks() internally fetches the ENTIRE tm_class_requirements table (plus a
      // reference-documents lookup) on top of its own tm_tasks query — calling it once per
      // department (the old per-dept Promise.all) multiplied ALL of that work by the
      // department count, which is what was actually slow (visible in the network panel as N
      // near-identical tm_tasks/tm_class_requirements round trips). fetchStages needs no
      // network call at all — it just reads the already-fetched `depts` payload — so it's fine
      // to keep per-department. tasks fetch happens exactly once for the whole company here,
      // then gets grouped by department client-side downstream via job_level.department_id.
      const [unifiedUserData, allTasksData, stagesResults] = await Promise.all([
        userService.getAllUserData({ payrollAccess: true }, depts),
        fetchTasks(undefined, undefined, comps),
        Promise.all(depts.map(async (d: any) => ({
          deptId: d.id.toString(),
          stages: (await fetchStages(d.id.toString(), depts)) || [],
        }))),
      ]);

      setUnifiedOfficers(unifiedUserData.officers || []);
      setUnifiedManagers(unifiedUserData.managers || []);
      setUnifiedAssistants(unifiedUserData.assistants || []);
      setUnifiedUserData(unifiedUserData);

      const newAllTasks = Array.isArray(allTasksData) ? allTasksData : [];
      const newStagesByDept = new Map<string, any[]>();
      stagesResults.forEach((r: any) => newStagesByDept.set(r.deptId, r.stages));
      setAllTasks(newAllTasks);
      setStagesByDept(newStagesByDept);

      // Neither of these depends on the other's result, so run them concurrently instead of
      // chaining — fetchClassRequirements shares its in-flight request with the identical
      // query fetchTasks() already issued above, via the cache in taskManagerData.ts.
      const [{ enhancedTasksData: enhancedMap }, requirementRows] = await Promise.all([
        enhanceTasksWithIndividualData(newAllTasks),
        fetchClassRequirements(),
      ]);
      setEnhancedTasksData(enhancedMap);

      // Expected total time per job level (tm_class_requirements.expected_total_time_minutes),
      // same source ReportsPage's "Expected Time" column reads from — fetched here across
      // every unique job level actually present in the loaded tasks, since this page spans
      // every department at once rather than one department at a time.
      //
      // A `.in('job_level', [...])` bulk query was tried here to replace the old one-round-trip-
      // per-job-level loop, but PostgREST's `in.(...)` list syntax doesn't escape the internal
      // double-quotes of a JSON-string element, so it broke on every payload ("invalid input
      // syntax for type json"). tm_class_requirements is small (a handful of KB), so instead
      // fetch it once, unfiltered, and match client-side — via fetchClassRequirements() above,
      // whose short-lived cache means this reuses the exact same request fetchTasks() already
      // issued for its own internal requirements lookup rather than hitting the network again.
      // This also sidesteps jsonb equality being type-strict (some rows store class_id as a
      // number, others as a string for the same class) by canonicalizing every id to a string
      // before comparing, which the old per-row `.eq()` didn't do either.
      const canonicalJobLevelKey = (jl: any) => JSON.stringify({
        department_id: jl?.department_id != null ? String(jl.department_id) : null,
        subdepartment_id: jl?.subdepartment_id != null ? String(jl.subdepartment_id) : null,
        class_id: jl?.class_id != null ? String(jl.class_id) : null,
        subclass_id: jl?.subclass_id != null ? String(jl.subclass_id) : null,
        level: jl?.level != null ? Number(jl.level) : 1,
      });

      const jobLevels = new Map<string, any>();
      newAllTasks.forEach((task: any) => {
        const key = buildJobLevelKey(task);
        if (!jobLevels.has(key)) {
          const jl = task.job_level || {};
          jobLevels.set(key, {
            department_id: jl.department_id || task.department_id,
            subdepartment_id: jl.subdepartment_id || null,
            class_id: jl.class_id || null,
            subclass_id: jl.subclass_id || null,
            level: jl.level || 1,
          });
        }
      });

      const newExpectedTimeMap = new Map<string, number>();
      const newPromisedTimeMap = new Map<string, { defaultMinutes: number | null; conditions: { value: string; minutes: number }[] }>();
      // Same single-fetch-then-match pattern as above, extended to also pull Promised Time
      // (default + conditions) off the same rows — one query covers both derived-time columns.
      if (requirementRows) {
        const byCanonicalKey = new Map<string, any>();
        requirementRows.forEach((row: any) => {
          byCanonicalKey.set(canonicalJobLevelKey(row.job_level), row);
        });
        jobLevels.forEach((jobLevel, key) => {
          const row = byCanonicalKey.get(canonicalJobLevelKey(jobLevel));
          if (!row) return;
          if (typeof row.expected_total_time_minutes === 'number') newExpectedTimeMap.set(key, row.expected_total_time_minutes);
          const pt = row.promised_time || {};
          const hasDefault = typeof pt.defaultMinutes === 'number';
          const conditions = Array.isArray(pt.conditions)
            ? pt.conditions.filter((c: any) => c && typeof c.value === 'string' && typeof c.minutes === 'number')
            : [];
          if (hasDefault || conditions.length > 0) {
            newPromisedTimeMap.set(key, { defaultMinutes: hasDefault ? pt.defaultMinutes : null, conditions });
          }
        });
      }
      setExpectedTimeByJobLevel(newExpectedTimeMap);
      setPromisedTimeByJobLevel(newPromisedTimeMap);
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

  // ── Row actions: Edit / Cancel / Reactivate / Delete ──
  // Same tm_tasks writes as DepartmentTasksManager's handleTaskEdit/handleCancelTask/
  // handleUncancelTask/DeleteButton, just updating this page's own allTasks state afterward
  // instead of that module's tasks list.
  const handleEditTask = useCallback((task: any) => {
    setEditingTask(task);
    setEditDialogOpen(true);
  }, []);

  const handleTaskUpdated = useCallback((updatedTask: any) => {
    setAllTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setEditDialogOpen(false);
    setEditingTask(null);
  }, []);

  const handleRequestCancel = useCallback((task: any) => {
    setTaskToCancel(task);
    setCancelDialogOpen(true);
  }, []);

  const handleRequestUncancel = useCallback((task: any) => {
    setTaskToUncancel(task);
    setUncancelDialogOpen(true);
  }, []);

  const handleRequestDelete = useCallback((task: any) => {
    setTaskToDelete(task);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmCancel = useCallback(async (reason: string) => {
    if (!taskToCancel) return;
    setIsMutatingTask(true);
    try {
      const cancellation_details = {
        reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: unifiedUserData?.user?.id || null,
        previous_status: taskToCancel.status || 'pending',
      };
      const { error } = await supabase
        .from('tm_tasks')
        .update({ status: 'cancel', cancellation_details, updated_at: new Date().toISOString() })
        .eq('id', taskToCancel.id);
      if (error) throw error;
      setAllTasks(prev => prev.map(t => t.id === taskToCancel.id ? { ...t, status: 'cancel', cancellation_details } : t));
      toast({ title: 'Success', description: 'Task cancelled successfully' });
    } catch (err) {
      console.error('Error cancelling task:', err);
      toast({ title: 'Error', description: 'Failed to cancel task. Please try again.', variant: 'destructive' });
    } finally {
      setIsMutatingTask(false);
      setCancelDialogOpen(false);
      setTaskToCancel(null);
    }
  }, [taskToCancel, unifiedUserData]);

  const handleConfirmUncancel = useCallback(async () => {
    if (!taskToUncancel) return;
    setIsMutatingTask(true);
    try {
      const previousStatus = taskToUncancel.cancellation_details?.previous_status || 'pending';
      const { error } = await supabase
        .from('tm_tasks')
        .update({ status: previousStatus, cancellation_details: null, updated_at: new Date().toISOString() })
        .eq('id', taskToUncancel.id);
      if (error) throw error;
      setAllTasks(prev => prev.map(t => t.id === taskToUncancel.id ? { ...t, status: previousStatus, cancellation_details: null } : t));
      toast({ title: 'Task reactivated successfully', description: 'The task has been restored to its previous status.' });
    } catch (err) {
      console.error('Error reactivating task:', err);
      toast({ title: 'Error', description: 'Failed to reactivate task. Please try again.', variant: 'destructive' });
    } finally {
      setIsMutatingTask(false);
      setUncancelDialogOpen(false);
      setTaskToUncancel(null);
    }
  }, [taskToUncancel]);

  const handleConfirmDelete = useCallback(async () => {
    if (!taskToDelete) return;
    setIsMutatingTask(true);
    try {
      const { error } = await supabase.from('tm_tasks').delete().eq('id', taskToDelete.id);
      if (error) throw error;
      setAllTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
      toast({ title: 'Success', description: 'Task deleted successfully' });
    } catch (err) {
      console.error('Error deleting task:', err);
      toast({ title: 'Error', description: 'Failed to delete task. Please try again.', variant: 'destructive' });
    } finally {
      setIsMutatingTask(false);
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  }, [taskToDelete]);

  // Every current-stage lookup must use the stage list for the task's OWN department —
  // merging stages across departments would corrupt applicability checks for tasks whose
  // department doesn't carry a given stage.
  const getTaskStages = useCallback((task: any) => stagesByDept.get(task.department_id?.toString()) || [], [stagesByDept]);
  const getCanonicalCurrentStageForTask = useCallback((task: any) => getCanonicalCurrentStage(task, getTaskStages(task), departments), [getTaskStages, departments]);
  const getCurrentOfficerStageForTask = useCallback((task: any) => getCurrentOfficerStage(task, getTaskStages(task), departments), [getTaskStages, departments]);
  const getStageOfficerIdsForTask = useCallback((task: any, mode: 'current' | 'history' = 'current') => getStageOfficerIds(task, getTaskStages(task), mode, departments), [getTaskStages, departments]);
  const isTaskWithClientForTask = useCallback((task: any) => isTaskWithClient(task, getTaskStages(task), departments), [getTaskStages, departments]);

  // Same "highest completed index, then next applicable stage" algorithm ReportsPage's
  // visible "Current Stage Follow-Up" column uses (getCurrentStageStatus in
  // tasks/overall-view/tableUtils.tsx) — this page already computes it via
  // getCanonicalCurrentStageForTask for the Officers/Managers/Clients perspective tabs, just
  // never exposed the stage's own name as a column until now.
  const getCurrentStageNameForTask = useCallback((task: any) => getCanonicalCurrentStageForTask(task)?.name || null, [getCanonicalCurrentStageForTask]);

  // "Stages Time Expected" — sum of applicable stage.estimated_time (the Stages module's
  // "Overall Expected Time"). Purely informational now; no longer feeds Planned/Actual
  // Execution or the Overdue status tab — those are anchored on Promised Time instead.
  const getExpectedMinutesForTask = useCallback((task: any) => {
    const stored = expectedTimeByJobLevel.get(buildJobLevelKey(task));
    if (typeof stored === 'number') return stored;
    let total = 0;
    getTaskStages(task).forEach((stage: any) => {
      if (stage.estimated_time && isStageApplicableToTask(stage, task, departments)) total += stage.estimated_time;
    });
    return total;
  }, [expectedTimeByJobLevel, getTaskStages, departments]);

  // Promised/Planned/Actual Execution math lives in utils/executionMath.ts — shared with
  // Company Profiles (and any future task-list page) so the same task can't show two
  // different Promised Times or overdue statuses depending on which page you're looking at.
  const getApplicationTypeForTask = useCallback((task: any) => getApplicationTypeForTaskShared(task, enhancedTasksData), [enhancedTasksData]);

  const getPromisedTimeResolutionForTask = useCallback((task: any) => getPromisedTimeResolution(task, promisedTimeByJobLevel, enhancedTasksData), [promisedTimeByJobLevel, enhancedTasksData]);

  const getPromisedMinutesForTask = useCallback((task: any): number | null => getPromisedTimeResolutionForTask(task).minutes, [getPromisedTimeResolutionForTask]);

  const getReqReceivedCompletedDateForTask = useCallback((task: any): Date | null => getReqReceivedCompletedDate(task), []);

  const getPlannedExecutionDateForTask = useCallback((task: any): Date | null =>
    getPlannedExecutionDate(getReqReceivedCompletedDateForTask(task), getPromisedMinutesForTask(task)),
    [getReqReceivedCompletedDateForTask, getPromisedMinutesForTask]);

  const getActualTimeInfoForTask = useCallback((task: any) =>
    getActualExecutionInfo(getReqReceivedCompletedDateForTask(task), getPromisedMinutesForTask(task)),
    [getReqReceivedCompletedDateForTask, getPromisedMinutesForTask]);

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

  // Department/Sub-department tabs count against the "live pipeline" (Enquiry + WIP), not
  // every task ever created — wrapped-up completed/archived/cancelled work would otherwise
  // pad these parent tabs with cases nobody's actively watching there.
  const activePipelineTasks = useMemo(() => allTasks.filter(t => !TERMINAL_STATUSES.includes(t.status)), [allTasks]);

  const tasksInActiveDept = useMemo(() => activeDeptId === 'all' ? [] : activePipelineTasks.filter(t => t.department_id?.toString() === activeDeptId), [activePipelineTasks, activeDeptId]);
  const tasksInActiveSubDept = useMemo(() => activeSubDeptId === 'all' ? [] : tasksInActiveDept.filter(t => t.subdepartment_id?.toString() === activeSubDeptId), [tasksInActiveDept, activeSubDeptId]);

  const deptTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: activePipelineTasks.length };
    departments.forEach((d: any) => { counts[d.id.toString()] = activePipelineTasks.filter(t => t.department_id?.toString() === d.id.toString()).length; });
    return counts;
  }, [activePipelineTasks, departments]);

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
  // "All Departments" has no single department to scope assignments to — every officer/
  // manager in the system is fair game there, so fall back to the full unified lists instead
  // of an empty array (previously left the sub-tabs empty whenever no department was picked,
  // which is the default state on page load).
  const availableOfficers = useMemo(() => {
    if (activeDeptId === 'all') return unifiedOfficers;
    const allUsers = [...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants];
    const departmentUsers = userService.getDepartmentUsers(allUsers, activeDeptId, activeSubDeptId !== 'all' ? activeSubDeptId : undefined);
    const allowedIds = new Set(departmentUsers.officers.map((o: any) => o.id));
    return unifiedOfficers.filter((o: any) => allowedIds.has(o.id));
  }, [activeDeptId, activeSubDeptId, unifiedOfficers, unifiedManagers, unifiedAssistants]);

  const availableTaskManagers = useMemo(() => {
    if (activeDeptId === 'all') return unifiedManagers;
    const departmentUsers = userService.getDepartmentUsers([...unifiedOfficers, ...unifiedManagers, ...unifiedAssistants], activeDeptId, activeSubDeptId !== 'all' ? activeSubDeptId : undefined);
    const allowedIds = new Set(departmentUsers.managers.map((m: any) => m.id));
    return unifiedManagers.filter((m: any) => allowedIds.has(m.id));
  }, [activeDeptId, activeSubDeptId, unifiedOfficers, unifiedManagers, unifiedAssistants]);

  // 'current' = tasks actually AT an officer stage right now. 'history' = every officer ever
  // attached to any of the task's officer-follow_up stages, with no gate on the task's current
  // stage — same current/history split as ReportsPage's PersonFilterStrip mode selector.
  const officerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const pool = officerFilterMode === 'current'
      ? statusScopedTasks.filter(t => getCurrentOfficerStageForTask(t) !== null)
      : statusScopedTasks;
    availableOfficers.forEach((o: any) => {
      const c = pool.filter(t => getStageOfficerIdsForTask(t, officerFilterMode).includes(o.id.toString())).length;
      counts[o.id.toString()] = c;
      counts.all += c;
    });
    const unallocated = pool.filter(t => getStageOfficerIdsForTask(t, officerFilterMode).length === 0).length;
    counts.all += unallocated;
    return counts;
  }, [statusScopedTasks, availableOfficers, getCurrentOfficerStageForTask, getStageOfficerIdsForTask, officerFilterMode]);

  const officersCount = officerCounts.all;
  const managersCount = useMemo(() => statusScopedTasks.filter(t => getCanonicalCurrentStageForTask(t)?.follow_up?.toLowerCase() === 'bcl').length, [statusScopedTasks, getCanonicalCurrentStageForTask]);
  const clientsCount = useMemo(() => statusScopedTasks.filter(t => isTaskWithClientForTask(t)).length, [statusScopedTasks, isTaskWithClientForTask]);

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
      // Same current/history split as ReportsPage's tasksByFilters: 'current' is gated to
      // tasks AT an officer stage right now; 'history' has no such gate — a task can have
      // moved on to BCL/Client while still counting toward an officer's completed history.
      if (officerFilterMode === 'current') {
        if (!getCurrentOfficerStageForTask(task)) return false;
        if (activeOfficerId !== 'all' && !getStageOfficerIdsForTask(task, 'current').includes(activeOfficerId)) return false;
      } else {
        if (activeOfficerId !== 'all' && !getStageOfficerIdsForTask(task, 'history').includes(activeOfficerId)) return false;
      }
    }
    if (activePerspective === 'managers') {
      if (getCanonicalCurrentStageForTask(task)?.follow_up?.toLowerCase() !== 'bcl') return false;
      if (activeManagerId !== 'all' && task.task_manager?.id?.toString() !== activeManagerId) return false;
    }
    if (activePerspective === 'clients' && !isTaskWithClientForTask(task)) return false;
    return true;
  }), [statusScopedTasks, activePerspective, activeOfficerId, activeManagerId, officerFilterMode, getCurrentOfficerStageForTask, getStageOfficerIdsForTask, getCanonicalCurrentStageForTask, isTaskWithClientForTask]);

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
    if (columnId === 'company') return (resolveCompanyName(task, companies) || '').toLowerCase();
    if (columnId === 'applicant') return (task.applicant_name || '').toLowerCase();
    if (columnId === 'job_description') return (task.job_description || '').toLowerCase();
    if (columnId === 'company_prefix' || columnId === 'sponsor_name' || columnId === 'application_type' || columnId === 'duration') return '';
    if (columnId === 'current_stage') return (getCurrentStageNameForTask(task) || '').toLowerCase();
    if (columnId === 'promised_time') return getPromisedMinutesForTask(task) ?? 0;
    if (columnId === 'planned_execution') return getPlannedExecutionDateForTask(task)?.getTime() ?? 0;
    if (columnId === 'actual_execution') return getActualTimeInfoForTask(task)?.actualMinutes ?? 0;
    if (columnId === 'execution_delta') return getActualTimeInfoForTask(task)?.deltaMinutes ?? 0;
    if (columnId === 'stages_time_expected') return getExpectedMinutesForTask(task);
    const milestone = MILESTONE_STAGE_COLUMNS.find(c => c.key === columnId);
    if (milestone) {
      const stageData = task.stages?.[milestone.stageId];
      const raw = stageData?.date || stageData?.completedAt || null;
      const parsed = raw ? parseDateSafe(raw) : null;
      return parsed ? parsed.getTime() : 0;
    }
    return '';
  }, [companies, getExpectedMinutesForTask, getActualTimeInfoForTask, getPromisedMinutesForTask, getPlannedExecutionDateForTask, getCurrentStageNameForTask]);

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

  // Exports exactly what's currently on screen — same filtered/sorted rows and visible
  // columns as the SummaryTable, via the shared cell-resolution helpers it uses.
  const handleExport = useCallback(async (format: 'excel' | 'pdf') => {
    if (sortedTasks.length === 0) {
      toast({ title: "No Data", description: "No tasks available to export." });
      return;
    }
    const visibleColumns = SUMMARY_COLUMNS.filter(c => visibleColumnIds.includes(c.id));
    const exportParams = {
      tasks: sortedTasks,
      columns: visibleColumns,
      companies,
      departments,
      enhancedTasksData,
      getExpectedMinutesForTask,
      getActualTimeInfoForTask,
      getPromisedMinutesForTask,
      getPlannedExecutionDateForTask,
      getCurrentStageNameForTask,
      showTime,
      scopeName: departments.find((d: any) => d.id.toString() === activeDeptId)?.name,
      statusLabel: STATUS_LABELS[activeTaskStatus] || 'All Applications',
    };
    setIsExporting(format);
    try {
      if (format === 'excel') await exportSummaryReportToExcel(exportParams);
      else await exportSummaryReportToPDF(exportParams);
      toast({ title: "Export Complete", description: `Summary report exported as ${format.toUpperCase()}.` });
    } catch (err) {
      console.error('Error exporting summary report:', err);
      toast({ title: "Error", description: "Failed to export summary report.", variant: "destructive" });
    } finally {
      setIsExporting(null);
    }
  }, [sortedTasks, visibleColumnIds, companies, departments, enhancedTasksData, getExpectedMinutesForTask, getActualTimeInfoForTask, getPromisedMinutesForTask, getPlannedExecutionDateForTask, getCurrentStageNameForTask, showTime, activeDeptId, activeTaskStatus]);

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
      {/* Title Bar — the title is the first thing on the page and is sized/weighted to read
          as such; an accent bar gives it an anchor instead of relying on size alone. */}
      <div className="border-b border-slate-200 bg-white px-8 py-6 antialiased flex flex-col justify-center">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <span className="h-9 w-1.5 rounded-full bg-custom-blue shrink-0" />
            <div className="min-w-0 flex flex-col gap-1.5">
              <h1 className="text-[28px] font-black text-slate-900 uppercase tracking-tight truncate leading-none">
                Summary Reports Dashboard
              </h1>
              <div className="flex items-center text-sm text-slate-500 font-semibold gap-1">
                <Building2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#376bae' }} />
                <span className="font-bold" style={{ color: '#376bae' }}>{activeDepartment?.name || "All Departments"}</span>
                <span className="text-slate-300 mx-0.5">/</span>
                <span className="truncate text-slate-500">{breadcrumbSubtext}</span>
              </div>
            </div>
          </div>

          {/* Secondary controls — normal squared buttons matching the tab design above. */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ColumnVisibilityDialog visibleColumnIds={visibleColumnIds} setVisibleColumnIds={setVisibleColumnIds} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmptySubDepts((v) => !v)}
              className={cn(
                "h-9 px-4 rounded-md text-sm font-bold gap-2 transition-all",
                !showEmptySubDepts ? "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              title={showEmptySubDepts ? "Hide sub-departments with no tasks" : "Show every sub-department, including empty ones"}
            >
              <ListFilter className="h-3.5 w-3.5" />
              {showEmptySubDepts ? "Show With Tasks" : "Show All"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTime((v) => !v)}
              className={cn(
                "h-9 px-4 rounded-md text-sm font-bold gap-2 transition-all",
                showTime ? "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue" : "border-slate-200 text-slate-600 hover:bg-slate-50"
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
                "h-9 px-4 rounded-md text-sm font-bold gap-2 transition-all",
                showDelta ? "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {showDelta ? "Hide Δ" : "Show Δ"}
            </Button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={!!isExporting}
                  className="h-9 px-4 rounded-md text-sm font-bold gap-2 text-white hover:bg-[#2d5a94] shadow-sm disabled:opacity-70"
                  style={{ backgroundColor: '#376bae' }}
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                  {isExporting ? `Exporting ${isExporting.toUpperCase()}...` : "Export"}
                  {!isExporting && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleExport('excel')} disabled={!!isExporting} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={!!isExporting} className="gap-2 cursor-pointer">
                  <FileText className="h-4 w-4 text-red-600" />
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Scope + Status + Perspective controls — flat, stacked directly under the title bar
          (no per-section card/shadow), matching ReportsPage's header stack. Each row carries
          its own border-b as the only separator. */}
      <HierarchyTabs
        departments={departments}
        activeDeptId={activeDeptId} setActiveDeptId={setActiveDeptId}
        activeSubDeptId={activeSubDeptId} setActiveSubDeptId={setActiveSubDeptId}
        deptTaskCounts={deptTaskCounts} subDeptTaskCounts={subDeptTaskCounts}
        availableClasses={availableClasses} activeClassIds={activeClassIds} setActiveClassIds={setActiveClassIds} classCounts={classCounts}
        availableSubClasses={availableSubClasses} activeSubClassIds={activeSubClassIds} setActiveSubClassIds={setActiveSubClassIds} subClassCounts={subClassCounts}
      />
      <StatusTabs
        activeTaskStatus={activeTaskStatus} setActiveTaskStatus={setActiveTaskStatus} counts={taskStatusCounts}
        activePerspective={activePerspective} setActivePerspective={setActivePerspective}
        allCount={statusScopedTasks.length} officersCount={officersCount} managersCount={managersCount} clientsCount={clientsCount}
        officerFilterMode={officerFilterMode} setOfficerFilterMode={setOfficerFilterMode}
        refreshData={handleRefresh} loading={isRefreshing}
      />
      <PerspectiveTabs
        activePerspective={activePerspective}
        availableOfficers={availableOfficers} activeOfficerId={activeOfficerId} setActiveOfficerId={setActiveOfficerId} officerCounts={officerCounts}
        availableTaskManagers={availableTaskManagers} activeManagerId={activeManagerId} setActiveManagerId={setActiveManagerId} managerCounts={managerCounts}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
      />

      <SummaryTable
        tasks={sortedTasks} companies={companies} departments={departments} activeDeptId={activeDeptId}
        showEmptyGroups={showEmptySubDepts}
        showTime={showTime} showDelta={showDelta}
        sortConfig={sortConfig} handleSort={handleSort}
        enhancedTasksData={enhancedTasksData}
        getExpectedMinutesForTask={getExpectedMinutesForTask}
        getActualTimeInfoForTask={getActualTimeInfoForTask}
        getPromisedMinutesForTask={getPromisedMinutesForTask}
        getPromisedTimeResolutionForTask={getPromisedTimeResolutionForTask}
        getPlannedExecutionDateForTask={getPlannedExecutionDateForTask}
        getCurrentStageNameForTask={getCurrentStageNameForTask}
        visibleColumnIds={visibleColumnIds}
        onEditTask={handleEditTask}
        onRequestCancel={handleRequestCancel}
        onRequestUncancel={handleRequestUncancel}
        onRequestDelete={handleRequestDelete}
      />

      {/* Edit dialog — the exact EnquiryDialog DepartmentTasksManager reuses for editing,
          fed the same departments/userData/taskToEdit shape so task edits behave identically
          regardless of which module opened them. */}
      <EnquiryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        taskToEdit={editingTask}
        departments={departments}
        userData={unifiedUserData}
        onEnquiryCreated={handleTaskUpdated}
      />

      <CancelConfirmationDialog
        open={cancelDialogOpen}
        onOpenChange={(open: boolean) => { setCancelDialogOpen(open); if (!open) setTaskToCancel(null); }}
        onConfirm={handleConfirmCancel}
        loading={isMutatingTask}
      />

      <Dialog open={uncancelDialogOpen} onOpenChange={(open) => { setUncancelDialogOpen(open); if (!open) setTaskToUncancel(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-green-600">Reactivate Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to reactivate this task? It will be restored to its previous status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setUncancelDialogOpen(false); setTaskToUncancel(null); }} disabled={isMutatingTask}>
              Cancel
            </Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleConfirmUncancel} disabled={isMutatingTask}>
              {isMutatingTask ? "Reactivating..." : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={(open: boolean) => { setDeleteDialogOpen(open); if (!open) setTaskToDelete(null); }}
        onConfirm={handleConfirmDelete}
        title="Delete Task"
        description="This action cannot be undone. This will permanently delete this task."
        loading={isMutatingTask}
      />
    </div>
  );
}
