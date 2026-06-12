"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, ArrowUpDown, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../../tasks/overall-view/tableUtils";

const DEFAULT_COL_WIDTH = 160;

const TAILWIND_PX: Record<string, number> = {
  'w-16': 64, 'w-20': 80, 'w-24': 96, 'w-28': 112, 'w-32': 128,
  'w-36': 144, 'w-40': 160, 'w-44': 176, 'w-48': 192, 'w-56': 224, 'w-64': 256,
};

const HEADER_WIDTHS = new Map(
  ENHANCED_TABLE_HEADERS_IMMIGRATION
    .filter(h => h.width)
    .map(h => [h.id, TAILWIND_PX[h.width!] ?? DEFAULT_COL_WIDTH])
);
const MIN_COL_WIDTH = 60;
const INDEX_COL_WIDTH = 48;

const colBucket = (type: string) => {
  if (type === 'current_stage_age' || type === 'total_process_age') return 'duration';
  if (type === 'task' || type === 'current_stage_officer') return 'task';
  if (type === 'reference_requirement') return 'reference';
  return 'stage';
};

const BUCKET = {
  task: {
    groupBg: 'bg-slate-100 text-slate-700 border-b border-slate-300',
    headBg: 'bg-blue-50 text-blue-700 border-b-2 border-blue-200',
    headHover: 'hover:bg-blue-100',
    subBg: 'bg-slate-50',
    bodyBg: '',
    bodyBgAlt: '',
  },
  reference: {
    groupBg: 'bg-emerald-50 text-emerald-800 border-b border-emerald-200',
    headBg: 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-200',
    headHover: 'hover:bg-emerald-100',
    subBg: 'bg-emerald-50/60',
    bodyBg: 'bg-emerald-50/30',
    bodyBgAlt: 'bg-emerald-50/50',
  },
  duration: {
    groupBg: 'bg-amber-50 text-amber-800 border-b border-amber-200',
    headBg: 'bg-amber-50 text-amber-700 border-b-2 border-amber-200',
    headHover: 'hover:bg-amber-100',
    subBg: 'bg-amber-50',
    bodyBg: 'bg-amber-50/50',
    bodyBgAlt: 'bg-amber-50/80',
  },
  stage: {
    groupBg: 'bg-slate-100 text-slate-700 border-b border-slate-300',
    headBg: 'bg-slate-100 text-slate-700 border-b-2 border-slate-300',
    headHover: 'hover:bg-slate-200',
    subBg: 'bg-slate-50/60',
    bodyBg: '',
    bodyBgAlt: '',
  },
};

