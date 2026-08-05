// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowLeftRight, Layers, AlertTriangle } from "lucide-react";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDateCell, formatEstimatedMins } from "../../reports/components/reportCellRenderers";
import { parseDateSafe } from "../../reports/utils/reportStageLogic";
import { getSubDepartmentDisplay, getCompanyPrefixFromParticipants } from "../../tasks/overall-view/tableUtils";
import { SUMMARY_COLUMNS, DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS } from "../stageColumnConfig";

const DEFAULT_COL_WIDTH = 170;
const INDEX_COL_WIDTH = 48;
const DELTA_COL_WIDTH = 62;

const resolveMilestoneDate = (task: any, stageId: string): string | null => {
  const stageData = task?.stages?.[stageId];
  return stageData?.date || stageData?.completedAt || null;
};

const getSponsorName = (task: any): string | null => {
  const sponsor = task?.participants_details?.find((p: any) =>
    (Array.isArray(p.role) && p.role.includes('sponsor')) || p.role === 'sponsor'
  );
  return sponsor?.name || null;
};

const resolveFieldValue = (colId: string, task: any, companies: Map<number, any>, enhancedTasksData: Map<string, any>): any => {
  const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
  switch (colId) {
    case 'company': return companies.get(task.company_id)?.name || task.company_name || null;
    case 'applicant': return task.applicant_name || null;
    case 'job_description': return task.job_description || null;
    case 'company_prefix': {
      const v = getCompanyPrefixFromParticipants(task, companies);
      return v && v !== 'N/A' ? v : null;
    }
    case 'sponsor_name': return getSponsorName(task);
    case 'application_type': return enhancedTask.renewal_status || task.renewal_status || null;
    case 'duration': return enhancedTask.duration || task.duration || null;
    default: return null;
  }
};

// Mirrors reportCellRenderers.tsx's "Overdue actual time" cell (red text + exceeded badge).
const ActualTimeCell = ({ display, exceededMinutes }: { display: string; exceededMinutes: number }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-default select-none">
          <span className="text-sm font-bold text-red-600 tabular-nums">{display}</span>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 rounded px-1 py-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            {formatEstimatedMins(exceededMinutes)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-red-50 border-red-200 text-red-900 text-xs shadow-lg rounded-lg px-3 py-2 z-[9999]">
        <p className="font-bold">Exceeds Expected Time</p>
        <p>Over by {formatEstimatedMins(exceededMinutes)}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const PaginationButton = ({ children, onClick, disabled }: any) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn("h-6 w-6 rounded text-slate-600 transition-all", disabled ? "opacity-30 cursor-not-allowed" : "hover:text-slate-700 hover:bg-slate-100")}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </Button>
);

