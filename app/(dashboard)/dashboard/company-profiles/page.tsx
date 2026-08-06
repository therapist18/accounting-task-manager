// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Loader2, Building2, User, Briefcase, ChevronRight, RotateCcw, PanelLeftClose, PanelLeftOpen, Columns2, ChevronsRight } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { fetchDepartments } from "../departments/departments/database";
import { fetchTasks, fetchStages, fetchCompanies } from "../tasks/utils/taskManagerData";
import { fetchCompanies as fetchAllCompanies, type Company } from "../companies/database";
import { fetchIndividuals, type Individual } from "../individuals/database";
import { enhanceTasksWithIndividualData } from "../tasks/overall-view/tableUtils";
import { isStageApplicableToTask } from "../reports/utils/reportStageLogic";
import { CompanySidebar } from "./components/CompanySidebar";
import { IndividualSidebar } from "./components/IndividualSidebar";
import { TaskListTable } from "./components/TaskListTable";
import { CountBadge, applySortAndFilter, type SortMode, type FilterMode } from "./components/RosterListShared";
import { PillTrack } from "../summary-reports/components/PageHeader";

const buildJobLevelKey = (task: any) => {
  const jl = task.job_level || {};
  return JSON.stringify({
    department_id: Number(jl.department_id || task.department_id),
    subdepartment_id: jl.subdepartment_id || null,
    class_id: jl.class_id || null,
    subclass_id: jl.subclass_id || null,
  });
};

