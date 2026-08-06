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
import { cn } from "@/lib/utils";
import { SUMMARY_COLUMNS } from "../stageColumnConfig";

// ── Shared UI: PillTrack ──
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
      "inline-flex items-center gap-0.5 bg-slate-100 p-1 rounded-full",
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
              size === 'sm' ? "h-7 px-3 text-xs gap-1" : "h-8 px-4 text-sm gap-1.5",
              isActive ? cn(item.activeBg || "bg-custom-blue", "text-white shadow-sm") : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
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
                "font-black tabular-nums tracking-tight",
                size === 'sm' ? "text-[10px]" : "text-[11px]",
                isActive ? "text-white/70" : "text-slate-400"
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
          size="sm"
          className={cn(
            "h-9 px-4 rounded-full text-sm font-bold gap-2 border transition-all shrink-0",
            accentActive
              ? "bg-custom-blue border-custom-blue text-white hover:bg-[#2d5a94] hover:text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          {label}
          {selectedIds.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white text-slate-900 shadow-sm text-xs font-black tabular-nums">
              {selectedIds.length}
            </span>
          )}
          <ChevronsUpDown className={cn("h-3.5 w-3.5", accentActive ? "opacity-80" : "opacity-40")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 rounded-2xl shadow-2xl border-slate-200" align="end">
        <Command className="rounded-2xl" shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`} value={search} onValueChange={setSearch} className="h-10 border-none focus:ring-0" />
          <CommandList className="max-h-[240px] overflow-y-auto custom-scrollbar">
            <CommandEmpty className="py-6 text-center text-sm text-slate-500">No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((it: any) => {
                const id = it.id.toString();
                const isSelected = selectedIds.includes(id);
                return (
                  <CommandItem key={id} value={id} onSelect={() => onToggle(id)} className="cursor-pointer rounded-xl mx-1 my-0.5">
                    <Check className={cn("mr-2 h-4 w-4 shrink-0 transition-opacity", isSelected ? "opacity-100 text-blue-600" : "opacity-0")} />
                    <span className="flex-1 truncate text-sm font-medium">{it.name}</span>
                    {typeof counts[id] === 'number' && counts[id] > 0 && (
                      <span className="ml-2 shrink-0 text-[11px] font-black tabular-nums h-5 min-w-5 flex items-center justify-center px-1.5 rounded-full bg-slate-100 text-slate-500">
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
          <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50"
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
    <div className="flex flex-col bg-slate-50/50">
      <div className="p-4 space-y-3">
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
            
            <div className="flex items-center gap-2 min-w-0 flex-1">
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
                <div className="h-4 w-px bg-slate-200 mx-1" />
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
export function StatusTabs({ activeTaskStatus, setActiveTaskStatus, counts = {} }: any) {
  const STATUS_ITEMS = [
    { id: 'all', label: 'All Applications', activeBg: 'bg-custom-blue', dot: 'bg-blue-400' },
    { id: 'enquiry', label: 'Enquiry', activeBg: 'bg-slate-600', dot: 'bg-slate-400' },
    { id: 'wip', label: 'WIP', activeBg: 'bg-amber-500', dot: 'bg-amber-400' },
    { id: 'completed', label: 'Completed', activeBg: 'bg-emerald-600', dot: 'bg-emerald-400' },
    { id: 'overdue', label: 'Overdue', activeBg: 'bg-rose-600', dot: 'bg-rose-400' },
  ];

  return (
    <div className="px-5 py-3 bg-white">
      <PillTrack
        value={activeTaskStatus}
        onValueChange={setActiveTaskStatus}
        items={STATUS_ITEMS.map(s => ({ ...s, count: counts[s.id] ?? 0 }))}
      />
    </div>
  );
}

// ── Perspective & Search Controls ──
export function PerspectiveTabs({
  activePerspective, setActivePerspective,
  allCount, officersCount, managersCount, clientsCount,
  availableOfficers = [], activeOfficerId, setActiveOfficerId, officerCounts = {},
  availableTaskManagers = [], activeManagerId, setActiveManagerId, managerCounts = {},
  searchQuery, setSearchQuery,
  refreshData, loading,
}: any) {
  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const isPersonView = isOfficer || isManager;

  const currentData = isOfficer ? availableOfficers : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerId : activeManagerId;
  const setTab = isOfficer ? setActiveOfficerId : setActiveManagerId;
  const counts = isOfficer ? officerCounts : managerCounts;
  const personAccent = isOfficer ? 'bg-custom-blue' : 'bg-violet-600';

  const PERSPECTIVES = [
    { id: 'all', label: 'Overview', activeBg: 'bg-custom-blue' },
    { id: 'officers', label: 'Officers', activeBg: 'bg-amber-500' },
    { id: 'managers', label: 'Managers', activeBg: 'bg-violet-500' },
    { id: 'clients', label: 'Clients', activeBg: 'bg-emerald-500' },
  ];

  return (
    <div className="antialiased flex flex-col bg-white">
      {/* Tier 1: Toolbar Row */}
      <div className="px-5 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="relative group w-full lg:w-[380px] shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <Input
            placeholder="Search company, applicant, sponsor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 pr-10 bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-300 rounded-full text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-2 lg:pb-0 w-full lg:w-auto">
          <PillTrack
            value={activePerspective}
            onValueChange={setActivePerspective}
            items={PERSPECTIVES.map(p => ({
              ...p,
              count: { all: allCount, officers: officersCount, managers: managersCount, clients: clientsCount }[p.id] || 0
            }))}
          />

          {refreshData && (
            <>
              <div className="h-6 w-px bg-slate-200 shrink-0" />
              <Button
                variant="outline"
                onClick={refreshData}
                disabled={loading}
                className="h-10 px-5 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 shrink-0 shadow-sm"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 text-slate-400 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />}
                {loading ? "Refreshing" : "Refresh"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tier 1.5: Assignee Pills Banner */}
      {isPersonView && (
        <div className="px-5 py-3.5 flex flex-wrap items-center gap-3 bg-slate-50/50">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 shadow-sm",
            isOfficer ? "bg-blue-100/60 text-blue-700" : "bg-violet-100/60 text-violet-700"
          )}>
            {isOfficer ? <Shield className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            {isOfficer ? "Officer Scope" : "Manager Scope"}
          </div>
          
          <PillTrack
            size="sm"
            value={currentActive}
            onValueChange={(v) => setTab(v === currentActive ? 'all' : v)}
            items={[
              { id: 'all', label: 'All Personnel', count: counts.all ?? 0, activeBg: personAccent },
              ...currentData.map((p: any) => ({
                id: p.id.toString(),
                label: p.displayName || p.full_name || p.name || `User ${p.id}`,
                count: counts[p.id.toString()] || 0,
                activeBg: personAccent,
              })),
            ]}
          />
        </div>
      )}
    </div>
  );
}

// ── Column Visibility Helper (If Needed) ──
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
        <Button variant="outline" size="sm" className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shrink-0 shadow-sm">
          <Eye className="h-3.5 w-3.5" /> Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-900">Manage Columns</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search columns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 h-10 rounded-xl" />
          </div>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 mt-4 custom-scrollbar">
          <div className="space-y-1.5 p-1">
            {filteredColumns.map(col => (
              <label key={col.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:bg-slate-50 hover:border-slate-200 cursor-pointer transition-all">
                <Checkbox id={`summary-col-${col.id}`} checked={visibleColumnIds.includes(col.id)} onCheckedChange={(checked) => handleToggle(col.id, checked === true)} />
                <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}