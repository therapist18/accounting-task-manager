// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { ChevronDown, Filter, RotateCcw, X, Download, Search, Send, ChevronRight, ChevronLeft, Plus, Minus, AlertCircle, TableProperties, LayoutGrid, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReportColumnVisibilityDialog } from "./ReportColumnVisibilityDialog";

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
      "flex flex-col max-h-screen shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-[60px]" : "w-[260px]"
    )}>
    <div className="flex flex-col h-full overflow-hidden bg-slate-900">
        {/* Header */}
      <div className={cn(
        "px-4 py-4 flex items-center shrink-0 border-b border-slate-700/50",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && (
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Workspace</h2>
            <span className="text-[13px] text-white font-semibold">Departments</span>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Search Input */}
      {!isCollapsed && (
        <div className="p-3 border-b border-slate-700/50 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-9 pr-7 h-8 text-[11px] rounded-lg bg-slate-800 border border-slate-700 text-white focus:bg-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-500"
            />
            {sidebarSearch && (
              <button onClick={() => setSidebarSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {filteredDepartments.map((dept) => {
          const isActive = activeDeptId === dept.id.toString();

          if (isCollapsed) {
            return (
              <button
                key={dept.id}
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-9 h-9 mx-auto flex items-center justify-center rounded-lg text-[10px] font-semibold transition-all mt-1",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
                title={dept.name}
              >
                {getInitials(dept.name)}
              </button>
            );
          }

          return (
            <div key={dept.id} className="px-2">
              <button
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 transition-all text-left rounded-lg",
                  isActive ? "bg-blue-600/10 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "h-6 w-6 rounded flex items-center justify-center text-[9px] font-semibold",
                    isActive ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                  )}>
                    {getInitials(dept.name)}
                  </div>
                  <span className={cn(
                    "text-[11px] font-medium truncate",
                    isActive ? "text-white font-semibold" : "text-slate-400"
                  )}>
                    {dept.name}
                  </span>
                </div>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
              </button>

              {isActive && activeSubDepartments.length > 0 && (
                <div className="ml-4 mt-1 mb-2 pl-3 border-l border-slate-700">
                  <button
                    onClick={() => setActiveSubDeptIds([])}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[11px] font-medium transition-all rounded-md",
                      activeSubDeptIds.length === 0
                        ? "bg-blue-600/10 text-blue-400"
                        : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                    )}
                  >
                    All Sub-units
                  </button>

                  {activeSubDepartments.map((sub) => {
                    const id = sub.id.toString();
                    const isSelected = activeSubDeptIds.includes(id);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => toggleSubDept(id)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-[11px] font-medium transition-all truncate rounded-md",
                          isSelected
                            ? "bg-blue-600/10 text-blue-400"
                            : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                        )}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
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

export function ReportsHeader({ activeReport, setIsReportDialogOpen, view, setView, handleSendReport, activeDepartment, activeSubDepartments, activeSubDeptIds, allTasksCount, wipTasksCount, writeUpCompletedCount, columns, visibleColumnIds, setVisibleColumnIds, showTimeTrackingColumns, setShowTimeTrackingColumns, showDocRequirementsColumns, setShowDocRequirementsColumns }: any) {

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
        <div onClick={() => setIsReportDialogOpen(true)} className="group cursor-pointer min-w-0 flex flex-col gap-1">
          <h1 className="text-[20px] font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors leading-none flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600 shrink-0" />
            {activeReport?.name || "SELECT REPORT"}
          </h1>
          <div className="flex items-center text-[11px] text-slate-400 gap-1 ml-7">
            <span className="text-slate-600 font-medium">{activeDepartment?.name || "Global"}</span>
            <span className="text-slate-300">/</span>
            <span className="truncate">{selectedSubDeptText}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View Toggle - underline style */}
          <div className="flex items-end gap-0 border-b border-slate-200 mr-2">
            <button onClick={() => setView('standard')} className={cn(
              "h-8 px-3 text-[11px] font-semibold transition-all flex items-center gap-1.5 border-b-[3px] -mb-px",
              view === 'standard'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}>
              <LayoutGrid className="h-3 w-3" /> Overall
            </button>
            <button onClick={() => setView('transposed')} className={cn(
              "h-8 px-3 text-[11px] font-semibold transition-all flex items-center gap-1.5 border-b-[3px] -mb-px",
              view === 'transposed'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}>
              <TableProperties className="h-3 w-3" /> Transposed
            </button>
          </div>

          <ReportColumnVisibilityDialog
            columns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
            showTimeTrackingColumns={showTimeTrackingColumns}
            setShowTimeTrackingColumns={setShowTimeTrackingColumns}
            showDocRequirementsColumns={showDocRequirementsColumns}
            setShowDocRequirementsColumns={setShowDocRequirementsColumns}
          />

          <div className="h-5 w-px bg-slate-200" />

          {/* Action Buttons - grouped together */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold gap-1.5 shadow-sm">
                <Send className="h-3.5 w-3.5" />
                Send
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-2 rounded-lg shadow-lg border-slate-200">
              <div className="px-2 py-1.5">
                <p className="text-[9px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Officer</p>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7 rounded-md" onClick={() => handleSendReport('officer', 'excel')}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7 rounded-md" onClick={() => handleSendReport('officer', 'pdf')}>PDF</Button>
                </div>
              </div>
              <DropdownMenuSeparator className="my-1" />
              <div className="px-2 py-1.5">
                <p className="text-[9px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Manager</p>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7 rounded-md" onClick={() => handleSendReport('manager', 'excel')}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7 rounded-md" onClick={() => handleSendReport('manager', 'pdf')}>PDF</Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg border-slate-200 text-[11px] font-medium text-slate-600 bg-white hover:bg-slate-50 gap-1.5">
            <Download className="h-3.5 w-3.5 text-blue-500" /> Export
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PersonFilterStrip({ searchQuery, setSearchQuery, activePerspective, setActivePerspective, officerTaskCounts = { all: 0 }, taskManagerTaskCounts = { all: 0 }, allTasksCount = 0, clientTaskCounts = { all: 0 }, availableOfficers = [], activeOfficerTab, setActiveOfficerTab, officerFilterMode, setOfficerFilterMode, availableTaskManagers = [], activeTaskManagerTab, setActiveTaskManagerTab, taskManagerFilterMode, setTaskManagerFilterMode, refreshData, loading, activeClassId, setActiveClassId, activeSubClassId, setActiveSubClassId, activeSubDepartments, activeSubDeptIds }: any) {
  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const currentData = isOfficer ? availableOfficers : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerTab : activeTaskManagerTab;
  const setTab = isOfficer ? setActiveOfficerTab : setActiveTaskManagerTab;
  const counts = isOfficer ? officerTaskCounts : taskManagerTaskCounts;
  const mode = isOfficer ? officerFilterMode : taskManagerFilterMode;
  const setMode = isOfficer ? setOfficerFilterMode : setTaskManagerFilterMode;
  const perspectiveCounts = { overview: allTasksCount || 0, officers: officerTaskCounts?.all || 0, managers: taskManagerTaskCounts?.all || 0, clients: clientTaskCounts?.all || 0 };
  const currentSubDept = (activeSubDepartments || []).find((s: any) => s.id.toString() === (activeSubDeptIds[0] || activeSubDepartments?.[0]?.id.toString()));

  return (
    <div className="bg-white border-b border-slate-200 antialiased flex flex-col">
      {/* Tier 1: Toolbar Row */}
      <div className="px-8 py-4 flex items-center justify-between gap-4">
        {/* Left: Global Search */}
        <div className="relative group w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search employee, ID, department..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-11 pr-10 bg-white border-slate-200 rounded-lg text-[13px] font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Perspective Tabs - underline style */}
          <div className="flex items-end gap-0 border-b border-slate-200">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'officers', label: 'Officers' },
              { id: 'managers', label: 'Managers' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setActivePerspective(p.id)}
                className={cn(
                  "h-9 px-4 text-[11px] font-semibold transition-all flex items-center gap-1.5 border-b-[3px] -mb-px",
                  activePerspective === p.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-400 hover:text-slate-700"
                )}
              >
                {p.label}
                <span className={cn(
                  "text-[10px] font-medium tabular-nums",
                  activePerspective === p.id ? "text-blue-500" : "text-slate-400"
                )}>
                  {perspectiveCounts[p.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Mode Selector for Person Perspective */}
          {(isOfficer || isManager) && (
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="w-40 h-9 bg-white border-slate-200 rounded-lg text-[11px] font-medium text-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="current">Current Assignments</SelectItem>
                <SelectItem value="history">Historical Activity</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="h-5 w-px bg-slate-200" />

          {/* Main Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 px-3 rounded-lg text-[11px] font-medium gap-1.5",
                  (activeClassId !== 'all') 
                    ? "bg-blue-50 border-blue-200 text-blue-600" 
                    : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                )}
              >
                <Filter className="h-3.5 w-3.5" /> Filter
                {(activeClassId !== 'all') && (
                  <span className="bg-blue-600 text-white rounded-full h-4 w-4 flex items-center justify-center text-[9px] font-bold">!</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-4 rounded-lg shadow-lg border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Categorization</span>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Task Class</label>
                  <Select value={activeClassId} onValueChange={v => { setActiveClassId(v); setActiveSubClassId('all'); }}>
                    <SelectTrigger className="h-9 rounded-lg border-slate-200 text-[12px]">
                      <SelectValue placeholder="All Classes" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      <SelectItem value="all">All Classes</SelectItem>
                      {currentSubDept?.classes?.map((cls: any) => (
                        <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeClassId !== 'all' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sub-Class</label>
                    <Select value={activeSubClassId} onValueChange={setActiveSubClassId}>
                      <SelectTrigger className="h-9 rounded-lg border-slate-200 text-[12px]">
                        <SelectValue placeholder="All Sub-classes" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg">
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
                  size="sm"
                  className="w-full text-[11px] h-8 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  onClick={() => { setActiveClassId('all'); setActiveSubClassId('all'); }}
                >
                  Reset
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={refreshData}
            disabled={loading}
            className="h-8 px-3 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-slate-50 gap-1.5"
          >
            <RotateCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Tier 1.5: Assignee Pills with Counts */}
      {(isOfficer || isManager) && (
        <div className="px-8 pb-3 flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider mr-1",
            isOfficer ? "text-blue-500" : "text-violet-500"
          )}>
            {isOfficer ? "Officers" : "Managers"}
          </span>

          <button
            onClick={() => setTab('all')}
            className={cn(
              "h-7 px-3 text-[11px] font-semibold transition-all rounded-md",
              currentActive === 'all'
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            )}
          >
            All <span className="ml-1 text-[10px] opacity-60">{counts.all}</span>
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
                  "h-7 px-3 text-[11px] font-semibold transition-all rounded-md flex items-center gap-1",
                  isActive
                    ? (isOfficer ? "bg-blue-600 text-white" : "bg-violet-600 text-white")
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                )}
              >
                {displayName}
                {count > 0 && (
                  <span className={cn(
                    "text-[9px] font-medium tabular-nums",
                    isActive ? "opacity-70" : "text-slate-400"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {(counts.__unallocated__ ?? 0) > 0 && (
            <button
              onClick={() => setTab(currentActive === '__unallocated__' ? 'all' : '__unallocated')}
              className={cn(
                "h-7 px-3 text-[11px] font-medium transition-all rounded-md flex items-center gap-1",
                currentActive === '__unallocated__'
                  ? "bg-red-600 text-white"
                  : "text-red-500 hover:text-red-700 hover:bg-red-50"
              )}
            >
              <AlertCircle className="h-3 w-3" />
              Unallocated
              <span className={cn(
                "text-[9px] font-medium tabular-nums",
                currentActive === '__unallocated__' ? "opacity-70" : "text-red-400"
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
    { id: 'all', label: 'All Tasks', color: 'text-slate-600', activeColor: 'border-blue-600 text-blue-600' },
    { id: 'wip', label: 'WIP', color: 'text-amber-600', activeColor: 'border-amber-500 text-amber-600' },
    { id: 'write_up_completed', label: 'Write-up Completed', color: 'text-emerald-600', activeColor: 'border-emerald-500 text-emerald-600' },
    { id: 'endorsed', label: 'Endorsed', color: 'text-violet-600', activeColor: 'border-violet-500 text-violet-600' },
  ];

  return (
    <div className="px-8 flex items-end border-b border-slate-200 bg-white antialiased">
      <div className="flex gap-0">
        {tabs.map(s => {
          const isActive = activeStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveStatus(s.id)}
              className={cn(
                "h-11 px-5 text-[12px] font-semibold transition-all flex items-center gap-2 border-b-[3px] -mb-px",
                isActive
                  ? s.activeColor
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {s.label}
              <span className={cn(
                "text-[10px] font-medium tabular-nums",
                isActive ? "opacity-70" : "text-slate-300"
              )}>
                {counts[s.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}