export default function CompanyProfilesPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, { name: string; prefix: string }>>(new Map());
  // Every company in the system, not just ones with an existing task — fetched via the same
  // canonical companies/database.ts source the Companies module uses, so the sidebar always
  // lists every company (with a 0 task count) rather than only ones that already happen to
  // have task history. Kept separate from `companies` above (the Map<id,{name,prefix}> shape
  // fetchTasks/TaskListTable actually need for task display) since the canonical Company type
  // has no company_prefix field.
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  // Every individual in the system, not just ones with an existing task — same rationale as
  // allCompanies above, fetched from registry_individuals via individuals/database.ts.
  const [allIndividualsRegistry, setAllIndividualsRegistry] = useState<Individual[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [stagesByDept, setStagesByDept] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());
  const [expectedTimeByJobLevel, setExpectedTimeByJobLevel] = useState<Map<string, number>>(new Map());

  const [viewMode, setViewMode] = useState<'company' | 'individual'>('company');

  // Collapsible resizable panels — the roster sidebar and the "This Company / This
  // Individual" detail panel can both be tucked away to give the table maximum room.
  const rosterPanelRef = useRef<ImperativePanelHandle>(null);
  const detailPanelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState({ roster: false, detail: false });

  const togglePanel = useCallback((key: 'roster' | 'detail') => {
    const panel = key === 'roster' ? rosterPanelRef.current : detailPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand(); else panel.collapse();
  }, []);

  // Selecting a company / individual brings the detail panel back if the user had tucked
  // it away, so the drill-down is never silently hidden.
  const ensureDetailExpanded = useCallback(() => {
    const panel = detailPanelRef.current;
    if (panel?.isCollapsed()) panel.expand();
  }, []);

  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [companySortMode, setCompanySortMode] = useState<SortMode>('name');
  const [companyFilterMode, setCompanyFilterMode] = useState<FilterMode>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [individualSearchQuery, setIndividualSearchQuery] = useState("");
  const [individualSortMode, setIndividualSortMode] = useState<SortMode>('name');
  const [individualFilterMode, setIndividualFilterMode] = useState<FilterMode>('withTasks');
  const [selectedIndividualId, setSelectedIndividualId] = useState<string | null>(null);

  const loadAllData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const depts = await fetchDepartments();
      setDepartments(depts);

      const [comps, allComps, allInds] = await Promise.all([fetchCompanies(), fetchAllCompanies(), fetchIndividuals()]);
      setCompanies(comps);
      setAllCompanies(allComps);
      setAllIndividualsRegistry(allInds);

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

      const { enhancedTasksData: enhancedMap } = await enhanceTasksWithIndividualData(newAllTasks);
      setEnhancedTasksData(enhancedMap);

      // Expected total time per job level — same source as Summary Reports Dashboard's
      // "Expected Time" column, used here to judge whether a completed task ran on time.
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
      toast({ title: "Error", description: "Could not load company profiles data.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAllData(true);
    setIsRefreshing(false);
    toast({ title: "Refreshed", description: "Company profiles data has been updated." });
  }, [loadAllData]);

  const getTaskStages = useCallback((task: any) => stagesByDept.get(task.department_id?.toString()) || [], [stagesByDept]);
  const getExpectedMinutesForTask = useCallback((task: any) => {
    const stored = expectedTimeByJobLevel.get(buildJobLevelKey(task));
    if (typeof stored === 'number') return stored;
    let total = 0;
    getTaskStages(task).forEach((stage: any) => {
      if (stage.estimated_time && isStageApplicableToTask(stage, task, departments)) total += stage.estimated_time;
    });
    return total;
  }, [expectedTimeByJobLevel, getTaskStages, departments]);

  // ── Company roster (every company, 0-task ones included) ──
  const companiesBase = useMemo(() => {
    const counts = new Map<number, number>();
    allTasks.forEach(t => { if (t.company_id != null) counts.set(t.company_id, (counts.get(t.company_id) || 0) + 1); });
    return allCompanies.map((c) => {
      const id = Number(c.id);
      return { id, name: c.company_name || companies.get(id)?.name || `Company ${id}`, prefix: companies.get(id)?.prefix, taskCount: counts.get(id) || 0 };
    });
  }, [allTasks, allCompanies, companies]);

  const companiesWithTasks = useMemo(() => {
    const q = companySearchQuery.trim().toLowerCase();
    const searched = q ? companiesBase.filter(c => c.name.toLowerCase().includes(q)) : companiesBase;
    return applySortAndFilter(searched, companySortMode, companyFilterMode);
  }, [companiesBase, companySearchQuery, companySortMode, companyFilterMode]);

  const selectedCompany = useMemo(() => companiesBase.find(c => c.id.toString() === selectedCompanyId)
    || (selectedCompanyId ? { id: Number(selectedCompanyId), name: companies.get(Number(selectedCompanyId))?.name || 'Company', prefix: companies.get(Number(selectedCompanyId))?.prefix, taskCount: 0 } : null),
    [companiesBase, selectedCompanyId, companies]);

  const tasksForSelectedCompany = useMemo(() => {
    if (!selectedCompanyId) return [];
    return allTasks.filter(t => t.company_id?.toString() === selectedCompanyId);
  }, [allTasks, selectedCompanyId]);

  // Company itself as the applicant (e.g. a business licence) vs. an individual's task
  // (e.g. a work permit) — see task.applicant_details.type.
  const companyLevelTasks = useMemo(() => tasksForSelectedCompany.filter(t => t.applicant_details?.type === 'company'), [tasksForSelectedCompany]);
  const individualTasksAtCompany = useMemo(() => tasksForSelectedCompany.filter(t => t.applicant_details?.type !== 'company'), [tasksForSelectedCompany]);

  const individualsAtCompany = useMemo(() => {
    const map = new Map<string, { id: string; name: string; taskCount: number }>();
    individualTasksAtCompany.forEach(t => {
      const id = (t.individual_id ?? t.applicant_details?.id)?.toString();
      if (!id) return;
      const name = t.applicant_name || t.applicant_details?.name || `Individual ${id}`;
      const existing = map.get(id);
      if (existing) existing.taskCount += 1;
      else map.set(id, { id, name, taskCount: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [individualTasksAtCompany]);

  // ── Individual roster: every individual in registry_individuals, not just ones with an
  // existing task — same rationale as companiesBase. Task count / company count are overlaid
  // from allTasks and default to 0 for individuals with no task history yet. ──
  const individualsBase = useMemo(() => {
    const taskInfoById = new Map<string, { taskCount: number; companyIds: Set<number>; name?: string }>();
    allTasks.forEach(t => {
      if (t.applicant_details?.type === 'company') return;
      const id = (t.individual_id ?? t.applicant_details?.id)?.toString();
      if (!id) return;
      const existing = taskInfoById.get(id);
      if (existing) {
        existing.taskCount += 1;
        if (t.company_id != null) existing.companyIds.add(t.company_id);
      } else {
        taskInfoById.set(id, {
          taskCount: 1,
          companyIds: new Set(t.company_id != null ? [t.company_id] : []),
          name: t.applicant_name || t.applicant_details?.name,
        });
      }
    });

    return allIndividualsRegistry.map((ind) => {
      const id = ind.id.toString();
      const info = taskInfoById.get(id);
      return {
        id,
        name: ind.full_name || info?.name || `Individual ${id}`,
        taskCount: info?.taskCount || 0,
        companyCount: info?.companyIds.size || 0,
      };
    });
  }, [allTasks, allIndividualsRegistry]);

  const allIndividuals = useMemo(() => {
    const q = individualSearchQuery.trim().toLowerCase();
    const searched = q ? individualsBase.filter(i => i.name.toLowerCase().includes(q)) : individualsBase;
    return applySortAndFilter(searched, individualSortMode, individualFilterMode);
  }, [individualsBase, individualSearchQuery, individualSortMode, individualFilterMode]);

  // Reset the drilled-into individual whenever the company changes, or if they don't
  // actually have a task at the newly selected company (Company mode only).
  useEffect(() => {
    if (viewMode === 'company' && selectedIndividualId && !individualsAtCompany.some(i => i.id === selectedIndividualId)) {
      setSelectedIndividualId(null);
    }
  }, [viewMode, individualsAtCompany, selectedIndividualId]);

  const selectedIndividual = useMemo(() => {
    if (!selectedIndividualId) return null;
    return individualsAtCompany.find(i => i.id === selectedIndividualId)
      || individualsBase.find(i => i.id === selectedIndividualId)
      || null;
  }, [selectedIndividualId, individualsAtCompany, individualsBase]);

  // Full job history for the selected individual, across every company — not just the one
  // currently being browsed, since "all the jobs associated" with a person is the point. Used
  // identically whether the individual was reached via a company drill-down or picked
  // directly in Individual mode.
  const globalTasksForSelectedIndividual = useMemo(() => {
    if (!selectedIndividualId) return [];
    return allTasks.filter(t => (t.individual_id ?? t.applicant_details?.id)?.toString() === selectedIndividualId);
  }, [allTasks, selectedIndividualId]);

  const companiesForSelectedIndividual = useMemo(() => {
    if (!selectedIndividualId) return [];
    const map = new Map<number, { id: number; name: string; taskCount: number }>();
    globalTasksForSelectedIndividual.forEach(t => {
      if (t.company_id == null) return;
      const name = companies.get(t.company_id)?.name || t.company_name || `Company ${t.company_id}`;
      const existing = map.get(t.company_id);
      if (existing) existing.taskCount += 1;
      else map.set(t.company_id, { id: t.company_id, name, taskCount: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [globalTasksForSelectedIndividual, companies, selectedIndividualId]);

  const handleSelectCompany = useCallback((id: string) => {
    setSelectedCompanyId(id);
    setSelectedIndividualId(null);
    ensureDetailExpanded();
  }, [ensureDetailExpanded]);

  const handleSelectIndividual = useCallback((id: string) => {
    setSelectedIndividualId(id);
    ensureDetailExpanded();
  }, [ensureDetailExpanded]);

  // Pivot from "this individual" over to "this company" — e.g. clicking a company pill while
  // looking at a person's job history in Individual mode.
  const handlePivotToCompany = useCallback((id: number) => {
    setViewMode('company');
    setSelectedCompanyId(id.toString());
    setSelectedIndividualId(null);
    ensureDetailExpanded();
  }, [ensureDetailExpanded]);

  const handleModeChange = useCallback((mode: 'company' | 'individual') => {
    setViewMode(mode);
    setSelectedIndividualId(null);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-slate-100 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Company Profiles...</p>
        </div>
      </div>
    );
  }

  const showIndividualDetail = viewMode === 'individual' ? !!selectedIndividualId : !!(selectedCompany && selectedIndividual);

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50">
      <ResizablePanelGroup direction="horizontal" autoSaveId="company-profiles-layout">
        {/* LEFT: Companies / Individuals roster — collapses to a slim rail with its own
            floating expand toggle at the top-right. */}
        <ResizablePanel
          ref={rosterPanelRef}
          defaultSize={22}
          minSize={17}
          maxSize={36}
          collapsible
          collapsedSize={3}
          onCollapse={() => setCollapsed(prev => ({ ...prev, roster: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, roster: false }))}
        >
          {collapsed.roster ? (
            <div className="h-full w-full flex flex-col items-center gap-3 pt-2 bg-white border-r border-slate-200">
              <button
                onClick={() => togglePanel('roster')}
                title="Show roster panel"
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-1.5 text-slate-400">
                {viewMode === 'company' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                <span className="text-[9px] font-bold text-slate-400 uppercase [writing-mode:vertical-lr]">
                  {viewMode === 'company' ? 'Companies' : 'People'}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col bg-white border-r border-slate-200">
              <div className="px-3 py-3 border-b border-slate-100 shrink-0 flex items-center gap-2">
                <PillTrack
                  value={viewMode}
                  onValueChange={handleModeChange}
                  items={[
                    { id: 'company', label: 'Companies', icon: Building2, activeBg: 'bg-custom-blue' },
                    { id: 'individual', label: 'Individuals', icon: User, activeBg: 'bg-violet-600' },
                  ]}
                />
                <button
                  onClick={() => togglePanel('roster')}
                  title="Hide roster panel"
                  className="ml-auto p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {viewMode === 'company' ? (
                  <CompanySidebar
                    companies={companiesWithTasks}
                    activeCompanyId={selectedCompanyId}
                    onSelect={handleSelectCompany}
                    searchQuery={companySearchQuery}
                    setSearchQuery={setCompanySearchQuery}
                    sortMode={companySortMode} setSortMode={setCompanySortMode}
                    filterMode={companyFilterMode} setFilterMode={setCompanyFilterMode}
                  />
                ) : (
                  <IndividualSidebar
                    individuals={allIndividuals}
                    activeIndividualId={selectedIndividualId}
                    onSelect={handleSelectIndividual}
                    searchQuery={individualSearchQuery}
                    setSearchQuery={setIndividualSearchQuery}
                    sortMode={individualSortMode} setSortMode={setIndividualSortMode}
                    filterMode={individualFilterMode} setFilterMode={setIndividualFilterMode}
                  />
                )}
              </div>
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* MIDDLE: what to look at — Company-Level Tasks / People (Company mode),
            or which companies this person has tasks under (Individual mode). Always
            rendered so the resizable panel stays in the layout; shows a hint when
            nothing has been picked yet. Collapses to a slim rail, same as the roster. */}
        <ResizablePanel
          ref={detailPanelRef}
          defaultSize={20}
          minSize={14}
          maxSize={30}
          collapsible
          collapsedSize={3}
          onCollapse={() => setCollapsed(prev => ({ ...prev, detail: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, detail: false }))}
        >
          {collapsed.detail ? (
            <div className="h-full w-full flex flex-col items-center gap-3 pt-2 bg-white border-r border-slate-200">
              <button
                onClick={() => togglePanel('detail')}
                title="Show detail panel"
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
              <div className="flex flex-col items-center gap-1.5 text-slate-400">
                {viewMode === 'company' ? <Briefcase className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                <span className="text-[9px] font-bold text-slate-400 uppercase [writing-mode:vertical-lr]">Details</span>
              </div>
            </div>
          ) : viewMode === 'company' && selectedCompany ? (
            <div className="h-full flex flex-col bg-white border-r border-slate-200 overflow-y-auto custom-scrollbar">
              <div className="px-4 py-4 border-b border-slate-200 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">This Company</h2>
                  <span className="text-sm text-slate-900 font-bold truncate block">{selectedCompany.name}</span>
                </div>
                <button
                  onClick={() => togglePanel('detail')}
                  title="Hide detail panel"
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
                >
                  <Columns2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2">
                <button
                  onClick={() => setSelectedIndividualId(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors",
                    !selectedIndividualId ? "bg-blue-50 text-custom-blue font-semibold" : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <Briefcase className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-sm truncate">Company-Level Tasks</span>
                  <CountBadge count={companyLevelTasks.length} active={!selectedIndividualId} />
                </button>
              </div>

              {individualsAtCompany.length > 0 && (
                <div className="px-2 pb-2">
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">People ({individualsAtCompany.length})</p>
                  {individualsAtCompany.map((i) => {
                    const isActive = selectedIndividualId === i.id;
                    return (
                      <button
                        key={i.id}
                        onClick={() => setSelectedIndividualId(i.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors",
                          isActive ? "bg-violet-50 text-violet-700 font-semibold" : "hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-sm truncate">{i.name}</span>
                        <CountBadge count={i.taskCount} active={isActive} activeAccent="text-violet-700 bg-violet-600/10" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : viewMode === 'individual' && selectedIndividual ? (
            <div className="h-full flex flex-col bg-white border-r border-slate-200 overflow-y-auto custom-scrollbar">
              <div className="px-4 py-4 border-b border-slate-200 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">This Individual</h2>
                  <span className="text-sm text-slate-900 font-bold truncate block">{selectedIndividual.name}</span>
                </div>
                <button
                  onClick={() => togglePanel('detail')}
                  title="Hide detail panel"
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
                >
                  <Columns2 className="w-4 h-4" />
                </button>
              </div>
              <div className="px-2 pt-2 pb-2">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Companies ({companiesForSelectedIndividual.length})
                </p>
                {companiesForSelectedIndividual.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-400">No company on record for these tasks.</p>
                ) : (
                  companiesForSelectedIndividual.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handlePivotToCompany(c.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-slate-50 text-slate-700"
                      title="View this company's profile"
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-custom-blue" />
                      <span className="flex-1 text-sm truncate">{c.name}</span>
                      <CountBadge count={c.taskCount} />
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 bg-white border-r border-slate-200">
              <p className="text-xs text-slate-400">
                {viewMode === 'company' ? 'Select a company to see its people and tasks.' : 'Select an individual to see their companies and jobs.'}
              </p>
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: main content — the table */}
        <ResizablePanel defaultSize={58} minSize={35}>
          <div className="h-full overflow-y-auto custom-scrollbar">
            {viewMode === 'company' && !selectedCompany && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <Building2 className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700">Select a company</p>
                <p className="text-xs text-slate-400 mt-1">Pick a company from the left to see its people and tasks.</p>
              </div>
            )}
            {viewMode === 'individual' && !selectedIndividual && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <User className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700">Select an individual</p>
                <p className="text-xs text-slate-400 mt-1">Pick a person from the left to see which companies and jobs they've had.</p>
              </div>
            )}

            {((viewMode === 'company' && selectedCompany) || (viewMode === 'individual' && selectedIndividual)) && (
              <div className="p-6 space-y-5">
                {/* Title bar — mirrors Summary Reports Dashboard */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className={cn("h-10 w-10 rounded-xl text-white shadow-sm shrink-0 flex items-center justify-center", showIndividualDetail && viewMode === 'individual' ? "bg-violet-600" : "bg-custom-blue")}>
                      {viewMode === 'individual' ? <User className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <h1 className="text-xl font-black text-slate-900 tracking-tight truncate leading-none">
                        {viewMode === 'individual' ? selectedIndividual.name : selectedCompany.name}
                      </h1>
                      <div className="flex items-center text-sm text-slate-500 font-semibold gap-1 mt-1">
                        {viewMode === 'company' && selectedIndividual ? (
                          <>
                            <button onClick={() => setSelectedIndividualId(null)} className="text-blue-600 hover:underline font-bold">{selectedCompany.name}</button>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                            <span className="text-slate-700">{selectedIndividual.name}</span>
                          </>
                        ) : viewMode === 'individual' ? (
                          <span>{globalTasksForSelectedIndividual.length} job{globalTasksForSelectedIndividual.length === 1 ? '' : 's'} across {companiesForSelectedIndividual.length} compan{companiesForSelectedIndividual.length === 1 ? 'y' : 'ies'}</span>
                        ) : (
                          <span>{tasksForSelectedCompany.length} task{tasksForSelectedCompany.length === 1 ? '' : 's'} total</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="h-9 px-3 rounded-lg text-sm font-bold gap-1.5 text-slate-500 hover:bg-slate-100 shrink-0">
                    <RotateCcw className={isRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                    Refresh
                  </Button>
                </div>

                {showIndividualDetail ? (
                  // ── Individual drill-down: their full job history, everywhere ──
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <User className="h-4 w-4 text-violet-600" />
                      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">
                        {(viewMode === 'individual' ? selectedIndividual : selectedIndividual)?.name}'s Jobs
                      </h2>
                      <span className="text-xs font-bold text-slate-400">({globalTasksForSelectedIndividual.length} across all companies)</span>
                    </div>
                    <TaskListTable
                      tasks={globalTasksForSelectedIndividual}
                      departments={departments}
                      stagesByDept={stagesByDept}
                      companies={companies}
                      enhancedTasksData={enhancedTasksData}
                      getExpectedMinutesForTask={getExpectedMinutesForTask}
                      showCompanyColumn
                      emptyLabel="No jobs found for this individual."
                    />
                  </div>
                ) : (
                  // ── Company-level tasks (e.g. a business licence) — the company itself is the applicant ──
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <Briefcase className="h-4 w-4 text-custom-blue" />
                      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Company-Level Tasks ({companyLevelTasks.length})</h2>
                    </div>
                    <TaskListTable
                      tasks={companyLevelTasks}
                      departments={departments}
                      stagesByDept={stagesByDept}
                      companies={companies}
                      enhancedTasksData={enhancedTasksData}
                      getExpectedMinutesForTask={getExpectedMinutesForTask}
                      emptyLabel="No company-level tasks (e.g. licences) for this company."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}