// @ts-nocheck
"use client";

// Tailwind JIT safelist — classes below are dynamically constructed in STATUS_ITEMS / PERSPECTIVES arrays
// and may not be detected by content scanning. Keep this comment to guarantee generation.
// data-[state=active]:bg-sky-600 data-[state=active]:bg-teal-600 data-[state=active]:bg-cyan-600
// data-[state=active]:bg-amber-500 data-[state=active]:bg-emerald-600 data-[state=active]:bg-red-600
// data-[state=active]:bg-indigo-600 data-[state=active]:bg-violet-600 data-[state=active]:bg-custom-blue
// data-[state=active]:text-white group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white
// bg-sky-500 bg-teal-500 bg-amber-500 bg-emerald-500 bg-violet-500 bg-red-500 bg-indigo-500 bg-custom-blue
// bg-white/25

import React, { useState } from "react";
import { Search, X, Shield, User, RotateCcw, Loader2, Eye, Check, ChevronsUpDown, Layers, CornerDownRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SUMMARY_COLUMNS } from "../stageColumnConfig";

// ── Shared UI: Standard Tabs (replaces the old pill-style toggles) ──
// Matches the bordered, squared-off tab look used across the app (e.g. bcl-task-diary).
const TAB_LIST_CLASS = "bg-slate-100 p-1 rounded-full border border-slate-200";
const TAB_TRIGGER_CLASS = "group gap-2 rounded-2xl px-4 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white transition-colors data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-sm";
const COUNT_BADGE_CLASS = "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm bg-custom-blue text-white group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white";

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
    <Tabs value={value} onValueChange={onValueChange} className="shrink-0">
      <TabsList className={cn(TAB_LIST_CLASS, wrap && "flex-wrap")}>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className={cn(
                TAB_TRIGGER_CLASS,
                size === 'sm' ? "h-8 px-3 text-sm" : "h-9 px-4"
              )}
            >
              {Icon ? (
                <Icon className={cn(size === 'sm' ? "h-4 w-4" : "h-4 w-4", "text-slate-400 group-data-[state=active]:text-white")} />
              ) : item.dot ? (
                <span className={cn("h-2 w-2 rounded-full shrink-0", item.dot)} />
              ) : null}
              {item.label}
              {typeof item.count === 'number' && item.count > 0 && (
                <span className={COUNT_BADGE_CLASS}>
                  {item.count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
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
            "h-10 px-5 rounded-md border-blue-500 text-sm font-semibold text-blue-600 bg-white hover:bg-blue-50 shrink-0",
            accentActive && "bg-custom-blue border-custom-blue text-white hover:bg-[#2d5a94] hover:text-white shadow-sm"
          )}
        >
          {label}
          {selectedIds.length > 0 && (
            <span className={cn(
              "ml-2 inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
              accentActive ? "bg-white/25 text-white" : "bg-custom-blue text-white"
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
                      <span className="ml-2 shrink-0 inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm bg-custom-blue text-white">
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
              className="w-full h-9 rounded-md text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50"
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
                        { id: 'all', label: 'All Sub-departments', count: subDeptTaskCounts.all },
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
  // Distinct semantic color per status so the tab bar reads at a glance instead of every
  // tab looking identical except for label — active tab gets a solid fill in that color,
  // idle tab gets a tinted badge in the same hue so the count stays legible either way.
  //
  // `activeHex` (inline style) rather than a `data-[state=active]:bg-*` Tailwind class — the
  // latter collides with TabsTrigger's own base `data-[state=active]:bg-background` (components/
  // ui/tabs.tsx) and, in this project's Tailwind setup, reliably loses the cascade (the active
  // tab rendered white/gray instead of its color). Inline style always wins regardless of
  // class order/specificity, so it's used for every dynamically-active-colored tab in this file.
  const STATUS_ITEMS = [
    { id: 'all', label: 'All Tasks', activeHex: '#376bae', badgeHex: '#376bae' },
    { id: 'active', label: 'All Enquiry + WIP', activeHex: '#0d9488', badgeHex: '#14b8a6' },
    { id: 'enquiry', label: 'Enquiry', activeHex: '#0284c7', badgeHex: '#0ea5e9' },
    { id: 'wip', label: 'WIP', activeHex: '#f59e0b', badgeHex: '#f59e0b' },
    { id: 'completed', label: 'Completed', activeHex: '#059669', badgeHex: '#10b981' },
    { id: 'overdue', label: 'Overdue Tasks Based on Promised Time', activeHex: '#dc2626', badgeHex: '#ef4444' },
  ];

  const perspectiveCounts = { all: allCount || 0, officers: officersCount || 0, managers: managersCount || 0, clients: clientsCount || 0 };

  const PERSPECTIVES = [
    { id: 'all', label: 'Overview' },
    { id: 'officers', label: 'Officers' },
    { id: 'managers', label: 'Managers' },
    { id: 'clients', label: 'Clients' },
  ];

  return (
    <div className="px-8 py-2 flex items-center justify-between gap-4 border-b border-slate-200 bg-white antialiased">
      <div className="overflow-x-auto custom-scrollbar shrink-0 min-w-0">
        <Tabs value={activeTaskStatus} onValueChange={setActiveTaskStatus}>
          <TabsList className={TAB_LIST_CLASS}>
            {STATUS_ITEMS.map(tab => {
              const isActive = activeTaskStatus === tab.id;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "group gap-2 rounded-2xl px-4 h-9 text-sm font-bold transition-colors",
                    isActive ? "shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-white"
                  )}
                  style={isActive ? { backgroundColor: tab.activeHex, color: '#fff' } : undefined}
                >
                  {tab.label}
                  {(counts[tab.id] || 0) > 0 && (
                    <span
                      className="inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm"
                      style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' } : { backgroundColor: tab.badgeHex, color: '#fff' }}
                    >
                      {counts[tab.id] || 0}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {setActivePerspective && (
        <div className="flex items-center gap-2.5 shrink-0">
          <Tabs value={activePerspective} onValueChange={setActivePerspective}>
            <TabsList className={TAB_LIST_CLASS}>
              {PERSPECTIVES.map(p => (
                <TabsTrigger key={p.id} value={p.id} className={cn(TAB_TRIGGER_CLASS, "h-9")}>
                  {p.label}
                  {perspectiveCounts[p.id] > 0 && (
                    <span className={cn(
                      "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                      "group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white bg-slate-800 text-white"
                    )}>
                      {perspectiveCounts[p.id]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Mode Selector — officers only. Managers have no working history mode (manager
              filtering is always gated to "at a BCL stage right now"), matching ReportsPage's
              PersonFilterStrip mode selector. */}
          {activePerspective === 'officers' && setOfficerFilterMode && (
            <Select value={officerFilterMode} onValueChange={setOfficerFilterMode}>
              <SelectTrigger className="w-44 h-10 bg-white border-slate-300 rounded-md text-sm font-bold shadow-sm shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="current">Stage In Basket Now</SelectItem>
                <SelectItem value="history">Stage Ever In Basket</SelectItem>
              </SelectContent>
            </Select>
          )}

          {refreshData && (
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
              className="h-10 px-5 rounded-md border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0"
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
            className="w-full h-10 pl-11 pr-10 bg-white border-slate-300 rounded-md text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Assignee Sub-tabs (Officers/Managers) */}
        {isPersonView && (() => {
          // Inline style, not a `data-[state=active]:bg-violet-600`/`bg-indigo-600` Tailwind
          // class — see StatusTabs' own comment above: that variant collides with TabsTrigger's
          // base `data-[state=active]:bg-background` and loses the cascade in this project's
          // Tailwind setup, rendering the active tab white/gray instead of its color.
          const activeHex = isOfficer ? '#7c3aed' : '#4f46e5'; // violet-600 / indigo-600
          return (
          <Tabs value={currentActive} onValueChange={setTab} className="w-full lg:w-auto">
            <TabsList className={cn(TAB_LIST_CLASS, "flex-wrap lg:flex-nowrap overflow-x-auto custom-scrollbar")}>
              <TabsTrigger
                value="all"
                className={cn(
                  "group gap-2 rounded-2xl px-4 h-9 text-sm font-bold transition-colors",
                  currentActive === 'all' ? "shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-white"
                )}
                style={currentActive === 'all' ? { backgroundColor: activeHex, color: '#fff' } : undefined}
              >
                <User className={cn("h-4 w-4", currentActive === 'all' ? "text-white" : "text-slate-400")} /> All {isOfficer ? "Officers" : "Managers"}
                {(counts.all ?? 0) > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                    currentActive === 'all' ? "bg-white/25 text-white" : (isOfficer ? "bg-violet-500 text-white" : "bg-indigo-500 text-white")
                  )}>
                    {counts.all ?? 0}
                  </span>
                )}
              </TabsTrigger>

              {currentData.map((p: any) => {
                const displayName = p.displayName || p.full_name || p.name || `User ${p.id}`;
                const count = counts[p.id.toString()] || 0;
                const isActiveTab = currentActive === p.id.toString();
                return (
                  <TabsTrigger
                    key={p.id}
                    value={p.id.toString()}
                    className={cn(
                      "group gap-2 rounded-2xl px-4 h-9 text-sm font-bold transition-colors",
                      isActiveTab ? "shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-white"
                    )}
                    style={isActiveTab ? { backgroundColor: activeHex, color: '#fff' } : undefined}
                  >
                    {displayName}
                    {count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                        isActiveTab ? "bg-white/25 text-white" : (isOfficer ? "bg-violet-500 text-white" : "bg-indigo-500 text-white")
                      )}>
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}

              <TabsTrigger
                value="__unallocated__"
                className={cn(
                  "group gap-2 rounded-2xl px-4 h-9 text-sm font-bold transition-colors",
                  currentActive === '__unallocated__' ? "shadow-sm" : "text-amber-600 hover:text-amber-700 hover:bg-white border border-amber-200 hover:border-amber-300"
                )}
                style={currentActive === '__unallocated__' ? { backgroundColor: '#f59e0b', color: '#fff' } : undefined}
              >
                Unallocated
                {(counts.__unallocated__ || 0) > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                    currentActive === '__unallocated__' ? "bg-white/25 text-white" : "bg-amber-500 text-white"
                  )}>
                    {counts.__unallocated__ || 0}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          );
        })()}
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
        <Button variant="outline" size="sm" className="h-9 px-4 rounded-md text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0 transition-all">
          <Eye className="h-3.5 w-3.5" /> Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-900">Manage Columns</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search columns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 h-10 rounded-md border-slate-300 text-sm font-medium focus:ring-1 focus:ring-blue-500" />
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