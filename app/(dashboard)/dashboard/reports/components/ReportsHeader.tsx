// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { ChevronDown, Filter, RotateCcw, X, Download, Search, Send, ChevronRight, ChevronLeft, Plus, Minus, ArrowUpDown, SearchX, ChevronsLeft, ChevronsRight, Shield, User, Clock, Sparkles, AlertCircle, ListChecks, Check, Layers, Settings2, TableProperties, LayoutGrid, Building2, Eye, EyeOff, GitCompare, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { ReportColumnVisibilityDialog } from "./ReportColumnVisibilityDialog";

// Asks the user which optional columns/formatting to bake into the exported
// file — the on-screen Δ/Time toggles only affect the live table, so export
// needs its own explicit opt-in rather than silently mirroring screen state.
function ExportOptionsDialog({ pending, onClose, onConfirm }: any) {
  const [includeDelta, setIncludeDelta] = useState(false);
  const [includeTime, setIncludeTime] = useState(false);

  React.useEffect(() => {
    if (pending) { setIncludeDelta(false); setIncludeTime(false); }
  }, [pending]);

  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-900">Export Options</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
            <Checkbox checked={includeDelta} onCheckedChange={(v: boolean) => setIncludeDelta(!!v)} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">Show Δ (time between stages)</span>
              <span className="text-xs text-slate-500">Adds a day-difference column between each pair of stage columns</span>
            </div>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
            <Checkbox checked={includeTime} onCheckedChange={(v: boolean) => setIncludeTime(!!v)} />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">Show Time</span>
              <span className="text-xs text-slate-500">Includes the time-of-day alongside exported dates</span>
            </div>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="rounded-lg text-white"
            style={{ backgroundColor: '#376bae' }}
            onClick={() => onConfirm({ includeDelta, includeTime })}
          >
            Export {pending?.exportFormat?.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

export function ReportsSidebar({ departments, activeDeptId, setActiveDeptId, activeSubDepartments, activeSubDeptIds, setActiveSubDeptIds, isCollapsed = false, onToggleCollapse }: ReportsSidebarProps) {
  const [sidebarSearch, setSidebarSearch] = React.useState("");
  const [expandedDeptId, setExpandedDeptId] = React.useState<string | null>(activeDeptId);

  React.useEffect(() => {
    if (activeDeptId) setExpandedDeptId(activeDeptId);
  }, [activeDeptId]);

  const toggleSubDept = (id: string) => {
    setActiveSubDeptIds(
      activeSubDeptIds.includes(id)
        ? activeSubDeptIds.filter(x => x !== id)
        : [...activeSubDeptIds, id]
    );
  };

  const handleDeptClick = (deptId: string) => {
    setActiveDeptId(deptId);
    setActiveSubDeptIds([]);
    setExpandedDeptId(prev => prev === deptId ? null : deptId);
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
      "border-r border-slate-200 bg-[#FAFAFC] flex flex-col max-h-screen shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-[52px]" : "w-[260px]"
    )}>
      <div className="shadow-md flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className={cn(
          "px-4 py-6 flex items-center shrink-0 border-b border-slate-200 bg-white",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          {!isCollapsed && (
            <div className="flex gap-2">
              <span className="text-white p-2 rounded-sm" style={{ backgroundColor: '#376bae' }}><Building2 className="h-6 w-6 text-white" /></span>
              <div className="flex flex-col">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest leading-tight">Workspace</h2>
                <span className="text-[14px] text-slate-900 font-bold">Departments</span>
              </div>
            </div>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={cn(
                "p-1.5 rounded-full border border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-all",
                isCollapsed && "mx-auto"
              )}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Collapsed: thin rail with expand icon */}
        {isCollapsed ? (
          <div className="flex-1 flex flex-col items-center py-4 gap-1">
            <div className="w-6 h-px bg-slate-200" />
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2 rotate-180" style={{ writingMode: 'vertical-rl' }}>Depts</span>
          </div>
        ) : (
          <>
            {/* Search Input */}
            <div className="p-4 bg-white border-b border-slate-200 shrink-0">
              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search department..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  className="w-full pl-10 pr-8 h-10 text-sm rounded-full border border-slate-300 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                />
                {sidebarSearch && (
                  <button onClick={() => setSidebarSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-white custom-scrollbar pb-6">
              {filteredDepartments.map((dept) => {
                const isActive = activeDeptId === dept.id.toString();
                const isExpanded = expandedDeptId === dept.id.toString();

                return (
                  <div key={dept.id} className="border-b border-slate-100 last:border-none">
                    <button
                      onClick={() => handleDeptClick(dept.id.toString())}
                      className={cn(
                        "w-full flex items-center justify-between px-5 py-3.5 transition-all text-left",
                        isActive ? "bg-slate-50/80" : "hover:bg-slate-50/50"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "h-7 w-7 rounded-md flex items-center justify-center text-sm font-bold shrink-0 transition-all",
                          isActive ? "bg-custom-blue text-white" : "bg-slate-100 text-slate-500"
                        )}>
                          {getInitials(dept.name)}
                        </div>
                        <span className={cn(
                          "text-sm font-semibold uppercase tracking-wider truncate",
                          isActive ? "text-slate-900" : "text-slate-500"
                        )}>
                          {dept.name}
                        </span>
                      </div>
                      <ChevronDown className={cn(
                        "h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )} />
                    </button>

                    {isExpanded && activeSubDepartments.length > 0 && (
                      <div className="pb-3 px-3 flex flex-col gap-0.5 bg-slate-100">
                        <button
                          onClick={() => setActiveSubDeptIds([])}
                          className={cn(
                            "w-full text-left px-4 py-2 text-sm font-medium transition-all rounded-md flex justify-between items-center",
                            activeSubDeptIds.length === 0
                              ? "bg-custom-blue text-white"
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          )}
                        >
                          <span>All Sub-units</span>
                          {activeSubDeptIds.length === 0 && <Check className="h-3 w-3" />}
                        </button>

                        {activeSubDepartments.map((sub) => {
                          const id = sub.id.toString();
                          const isSelected = activeSubDeptIds.includes(id);
                          return (
                            <button
                              key={sub.id}
                              onClick={() => toggleSubDept(id)}
                              className={cn(
                                "w-full text-left px-4 py-2 text-sm font-medium transition-all truncate rounded-md flex justify-between items-center",
                                isSelected
                                  ? "bg-custom-blue text-white"
                                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              )}
                            >
                              <span className="truncate">{sub.name}</span>
                              {isSelected && <Check className="h-3 w-3 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ReportsHeader({ activeReport, setIsReportDialogOpen, view, setView, handleSendReport, activeDepartment, activeSubDepartments, activeSubDeptIds, allTasksCount, wipTasksCount, writeUpCompletedCount, columns, visibleColumnIds, setVisibleColumnIds, showTime, setShowTime, showDelta, setShowDelta, showOfficers, setShowOfficers, showNARows, setShowNARows, showDependentStages, setShowDependentStages }: any) {

  const [pendingExport, setPendingExport] = useState<{ reportType: 'officer' | 'manager'; exportFormat: 'excel' | 'pdf' } | null>(null);

  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All Sub-units";
    const names = activeSubDeptIds.map(id => activeSubDepartments.find((s: any) => s.id.toString() === id)?.name).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="border-b border-slate-200 bg-white px-8 py-5 antialiased flex flex-col justify-center">
      <div className="flex items-center justify-between">
        <div onClick={() => setIsReportDialogOpen(true)} className="group cursor-pointer min-w-0 flex flex-col gap-1.5">
          <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight truncate group-hover:text-blue-600 transition-colors leading-none">
            {activeReport?.name || "SELECT REPORT"}
          </h1>
          <div className="flex items-center text-sm text-slate-500 font-semibold gap-1">
            <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span className="text-blue-600 font-bold">{activeDepartment?.name || "Global"}</span>
            <span className="text-slate-300 mx-0.5">/</span>
            <span className="truncate text-slate-500">{selectedSubDeptText}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
            <button onClick={() => setView('standard')} className={cn(
              "px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
              view === 'standard'
                ? "bg-custom-blue text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}>
              <LayoutGrid className="h-3 w-3" /> Overall View
            </button>
            <button onClick={() => setView('transposed')} className={cn(
              "px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
              view === 'transposed'
                ? "bg-custom-blue text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}>
              <TableProperties className="h-3 w-3" /> Transposed
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <ReportColumnVisibilityDialog
            columns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
          />
          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Officers Toggle */}
          {setShowOfficers && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOfficers((v: boolean) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showOfficers ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <User className="h-3.5 w-3.5" />
              Officers Cols: {showOfficers ? "Visible" : "Hidden"}
            </Button>
          )}

          {/* Dependent Stages Toggle */}
          {setShowDependentStages && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDependentStages((v: boolean) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showDependentStages ? "bg-amber-50 border-amber-300 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              Dep. Stages: {showDependentStages ? "Visible" : "Hidden"}
            </Button>
          )}

          {/* Show Time Toggle - Like Immigration Tracker */}
          {setShowTime && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTime((v: boolean) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showTime ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {showTime ? "Hide Time" : "Show Time"}
            </Button>
          )}

          {/* Delta Toggle - Like Immigration Tracker */}
          {setShowDelta && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDelta((v: boolean) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showDelta ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {showDelta ? "Hide Δ" : "Show Δ"}
            </Button>
          )}

          {/* Show/Hide N/A Toggle */}
          {setShowNARows && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNARows((v: boolean) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                !showNARows ? "bg-amber-50 border-amber-300 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {showNARows ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showNARows ? "Hide N/A" : "Show N/A"}
            </Button>
          )}

          <div className="h-6 w-px bg-slate-200 mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 px-6 rounded-full hover:bg-[#2d5a94] text-white text-sm font-bold gap-2 shadow-md transition-all" style={{ backgroundColor: '#376bae' }}>
                <Send className="h-4 w-4" />
                Send Report
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl border-slate-200">
              <div className="px-3 py-2">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Officer Delivery</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg" onClick={() => setPendingExport({ reportType: 'officer', exportFormat: 'excel' })}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg" onClick={() => setPendingExport({ reportType: 'officer', exportFormat: 'pdf' })}>PDF</Button>
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="px-3 py-2">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Manager Delivery</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg border-violet-200 hover:bg-violet-50 text-violet-700" onClick={() => setPendingExport({ reportType: 'manager', exportFormat: 'excel' })}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg border-violet-200 hover:bg-violet-50 text-violet-700" onClick={() => setPendingExport({ reportType: 'manager', exportFormat: 'pdf' })}>PDF</Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" className="h-10 px-5 rounded-full border-emerald-600 text-sm font-bold text-emerald-700 bg-emerald-50/30 hover:bg-emerald-50">
            <Download className="h-4 w-4 mr-2" /> Bulk Export
          </Button>

          <ExportOptionsDialog
            pending={pendingExport}
            onClose={() => setPendingExport(null)}
            onConfirm={(opts: { includeDelta: boolean; includeTime: boolean }) => {
              if (pendingExport) handleSendReport(pendingExport.reportType, pendingExport.exportFormat, opts);
              setPendingExport(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function PersonFilterStrip({ searchQuery, setSearchQuery, activePerspective, setActivePerspective, officerTaskCounts = { all: 0 }, taskManagerTaskCounts = { all: 0 }, allTasksCount = 0, clientTaskCounts = { all: 0 }, availableOfficers = [], activeOfficerTab, setActiveOfficerTab, officerFilterMode, setOfficerFilterMode, availableTaskManagers = [], activeTaskManagerTab, setActiveTaskManagerTab, taskManagerFilterMode, setTaskManagerFilterMode, availableClients = [], activeClientTab, setActiveClientTab, clientFilterMode, setClientFilterMode, refreshData, loading, activeClassId, setActiveClassId, activeSubClassId, setActiveSubClassId, activeSubDepartments, activeSubDeptIds }: any) {
  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const isClient = activePerspective === 'clients';
  const isPersonView = isOfficer || isManager || isClient;
  const currentData = isOfficer ? availableOfficers : isClient ? availableClients : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerTab : isClient ? activeClientTab : activeTaskManagerTab;
  const setTab = isOfficer ? setActiveOfficerTab : isClient ? setActiveClientTab : setActiveTaskManagerTab;
  const counts = isOfficer ? officerTaskCounts : isClient ? clientTaskCounts : taskManagerTaskCounts;
  const mode = isOfficer ? officerFilterMode : isClient ? clientFilterMode : taskManagerFilterMode;
  const setMode = isOfficer ? setOfficerFilterMode : isClient ? setClientFilterMode : setTaskManagerFilterMode;
  const perspectiveCounts = { overview: allTasksCount || 0, officers: officerTaskCounts?.all || 0, managers: taskManagerTaskCounts?.all || 0, clients: clientTaskCounts?.all || 0 };
  const currentSubDept = (activeSubDepartments || []).find((s: any) => s.id.toString() === (activeSubDeptIds[0] || activeSubDepartments?.[0]?.id.toString()));

  return (
    <div className="border-b border-slate-200 antialiased flex flex-col">
      {/* Tier 1: Toolbar Row */}
      <div className="px-8 py-4 flex items-center justify-between gap-4 border-b border-t border-slate-200">
        {/* Left: Global Search */}
        <div className="relative group w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search employee, ID, department..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-11 pr-10 bg-white border-slate-300 rounded-full text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0">
            {[
              { id: 'overview', label: 'Overview', activeBg: 'bg-custom-blue', activeText: 'text-white' },
              { id: 'officers', label: 'Officers', activeBg: 'bg-amber-500', activeText: 'text-white' },
              { id: 'managers', label: 'Managers', activeBg: 'bg-violet-500', activeText: 'text-white' },
              { id: 'clients', label: 'Clients', activeBg: 'bg-emerald-500', activeText: 'text-white' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setActivePerspective(p.id)}
                className={cn(
                  "h-8 px-4 text-sm font-bold rounded-full transition-all flex items-center gap-2 ",
                  activePerspective === p.id
                    ? `${p.activeBg} ${p.activeText} shadow-sm`
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {p.label}
                <span className={cn(
                  "text-sm font-black tabular-nums px-1.5 py-0.5 rounded-full font-medium",
                  activePerspective === p.id ? `bg-white/20 ${p.activeText}` : "text-slate-400"
                )}>
                  {perspectiveCounts[p.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-200 mx-2 shrink-0" />

          {/* Mode Selector for Person Perspective */}
          {isPersonView && (
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="w-44 h-10 bg-white border-slate-300 rounded-full text-sm font-bold shadow-sm">
                <div className="flex items-center gap-2">
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="current">Current Assignments</SelectItem>
                <SelectItem value="history">Historical Activity</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Main Filter Dropdown (Class/Subclass logic) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-10 px-5 rounded-full border-blue-500 text-sm font-semibold text-blue-600 bg-white hover:bg-blue-50 shrink-0",
                  (activeClassId !== 'all') && "bg-custom-blue text-white hover:bg-[#2d5a94] hover:text-white"
                )}
              >
                <Filter className="h-4 w-4 mr-2" /> Filter
                {(activeClassId !== 'all') && (
                  <span className="ml-2 bg-white text-blue-600 rounded-full h-5 w-5 flex items-center justify-center text-sm font-black">!</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-4 rounded-2xl shadow-2xl border-slate-200">
              <div className="flex items-center justify-between mb-4 px-1">
                <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Categorization</span>
                <Sparkles className="h-4 w-4 text-blue-500" />
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Task Class</label>
                  <Select value={activeClassId} onValueChange={v => { setActiveClassId(v); setActiveSubClassId('all'); }}>
                    <SelectTrigger className="h-10 rounded-xl font-bold border-slate-200 text-sm">
                      <SelectValue placeholder="All Classes" />
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
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Sub-Class</label>
                    <Select value={activeSubClassId} onValueChange={setActiveSubClassId}>
                      <SelectTrigger className="h-10 rounded-xl font-bold border-slate-200 text-sm">
                        <SelectValue placeholder="All Sub-classes" />
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
                  className="w-full text-sm h-10 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-bold"
                  onClick={() => { setActiveClassId('all'); setActiveSubClassId('all'); }}
                >
                  Reset Categorization
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            onClick={refreshData}
            disabled={loading}
            className="h-10 px-5 rounded-full border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 text-slate-400 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />}
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Filter Description Banner */}
      {isPersonView && (
        <div className="px-8 py-2.5 flex items-center gap-3 border-b border-slate-100 bg-slate-50/80">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0",
            isOfficer ? "bg-blue-100/60 text-blue-700" : isClient ? "bg-emerald-100/60 text-emerald-700" : "bg-violet-100/60 text-violet-700"
          )}>
            {isOfficer ? <Shield className="h-3.5 w-3.5" /> : isClient ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            <span>{isOfficer ? "Officer View" : isClient ? "Client View" : "Manager View"}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isOfficer
              ? "Showing tasks filtered by officer assignment. Select a specific officer below to view only their assigned tasks, or click All to see tasks across all officers."
              : isClient
              ? "Showing tasks filtered by client (company). Select a specific client below to view only their tasks, or click All to see tasks across all clients."
              : "Showing tasks filtered by task manager assignment. Select a specific manager below to view only the tasks they manage, or click All to see tasks across all managers."
            }
            {mode === 'current' ? " Currently showing 'current assignment' data." : " Currently showing 'historical activity' data."}
          </p>
        </div>
      )}

      {/* Tier 1.5: Assignee Pills with Counts */}
      {isPersonView && (
        <div className="px-8 py-4 flex flex-wrap items-center gap-1.5">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-black uppercase font-bold mr-1 shrink-0",
            isOfficer ? "bg-blue-50 text-blue-600 border border-blue-100" : isClient ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-violet-50 text-violet-600 border border-violet-100"
          )}>
            {isOfficer ? <Shield className="h-3 w-3" /> : isClient ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isOfficer ? "Officers" : isClient ? "Clients" : "Managers"}
          </div>

          <button
            onClick={() => setTab('all')}
            className={cn(
              "h-10 px-6 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
              currentActive === 'all'
                ? "bg-slate-800 border-slate-800 text-white shadow-sm"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            All
            <span className={cn(
              "text-sm font-black tabular-nums font-medium",
              currentActive === 'all' ? "text-white/60" : "text-slate-400"
            )}>
              {counts.all}
            </span>
          </button>

          {currentData.map((p: any) => {
            const displayName = p.displayName || p.full_name || p.name || `User ${p.id}`;
            const isActive = currentActive === p.id.toString();
            const count = counts[p.id] || 0;
            return (
              <button
                key={p.id}
                onClick={() => setTab(isActive ? 'all' : p.id.toString())}
                className={cn(
                  "h-10 px-6 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
                  isActive
                    ? (isOfficer ? "bg-custom-blue border-custom-blue text-white shadow-sm" : isClient ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" : "bg-violet-600 border-violet-600 text-white shadow-sm")
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {displayName}
                {count > 0 && (
                  <span className={cn(
                    "text-sm font-black tabular-nums font-medium bg-custom-blue text-white px-1.5 py-0.5 rounded-full"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {(counts.__unallocated__ ?? 0) > 0 && (
            <button
              onClick={() => setTab(currentActive === '__unallocated__' ? 'all' : '__unallocated__')}
              className={cn(
                "h-10 px-3.5 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
                currentActive === '__unallocated__'
                  ? "bg-red-600 border-red-600 text-white shadow-sm"
                  : "bg-red-50 border-red-100 text-red-600 hover:bg-red-100"
              )}
            >
              <AlertCircle className="h-3 w-3" />
              Unallocated
              <span className={cn(
                "text-sm font-black tabular-nums font-medium",
                currentActive === '__unallocated__' ? "text-white/70" : "text-red-400"
              )}>
                {counts.__unallocated__}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusFilterBar({ activeStatus, setActiveStatus, allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount }: any) {
  const counts = { all: allTasksCount || 0, wip: wipTasksCount || 0, write_up_completed: writeUpCompletedCount || 0, endorsed: endorsedCount || 0, cancelled: cancelledCount || 0 };
  const tabs = [
    { id: 'all', label: 'All Applications' },
    { id: 'wip', label: 'WIP' },
    { id: 'write_up_completed', label: 'Write-up Completed' },
    { id: 'endorsed', label: 'Endorsed' },
  ];

  return (
    <div className="px-8 py-2.5 flex items-center border-b border-slate-200 bg-white antialiased">
      <div className="flex gap-1.5">
        {tabs.map(tab => {
          const isActive = activeStatus === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveStatus(tab.id)}
              className={cn(
                "h-10 px-5 text-base font-semibold rounded-lg transition-all flex items-center gap-2",
                isActive
                  ? "bg-custom-blue text-white shadow-sm"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
              )}
            >
              {tab.label}
              <span className={cn(
                "px-2 py-1 rounded-md text-sm font-bold tabular-nums",
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {counts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}