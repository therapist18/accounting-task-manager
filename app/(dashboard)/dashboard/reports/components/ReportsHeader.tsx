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
  const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  };

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
      
      {/* Sidebar Content */}
      <div className={cn(
        "flex-1 overflow-y-auto px-4 pb-6 space-y-6 scrollbar-thin",
        isCollapsed && "px-2"
      )}>
        <div className="space-y-1.5">
          {departments.map((dept) => {
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
        </div>
      </div>
    </div>
  );
}

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
}: ReportsToolbarProps) {
  const perspectiveCounts: Record<string, number> = {
    overview: allTasksCount,
    officers: officerTaskCounts.all,
    managers: taskManagerTaskCounts.all,
    clients:  clientTaskCounts.all,
  };

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-6">
        {/* Report Selector Card */}
        <div 
          onClick={() => setIsReportDialogOpen(true)}
          className="group flex items-center gap-3 cursor-pointer bg-slate-50 hover:bg-white hover:shadow-md border border-slate-200/60 p-2 pr-4 rounded-2xl transition-all duration-300"
        >
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:scale-105 transition-transform">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight leading-none mb-1">Active Template</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 truncate max-w-[180px]">
                {activeReport?.name || "Select Report"}
              </span>
              <Settings2 className="h-3 w-3 text-slate-400 group-hover:text-indigo-600" />
            </div>
          </div>
        </div>

        {/* Perspective Switcher */}
        <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          {PERSPECTIVE_TABS.map(p => {
            const active = activePerspective === p.value;
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
                <Badge variant={active ? "default" : "secondary"} className={cn("px-1.5 py-0 text-[10px]", active ? "bg-indigo-600" : "bg-slate-200 text-slate-500")}>
                  {perspectiveCounts[p.value]}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

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
            className="h-9 px-3 text-xs font-bold border-slate-200 rounded-xl hover:bg-slate-50"
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
              <Button className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-100 gap-2 font-bold transition-all hover:-translate-y-0.5">
                <Send className="h-4 w-4" />
                Send
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl">
              <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Excel Reports</div>
              <DropdownMenuItem onClick={() => handleSendReport('officer', 'excel')} className="rounded-xl cursor-pointer py-2 font-semibold">
                <Shield className="h-4 w-4 mr-2 text-blue-500" /> Officer Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSendReport('manager', 'excel')} className="rounded-xl cursor-pointer py-2 font-semibold">
                <User className="h-4 w-4 mr-2 text-violet-500" /> Manager Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSendReport('client', 'excel')} className="rounded-xl cursor-pointer py-2 font-semibold">
                <Users className="h-4 w-4 mr-2 text-orange-500" /> Client Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">PDF Formats</div>
              <DropdownMenuItem onClick={() => handleSendReport('officer', 'pdf')} className="rounded-xl cursor-pointer py-2 font-semibold">
                <FileText className="h-4 w-4 mr-2 text-rose-500" /> Officer PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 w-9 p-0 border-slate-200 rounded-xl hover:bg-slate-50">
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl">
              <DropdownMenuItem onClick={() => setShowTimeStatuses(!showTimeStatuses)} className="rounded-xl cursor-pointer py-2 font-semibold">
                <Clock className="h-4 w-4 mr-2 text-slate-500" />
                {showTimeStatuses ? 'Hide' : 'Show'} Time Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNARows(!showNARows)} className="rounded-xl cursor-pointer py-2 font-semibold">
                {showNARows ? <EyeOff className="h-4 w-4 mr-2 text-slate-500" /> : <Eye className="h-4 w-4 mr-2 text-slate-500" />}
                {showNARows ? 'Hide' : 'Show'} N/A Rows
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem onClick={() => handleExport('excel')} className="rounded-xl cursor-pointer py-2 font-semibold text-emerald-600">
                <Download className="h-4 w-4 mr-2" /> Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={refreshData} disabled={loading} className="rounded-xl cursor-pointer py-2 font-semibold">
                <RotateCcw className={cn('h-4 w-4 mr-2 text-slate-500', loading && 'animate-spin')} /> Refresh Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

  return (
    <div className="bg-slate-50/50 border-b border-slate-200 px-6 py-3 flex items-center gap-4">
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold text-xs shadow-sm",
        isOfficer ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-violet-50 border-violet-100 text-violet-700"
      )}>
        {isOfficer ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
        {isOfficer ? "Officer" : "Manager"}
      </div>

      <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <FilterPill active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
          All {isOfficer ? "Officers" : "Managers"}
          <span className="ml-1.5 opacity-60">({counts.all})</span>
        </FilterPill>
        {data.map((p: any) => (
          <FilterPill
            key={p.id}
            active={activeTab === p.id.toString()}
            onClick={() => setActiveTab(activeTab === p.id.toString() ? 'all' : p.id.toString())}
          >
            {p.full_name || p.name || p.displayName}
            <span className="ml-1.5 opacity-60 text-[10px]">({counts[p.id] || 0})</span>
          </FilterPill>
        ))}
      </div>

      <Select value={mode} onValueChange={setMode}>
        <SelectTrigger className="w-40 h-9 bg-white border-slate-200 rounded-xl text-xs font-bold shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="current" className="text-xs font-medium">Current Basket</SelectItem>
          <SelectItem value="history" className="text-xs font-medium">Historical View</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 h-8 px-4 rounded-full text-xs font-bold transition-all duration-200 border whitespace-nowrap',
        active 
          ? "bg-slate-900 text-white border-slate-900 shadow-md translate-y-[-1px]" 
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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
  const counts = { all: allTasksCount, wip: wipTasksCount, write_up_completed: writeUpCompletedCount, endorsed: endorsedCount, cancelled: cancelledCount };
  
  const currentSubDept = activeSubDepartments.find((s: any) => 
    s.id.toString() === (activeSubDeptId === 'all' ? activeSubDepartments[0]?.id.toString() : activeSubDeptId)
  );

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-6">
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/60">
        {STATUS_TABS.map(status => {
          const isActive = activeStatus === status.id;
          return (
            <button
              key={status.id}
              onClick={() => setActiveStatus(status.id)}
              className={cn(
                "px-4 h-9 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5",
                isActive 
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <div className={cn("h-2 w-2 rounded-full", status.dotColor)} />
              {status.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-[10px]",
                isActive ? "bg-slate-100 text-slate-900" : "bg-slate-200/50 text-slate-500"
              )}>
                {counts[status.id]}
              </span>
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
  { value: 'overview',  label: 'Overview' },
  { value: 'officers',  label: 'By Officer' },
  { value: 'managers',  label: 'By Manager' },
  { value: 'clients',   label: 'By Client' },
] as const;

const STATUS_TABS = [
  { id: 'all', label: 'Total', dotColor: 'bg-slate-400' },
  { id: 'wip', label: 'WIP', dotColor: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' },
  { id: 'write_up_completed', label: 'Completed', dotColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' },
  { id: 'endorsed', label: 'Endorsed', dotColor: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]' },
  { id: 'cancelled', label: 'Cancelled', dotColor: 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]' },
];