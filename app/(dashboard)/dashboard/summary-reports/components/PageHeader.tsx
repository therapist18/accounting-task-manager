// @ts-nocheck
"use client";

import React, { useState } from "react";
import { Search, X, Shield, User, RotateCcw, Loader2, Eye, Check, ChevronsUpDown, Layers, CornerDownRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SUMMARY_COLUMNS } from "../stageColumnConfig";

// ── Shared UI: PillTrack ──
// Updated to match the "Grouped View Toggles" from the target design (e.g. Overview / Transposed)
export interface PillTrackItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
  activeBg?: string; 
  dot?: string; 
}

export function PillTrack({
  items, value, onValueChange, size = 'md', wrap = true,
}: {
  items: PillTrackItem[];
  value: string;
  onValueChange: (v: string) => void;
  size?: 'sm' | 'md';
  wrap?: boolean;
}) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0",
      wrap && "flex-wrap"
    )}>
      {items.map(item => {
        const isActive = value === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "font-bold rounded-full transition-all flex items-center shrink-0",
              size === 'sm' ? "h-7 px-3 text-xs gap-1.5" : "h-8 px-4 text-sm gap-2",
              isActive 
                ? cn(item.activeBg || "bg-custom-blue", "text-white shadow-sm") 
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
            )}
          >
            {Icon ? (
              <Icon className={cn(size === 'sm' ? "h-3 w-3" : "h-3.5 w-3.5", isActive ? "text-white" : "text-slate-400")} />
            ) : item.dot ? (
              <span className={cn("h-2 w-2 rounded-full shrink-0 shadow-sm", isActive ? "bg-white" : item.dot)} />
            ) : null}
            {item.label}
            {typeof item.count === 'number' && item.count > 0 && (
              <span className={cn(
                "font-black tabular-nums tracking-tight px-1.5 py-0.5 rounded-full font-medium",
                size === 'sm' ? "text-[10px]" : "text-sm",
                isActive ? "bg-white/20 text-white" : "bg-slate-200/50 text-slate-400"
              )}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Shared UI: MultiSelect Dropdown ──
function MultiSelectSearchableDropdown({
  label,
  items = [],
  selectedIds = [],
  counts = {},
  onToggle,
  onClear,
  searchPlaceholder,
  accentActive = false,
}: any) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? items.filter((it: any) => String(it.name || it.label || "").toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 px-5 rounded-full border-blue-500 text-sm font-semibold text-blue-600 bg-white hover:bg-blue-50 shrink-0",
            accentActive && "bg-custom-blue border-custom-blue text-white hover:bg-[#2d5a94] hover:text-white shadow-sm"
          )}
        >
          {label}
          {selectedIds.length > 0 && (
            <span className={cn(
              "ml-2 h-5 min-w-5 flex items-center justify-center rounded-full text-xs font-black tabular-nums px-1.5",
              accentActive ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
            )}>
              {selectedIds.length}
            </span>
          )}
          <ChevronsUpDown className={cn("ml-2 h-3.5 w-3.5", accentActive ? "opacity-60" : "opacity-40")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 rounded-2xl shadow-2xl border-slate-200" align="end">
        <div className="flex items-center justify-between mb-2 px-3 py-1">
          <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Select {label}</span>
        </div>
        <Command className="rounded-xl" shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`} value={search} onValueChange={setSearch} className="h-10 border-none focus:ring-0 text-sm" />
          <CommandList className="max-h-[240px] overflow-y-auto custom-scrollbar mt-1">
            <CommandEmpty className="py-6 text-center text-sm font-medium text-slate-500">No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((it: any) => {
                const id = it.id.toString();
                const isSelected = selectedIds.includes(id);
                return (
                  <CommandItem key={id} value={id} onSelect={() => onToggle(id)} className="cursor-pointer rounded-lg mx-1 my-0.5 px-3 py-2.5 aria-selected:bg-slate-50 transition-colors">
                    <Check className={cn("mr-3 h-4 w-4 shrink-0 transition-opacity", isSelected ? "opacity-100 text-blue-600" : "opacity-0")} />
                    <span className={cn("flex-1 text-sm font-semibold truncate", isSelected ? "text-slate-900" : "text-slate-600")}>{it.name}</span>
                    {typeof counts[id] === 'number' && counts[id] > 0 && (
                      <span className="ml-2 shrink-0 text-xs font-black tabular-nums h-5 min-w-5 flex items-center justify-center px-1.5 rounded-full bg-slate-100 text-slate-500">
                        {counts[id]}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {onClear && selectedIds.length > 0 && (
          <div className="mt-2 p-1 border-t border-slate-100">
            <Button
              variant="ghost"
              className="w-full h-9 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => { onClear(); setSearch(""); }}
            >
              Clear {label} Filters
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Department → Sub-Department + Class/Sub-Class Filters ──
export function HierarchyTabs({
  departments,
  activeDeptId, setActiveDeptId,
  activeSubDeptId, setActiveSubDeptId,
  deptTaskCounts = {}, subDeptTaskCounts = {},
  availableClasses = [], activeClassIds = [], setActiveClassIds, classCounts = {},
  availableSubClasses = [], activeSubClassIds = [], setActiveSubClassIds, subClassCounts = {},
}: any) {
  const activeDepartment = departments.find((d: any) => d.id.toString() === activeDeptId);
  const subDepartments = activeDepartment?.tm_subdepartments || [];

  const handleDeptChange = (v: string) => {
    setActiveDeptId(v);
    setActiveSubDeptId('all');
    setActiveClassIds?.([]);
    setActiveSubClassIds?.([]);
  };

  const handleSubDeptChange = (v: string) => {
    setActiveSubDeptId(v);
    setActiveClassIds?.([]);
    setActiveSubClassIds?.([]);
  };

  const toggleClass = (id: string) => {
    setActiveClassIds?.((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
    setActiveSubClassIds?.([]);
  };

  const toggleSubClass = (id: string) => {
    setActiveSubClassIds?.((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
  };

  const hasSubDepts = activeDeptId !== 'all' && subDepartments.length > 0;
  const hasClasses = availableClasses.length > 0 || availableSubClasses.length > 0;

  return (
    <div className="flex flex-col border-b border-slate-200 antialiased bg-white">
      <div className="px-8 py-3 flex flex-col gap-3">
        {/* Level 1: Departments */}
        <div className="flex items-center gap-2">
          <PillTrack
            value={activeDeptId}
            onValueChange={handleDeptChange}
            items={[
              { id: 'all', label: 'All Departments', count: deptTaskCounts.all },
              ...departments.map((d: any) => ({ id: d.id.toString(), label: d.name, count: deptTaskCounts[d.id.toString()] })),
            ]}
          />
        </div>

        {/* Level 2: Sub-Departments (Left) + Categorization (Right) */}
        {(hasSubDepts || hasClasses) && (
          <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {hasSubDepts && (
                <>
                  <CornerDownRight className="h-4 w-4 text-slate-300 shrink-0 ml-4" />
                  <div className="overflow-x-auto custom-scrollbar pb-1 -mb-1">
                    <PillTrack
                      size="sm"
                      value={activeSubDeptId}
                      onValueChange={handleSubDeptChange}
                      items={[
                        { id: 'all', label: 'All Sub-units', count: subDeptTaskCounts.all },
                        ...subDepartments.map((s: any) => ({ id: s.id.toString(), label: s.name, count: subDeptTaskCounts[s.id.toString()] })),
                      ]}
                    />
                  </div>
                </>
              )}
            </div>

            {hasClasses && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Layers className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Categorization</span>
                </div>
                <div className="h-6 w-px bg-slate-200 mx-1" />
                {availableClasses.length > 0 && (
                  <MultiSelectSearchableDropdown
                    label="Classes"
                    items={availableClasses}
                    selectedIds={activeClassIds}
                    counts={classCounts}
                    onToggle={toggleClass}
                    onClear={() => { setActiveClassIds?.([]); setActiveSubClassIds?.([]); }}
                    searchPlaceholder="Search classes..."
                    accentActive={activeClassIds.length > 0}
                  />
                )}
                {availableSubClasses.length > 0 && (
                  <MultiSelectSearchableDropdown
                    label="Sub-Classes"
                    items={availableSubClasses}
                    selectedIds={activeSubClassIds}
                    counts={subClassCounts}
                    onToggle={toggleSubClass}
                    onClear={() => setActiveSubClassIds?.([])}
                    searchPlaceholder="Search sub-classes..."
                    accentActive={activeSubClassIds.length > 0}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Task-Status Tabs ──
// Updated to match the specific `StatusFilterBar` blocky tabs aesthetic
export function StatusTabs({
  activeTaskStatus, setActiveTaskStatus, counts = {},
  activePerspective, setActivePerspective,
  allCount, officersCount, managersCount, clientsCount,
  officerFilterMode, setOfficerFilterMode,
  refreshData, loading,
}: any) {
  const STATUS_ITEMS = [
    { id: 'all', label: 'All Applications' },
    { id: 'enquiry', label: 'Enquiry' },
    { id: 'wip', label: 'WIP' },
    { id: 'completed', label: 'Completed' },
    { id: 'overdue', label: 'Overdue' },
  ];

  const perspectiveCounts = { all: allCount || 0, officers: officersCount || 0, managers: managersCount || 0, clients: clientsCount || 0 };

  const PERSPECTIVES = [
    { id: 'all', label: 'Overview', activeBg: 'bg-custom-blue', activeText: 'text-white' },
    { id: 'officers', label: 'Officers', activeBg: 'bg-sky-600', activeText: 'text-white' },
    { id: 'managers', label: 'Managers', activeBg: 'bg-violet-500', activeText: 'text-white' },
    { id: 'clients', label: 'Clients', activeBg: 'bg-emerald-500', activeText: 'text-white' }
  ];

  return (
    <div className="px-8 py-2 flex items-center justify-between gap-4 border-b border-slate-200 bg-white antialiased">
      <div className="flex gap-1.5 overflow-x-auto custom-scrollbar">
        {STATUS_ITEMS.map(tab => {
          const isActive = activeTaskStatus === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTaskStatus(tab.id)}
              className={cn(
                "h-8 px-4 text-sm font-semibold rounded-full transition-all flex items-center gap-1.5",
                isActive
                  ? "bg-custom-blue text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              {tab.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-xs font-bold tabular-nums",
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
              )}>
                {counts[tab.id] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {setActivePerspective && (
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0">
            {PERSPECTIVES.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePerspective(p.id)}
                className={cn(
                  "h-8 px-4 text-sm font-bold rounded-full transition-all flex items-center gap-2",
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

          {/* Mode Selector — officers only. Managers have no working history mode (manager
              filtering is always gated to "at a BCL stage right now"), matching ReportsPage's
              PersonFilterStrip mode selector. */}
          {activePerspective === 'officers' && setOfficerFilterMode && (
            <Select value={officerFilterMode} onValueChange={setOfficerFilterMode}>
              <SelectTrigger className="w-44 h-10 bg-white border-slate-300 rounded-full text-sm font-bold shadow-sm shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="current">Current Assignments</SelectItem>
                <SelectItem value="history">Historical Activity</SelectItem>
              </SelectContent>
            </Select>
          )}

          {refreshData && (
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
              className="h-10 px-5 rounded-full border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 text-slate-400 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />}
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Perspective & Search Controls ──
// Updated to heavily mimic the "PersonFilterStrip" layout and style
export function PerspectiveTabs({
  activePerspective,
  availableOfficers = [], activeOfficerId, setActiveOfficerId, officerCounts = {},
  availableTaskManagers = [], activeManagerId, setActiveManagerId, managerCounts = {},
  searchQuery, setSearchQuery,
}: any) {
  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const isPersonView = isOfficer || isManager;

  const currentData = isOfficer ? availableOfficers : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerId : activeManagerId;
  const setTab = isOfficer ? setActiveOfficerId : setActiveManagerId;
  const counts = isOfficer ? officerCounts : managerCounts;

  return (
    <div className="border-b border-slate-200 antialiased flex flex-col bg-white">
      {/* Search + Assignee Sub-tabs Row */}
      <div className="px-8 py-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">

        {/* Left: Global Search */}
        <div className="relative group w-full lg:w-[320px] shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search company, applicant, sponsor..."
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

        {/* Right: Assignee Sub-tabs (Officers/Managers) */}
        {isPersonView && (
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto custom-scrollbar pb-2 lg:pb-0 w-full lg:w-auto lg:justify-end">
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-black uppercase font-bold mr-1 shrink-0",
              isOfficer ? "bg-sky-50 text-sky-600 border border-sky-100" : "bg-violet-50 text-violet-600 border border-violet-100"
            )}>
              {isOfficer ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {isOfficer ? "Officers" : "Managers"}
            </div>

            <button
              onClick={() => setTab('all')}
              className={cn(
                "h-10 px-6 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5 shrink-0",
                currentActive === 'all'
                  ? (isOfficer ? "bg-sky-600 border-sky-600 text-white shadow-sm" : "bg-violet-600 border-violet-600 text-white shadow-sm")
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              All Personnel
              <span className={cn(
                "text-sm font-black tabular-nums font-medium",
                currentActive === 'all' ? "text-white/60" : "text-slate-400"
              )}>
                {counts.all ?? 0}
              </span>
            </button>

            {currentData.map((p: any) => {
              const isActive = currentActive === p.id.toString();
              const displayName = p.displayName || p.full_name || p.name || `User ${p.id}`;
              const count = counts[p.id.toString()] || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setTab(isActive ? 'all' : p.id.toString())}
                  className={cn(
                    "h-10 px-6 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5 shrink-0",
                    isActive
                      ? (isOfficer ? "bg-sky-600 border-sky-600 text-white shadow-sm" : "bg-violet-600 border-violet-600 text-white shadow-sm")
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {displayName}
                  {count > 0 && (
                    <span className={cn(
                      "text-sm font-black tabular-nums font-medium px-1.5 py-0.5 rounded-full",
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Column Visibility Helper ──
export function ColumnVisibilityDialog({ visibleColumnIds, setVisibleColumnIds }: any) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleToggle = (colId: string, checked: boolean) => {
    setVisibleColumnIds((prev: any) => checked ? [...prev, colId] : prev.filter((id: string) => id !== colId));
  };

  const filteredColumns = searchQuery
    ? SUMMARY_COLUMNS.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : SUMMARY_COLUMNS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0 transition-all">
          <Eye className="h-3.5 w-3.5" /> Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-900">Manage Columns</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search columns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 h-10 rounded-full border-slate-300 text-sm font-medium focus:ring-1 focus:ring-blue-500" />
          </div>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 mt-3 custom-scrollbar">
          <div className="space-y-2 py-1">
            {filteredColumns.map(col => (
              <label key={col.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <Checkbox id={`summary-col-${col.id}`} checked={visibleColumnIds.includes(col.id)} onCheckedChange={(checked) => handleToggle(col.id, checked === true)} />
                <span className="text-sm font-bold text-slate-800 flex-1 truncate">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}