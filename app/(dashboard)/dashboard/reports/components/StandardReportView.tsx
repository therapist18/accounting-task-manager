// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, ArrowUpDown, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

const colBucket = (type: string) => {
  if (type === 'current_stage_age' || type === 'total_process_age') return 'duration';
  if (type === 'reference_requirement') return 'reference';
  if (type === 'task' || type === 'current_stage_officer') return 'task';
  return 'stage';
};

const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 80;
const INDEX_COL_WIDTH = 56;

const DataCell = ({ val, isMissing, isPrimary }: { val: React.ReactNode, isMissing: boolean, isPrimary?: boolean }) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "block w-full truncate text-sm cursor-default leading-snug",
          isMissing
            ? "text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded-full text-xs"
            : isPrimary
              ? "text-slate-900 font-semibold"
              : "text-slate-500 font-medium"
        )}>
          {val}
        </div>
      </TooltipTrigger>
      {val && val !== 'Missing' && (
        <TooltipContent side="top" className="max-w-sm bg-slate-800 text-white border-none shadow-xl text-sm rounded-lg px-3 py-2 z-[100] break-words">
          {val}
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

export function StandardReportView({
  allTasks, filteredColumns, sortConfig, expandedStageColumns,
  renderCellValue, safeRender, handleSort, toggleStageColumns,
  isStageApplicableToCurrentFilter, initialRowsPerPage = 25,
  stages = []
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

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allTasks.slice(start, start + rowsPerPage);
  }, [allTasks, currentPage, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(allTasks.length / rowsPerPage));

  return (
    <div className="flex flex-col h-full antialiased pt-0 bg-white">
      {/* Table Wrapper: white card with subtle border */}
      <div className="relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-360px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {filteredColumns.map((col: any) => (
                <col key={col.id} style={{ width: getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              {/* Main Header Row — Dark Navy */}
              <TableRow className="hover:bg-transparent border-0">
                {/* Index Header */}
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-3 px-2" style={{ background: "#376bae" }}>
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>

                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;
                  const isCentered = col.field === 'class' || col.field === 'duration' || col.type === 'current_stage_age' || col.type === 'total_process_age';

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "group relative border-r border-b border-white/30 transition-colors cursor-pointer select-none px-4 py-3",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && "bg-slate-700",
                        isCentered && "text-center",
                      )}
                      style={{
                        background: "#376bae",
                        ...(isSticky ? { left: `${left}px` } : undefined),
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-white")}>
                          {col.label}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {col.hasSubColumns && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                              className="h-4 w-4 shrink-0 flex items-center justify-center rounded bg-slate-600 hover:bg-slate-500 text-white transition-all"
                            >
                              {expandedStageColumns.has(col.stageId) ? <Minus size={10} strokeWidth={2.5} /> : <Plus size={10} strokeWidth={2.5} />}
                            </button>
                          )}
                          <ArrowUpDown className={cn(
                            "h-3 w-3 shrink-0",
                            isActive ? "text-white" : "text-slate-500 opacity-0 group-hover:opacity-100"
                          )} />
                        </div>
                      </div>

                      {/* Resize Handle */}
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-slate-400/30 transition-colors" />
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* Sub-Header Row: Estimates / Duration / Types */}
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-50 bg-slate-700 border-r border-b border-slate-600 h-6" />
                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;

                  let content: React.ReactNode = null;

                  if (col.type === 'stage_date' && col.stageId) {
                    const stage = stages?.find((s: any) => s.id === col.stageId);
                    if (stage?.estimated_time) {
                      const hours = Math.floor(stage.estimated_time / 60);
                      const mins = stage.estimated_time % 60;
                      content = `${hours}h ${mins}m`;
                    } else {
                      content = 'No TAT';
                    }
                  } else if (col.type === 'stage_gap') {
                    content = "Wait Gap";
                  }

                  return (
                    <TableHead
                      key={`sub-${col.id}`}
                      className={cn(
                        "text-[9px] font-medium uppercase tracking-wider text-center border-r border-b border-slate-600 px-2 h-6 bg-slate-700 text-slate-400",
                        isSticky && "sticky z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
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
                        "hover:bg-blue-50/40"
                      )}
                    >
                      {/* Index Cell */}
                      <TableCell className={cn(
                        "sticky left-0 z-20 border-r border-b border-slate-200 text-center py-3",
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                        "group-hover:bg-blue-50/50",
                      )}>
                        <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                          {((currentPage - 1) * rowsPerPage) + idx + 1}
                        </span>
                      </TableCell>

                      {/* Data Cells */}
                      {filteredColumns.map((col: any) => {
                        const isSticky = stickyColumnIds.has(col.id);
                        const left = isSticky ? stickyColumnOffsets[col.id] : undefined;

                        const val = safeRender(renderCellValue(task, col));
                        const isMissing = typeof val === 'string' && val.toLowerCase() === 'missing';

                        // Primary columns: applicant name, company name
                        // Secondary columns: passport, R number, duration, class
                        const isPrimary = col.field === 'applicant_name' || col.field === 'company_name';
                        const isCentered = col.field === 'class' || col.field === 'duration' || col.type === 'current_stage_age' || col.type === 'total_process_age';

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-3 border-r border-b border-slate-200 transition-colors max-w-0 overflow-hidden",
                              isSticky ? "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)]" : "",
                              idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                              "group-hover:bg-blue-50/50",
                              isCentered && "text-center"
                            )}
                            style={isSticky ? { left: `${left}px` } : undefined}
                          >
                            <DataCell val={val} isMissing={isMissing} isPrimary={isPrimary} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={filteredColumns.length + 1} className="h-64 bg-slate-50">
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

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
        {/* Left Stats Info */}
        <div className="text-[11px] text-slate-600 font-semibold">
          Showing <span className="text-slate-600">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="font-medium text-slate-600">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span> of <span className="font-medium text-slate-600">{allTasks.length}</span>
        </div>

        {/* Right Controls */}
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
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
              <ChevronsLeft size={12} />
            </PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
              <ChevronLeft size={12} />
            </PaginationButton>

            <div className="px-2 py-1.5 text-[11px] font-medium text-slate-600 min-w-[24px] text-center">
              {currentPage}
            </div>

            <PaginationButton onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
              <ChevronRight size={12} />
            </PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
              <ChevronsRight size={12} />
            </PaginationButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cleaned up pagination button to match SaaS standard
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