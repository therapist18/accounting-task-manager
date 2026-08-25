// @ts-nocheck
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, ArrowUpDown, ArrowLeftRight, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, FileText, Layers } from "lucide-react";
import { differenceInDays, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDateCell, formatEstimatedMins, renderReportCellContent } from "./reportCellRenderers";
import { getSubDepartmentDisplay } from "../../tasks/overall-view/tableUtils";

const DEFAULT_COL_WIDTH = 180;
const INDEX_COL_WIDTH = 56;

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseDateSafeReport = (s: string | null | undefined): Date | null => {
  if (!s || typeof s !== 'string') return null;
  // Match dd/mm/yyyy with an optional trailing " HH:mm" — captured explicitly so a time
  // suffix can never bleed into the year (e.g. "19/11/2025 16:12" used to reconstruct as
  // "2025 16:12-11-19", which JS's lenient Date parser silently mis-parsed to Jan 2025,
  // producing wildly wrong Δ values like -316d for what should have been +4d).
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh ? Number(hh) : 0, min ? Number(min) : 0);
    return isValid(d) ? d : null;
  }
  try { const d = new Date(s); return isValid(d) ? d : null; } catch { return null; }
};

// ── Main Component ────────────────────────────────────────────────────────────

export function StandardReportView({
  allTasks, filteredColumns: incomingFilteredColumns, sortConfig, expandedStageColumns,
  renderCellValue, safeRender, handleSort, toggleStageColumns,
  initialRowsPerPage = 25, showDelta = false, showOfficers = false,
  showTime = false, activeDeptId = '', onSaveStageDate, stages,
  reportDocDefaults = [], departments = [],
}: any) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const stickyColumnIds = new Set(['task_id', 'task_passport_number', 'task_applicant_name']);

  // A memorized report's own field order can put a non-sticky column between two sticky
  // ones (e.g. Job Description reordered ahead of Applicant Name) — the offset math below
  // only accounts for sticky columns' own accumulated widths, so a sticky column with a
  // non-sticky one interleaved before it would compute the wrong `left` px and detach from
  // its real position while scrolling. Sticky columns must always render contiguously at
  // the front, regardless of the report's stored order, for that math to stay correct.
  const filteredColumns = useMemo(() => {
    const sticky = incomingFilteredColumns.filter((c: any) => stickyColumnIds.has(c.id));
    const rest = incomingFilteredColumns.filter((c: any) => !stickyColumnIds.has(c.id));
    return [...sticky, ...rest];
  }, [incomingFilteredColumns]);

  // Resolve the same date value the stage cell actually renders (calculateStageDate +
  // immigration-date fallback, via renderCellValue), then run it through the same
  // formatter used on screen so Δ math always matches what the user sees, regardless
  // of the raw format the underlying date happened to be stored in.
  const getStageDisplayDateStr = (task: any, col: any): string | null => {
    if (!col || col.type !== 'stage_info') return null;
    const raw = renderCellValue(task, col);
    if (!raw || typeof raw !== 'object' || !raw.isCombinedStageDetails || raw.isApplicable === false) return null;
    const dateValue = raw.stageDateRawProps?.dateValue || raw.docDateValue || null;
    if (!dateValue) return null;
    return formatDateCell(dateValue, false);
  };

  const columnDefs = useMemo<ColumnDef<any>[]>(() => [
    { id: '__index__', size: INDEX_COL_WIDTH, enableResizing: false },
    ...filteredColumns.map((col: any) => ({
      id: col.id,
      size: DEFAULT_COL_WIDTH,
      minSize: 90,
      maxSize: 640,
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

  // Apply one column's current width to every column, so users don't have to resize each one by hand
  const applyWidthToAllColumns = (colId: string) => {
    const width = getColWidth(colId);
    setColumnSizing(prev => {
      const next = { ...prev };
      filteredColumns.forEach((c: any) => { next[c.id] = width; }); 
      return next;
    });
  };

  // Lookup of header objects (for resize handlers) by column id - cheap to rebuild each render
  const headerById: Record<string, any> = {};
  table.getHeaderGroups().forEach(hg => hg.headers.forEach(h => { headerById[h.id] = h; }));

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
    const priorStageCols: any[] = [];
    filteredColumns.forEach((col: any, i: number) => {
      result.push(col);
      if (col.type === 'stage_info') priorStageCols.push(col);
      const next = filteredColumns[i + 1];
      if (col.type === 'stage_info' && next?.type === 'stage_info') {
        // priorStageCols (this stage and everything before it) lets the delta cell reach
        // back past a pending/skipped predecessor to the nearest stage that actually has
        // a date, instead of just giving up with "—" whenever the immediate neighbour
        // hasn't happened yet.
        result.push({ id: `__delta__${i}`, isDelta: true, prevCol: col, nextCol: next, priorCols: [...priorStageCols], label: 'Δ', width: 62 });
      }
    });
    return result;
  }, [filteredColumns, showDelta]);

  const firstStageColId = useMemo(() => {
    const first = interleavedColumns.find((c: any) => !c.isDelta && c.type === 'stage_info');
    return first?.id || null;
  }, [interleavedColumns]);

  const firstReportDocColId = useMemo(() => {
    const first = interleavedColumns.find((c: any) => !c.isDelta && c.type === 'report_doc');
    return first?.id || null;
  }, [interleavedColumns]);

  // The two aggregate "Expected Time" / "Actual Time Taken" columns get their own
  // accent colour so they visually pop out from the stage columns they summarize.
  const isTotalTimeCol = (col: any) => col.type === 'total_time_expected' || col.type === 'total_time_actual';

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allTasks.slice(start, start + rowsPerPage);
  }, [allTasks, currentPage, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(allTasks.length / rowsPerPage));

  // Group paginated tasks by sub_department for section separators
  const subDeptGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const task of paginatedTasks) {
      const name = getSubDepartmentDisplay(task, departments);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(task);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === 'N/A') return 1;
        if (b === 'N/A') return -1;
        return a.localeCompare(b);
      })
      .map(([name, tasks]) => ({ name, tasks }));
  }, [paginatedTasks, departments]);

  const sectionedRows = useMemo(() => {
    const rows: ({ type: 'section'; name: string } | { type: 'task'; task: any; globalIdx: number })[] = [];
    let globalIdx = 0;
    for (const group of subDeptGroups) {
      rows.push({ type: 'section', name: group.name });
      for (const task of group.tasks) {
        rows.push({ type: 'task', task, globalIdx });
        globalIdx++;
      }
    }
    return rows;
  }, [subDeptGroups]);

  // Compute the start position for the section name (column 3 = after index + first sticky column)
  const col3Start = useMemo(() => {
    const stickyKeys = Object.keys(stickyColumnOffsets);
    return stickyKeys.length >= 2 ? stickyColumnOffsets[stickyKeys[1]] : INDEX_COL_WIDTH + DEFAULT_COL_WIDTH;
  }, [stickyColumnOffsets]);

  // A refresh (or filter/sort change) can shrink the result set out from under
  // whatever page the user was sitting on — snap back into range instead of
  // rendering a blank "page 5 of 2" table.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-2.5 px-2 bg-custom-blue">
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>

                {interleavedColumns.map((col: any) => {
                  if (col.isDelta) {
                    return (
                      <TableHead key={col.id} className="border-r border-b border-white/30 text-center px-1 py-2.5 bg-custom-blue" style={{ width: 62 }}>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-black text-amber-300/90 uppercase tracking-wide cursor-default bg-white/10 px-1.5 py-0.5 rounded">
                                Δ
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[200px]">
                              Days between stages
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                        "group relative border-r border-b border-white/30 transition-colors cursor-pointer select-none px-4 py-2",
                        col.type === 'report_doc' ? "bg-emerald-600 hover:bg-emerald-700"
                          : isTotalTimeCol(col) ? "bg-violet-600 hover:bg-violet-700"
                          : "bg-custom-blue hover:bg-slate-700",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && "bg-slate-700",
                        col.id === firstStageColId && "border-l-[3px] border-l-amber-400",
                        col.id === firstReportDocColId && "border-l-[4px] border-l-emerald-400",
                        col.id === '__expected_total_time__' && "border-l-[4px] border-l-violet-300"
                      )}
                      style={{
                        ...(isSticky ? { left: `${left}px` } : undefined),
                      }}
                    >
                      <div className="flex flex-col justify-center h-full gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <TooltipProvider delayDuration={500}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-white whitespace-normal break-words leading-snug">
                                  {col.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[260px] break-words">
                                {col.description || col.label}
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
                            <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-white/40 opacity-0 group-hover:opacity-100")} />
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
                        "border-r border-b border-slate-200 px-3 py-1 text-center",
                        col.type === 'report_doc' ? "bg-emerald-50" : isTotalTimeCol(col) ? "bg-violet-50" : "bg-blue-50",
                        isSticky && "sticky z-30 shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                        col.id === firstStageColId && "border-l-[3px] border-l-amber-200",
                        col.id === firstReportDocColId && "border-l-[4px] border-l-emerald-300",
                        col.id === '__expected_total_time__' && "border-l-[4px] border-l-violet-200"
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
              {sectionedRows.length > 0 ? (
                sectionedRows.map((item: any) => {
                  if (item.type === 'section') {
                    return (
                      <TableRow key={`section-${item.name}`} className="border-0 hover:bg-transparent">
                        <TableCell className="sticky left-0 z-30 border-r border-b-2 border-t border-slate-300 py-2.5 px-2 bg-slate-100/80 text-center" style={{ left: 0 }}>
                          <Layers className="h-3.5 w-3.5 text-slate-500 mx-auto shrink-0" />
                        </TableCell>
                        <TableCell
                          colSpan={interleavedColumns.length}
                          className="sticky left-0 z-30 px-4 py-2 border-b-2 border-t border-slate-300 bg-slate-100/80 shadow-[2px_0_4px_rgba(0,0,0,0.08)]"
                          style={{ left: `${col3Start}px` }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
                              {item.name === 'N/A' ? 'Unassigned' : item.name}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400 ml-1">
                              ({(() => { const g = subDeptGroups.find(g => g.name === item.name); return g ? g.tasks.length : 0; })()})
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const task = item.task;
                  const idx = item.globalIdx;
                  return (
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
                        const nextDate = parseDateSafeReport(getStageDisplayDateStr(task, col.nextCol));
                        // Only bother finding a start point once the "arrival" stage has actually
                        // happened. If the immediate predecessor is still pending/skipped (no date
                        // of its own yet), reach back through earlier stages to the nearest one that
                        // does have a date, rather than showing "—" just because one stage in the
                        // middle hasn't been dated — that would silently hide a real, known gap.
                        let prevDate: Date | null = null;
                        let bridgedFromCol: any = col.prevCol;
                        if (nextDate) {
                          for (let i = (col.priorCols?.length || 0) - 1; i >= 0; i--) {
                            const candidate = col.priorCols[i];
                            const d = parseDateSafeReport(getStageDisplayDateStr(task, candidate));
                            if (d) { prevDate = d; bridgedFromCol = candidate; break; }
                          }
                        }
                        const diff = prevDate && nextDate ? differenceInDays(nextDate, prevDate) : null;
                        const bridged = diff !== null && bridgedFromCol?.id !== col.prevCol?.id;
                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-1 py-1.5 border-r border-b border-slate-100 text-center border-l-[3px] border-l-amber-300/40",
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
                                      bridged ? "italic underline decoration-dotted" : "",
                                      diff < 0 ? "text-red-600" : diff > 30 ? "text-rose-500" : diff > 14 ? "text-amber-500" : "text-slate-500"
                                    )}>
                                      {diff >= 0 ? `+${diff}d` : `${diff}d`}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1.5 z-[9999]">
                                    {bridged
                                      ? `${diff} day${Math.abs(diff) !== 1 ? "s" : ""} since ${bridgedFromCol?.label} — ${col.prevCol?.label} has no date yet`
                                      : `${diff} day${Math.abs(diff) !== 1 ? "s" : ""} between stages`}
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
                      const cellContent = renderReportCellContent(task, col, {
                        renderCellValue, safeRender, showTime, showOfficers, activeDeptId, onSaveStageDate,
                      });

                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-3 py-1.5 border-r border-b border-slate-200 transition-colors",
                            isSticky ? "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)] bg-inherit" : "",
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                            col.type === 'report_doc' ? "bg-emerald-50/10 group-hover:bg-emerald-50/40"
                              : isTotalTimeCol(col) ? "bg-violet-50/50 group-hover:bg-violet-50/70"
                              : "group-hover:bg-blue-50/50",
                            col.id === firstStageColId && "border-l-[3px] border-l-amber-400",
                            col.id === firstReportDocColId && "border-l-[4px] border-l-emerald-400 bg-emerald-50/20 group-hover:bg-emerald-50/50",
                            col.id === '__expected_total_time__' && "border-l-[4px] border-l-violet-300"
                          )}
                          style={isSticky ? { left: `${left}px` } : undefined}
                        >
                          {cellContent}
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