// @ts-nocheck
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpDown, SearchX, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Upload, CheckCircle2, AlertTriangle, Clock,
  Pencil, Check, Calendar as CalendarIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, isValid, differenceInDays } from "date-fns";

// ── Constants ────────────────────────────────────────────────────────────────

const INDEX_COL_W = 48;

const FIXED_COLUMNS = [
  { id: "r_number", label: "R NUMBER", width: 110, sticky: true },
  { id: "passport_number", label: "PASSPORT NO.", width: 150, sticky: true },
  { id: "applicant_name", label: "APPLICANT NAME", width: 210, sticky: true },
];

export const INFO_COLUMNS = [
  { id: "sub_dept", label: "SUB DEPT", width: 130 },
  { id: "class_name", label: "CLASS", width: 120 },
  { id: "company_prefix", label: "COMPANY", width: 100 },
  { id: "duration", label: "DURATION", width: 100 },
  { id: "new_renewal", label: "TYPE", width: 90 },
  { id: "current_stage", label: "CURR. STAGE", width: 145 },
  { id: "follow_up", label: "FOLLOW UP", width: 120 },
  { id: "task_manager", label: "TASK MGR", width: 145 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const MISSING_BADGE = (
  <span className="text-sm font-bold text-rose-600">
    MISSING
  </span>
);

const formatDate = (dateStr: string | null, showTime: boolean): string => {
  if (!dateStr) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return showTime ? `${dateStr} 00:00` : dateStr;
  try {
    const d = new Date(dateStr);
    if (isValid(d)) return showTime ? format(d, "dd/MM/yyyy HH:mm") : format(d, "dd/MM/yyyy");
  } catch { }
  return dateStr;
};

const parseDateSafe = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isValid(d) ? d : null;
  }
  try {
    const d = new Date(s);
    return isValid(d) ? d : null;
  } catch { return null; }
};

const getDaysDiff = (d1: string | null, d2: string | null): number | null => {
  const a = parseDateSafe(d1);
  const b = parseDateSafe(d2);
  if (!a || !b) return null;
  return differenceInDays(b, a);
};

const formatEstimatedMins = (minutes: number): string => {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const d = Math.floor(h / 24);
  return d >= 1 ? `~${d}d` : `~${h}h`;
};

const getSubdeptName = (task: any, departments: any[]): string => {
  if (!task?.subdepartment_id || !departments?.length) return "";
  for (const dept of departments) {
    const sub = dept.tm_subdepartments?.find((s: any) => s.id?.toString() === task.subdepartment_id?.toString());
    if (sub) return sub.name || sub.short_name || "";
  }
  return "";
};

const getClassName = (task: any, departments: any[]): string => {
  if (!task?.class_id || !departments?.length) return task.class_name || "";
  for (const dept of departments) {
    for (const sub of dept.tm_subdepartments || []) {
      const cls = sub.classes?.find((c: any) => c.id?.toString() === task.class_id?.toString());
      if (cls) return cls.display_name || cls.name || "";
    }
  }
  return task.class_name || "";
};

const getCurrentStage = (task: any, stageColumns: any[], getStageDate: any) => {
  for (const stage of stageColumns) {
    if (!getStageDate(task, stage.id)) return stage;
  }
  return null;
};

const getFollowUp = (stageId: string | null, stages: any[]): string => {
  if (!stageId || !stages?.length) return "";
  const s = stages.find((s: any) => s.id === stageId);
  return s?.follow_up || s?.followUp || "";
};

