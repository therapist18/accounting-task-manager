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

const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 80;
const INDEX_COL_WIDTH = 56;

// --- Theming Buckets ---
const BUCKET = {
  task: {
    headBg: 'bg-blue-700 text-white',
    subHeadBg: 'bg-blue-800 text-blue-300',
    bodyBg: 'bg-white',
    accent: 'border-blue-500'
  },
  reference: {
    headBg: 'bg-blue-700 text-white',
    subHeadBg: 'bg-blue-800 text-blue-300',
    bodyBg: 'bg-emerald-50/20',
    accent: 'border-emerald-500'
  },
  duration: {
    headBg: 'bg-amber-600 text-white',
    subHeadBg: 'bg-amber-700 text-amber-200',
    bodyBg: 'bg-amber-50/10',
    accent: 'border-amber-400'
  },
  stage: {
    headBg: 'bg-indigo-700 text-white',
    subHeadBg: 'bg-indigo-800 text-indigo-300',
    bodyBg: 'bg-indigo-50/10',
    accent: 'border-indigo-400'
  },
};

const colBucket = (type: string) => {
  if (type === 'current_stage_age' || type === 'total_process_age') return 'duration';
  if (type === 'reference_requirement') return 'reference';
  if (type === 'task' || type === 'current_stage_officer') return 'task';
  return 'stage';
};

