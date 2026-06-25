// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { ChevronDown, Filter, RotateCcw, X, Download, Search, Send, ChevronRight, ChevronLeft, Plus, Minus, ArrowUpDown, SearchX, ChevronsLeft, ChevronsRight, Shield, User, Clock, Sparkles, AlertCircle, ListChecks, Check, Layers, Settings2, TableProperties, LayoutGrid, Building2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
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
      "border-r border-slate-200 bg-[#FAFAFC] flex flex-col max-h-screen shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-[72px]" : "w-[260px]"
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
              className="p-1.5 rounded-full border border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-all"
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Search Input */}
        {!isCollapsed && (
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
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-white custom-scrollbar pb-6">
          {filteredDepartments.map((dept) => {
            const isActive = activeDeptId === dept.id.toString();

            if (isCollapsed) {
              return (
                <button
                  key={dept.id}
                  onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                  className={cn(
                    "w-11 h-11 mx-auto flex items-center justify-center rounded-full text-sm font-bold transition-all mt-3 border",
                    isActive
                      ? "bg-custom-blue text-white border-custom-blue"
                      : "bg-white text-slate-400 border-slate-200 hover:border-blue-300"
                  )}
                  title={dept.name}
                >
                  {getInitials(dept.name)}
                </button>
              );
            }

            return (
              <div key={dept.id} className="border-b border-slate-100 last:border-none">
                <button
                  onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                  className={cn(
                    "w-full flex items-center justify-between px-6 py-4 transition-all text-left",
                    isActive ? "bg-slate-50 border-l-4 border-custom-blue" : "hover:bg-slate-50 border-l-4 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-7 w-7 rounded flex items-center justify-center text-sm font-bold",
                      isActive ? "bg-custom-blue text-white" : "bg-slate-200 text-slate-500"
                    )}>
                      {getInitials(dept.name)}
                    </div>
                    <span className={cn(
                      "text-sm font-semibold uppercase tracking-wider truncate",
                      isActive ? "text-slate-900" : "text-slate-600"
                    )}>
                      {dept.name}
                    </span>
                  </div>
                  {isActive && <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                </button>

                {isActive && activeSubDepartments.length > 0 && (
                  <div className="border-y border-slate-100 py-2 px-4 flex flex-col">
                    <button
                      onClick={() => setActiveSubDeptIds([])}
                      className={cn(
                        "w-full text-left px-8 py-2.5 text-sm font-medium transition-all flex justify-between items-center",
                        activeSubDeptIds.length === 0
                          ? "bg-custom-blue text-white border mx-2 rounded-xl"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
                            "text-left px-8 py-2.5 text-sm font-medium transition-all truncate flex justify-between items-center",
                            isSelected
                              ? "h-10 text-sm rounded-sm border border-slate-300 transition-all bg-custom-blue text-white"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          )}
                        >
                          <div className="flex gap-2">
                            {isSelected && <span className="h-4 w-1 bg-white"></span>}
                            <span className="truncate">{sub.name}</span>
                          </div>
                          {isSelected && <Check className="h-3 w-3" />}
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
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}>
              <LayoutGrid className="h-3 w-3" /> Overall View
            </button>
            <button onClick={() => setView('transposed')} className={cn(
              "px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
              view === 'transposed'
                ? "bg-white text-blue-600 shadow-sm"
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
            showTimeTrackingColumns={showTimeTrackingColumns}
            setShowTimeTrackingColumns={setShowTimeTrackingColumns}
            showDocRequirementsColumns={showDocRequirementsColumns}
            setShowDocRequirementsColumns={setShowDocRequirementsColumns}
          />
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
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg" onClick={() => handleSendReport('officer', 'excel')}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg" onClick={() => handleSendReport('officer', 'pdf')}>PDF</Button>
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="px-3 py-2">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Manager Delivery</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg border-violet-200 hover:bg-violet-50 text-violet-700" onClick={() => handleSendReport('manager', 'excel')}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg border-violet-200 hover:bg-violet-50 text-violet-700" onClick={() => handleSendReport('manager', 'pdf')}>PDF</Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" className="h-10 px-5 rounded-full border-emerald-600 text-sm font-bold text-emerald-700 bg-emerald-50/30 hover:bg-emerald-50">
            <Download className="h-4 w-4 mr-2" /> Bulk Export
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
              { id: 'overview', label: 'Overview', activeBg: 'bg-white', activeText: 'text-blue-600' },
              { id: 'officers', label: 'Officers', activeBg: 'bg-white', activeText: 'text-blue-600' },
              { id: 'managers', label: 'Managers', activeBg: 'bg-white', activeText: 'text-blue-600' }
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
                  activePerspective === p.id ? "bg-blue-50 text-blue-500" : "text-slate-400"
                )}>
                  {perspectiveCounts[p.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-200 mx-2 shrink-0" />

          {/* Mode Selector for Person Perspective */}
          {(isOfficer || isManager) && (
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
            <RotateCcw className={cn("h-4 w-4 mr-2 text-slate-400", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Tier 1.5: Assignee Pills with Counts */}
      {(isOfficer || isManager) && (
        <div className="px-8 py-4 flex flex-wrap items-center gap-1.5">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-black uppercase font-bold mr-1 shrink-0",
            isOfficer ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-violet-50 text-violet-600 border border-violet-100"
          )}>
            {isOfficer ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isOfficer ? "Officers" : "Managers"}
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
                    ? (isOfficer ? "bg-custom-blue border-custom-blue text-white shadow-sm" : "bg-violet-600 border-violet-600 text-white shadow-sm")
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

export function KpiSummaryCards({ allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount }: any) {
  const cards = [
    { label: 'ALL TASKS', value: allTasksCount || 0, icon: Layers, iconBg: 'bg-custom-blue', cardBg: 'bg-blue-50/60 border-blue-100', valueColor: 'text-blue-700', accentBorder: 'border-l-blue-500' },
    { label: 'WIP', value: wipTasksCount || 0, icon: Clock, iconBg: 'bg-amber-500', cardBg: 'bg-amber-50/60 border-amber-100', valueColor: 'text-amber-700', accentBorder: 'border-l-amber-500' },
    { label: 'WRITE-UP COMPLETED', value: writeUpCompletedCount || 0, icon: Check, iconBg: 'bg-emerald-500', cardBg: 'bg-emerald-50/60 border-emerald-100', valueColor: 'text-emerald-700', accentBorder: 'border-l-emerald-500' },
    { label: 'ENDORSED', value: endorsedCount || 0, icon: Sparkles, iconBg: 'bg-teal-500', cardBg: 'bg-teal-50/60 border-teal-100', valueColor: 'text-teal-700', accentBorder: 'border-l-teal-500' },
  ];

  return (
    <div className="px-8 pt-4 pb-2 flex items-center gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={cn(
              "flex-1 flex items-center gap-4 px-5 py-4 rounded-xl border border-l-4 transition-all hover:shadow-sm",
              card.cardBg,
              card.accentBorder
            )}
          >
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", card.iconBg)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{card.label}</span>
              <span className={cn("text-2xl font-black tabular-nums leading-none mt-0.5", card.valueColor)}>
                {card.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatusFilterBar({ activeStatus, setActiveStatus, allTasksCount, wipTasksCount, writeUpCompletedCount, endorsedCount, cancelledCount }: any) {
  const counts = { all: allTasksCount || 0, wip: wipTasksCount || 0, write_up_completed: writeUpCompletedCount || 0, endorsed: endorsedCount || 0, cancelled: cancelledCount || 0 };
  const tabs = [
    { id: 'all', label: 'All Tasks', color: 'bg-custom-blue', lightBg: 'bg-blue-50', lightText: 'text-blue-700', ringColor: 'ring-blue-200' },
    { id: 'wip', label: 'WIP', color: 'bg-amber-500', lightBg: 'bg-amber-50', lightText: 'text-amber-700', ringColor: 'ring-amber-200' },
    { id: 'write_up_completed', label: 'Write-up Completed', color: 'bg-emerald-600', lightBg: 'bg-emerald-50', lightText: 'text-emerald-700', ringColor: 'ring-emerald-200' },
    { id: 'endorsed', label: 'Endorsed', color: 'bg-violet-600', lightBg: 'bg-violet-50', lightText: 'text-violet-700', ringColor: 'ring-violet-200' },
  ];

  return (
    <div className="px-8 py-4 pb-0 flex items-center border-b border-slate-200 antialiased">
      <div className="flex gap-1">
        {tabs.map(s => {
          const isActive = activeStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveStatus(s.id)}
              className={cn(
                "h-10 px-5 text-sm font-semibold rounded-t-xl transition-all flex items-center gap-2.5 border-x border-t",
                isActive
                  ? `${s.color} text-white border-transparent shadow-[0_-4px_12px_rgba(0,0,0,0.08)]`
                  : "bg-transparent text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-200/50"
              )}
            >
              {s.label}
              <span className={cn(
                "px-2 py-0.5 rounded-full text-sm font-black tabular-nums font-medium",
                isActive ? "bg-white/25 text-white" : "bg-slate-200 text-slate-500"
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