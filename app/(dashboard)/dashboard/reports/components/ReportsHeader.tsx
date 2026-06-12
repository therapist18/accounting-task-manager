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
  activeDepartment: any;
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
      "border-r border-slate-100 bg-slate-50/80 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className={cn(
        "px-4 py-4 flex items-center border-b border-slate-100 h-16 shrink-0",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && (
          <div>
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.2em]">Workspace</span>
            <h2 className="text-base font-bold text-slate-900 leading-none mt-0.5">Departments</h2>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Search */}
      {!isCollapsed && (
        <div className="px-3 py-3 shrink-0 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search departments..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-7 pr-7 h-8 text-xs rounded-lg bg-white border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className={cn(
        "flex-1 overflow-y-auto py-4 space-y-1.5 scrollbar-thin",
        isCollapsed ? "px-2" : "px-3"
      )}>
        {filteredDepartments.map((dept) => {
          const isActive = activeDeptId === dept.id.toString();

          if (isCollapsed) {
            return (
              <button
                key={dept.id}
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-xs font-bold transition-all",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                )}
                title={dept.name}
              >
                {getInitials(dept.name)}
              </button>
            );
          }

          return (
            <div key={dept.id}>
              <button
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left",
                  isActive
                    ? "bg-gradient-to-r from-blue-50 to-white text-blue-600 border border-blue-200 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-white hover:shadow-sm"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 transition-all",
                  isActive ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-400 border border-slate-200"
                )}>
                  {getInitials(dept.name)}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={cn("text-xs font-semibold truncate leading-tight", isActive ? "text-blue-600" : "text-slate-600")}>
                    {dept.name}
                  </span>
                  <span className="text-[9px] text-slate-400 truncate leading-tight">{dept.tm_subdepartments?.length || 0} sub-depts</span>
                </div>
                {isActive && <Building2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
              </button>

              {isActive && activeSubDepartments.length > 0 && (
                <div className="ml-7 pl-4 border-l-2 border-slate-100 mt-2 mb-4">
                  {/* Accordion toggle */}
                  <button
                    onClick={() => setSubDeptOpen(!subDeptOpen)}
                    className="w-full flex items-center gap-2 px-2 pb-1.5 text-left"
                  >
                    <ChevronRight className={cn(
                      "h-3 w-3 text-slate-400 transition-transform",
                      subDeptOpen && "rotate-90"
                    )} />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Sub-departments
                    </span>
                    <span className="text-[9px] text-slate-400 ml-auto">
                      {activeSubDeptIds.length > 0 ? `${activeSubDeptIds.length} selected` : `${activeSubDepartments.length}`}
                    </span>
                  </button>

                  {/* Always visible: "All" option */}
                  <button
                    onClick={() => { setActiveSubDeptIds([]); setSubDeptOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 text-left px-3 py-1.5 text-xs rounded-lg transition-all font-semibold",
                      activeSubDeptIds.length === 0
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-500 hover:text-slate-700 hover:bg-white"
                    )}
                  >
                    <ListChecks className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">All</span>
                    {activeSubDeptIds.length === 0 && <Check className="h-3.5 w-3.5 text-blue-500" />}
                  </button>

                  {/* Expandable sub-dept list */}
                  {subDeptOpen && (
                    <div className="mt-0.5 space-y-0.5">
                      {/* Mini search */}
                      {activeSubDepartments.length > 6 && (
                        <div className="relative px-2 py-1">
                          <input
                            type="text"
                            placeholder="Filter..."
                            value={subDeptSearch}
                            onChange={e => setSubDeptSearch(e.target.value)}
                            className="w-full h-7 pl-6 pr-5 text-[10px] rounded-md bg-slate-100 border-0 text-slate-600 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-slate-400" />
                          {subDeptSearch && (
                            <button onClick={() => setSubDeptSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {filteredSubDepts.map((sub) => {
                        const id = sub.id.toString();
                        const checked = activeSubDeptIds.includes(id);
                        return (
                          <button
                            key={sub.id}
                            onClick={() => toggleSubDept(id)}
                            className={cn(
                              "w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs rounded-lg transition-all",
                              checked
                                ? "bg-blue-50 text-blue-600 font-semibold"
                                : "text-slate-500 hover:text-slate-700 hover:bg-white font-medium"
                            )}
                          >
                            <span className={cn(
                              "h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                              checked ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"
                            )}>
                              {checked && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
                            </span>
                            <span className="flex-1 truncate">{sub.name}</span>
                          </button>
                        );
                      })}
                      {filteredSubDepts.length === 0 && subDeptSearch && (
                        <div className="text-center py-3 text-[10px] text-slate-400">No matches</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredDepartments.length === 0 && sidebarSearch && (
          <div className="text-center py-6 text-slate-400 text-xs">
            No departments match &ldquo;{sidebarSearch}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

export function ReportsToolbar({
  activeReport, setIsReportDialogOpen, columns, visibleColumnIds, setVisibleColumnIds,
  showTimeTrackingColumns, setShowTimeTrackingColumns,
  showDocRequirementsColumns, setShowDocRequirementsColumns,
  view, setView, handleSendReport, refreshData, loading,
  activeDepartment, activeSubDepartments, activeSubDeptIds
}: any) {

  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All Sub-departments";
    if (activeSubDeptIds.length === 1) {
      return activeSubDepartments.find((s: any) => s.id.toString() === activeSubDeptIds[0])?.name || "1 Sub-department";
    }
    const names = activeSubDeptIds.map(id => activeSubDepartments.find((s: any) => s.id.toString() === id)?.name).filter(Boolean);
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="px-6 py-4 flex items-center justify-between gap-10">
        {/* LEFT: Title + breadcrumb stacked */}
        <div
          onClick={() => setIsReportDialogOpen(true)}
          className="group cursor-pointer flex flex-col gap-1.5 min-w-0"
        >
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase group-hover:text-blue-600 transition-colors truncate">
            {activeReport?.name || "Select Report"}
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{activeDepartment?.name || "All Departments"}</span>
            <span className="text-slate-300">›</span>
            <span className="truncate">{selectedSubDeptText}</span>
          </div>
        </div>

        {/* RIGHT: Action buttons */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Columns visibility */}
          <ReportColumnVisibilityDialog
            columns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
            showTimeTrackingColumns={showTimeTrackingColumns}
            setShowTimeTrackingColumns={setShowTimeTrackingColumns}
            showDocRequirementsColumns={showDocRequirementsColumns}
            setShowDocRequirementsColumns={setShowDocRequirementsColumns}
          />

          {/* Transpose */}
          <Button
            variant="outline"
            className={cn(
              "h-9 px-4 text-xs font-semibold rounded-lg border-slate-200 gap-2",
              view === 'transposed' && "bg-blue-50 border-blue-200 text-blue-600"
            )}
            onClick={() => setView(view === 'standard' ? 'transposed' : 'standard')}
          >
            {view === 'standard'
              ? <><LayoutGrid className="h-3.5 w-3.5" />Transpose</>
              : <><TableProperties className="h-3.5 w-3.5" />Standard</>
            }
          </Button>

          {/* Refresh */}
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={loading}
            className="h-9 w-9 p-0 border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
          >
            <RotateCcw className={cn('h-3.5 w-3.5 text-slate-500', loading && 'animate-spin')} />
          </Button>

          {/* Send Report */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-2 font-semibold text-xs">
                <Send className="h-3.5 w-3.5" />
                Send Report
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1.5 rounded-xl shadow-xl border-slate-200">
              <div className="px-2 py-1 mb-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Options</p>
              </div>
              <div className="space-y-1">
                <div className="flex flex-col gap-1 p-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <Shield className="h-3 w-3 text-blue-500" />
                    <span className="text-[10px] font-bold text-slate-600">OFFICER EXPORT</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleSendReport('officer', 'excel')} className="flex-1 bg-white hover:bg-blue-50 border border-slate-200 py-1.5 rounded-md text-[10px] font-bold transition-colors">Excel</button>
                    <button onClick={() => handleSendReport('officer', 'pdf')} className="flex-1 bg-white hover:bg-blue-50 border border-slate-200 py-1.5 rounded-md text-[10px] font-bold transition-colors">PDF</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1 p-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <User className="h-3 w-3 text-blue-500" />
                    <span className="text-[10px] font-bold text-slate-600">MANAGER EXPORT</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleSendReport('manager', 'excel')} className="flex-1 bg-white hover:bg-blue-50 border border-slate-200 py-1.5 rounded-md text-[10px] font-bold transition-colors">Excel</button>
                    <button onClick={() => handleSendReport('manager', 'pdf')} className="flex-1 bg-white hover:bg-blue-50 border border-slate-200 py-1.5 rounded-md text-[10px] font-bold transition-colors">PDF</button>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

export function ReportKpiCards({
  allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount
}: any) {
  const cards = [
    { label: 'Total', value: allTasksCount, valueClass: 'text-blue-600', bgClass: 'bg-gradient-to-b from-blue-50/40 to-white', sub: 'Applications' },
    { label: 'WIP', value: wipTasksCount, valueClass: 'text-amber-600', bgClass: 'bg-gradient-to-b from-amber-50/40 to-white', sub: 'In Progress' },
    { label: 'Completed', value: writeUpCompletedCount, valueClass: 'text-emerald-600', bgClass: 'bg-gradient-to-b from-emerald-50/40 to-white', sub: 'Write Ups Done' },
    { label: 'Endorsed', value: endorsedCount, valueClass: 'text-violet-600', bgClass: 'bg-gradient-to-b from-violet-50/40 to-white', sub: 'Endorsed' },
    { label: 'Cancelled', value: cancelledCount, valueClass: 'text-red-500', bgClass: 'bg-gradient-to-b from-red-50/30 to-white', sub: 'Cancelled' },
  ];

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="px-6 py-4">
        <div className="flex items-stretch gap-3">
          {cards.map((card) => (
            <div key={card.label} className={cn(
              "flex-1 min-w-0 rounded-xl border px-4 py-3 flex flex-col",
              "border-slate-200",
              card.bgClass
            )}>
              <span className={cn("text-3xl font-black leading-none", card.valueClass)}>{card.value}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-2">{card.label}</span>
              <span className="text-[9px] text-slate-400 mt-0.5">{card.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Perspective + Person Filter Strip ───────────────────────────────────────

export function PersonFilterStrip({
  activePerspective, setActivePerspective,
  allTasksCount = 0,
  officerTaskCounts = { all: 0 },
  taskManagerTaskCounts = { all: 0 },
  clientTaskCounts = { all: 0 },
  availableOfficers = [], activeOfficerTab, setActiveOfficerTab, officerFilterMode, setOfficerFilterMode,
  availableTaskManagers = [], activeTaskManagerTab, setActiveTaskManagerTab,
  taskManagerFilterMode, setTaskManagerFilterMode,
}: any) {

  const perspectiveCounts: Record<string, number> = {
    overview: allTasksCount || 0,
    officers: officerTaskCounts?.all || 0,
    managers: taskManagerTaskCounts?.all || 0,
    clients: clientTaskCounts?.all || 0,
  };

  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const showPersonList = isOfficer || isManager;

  const data = isOfficer ? availableOfficers : availableTaskManagers;
  const activeTab = isOfficer ? activeOfficerTab : activeTaskManagerTab;
  const setActiveTab = isOfficer ? setActiveOfficerTab : setActiveTaskManagerTab;
  const counts = isOfficer ? officerTaskCounts : taskManagerTaskCounts;
  const mode = isOfficer ? officerFilterMode : taskManagerFilterMode;
  const setMode = isOfficer ? setOfficerFilterMode : setTaskManagerFilterMode;

  return (
    <div className="bg-white border-b border-slate-200">
      {/* ROW 1: Perspective tabs — compact */}
      <div className="px-6 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-0.5">
          {PERSPECTIVE_TABS.map(p => {
            const active = activePerspective === p.value;
            const count = perspectiveCounts[p.value];
            return (
              <button
                key={p.value}
                onClick={() => setActivePerspective(p.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px',
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
                )}
              >
                {p.label}
                <span className={cn(
                  "text-[10px] font-bold",
                  active ? "text-blue-500" : "text-slate-400"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {showPersonList && (
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-44 h-8 bg-white border-slate-200 rounded-lg text-xs font-semibold shadow-sm">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-blue-500" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="current" className="text-xs font-semibold">Current Assignments</SelectItem>
              <SelectItem value="history" className="text-xs font-semibold">Historical Activity</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ROW 2: Person tabs — filled pill */}
      {showPersonList && (
        <div className="border-b border-slate-100">
          <div className="px-6 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <div className={cn(
              "shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider",
              isOfficer ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"
            )}>
              {isOfficer ? <Shield className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
              {isOfficer ? "Officer" : "Manager"}
            </div>

            {/* All tab */}
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all",
                activeTab === 'all'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              )}
            >
              All {isOfficer ? "Officers" : "Managers"}
              <span className={cn(
                "text-[9px] font-bold px-1 py-0.5 rounded",
                activeTab === 'all' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
              )}>
                {counts.all}
              </span>
            </button>

            {data.map((p: any) => {
              const isActive = activeTab === p.id.toString();
              const count = counts[p.id] || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveTab(isActive ? 'all' : p.id.toString())}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {p.full_name || p.name || p.displayName}
                  {count > 0 && (
                    <span className={cn(
                      "text-[9px] font-bold px-1 py-0.5 rounded",
                      isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {(counts.__unallocated__ ?? 0) > 0 && (
              <>
                <div className="h-4 w-px bg-slate-200 shrink-0" />
                <button
                  onClick={() => setActiveTab(activeTab === '__unallocated__' ? 'all' : '__unallocated__')}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap",
                    activeTab === '__unallocated__'
                      ? "bg-red-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Unallocated
                  <span className={cn(
                    "text-[9px] font-bold px-1 py-0.5 rounded",
                    activeTab === '__unallocated__' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
                  )}>
                    {counts.__unallocated__}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status + Search Bar ─────────────────────────────────────────────────────

export function StatusFilterBar({
  activeStatus, setActiveStatus,
  allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount,
  searchQuery, setSearchQuery,
  activeClassId, setActiveClassId, activeSubClassId, setActiveSubClassId,
  activeSubDeptIds, activeSubDepartments,
  isFiltersDropdownOpen, setIsFiltersDropdownOpen,
}: any) {
  const counts = {
    all: allTasksCount,
    wip: wipTasksCount,
    write_up_completed: writeUpCompletedCount,
    endorsed: endorsedCount,
    cancelled: cancelledCount
  };

  const currentSubDept = activeSubDepartments.find((s: any) =>
    s.id.toString() === (activeSubDeptIds[0] || activeSubDepartments[0]?.id.toString())
  );

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="px-6 flex items-center justify-between">
        {/* Status tabs — compact */}
        <div className="flex items-center gap-0.5">
          {STATUS_TABS.map(status => {
            const isActive = activeStatus === status.id;
            const count = counts[status.id];
            return (
              <button
                key={status.id}
                onClick={() => setActiveStatus(status.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px",
                  isActive
                    ? `${status.activeBorder} ${status.activeText}`
                    : "border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300"
                )}
              >
                {status.label}
                <span className={cn(
                  "text-[10px] font-bold",
                  isActive ? "text-blue-500" : "text-slate-400"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + Filters — compact */}
        <div className="flex items-center gap-2 shrink-0 py-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="Quick search records..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-8 w-60 bg-slate-50 border-slate-200 rounded-full text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <DropdownMenu open={isFiltersDropdownOpen} onOpenChange={setIsFiltersDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={cn(
                "h-8 rounded-full px-4 text-xs font-semibold gap-1.5 border-slate-200",
                (activeClassId !== 'all' || activeSubClassId !== 'all') && "bg-blue-50 border-blue-200 text-blue-700"
              )}>
                <Filter className="h-3.5 w-3.5" />
                Filters
                {(activeClassId !== 'all' || activeSubClassId !== 'all') && (
                  <span className="h-4 w-4 flex items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-black">!</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-4 rounded-2xl shadow-2xl border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-900">Categorization</span>
                <Sparkles className="h-4 w-4 text-blue-500" />
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Task Class</label>
                  <Select value={activeClassId} onValueChange={v => { setActiveClassId(v); setActiveSubClassId('all'); }}>
                    <SelectTrigger className="h-9 rounded-xl font-semibold border-slate-200 text-sm">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">All Classes</SelectItem>
                      {currentSubDept?.classes?.map((cls: any) => (
                        <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeClassId !== 'all' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sub-Class</label>
                    <Select value={activeSubClassId} onValueChange={setActiveSubClassId}>
                      <SelectTrigger className="h-9 rounded-xl font-semibold border-slate-200 text-sm">
                        <SelectValue placeholder="Select Sub-class" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all">All Sub-classes</SelectItem>
                        {currentSubDept?.classes?.find((c: any) => c.id.toString() === activeClassId)?.subClasses?.map((sc: any) => (
                          <SelectItem key={sc.id} value={sc.id.toString()}>{sc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="w-full text-xs h-9 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-semibold"
                  onClick={() => { setActiveClassId('all'); setActiveSubClassId('all'); }}
                >
                  Clear all filters
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
    activeBorder: 'border-blue-600',
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
    activeBorder: 'border-emerald-600',
  },
  {
    id: 'endorsed',
    label: 'Endorsement Completed',
    activeText: 'text-violet-600',
    activeBorder: 'border-violet-600',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    activeText: 'text-red-600',
    activeBorder: 'border-red-600',
  },
];