const DataCell = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider delayDuration={400}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="truncate text-sm font-medium text-slate-700 w-full cursor-default leading-relaxed">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2">
        {children}
      </TooltipContent>
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
    <div className="flex flex-col bg-white h-full antialiased">
      <div className="relative overflow-hidden border border-slate-200">
        <div className="overflow-auto max-h-[calc(100vh-220px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {filteredColumns.map((col: any) => (
                <col key={col.id} style={{ width: getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 bg-blue-700 border-r border-b border-blue-800 text-center">
                  <span className="text-xs font-black text-white uppercase tracking-wide">#</span>
                </TableHead>
                {(() => {
                  const firstStageIdx = filteredColumns.findIndex((c: any) => colBucket(c.type ?? 'stage') === 'stage');
                  return filteredColumns.map((col: any, colIdx: number) => {
                    const isSticky = stickyColumnIds.has(col.id);
                    const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                    const bucket = colBucket(col.type ?? 'stage');
                    const b = BUCKET[bucket];
                    const isActive = sortConfig?.key === col.id;
                    const isFirstStage = colIdx === firstStageIdx;

                    return (
                      <TableHead
                        key={col.id}
                        onClick={() => handleSort(col.id)}
                        className={cn(
                          "group relative border-r border-b border-white/10 transition-colors cursor-pointer select-none px-4 py-4",
                          b.headBg,
                          isSticky && "z-40 sticky shadow-[2px_0_5px_-2px_rgba(0,0,0,0.2)]",
                          isActive && "brightness-110",
                          isFirstStage && "border-l-[3px] border-l-amber-400"
                        )}
                        style={isSticky ? { left: `${left}px` } : undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-white whitespace-nowrap">
                            {col.label}
                          </span>

                          <div className="flex items-center gap-1.5">
                              {col.hasSubColumns && (
                                  <button
                                      onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                                      className="h-5 w-5 shrink-0 flex items-center justify-center rounded-md bg-white/20 border border-white/20 hover:bg-white/30 transition-all"
                                  >
                                      {expandedStageColumns.has(col.stageId) ? <Minus size={10} strokeWidth={3} /> : <Plus size={10} strokeWidth={3} />}
                                  </button>
                              )}
                              <ArrowUpDown className={cn(
                                  "h-3 w-3 shrink-0 transition-opacity text-white",
                                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                              )} />
                          </div>
                        </div>

                        {/* Resize Handle */}
                        <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-white/40 transition-colors" />
                      </TableHead>
                    );
                  });
                })()}
              </TableRow>

              {/* Sub-Header: Estimates/Types */}
              <TableRow className="hover:bg-transparent border-0 h-4">
                <TableHead className="sticky left-0 z-50 bg-blue-800 border-r border-b border-blue-900" />
                {(() => {
                  const firstStageIdx = filteredColumns.findIndex((c: any) => colBucket(c.type ?? 'stage') === 'stage');
                  return filteredColumns.map((col: any, colIdx: number) => {
                    const isSticky = stickyColumnIds.has(col.id);
                    const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                    const bucket = colBucket(col.type ?? 'stage');
                    const b = BUCKET[bucket];
                    const isFirstStage = colIdx === firstStageIdx;

                    let content: React.ReactNode = null;
                    if (col.type === 'stage_date' && col.stageId) {
                      const stage = stages.find((s: any) => s.id === col.stageId);
                      content = stage?.estimated_time ? `${Math.floor(stage.estimated_time / 60)}h ${stage.estimated_time % 60}m` : 'No TAT';
                    } else if (col.type === 'stage_gap') {
                      content = "Wait Gap";
                    }

                    return (
                      <TableHead
                        key={`sub-${col.id}`}
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest text-center border-r border-b border-white/10 px-2",
                          b.subHeadBg,
                          isSticky && "sticky z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]",
                          isFirstStage && "border-l-[3px] border-l-amber-400"
                        )}
                        style={isSticky ? { left: `${left}px` } : undefined}
                      >
                        {content}
                      </TableHead>
                    );
                  });
                })()}
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedTasks.length > 0 ? (() => {
                const firstStageIdx = filteredColumns.findIndex((c: any) => colBucket(c.type ?? 'stage') === 'stage');
                return paginatedTasks.map((task: any, idx: number) => {
                  const isEven = idx % 2 === 0;

                  return (
                    <TableRow
                      key={task.id}
                      className="group border-0 hover:bg-blue-50/30 transition-colors"
                    >
                      <TableCell className={cn(
                        "sticky left-0 z-20 border-r border-b border-slate-100 text-center py-3",
                        isEven ? "bg-white" : "bg-slate-50/40",
                        "group-hover:bg-blue-50/50"
                      )}>
                        <span className="group-hover:text-blue-600 transition-colors">
                          {((currentPage - 1) * rowsPerPage) + idx + 1}
                        </span>
                      </TableCell>

                      {filteredColumns.map((col: any, colIdx: number) => {
                        const isSticky = stickyColumnIds.has(col.id);
                        const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                        const bucket = colBucket(col.type ?? 'stage');
                        const b = BUCKET[bucket];
                        const isFirstStage = colIdx === firstStageIdx;

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-2.5 border-r border-b border-slate-100 transition-colors",
                              isSticky
                                ? cn("sticky z-20 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]", isEven ? "bg-white" : "bg-slate-50/40", "group-hover:bg-blue-50/50")
                                : b.bodyBg,
                              isFirstStage && "border-l-[3px] border-l-amber-400"
                            )}
                            style={isSticky ? { left: `${left}px` } : undefined}
                          >
                            <DataCell>
                              {safeRender(renderCellValue(task, col))}
                            </DataCell>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                });
              })() : (
                <TableRow>
                  <TableCell colSpan={filteredColumns.length + 1} className="h-64 bg-slate-50/20">
                    <div className="flex flex-col items-center justify-center ">
                      <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                        <SearchX size={32} className="text-slate-300" />
                      </div>
                      <p className="text-[15px] font-bold text-slate-900">No records found</p>
                      <p className="text-sm mt-1">Try adjusting your filters or search query</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <div className="flex items-center gap-8">
            <div className="flex flex-col">
                <span className="text-sm font-bold  uppercase tracking-widest mb-0.5">Showing Range</span>
                <p className="text-sm text-slate-600 font-medium">
                    <span className="text-slate-900 font-bold">{((currentPage - 1) * rowsPerPage) + 1}</span>
                    <span className="mx-1 opacity-40">-</span>
                    <span className="text-slate-900 font-bold">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span>
                    <span className="mx-2 text-slate-300">of</span>
                    <span className="text-blue-600 font-black">{allTasks.length}</span>
                </p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold  uppercase tracking-widest">Page Size</span>
              <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20 h-9 rounded-xl border-slate-200 bg-white font-bold text-sm shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)} className="text-xs font-medium">{s} per page</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
              <ChevronsLeft size={16} />
            </PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
              <ChevronLeft size={16} />
            </PaginationButton>
            
            <div className="px-4 text-sm font-bold text-slate-900 min-w-[80px] text-center">
              {currentPage} <span className="mx-1 text-slate-300 font-normal">/</span> {totalPages}
            </div>

            <PaginationButton onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
              <ChevronRight size={16} />
            </PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
              <ChevronsRight size={16} />
            </PaginationButton>
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
        className="h-8 w-8 rounded-lg  hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30" 
        onClick={onClick} 
        disabled={disabled}
    >
        {children}
    </Button>
);