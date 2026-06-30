// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, ArrowUpDown, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock } from "lucide-react";
import { differenceInDays, isValid, format } from "date-fns";
import { cn } from "@/lib/utils";

const DEFAULT_COL_WIDTH = 180;
const INDEX_COL_WIDTH = 56;

const DataCell = ({ val, isMissing, isPrimary }: { val: React.ReactNode, isMissing: boolean, isPrimary?: boolean }) => (
  <TooltipProvider delayDuration={300}>
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
        <TooltipContent side="top" className="max-w-sm bg-slate-800 text-white border-none shadow-xl text-sm rounded-lg px-3 py-2 z-[100] break-words">
          {val}
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

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

const formatEstimatedMins = (minutes: number): string => {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const d = Math.floor(h / 24);
  return d >= 1 ? `~${d}d` : `~${h}h`;
};


export function StandardReportView({
  allTasks, filteredColumns, sortConfig, expandedStageColumns,
  renderCellValue, safeRender, handleSort, toggleStageColumns,
  initialRowsPerPage = 25, stages = [], showDelta = false, showOfficers = false,
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
      if (col.type === 'stage_date' && next?.type === 'stage_date') {
        result.push({ id: `__delta__${i}`, isDelta: true, prevCol: col, nextCol: next, label: 'Δ', width: 60 });
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
                <col key={col.id} style={{ width: col.isDelta ? 60 : getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-3 px-2" style={{ background: "#376bae" }}>
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>

                {interleavedColumns.map((col: any) => {
                  if (col.isDelta) {
                    return (
                      <TableHead key={col.id} className="border-r border-b border-white/30 text-center px-1 py-3" style={{ background: "#376bae", width: 60 }}>
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
                        "group relative border-r border-b border-white/30 transition-colors cursor-pointer select-none px-4 py-2",
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
                                  <span className={cn("text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-white truncate")}>
                                    {col.label}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[200] max-w-[260px] break-words">
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
                              <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-slate-500 opacity-0 group-hover:opacity-100")} />
                            </div>
                         </div>
                         
                         {col.type === 'stage_details' && (
                           <div className="flex items-center w-full text-[9px] font-bold text-white/70 uppercase tracking-widest mt-0.5">
                              {col.fields?.length > 0 && (
                                <div className={cn("flex-1 text-left", col.hasOfficer && showOfficers && "border-r border-white/30 pr-2")}>
                                  Docs
                                </div>
                              )}
                              {(col.hasOfficer && showOfficers) && (
                                <div className="flex-1 text-left pl-2">
                                  Officer
                                </div>
                              )}
                           </div>
                         )}
                      </div>
                      
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-slate-400/30 transition-colors" />
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* ═══ EST. TIME SUB-ROW ═══ */}
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-30 border-r border-b border-slate-200 py-1.5 text-center bg-blue-50">
                  <Clock className="h-3 w-3 text-blue-400 mx-auto" />
                </TableHead>
                {interleavedColumns.map((col: any) => {
                  if (col.isDelta) {
                    return <TableHead key={col.id} className="border-r border-b border-slate-200 px-1 py-1.5 bg-blue-50" />;
                  }
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;

                  let content: React.ReactNode = null;
                  if (col.type === 'stage_date' && col.stageId) {
                    const stage = stages?.find((s: any) => s.id === col.stageId);
                    if (stage?.estimated_time) {
                      content = (
                        <span className="text-sm font-bold text-blue-600 italic whitespace-nowrap">
                          {formatEstimatedMins(stage.estimated_time)}
                        </span>
                      );
                    }
                  }

                  return (
                    <TableHead
                      key={`sub-${col.id}`}
                      className={cn(
                        "text-[9px] font-medium uppercase tracking-wider text-center border-r border-b border-slate-200 px-2 py-1.5 bg-blue-50 text-slate-500",
                        isSticky && "sticky z-40 shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                        col.id === firstStageColId && "border-l-[3px] border-l-amber-400"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      {col.type === 'task' && col.id === 'task_task_id' && (
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest whitespace-nowrap">Est. Time →</span>
                      )}
                      {content}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedTasks.length > 0 ? (
                paginatedTasks.map((task: any, idx: number) => {
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
                        "sticky left-0 z-20 border-r border-b border-slate-200 text-center py-3",
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                        "group-hover:bg-blue-50/50",
                      )}>
                        <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                          {((currentPage - 1) * rowsPerPage) + idx + 1}
                        </span>
                      </TableCell>

                      {interleavedColumns.map((col: any) => {
                        if (col.isDelta) {
                          const prevDate = parseDateSafeReport(task.stages?.[col.prevCol?.stageId]?.date || task.stages?.[col.prevCol?.stageId]?.completedAt);
                          const nextDate = parseDateSafeReport(task.stages?.[col.nextCol?.stageId]?.date || task.stages?.[col.nextCol?.stageId]?.completedAt);
                          const diff = prevDate && nextDate ? differenceInDays(nextDate, prevDate) : null;
                          return (
                            <TableCell
                              key={col.id}
                              className={cn(
                                "px-1 py-3 border-r border-b border-slate-100 text-center",
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
                                    <TooltipContent side="top" className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1.5 z-[100]">
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

                        let cellContent;
                        if (rawCellVal && typeof rawCellVal === 'object' && rawCellVal.isCombinedStageDetails) {
                            cellContent = (
                                <div className="flex items-stretch w-full min-h-full py-1">
                                    {rawCellVal.hasDocs && (
                                        <div className={cn("flex-1 overflow-hidden", (rawCellVal.hasOfficer && showOfficers) && "pr-2 border-r border-slate-200 mr-2")}>
                                           {rawCellVal.docNode}
                                        </div>
                                    )}
                                    {(rawCellVal.hasOfficer && showOfficers) && (
                                        <div className="flex-1 overflow-hidden">
                                           {rawCellVal.officerNode}
                                        </div>
                                    )}
                                    {(!rawCellVal.hasDocs && rawCellVal.hasOfficer && !showOfficers) && (
                                        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400 italic">
                                            Hidden
                                        </div>
                                    )}
                                </div>
                            );
                        } else {
                            const val = safeRender(rawCellVal);
                            const isMissing = typeof val === 'string' && (val.toLowerCase() === 'n/a' || val === 'N/A');
                            const isPrimary = col.field === 'applicant_name' || col.field === 'company_name';

                            cellContent = (col.type === 'stage_date' || col.type === 'stage_officer' || col.type === 'stage_doc_fields') ? (
                              val
                            ) : (
                              <DataCell val={val} isMissing={isMissing} isPrimary={isPrimary} />
                            );
                        }

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-3 border-r border-b border-slate-200 transition-colors max-w-0 overflow-hidden",
                              isSticky ? "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)]" : "",
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
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={interleavedColumns.length + 1} className="h-64 bg-slate-50">
                    <div className="flex flex-col items-center justify-center ">
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

      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
        <div className="text-[11px] text-slate-600 font-semibold">
          Showing <span className="text-slate-600">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="font-medium text-slate-600">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span> of <span className="font-medium text-slate-600">{allTasks.length}</span>
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