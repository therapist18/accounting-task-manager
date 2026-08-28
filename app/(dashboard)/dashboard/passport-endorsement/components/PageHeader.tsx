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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STEP_LABELS, type HandlingStep } from "../utils/database";

// Same look as Summary Reports' HierarchyTabs (PageHeader.tsx there) — bordered pill tabs +
// a searchable multi-select dropdown for Classes/Sub-Classes, duplicated here rather than
// imported since these are private, route-scoped components in that other module.
const TAB_LIST_CLASS = "bg-slate-100 p-1 rounded-md border border-slate-200";
const TAB_TRIGGER_CLASS = "group gap-2 rounded-md px-4 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white transition-colors data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-sm";
const COUNT_BADGE_CLASS = "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-md text-sm min-w-[2rem] leading-none shadow-sm bg-custom-blue text-white group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white";

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
    <div className="flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-md border border-slate-200 bg-white">
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

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export function PageHeader({
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
            Track and manage all passport endorsement cases in one place
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <DateRangeFilter dateRange={dateRange} setDateRange={setDateRange} />

          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-4 rounded-md border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2"
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 px-3 rounded-md border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-1.5">
                <MoreHorizontal className="h-4 w-4 text-slate-400" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onOpenCouriers} className="gap-2 cursor-pointer font-medium">
                <Truck className="h-4 w-4 text-slate-400" /> Manage Couriers
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenMultiSort} className="gap-2 cursor-pointer font-medium justify-between">
                <div className="flex items-center gap-2">
                  <ListFilter className="h-4 w-4 text-slate-400" /> Multi-level Sort
                </div>
                {sortLevelCount > 1 && (
                  <span className="h-5 w-5 rounded-md bg-custom-blue text-white text-[10px] font-bold flex items-center justify-center">
                    {sortLevelCount}
                  </span>
                )}
              </DropdownMenuItem>
              {/* Note: Columns will be managed differently or kept here. We can render the Dialog trigger inside a MenuItem, but that requires careful state management. 
                  For now, we'll implement a simple callback or handle it in a separate button if we want, but the image just has "More". 
                  Let's leave Columns out of More for a second if it's tricky, or implement it by exposing an onOpenColumns callback. */}
            </DropdownMenuContent>
          </DropdownMenu>
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
        <Button variant="outline" className="h-9 px-4 rounded-md border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2">
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

export function StatusTabs({ 
  activeStep, setActiveStep, 
  activeMode, setActiveMode,
  counts, 
  searchQuery, setSearchQuery,
  availableClasses = [], activeClassIds = [], setActiveClassIds,
  availableSubClasses = [], activeSubClassIds = [], setActiveSubClassIds,
}: any) {
  const statusOptions = [
    { id: "all", label: "All Statuses" },
    ...STATUS_TAB_ORDER.map((s) => ({
      id: s,
      label: STEP_LABELS[s],
    })),
  ];

  const modeOptions = [
    { id: "all", label: "All Modes" },
    { id: "bcl", label: "BCL Handles" },
    { id: "client", label: "Client Handles" },
    { id: "not_set", label: "Not Set" },
  ];

  const hasFilters = activeStep !== "all" || activeMode !== "all" || activeClassIds.length > 0 || activeSubClassIds.length > 0 || searchQuery !== "";

  const handleClearFilters = () => {
    setActiveStep("all");
    setActiveMode("all");
    setActiveClassIds([]);
    setActiveSubClassIds([]);
    setSearchQuery("");
  };

  return (
    <div className="px-8 py-4 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white antialiased overflow-x-auto">
      <div className="relative w-80 shrink-0">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, passport no., company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-11 pr-10 bg-white border-slate-200 rounded-md text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-2 shrink-0 h-10 px-1 border border-slate-200 rounded-md bg-white">
        <span className="text-[13px] font-semibold text-slate-500 pl-3">Status</span>
        <Select value={activeStep} onValueChange={setActiveStep}>
          <SelectTrigger className="h-8 w-[160px] border-none shadow-none text-[13px] font-semibold text-slate-700 focus:ring-0 bg-transparent py-0">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(opt => (
              <SelectItem key={opt.id} value={opt.id} className="text-[13px]">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 shrink-0 h-10 px-1 border border-slate-200 rounded-md bg-white">
        <span className="text-[13px] font-semibold text-slate-500 pl-3">Mode</span>
        <Select value={activeMode} onValueChange={setActiveMode}>
          <SelectTrigger className="h-8 w-[140px] border-none shadow-none text-[13px] font-semibold text-slate-700 focus:ring-0 bg-transparent py-0">
            <SelectValue placeholder="All Modes" />
          </SelectTrigger>
          <SelectContent>
            {modeOptions.map(opt => (
              <SelectItem key={opt.id} value={opt.id} className="text-[13px]">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-6 w-px bg-slate-200 mx-2 shrink-0" />

      {availableClasses.length > 0 && (
        <div className="flex items-center gap-2 shrink-0 h-10 px-1 border border-slate-200 rounded-md bg-white">
          <span className="text-[13px] font-semibold text-slate-500 pl-3">Class</span>
          <Select value={activeClassIds.length > 0 ? activeClassIds[0] : "all"} onValueChange={(v) => setActiveClassIds(v === "all" ? [] : [v])}>
            <SelectTrigger className="h-8 w-[120px] border-none shadow-none text-[13px] font-semibold text-slate-700 focus:ring-0 bg-transparent py-0">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[13px]">All Classes</SelectItem>
              {availableClasses.map((c: any) => (
                <SelectItem key={c.id.toString()} value={c.id.toString()} className="text-[13px]">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {availableSubClasses.length > 0 && (
        <div className="flex items-center gap-2 shrink-0 h-10 px-1 border border-slate-200 rounded-md bg-white">
          <span className="text-[13px] font-semibold text-slate-500 pl-3">Sub-class</span>
          <Select value={activeSubClassIds.length > 0 ? activeSubClassIds[0] : "all"} onValueChange={(v) => setActiveSubClassIds(v === "all" ? [] : [v])}>
            <SelectTrigger className="h-8 w-[140px] border-none shadow-none text-[13px] font-semibold text-slate-700 focus:ring-0 bg-transparent py-0">
              <SelectValue placeholder="All Sub-classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[13px]">All Sub-classes</SelectItem>
              {availableSubClasses.map((c: any) => (
                <SelectItem key={c.id.toString()} value={c.id.toString()} className="text-[13px]">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasFilters && (
        <Button 
          variant="ghost" 
          onClick={handleClearFilters}
          className="h-10 px-4 rounded-md text-[13px] font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 ml-auto gap-2"
        >
          Clear Filters <X className="h-4 w-4" />
        </Button>
      )}
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

export function HierarchyTabs({
  subDepartments = [],
  activeSubDeptId, setActiveSubDeptId,
  subDeptTaskCounts = {},
}: any) {
  const handleSubDeptChange = (v: string) => {
    setActiveSubDeptId(v);
  };

  const hasSubDepts = subDepartments.length > 0;
  if (!hasSubDepts) return null;

  return (
    <div className="flex flex-col border-b border-slate-200 antialiased bg-white">
      <div className="px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="overflow-x-auto custom-scrollbar">
            <PillTrack
              size="sm"
              value={activeSubDeptId}
              onValueChange={handleSubDeptChange}
              items={[
                { id: "all", label: "All", count: subDeptTaskCounts.all },
                ...subDepartments.map((s: any) => ({ id: s.id.toString(), label: s.name, count: subDeptTaskCounts[s.id.toString()] })),
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
