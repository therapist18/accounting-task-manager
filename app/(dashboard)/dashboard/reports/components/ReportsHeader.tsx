// @ts-nocheck
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2, LayoutGrid, FileText, ChevronDown, Clock, User,
  EyeOff, Eye, Filter, RotateCcw, X, TableProperties, Download,
  Search, Send, Shield, Users, Building2, ChevronRight, ChevronLeft,
  Layers, Sparkles, Briefcase, Settings2, CheckCircle2, Check, ListChecks, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportColumnVisibilityDialog } from "./ReportColumnVisibilityDialog";
// ─── Sidebar Navigation ───────────────────────────────────────────────────────

interface ReportsSidebarProps {
  departments: any[];
  activeDeptId: string;
  setActiveDeptId: (id: string) => void;
  activeSubDepartments: any[];
  activeSubDeptIds: string[];
  setActiveSubDeptIds: (ids: string[]) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ReportsSidebar({
  departments, activeDeptId, setActiveDeptId,
  activeSubDepartments, activeSubDeptIds, setActiveSubDeptIds,
  isCollapsed = false, onToggleCollapse,
}: ReportsSidebarProps) {
  const [sidebarSearch, setSidebarSearch] = React.useState("");
  const [subDeptSearch, setSubDeptSearch] = React.useState("");
  const [subDeptOpen, setSubDeptOpen] = React.useState(true);

  const toggleSubDept = (id: string) => {
    setActiveSubDeptIds(
      activeSubDeptIds.includes(id)
        ? activeSubDeptIds.filter(x => x !== id)
        : [...activeSubDeptIds, id]
    );
  };

  const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  };

