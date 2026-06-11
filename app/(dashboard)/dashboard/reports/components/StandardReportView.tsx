"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Minus, ArrowUpDown, SearchX, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 60;
const INDEX_COL_WIDTH = 48;

// Column-type → visual accent bucket
const colBucket = (type: string) => {
  if (type === 'current_stage_age' || type === 'total_process_age') return 'duration';
  if (type === 'task' || type === 'current_stage_officer') return 'task';
  if (type === 'reference_requirement') return 'reference';
  return 'stage'; // stage_date, stage_officers, extracted_field, stage_gap
};

const BUCKET = {
  task: {
    groupBg: 'bg-slate-100 text-slate-700 border-b border-slate-300',
    headBg: 'bg-blue-700',
    headHover: 'hover:bg-blue-800',
    subBg: 'bg-slate-50',
    bodyBg: '',
    bodyBgAlt: '',
  },
  reference: {
    groupBg: 'bg-emerald-50 text-emerald-800 border-b border-emerald-200',
    headBg: 'bg-emerald-700',
    headHover: 'hover:bg-emerald-800',
    subBg: 'bg-emerald-50/60',
    bodyBg: 'bg-emerald-50/30',
    bodyBgAlt: 'bg-emerald-50/50',
  },
  duration: {
    groupBg: 'bg-amber-50 text-amber-800 border-b border-amber-200',
    headBg: 'bg-amber-500',
    headHover: 'hover:bg-amber-600',
    subBg: 'bg-amber-50',
    bodyBg: 'bg-amber-50/50',
    bodyBgAlt: 'bg-amber-50/80',
  },
  stage: {
    groupBg: 'bg-violet-50 text-violet-800 border-b border-violet-200',
    headBg: 'bg-violet-600',
    headHover: 'hover:bg-violet-700',
    subBg: 'bg-violet-50/60',
    bodyBg: 'bg-violet-50/20',
    bodyBgAlt: 'bg-violet-50/40',
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

export function StandardReportView({
  allTasks,
  filteredColumns,
  columnGroups,
  sortConfig,
  expandedStageColumns,
  renderCellValue,
  safeRender,
  handleSort,
  toggleStageColumns,
  isStageApplicableToCurrentFilter,
  initialRowsPerPage = 25,
  userData = { officers: [], managers: [], assistants: [], allUsers: [] },
  departments = [],
  stages = []
}: any) {

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const stickyColumnIds = new Set(['task_applicant_name', 'task_job_level', 'task_renewal_new']);

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
    ...filteredColumns.map((col: any) => ({
      id: col.id,
      size: DEFAULT_COL_WIDTH,
      minSize: MIN_COL_WIDTH,
      maxSize: 600,
      enableResizing: true,
      header: () => null,
      cell: () => null,
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
    <div className="flex flex-col gap-3">
      {/* Table wrapper */}
      <div className="relative rounded-xl overflow-hidden border border-slate-300 shadow-[0_2px_16px_0_rgba(30,41,59,0.10)]">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <Table
            className="border-separate border-spacing-0 table-fixed"
            style={{ width: table.getTotalSize(), minWidth: '100%' }}
          >
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {filteredColumns.map((col: any) => (
                <col key={col.id} style={{ width: getColWidth(col.id) }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">

              {/* ── ROW 1: GROUP HEADERS ── */}
              <TableRow className="border-0">
                <TableHead
                  className="sticky left-0 z-50 bg-slate-200 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-b border-slate-300"
                  style={{ width: INDEX_COL_WIDTH }}
                >
                  #
                </TableHead>
                {columnGroups.map((group: any, i: number) => {
                  const bucket = group.id === 'reference_requirements' ? 'reference'
                    : group.id === 'time_tracking' ? 'duration'
                    : group.id === 'task_info' ? 'task'
                    : 'stage';
                  const b = BUCKET[bucket];
                  const isNA = !group.applicable;

                  return (
                    <TableHead
                      key={i}
                      colSpan={group.span}
                      className={cn(
                        "text-center py-2 text-[11px] font-extrabold tracking-widest uppercase border-r transition-colors",
                        b.groupBg,
                        isNA && "opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-center gap-2 px-2">
                        {group.label}
                        {isNA && (
                          <Badge variant="outline" className="text-[9px] border-current opacity-80 px-1 py-0">
                            N/A
                          </Badge>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* ── ROW 2: COLUMN NAMES + RESIZE HANDLES ── */}
              <TableRow className="border-0">
                <TableHead
                  className="sticky left-0 z-50 bg-blue-700 border-r border-b border-blue-800 text-center font-black text-[10px] text-blue-100 uppercase tracking-widest"
                  style={{ width: INDEX_COL_WIDTH }}
                >
                  IDX
                </TableHead>
                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
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
                        "group relative px-3 py-2.5 border-r border-b cursor-pointer transition-all select-none",
                        "border-white/10",
                        b.headBg,
                        b.headHover,
                        isSticky && "z-40 sticky",
                        isColFilterNA && "opacity-60",
                        isActive && "ring-inset ring-2 ring-white/30"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      <div className="flex items-start justify-between gap-1 h-full min-h-[44px] pr-1">
                        <div className="flex items-start gap-1.5 leading-tight min-w-0">
                          <span className={cn(
                            "text-[11px] font-bold whitespace-normal break-words leading-snug",
                            isActive ? "text-white" : "text-white/90"
                          )}>
                            {col.label}
                          </span>
                          {col.hasSubColumns && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                              className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center rounded bg-white/15 hover:bg-white/25 text-white transition-colors"
                            >
                              {expandedStageColumns.has(col.stageId) ? <Minus size={9} /> : <Plus size={9} />}
                            </button>
                          )}
                        </div>
                        <ArrowUpDown className={cn(
                          "h-3 w-3 shrink-0 mt-0.5 transition-opacity",
                          isActive ? "text-white opacity-100" : "text-white/30 opacity-0 group-hover:opacity-100"
                        )} />
                      </div>

                      {/* Resize handle */}
                      {resizeHeader && (
                        <div
                          onMouseDown={(e) => { e.stopPropagation(); resizeHeader.getResizeHandler()(e); }}
                          onTouchStart={(e) => { e.stopPropagation(); resizeHeader.getResizeHandler()(e); }}
                          className={cn(
                            "absolute inset-y-0 right-0 w-1 cursor-col-resize select-none touch-none z-10 transition-colors",
                            "bg-transparent hover:bg-white/40",
                            resizeHeader.column.getIsResizing() && "bg-white/60"
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* ── ROW 3: ESTIMATE / SUB-HEADER ── */}
              <TableRow className="border-0">
                <TableHead
                  className="sticky left-0 z-50 bg-slate-100 border-r border-b border-slate-200"
                  style={{ width: INDEX_COL_WIDTH }}
                />
                {filteredColumns.map((col: any) => {
                  const isSticky = stickyColumnIds.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const bucket = colBucket(col.type ?? 'stage');
                  const b = BUCKET[bucket];

                  let content: React.ReactNode = null;
                  let extraClass = b.subBg;

                  if (col.type === 'stage_date' && col.stageId) {
                    const stage = stages.find((s: any) => s.id === col.stageId);
                    content = stage?.estimated_time
                      ? <span className="italic text-indigo-600 font-semibold">{minutesToTimeString(stage.estimated_time)}</span>
                      : <span className="text-slate-400">—</span>;
                    extraClass = 'bg-indigo-50/60';
                  } else if (col.type === 'stage_gap') {
                    content = <span className="font-bold text-amber-700 italic">Gap</span>;
                    extraClass = 'bg-amber-50';
                  } else if (col.type === 'current_stage_age' || col.type === 'total_process_age') {
                    content = <span className="text-amber-700 font-semibold text-[10px]">Duration</span>;
                  }

                  return (
                    <TableHead
                      key={`sub-${col.id}`}
                      className={cn(
                        "px-3 py-1 text-[10px] font-semibold text-center border-r border-b-2 border-slate-300",
                        isSticky && "sticky z-40",
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
                      isEven ? "bg-white" : "bg-slate-50/70",
                      "hover:bg-blue-50/60"
                    )}
                  >
                    {/* Index */}
                    <TableCell className={cn(
                      "sticky left-0 z-20 border-r border-b border-slate-200 text-center text-xs font-bold text-slate-400",
                      isEven ? "bg-white" : "bg-slate-50/70",
                      "group-hover:bg-blue-50/60 transition-colors"
                    )}>
                      {(currentPage - 1) * rowsPerPage + idx + 1}
                    </TableCell>

                    {filteredColumns.map((col: any) => {
                      const isSticky = stickyColumnIds.has(col.id);
                      const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                      const bucket = colBucket(col.type ?? 'stage');
                      const b = BUCKET[bucket];
                      const bucketBodyBg = isEven ? b.bodyBg : b.bodyBgAlt;

                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-3 py-2 border-r border-b border-slate-200 transition-colors",
                            isSticky
                              ? cn("sticky z-20", isEven ? "bg-white" : "bg-slate-50/70", "group-hover:bg-blue-50/60")
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
                  <TableCell colSpan={filteredColumns.length + 1} className="h-64 bg-slate-50/30">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <SearchX size={48} strokeWidth={1} className="mb-4 text-slate-300" />
                      <p className="text-lg font-semibold">No matching records</p>
                      <p className="text-sm">Adjust your filters to see results</p>
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
        <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-6">
            <p className="text-xs text-slate-500">
              Showing{" "}
              <span className="text-slate-900 font-bold">{((currentPage - 1) * rowsPerPage) + 1}</span>
              {" "}to{" "}
              <span className="text-slate-900 font-bold">{Math.min(currentPage * rowsPerPage, allTasks.length)}</span>
              {" "}of{" "}
              <span className="text-slate-900 font-bold">{allTasks.length}</span>{" "}results
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Per Page</span>
              <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20 h-8 text-xs font-bold border-slate-200 focus:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s} Rows</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border border-slate-200 rounded-lg p-1 bg-slate-50 mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                <ChevronsLeft size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                <ChevronLeft size={14} />
              </Button>
              <div className="h-4 w-[1px] bg-slate-300 mx-2" />
              <span className="text-xs font-bold px-2 text-slate-700">
                Page {currentPage} <span className="text-slate-400 font-normal">of</span> {totalPages}
              </span>
              <div className="h-4 w-[1px] bg-slate-300 mx-2" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
                <ChevronRight size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                <ChevronsRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
