// @ts-nocheck
"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { 
  Search, X, RotateCcw, Download, Truck, Eye, Layers, 
  CornerDownRight, Check, ChevronsUpDown, CalendarRange, 
  ListFilter, MoreVertical, ChevronDown, Calendar, 
  Monitor, Clock, Landmark, CheckCircle2, XCircle
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TAB_RAIL_CLASS = "w-full h-16 justify-start gap-3 bg-transparent p-0 overflow-x-auto flex items-center px-8 border-b border-slate-200";
const TAB_UNDERLINE_TRIGGER_CLASS = "group h-10 rounded-md bg-transparent shadow-none px-5 py-2 border border-transparent text-[13px] font-bold text-slate-900 hover:bg-slate-100 transition-all data-[state=active]:bg-custom-blue data-[state=active]:text-white flex items-center whitespace-nowrap";
const COUNT_BADGE_CLASS = "ml-2.5 inline-flex items-center justify-center font-bold tabular-nums rounded-md px-2 py-0.5 text-[11px] leading-none bg-slate-100 text-custom-blue border border-slate-200 group-data-[state=active]:bg-[#3669AE] group-data-[state=active]:text-white group-data-[state=active]:border-transparent";

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

function DateRangeFilter({ dateRange, setDateRange }: any) {
  const hasRange = !!(dateRange?.from || dateRange?.to);

  return (
    <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-colors">
      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
      <DateTextInput
        value={dateRange?.from}
        onChange={(d) => setDateRange((prev: any) => ({ ...prev, from: d }))}
        placeholder="DD/MM/YYYY"
      />
      <span className="text-slate-400 text-sm">–</span>
      <DateTextInput
        value={dateRange?.to}
        onChange={(d) => setDateRange((prev: any) => ({ ...prev, to: d }))}
        placeholder="DD/MM/YYYY"
      />
      {hasRange && (
        <button
          onClick={() => setDateRange({ from: undefined, to: undefined })}
          className="text-slate-400 hover:text-slate-600 shrink-0 ml-1"
          title="Clear date range"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

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
      <div className="px-8 py-5 flex items-center justify-between gap-6">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-wide leading-none">
            PASSPORT ENDORSEMENT TRACKING
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Track and manage all passport endorsement cases in one place
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <DateRangeFilter dateRange={dateRange} setDateRange={setDateRange} />

          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="h-10 px-4 rounded-md border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 gap-2 shadow-sm"
          >
            <RotateCcw className={cn("h-4 w-4 text-slate-500", loading && "animate-spin")} />
            Refresh
          </Button>

          <Button
            onClick={onExportExcel}
            className="h-10 px-4 rounded-md text-sm font-semibold gap-2 text-white hover:bg-[#153a75] shadow-sm"
            style={{ backgroundColor: "#184489" }}
          >
            <Download className="h-4 w-4" /> Export
          </Button>

          <ColumnVisibilityDialog
            columns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 px-3 rounded-md border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 gap-1.5 shadow-sm">
                <MoreVertical className="h-4 w-4 text-slate-500" /> 
                <span>More</span>
                <ChevronDown className="h-4 w-4 text-slate-400 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-lg border-slate-200 shadow-xl">
              <DropdownMenuItem onClick={onOpenCouriers} className="gap-2.5 cursor-pointer font-medium text-[13px] py-2.5">
                <Truck className="h-4 w-4 text-slate-400" /> Manage Couriers
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenMultiSort} className="gap-2.5 cursor-pointer font-medium text-[13px] py-2.5 justify-between">
                <div className="flex items-center gap-2.5">
                  <ListFilter className="h-4 w-4 text-slate-400" /> Multi-level Sort
                </div>
                {sortLevelCount > 1 && (
                  <span className="h-5 w-5 rounded-md bg-custom-blue text-white text-[10px] font-bold flex items-center justify-center">
                    {sortLevelCount}
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export function ColumnVisibilityDialog({ columns, visibleColumnIds, setVisibleColumnIds }: any) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string, checked: boolean) =>
    setVisibleColumnIds((prev: string[]) => (checked ? [...prev, id] : prev.filter((x: string) => x !== id)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 px-4 rounded-md border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 gap-2 shadow-sm">
          <Eye className="h-4 w-4" /> Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[78vh] flex flex-col rounded-xl border-slate-200 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Eye className="h-4 w-4 text-custom-blue" /> Column Visibility
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1 mt-3 custom-scrollbar">
          {columns.map((col: any) => (
            <div key={col.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              <Checkbox
                id={`col-${col.id}`}
                checked={visibleColumnIds.includes(col.id)}
                onCheckedChange={(v) => toggle(col.id, v === true)}
                className="border-slate-300 data-[state=checked]:bg-custom-blue data-[state=checked]:border-custom-blue"
              />
              <label htmlFor={`col-${col.id}`} className="text-[13px] font-semibold text-slate-700 cursor-pointer flex-1">
                {col.label}
              </label>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 tabular-nums">{visibleColumnIds.length} of {columns.length} columns visible</span>
          <Button
            size="sm"
            className="h-9 px-4 rounded-md text-xs font-bold gap-2 text-white shadow-sm"
            style={{ backgroundColor: "#184489" }}
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StatsRow({ 
  activeStep, setActiveStep, 
  activeMode, setActiveMode,
  counts, 
  searchQuery, setSearchQuery,
  availableClasses = [], activeClassIds = [], setActiveClassIds,
  availableSubClasses = [], activeSubClassIds = [], setActiveSubClassIds,
  hasStepFilter,
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

  const hasFilters = (hasStepFilter ?? activeStep !== "all") || activeMode !== "all" || activeClassIds.length > 0 || activeSubClassIds.length > 0 || searchQuery !== "";

  const handleClearFilters = () => {
    setActiveStep("all");
    setActiveMode("all");
    setActiveClassIds([]);
    setActiveSubClassIds([]);
    setSearchQuery("");
  };

  return (
    <div className="px-8 py-6 bg-[#f8fafc] antialiased space-y-6">
      {/* FILTER BAR */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-[340px] shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-400" />
          <Input
            placeholder="Search by name, passport no., company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 pr-10 bg-white border-slate-200 rounded-lg text-[13px] font-medium focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
          />
        </div>
        
        <div className="flex items-center h-11 border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <span className="text-sm font-semibold text-slate-700 px-4 bg-slate-50 border-r border-slate-200 h-full flex items-center">Status</span>
          <Select value={activeStep} onValueChange={setActiveStep}>
            <SelectTrigger className="h-full w-[170px] px-4 border-none shadow-none text-[13px] font-medium text-slate-600 focus:ring-0 bg-transparent rounded-none">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(opt => (
                <SelectItem key={opt.id} value={opt.id} className="text-sm font-medium">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center h-11 border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <span className="text-sm font-semibold text-slate-700 px-4 bg-slate-50 border-r border-slate-200 h-full flex items-center">Mode</span>
          <Select value={activeMode} onValueChange={setActiveMode}>
            <SelectTrigger className="h-full w-[160px] px-4 border-none shadow-none text-[13px] font-medium text-slate-600 focus:ring-0 bg-transparent rounded-none">
              <SelectValue placeholder="All Modes" />
            </SelectTrigger>
            <SelectContent>
              {modeOptions.map(opt => (
                <SelectItem key={opt.id} value={opt.id} className="text-sm font-medium">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {availableClasses.length > 0 && (
          <div className="flex items-center h-11 border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
            <span className="text-sm font-semibold text-slate-700 px-4 bg-slate-50 border-r border-slate-200 h-full flex items-center">Class</span>
            <Select value={activeClassIds.length > 0 ? activeClassIds[0] : "all"} onValueChange={(v) => setActiveClassIds(v === "all" ? [] : [v])}>
              <SelectTrigger className="h-full w-[150px] px-4 border-none shadow-none text-[13px] font-medium text-slate-600 focus:ring-0 bg-transparent rounded-none">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm font-medium">All Classes</SelectItem>
                {availableClasses.map((c: any) => (
                  <SelectItem key={c.id.toString()} value={c.id.toString()} className="text-sm font-medium">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {availableSubClasses.length > 0 && (
          <div className="flex items-center h-11 border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
            <span className="text-sm font-semibold text-slate-700 px-4 bg-slate-50 border-r border-slate-200 h-full flex items-center">Sub-class</span>
            <Select value={activeSubClassIds.length > 0 ? activeSubClassIds[0] : "all"} onValueChange={(v) => setActiveSubClassIds(v === "all" ? [] : [v])}>
              <SelectTrigger className="h-full w-[160px] px-4 border-none shadow-none text-[13px] font-medium text-slate-600 focus:ring-0 bg-transparent rounded-none">
                <SelectValue placeholder="All Sub-classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm font-medium">All Sub-classes</SelectItem>
                {availableSubClasses.map((c: any) => (
                  <SelectItem key={c.id.toString()} value={c.id.toString()} className="text-sm font-medium">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {hasFilters && (
          <Button 
            variant="ghost" 
            onClick={handleClearFilters}
            className="h-11 px-5 rounded-lg text-[13px] font-bold text-custom-blue hover:bg-slate-100 gap-1.5"
          >
            Clear Filters <XCircle className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Card 1 */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="h-14 w-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[22px] font-black text-slate-900 tracking-tight leading-none mb-1">
              {counts?.total ? counts.total.toLocaleString() : "1,291"}
            </div>
            <div className="text-[13px] font-bold text-custom-blue leading-tight">Total Tracked</div>
            <div className="text-[11px] text-slate-500 font-medium">All cases</div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="h-14 w-14 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[22px] font-black text-slate-900 tracking-tight leading-none mb-1">
              {counts?.awaiting_receipt ? counts.awaiting_receipt.toLocaleString() : "1"}
            </div>
            <div className="text-[13px] font-bold text-custom-blue leading-tight">Awaiting Receipt</div>
            <div className="text-[11px] text-slate-500 font-medium">Pending receipt</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="h-14 w-14 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[22px] font-black text-slate-900 tracking-tight leading-none mb-1">
              {counts?.in_progress ? counts.in_progress.toLocaleString() : "0"}
            </div>
            <div className="text-[13px] font-bold text-custom-blue leading-tight">In Progress</div>
            <div className="text-[11px] text-slate-500 font-medium">At Nyayo House / Dispatch</div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="h-14 w-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[22px] font-black text-slate-900 tracking-tight leading-none mb-1">
              {counts?.completed ? counts.completed.toLocaleString() : "0"}
            </div>
            <div className="text-[13px] font-bold text-custom-blue leading-tight">Completed</div>
            <div className="text-[11px] text-slate-500 font-medium">Successfully completed</div>
          </div>
        </div>

        {/* Card 5 - Mini List */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 flex flex-col justify-center space-y-3 shadow-sm pl-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-[12px] font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 mr-2.5"></span>
              At Nyayo House
            </div>
            <span className="text-[13px] font-black text-custom-blue">0</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center text-[12px] font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 mr-2.5"></span>
              Ready / Out for Dispatch
            </div>
            <span className="text-[13px] font-black text-custom-blue">0</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center text-[12px] font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 mr-2.5"></span>
              Client Managed
            </div>
            <span className="text-[13px] font-black text-custom-blue">0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MultiSelectSearchableDropdown({
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
            "h-10 px-4 rounded-md border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0 shadow-sm",
            accentActive && "bg-custom-blue border-custom-blue text-white hover:bg-[#153a75] shadow-sm"
          )}
        >
          {label}
          {selectedIds.length > 0 && (
            <span className={cn(
              "ml-2 inline-flex items-center justify-center font-bold tabular-nums px-2 py-0.5 rounded-md text-[11px] min-w-[1.5rem] leading-none",
              accentActive ? "bg-white/20 text-white" : "bg-slate-100 text-custom-blue"
            )}>
              {selectedIds.length}
            </span>
          )}
          <ChevronDown className={cn("ml-2 h-4 w-4", accentActive ? "opacity-70" : "opacity-50")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 rounded-xl shadow-xl border-slate-200" align="end">
        <div className="flex items-center justify-between mb-2 px-3 py-1">
          <span className="text-[13px] font-bold text-slate-900 uppercase tracking-tight">Select {label}</span>
        </div>
        <Command className="rounded-lg" shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`} value={search} onValueChange={setSearch} className="h-9 border-none focus:ring-0 text-[13px]" />
          <CommandList className="max-h-[240px] overflow-y-auto custom-scrollbar mt-1">
            <CommandEmpty className="py-6 text-center text-[13px] font-medium text-slate-500">No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((it: any) => {
                const id = it.id.toString();
                const isSelected = selectedIds.includes(id);
                return (
                  <CommandItem key={id} value={id} onSelect={() => onToggle(id)} className="cursor-pointer rounded-md mx-1 my-0.5 px-3 py-2 aria-selected:bg-slate-50 transition-colors">
                    <Check className={cn("mr-3 h-4 w-4 shrink-0 transition-opacity", isSelected ? "opacity-100 text-custom-blue" : "opacity-0")} />
                    <span className={cn("flex-1 text-[13px] font-semibold truncate", isSelected ? "text-slate-900" : "text-slate-600")}>{it.name}</span>
                    {typeof counts[id] === "number" && counts[id] > 0 && (
                      <span className="ml-2 shrink-0 inline-flex items-center justify-center font-bold tabular-nums px-2 py-1 rounded-full text-[11px] min-w-[1.5rem] leading-none bg-slate-100 text-custom-blue">
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
              className="w-full h-8 rounded-md text-[12px] font-bold text-slate-500 hover:text-red-600 hover:bg-red-50"
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
  const items = [
    { id: "all", label: "All", count: subDeptTaskCounts?.all },
    ...(subDepartments || []).map((s: any) => ({ 
      id: s.id.toString(), 
      label: s.name, 
      count: subDeptTaskCounts[s.id.toString()] 
    })),
  ];

  return (
    <div className="bg-white antialiased">
      <div className="overflow-x-auto custom-scrollbar">
        <Tabs value={activeSubDeptId || "all"} onValueChange={setActiveSubDeptId} className="w-full">
          <TabsList className={TAB_RAIL_CLASS}>
            {items.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className={TAB_UNDERLINE_TRIGGER_CLASS}>
                {item.label}
                {typeof item.count === "number" && item.count > 0 && (
                  <span className={COUNT_BADGE_CLASS}>{item.count}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}