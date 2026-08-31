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

// ── Shared UI: Standard Tabs (matches summary-reports/PageHeader) ──
const TAB_LIST_CLASS = "bg-slate-100 p-1 rounded-full border border-slate-200";
const TAB_TRIGGER_CLASS = "group gap-2 rounded-full px-4 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white transition-colors data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-sm";
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
            "h-10 px-5 rounded-full border-blue-500 text-sm font-semibold text-blue-600 bg-white hover:bg-blue-50 shrink-0",
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

function MiniSegmented({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex p-0.5 bg-slate-100 rounded-lg">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 h-7 rounded-md text-xs font-bold transition-colors",
            value === opt.value ? "bg-white text-custom-blue shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DateRangeFilterButton({ dateRange, setDateRange }: any) {
  const hasRange = !!(dateRange?.from || dateRange?.to);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"range" | "year">("range");

  // A whole-calendar-year range (Jan 1 – Dec 31 of the same year) is what "Year" mode itself
  // produces — recognizing it lets the trigger button show the year directly and lets
  // reopening the popover default the Select back to the year that's actually active, instead
  // of losing that context the moment the popover closes.
  const selectedYear = dateRange?.from && dateRange?.to
    && dateRange.from.getMonth() === 0 && dateRange.from.getDate() === 1
    && dateRange.to.getMonth() === 11 && dateRange.to.getDate() === 31
    && dateRange.from.getFullYear() === dateRange.to.getFullYear()
    ? dateRange.from.getFullYear().toString()
    : "";

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear - i);

  const applyYear = (yearStr: string) => {
    const year = Number(yearStr);
    setDateRange({ from: new Date(year, 0, 1), to: new Date(year, 11, 31) });
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMode(selectedYear ? "year" : "range"); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
            hasRange
              ? "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {selectedYear || "Date Filter"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 rounded-2xl shadow-2xl border-slate-200">
        <div className="flex flex-col gap-3">
          <MiniSegmented
            options={[{ value: "range", label: "Date Range" }, { value: "year", label: "Year" }]}
            value={mode}
            onChange={(v) => setMode(v as "range" | "year")}
          />

          {mode === "range" ? (
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-slate-200 bg-white shadow-sm">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <DateTextInput value={dateRange?.from} onChange={(d) => setDateRange((prev: any) => ({ ...prev, from: d }))} placeholder="DD/MM/YYYY" />
              <span className="text-slate-400 text-sm">–</span>
              <DateTextInput value={dateRange?.to} onChange={(d) => setDateRange((prev: any) => ({ ...prev, to: d }))} placeholder="DD/MM/YYYY" />
            </div>
          ) : (
            <Select value={selectedYear} onValueChange={applyYear}>
              <SelectTrigger className="h-10 rounded-md border-slate-200 bg-white shadow-sm text-sm font-medium">
                <SelectValue placeholder="Select a year..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-64">
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()} className="text-sm font-medium">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasRange && (
            <Button
              variant="ghost"
              className="w-full h-9 rounded-md text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => { setDateRange({ from: undefined, to: undefined }); setOpen(false); }}
            >
              Clear Date Filter
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Base-status tabs (tm_tasks.status: write_up_completed / endorsed) ──
// A second, orthogonal status dimension to the Handling-step cards (StatusCards) below: this
// tabs row filters on the task's own `tm_tasks.status`, which the module is scoped to
// (QUALIFYING_STATUSES = write_up_completed | endorsed). Uses the same inline-activeHex pattern
// as summary-reports' StatusTabs — Tailwind's data-[state=active]:bg-* classes collide with
// TabsTrigger's own base background and render the active tab white/gray, so a hex inline style
// is used instead (reliable regardless of class order/specificity).
const BASE_STATUS_ITEMS = [
  { id: "all", label: "All Tasks", activeHex: "#376bae", badgeHex: "#376bae" },
  { id: "write_up_completed", label: "Write Up Completed", activeHex: "#0284c7", badgeHex: "#0ea5e9" },
  { id: "endorsed", label: "Endorsed", activeHex: "#059669", badgeHex: "#10b981" },
];

export function StatusTabs({
  activeBaseStatus, setActiveBaseStatus, counts = {},
}: any) {
  const badgeClass = "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm";

  return (
    <div className="px-8 py-2 flex items-center gap-4 border-b border-slate-200 bg-white antialiased">
      <Tabs value={activeBaseStatus} onValueChange={setActiveBaseStatus}>
        <TabsList className={TAB_LIST_CLASS}>
          {BASE_STATUS_ITEMS.map((tab) => {
            const isActive = activeBaseStatus === tab.id;
            const count = counts[tab.id] || 0;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "group gap-2 rounded-full px-4 h-9 text-sm font-bold transition-colors",
                  isActive ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-white"
                )}
                style={isActive ? { backgroundColor: tab.activeHex, color: "#fff" } : undefined}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={badgeClass}
                    style={isActive ? { backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" } : { backgroundColor: tab.badgeHex, color: "#fff" }}
                  >
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
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
  activeMode, setActiveMode, refreshData, loading = false,
  showStats = true, setShowStats,
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
            className="w-full h-10 pl-11 pr-10 bg-white border-slate-300 rounded-full text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Handling mode + refresh */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Select value={activeMode} onValueChange={setActiveMode}>
            <SelectTrigger className="h-10 w-40 bg-white border-slate-300 rounded-full text-sm font-bold shadow-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="bcl">BCL Handles</SelectItem>
              <SelectItem value="client">Client Handles</SelectItem>
              <SelectItem value="not_set">Not Set</SelectItem>
            </SelectContent>
          </Select>

          {setShowStats && (
            <button
              type="button"
              onClick={() => setShowStats((v: boolean) => !v)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold uppercase tracking-wider transition-colors shrink-0",
                showStats
                  ? "border-custom-blue bg-custom-blue text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              Stats Rows
            </button>
          )}

          {refreshData && (
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
              className="h-10 px-5 rounded-full border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0"
            >
              {loading ? <LoaderSpinner /> : <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />}
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          )}
        </div>
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
        <Button variant="outline" size="sm" className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0 transition-all">
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
