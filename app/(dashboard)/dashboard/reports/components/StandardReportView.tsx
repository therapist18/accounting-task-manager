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

// --- Simplified Theming (Matching Image's uniform dark header) ---
// We retain the function in case you need logical separation later, 
// but visually they now share the clean, uniform SaaS aesthetic.
const colBucket = (type: string) => {
  if (type === 'current_stage_age' || type === 'total_process_age') return 'duration';
  if (type === 'reference_requirement') return 'reference';
  if (type === 'task' || type === 'current_stage_officer') return 'task';
  return 'stage';
};

// ─── Main Data Table View ─────────────────────────────────────────────────────

const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 80;
const INDEX_COL_WIDTH = 56;

// Reusable DataCell with built-in truncation and tooltip
const DataCell = ({ val, isMissing }: { val: React.ReactNode, isMissing: boolean }) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "block w-full truncate text-sm cursor-default leading-snug",
          isMissing ? "text-red-500 font-semibold" : "text-slate-700 font-medium"
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

  // Column definitions for Tanstack Table sizing logic
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
    <div className="flex flex-col bg-white/20 h-full antialiased p-8 pt-0">
      {/* Table Wrapper (No top border so it naturally connects to the active tab above it) */}
      <div className="relative overflow-hidden border border-slate-200 border-t-blue-600 rounded-b-md rounded-tr-md shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-280px)] custom-scrollbar bg-white/20">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {filteredColumns.map((col: any) => (
                <col key={col.id} style={{ width: getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              {/* Main Header Row */}
              <TableRow className="hover:bg-transparent border-0">
                {/* Index Header */}
                <TableHead className="sticky left-0 z-50 bg-[#2f394e] border-r border-slate-600/50 text-center py-4 px-2">
                  <span className="text-xs font-black text-slate-300 uppercase tracking-widest">#</span>
                </TableHead>

                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "group relative border-r border-slate-600/50 transition-colors cursor-pointer select-none px-4 py-4 bg-[#2f394e]",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.1)]",
                        isActive && "bg-[#252d3e]"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black uppercase tracking-widest text-slate-100 whitespace-nowrap">
                          {col.label}
                        </span>

                        <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            {col.hasSubColumns && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                                    className="h-4 w-4 shrink-0 flex items-center justify-center rounded bg-slate-600/50 hover:bg-slate-500 text-white transition-all"
                                >
                                    {expandedStageColumns.has(col.stageId) ? <Minus size={10} strokeWidth={2.5} /> : <Plus size={10} strokeWidth={2.5} />}
                                </button>
                            )}
                            <ArrowUpDown className={cn(
                                "h-3 w-3 shrink-0 text-slate-300",
                                isActive ? "text-blue-400 opacity-100" : "opacity-0 group-hover:opacity-100"
                            )} />
                        </div>
                      </div>

                      {/* Resize Handle */}
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors" />
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* Sub-Header Row: Estimates / Duration / Types */}
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 bg-[#38435a] border-r border-slate-600/50 h-7" />
                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;

                  let content: React.ReactNode = null;
                  
                  // Calculate display content for the sub-header based on column type
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
                        "text-[9px] font-bold uppercase tracking-widest text-center border-r border-slate-600/50 px-2 h-7 bg-[#38435a] text-slate-400",
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
                      className="group border-0 hover:bg-blue-50/30 transition-colors bg-white"
                    >
                      {/* Index Cell */}
                      <TableCell className={cn(
                        "sticky left-0 z-20 border-r border-b border-slate-100 text-center py-3 bg-white group-hover:bg-blue-50/40",
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

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-3 border-r border-b border-slate-100 transition-colors max-w-0 overflow-hidden",
                              isSticky ? "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)] bg-white group-hover:bg-blue-50/40" : "bg-white group-hover:bg-blue-50/30"
                            )}
                            style={isSticky ? { left: `${left}px` } : undefined}
                          >
                            <DataCell val={val} isMissing={isMissing} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={filteredColumns.length + 1} className="h-64 bg-slate-50/50">
                    <div className="flex flex-col items-center justify-center ">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <SearchX size={24} className="text-slate-400" />
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
      <div className="flex items-center justify-between py-4">
        {/* Left Stats Info */}
        <div className="text-sm text-slate-500 font-medium">
            Showing <span className="font-semibold text-slate-700">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span> of <span className="font-semibold text-slate-700">{allTasks.length}</span> entries
        </div>
        
        {/* Right Controls */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Rows:</span>
            <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[70px] h-8 rounded-md border-slate-200 bg-white/20 text-sm font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)} className="text-sm">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
              <ChevronsLeft size={14} />
            </PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
              <ChevronLeft size={14} />
            </PaginationButton>
            
            <div className="px-3 py-1 rounded-md text-sm font-semibold text-slate-700 min-w-[32px] text-center bg-blue-50 border border-blue-200 mx-1">
              {currentPage}
            </div>

            <PaginationButton onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
              <ChevronRight size={14} />
            </PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
              <ChevronsRight size={14} />
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
        variant="outline" 
        size="icon" 
        className={cn(
          "h-8 w-8 rounded-md border-slate-200 bg-white/20 text-slate-600 transition-all shadow-sm",
          disabled ? "opacity-40 cursor-not-allowed bg-slate-50 shadow-none" : "hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
        )} 
        onClick={onClick} 
        disabled={disabled}
    >
        {children}
    </Button>
);