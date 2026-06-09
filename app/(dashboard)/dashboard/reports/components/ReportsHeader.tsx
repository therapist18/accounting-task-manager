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

// ─── Sidebar Navigation (Departments & Sub-departments) ──────────────────────

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
  activeSubDepartments: any[];
  activeSubDeptIds: string[];
}

export function ReportsSidebar({
  departments, activeDeptId, setActiveDeptId,
  activeSubDepartments, activeSubDeptIds, setActiveSubDeptIds,
  isCollapsed = false, onToggleCollapse,
}: ReportsSidebarProps) {
  const [sidebarSearch, setSidebarSearch] = React.useState("");

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
                  onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
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
                  onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
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

                {/* Sub-departments — multi-select checklist */}
                {isActive && activeSubDepartments.length > 0 && (
                  <div className="ml-7 pl-4 border-l-2 border-indigo-100 space-y-1 my-2">
                    <div className="flex items-center justify-between px-3 pb-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        Sub-departments
                      </span>
                      {activeSubDeptIds.length > 0 && (
                        <button
                          onClick={() => setActiveSubDeptIds([])}
                          className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-wide"
                        >
                          Clear ({activeSubDeptIds.length})
                        </button>
                      )}
                    </div>

                    {/* "All" pseudo-option — clears the selection */}
                    <button
                      onClick={() => setActiveSubDeptIds([])}
                      className={cn(
                        "w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs rounded-lg transition-all font-semibold",
                        activeSubDeptIds.length === 0
                          ? "text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      )}
                    >
                      <ListChecks className={cn("h-3.5 w-3.5 shrink-0", activeSubDeptIds.length === 0 ? "text-indigo-500" : "text-slate-400")} />
                      <span className="flex-1 truncate">All Sub-departments</span>
                      {activeSubDeptIds.length === 0 && <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                    </button>

                    {activeSubDepartments.map((sub) => {
                      const id = sub.id.toString();
                      const checked = activeSubDeptIds.includes(id);
                      return (
                        <button
                          key={sub.id}
                          onClick={() => toggleSubDept(id)}
                          className={cn(
                            "w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs rounded-lg transition-all font-medium truncate",
                            checked
                              ? "text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200 font-semibold"
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          )}
                        >
                          <span className={cn(
                            "h-3.5 w-3.5 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors",
                            checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white group-hover:border-slate-400"
                          )}>
                            {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 truncate">{sub.name}</span>
                        </button>
                      );
                    })}
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

export function ReportsToolbar({ activeReport, setIsReportDialogOpen, columns, visibleColumnIds, setVisibleColumnIds, showTimeTrackingColumns, setShowTimeTrackingColumns, showDocRequirementsColumns, setShowDocRequirementsColumns, view, setView, handleSendReport, refreshData, loading, activeDepartment, activeSubDepartments, activeSubDeptIds }: ReportsToolbarProps) {
  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All Sub-departments";
    if (activeSubDeptIds.length === 1) {
      return activeSubDepartments.find(s => s.id.toString() === activeSubDeptIds[0])?.name || "Selected Sub-department";
    }
    return `${activeSubDeptIds.length} Sub-departments`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="px-2 max-w-[1600px] mx-auto py-5 flex items-center justify-between gap-8">
        {/* LEFT: REPORT IDENTITY - Now has much more room */}
        <div
          onClick={() => setIsReportDialogOpen(true)}
          className="group cursor-pointer flex items-center gap-4 transition-all"
        >
          <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none group-hover:text-indigo-600 transition-colors truncate uppercase">
            {activeReport?.name || "Select Report"}
          </h1>
          <div className="flex-shrink-0 p-1.5 rounded-lg bg-slate-50 border border-slate-200 group-hover:bg-indigo-50 group-hover:border-indigo-200 transition-all">
            <Settings2 className="h-5 w-5 text-slate-400 group-hover:text-indigo-600" />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1.5 overflow-hidden">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            <Building2 className="h-3 w-3" />
            <span>{activeDepartment?.name || "All Departments"}</span>
          </div>
          <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
          <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 uppercase tracking-wider whitespace-nowrap">
            <Layers className="h-3 w-3" />
            <span>{selectedSubDeptText}</span>
          </div>
        </div>
        {/* RIGHT: ACTION BUTTONS */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
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
              className={cn(
                "h-10 px-4 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 transition-all",
                view === 'transposed' && "bg-indigo-50 border-indigo-200 text-indigo-600"
              )}
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
                <Button className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-100 gap-2 font-bold transition-all">
                  <Send className="h-4 w-4" />
                  Send Report
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl shadow-xl border-slate-200">
                <div className="px-2 py-1.5 mb-1">
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
                      <User className="h-3 w-3 text-violet-500" />
                      <span className="text-[10px] font-bold text-slate-600">MANAGER EXPORT</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleSendReport('manager', 'excel')} className="flex-1 bg-white hover:bg-violet-50 border border-slate-200 py-1.5 rounded-md text-[10px] font-bold transition-colors">Excel</button>
                      <button onClick={() => handleSendReport('manager', 'pdf')} className="flex-1 bg-white hover:bg-violet-50 border border-slate-200 py-1.5 rounded-md text-[10px] font-bold transition-colors">PDF</button>
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
              className="h-9 w-9 p-0 border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <RotateCcw className={cn('h-3.5 w-3.5 text-slate-500', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  // Defensive mapping to ensure .all exists
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
    <div className="bg-slate-50/50 border-b border-slate-200 flex flex-col">
      {/* ROW 1: PRIMARY PERSPECTIVE TABS */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-slate-200/60 bg-white">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {PERSPECTIVE_TABS.map(p => {
            const active = activePerspective === p.value;
            const count = perspectiveCounts[p.value];
            return (
              <button
                key={p.value}
                onClick={() => setActivePerspective(p.value)}
                className={cn(
                  'px-5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2.5',
                  active
                    ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200'
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

        {showPersonList && (
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-44 h-9 bg-white border-slate-200 rounded-lg text-xs font-bold shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-indigo-500" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="current" className="text-xs font-bold">Current Assignments</SelectItem>
              <SelectItem value="history" className="text-xs font-bold">Historical Activity</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ROW 2: SECONDARY PERSON TABS (Only shown for Officers/Managers) */}
      {showPersonList && (
        <div className="px-6 py-3 flex items-center gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-[10px] uppercase tracking-tighter shadow-sm shrink-0",
            isOfficer ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-violet-50 border-violet-100 text-violet-700"
          )}>
            {isOfficer ? <Shield className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            Select {isOfficer ? "Officer" : "Manager"}
          </div>

          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-4 h-8 rounded-lg text-xs font-bold transition-all flex items-center whitespace-nowrap border",
                activeTab === 'all'
                  ? (isOfficer ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-violet-600 border-violet-600 text-white shadow-md")
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}
            >
              All {isOfficer ? "Officers" : "Managers"}
              <span className={cn("ml-2 opacity-70 text-[10px]", activeTab === 'all' ? "text-white" : "text-slate-400")}>{counts.all}</span>
            </button>

            {data.map((p: any) => {
              const isActive = activeTab === p.id.toString();
              const count = counts[p.id] || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveTab(isActive ? 'all' : p.id.toString())}
                  className={cn(
                    "px-4 h-8 rounded-lg text-xs font-bold transition-all flex items-center whitespace-nowrap border",
                    isActive
                      ? (isOfficer ? "bg-blue-600 border-blue-600 text-white shadow-md" : "bg-violet-600 border-violet-600 text-white shadow-md")
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {p.full_name || p.name || p.displayName}
                  {count > 0 && <span className={cn("ml-2 opacity-70 text-[10px]", isActive ? "text-white" : "text-slate-400")}>{count}</span>}
                </button>
              );
            })}

            {/* Unallocated tab — separated by a divider, only shown when there are unallocated tasks */}
            {(counts.__unallocated__ ?? 0) > 0 && (
              <>
                <div className="h-5 w-px bg-slate-200 shrink-0 mx-1" />
                <button
                  onClick={() => setActiveTab(activeTab === '__unallocated__' ? 'all' : '__unallocated__')}
                  className={cn(
                    "px-3 h-8 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border",
                    activeTab === '__unallocated__'
                      ? "bg-red-600 border-red-600 text-white shadow-md"
                      : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300"
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Unallocated
                  <span className={cn("opacity-80 text-[10px]", activeTab === '__unallocated__' ? "text-white" : "text-red-500")}>
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

  // Class/Sub-class filter options derive from a single sub-department — fall back to
  // the first selected (or first available) one when the user has multi-selected several.
  const currentSubDept = activeSubDepartments.find((s: any) =>
    s.id.toString() === (activeSubDeptIds[0] || activeSubDepartments[0]?.id.toString())
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