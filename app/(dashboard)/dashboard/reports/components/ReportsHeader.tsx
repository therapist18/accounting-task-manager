// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown, Filter, RotateCcw, X, Download,
  Search, Send, ChevronRight, ChevronLeft,
  Plus, Minus, ArrowUpDown, SearchX, ChevronsLeft, ChevronsRight
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  const toggleSubDept = (id: string) => {
    setActiveSubDeptIds(
      activeSubDeptIds.includes(id)
        ? activeSubDeptIds.filter(x => x !== id)
        : [...activeSubDeptIds, id]
    );
  };

  const filteredDepartments = sidebarSearch.trim()
    ? departments.filter(d => d.name?.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : departments;

  const filteredSubDepts = activeSubDepartments;

  return (
    <div className={cn(
      "border-r border-slate-200 bg-[#FAFAFC] flex flex-col max-h-screen shrink-0 transition-all duration-300 ease-in-out z-20",
      isCollapsed ? "w-[72px]" : "w-[280px]"
    )}>
      {/* Header */}
      <div className={cn(
        "px-6 py-6 flex items-center shrink-0 border-b border-slate-200 bg-white/80",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && (
          <div className="flex flex-col gap-1">
            <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest leading-tight">Departments</h2>
            <span className="text-[12px] text-slate-400 font-medium">Showing {filteredDepartments.length} of {departments.length}</span>
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

      {/* Search Input (No Filter Button to reduce noise) */}
      {!isCollapsed && (
        <div className="p-4 bg-white/80 border-b border-slate-200 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search department..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-10 pr-8 h-10 text-[13px] rounded-full border border-slate-300 focus:bg-white/80 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
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
      <div className="flex-1 overflow-y-auto bg-white/80 custom-scrollbar pb-6">
        {filteredDepartments.map((dept) => {
          const isActive = activeDeptId === dept.id.toString();

          if (isCollapsed) {
            return (
              <button
                key={dept.id}
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-11 h-11 mx-auto flex items-center justify-center rounded-full text-[12px] font-bold transition-all mt-3 border",
                  isActive
                    ? "bg-blue-50 text-blue-600 border-blue-200"
                    : "bg-white/80 text-slate-400 border-slate-200 hover:border-blue-300"
                )}
                title={dept.name}
              >
                {dept.name.substring(0, 2).toUpperCase()}
              </button>
            );
          }

          return (
            <div key={dept.id} className="border-b border-slate-100 last:border-none">
              {/* Department Item */}
              <button
                onClick={() => { setActiveDeptId(dept.id.toString()); setActiveSubDeptIds([]); }}
                className={cn(
                  "w-full flex items-center justify-between px-6 py-4 transition-all text-left",
                  isActive ? "bg-slate-50" : "hover:bg-slate-50"
                )}
              >
                <span className={cn(
                  "text-[12px] font-semibold uppercase tracking-wider truncate pr-4",
                  isActive ? "text-slate-900" : "text-slate-600"
                )}>
                  {dept.name}
                </span>
                {isActive && <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
              </button>

              {/* Sub-department List (Cleaned up, no checkboxes, highlighted selection) */}
              {isActive && activeSubDepartments.length > 0 && (
                <div className="bg-[#FAFAFC] border-y border-slate-100 py-2 flex flex-col">
                  {/* Select All Option */}
                  <button
                    onClick={() => setActiveSubDeptIds([])}
                    className={cn(
                      "w-full text-left px-8 py-2.5 text-[13px] font-medium transition-all",
                      activeSubDeptIds.length === 0
                        ? "bg-blue-50/80 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    All Sub-units
                  </button>

                  {/* Individual Sub-units */}
                  {filteredSubDepts.map((sub) => {
                    const id = sub.id.toString();
                    const isSelected = activeSubDeptIds.includes(id);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => toggleSubDept(id)}
                        className={cn(
                          "w-full text-left px-8 py-2.5 text-[13px] font-medium transition-all truncate",
                          isSelected
                            ? "bg-blue-50/80 text-blue-700"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
  );
}

// ─── Reports Header ──────────────────────────────────────────────────────────

export function ReportsHeader({
  activeReport, setIsReportDialogOpen, view, setView, handleSendReport,
  activeDepartment, activeSubDepartments, activeSubDeptIds,
  allTasksCount, wipTasksCount, writeUpCompletedCount
}: any) {

  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All";
    const names = activeSubDeptIds.map(id => activeSubDepartments.find((s: any) => s.id.toString() === id)?.name).filter(Boolean);
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="border-b border-slate-200 bg-white/80 px-8 py-6 antialiased flex flex-col justify-center">
      <div className="flex items-center justify-between">

        {/* LEFT: Context Header */}
        <div onClick={() => setIsReportDialogOpen(true)} className="group cursor-pointer min-w-0 flex flex-col gap-1">
          <h1 className="text-[18px] font-semibold text-slate-800 uppercase tracking-wide truncate group-hover:text-blue-600 transition-colors">
            {activeReport?.name || "SELECT REPORT"}
          </h1>
          <div className="flex items-center text-[12px] text-slate-500 font-medium">
            <span>{activeDepartment?.name || "Global"}</span>
            <span className="mx-2 text-slate-300">-</span>
            <span>Sub-units: {selectedSubDeptText}</span>
            <span className="mx-2 text-slate-300">-</span>
            <span>Total: {allTasksCount}</span>
            <span className="mx-2 text-slate-300">-</span>
            <span>WIP: {wipTasksCount}</span>
            <span className="mx-2 text-slate-300">-</span>
            <span>Done: {writeUpCompletedCount}</span>
          </div>
        </div>

        {/* RIGHT: High Level Actions */}
        <div className="flex items-center gap-4 shrink-0">

          {/* Top Level View Toggles (Uniform pill design) */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-full border border-slate-200">
            <button onClick={() => setView('standard')} className={cn(
              "px-5 py-2 text-[12px] font-semibold rounded-full transition-all border",
              view === 'standard'
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-transparent border-transparent text-slate-600 hover:text-slate-900"
            )}>
              Overall View
            </button>
            <button onClick={() => setView('transposed')} className={cn(
              "px-5 py-2 text-[12px] font-semibold rounded-full transition-all border",
              view === 'transposed'
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-transparent border-transparent text-slate-600 hover:text-slate-900"
            )}>
              Transposed
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Export Actions */}
          <Button variant="outline" className="h-10 px-5 rounded-full border-slate-200 text-[12px] font-medium text-slate-700 bg-white/80 hover:bg-slate-50">
            Export Template
          </Button>

          <Button variant="outline" className="h-10 px-5 rounded-full border-emerald-600 text-[12px] font-semibold text-emerald-700 bg-emerald-50/30 hover:bg-emerald-50">
            <Download className="h-4 w-4 mr-2 text-emerald-600" /> Bulk Export
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Primary Toolbar (Search & Filter Actions) ────────────────────────────────

export function PersonFilterStrip({
  searchQuery, setSearchQuery, activePerspective, setActivePerspective,
  officerTaskCounts = { all: 0 }, taskManagerTaskCounts = { all: 0 },
  availableOfficers = [], activeOfficerTab, setActiveOfficerTab,
  availableTaskManagers = [], activeTaskManagerTab, setActiveTaskManagerTab,
}: any) {

  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const currentData = isOfficer ? availableOfficers : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerTab : activeTaskManagerTab;
  const setTab = isOfficer ? setActiveOfficerTab : setActiveTaskManagerTab;

  return (
    <div className="bg-white/80 border-b border-slate-200 antialiased flex flex-col">
      {/* Tier 1: Toolbar Row */}
      <div className="px-8 py-4 flex items-center justify-between gap-4">

        {/* Left: Global Search */}
        <div className="relative group w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search employee, ID, department..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-11 pr-10 bg-white/80 border-slate-300 rounded-full text-[13px] font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 overflow-x-auto custom-scrollbar no-scrollbar">

          {/* Perspective Toggles (Unified Segmented Control) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'officers', label: 'Officers' },
              { id: 'managers', label: 'Managers' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setActivePerspective(p.id)}
                className={cn(
                  "h-8 px-4 text-[12px] font-semibold rounded-full transition-all",
                  activePerspective === p.id
                    ? "bg-white/80 text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Main Filter Toggle */}
          <Button
            variant="outline"
            className="h-10 px-5 rounded-full border-blue-500 text-[13px] font-semibold text-blue-600 bg-white/80 hover:bg-blue-50 shrink-0"
          >
            <Filter className="h-4 w-4 mr-2" /> Filter
            <span className="ml-2 bg-blue-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-[11px] font-bold leading-none">
              1
            </span>
          </Button>

          <Button variant="outline" className="h-10 px-5 rounded-full border-slate-200 text-[13px] font-medium text-slate-700 bg-white/80 hover:bg-slate-50 shrink-0">
            Select Filtered
          </Button>

          <Button variant="outline" className="h-10 px-5 rounded-full border-slate-200 text-[13px] font-medium text-slate-700 bg-white/80 hover:bg-slate-50 shrink-0">
            Clear Selection
          </Button>

          <Button variant="outline" className="h-10 px-5 rounded-full border-slate-200 text-[13px] font-medium text-slate-700 bg-white/80 hover:bg-slate-50 shrink-0">
            <RotateCcw className="h-4 w-4 mr-2 text-slate-400" /> Refresh
          </Button>

          <div className="h-6 w-px bg-slate-200 mx-2 shrink-0" />
        </div>
      </div>

      {/* Tier 1.5: Dynamic Assignee Selection */}
      {(isOfficer || isManager) && (
        <div className="px-8 pb-4 flex flex-wrap items-center gap-2.5">
          <span className="text-[12px] text-slate-400 mr-2 font-medium">Assignee Filter:</span>

          <button
            onClick={() => setTab('all')}
            className={cn(
              "h-8 px-4 rounded-full text-[12px] font-medium transition-all border",
              currentActive === 'all'
                ? "bg-slate-700 border-slate-700 text-white shadow-sm"
                : "bg-white/80 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            All
          </button>

          {currentData.map((p: any) => {
            const displayName = p.full_name || p.name || p.username || `User ${p.id}`;
            const isActive = currentActive === p.id.toString();
            return (
              <button
                key={p.id}
                onClick={() => setTab(p.id.toString())}
                className={cn(
                  "h-8 px-4 rounded-full text-[12px] font-medium transition-all border",
                  isActive
                    ? "bg-slate-700 border-slate-700 text-white shadow-sm"
                    : "bg-white/80 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {displayName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Secondary Tabs (Status Filter Bar) ──────────────────────────────────────

export function StatusFilterBar({ activeStatus, setActiveStatus }: any) {
  // Styled as unified connected tabs matching the SaaS standard
  return (
    <div className="px-8 pt-4 pb-0 flex items-center border-b border-slate-200 bg-[#FAFAFC] antialiased">
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'All Records' },
          { id: 'wip', label: 'WIP Snapshot' },
          { id: 'write_up_completed', label: 'Completed History' },
          { id: 'endorsed', label: 'Endorsement View' },
        ].map(s => {
          const isActive = activeStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveStatus(s.id)}
              className={cn(
                "h-10 px-6 text-[13px] font-semibold rounded-t-xl transition-all border border-b-0",
                isActive
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-transparent text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-200/50"
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}