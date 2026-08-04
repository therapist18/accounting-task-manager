// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, LayoutDashboard, Building2 } from "lucide-react";
import { toast } from "@/lib/hooks/use-toast";
import { fetchDepartments } from "../departments/departments/database";
import { fetchTasks, fetchStages, fetchCompanies } from "../tasks/utils/taskManagerData";
import { userService } from "@/lib/shared-user-assignment-service";
import {
  getCanonicalCurrentStage,
  getCurrentOfficerStage,
  getStageOfficerIds,
  isTaskWithClient,
} from "../reports/utils/reportStageLogic";
import { HierarchyTabs } from "./components/HierarchyTabs";
import { PerspectiveTabs } from "./components/PerspectiveTabs";
import { SummaryTable } from "./components/SummaryTable";

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

  const [activeDeptId, setActiveDeptId] = useState<string>("all");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassId, setActiveClassId] = useState<string>("all");

  const [activePerspective, setActivePerspective] = useState<'all' | 'officers' | 'managers' | 'clients'>('all');
  const [activeOfficerId, setActiveOfficerId] = useState<string>("all");
  const [activeManagerId, setActiveManagerId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  // ── Hierarchy scoping (dept → subdept → class) ──
  const deptScopedTasks = useMemo(() => allTasks.filter(task => {
    if (activeDeptId !== 'all' && task.department_id?.toString() !== activeDeptId) return false;
    if (activeSubDeptId !== 'all' && task.subdepartment_id?.toString() !== activeSubDeptId) return false;
    if (activeClassId !== 'all' && task.class_id?.toString() !== activeClassId) return false;
    return true;
  }), [allTasks, activeDeptId, activeSubDeptId, activeClassId]);

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

  const classTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasksInActiveSubDept.length };
    const activeDepartment = departments.find((d: any) => d.id.toString() === activeDeptId);
    const activeSubDepartment = (activeDepartment?.tm_subdepartments || []).find((s: any) => s.id.toString() === activeSubDeptId);
    (activeSubDepartment?.classes || []).forEach((c: any) => { counts[c.id.toString()] = tasksInActiveSubDept.filter(t => t.class_id?.toString() === c.id.toString()).length; });
    return counts;
  }, [tasksInActiveSubDept, departments, activeDeptId, activeSubDeptId]);

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

  const officersCount = useMemo(() => deptScopedTasks.filter(t => !!getCurrentOfficerStageForTask(t)).length, [deptScopedTasks, getCurrentOfficerStageForTask]);
  const managersCount = useMemo(() => deptScopedTasks.filter(t => getCanonicalCurrentStageForTask(t)?.follow_up?.toLowerCase() === 'bcl').length, [deptScopedTasks, getCanonicalCurrentStageForTask]);
  const clientsCount = useMemo(() => deptScopedTasks.filter(t => isTaskWithClientForTask(t)).length, [deptScopedTasks, isTaskWithClientForTask]);

  const officerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const pool = deptScopedTasks.filter(t => getCurrentOfficerStageForTask(t) !== null);
    availableOfficers.forEach((o: any) => {
      const c = pool.filter(t => getStageOfficerIdsForTask(t, 'current').includes(o.id.toString())).length;
      counts[o.id.toString()] = c;
      counts.all += c;
    });
    return counts;
  }, [deptScopedTasks, availableOfficers, getCurrentOfficerStageForTask, getStageOfficerIdsForTask]);

  const managerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const pool = deptScopedTasks.filter(t => getCanonicalCurrentStageForTask(t)?.follow_up?.toLowerCase() === 'bcl');
    availableTaskManagers.forEach((m: any) => {
      const c = pool.filter(t => t.task_manager?.id?.toString() === m.id.toString()).length;
      counts[m.id.toString()] = c;
      counts.all += c;
    });
    return counts;
  }, [deptScopedTasks, availableTaskManagers, getCanonicalCurrentStageForTask]);

  const perspectiveScopedTasks = useMemo(() => deptScopedTasks.filter(task => {
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
  }), [deptScopedTasks, activePerspective, activeOfficerId, activeManagerId, getCurrentOfficerStageForTask, getStageOfficerIdsForTask, getCanonicalCurrentStageForTask, isTaskWithClientForTask]);

  const searchedTasks = useMemo(() => {
    if (!searchQuery) return perspectiveScopedTasks;
    const q = searchQuery.toLowerCase();
    return perspectiveScopedTasks.filter(t =>
      (t.applicant_name && t.applicant_name.toLowerCase().includes(q)) ||
      (t.company_name && t.company_name.toLowerCase().includes(q)) ||
      (companies.get(t.company_id)?.name?.toLowerCase().includes(q))
    );
  }, [perspectiveScopedTasks, searchQuery, companies]);

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
    <div className="flex flex-col flex-1 overflow-auto bg-white">
      {/* Title Bar — mirrors ReportsHeader */}
      <div className="border-b border-slate-200 bg-white px-8 py-5 antialiased flex flex-col justify-center">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex flex-col gap-1.5">
            <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight truncate leading-none flex items-center gap-2.5">
              <LayoutDashboard className="h-5 w-5 text-blue-500 shrink-0" />
              Summary Reports Dashboard
            </h1>
            <div className="flex items-center text-sm text-slate-500 font-semibold gap-1">
              <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-blue-600 font-bold">{activeDepartment?.name || "All Departments"}</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className="truncate text-slate-500">{breadcrumbSubtext}</span>
            </div>
          </div>
        </div>
      </div>

      <HierarchyTabs
        departments={departments}
        activeDeptId={activeDeptId} setActiveDeptId={setActiveDeptId}
        activeSubDeptId={activeSubDeptId} setActiveSubDeptId={setActiveSubDeptId}
        activeClassId={activeClassId} setActiveClassId={setActiveClassId}
        deptTaskCounts={deptTaskCounts} subDeptTaskCounts={subDeptTaskCounts} classTaskCounts={classTaskCounts}
      />

      <PerspectiveTabs
        activePerspective={activePerspective} setActivePerspective={setActivePerspective}
        allCount={deptScopedTasks.length} officersCount={officersCount} managersCount={managersCount} clientsCount={clientsCount}
        availableOfficers={availableOfficers} activeOfficerId={activeOfficerId} setActiveOfficerId={setActiveOfficerId} officerCounts={officerCounts}
        availableTaskManagers={availableTaskManagers} activeManagerId={activeManagerId} setActiveManagerId={setActiveManagerId} managerCounts={managerCounts}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        refreshData={handleRefresh} loading={isRefreshing}
      />

      <SummaryTable tasks={searchedTasks} companies={companies} />
    </div>
  );
}
