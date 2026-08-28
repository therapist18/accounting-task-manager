// @ts-nocheck
"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { Search, X, RotateCcw, Download, Truck, Eye, Layers, CornerDownRight, Check, ChevronsUpDown, CalendarRange, ListFilter } from "lucide-react";
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
import { STEP_LABELS, type HandlingStep } from "../utils/database";

// Same look as Summary Reports' HierarchyTabs (PageHeader.tsx there) — bordered pill tabs +
// a searchable multi-select dropdown for Classes/Sub-Classes, duplicated here rather than
// imported since these are private, route-scoped components in that other module.
const TAB_LIST_CLASS = "bg-slate-100 p-1 rounded-full border border-slate-200";
const TAB_TRIGGER_CLASS = "group gap-2 rounded-2xl px-4 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white transition-colors data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-sm";
const COUNT_BADGE_CLASS = "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm bg-custom-blue text-white group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white";

const STATUS_TAB_ORDER: HandlingStep[] = [
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

// dd/mm/yyyy free-typed text — same convention EnquiryDialog's own Enquiry Date field uses
// (parseable, forgiving of partial input while typing) rather than a native <input
// type="date">, whose browser-native segmented editor most users here don't actually type
// into directly.
const DATE_TEXT_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function parseDateText(text: string): Date | undefined {
  if (!DATE_TEXT_RE.test(text)) return undefined;
  const [day, month, year] = text.split("/").map(Number);
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? undefined : d;
}

function DateTextInput({ value, onChange, placeholder }: { value: Date | undefined; onChange: (d: Date | undefined) => void; placeholder: string }) {
  const [text, setText] = useState(() => (value ? format(value, "dd/MM/yyyy") : ""));

  // Keep in sync when the value is changed externally (e.g. the Clear button) — but not on
  // every keystroke's own resulting value, so mid-typing text isn't fought/reformatted.
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
        "w-[100px] bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-300 placeholder:font-normal",
        text && !DATE_TEXT_RE.test(text) && "text-red-500"
      )}
    />
  );
}