const DataCell = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider delayDuration={400}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="truncate text-sm font-medium text-slate-700 w-full cursor-default">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs bg-slate-900 text-white border-none shadow-xl text-sm">
        {children}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export function StandardReportView({ allTasks, filteredColumns, columnGroups, sortConfig, expandedStageColumns, renderCellValue, safeRender, handleSort, toggleStageColumns, isStageApplicableToCurrentFilter, initialRowsPerPage = 25, userData = { officers: [], managers: [], assistants: [], allUsers: [] }, departments = [], stages = [] }: any) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const stickyColumnIds = new Set(['task_id', 'task_passport_number', 'task_applicant_name']);

  // Find the ID of the first stage column to apply a distinctive border
  const firstStageColumnId = useMemo(() => {
    return filteredColumns.find((c: any) => colBucket(c.type ?? 'stage') === 'stage')?.id;
  }, [filteredColumns]);

  const columnDefs = useMemo<ColumnDef<any>[]>(() => [
    {
      id: '__index__',
      size: INDEX_COL_WIDTH,
      minSize: INDEX_COL_WIDTH,
      maxSize: INDEX_COL_WIDTH,
      enableResizing: false,
      header: () => null,
      cell: () => null,
    },
    ...filteredColumns.map((col: any) => {
      const defaultSize = (col.type === 'task' && col.field && HEADER_WIDTHS.has(col.field))
        ? HEADER_WIDTHS.get(col.field)!
        : DEFAULT_COL_WIDTH;
      return {
        id: col.id,
        size: defaultSize,
        minSize: MIN_COL_WIDTH,
        maxSize: 600,
        enableResizing: true,
        header: () => null,
        cell: () => null,
      };
    }),
  ], [filteredColumns]);

  const table = useReactTable({
    data: [],
    columns: columnDefs,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
  });

  const getColWidth = (colId: string): number =>
    table.getColumn(colId)?.getSize() ?? DEFAULT_COL_WIDTH;

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

  const minutesToTimeString = (minutes: number | null) => {
    if (!minutes) return "—";
    const d = Math.floor(minutes / (60 * 24));
    const h = Math.floor((minutes % (60 * 24)) / 60);
    const m = minutes % 60;
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const headersByColId: Record<string, any> =
    (table.getHeaderGroups()[0]?.headers ?? []).reduce((acc: Record<string, any>, h) => {
      acc[h.id] = h;
      return acc;
    }, {});

  return (
    <div className="flex flex-col">
      <div className="relative overflow-hidden border border-slate-200 rounded-lg">
        <div className="overflow-auto max-h-[calc(100vh-228px)]">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {filteredColumns.map((col: any) => (
                <col key={col.id} style={{ width: getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40 shadow-[0_1px_2px_-1px_rgba(0,0,0,0.08)]">
              {/* PRIMARY HEADER */}
              <TableRow className="border-0">
                <TableHead
                  className="sticky left-0 z-50 bg-slate-200 border-r border-b border-slate-300 text-center text-slate-700 uppercase"
                  style={{ width: INDEX_COL_WIDTH }}
                >
                  <span className="text-[9px] font-semibold">#</span>
                </TableHead>
                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const isFirstStage = col.id === firstStageColumnId;
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isColFilterNA = col.stageId ? !isStageApplicableToCurrentFilter(col.stageId) : false;
                  const resizeHeader = headersByColId[col.id];
                  const bucket = colBucket(col.type ?? 'stage');
                  const b = BUCKET[bucket];
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "border-r border-slate-200 transition-colors cursor-pointer select-none",
                        b.headBg,
                        b.headHover,
                        isSticky && "z-40 sticky",
                        isFirstStage && "border-l-2 border-l-slate-300",
                        isColFilterNA && "opacity-60",
                        isActive && "ring-inset ring-2 ring-blue-300"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-semibold uppercase">
                          {col.label}
                        </span>
                        {col.hasSubColumns && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                            className="h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded bg-slate-300/50 hover:bg-slate-300 transition-colors"
                          >
                            {expandedStageColumns.has(col.stageId) ? <Minus size={8} /> : <Plus size={8} />}
                          </button>
                        )}
                        <ArrowUpDown className={cn(
                          "h-3 w-3 shrink-0 transition-opacity",
                          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                        )} />
                      </div>

                      {resizeHeader && (
                        <div
                          onMouseDown={(e) => { e.stopPropagation(); resizeHeader.getResizeHandler()(e); }}
                          onTouchStart={(e) => { e.stopPropagation(); resizeHeader.getResizeHandler()(e); }}
                          className={cn(
                            "absolute inset-y-0 right-0 w-1 cursor-col-resize select-none touch-none z-10",
                            resizeHeader.column.getIsResizing() ? "bg-slate-400" : "hover:bg-slate-300"
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* SECONDARY HEADER (DURATION/ESTIMATE) */}
              <TableRow className="border-0 h-6">
                <TableHead
                  className="sticky left-0 z-50 bg-slate-100 border-r border-b border-slate-200"
                  style={{ width: INDEX_COL_WIDTH }}
                />
                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const isFirstStage = col.id === firstStageColumnId;
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  
                  let content: React.ReactNode = null;
                  let extraClass = "bg-white text-slate-400";

                  if (col.type === 'stage_date' && col.stageId) {
                    const stage = stages.find((s: any) => s.id === col.stageId);
                    content = stage?.estimated_time
                      ? <span className="italic text-blue-600 font-bold tracking-tight">{minutesToTimeString(stage.estimated_time)}</span>
                      : <span className="text-slate-300">—</span>;
                    extraClass = 'bg-blue-50/50 text-blue-600'; 
                  } else if (col.type === 'stage_gap') {
                    content = <span className="font-bold text-amber-600 italic">Gap</span>;
                    extraClass = 'bg-amber-50/50';
                  } else if (col.type === 'current_stage_age' || col.type === 'total_process_age') {
                    content = <span className="text-amber-700 font-bold uppercase tracking-tighter">Dur</span>;
                    extraClass = 'bg-amber-50/50';
                  }

                  return (
                    <TableHead
                      key={`sub-${col.id}`}
                      className={cn(
                        "text-[9px] font-semibold text-center border-r border-b border-slate-200",
                        isSticky && "sticky z-40",
                        isFirstStage && "border-l-4 border-l-slate-200",
                        extraClass
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
              {paginatedTasks.length > 0 ? paginatedTasks.map((task: any, idx: number) => {
                const isEven = idx % 2 === 0;

                return (
                  <TableRow
                    key={task.id}
                    className={cn(
                      "group transition-colors",
                      isEven ? "bg-white" : "bg-slate-50/50",
                      "hover:bg-blue-50/40"
                    )}
                  >
                    <TableCell className={cn(
                      "sticky left-0 z-20 border-r border-b border-slate-200 text-center",
                      isEven ? "bg-white" : "bg-slate-50/50",
                      "group-hover:bg-blue-50/60"
                    )}>
                      <div className="flex items-center justify-center gap-1">
                        {(task.status === 'write_up_completed' || task.status === 'endorsed') && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                        {task.status === 'wip' && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                        {task.status === 'cancel' && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                        )}
                        <span className="text-[10px]">{(currentPage - 1) * rowsPerPage + idx + 1}</span>
                      </div>
                    </TableCell>

                    {filteredColumns.map((col: any) => {
                      const isSticky = stickyColumnIds.has(col.id);
                      const isFirstStage = col.id === firstStageColumnId;
                      const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                      const bucket = colBucket(col.type ?? 'stage');
                      const b = BUCKET[bucket];
                      const bucketBodyBg = isEven ? b.bodyBg : b.bodyBgAlt;

                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-2.5 py-1 border-b border-slate-100 transition-colors",
                            isFirstStage && "border-l border-l-slate-300/30",
                            isSticky
                              ? cn("sticky z-20 border-r border-slate-200", isEven ? "bg-white" : "bg-slate-50/50", "group-hover:bg-blue-50/60")
                              : bucketBodyBg
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
              }) : (
                <TableRow>
                  <TableCell colSpan={filteredColumns.length + 1} className="h-48 bg-slate-50/30">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <SearchX size={36} strokeWidth={1} className="mb-3 text-slate-300" />
                      <p className="text-sm font-semibold">No matching records</p>
                      <p className="text-[12px]">Adjust your filters to see results</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* PAGINATION FOOTER */}
      {allTasks.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-b-lg">
          <div className="flex items-center gap-6">
            <p className="text-[11px] text-slate-500">
              Showing <span className="text-slate-900 font-bold">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span> of <span className="text-slate-900 font-bold">{allTasks.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Rows</span>
              <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20 h-7 text-[11px] font-bold border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center border border-slate-200 rounded-md p-1 bg-slate-50">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
              <ChevronsLeft size={14} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
              <ChevronLeft size={14} />
            </Button>
            <div className="h-4 w-[1px] bg-slate-300 mx-1" />
            <span className="text-xs font-bold px-2 text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <div className="h-4 w-[1px] bg-slate-300 mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
              <ChevronsRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}