const getInfoValue = (
  colId: string, task: any,
  companies: any,
  departments: any[],
  stages: any[],
  stageColumns: any[],
  getStageDate: any,
  getStaffName?: (id: any) => string,
): React.ReactNode => {
  switch (colId) {
    case "sub_dept": {
      const name = getSubdeptName(task, departments);
      return name ? <span className="text-sm font-medium text-slate-700">{name}</span> : MISSING_BADGE;
    }
    case "class_name": {
      const name = getClassName(task, departments);
      return name ? <span className="text-sm font-medium text-slate-700">{name}</span> : MISSING_BADGE;
    }
    case "company_prefix": {
      const co = companies?.get?.(task.company_id) || companies?.[task.company_id];
      const prefix = co?.prefix || task.company_prefix;
      return prefix
        ? <span className="text-sm font-bold text-slate-800">{prefix}</span>
        : MISSING_BADGE;
    }
    case "duration": {
      const val = task.duration;
      return val && val !== "N/A"
        ? <span className="text-sm font-semibold text-slate-700">{val}</span>
        : MISSING_BADGE;
    }
    case "new_renewal": {
      const val = task.renewal_status;
      if (!val) return MISSING_BADGE;
      const isRenewal = val === "Renewal";
      return (
        <span className={cn(
          "text-sm font-semibold uppercase tracking-wider"
        )}>
          {val}
        </span>
      );
    }
    case "current_stage": {
      const curr = getCurrentStage(task, stageColumns, getStageDate);
      return curr
        ? <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">{curr.label}</span>
        : <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Complete</span>;
    }
    case "follow_up": {
      const curr = getCurrentStage(task, stageColumns, getStageDate);
      const fu = getFollowUp(curr?.id || null, stages);
      return fu ? <span className="text-sm font-medium text-slate-700">{fu}</span> : MISSING_BADGE;
    }
    case "task_manager": {
      const mgr = task.task_manager_id;
      if (!mgr) return MISSING_BADGE;
      const name = getStaffName ? getStaffName(mgr) : null;
      return name && name !== mgr
        ? <span className="text-sm font-medium text-slate-700">{name}</span>
        : <span className="text-sm font-mono text-slate-400">{String(mgr).slice(0, 8)}…</span>;
    }
    default: return "—";
  }
};

// Pre-compute sticky left offsets
const STICKY_OFFSETS: Record<string, number> = (() => {
  const o: Record<string, number> = {};
  let c = INDEX_COL_W;
  for (const col of FIXED_COLUMNS) {
    o[col.id] = c;
    c += col.width;
  }
  return o;
})();

// ── BCL User Columns ─────────────────────────────────────────────────────────

export const BCL_USER_COLUMNS = [
  { id: "nyayo_to_bcl_user", label: "NYAYO→BCL BY", width: 130, stageId: "nyayo_to_bcl" },
  { id: "bcl_to_client_user", label: "BCL→CLIENT BY", width: 130, stageId: "bcl_to_client" },
  { id: "client_to_bcl_user", label: "CLIENT→BCL BY", width: 130, stageId: "client_to_bcl" },
];

// ── Stage Date Cell ───────────────────────────────────────────────────────────

