// @ts-nocheck
"use client";

// Tailwind JIT safelist — classes below are dynamically constructed in STATUS_ITEMS and may not
// be detected by content scanning. Keep this comment to guarantee generation.
// data-[state=active]:bg-sky-600 data-[state=active]:bg-teal-600 data-[state=active]:bg-cyan-600
// data-[state=active]:bg-amber-500 data-[state=active]:bg-emerald-600 data-[state=active]:bg-red-600
// data-[state=active]:bg-indigo-600 data-[state=active]:bg-violet-600 data-[state=active]:bg-custom-blue
// data-[state=active]:bg-orange-500 data-[state=active]:bg-blue-600
// data-[state=active]:text-white group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white

import React, { useState } from "react";
import { format } from "date-fns";
import {
  Search, X, RotateCcw, Eye, Layers,
  CornerDownRight, Check, ChevronsUpDown, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STEP_LABELS, type HandlingStep } from "../utils/database";

// ── Shared UI: Standard Tabs (matches summary-reports/PageHeader) ──
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
                <Icon className={cn("h-4 w-4", "text-slate-400 group-data-[state=active]:text-white")} />
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

// ── Shared UI: MultiSelect Dropdown (matches summary-reports/PageHeader) ──
export function MultiSelectSearchableDropdown({
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

// ── Date Range Filter (compacted into a Popover trigger to match the button-row style) ──
const DATE_TEXT_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function parseDateText(text: string): Date | undefined {
  if (!DATE_TEXT_RE.test(text)) return undefined;
  const [day, month, year] = text.split("/").map(Number);
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? undefined : d;
}

function DateTextInput({ value, onChange, placeholder }: { value: Date | undefined; onChange: (d: Date | undefined) => void; placeholder: string }) {
  const [text, setText] = useState(() => (value ? format(value, "dd/MM/yyyy") : ""));

  React.useEffect(() => {
    const resolved = parseDateText(text);
    const same = (resolved && value && resolved.getTime() === value.getTime()) || (!resolved && !value);
    if (!same) setText(value ? format(value, "dd/MM/yyyy") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw === "") { onChange(undefined); return; }
    const parsed = parseDateText(raw);
    if (parsed) onChange(parsed);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-[85px] bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 placeholder:font-normal",
        text && !DATE_TEXT_RE.test(text) && "text-red-500"
      )}
    />
  );
}

export function DateRangeFilterButton({ dateRange, setDateRange }: any) {
  const hasRange = !!(dateRange?.from || dateRange?.to);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 px-4 rounded-md text-sm font-bold gap-2 transition-all",
            hasRange
              ? "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          Date Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 rounded-2xl shadow-2xl border-slate-200">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-slate-200 bg-white shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <DateTextInput value={dateRange?.from} onChange={(d) => setDateRange((prev: any) => ({ ...prev, from: d }))} placeholder="DD/MM/YYYY" />
            <span className="text-slate-400 text-sm">–</span>
            <DateTextInput value={dateRange?.to} onChange={(d) => setDateRange((prev: any) => ({ ...prev, to: d }))} placeholder="DD/MM/YYYY" />
          </div>
          {hasRange && (
            <Button
              variant="ghost"
              className="w-full h-9 rounded-md text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => { setDateRange({ from: undefined, to: undefined }); setOpen(false); }}
            >
              Clear Date Range
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Status pill-track tabs (matches summary-reports StatusTabs) ──
// Distinct semantic color per status so the tab bar reads at a glance. activeHex/badgeHex are
// inline styles — a `data-[state=active]:bg-*` Tailwind class collides with TabsTrigger's own
// base `data-[state=active]:bg-background` in this project's Tailwind setup, so inline style is
// used (see summary-reports/components/PageHeader.tsx's own comment).
export const STATUS_TAB_ORDER: HandlingStep[] = [
  "awaiting_receipt",
  "received",
  "at_nyayo",
  "stamped_back",
  "ready_for_dispatch",
  "out_for_delivery",
  "awaiting_pickup",
  "completed",
  "client_managed",
  "mode_unset",
];

const STATUS_TAB_ITEMS: { id: string; label: string; activeHex: string; badgeHex: string }[] = [
  { id: "all", label: "All Tasks", activeHex: "#376bae", badgeHex: "#376bae" },
  { id: "awaiting_receipt", label: STEP_LABELS.awaiting_receipt, activeHex: "#d97706", badgeHex: "#f59e0b" },
  { id: "received", label: STEP_LABELS.received, activeHex: "#0284c7", badgeHex: "#0ea5e9" },
  { id: "at_nyayo", label: STEP_LABELS.at_nyayo, activeHex: "#ea580c", badgeHex: "#f97316" },
  { id: "stamped_back", label: STEP_LABELS.stamped_back, activeHex: "#0d9488", badgeHex: "#14b8a6" },
  { id: "ready_for_dispatch", label: STEP_LABELS.ready_for_dispatch, activeHex: "#2563eb", badgeHex: "#3b82f6" },
  { id: "out_for_delivery", label: STEP_LABELS.out_for_delivery, activeHex: "#4f46e5", badgeHex: "#6366f1" },
  { id: "awaiting_pickup", label: STEP_LABELS.awaiting_pickup, activeHex: "#4f46e5", badgeHex: "#6366f1" },
  { id: "completed", label: STEP_LABELS.completed, activeHex: "#059669", badgeHex: "#10b981" },
  { id: "client_managed", label: STEP_LABELS.client_managed, activeHex: "#7c3aed", badgeHex: "#8b5cf6" },
  { id: "mode_unset", label: STEP_LABELS.mode_unset, activeHex: "#475569", badgeHex: "#64748b" },
];

export function StatusTabs({
  activeSteps = [], setActiveSteps,
  counts = {},
  activeMode, setActiveMode,
  refreshData, loading,
}: any) {
  // activeSteps is a multi-select array (StatusTabs' own count badges always reflect the
  // full counts, not just the selected step). The active step's badge should highlight.
  const activeStep = activeSteps[0] ?? "all";

  return (
    <div className="px-8 py-2 flex items-center justify-between gap-4 border-b border-slate-200 bg-white antialiased">
      <div className="overflow-x-auto custom-scrollbar shrink-0 min-w-0">
        <Tabs value={activeStep} onValueChange={(v: string) => setActiveSteps(v === "all" ? [] : [v])}>
          <TabsList className={TAB_LIST_CLASS}>
            {STATUS_TAB_ITEMS.map(tab => {
              const isActive = activeStep === tab.id;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "group gap-2 rounded-2xl px-4 h-9 text-sm font-bold transition-colors",
                    isActive ? "shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-white whitespace-nowrap"
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

      <div className="flex items-center gap-2.5 shrink-0">
        <Select value={activeMode} onValueChange={setActiveMode}>
          <SelectTrigger className="w-40 h-9 bg-white border-slate-300 rounded-md text-sm font-bold shadow-sm shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="bcl">BCL Handles</SelectItem>
            <SelectItem value="client">Client Handles</SelectItem>
            <SelectItem value="not_set">Not Set</SelectItem>
          </SelectContent>
        </Select>

        {refreshData && (
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={loading}
            className="h-9 px-5 rounded-md border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0"
          >
            {loading ? <LoaderSpinner /> : <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />}
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        )}
      </div>
    </div>
  );
}

function LoaderSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 mr-2 text-slate-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Filter Bar (search + class/sub-class multi-select) — matches summary-reports PerspectiveTabs ──
export function FilterBar({
  searchQuery, setSearchQuery,
  availableClasses = [], activeClassIds = [], setActiveClassIds, classCounts = {},
  availableSubClasses = [], activeSubClassIds = [], setActiveSubClassIds, subClassCounts = {},
}: any) {
  const toggleClass = (id: string) =>
    setActiveClassIds?.((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
  const toggleSubClass = (id: string) =>
    setActiveSubClassIds?.((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);

  return (
    <div className="border-b border-slate-200 antialiased flex flex-col bg-white">
      <div className="px-8 py-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left: Global Search */}
        <div className="relative group w-full lg:w-[320px] shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search company, applicant, passport no..."
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

        {/* Right: Class / Sub-Class */}
        {(availableClasses.length > 0 || availableSubClasses.length > 0) && (
          <div className="flex items-center gap-2.5 shrink-0">
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
    </div>
  );
}

// ── Sub-Department Hierarchy tabs (Immigration-scoped — no department-level tab) ──
// This page is scoped to the Immigration department (IMMIGRATION_DEPT_ID), so the hierarchy
// renders sub-department tabs directly (matching summary-reports HierarchyTabs' second level),
// plus the Class/Sub-Class categorization multi-selects alongside them.
export function HierarchyTabs({
  subDepartments = [],
  activeSubDeptId = "all", setActiveSubDeptId,
  subDeptTaskCounts = {},
  availableClasses = [], activeClassIds = [], setActiveClassIds, classCounts = {},
  availableSubClasses = [], activeSubClassIds = [], setActiveSubClassIds, subClassCounts = {},
}: any) {
  const handleSubDeptChange = (v: string) => {
    setActiveSubDeptId(v);
    setActiveClassIds?.([]);
    setActiveSubClassIds?.([]);
  };

  const toggleClass = (fn: any) => (id: string) => {
    fn?.((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
    setActiveSubClassIds?.([]);
  };

  const toggleSubClass = (fn: any) => (id: string) => {
    fn?.((prev: string[]) => prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]);
  };

  const hasSubDepts = subDepartments.length > 0;
  const hasClasses = availableClasses.length > 0 || availableSubClasses.length > 0;

  return (
    <div className="flex flex-col border-b border-slate-200 antialiased bg-white">
      <div className="px-8 py-3">
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
                        { id: "all", label: "All Sub-departments", count: subDeptTaskCounts.all },
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
                    onToggle={toggleClass(setActiveClassIds)}
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
                    onToggle={toggleSubClass(setActiveSubClassIds)}
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

// ── Column Visibility Helper (matches summary-reports ColumnVisibilityDialog) ──
export function ColumnVisibilityDialog({ columns, visibleColumnIds, setVisibleColumnIds }: any) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const toggle = (id: string, checked: boolean) =>
    setVisibleColumnIds((prev: string[]) => (checked ? [...prev, id] : prev.filter((x: string) => x !== id)));

  const filteredColumns = searchQuery
    ? columns.filter((c: any) => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : columns;

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
            {filteredColumns.map((col: any) => (
              <label key={col.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <Checkbox
                  id={`summary-col-${col.id}`}
                  checked={visibleColumnIds.includes(col.id)}
                  onCheckedChange={(checked) => toggle(col.id, checked === true)}
                />
                <span className="text-sm font-bold text-slate-800 flex-1 truncate">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