  const filteredDepartments = sidebarSearch.trim()
    ? departments.filter(d => d.name?.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : departments;

  const filteredSubDepts = subDeptSearch.trim()
    ? activeSubDepartments.filter(s => s.name?.toLowerCase().includes(subDeptSearch.toLowerCase()))
    : activeSubDepartments;

  return (
    <div className={cn(
      "border-r border-slate-200 bg-white flex flex-col max-h-screen shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-[72px]" : "w-[280px]"
    )}>
      {/* Header */}
      <div className={cn(
        "px-5 py-6 flex items-center shrink-0",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && (
          <div className="flex flex-col">
            <h2 className="text-[15px] font-bold text-slate-900 leading-tight">Departments</h2>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all ring-1 ring-transparent hover:ring-slate-200"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Search */}
      {!isCollapsed && (
        <div className="px-4 mb-4 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Quick find..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-9 pr-8 h-10 text-[12px] rounded-xl border border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-slate-500"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar py-6">
        {filteredDepartments.map((dept) => {
          const isActive = activeDeptId === dept.id.toString();

          if (isCollapsed) {
            return (
              <button
                key={dept.id}
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-11 h-11 mx-auto flex items-center justify-center rounded-xl text-[11px] font-bold transition-all mb-2",
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
                    : "bg-white text-slate-400 border border-slate-200 hover:border-blue-300 hover:text-blue-600 shadow-sm"
                )}
                title={dept.name}
              >
                {getInitials(dept.name)}
              </button>
            );
          }

          return (
            <div key={dept.id} className="flex flex-col gap-1">
              <button
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                  isActive
                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/40"
                )}
              >
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 transition-all",
                  isActive ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "bg-slate-100 text-slate-500 border border-slate-200"
                )}>
                  {getInitials(dept.name)}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={cn("text-[12px] font-semibold truncate leading-tight", isActive ? "text-slate-900" : "text-slate-700")}>
                    {dept.name}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                    {dept.tm_subdepartments?.length || 0} sub-depts
                  </span>
                </div>
                {isActive && <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0 shadow-[0_0_8px_rgba(79,70,229,0.6)]" />}
              </button>

              {/* Sub-department List */}
              {isActive && activeSubDepartments.length > 0 && (
                <div className="ml-5 pl-4 border-l-2 border-slate-200/60 mt-1 mb-4 flex flex-col gap-0.5">
                  <button
                    onClick={() => setSubDeptOpen(!subDeptOpen)}
                    className="flex items-center justify-between w-full px-2 py-1.5 group"
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600">
                      Sub-units
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-bold">
                        {activeSubDeptIds.length || "All"}
                      </span>
                      <ChevronRight className={cn("h-3 w-3 text-slate-400 transition-transform", subDeptOpen && "rotate-90")} />
                    </div>
                  </button>

                  {subDeptOpen && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-0.5">
                      {/* All Selection */}
                      <button
                        onClick={() => setActiveSubDeptIds([])}
                        className={cn(
                          "w-full flex items-center gap-2.5 text-left px-3 py-2 text-[12px] rounded-lg transition-all",
                          activeSubDeptIds.length === 0 ? "text-blue-600 bg-blue-50/50 font-semibold" : "text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        <ListChecks className="h-3.5 w-3.5" />
                        <span>All Sub-departments</span>
                      </button>

                      {filteredSubDepts.map((sub) => {
                        const id = sub.id.toString();
                        const checked = activeSubDeptIds.includes(id);
                        return (
                          <button
                            key={sub.id}
                            onClick={() => toggleSubDept(id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 text-left px-3 py-2 text-[12px] rounded-lg transition-all group",
                              checked ? "text-blue-600 bg-blue-50/50 font-semibold" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            )}
                          >
                            <div className={cn(
                              "h-4 w-4 rounded-md border flex items-center justify-center shrink-0 transition-all",
                              checked ? "bg-blue-600 border-blue-600 shadow-sm" : "border-slate-300 bg-white group-hover:border-slate-400"
                            )}>
                              {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                            </div>
                            <span className="truncate">{sub.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Reports Header ──────────────────────────────────────────────────────────

export function ReportsHeader({
  activeReport, setIsReportDialogOpen, columns, visibleColumnIds, setVisibleColumnIds,
  view, setView, handleSendReport, refreshData, loading,
  activeDepartment, activeSubDepartments, activeSubDeptIds,
  allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount,
}: any) {

  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All Sub-units";
    const names = activeSubDeptIds.map(id => activeSubDepartments.find((s: any) => s.id.toString() === id)?.name).filter(Boolean);
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1} more`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="border-b border-slate-200 bg-white px-8 py-5 antialiased">
      <div className="flex items-center justify-between gap-6">
        {/* LEFT: Context */}
        <div onClick={() => setIsReportDialogOpen(true)} className="group cursor-pointer min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-[17px] font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
              {activeReport?.name || "Select Report"}
            </h1>
            <ChevronDown className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-transform group-hover:translate-y-0.5" />
          </div>
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
            <span className="text-blue-600 font-bold uppercase tracking-wider text-xs">
              {activeDepartment?.name || "Global"}
            </span>
            <span className="text-slate-300">/</span>
            <span className="truncate max-w-[200px]">{selectedSubDeptText}</span>
            <span className="h-3 w-px bg-slate-200 mx-1" />
            <div className="flex gap-3">
              <span><b className="text-slate-900">{allTasksCount}</b> Total</span>
              <span><b className="text-slate-900">{wipTasksCount}</b> WIP</span>
              <span><b className="text-slate-900">{writeUpCompletedCount}</b> Done</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl ring-1 ring-slate-200">
            <button onClick={() => setView('standard')} className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all",
              view === 'standard' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}>
              <LayoutGrid className="h-3.5 w-3.5" /> Standard
            </button>
            <button onClick={() => setView('transposed')} className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold rounded-lg transition-all",
              view === 'transposed' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}>
              <TableProperties className="h-3.5 w-3.5" /> Transposed
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={refreshData} disabled={loading} className="h-9 px-4 rounded-xl border-slate-200 font-bold text-slate-600">
            <RotateCcw className={cn('h-3.5 w-3.5 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold shadow-md shadow-blue-100 gap-2">
                <Send className="h-3.5 w-3.5" /> Send Report <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-2xl border-slate-200">
              <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Format</div>
              {['Officer Export', 'Manager Export'].map((type) => (
                <div key={type} className="p-1 mb-1 last:mb-0 bg-slate-50 rounded-xl">
                  <div className="px-2 py-1.5 text-[11px] font-bold text-slate-600 flex items-center gap-2">
                    {type.includes('Officer') ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />} {type}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <button onClick={() => handleSendReport(type.split(' ')[0].toLowerCase(), 'excel')} className="py-2 text-[11px] font-bold bg-white hover:bg-blue-50 hover:text-blue-600 rounded-lg border border-slate-200 transition-all">Excel</button>
                    <button onClick={() => handleSendReport(type.split(' ')[0].toLowerCase(), 'pdf')} className="py-2 text-[11px] font-bold bg-white hover:bg-blue-50 hover:text-blue-600 rounded-lg border border-slate-200 transition-all">PDF</button>
                  </div>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
// ─── Person Filter Strip ─────────────────────────────────────────────────────

export function PersonFilterStrip({
  activePerspective, setActivePerspective,
  allTasksCount = 0,
  officerTaskCounts = { all: 0 },
  taskManagerTaskCounts = { all: 0 },
  clientTaskCounts = { all: 0 },
  availableOfficers = [], activeOfficerTab, setActiveOfficerTab,
  availableTaskManagers = [], activeTaskManagerTab, setActiveTaskManagerTab,
}: any) {

  const counts: any = { overview: allTasksCount, officers: officerTaskCounts.all, managers: taskManagerTaskCounts.all, clients: clientTaskCounts.all };
  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';

  const currentData = isOfficer ? availableOfficers : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerTab : activeTaskManagerTab;
  const setTab = isOfficer ? setActiveOfficerTab : setActiveTaskManagerTab;
  const currentCounts = isOfficer ? officerTaskCounts : taskManagerTaskCounts;

  return (
    <div className="bg-white border-b border-slate-200 antialiased">
      {/* Perspective Tabs */}
      <div className="px-8 flex items-center justify-between border-b border-slate-100">
        <div className="flex gap-8">
          {[
            { id: 'overview', label: 'Global Overview' },
            { id: 'officers', label: 'Officer Breakdown' },
            { id: 'managers', label: 'Manager Performance' }
          ].map(p => (
            <button key={p.id} onClick={() => setActivePerspective(p.id)} className={cn(
              "relative py-4 text-[12px] font-semibold transition-all",
              activePerspective === p.id ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}>
              {p.label}
               <span className={cn(
                  "mx-3 px-1.5 py-0.5 rounded-full text-xs",
                  activePerspective === p.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                )}>
                 {counts[p.id]}
                </span>
              {activePerspective === p.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* Person Selection Pills */}
      {(isOfficer || isManager) && (
        <div className="px-8 py-4 flex flex-wrap items-center gap-2 bg-slate-50/30">
          <div className="text-xs font-black text-slate-500 uppercase tracking-widest mr-2">Assignees:</div>
          <button
            onClick={() => setTab('all')}
            className={cn(
              "px-4 py-1.5 rounded-full text-[12px] font-medium transition-all",
              currentActive === 'all' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
            )}
          >
            All {currentCounts.all}
          </button>
          {currentData.map((p: any) => {
            const displayName = p.full_name || p.name || p.username || `User ${p.id}`;
            const isActive = currentActive === p.id.toString();
            const count = currentCounts[p.id] || 0;
            return (
              <button
                key={p.id}
                onClick={() => setTab(p.id.toString())}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[12px] font-medium transition-all flex items-center gap-2",
                  isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
                )}
              >
                {displayName}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-xs",
                  count > 0 ? "bg-emerald-600 text-white" : (isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Status + Search Bar ─────────────────────────────────────────────────────

export function StatusFilterBar({
  activeStatus, setActiveStatus, searchQuery, setSearchQuery,
  allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount
}: any) {
  const counts = { all: allTasksCount, wip: wipTasksCount, write_up_completed: writeUpCompletedCount, endorsed: endorsedCount, cancelled: cancelledCount };

  return (
    <div className="px-8 flex items-center justify-between border-b border-slate-200 bg-white antialiased">
      <div className="flex gap-6">
        {[
          { id: 'all',                label: 'All Tasks', activeText: 'text-blue-600',    activeBadge: 'bg-blue-50 text-blue-600',    activeLine: 'bg-blue-600' },
          { id: 'wip',               label: 'Wip',     activeText: 'text-amber-600',   activeBadge: 'bg-amber-50 text-amber-600',  activeLine: 'bg-amber-600' },
          { id: 'write_up_completed', label: 'Write Up Completed',   activeText: 'text-emerald-600', activeBadge: 'bg-emerald-50 text-emerald-600', activeLine: 'bg-emerald-600' },
          { id: 'endorsed',          label: 'Endorsed',    activeText: 'text-violet-600',  activeBadge: 'bg-violet-50 text-violet-600', activeLine: 'bg-violet-600' },
        ].map(s => {
          const isActive = activeStatus === s.id;
          return (
            <button key={s.id} onClick={() => setActiveStatus(s.id)} className={cn(
              "relative py-4 text-[12px] font-semibold transition-all flex items-center gap-2",
              isActive ? s.activeText : "text-slate-400 hover:text-slate-600"
            )}>
              {s.label}
              <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-full", isActive ? s.activeBadge : "bg-slate-100 text-slate-500")}>
                {counts[s.id]}
              </span>
              {isActive && <div className={cn("absolute bottom-0 left-0 right-0 h-0.5 rounded-full", s.activeLine)} />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 py-3">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <Input
            placeholder="Search report..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-72 h-10 pl-10 pr-10 bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl text-[12px] font-medium transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant="outline" className="h-10 rounded-xl px-4 border-slate-200 gap-2 font-bold text-slate-600 hover:bg-slate-50">
          <Filter className="h-4 w-4" /> Filters
        </Button>
      </div>
    </div>
  );
}
// ─── Constants ────────────────────────────────────────────────────────────────

const PERSPECTIVE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'officers', label: 'By Officer' },
  { value: 'managers', label: 'By Manager' },
  { value: 'clients', label: 'By Client' },
] as const;

const STATUS_TABS = [
  {
    id: 'all',
    label: 'Total',
    activeText: 'text-blue-600',
    activeBorder: 'border-blue-500',
  },
  {
    id: 'wip',
    label: 'WIP Stages',
    activeText: 'text-amber-600',
    activeBorder: 'border-amber-500',
  },
  {
    id: 'write_up_completed',
    label: 'Write Up Completed',
    activeText: 'text-emerald-600',
    activeBorder: 'border-emerald-500',
  },
  {
    id: 'endorsed',
    label: 'Endorsement Completed',
    activeText: 'text-violet-600',
    activeBorder: 'border-violet-500',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    activeText: 'text-red-600',
    activeBorder: 'border-red-500',
  },
];