const StageDateCell = ({ task, stage, stageIndex, stageColumns, getStageDate, showTime, stages, onSaveStageDate, bclUsers, currentUserId }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateInput, setDateInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBclUserId, setSelectedBclUserId] = useState<string>("");

  const dateValue = getStageDate(task, stage.id);
  const hasDate = !!dateValue;

  // Overdue calculation
  let isOverdue = false;
  if (hasDate) {
    const fullStage = stages?.find((s: any) => s.id === stage.id);
    if (fullStage?.estimated_time) {
      const prevStage = stageIndex > 0 ? stageColumns[stageIndex - 1] : null;
      const startStr = prevStage ? getStageDate(task, prevStage.id) : (task.date_initiated || task.created_at);
      const start = parseDateSafe(startStr);
      const end = parseDateSafe(dateValue);
      if (start && end) isOverdue = (end.getTime() - start.getTime()) / 60000 > fullStage.estimated_time;
    }
  }

  const openEditor = (existingDate?: string) => {
    setSelectedBclUserId(currentUserId || "");
    if (existingDate) {
      setDateInput(existingDate);
      const p = parseDateSafe(existingDate);
      if (p) setSelectedDate(p);
    } else {
      setDateInput("");
      setSelectedDate(undefined);
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedDate(undefined);
    setDateInput("");
  };

  const handleDateInputChange = (val: string) => {
    setDateInput(val);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [dd, mm, yyyy] = val.split('/');
      const d = new Date(`${yyyy}-${mm}-${dd}`);
      if (isValid(d)) setSelectedDate(d);
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    setSelectedDate(d);
    if (d) setDateInput(format(d, "dd/MM/yyyy"));
  };

  const handleSave = async () => {
    const finalDate = selectedDate ? format(selectedDate, "dd/MM/yyyy") : dateInput;
    if (!finalDate || !onSaveStageDate) return;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(finalDate)) return;
    setIsSaving(true);
    try {
      const bclUser = (bclUsers || []).find((u: any) => u.id === selectedBclUserId);
      await onSaveStageDate(task.id, stage.id, finalDate, selectedBclUserId || null, bclUser?.name || "");
      handleCancel();
    } finally { setIsSaving(false); }
  };

  const dateOk = selectedDate != null || /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput);

  const completedBlock = (
    <div className="flex items-center gap-1.5 cursor-default select-none">
      {isOverdue ? <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /> : <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
      <span className={cn("text-sm font-semibold whitespace-nowrap", isOverdue ? "text-amber-700" : "text-slate-800")}>
        {formatDate(dateValue, showTime)}
      </span>
      {isOverdue && <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase">LATE</span>}
    </div>
  );

  // ── MANUAL STAGE (hasDateInput: true) ────────────────────────────────────
  if (stage.hasDateInput) {
    return (
      <Popover open={isEditing} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <PopoverTrigger asChild>
          {hasDate ? (
            <div className="flex items-center gap-1.5 group/cell cursor-pointer" onClick={() => openEditor(dateValue)}>
              {completedBlock}
              <Pencil className="h-3 w-3 opacity-0 group-hover/cell:opacity-100 text-blue-500 transition-opacity shrink-0" />
            </div>
          ) : (
            <button
              onClick={() => openEditor()}
              className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded px-2 py-1 text-xs transition-colors"
            >
              <CalendarIcon className="h-3 w-3" /> Add Date
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 z-50" align="start" side="bottom">
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stage.label}</p>
            {/* Text input — type dd/mm/yyyy */}
            <Input
              placeholder="DD/MM/YYYY"
              value={dateInput}
              onChange={(e) => handleDateInputChange(e.target.value)}
              className="h-8 text-sm font-mono"
            />
            {/* Calendar picker */}
            <CalendarPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleCalendarSelect}
              initialFocus
            />
            {/* BCL user selector */}
            {(bclUsers?.length > 0) && (
              <div className="space-y-1 border-t border-slate-100 pt-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Handled by</p>
                <Select value={selectedBclUserId} onValueChange={setSelectedBclUserId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select BCL user..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {(bclUsers || []).map((u: any) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleSave}
                disabled={!dateOk || isSaving}
                size="sm"
                className="flex-1 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button onClick={handleCancel} size="sm" variant="outline" className="flex-1 h-8 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // ── UUID STAGE (hasDateInput: false): show date or redirect to tasks ──────
  if (hasDate) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {completedBlock}
          </TooltipTrigger>
          <TooltipContent side="top" className={cn("border shadow-md text-xs rounded-lg px-3 py-2 z-[100]", isOverdue ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900")}>
            <p className="font-bold mb-0.5">{isOverdue ? "Completed — Overdue" : "Completed On Time"}</p>
            <p className="text-slate-600 text-sm">{formatDate(dateValue, true)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const subDeptId = task.subdepartment_id || task.job_level?.subdepartment_id || "";
  return (
    <Link
      href={`/dashboard/tasks?deptId=1&subDeptId=${subDeptId}&taskId=${task.id}&stageId=${stage.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 group/cell text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
    >
      <div className="h-2 w-2 rounded-full bg-slate-300 shrink-0 group-hover/cell:bg-blue-400 transition-colors" />
      <span className="text-sm font-medium italic">Pending</span>
      <Upload className="h-3 w-3 opacity-0 group-hover/cell:opacity-100 transition-opacity ml-0.5 shrink-0" />
    </Link>
  );
};

// ── Delta Cell ───────────────────────────────────────────────────────────────

const DeltaCell = ({ task, prevStage, nextStage, getStageDate }: any) => {
  const diff = getDaysDiff(getStageDate(task, prevStage.id), getStageDate(task, nextStage.id));
  if (diff === null) return <span className="text-slate-200 text-sm">—</span>;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            "text-sm font-bold tabular-nums cursor-default",
            diff > 30 ? "text-rose-500" : diff > 14 ? "text-amber-500" : "text-slate-500"
          )}>
            {diff >= 0 ? `+${diff}d` : `${diff}d`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1.5 z-[100]">
          {diff} day{Math.abs(diff) !== 1 ? "s" : ""} between stages
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ── Pagination Footer ────────────────────────────────────────────────────────

function PaginationFooter({ total, currentPage, setCurrentPage, rowsPerPage, setRowsPerPage, totalPages, label = "rows per page" }: any) {
  const from = (currentPage - 1) * rowsPerPage + 1;
  const to = Math.min(currentPage * rowsPerPage, total);
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-white rounded-b-lg mt-0.5">
      <div className="text-sm text-slate-500 font-medium">
        Showing <span className="font-bold text-slate-700">{from}</span>–<span className="font-bold text-slate-700">{to}</span> of <span className="font-bold text-slate-700">{total}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-slate-500 font-medium">{label}:</span>
          <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
            <SelectTrigger className="w-[52px] h-7 rounded border-slate-200 text-sm font-bold text-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map(s => (
                <SelectItem key={s} value={String(s)} className="text-sm">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className={cn("h-6 w-6 rounded text-slate-400", currentPage === 1 ? "opacity-30" : "hover:bg-slate-100")}><ChevronsLeft size={12} /></Button>
          <Button variant="ghost" size="icon" onClick={() => setCurrentPage((p: number) => p - 1)} disabled={currentPage === 1} className={cn("h-6 w-6 rounded text-slate-400", currentPage === 1 ? "opacity-30" : "hover:bg-slate-100")}><ChevronLeft size={12} /></Button>
          <div className="px-2 text-sm font-bold text-slate-700 min-w-[36px] text-center">{currentPage}<span className="text-slate-400 font-medium">/{totalPages}</span></div>
          <Button variant="ghost" size="icon" onClick={() => setCurrentPage((p: number) => p + 1)} disabled={currentPage === totalPages} className={cn("h-6 w-6 rounded text-slate-400", currentPage === totalPages ? "opacity-30" : "hover:bg-slate-100")}><ChevronRight size={12} /></Button>
          <Button variant="ghost" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className={cn("h-6 w-6 rounded text-slate-400", currentPage === totalPages ? "opacity-30" : "hover:bg-slate-100")}><ChevronsRight size={12} /></Button>
        </div>
      </div>
    </div>
  );
}

// ── Transposed View ──────────────────────────────────────────────────────────

function TransposedView({ tasks, visibleStageColumns, getStageDate, showTime, stages, currentPage, setCurrentPage, rowsPerPage, setRowsPerPage, onSaveStageDate, bclUsers, currentUserId }: any) {
  const totalPages = Math.max(1, Math.ceil(tasks.length / rowsPerPage));
  const paginated = useMemo(() => tasks.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [tasks, currentPage, rowsPerPage]);

  const rows = [...FIXED_COLUMNS, ...visibleStageColumns];

  const fixedVal = (task: any, id: string) => {
    switch (id) {
      case "r_number": return task.r_number || task.applicant_data?.r_number;
      case "passport_number": return task.passport_number;
      case "applicant_name": return task.applicant_name;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-hidden border border-slate-200 rounded-lg shadow-sm bg-white">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-blue-200 px-4 py-3 bg-custom-blue" style={{ width: 190 }}>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Stage / Field</span>
                </TableHead>
                {paginated.map((task: any, idx: number) => (
                  <TableHead key={task.id} className="border-r border-b border-blue-200 px-3 py-2 bg-custom-blue" style={{ minWidth: 170 }}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-blue-200">#{(currentPage - 1) * rowsPerPage + idx + 1}</span>
                      <span className="text-sm font-semibold text-white truncate">{task.applicant_name || "—"}</span>
                      <span className="text-sm text-blue-300">{task.passport_number || ""}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any, rowIdx: number) => {
                const isFixed = FIXED_COLUMNS.some(c => c.id === row.id);
                const isOdd = rowIdx % 2 !== 0;
                const bg = isOdd ? "bg-slate-50" : "bg-white";
                return (
                  <TableRow key={row.id} className={cn("group border-0 hover:bg-blue-50/40", bg)}>
                    <TableCell className={cn("sticky left-0 z-20 border-r border-b border-slate-200 px-4 py-2.5", bg, "group-hover:bg-blue-50/40")}>
                      <span className="text-sm font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">{row.label}</span>
                    </TableCell>
                    {paginated.map((task: any) => (
                      <TableCell key={task.id} className={cn("border-r border-b border-slate-200 px-3 py-2.5", bg, "group-hover:bg-blue-50/40")}>
                        {isFixed ? (
                          <span className={cn("text-sm block truncate", row.id === "applicant_name" ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                            {fixedVal(task, row.id) || MISSING_BADGE}
                          </span>
                        ) : (
                          <StageDateCell
                            task={task} stage={row}
                            stageIndex={visibleStageColumns.findIndex((s: any) => s.id === row.id)}
                            stageColumns={visibleStageColumns}
                            getStageDate={getStageDate} showTime={showTime} stages={stages}
                            onSaveStageDate={onSaveStageDate}
                            bclUsers={bclUsers} currentUserId={currentUserId}
                          />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <PaginationFooter total={tasks.length} currentPage={currentPage} setCurrentPage={setCurrentPage} rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} totalPages={totalPages} label="applicants per page" />
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function ImmigrationTrackerView({
  tasks, stageColumns, stages, sortConfig, handleSort,
  currentPage, setCurrentPage, rowsPerPage, setRowsPerPage,
  getStageDate, getStageStatus, companies,
  view, showTime, visibleStageColumnIds,
  visibleInfoColumnIds, showDelta,
  departments, getStaffName, onSaveStageDate,
  bclUsers, currentUserId, showBclUsers,
}: any) {
  const visibleStageColumns = useMemo(
    () => stageColumns.filter((c: any) => visibleStageColumnIds.includes(c.id)),
    [stageColumns, visibleStageColumnIds]
  );

  const visibleInfoColumns = useMemo(
    () => (visibleInfoColumnIds?.length ? INFO_COLUMNS.filter((c) => visibleInfoColumnIds.includes(c.id)) : INFO_COLUMNS),
    [visibleInfoColumnIds]
  );

  // Interleave stage + delta columns (delta only when showDelta is true)
  const interleaved = useMemo(() => {
    const result: any[] = [];
    visibleStageColumns.forEach((col: any, i: number) => {
      result.push({ type: "stage", col, idx: i });
      if (showDelta && i < visibleStageColumns.length - 1) {
        result.push({ type: "delta", prev: col, next: visibleStageColumns[i + 1] });
      }
    });
    return result;
  }, [visibleStageColumns, showDelta]);

  const paginated = useMemo(
    () => tasks.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [tasks, currentPage, rowsPerPage]
  );
  const totalPages = Math.max(1, Math.ceil(tasks.length / rowsPerPage));

  if (view === "transposed") {
    return (
      <TransposedView
        tasks={tasks} visibleStageColumns={visibleStageColumns}
        getStageDate={getStageDate} showTime={showTime} stages={stages}
        currentPage={currentPage} setCurrentPage={setCurrentPage}
        rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage}
        onSaveStageDate={onSaveStageDate}
        bclUsers={bclUsers} currentUserId={currentUserId}
      />
    );
  }

  const totalCols = 1 + FIXED_COLUMNS.length + visibleInfoColumns.length + (showBclUsers ? BCL_USER_COLUMNS.length : 0) + interleaved.length;

  return (
    <div className="flex flex-col h-full antialiased">
      <div className="overflow-hidden border border-slate-200 rounded-lg shadow-sm bg-white">
        <div className="overflow-auto max-h-[calc(100vh-245px)]">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ minWidth: "100%" }}>
            <colgroup>
              <col style={{ width: INDEX_COL_W }} />
              {FIXED_COLUMNS.map(c => <col key={c.id} style={{ width: c.width }} />)}
              {visibleInfoColumns.map(c => <col key={c.id} style={{ width: c.width }} />)}
              {showBclUsers && BCL_USER_COLUMNS.map(c => <col key={c.id} style={{ width: c.width }} />)}
              {interleaved.map((item, i) => (
                <col key={i} style={{ width: item.type === "delta" ? 62 : 148 }} />
              ))}
            </colgroup>

            {/* ═══ HEADER ═══ */}
            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                {/* Index */}
                <TableHead className="sticky left-0 z-50 border-r border-b border-blue-200 py-3 text-center bg-custom-blue">
                  <span className="text-sm font-bold text-white">#</span>
                </TableHead>

                {/* Fixed sticky */}
                {FIXED_COLUMNS.map(col => {
                  const isActive = sortConfig?.key === col.id;
                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "sticky z-40 border-r border-b border-blue-200 px-3 py-3 cursor-pointer select-none group transition-colors shadow-[2px_0_4px_rgba(0,0,0,0.06)]",
                        isActive ? "bg-blue-700" : "bg-custom-blue"
                      )}
                      style={{ left: STICKY_OFFSETS[col.id] }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold uppercase tracking-wider text-white whitespace-nowrap">{col.label}</span>
                        <ArrowUpDown className={cn("h-3 w-3 shrink-0 text-blue-300", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                      </div>
                    </TableHead>
                  );
                })}

                {/* Info cols */}
                {visibleInfoColumns.map(col => (
                  <TableHead key={col.id} className="border-r border-b border-blue-200 px-3 py-3 bg-custom-blue">
                    <span className="text-sm font-bold uppercase tracking-wider text-blue-200 whitespace-nowrap">{col.label}</span>
                  </TableHead>
                ))}

                {/* BCL user cols */}
                {showBclUsers && BCL_USER_COLUMNS.map(col => (
                  <TableHead key={col.id} className="border-r border-b border-blue-200 px-3 py-3 bg-violet-700">
                    <span className="text-sm font-bold uppercase tracking-wider text-violet-200 whitespace-nowrap">{col.label}</span>
                  </TableHead>
                ))}

                {/* Stage + delta cols */}
                {interleaved.map((item, i) =>
                  item.type === "delta" ? (
                    <TableHead key={i} className="border-r border-b border-blue-200 px-1 py-3 text-center bg-custom-blue">
                      <span className="text-[9px] font-bold text-blue-300/60 uppercase">Δ</span>
                    </TableHead>
                  ) : (
                    <TableHead
                      key={item.col.id}
                      onClick={() => handleSort(item.col.id)}
                      className={cn(
                        "border-r border-b border-blue-200 px-3 py-2.5 cursor-pointer select-none group transition-colors",
                        sortConfig?.key === item.col.id ? "bg-blue-700" : "bg-custom-blue"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold uppercase tracking-wider text-white whitespace-nowrap leading-tight">{item.col.label}</span>
                          {item.col.hasDateInput && (
                            <span className="text-[8px] font-bold text-amber-300 uppercase tracking-wider">Manual</span>
                          )}
                        </div>
                        <ArrowUpDown className={cn("h-3 w-3 shrink-0 text-blue-300", sortConfig?.key === item.col.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                      </div>
                    </TableHead>
                  )
                )}
              </TableRow>

              {/* ═══ DURATION SUB-ROW ═══ */}
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-30 border-r border-b border-slate-200 py-1.5 text-center bg-blue-50">
                  <Clock className="h-3 w-3 text-blue-400 mx-auto" />
                </TableHead>
                {FIXED_COLUMNS.map((col, i) => (
                  <TableHead
                    key={col.id}
                    className="sticky z-20 border-r border-b border-slate-200 px-3 py-1.5 bg-blue-50 shadow-[2px_0_4px_rgba(0,0,0,0.02)]"
                    style={{ left: STICKY_OFFSETS[col.id] }}
                  >
                    {i === 0 && (
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest whitespace-nowrap">Est. Time →</span>
                    )}
                  </TableHead>
                ))}
                {visibleInfoColumns.map(col => (
                  <TableHead key={col.id} className="border-r border-b border-slate-200 px-3 py-1.5 bg-blue-50" />
                ))}
                {showBclUsers && BCL_USER_COLUMNS.map(col => (
                  <TableHead key={col.id} className="border-r border-b border-slate-200 px-3 py-1.5 bg-violet-50" />
                ))}
                {interleaved.map((item, i) =>
                  item.type === "delta" ? (
                    <TableHead key={i} className="border-r border-b border-slate-200 px-1 py-1.5 bg-blue-50" />
                  ) : (
                    <TableHead key={item.col.id} className="border-r border-b border-slate-200 px-3 py-1.5 bg-blue-50 text-center">
                      {(() => {
                        const fs = stages?.find((s: any) => s.id === item.col.id);
                        return fs?.estimated_time ? (
                          <span className="text-sm font-bold text-blue-600 italic whitespace-nowrap">
                            {formatEstimatedMins(fs.estimated_time)}
                          </span>
                        ) : null;
                      })()}
                    </TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>

            {/* ═══ BODY ═══ */}
            <TableBody>
              {paginated.length > 0 ? (
                paginated.map((task: any, idx: number) => {
                  const globalIdx = (currentPage - 1) * rowsPerPage + idx;
                  const isOdd = idx % 2 !== 0;
                  const rowBg = isOdd ? "bg-slate-50/60" : "bg-white";

                  return (
                    <TableRow key={task.id} className={cn("group border-0 hover:bg-blue-50/50 transition-colors", rowBg)}>
                      {/* Index */}
                      <TableCell className={cn("sticky left-0 z-20 border-r border-b border-slate-200 text-center py-2.5", rowBg, "group-hover:bg-blue-50/60")}>
                        <span className="text-sm font-bold text-slate-500 tabular-nums">{globalIdx + 1}</span>
                      </TableCell>

                      {/* Fixed sticky cols */}
                      {FIXED_COLUMNS.map(col => {
                        let val: any;
                        switch (col.id) {
                          case "r_number": val = task.r_number || task.applicant_data?.r_number; break;
                          case "passport_number": val = task.passport_number; break;
                          case "applicant_name": val = task.applicant_name; break;
                        }
                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "sticky z-20 border-r border-b border-slate-200 px-3 py-2.5 shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                              rowBg, "group-hover:bg-blue-50/60"
                            )}
                            style={{ left: STICKY_OFFSETS[col.id] }}
                          >
                            {val ? (
                              <span className={cn("text-sm block truncate", col.id === "applicant_name" ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                                {val}
                              </span>
                            ) : MISSING_BADGE}
                          </TableCell>
                        );
                      })}

                      {/* Info cols */}
                      {visibleInfoColumns.map(col => (
                        <TableCell key={col.id} className={cn("border-r border-b border-slate-200 px-3 py-2.5", rowBg, "group-hover:bg-blue-50/60")}>
                          <div className="truncate max-w-full">
                            {getInfoValue(col.id, task, companies, departments, stages, stageColumns, getStageDate, getStaffName)}
                          </div>
                        </TableCell>
                      ))}

                      {/* BCL user cols */}
                      {showBclUsers && BCL_USER_COLUMNS.map(col => (
                        <TableCell key={col.id} className={cn("border-r border-b border-slate-200 px-3 py-2.5 bg-violet-50/30", "group-hover:bg-violet-50/60")}>
                          <span className="text-xs font-medium text-violet-700 truncate">
                            {task.stages?.[col.stageId]?.entered_by_name || "—"}
                          </span>
                        </TableCell>
                      ))}

                      {/* Stage + delta cols */}
                      {interleaved.map((item, i) =>
                        item.type === "delta" ? (
                          <TableCell key={i} className={cn("border-r border-b border-slate-100 px-2 py-2.5 text-center", rowBg, "group-hover:bg-blue-50/60")}>
                            <DeltaCell task={task} prevStage={item.prev} nextStage={item.next} getStageDate={getStageDate} />
                          </TableCell>
                        ) : (
                          <TableCell key={item.col.id} className={cn("border-r border-b border-slate-200 px-3 py-2.5", rowBg, "group-hover:bg-blue-50/60")}>
                            <StageDateCell
                              task={task} stage={item.col}
                              stageIndex={item.idx}
                              stageColumns={visibleStageColumns}
                              getStageDate={getStageDate}
                              showTime={showTime}
                              stages={stages}
                              onSaveStageDate={onSaveStageDate}
                              bclUsers={bclUsers} currentUserId={currentUserId}
                            />
                          </TableCell>
                        )
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={totalCols} className="h-64 bg-slate-50">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center">
                        <SearchX size={22} className="text-slate-500" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">No records found</p>
                      <p className="text-sm text-slate-500">Adjust your filters to see results</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PaginationFooter
        total={tasks.length} currentPage={currentPage} setCurrentPage={setCurrentPage}
        rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} totalPages={totalPages}
      />
    </div>
  );
}
