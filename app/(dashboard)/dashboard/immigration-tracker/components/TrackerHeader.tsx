// @ts-nocheck
"use client";

import React, { useState } from "react";
import {
  Building2, Search, X, RotateCcw, Eye, Send, Download,
  ChevronDown, LayoutGrid, TableProperties, Clock, GitCompare, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function ColumnVisibilityDialog({
  stageColumns, visibleStageColumnIds, setVisibleStageColumnIds,
  infoColumns, visibleInfoColumnIds, setVisibleInfoColumnIds,
}: any) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredStage = search.trim()
    ? stageColumns.filter((c: any) => c.label.toLowerCase().includes(search.toLowerCase()))
    : stageColumns;
  const filteredInfo = search.trim()
    ? (infoColumns || []).filter((c: any) => c.label.toLowerCase().includes(search.toLowerCase()))
    : (infoColumns || []);

  const allStageVisible = stageColumns.every((c: any) => visibleStageColumnIds.includes(c.id));

  const toggleStage = (id: string, checked: boolean) =>
    setVisibleStageColumnIds((prev: string[]) => checked ? [...prev, id] : prev.filter((x: string) => x !== id));
  const toggleAllStage = (checked: boolean) =>
    setVisibleStageColumnIds(checked ? stageColumns.map((c: any) => c.id) : []);
  const toggleInfo = (id: string, checked: boolean) =>
    setVisibleInfoColumnIds((prev: string[]) => checked ? [...prev, id] : prev.filter((x: string) => x !== id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 px-4 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2">
          <Eye className="h-4 w-4" /> Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-black text-slate-800 uppercase tracking-wider">
            Column Visibility
          </DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search columns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1 mt-3">
          {/* Stage Columns Section */}
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1 mb-1">Stage Columns</p>
          <div className="flex items-center gap-2 px-1 py-2 border-b border-slate-100 mb-2">
            <Checkbox id="toggle-all-stage" checked={allStageVisible} onCheckedChange={(v) => toggleAllStage(v === true)} />
            <label htmlFor="toggle-all-stage" className="text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer">Toggle All Stages</label>
          </div>
          {filteredStage.map((col: any) => (
            <div key={col.id} className="flex items-center gap-2.5 px-1 py-1.5 rounded hover:bg-slate-50">
              <Checkbox
                id={`stage-${col.id}`}
                checked={visibleStageColumnIds.includes(col.id)}
                onCheckedChange={(v) => toggleStage(col.id, v === true)}
              />
              <label htmlFor={`stage-${col.id}`} className="text-sm text-slate-700 cursor-pointer flex-1 flex items-center gap-2">
                {col.label}
                {col.hasDateInput && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full uppercase">Manual</span>}
              </label>
            </div>
          ))}

          {/* Info Columns Section */}
          {filteredInfo.length > 0 && (
            <>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1 mt-4 mb-1">Info Columns</p>
              {filteredInfo.map((col: any) => (
                <div key={col.id} className="flex items-center gap-2.5 px-1 py-1.5 rounded hover:bg-slate-50">
                  <Checkbox
                    id={`info-${col.id}`}
                    checked={(visibleInfoColumnIds || []).includes(col.id)}
                    onCheckedChange={(v) => toggleInfo(col.id, v === true)}
                  />
                  <label htmlFor={`info-${col.id}`} className="text-sm text-slate-700 cursor-pointer flex-1">
                    {col.label}
                  </label>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TrackerHeader({
  activeDepartment,
  activeSubDepartments,
  activeSubDeptIds,
  setActiveSubDeptIds,
  searchQuery,
  setSearchQuery,
  view,
  setView,
  showTime,
  setShowTime,
  showDelta,
  setShowDelta,
  showBclUsers,
  setShowBclUsers,
  stageColumns,
  visibleStageColumnIds,
  setVisibleStageColumnIds,
  infoColumns,
  visibleInfoColumnIds,
  setVisibleInfoColumnIds,
  onRefresh,
  onExportExcel,
  loading,
}: any) {
  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All Sub-units";
    const names = activeSubDeptIds
      .map((id: string) => activeSubDepartments.find((s: any) => s.id.toString() === id)?.name)
      .filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="border-b border-slate-200 bg-white antialiased flex flex-col justify-center">
      {/* Title + Actions Row */}
      <div className="px-8 py-4 flex items-center justify-between gap-4">
        {/* Title */}
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight leading-none">
            Immigration Document Tracker
          </h1>
          <div className="flex items-center text-sm text-slate-500 font-semibold gap-1">
            <Building2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#376bae' }} />
            <span className="font-bold" style={{ color: '#376bae' }}>
              {activeDepartment?.name || "Department"}
            </span>
            <span className="text-slate-300 mx-0.5">/</span>
            <span className="truncate text-slate-500">{selectedSubDeptText}</span>
          </div>
        </div>

        {/* Right: Search + Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Search */}
          <div className="relative w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search name, passport, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-9 bg-white border-slate-200 rounded-full text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-slate-200" />

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              onClick={() => setView("standard")}
              className={cn(
                "px-3 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
                view === "standard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="h-3 w-3" /> Standard
            </button>
            <button
              onClick={() => setView("transposed")}
              className={cn(
                "px-3 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
                view === "transposed" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <TableProperties className="h-3 w-3" /> Transposed
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          {/* Show/Hide Time */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTime((v: boolean) => !v)}
            className={cn(
              "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
              showTime
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {showTime ? "Hide Time" : "Show Time"}
          </Button>

          {/* Delta Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDelta((v: boolean) => !v)}
            className={cn(
              "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
              showDelta
                ? "bg-violet-50 border-violet-300 text-violet-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <GitCompare className="h-3.5 w-3.5" />
            {showDelta ? "Hide Time Gaps" : "Show Time Gaps"}
          </Button>

          {/* BCL Users Toggle */}
          {setShowBclUsers && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBclUsers((v: boolean) => !v)}
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                showBclUsers
                  ? "bg-violet-50 border-violet-300 text-violet-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {showBclUsers ? "Hide Officers" : "Show Officers"}
            </Button>
          )}

          {/* Column Visibility */}
          <ColumnVisibilityDialog
            stageColumns={stageColumns}
            visibleStageColumnIds={visibleStageColumnIds}
            setVisibleStageColumnIds={setVisibleStageColumnIds}
            infoColumns={infoColumns}
            visibleInfoColumnIds={visibleInfoColumnIds}
            setVisibleInfoColumnIds={setVisibleInfoColumnIds}
          />

          {/* Refresh */}
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-4 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2"
          >
            <RotateCcw className={cn("h-4 w-4 text-slate-400", loading && "animate-spin")} />
            Refresh
          </Button>

          <div className="h-6 w-px bg-slate-200" />

          {/* Send Report */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-9 px-5 rounded-full hover:bg-[#2d5a94] text-white text-sm font-bold gap-2 shadow-sm"
                style={{ backgroundColor: '#376bae' }}
              >
                <Send className="h-3.5 w-3.5" />
                Send Report
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-2 rounded-2xl shadow-xl border-slate-200">
              <div className="px-3 py-2">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Export Format</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg" onClick={onExportExcel}>Excel</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg" disabled>PDF</Button>
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="px-3 py-2">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Email Report</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50">Officer</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-sm h-8 rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50">Manager</Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk Export */}
          <Button
            variant="outline"
            onClick={onExportExcel}
            className="h-9 px-4 rounded-full border-emerald-600 text-sm font-bold text-emerald-700 bg-emerald-50/30 hover:bg-emerald-50 gap-2"
          >
            <Download className="h-3.5 w-3.5" /> Bulk Export
          </Button>
        </div>
      </div>

      {/* Sub-Department Tabs */}
      <div className="px-8 pb-3 flex items-center gap-1 bg-slate-50/50 border-t border-slate-100">
        <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-slate-200 w-fit mt-2">
          <button
            onClick={() => setActiveSubDeptIds([])}
            className={cn(
              "h-9 px-5 text-sm font-bold rounded-full transition-all",
              activeSubDeptIds.length === 0
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            All
          </button>
          {activeSubDepartments.map((sub: any) => {
            const id = sub.id.toString();
            const isActive = activeSubDeptIds.includes(id);
            return (
              <button
                key={sub.id}
                onClick={() => setActiveSubDeptIds(
                  isActive
                    ? activeSubDeptIds.filter((x: string) => x !== id)
                    : [...activeSubDeptIds, id]
                )}
                className={cn(
                  "h-9 px-5 text-sm font-bold rounded-full transition-all",
                  isActive ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                {sub.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TrackerStatusFilter({
  activeStatus,
  setActiveStatus,
  allTasksCount,
  wipTasksCount,
  writeUpCompletedCount,
  endorsedCount,
}: any) {
  const counts = {
    all: allTasksCount || 0,
    wip: wipTasksCount || 0,
    write_up_completed: writeUpCompletedCount || 0,
    endorsed: endorsedCount || 0,
  };

  const tabs = [
    { id: "all", label: "All Applications" },
    { id: "wip", label: "WIP" },
    { id: "write_up_completed", label: "Write-up Completed" },
    { id: "endorsed", label: "Endorsed" },
  ];

  return (
    <div className="px-8 py-2.5 flex items-center border-b border-slate-200 bg-white antialiased">
      <div className="flex gap-1.5">
        {tabs.map((s) => {
          const isActive = activeStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveStatus(s.id)}
              className={cn(
                "h-8 px-4 text-sm font-bold rounded-lg transition-all flex items-center gap-2",
                isActive
                  ? "bg-custom-blue text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800"
              )}
            >
              {s.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-sm font-bold tabular-nums",
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
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