export function SummaryTable({
  tasks, companies, departments = [],
  showTime = false, showDelta = false,
  sortConfig, handleSort,
  enhancedTasksData,
  getExpectedMinutesForTask, getActualTimeInfoForTask,
  visibleColumnIds = DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS,
}: {
  tasks: any[];
  companies: Map<number, { name: string; prefix: string }>;
  departments?: any[];
  showTime?: boolean;
  showDelta?: boolean;
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  handleSort?: (columnId: string) => void;
  enhancedTasksData?: Map<string, any>;
  getExpectedMinutesForTask?: (task: any) => number;
  getActualTimeInfoForTask?: (task: any) => { diffDays: number; isOverdue: boolean; exceededMinutes: number } | null;
  visibleColumnIds?: string[];
}) {
  const columns = useMemo(() => SUMMARY_COLUMNS.filter(c => visibleColumnIds.includes(c.id)), [visibleColumnIds]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  // ── Column sizing (tanstack react-table, resizable columns) ──
  const columnDefs = useMemo<ColumnDef<any>[]>(() => [
    { id: '__index__', size: INDEX_COL_WIDTH, enableResizing: false },
    ...columns.map((col: any) => ({ id: col.id, size: DEFAULT_COL_WIDTH, minSize: 90, maxSize: 640 })),
  ], [columns]);

  const table = useReactTable({
    data: [],
    columns: columnDefs,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
  });

  const getColWidth = (colId: string): number => table.getColumn(colId)?.getSize() ?? DEFAULT_COL_WIDTH;

  const applyWidthToAllColumns = (colId: string) => {
    const width = getColWidth(colId);
    setColumnSizing(prev => {
      const next = { ...prev };
      columns.forEach((c: any) => { next[c.id] = width; });
      return next;
    });
  };

  const headerById: Record<string, any> = {};
  table.getHeaderGroups().forEach(hg => hg.headers.forEach(h => { headerById[h.id] = h; }));

  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = INDEX_COL_WIDTH;
    columns.forEach((col: any) => {
      if (col.sticky) {
        offsets[col.id] = cursor;
        cursor += columnSizing[col.id] ?? DEFAULT_COL_WIDTH;
      }
    });
    return offsets;
  }, [columns, columnSizing]);

  // ── Δ columns between consecutive milestone columns ──
  const interleavedColumns = useMemo(() => {
    if (!showDelta) return columns;
    const result: any[] = [];
    const priorMilestoneCols: any[] = [];
    columns.forEach((col: any, i: number) => {
      result.push(col);
      if (col.type === 'milestone') priorMilestoneCols.push(col);
      const next = columns[i + 1];
      if (col.type === 'milestone' && next?.type === 'milestone') {
        result.push({ id: `__delta__${i}`, isDelta: true, prevCol: col, nextCol: next, priorCols: [...priorMilestoneCols], label: 'Δ' });
      }
    });
    return result;
  }, [columns, showDelta]);

  const firstHighlightId = useMemo(() => columns.find(c => c.highlight)?.id, [columns]);

  const rows = useMemo(() => tasks.map(task => {
    const milestoneDates: Record<string, string | null> = {};
    const milestoneDateObjs: Record<string, Date | null> = {};
    columns.forEach(col => {
      if (col.type !== 'milestone') return;
      const raw = resolveMilestoneDate(task, col.milestone.stageId);
      milestoneDates[col.milestone.key] = raw;
      milestoneDateObjs[col.milestone.key] = raw ? parseDateSafe(raw) : null;
    });
    return { task, milestoneDates, milestoneDateObjs };
  }), [tasks, columns]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, currentPage, rowsPerPage]);

  // ── Subdepartment section grouping (current page only, mirrors StandardReportView) ──
  const subDeptGroups = useMemo(() => {
    const map = new Map<string, typeof paginatedRows>();
    for (const row of paginatedRows) {
      const name = getSubDepartmentDisplay(row.task, departments);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(row);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a === 'N/A' ? 1 : b === 'N/A' ? -1 : a.localeCompare(b)))
      .map(([name, groupRows]) => ({ name, rows: groupRows }));
  }, [paginatedRows, departments]);

  const sectionedRows = useMemo(() => {
    const result: ({ type: 'section'; name: string; count: number } | { type: 'row'; row: any; globalIdx: number })[] = [];
    let globalIdx = 0;
    for (const group of subDeptGroups) {
      result.push({ type: 'section', name: group.name, count: group.rows.length });
      for (const row of group.rows) { result.push({ type: 'row', row, globalIdx }); globalIdx++; }
    }
    return result;
  }, [subDeptGroups]);

  const resolveCellValue = (col: any, task: any): React.ReactNode => {
    if (col.type === 'field') return resolveFieldValue(col.id, task, companies, enhancedTasksData);
    if (col.type === 'computed_time') {
      if (col.id === 'planned_execution') {
        const minutes = getExpectedMinutesForTask?.(task) ?? 0;
        return minutes > 0 ? formatEstimatedMins(minutes) : null;
      }
      if (col.id === 'actual_execution') {
        const info = getActualTimeInfoForTask?.(task);
        if (!info) return null;
        const display = `${info.diffDays}d`;
        return info.isOverdue ? <ActualTimeCell display={display} exceededMinutes={info.exceededMinutes} /> : display;
      }
    }
    return null;
  };

  return (
    <div className="flex flex-col flex-1 antialiased bg-slate-50 px-6 pb-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-sm mt-3">
        <div className="overflow-auto max-h-[calc(100vh-360px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {interleavedColumns.map((col: any) => (
                <col key={col.id} style={{ width: col.isDelta ? DELTA_COL_WIDTH : getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-2.5 px-2 bg-custom-blue">
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>

                {interleavedColumns.map((col: any) => {
                  if (col.isDelta) {
                    return (
                      <TableHead key={col.id} className="border-r border-b border-white/30 text-center px-1 py-2.5 bg-custom-blue" style={{ width: DELTA_COL_WIDTH }}>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-black text-amber-300/90 uppercase tracking-wide cursor-default bg-white/10 px-1.5 py-0.5 rounded">Δ</span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[200px]">
                              Days between milestones
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    );
                  }

                  const isSticky = !!col.sticky;
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort?.(col.id)}
                      className={cn(
                        "group relative border-r border-b border-white/30 transition-colors select-none px-4 py-2.5",
                        handleSort && "cursor-pointer",
                        col.highlight ? "bg-amber-500 hover:bg-amber-600" : col.type === 'computed_time' ? "bg-violet-600 hover:bg-violet-700" : "bg-custom-blue hover:bg-slate-700",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && !col.highlight && col.type !== 'computed_time' && "bg-slate-700",
                        col.id === firstHighlightId && "border-l-[3px] border-l-amber-300"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <TooltipProvider delayDuration={500}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-white whitespace-normal break-words leading-snug">
                                {col.label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[260px] break-words">
                              {col.milestone?.description || col.label}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <div className="flex items-center gap-1.5">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); applyWidthToAllColumns(col.id); }}
                                  className="h-4 w-4 shrink-0 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <ArrowLeftRight size={10} strokeWidth={2.5} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999]">
                                Apply this column's width to all columns
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {handleSort && <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-white/40 opacity-0 group-hover:opacity-100")} />}
                        </div>
                      </div>

                      <div
                        onMouseDown={(e) => { e.stopPropagation(); headerById[col.id]?.getResizeHandler()(e); }}
                        onTouchStart={(e) => { e.stopPropagation(); headerById[col.id]?.getResizeHandler()(e); }}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none select-none transition-colors",
                          headerById[col.id]?.column.getIsResizing() ? "bg-blue-300" : "hover:bg-white/30"
                        )}
                      />
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {sectionedRows.length > 0 ? (
                sectionedRows.map((item) => {
                  if (item.type === 'section') {
                    return (
                      <TableRow key={`section-${item.name}`} className="border-0 hover:bg-transparent">
                        <TableCell className="sticky left-0 z-30 border-r border-b-2 border-t border-slate-300 py-2.5 px-2 bg-slate-100/80 text-center">
                          <Layers className="h-3.5 w-3.5 text-slate-500 mx-auto shrink-0" />
                        </TableCell>
                        <TableCell colSpan={interleavedColumns.length} className="px-4 py-2 border-b-2 border-t border-slate-300 bg-slate-100/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
                              {item.name === 'N/A' ? 'Unassigned' : item.name}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400 ml-1">({item.count})</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const { task, milestoneDates, milestoneDateObjs } = item.row;
                  const idx = item.globalIdx;

                  return (
                    <TableRow key={task.id} className={cn("group border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-100/50", "hover:bg-blue-50/50")}>
                      <TableCell className={cn("sticky left-0 z-20 border-r border-b border-slate-200 text-center py-2.5", idx % 2 === 0 ? "bg-white" : "bg-slate-100/50", "group-hover:bg-blue-50/50")}>
                        <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                          {((currentPage - 1) * rowsPerPage) + idx + 1}
                        </span>
                      </TableCell>

                      {interleavedColumns.map((col: any) => {
                        // ── Δ cell ──
                        if (col.isDelta) {
                          const nextDate = milestoneDateObjs[col.nextCol.milestone.key];
                          let prevDate: Date | null = null;
                          let bridgedFromCol: any = col.prevCol;
                          if (nextDate) {
                            for (let i = col.priorCols.length - 1; i >= 0; i--) {
                              const candidate = col.priorCols[i];
                              const d = milestoneDateObjs[candidate.milestone.key];
                              if (d) { prevDate = d; bridgedFromCol = candidate; break; }
                            }
                          }
                          const diff = prevDate && nextDate ? differenceInDays(nextDate, prevDate) : null;
                          const bridged = diff !== null && bridgedFromCol?.id !== col.prevCol?.id;
                          return (
                            <TableCell
                              key={col.id}
                              className={cn(
                                "px-1 py-2.5 border-r border-b border-slate-100 text-center border-l-[3px] border-l-amber-300/40",
                                idx % 2 === 0 ? "bg-white" : "bg-slate-100/50",
                                "group-hover:bg-blue-50/50"
                              )}
                            >
                              {diff !== null ? (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className={cn(
                                        "text-sm font-bold tabular-nums cursor-default",
                                        bridged && "italic underline decoration-dotted",
                                        diff < 0 ? "text-red-600" : diff > 30 ? "text-rose-500" : diff > 14 ? "text-amber-500" : "text-slate-500"
                                      )}>
                                        {diff >= 0 ? `+${diff}d` : `${diff}d`}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1.5 z-[9999]">
                                      {bridged
                                        ? `${diff} day${Math.abs(diff) !== 1 ? "s" : ""} since ${bridgedFromCol?.label} — ${col.prevCol?.label} has no date yet`
                                        : `${diff} day${Math.abs(diff) !== 1 ? "s" : ""} between milestones`}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-slate-200 text-sm">—</span>
                              )}
                            </TableCell>
                          );
                        }

                        const isSticky = !!col.sticky;
                        const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                        const value: React.ReactNode = col.type === 'milestone'
                          ? formatDateCell(milestoneDates[col.milestone.key], showTime)
                          : resolveCellValue(col, task);
                        const isEmpty = value === null || value === undefined || value === '—';

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-2.5 border-r border-b border-slate-200 text-sm max-w-0 overflow-hidden whitespace-nowrap text-ellipsis transition-colors",
                              isSticky && "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)] bg-inherit",
                              col.highlight ? "bg-amber-50/40 group-hover:bg-amber-50/70 text-amber-800 font-medium"
                                : col.type === 'computed_time' ? "bg-violet-50/40 group-hover:bg-violet-50/60"
                                : "group-hover:bg-blue-50/50",
                              col.primary ? "text-slate-900 font-semibold" : (!col.highlight && col.type !== 'computed_time') && "text-slate-600",
                              col.id === firstHighlightId && "border-l-[3px] border-l-amber-300"
                            )}
                            style={isSticky ? { left: `${left}px` } : undefined}
                          >
                            {isEmpty ? <span className="text-slate-300">—</span> : value}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={interleavedColumns.length + 1} className="h-64 bg-slate-50">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                        <SearchX size={24} className="text-slate-500" />
                      </div>
                      <p className="text-[14px] font-semibold text-slate-700">No tasks found</p>
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
          Showing <span className="text-slate-600">{rows.length === 0 ? 0 : ((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
          <span className="font-medium text-slate-600">{Math.min(currentPage * rowsPerPage, rows.length)}</span> of{' '}
          <span className="font-medium text-slate-600">{rows.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-600 font-semibold">Rows:</span>
            <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[64px] h-8 rounded border-slate-200 text-[11px] font-medium text-slate-600">
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
