// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Plus, Minus, ArrowUpDown, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Upload, CheckCircle2, AlertTriangle, CalendarIcon, AlertCircle, Clock } from "lucide-react";
import { differenceInDays, isValid, format } from "date-fns";
import { cn } from "@/lib/utils";

const DEFAULT_COL_WIDTH = 180;
const INDEX_COL_WIDTH = 56;

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseDateSafeReport = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  if (typeof s !== 'string') return null;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isValid(d) ? d : null;
  }
  try { const d = new Date(s); return isValid(d) ? d : null; } catch { return null; }
};

const formatDateCell = (dateStr: string | null, showTime: boolean): string => {
  if (!dateStr) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return showTime ? `${dateStr} 00:00` : dateStr;
  try {
    const d = new Date(dateStr);
    if (isValid(d)) return showTime ? format(d, "dd/MM/yyyy HH:mm") : format(d, "dd/MM/yyyy");
  } catch { }
  return dateStr;
};

const formatEstimatedMins = (minutes: number): string => {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const d = Math.floor(h / 24);
  return d >= 1 ? `~${d}d` : `~${h}h`;
};

const DataCell = ({ val, isMissing, isPrimary }: { val: React.ReactNode, isMissing: boolean, isPrimary?: boolean }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "block w-full truncate text-sm cursor-default leading-snug",
          isMissing
            ? "text-slate-400 font-medium italic"
            : isPrimary
              ? "text-slate-900 font-semibold"
              : "text-slate-500 font-medium"
        )}>
          {val}
        </div>
      </TooltipTrigger>
      {val && val !== 'N/A' && (
        <TooltipContent side="top" className="max-w-sm bg-slate-800 text-white border-none shadow-xl text-sm rounded-lg px-3 py-2 z-[9999] break-words">
          {val}
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

const PendingUploadLink = ({ taskId, stageId, subdeptId, deptId }: any) => (
  <Link
    href={`/dashboard/tasks?deptId=${deptId || ''}&subDeptId=${subdeptId}&taskId=${taskId}&stageId=${stageId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1.5 group/cell text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
    onClick={e => e.stopPropagation()}
  >
    <div className="h-2 w-2 rounded-full bg-slate-300 shrink-0 group-hover/cell:bg-blue-400 transition-colors" />
    <span className="text-sm font-medium italic">Pending</span>
    <Upload className="h-3.5 w-3.5 opacity-0 group-hover/cell:opacity-100 transition-opacity ml-0.5 shrink-0" />
  </Link>
);

// ── ReportStageDateCell ───────────────────────────────────────────────────────
const ReportStageDateCell = ({
  dateValue, isCompleted, isPending, isOverdue, requiresUpload,
  taskId, stageId, subdeptId, deptId,
  isSkipped, skipReason,
  showTime, onSaveStageDate,
}: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateInput, setDateInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasDate = !!dateValue;

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedDate(undefined);
    setDateInput('');
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
    if (d) setDateInput(format(d, 'dd/MM/yyyy'));
  };

  const handleSave = async () => {
    const finalDate = selectedDate ? format(selectedDate, 'dd/MM/yyyy') : dateInput;
    if (!finalDate || !onSaveStageDate) return;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(finalDate)) return;
    setIsSaving(true);
    try {
      await onSaveStageDate(taskId, stageId, finalDate);
      handleCancel();
    } finally {
      setIsSaving(false);
    }
  };

  const dateOk = selectedDate != null || /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput);

  // Status: Skipped
  if (isSkipped) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-sm text-amber-600 font-medium cursor-help">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Skipped
            </span>
          </TooltipTrigger>
          <TooltipContent className="bg-amber-50 border-amber-200 text-amber-900 text-xs shadow-md px-3 py-2 rounded-lg z-[9999]">
            {skipReason || 'No reason provided'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Status: Completed
  if (isCompleted) {
    if (hasDate) {
      const completedBlock = (
        <div className="flex items-center gap-1.5 cursor-default select-none group/cell">
          {isOverdue
            ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          <span className={cn("text-sm font-semibold whitespace-nowrap tracking-tight", isOverdue ? "text-amber-700" : "text-slate-800")}>
            {formatDateCell(dateValue, showTime)}
          </span>
          {isOverdue && (
            <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase ml-1">LATE</span>
          )}
        </div>
      );
      return (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>{completedBlock}</TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn(
                "border shadow-lg text-xs rounded-lg px-3 py-2 z-[9999]",
                isOverdue ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"
              )}
            >
              <p className="font-bold mb-0.5">{isOverdue ? "Completed — Overdue" : "Completed On Time"}</p>
              <p className="text-slate-600 text-sm">{formatDateCell(dateValue, true)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    } else {
      // Marked completed, but no date (Set Date mode)
      return (
        <Popover open={isEditing} onOpenChange={(o) => { if (!o) handleCancel(); }}>
          <PopoverTrigger asChild>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 text-emerald-600 border border-dashed border-emerald-300 hover:border-emerald-400 bg-emerald-50 rounded px-2 py-1 text-[10px] transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" /> Set Date
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 z-[9999]" align="start" side="bottom">
            <div className="space-y-2.5">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Set Completion Date</p>
              <Input
                placeholder="DD/MM/YYYY"
                value={dateInput}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="h-8 text-sm font-mono"
              />
              <CalendarPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleCalendarSelect}
                initialFocus
              />
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleSave}
                  disabled={!dateOk || isSaving}
                  size="sm"
                  className="flex-1 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
                >
                  {isSaving ? 'Saving...' : 'Save'}
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
  }

  // Status: Pending (Document Stage -> Redirect to Tasks page to upload / select docs)
  if (requiresUpload) {
    return <PendingUploadLink taskId={taskId} stageId={stageId} subdeptId={subdeptId} deptId={deptId} />;
  }

  // Status: Pending (Manual Input Stage -> Inline Calendar Popover for "Add Date")
  return (
    <Popover open={isEditing} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <PopoverTrigger asChild>
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded px-2 py-1 text-xs transition-colors"
        >
          <CalendarIcon className="h-3 w-3" /> Add Date
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 z-[9999]" align="start" side="bottom">
        <div className="space-y-2.5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter Date</p>
          <Input
            placeholder="DD/MM/YYYY"
            value={dateInput}
            onChange={(e) => handleDateInputChange(e.target.value)}
            className="h-8 text-sm font-mono"
          />
          <CalendarPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            initialFocus
          />
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!dateOk || isSaving}
              size="sm"
              className="flex-1 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button onClick={handleCancel} size="sm" variant="outline" className="flex-1 h-8 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};


// ── Main Component ────────────────────────────────────────────────────────────

export function StandardReportView({
  allTasks, filteredColumns, sortConfig, expandedStageColumns,
  renderCellValue, safeRender, handleSort, toggleStageColumns,
  initialRowsPerPage = 25, showDelta = false, showOfficers = false,
  showTime = false, activeDeptId = '', onSaveStageDate, stages,
}: any) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const stickyColumnIds = new Set(['task_id', 'task_passport_number', 'task_applicant_name']);

  const columnDefs = useMemo<ColumnDef<any>[]>(() => [
    { id: '__index__', size: INDEX_COL_WIDTH },
    ...filteredColumns.map((col: any) => ({
      id: col.id,
      size: DEFAULT_COL_WIDTH,
    })),
  ], [filteredColumns]);

  const table = useReactTable({
    data: [],
    columns: columnDefs,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
  });

  const getColWidth = (colId: string): number => table.getColumn(colId)?.getSize() ?? DEFAULT_COL_WIDTH;

  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = INDEX_COL_WIDTH;
    filteredColumns.forEach((col: any) => {
      if (stickyColumnIds.has(col.id)) {
        offsets[col.id] = cursor;
        cursor += columnSizing[col.id] ?? DEFAULT_COL_WIDTH;
      }
    });
    return offsets;
  }, [filteredColumns, columnSizing]);

  const interleavedColumns = useMemo(() => {
    if (!showDelta) return filteredColumns;
    const result: any[] = [];
    filteredColumns.forEach((col: any, i: number) => {
      result.push(col);
      const next = filteredColumns[i + 1];
      if (col.type === 'stage_info' && next?.type === 'stage_info') {
        result.push({ id: `__delta__${i}`, isDelta: true, prevCol: col, nextCol: next, label: 'Δ', width: 62 });
      }
    });
    return result;
  }, [filteredColumns, showDelta]);

  const firstStageColId = useMemo(() => {
    const first = interleavedColumns.find((c: any) => !c.isDelta && c.type !== 'task');
    return first?.id || null;
  }, [interleavedColumns]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allTasks.slice(start, start + rowsPerPage);
  }, [allTasks, currentPage, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(allTasks.length / rowsPerPage));

  return (
    <div className="flex flex-col h-full antialiased pt-0 bg-white">
      <div className="relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-280px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {interleavedColumns.map((col: any) => (
                <col key={col.id} style={{ width: col.isDelta ? 62 : getColWidth(col.id) }} />
              ))}
            </colgroup>

            {/* ═══ HEADER ═══ */}
            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-2.5 px-2 bg-custom-blue" style={{ background: "#376bae" }}>
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>

                {interleavedColumns.map((col: any) => {
                  if (col.isDelta) {
                    return (
                      <TableHead key={col.id} className="border-r border-b border-white/30 text-center px-1 py-2.5 bg-custom-blue" style={{ background: "#376bae", width: 62 }}>
                        <span className="text-[9px] font-bold text-blue-300/60 uppercase">Δ</span>
                      </TableHead>
                    );
                  }
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "group relative border-r border-b border-white/30 transition-colors cursor-pointer select-none px-4 py-2 bg-custom-blue",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && "bg-slate-700",
                        col.id === firstStageColId && "border-l-[3px] border-l-amber-400"
                      )}
                      style={{
                        background: "#376bae",
                        ...(isSticky ? { left: `${left}px` } : undefined),
                      }}
                    >
                      <div className="flex flex-col justify-center h-full gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <TooltipProvider delayDuration={500}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-white truncate">
                                  {col.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[260px] break-words">
                                {col.label}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <div className="flex items-center gap-1.5">
                            {col.hasSubColumns && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                                className="h-4 w-4 shrink-0 flex items-center justify-center rounded bg-slate-600 hover:bg-slate-500 text-white transition-all"
                              >
                                {expandedStageColumns.has(col.stageId) ? <Minus size={10} strokeWidth={2.5} /> : <Plus size={10} strokeWidth={2.5} />}
                              </button>
                            )}
                            <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-slate-400 opacity-0 group-hover:opacity-100")} />
                          </div>
                        </div>

                        {col.type === 'stage_info' && (
                          <div className="flex items-center w-full text-[9px] font-bold text-white/70 uppercase tracking-widest mt-0.5">
                            {col.hasDate && (
                              <div className={cn("flex-1 text-left", (col.fields?.length > 0 || (col.hasOfficer && showOfficers)) && "border-r border-white/30 pr-2 mr-2")}>
                                Date
                              </div>
                            )}
                            {col.fields?.length > 0 && (
                              <div className={cn("flex-1 text-left", (col.hasOfficer && showOfficers) && "border-r border-white/30 pr-2")}>
                                Docs
                              </div>
                            )}
                            {(col.hasOfficer && showOfficers) && (
                              <div className="flex-1 text-left pl-2">Officer</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-slate-400/30 transition-colors" />
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* ═══ DURATION SUB-ROW ═══ */}
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-[45] border-r border-b border-slate-200 py-1 text-center bg-blue-50">
                  <Clock className="h-3 w-3 text-blue-400 mx-auto" />
                </TableHead>
                {interleavedColumns.map((col: any, index: number) => {
                  if (col.isDelta) {
                    return <TableHead key={col.id} className="border-r border-b border-slate-200 px-1 py-1 bg-blue-50" />;
                  }

                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;

                  return (
                    <TableHead
                      key={col.id}
                      className={cn(
                        "border-r border-b border-slate-200 px-3 py-1 bg-blue-50 text-center",
                        isSticky && "sticky z-30 shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                        col.id === firstStageColId && "border-l-[3px] border-l-amber-200"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      {index === 0 && (
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest whitespace-nowrap mr-2">Est. Time →</span>
                      )}

                      {col.type === 'stage_info' && (() => {
                        const fs = stages?.find((s: any) => s.id === col.stageId);
                        return fs?.estimated_time ? (
                          <span className="text-[11px] font-bold text-blue-600 italic whitespace-nowrap">
                            {formatEstimatedMins(fs.estimated_time)}
                          </span>
                        ) : null;
                      })()}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            {/* ═══ BODY ═══ */}
            <TableBody>
              {paginatedTasks.length > 0 ? (
                paginatedTasks.map((task: any, idx: number) => (
                  <TableRow
                    key={task.id}
                    className={cn(
                      "group border-0 transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                      "hover:bg-blue-50/50"
                    )}
                  >
                    <TableCell className={cn(
                      "sticky left-0 z-20 border-r border-b border-slate-200 text-center py-1.5",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                      "group-hover:bg-blue-50/50",
                    )}>
                      <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                        {((currentPage - 1) * rowsPerPage) + idx + 1}
                      </span>
                    </TableCell>

                    {interleavedColumns.map((col: any) => {
                      // ── Delta column ──
                      if (col.isDelta) {
                        const prevDate = parseDateSafeReport(task.stages?.[col.prevCol?.stageId]?.date || task.stages?.[col.prevCol?.stageId]?.completedAt);
                        const nextDate = parseDateSafeReport(task.stages?.[col.nextCol?.stageId]?.date || task.stages?.[col.nextCol?.stageId]?.completedAt);
                        const diff = prevDate && nextDate ? differenceInDays(nextDate, prevDate) : null;
                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-1 py-1.5 border-r border-b border-slate-100 text-center",
                              idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                              "group-hover:bg-blue-50/50"
                            )}
                          >
                            {diff !== null ? (
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
                                  <TooltipContent side="top" className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1.5 z-[9999]">
                                    {diff} day{Math.abs(diff) !== 1 ? "s" : ""} between stages
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-slate-200 text-sm">—</span>
                            )}
                          </TableCell>
                        );
                      }

                      const isSticky = stickyColumnIds.has(col.id);
                      const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                      const rawCellVal = renderCellValue(task, col);

                      let cellContent: React.ReactNode;

                      // ── Combined stage_info cell ──
                      if (rawCellVal && typeof rawCellVal === 'object' && rawCellVal.isCombinedStageDetails) {
                        if (rawCellVal.isApplicable === false) {
                          cellContent = (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 font-medium italic cursor-default pl-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                                    N/A
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-slate-800 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999]">
                                  Stage not applicable for this task's Job Level
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        } else {
                            const { hasDate, hasDocs, hasOfficer, docIsPending, stageDateRawProps, docNode, officerNode } = rawCellVal;

                            cellContent = (
                              <div className="flex items-center w-full min-h-[26px]">
                               {hasDate && (
                                 <div className={cn(
                                   "flex-1 flex items-center",
                                   (hasDocs || (hasOfficer && showOfficers)) && "pr-2 border-r border-slate-200 mr-2"
                                 )}>
                                   <ReportStageDateCell
                                     {...stageDateRawProps}
                                     showTime={showTime}
                                     onSaveStageDate={onSaveStageDate}
                                     deptId={activeDeptId}
                                   />
                                 </div>
                               )}
                               {hasDocs && (
                                 <div className={cn(
                                   "flex-1 flex items-center",
                                   (hasOfficer && showOfficers) && "pr-2 border-r border-slate-200 mr-2"
                                 )}>
                                    {docIsPending ? (
                                      <PendingUploadLink
                                        taskId={stageDateRawProps.taskId}
                                        stageId={stageDateRawProps.stageId}
                                        subdeptId={stageDateRawProps.subdeptId}
                                        deptId={stageDateRawProps.deptId}
                                      />
                                    ) : docNode}
                                  </div>
                                )}
                               {(hasOfficer && showOfficers) && (
                                 <div className="flex-1 flex items-center">
                                   {officerNode}
                                 </div>
                               )}
                             </div>
                           );
                        }
                      } else {
                        // ── Non-stage / task / N/A cell ──
                        const val = safeRender(rawCellVal);
                        const isMissing = React.isValidElement(val) && val.props?.className?.includes('text-rose-600');
                        const isPrimary = col.field === 'applicant_name' || col.field === 'company_name';
                        cellContent = isMissing ? val : <DataCell val={val} isMissing={val === 'N/A'} isPrimary={isPrimary} />;
                      }

                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-3 py-1.5 border-r border-b border-slate-200 transition-colors",
                            isSticky ? "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)] bg-inherit" : "",
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                            "group-hover:bg-blue-50/50",
                            col.id === firstStageColId && "border-l-[3px] border-l-amber-400"
                          )}
                          style={isSticky ? { left: `${left}px` } : undefined}
                        >
                          {cellContent}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={interleavedColumns.length + 1} className="h-64 bg-slate-50">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                        <SearchX size={24} className="text-slate-500" />
                      </div>
                      <p className="text-[14px] font-semibold text-slate-700">No records found</p>
                      <p className="text-sm mt-1 text-slate-500">Adjust your filters to see more results</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
        <div className="text-[11px] text-slate-600 font-semibold">
          Showing <span className="text-slate-600">{((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
          <span className="font-medium text-slate-600">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span> of{' '}
          <span className="font-medium text-slate-600">{allTasks.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-600 font-semibold">Rows:</span>
            <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[52px] h-8 rounded border-slate-200 text-[11px] font-medium text-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded">
                {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)} className="text-[11px]">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-0.5">
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft size={12} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft size={12} /></PaginationButton>
            <div className="px-2 py-1.5 text-[11px] font-medium text-slate-600 min-w-[24px] text-center">{currentPage}</div>
            <PaginationButton onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}><ChevronRight size={12} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight size={12} /></PaginationButton>
          </div>
        </div>
      </div>
    </div>
  );
}

const PaginationButton = ({ children, onClick, disabled }: any) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn(
      "h-6 w-6 rounded text-slate-600 transition-all",
      disabled ? "opacity-30 cursor-not-allowed" : "hover:text-slate-700 hover:bg-slate-100"
    )}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </Button>
);
