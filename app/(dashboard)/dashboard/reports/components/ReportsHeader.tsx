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
  Layers, Sparkles, Briefcase, Settings2, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportColumnVisibilityDialog } from "./ReportColumnVisibilityDialog";

// ─── Sidebar Navigation (Departments & Sub-departments) ──────────────────────

interface ReportsSidebarProps {
  departments: any[];
  activeDeptId: string;
  setActiveDeptId: (id: string) => void;
  activeSubDepartments: any[];
  activeSubDeptId: string;
  setActiveSubDeptId: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ReportsSidebar({
  departments, activeDeptId, setActiveDeptId,
  activeSubDepartments, activeSubDeptId, setActiveSubDeptId,
  isCollapsed = false, onToggleCollapse,
}: ReportsSidebarProps) {
  const [sidebarSearch, setSidebarSearch] = React.useState("");

  const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  };

  const filteredDepartments = sidebarSearch.trim()
    ? departments.filter(d => d.name?.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : departments;

  return (
    <div className={cn(
      "border-r border-slate-200 bg-slate-50/50 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-20" : "w-72"
    )}>
      {/* Sidebar Header */}
      <div className={cn(
        "p-5 flex items-center h-20 shrink-0",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em] mb-0.5">Workspace</span>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Departments
            </h2>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-all shadow-sm"
          >
            {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Sidebar Search */}
      {!isCollapsed && (
        <div className="px-4 pb-3 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Search departments..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-8 pr-8 h-8 text-xs rounded-lg bg-white border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sidebar Content */}
      <div className={cn(
        "flex-1 overflow-y-auto px-4 pb-6 space-y-6 scrollbar-thin",
        isCollapsed && "px-2"
      )}>
        <div className="space-y-1.5">
          {filteredDepartments.map((dept) => {
            const isActive = activeDeptId === dept.id.toString();

            if (isCollapsed) {
              return (
                <button
                  key={dept.id}
                  onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptId('all'); }}
                  className={cn(
                    "w-12 h-12 mx-auto mb-3 flex items-center justify-center rounded-2xl text-xs font-bold transition-all duration-300 relative group",
                    isActive
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                      : "bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200"
                  )}
                  title={dept.name}
                >
                  {getInitials(dept.name)}
                  {isActive && (
                    <span className="absolute -left-2 top-1/4 bottom-1/4 w-1 bg-indigo-600 rounded-r-full" />
                  )}
                </button>
              );
            }

            return (
              <div key={dept.id} className="group/dept">
                <button
                  onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptId('all'); }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 mb-1",
                    isActive
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
                      : "text-slate-600 hover:bg-slate-200/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-colors",
                      isActive ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-slate-100 border-slate-200 text-slate-500"
                    )}>
                      {getInitials(dept.name)}
                    </div>
                    <span className={cn("text-sm font-semibold truncate max-w-[140px]", isActive ? "text-slate-900" : "text-slate-600")}>
                      {dept.name}
                    </span>
                  </div>
                  {isActive && <div className="h-1.5 w-1.5 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]" />}
                </button>

                {/* Sub-departments Nested */}
                {isActive && activeSubDepartments.length > 0 && (
                  <div className="ml-7 pl-4 border-l-2 border-slate-100 space-y-1 my-2">
                    <button
                      onClick={() => setActiveSubDeptId('all')}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs rounded-lg transition-all font-medium",
                        activeSubDeptId === 'all' ? "text-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      )}
                    >
                      Overview
                    </button>
                    {activeSubDepartments.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveSubDeptId(sub.id.toString())}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs rounded-lg transition-all font-medium truncate",
                          activeSubDeptId === sub.id.toString() ? "text-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        )}
                      >
                        {sub.name}
                      </button>
                    ))}
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
    </div>
  );
}

// ─── Main Toolbar ─────────────────────────────────────────────────────────────

// ─── Main Toolbar ─────────────────────────────────────────────────────────────

export function ReportsToolbar({
  activeReport, setIsReportDialogOpen,
  activePerspective, setActivePerspective,
  allTasksCount, officerTaskCounts, taskManagerTaskCounts, clientTaskCounts,
  columns, visibleColumnIds, setVisibleColumnIds,
  showTimeTrackingColumns, setShowTimeTrackingColumns,
  showDocRequirementsColumns, setShowDocRequirementsColumns,
  view, setView,
  handleSendReport,
  showTimeStatuses, setShowTimeStatuses,
  showNARows, setShowNARows,
  handleExport, refreshData, loading,
  jobLevelLabel,
}: ReportsToolbarProps) {
  const perspectiveCounts: Record<string, number> = {
    overview: allTasksCount,
    officers: officerTaskCounts.all,
    managers: taskManagerTaskCounts.all,
    clients: clientTaskCounts.all,
  };

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-8">
        {/* LARGE REPORT TITLE SELECTOR */}
        <div
          onClick={() => setIsReportDialogOpen(true)}
          className="group cursor-pointer flex flex-col"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em]">Active Report</span>
            <div className="h-px w-8 bg-indigo-100" />
          </div>
          <div className="flex items-center gap-3">
             <h1 className="text-3xl font-black text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">
               {activeReport?.name || "Select Report"}
             </h1>
             <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 group-hover:bg-indigo-50 group-hover:border-indigo-200 transition-all">
               <Settings2 className="h-5 w-5 text-slate-400 group-hover:text-indigo-600" />
             </div>
          </div>
        </div>

        {/* Active Job Level */}
        {jobLevelLabel && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-50/50 border border-amber-100 text-amber-700">
            <Layers className="h-5 w-5 text-amber-500" />
            <div className="flex flex-col border-l border-amber-200 pl-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500/80">Job Level</span>
              <span className="text-sm font-extrabold">{jobLevelLabel}</span>
            </div>
          </div>
        )}