function DateRangeFilter({ dateRange, setDateRange }: any) {
  const hasRange = !!(dateRange?.from || dateRange?.to);

  return (
    <div className="flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-full border border-slate-200 bg-white">
      <CalendarRange className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <DateTextInput
        value={dateRange?.from}
        onChange={(d) => setDateRange((prev: any) => ({ ...prev, from: d }))}
        placeholder="DD/MM/YYYY"
      />
      <span className="text-slate-300 text-sm">–</span>
      <DateTextInput
        value={dateRange?.to}
        onChange={(d) => setDateRange((prev: any) => ({ ...prev, to: d }))}
        placeholder="DD/MM/YYYY"
      />
      {hasRange && (
        <button
          onClick={() => setDateRange({ from: undefined, to: undefined })}
          className="text-slate-400 hover:text-slate-600 shrink-0"
          title="Clear date range"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function PageHeader({
  searchQuery,
  setSearchQuery,
  dateRange,
  setDateRange,
  onRefresh,
  onExportExcel,
  onOpenCouriers,
  loading,
  columns,
  visibleColumnIds,
  setVisibleColumnIds,
  onOpenMultiSort,
  sortLevelCount = 0,
}: any) {
  return (
    <div className="border-b border-slate-200 bg-white antialiased">
      <div className="px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight leading-none">
            Passport Endorsement Tracking
          </h1>
          <p className="text-sm text-slate-500 font-semibold">
            Nyayo House stamping &amp; passport custody, once a case reaches write-up
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search name, passport, company..."
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

          <DateRangeFilter dateRange={dateRange} setDateRange={setDateRange} />

          <div className="h-6 w-px bg-slate-200" />

          <Button
            variant="outline"
            onClick={onOpenCouriers}
            className="h-9 px-4 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2"
          >
            <Truck className="h-3.5 w-3.5 text-slate-400" /> Couriers
          </Button>

          <ColumnVisibilityDialog
            columns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
          />

          <Button
            variant="outline"
            onClick={onOpenMultiSort}
            className="h-9 px-4 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2"
            title="Sort by multiple columns"
          >
            <ListFilter className="h-3.5 w-3.5 text-slate-400" /> Multi-level Sort
            {sortLevelCount > 1 && (
              <span className="min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-custom-blue text-white text-[11px] font-bold px-1 leading-none">
                {sortLevelCount}
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-4 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2"
          >
            <RotateCcw className={cn("h-4 w-4 text-slate-400", loading && "animate-spin")} />
            Refresh
          </Button>

          <Button
            onClick={onExportExcel}
            className="h-9 px-4 rounded-md text-sm font-bold gap-2 text-white hover:bg-[#2d5a94] shadow-sm"
            style={{ backgroundColor: "#376bae" }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColumnVisibilityDialog({ columns, visibleColumnIds, setVisibleColumnIds }: any) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string, checked: boolean) =>
    setVisibleColumnIds((prev: string[]) => (checked ? [...prev, id] : prev.filter((x: string) => x !== id)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 px-4 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2">
          <Eye className="h-4 w-4" /> Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[75vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-black text-slate-800 uppercase tracking-wider">
            Column Visibility
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1 mt-2">
          {columns.map((col: any) => (
            <div key={col.id} className="flex items-center gap-2.5 px-1 py-1.5 rounded hover:bg-slate-50">
              <Checkbox
                id={`col-${col.id}`}
                checked={visibleColumnIds.includes(col.id)}
                onCheckedChange={(v) => toggle(col.id, v === true)}
              />
              <label htmlFor={`col-${col.id}`} className="text-sm text-slate-700 cursor-pointer flex-1">
                {col.label}
              </label>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StatusTabs({ activeStep, setActiveStep, counts }: any) {
  const tabs = [
    { id: "all", label: "All" },
    ...STATUS_TAB_ORDER.filter((s) => (counts[s] || 0) > 0 || s === "awaiting_receipt").map((s) => ({
      id: s,
      label: STEP_LABELS[s],
    })),
  ];

  return (
    <div className="px-8 py-2.5 flex items-center gap-1.5 border-b border-slate-200 bg-white antialiased overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeStep === tab.id;
        const count = tab.id === "all" ? counts.all || 0 : counts[tab.id] || 0;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveStep(tab.id)}
            className={cn(
              "h-8 px-4 text-sm font-bold rounded-lg transition-all flex items-center gap-2 shrink-0",
              isActive
                ? "bg-custom-blue text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-800"
            )}
          >
            {tab.label}
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-sm font-bold tabular-nums",
              isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PillTrack({ items, value, onValueChange, size = "md" }: any) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="shrink-0">
      <TabsList className={cn(TAB_LIST_CLASS, "flex-wrap")}>
        {items.map((item: any) => (
          <TabsTrigger
            key={item.id}
            value={item.id}
            className={cn(TAB_TRIGGER_CLASS, size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-4")}
          >
            {item.label}
            {typeof item.count === "number" && item.count > 0 && (
              <span className={COUNT_BADGE_CLASS}>{item.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function MultiSelectSearchableDropdown({
  label, items = [], selectedIds = [], counts = {}, onToggle, onClear, searchPlaceholder, accentActive = false,
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
                    {typeof counts[id] === "number" && counts[id] > 0 && (
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

// Sub-Departments (Left) + Class/Sub-Class Categorization (Right) — same layout as Summary
// Reports' HierarchyTabs, minus the Department level since this module is permanently scoped
// to Immigration.
export function HierarchyTabs({
  subDepartments = [],
  activeSubDeptId, setActiveSubDeptId,
  subDeptTaskCounts = {},
  availableClasses = [], activeClassIds = [], setActiveClassIds, classCounts = {},
  availableSubClasses = [], activeSubClassIds = [], setActiveSubClassIds, subClassCounts = {},
}: any) {
  const handleSubDeptChange = (v: string) => {
    setActiveSubDeptId(v);
    setActiveClassIds?.([]);
    setActiveSubClassIds?.([]);
  };

  const toggleClass = (id: string) => {
    setActiveClassIds?.((prev: string[]) => (prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]));
    setActiveSubClassIds?.([]);
  };

  const toggleSubClass = (id: string) => {
    setActiveSubClassIds?.((prev: string[]) => (prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]));
  };

  const hasSubDepts = subDepartments.length > 0;
  const hasClasses = availableClasses.length > 0 || availableSubClasses.length > 0;

  if (!hasSubDepts && !hasClasses) return null;

  return (
    <div className="flex flex-col border-b border-slate-200 antialiased bg-white">
      <div className="px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {hasSubDepts && (
            <>
              <CornerDownRight className="h-4 w-4 text-slate-300 shrink-0" />
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