        {/* Perspective Switcher */}
        <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          {PERSPECTIVE_TABS.map(p => {
            const active = activePerspective === p.value;
            const count = perspectiveCounts[p.value];
            return (
              <button
                key={p.value}
                onClick={() => setActivePerspective(p.value)}
                className={cn(
                  'px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2',
                  active
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {p.label}
                {count > 0 && (
                  <Badge variant={active ? "default" : "secondary"} className={cn("px-1.5 py-0 text-[10px]", active ? "bg-indigo-600" : "bg-slate-200 text-slate-500")}>
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
          <ReportColumnVisibilityDialog
            columns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
            showTimeTrackingColumns={showTimeTrackingColumns}
            setShowTimeTrackingColumns={setShowTimeTrackingColumns}
            showDocRequirementsColumns={showDocRequirementsColumns}
            setShowDocRequirementsColumns={setShowDocRequirementsColumns}
          />

          <Button
            variant="outline"
            className="h-10 px-4 text-xs font-bold border-slate-200 rounded-xl hover:bg-slate-50"
            onClick={() => setView(view === 'standard' ? 'transposed' : 'standard')}
          >
            {view === 'standard' ? (
              <><LayoutGrid className="h-4 w-4 mr-2 text-indigo-500" />Transpose</>
            ) : (
              <><TableProperties className="h-4 w-4 mr-2 text-indigo-500" />Standard</>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-100 gap-2 font-bold transition-all hover:-translate-y-0.5">
                <Send className="h-4 w-4" />
                Send Report
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl">
              {/* Officer */}
              <div className="px-2 pt-2 pb-1 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Officer</span>
              </div>
              <div className="flex gap-1.5 px-2 pb-2">
                <button onClick={() => handleSendReport('officer', 'excel')} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition-colors">
                  <Download className="h-3.5 w-3.5" /> Excel
                </button>
                <button onClick={() => handleSendReport('officer', 'pdf')} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition-colors">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
              <DropdownMenuSeparator className="my-1" />
              {/* Manager */}
              <div className="px-2 pt-2 pb-1 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Manager</span>
              </div>
              <div className="flex gap-1.5 px-2 pb-2">
                <button onClick={() => handleSendReport('manager', 'excel')} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-semibold transition-colors">
                  <Download className="h-3.5 w-3.5" /> Excel
                </button>
                <button onClick={() => handleSendReport('manager', 'pdf')} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-semibold transition-colors">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" onClick={refreshData} disabled={loading} className="h-10 w-10 p-0 border-slate-200 rounded-xl hover:bg-slate-50">
             <RotateCcw className={cn('h-4 w-4 text-slate-500', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Person Filter Strip (Officer / Manager) ──────────────────────────────────

export function PersonFilterStrip({
  activePerspective,
  availableOfficers, activeOfficerTab, setActiveOfficerTab, officerTaskCounts, officerFilterMode, setOfficerFilterMode,
  availableTaskManagers, activeTaskManagerTab, setActiveTaskManagerTab, taskManagerTaskCounts, taskManagerFilterMode, setTaskManagerFilterMode,
}: PersonFilterStripProps) {
  if (activePerspective !== 'officers' && activePerspective !== 'managers') return null;

  const isOfficer = activePerspective === 'officers';
  const data = isOfficer ? availableOfficers : availableTaskManagers;
  const activeTab = isOfficer ? activeOfficerTab : activeTaskManagerTab;
  const setActiveTab = isOfficer ? setActiveOfficerTab : setActiveTaskManagerTab;
  const counts = isOfficer ? officerTaskCounts : taskManagerTaskCounts;
  const mode = isOfficer ? officerFilterMode : taskManagerFilterMode;
  const setMode = isOfficer ? setOfficerFilterMode : setTaskManagerFilterMode;

  const gradientClasses = isOfficer 
    ? "data-[active=true]:bg-gradient-to-r data-[active=true]:from-blue-600 data-[active=true]:to-blue-700" 
    : "data-[active=true]:bg-gradient-to-r data-[active=true]:from-violet-600 data-[active=true]:to-violet-700";

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
      {/* Icon Label */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border font-black text-[10px] uppercase tracking-tighter shadow-sm shrink-0",
        isOfficer ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-violet-50 border-violet-100 text-violet-700"
      )}>
        {isOfficer ? <Shield className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        {isOfficer ? "Officer Filter" : "Manager Filter"}
      </div>

      {/* Updated Tabs List Styling for Persons */}
      <div className="flex-1 flex items-center gap-1 p-1 shadow-sm bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('all')}
          data-active={activeTab === 'all'}
          className={cn(
            "px-4 h-8 rounded-md text-xs gap-2 font-bold transition-all duration-200 flex items-center whitespace-nowrap",
            activeTab === 'all'
              ? `${isOfficer ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-violet-600 to-violet-700'} text-white shadow-md`
              : "text-slate-600 hover:bg-slate-200/50"
          )}
        >
          All {isOfficer ? "Officers" : "Managers"}
          <Badge variant="secondary" className={cn("ml-1 px-1.5 py-0 text-[10px]", activeTab === 'all' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600")}>
            {counts.all}
          </Badge>
        </button>

        {data.map((p: any) => {
          const isActive = activeTab === p.id.toString();
          const count = counts[p.id] || 0;
          return (
            <button
              key={p.id}
              onClick={() => setActiveTab(isActive ? 'all' : p.id.toString())}
              data-active={isActive}
              className={cn(
                "px-4 h-8 rounded-md text-xs gap-2 font-bold transition-all duration-200 flex items-center whitespace-nowrap",
                isActive
                  ? `${isOfficer ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-violet-600 to-violet-700'} text-white shadow-md`
                  : "text-slate-600 hover:bg-slate-200/50"
              )}
            >
              {p.full_name || p.name || p.displayName}
              {count > 0 && (
                <Badge variant="secondary" className={cn("ml-1 px-1.5 py-0 text-[10px]", isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600")}>
                  {count}
                </Badge>
              )}
            </button>
          );
        })}

        {counts.__unallocated__ > 0 && (
           <button
            onClick={() => setActiveTab('__unallocated__')}
            className={cn(
              "px-4 h-8 rounded-md text-xs gap-2 font-bold transition-all duration-200 flex items-center whitespace-nowrap ml-2",
              activeTab === '__unallocated__'
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md"
                : "text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100"
            )}
           >
             Unallocated
             <Badge variant="secondary" className={cn("ml-1 px-1.5 py-0 text-[10px]", activeTab === '__unallocated__' ? "bg-white/20 text-white" : "bg-amber-200 text-amber-800")}>
               {counts.__unallocated__}
             </Badge>
           </button>
        )}
      </div>

      {/* Perspective Mode Toggle */}
      <Select value={mode} onValueChange={setMode}>
        <SelectTrigger className="w-40 h-10 bg-white border-slate-200 rounded-xl text-xs font-bold shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="current" className="text-xs font-bold">Current Basket</SelectItem>
          <SelectItem value="history" className="text-xs font-bold">Historical View</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterPill({ active, onClick, children, color = 'slate' }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: 'slate' | 'blue' | 'violet' | 'amber' }) {
  const activeColors = {
    slate: 'bg-slate-900 text-white border-slate-900',
    blue: 'bg-blue-600 text-white border-blue-600',
    violet: 'bg-violet-600 text-white border-violet-600',
    amber: 'bg-amber-500 text-white border-amber-500',
  };
  const inactiveColors = {
    slate: 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
    blue: 'bg-white text-blue-600 border-blue-200 hover:border-blue-300 hover:bg-blue-50',
    violet: 'bg-white text-violet-600 border-violet-200 hover:border-violet-300 hover:bg-violet-50',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300 hover:bg-amber-100',
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 h-8 px-4 rounded-full text-xs font-bold transition-all duration-200 border whitespace-nowrap',
        active
          ? `${activeColors[color]} shadow-md -translate-y-px`
          : inactiveColors[color]
      )}
    >
      {children}
    </button>
  );
}

// ─── Status + Search Bar ─────────────────────────────────────────────────────
export function StatusFilterBar({
  activeStatus, setActiveStatus,
  allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount,
  searchQuery, setSearchQuery,
  activeClassId, setActiveClassId, activeSubClassId, setActiveSubClassId,
  activeSubDeptId, activeSubDepartments,
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
    s.id.toString() === (activeSubDeptId === 'all' ? activeSubDepartments[0]?.id.toString() : activeSubDeptId)
  );

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-6">
      {/* Updated Tabs List Styling */}
      <div className="flex items-center gap-1 p-1 shadow-sm bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg">
        {STATUS_TABS.map(status => {
          const isActive = activeStatus === status.id;
          const count = counts[status.id];
          return (
            <button
              key={status.id}
              onClick={() => setActiveStatus(status.id)}
              className={cn(
                "px-4 h-9 rounded-md text-sm gap-2 font-semibold transition-all duration-200 flex items-center whitespace-nowrap",
                isActive
                  ? `bg-gradient-to-r ${status.activeGradient} text-white shadow-lg border-0`
                  : "text-slate-700 hover:bg-slate-200/50"
              )}
            >
              {status.label}
              <Badge
                variant="secondary"
                className={cn(
                  "ml-1 px-1.5 py-0 text-xs font-bold",
                  isActive ? "bg-white/20 text-white border-transparent" : status.badgeBg
                )}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-1 max-w-2xl justify-end">
        <div className="relative flex-1 max-w-sm group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <Input
            placeholder="Quick search records..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-10 bg-slate-50 border-slate-200 rounded-xl focus:bg-white transition-all text-sm font-medium focus:ring-4 focus:ring-indigo-50"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <DropdownMenu open={isFiltersDropdownOpen} onOpenChange={setIsFiltersDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={cn(
              "h-10 rounded-xl px-4 text-xs font-bold gap-2 border-slate-200",
              (activeClassId !== 'all' || activeSubClassId !== 'all') && "bg-indigo-50 border-indigo-200 text-indigo-700"
            )}>
              <Filter className="h-4 w-4" />
              Filters
              {(activeClassId !== 'all' || activeSubClassId !== 'all') && (
                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center bg-indigo-600">!</Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-5 rounded-2xl shadow-2xl border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-900">Categorization</span>
              <Sparkles className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Task Class</label>
                <Select value={activeClassId} onValueChange={v => { setActiveClassId(v); setActiveSubClassId('all'); }}>
                  <SelectTrigger className="h-10 rounded-xl font-semibold border-slate-200"><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Classes</SelectItem>
                    {currentSubDept?.classes?.map((cls: any) => (
                      <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {activeClassId !== 'all' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sub-Class</label>
                  <Select value={activeSubClassId} onValueChange={setActiveSubClassId}>
                    <SelectTrigger className="h-10 rounded-xl font-semibold border-slate-200"><SelectValue placeholder="Select Sub-class" /></SelectTrigger>
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
                className="w-full text-xs h-10 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold mt-2"
                onClick={() => { setActiveClassId('all'); setActiveSubClassId('all'); }}
              >
                Clear all filters
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

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
    activeGradient: 'from-blue-600 to-blue-700',
    badgeBg: 'bg-blue-100 text-blue-800'
  },
  {
    id: 'wip',
    label: 'WIP Stages',
    activeGradient: 'from-amber-600 to-amber-700',
    badgeBg: 'bg-amber-100 text-amber-800'
  },
  {
    id: 'write_up_completed',
    label: 'Write Up Completed',
    activeGradient: 'from-green-600 to-green-700',
    badgeBg: 'bg-green-100 text-green-800'
  },
  {
    id: 'endorsed',
    label: 'Endorsement Completed',
    activeGradient: 'from-purple-600 to-purple-700',
    badgeBg: 'bg-purple-100 text-purple-800'
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    activeGradient: 'from-red-600 to-red-700',
    badgeBg: 'bg-red-100 text-red-800'
  },
];