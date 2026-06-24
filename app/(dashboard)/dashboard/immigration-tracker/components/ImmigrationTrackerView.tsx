// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type ColumnSizingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpDown,
  SearchX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TRACKER_COLUMNS = [
  { id: "r_number", label: "R NUMBER", width: 120 },
  { id: "passport_number", label: "PASSPORT NUMBER", width: 160 },
  { id: "applicant_name", label: "APPLICANT FULL NAME", width: 220 },
  { id: "company_prefix", label: "COMPANY PREFIX", width: 160 },
  { id: "sub_department", label: "SUB DEPARTMENT", width: 140 },
  { id: "class", label: "CLASS", width: 140 },
  { id: "duration", label: "DURATION", width: 120 },
  { id: "renewal_status", label: "RENEWAL / NEW", width: 140 },
  { id: "current_stage_name", label: "CURRENT STAGE NAME", width: 200 },
  { id: "current_stage_follow_up", label: "CURRENT STAGE FOLLOW-UP", width: 200 },
  { id: "current_stage_officer", label: "CURRENT STAGE OFFICER", width: 180 },
  { id: "age_days", label: "AGE (DAYS)", width: 120 },
];

const STICKY_COLUMN_IDS = new Set(["r_number", "passport_number", "applicant_name"]);
const INDEX_COL_WIDTH = 56;

const FollowUpBadge = ({ value }: { value: string | null }) => {
  if (!value) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
        —
      </span>
    );
  }

  const lower = value.toLowerCase();
  const styles: Record<string, string> = {
    officer: "bg-blue-50 text-blue-700 border border-blue-200",
    client: "bg-amber-50 text-amber-700 border border-amber-200",
    bcl: "bg-violet-50 text-violet-700 border border-violet-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
        styles[lower] || "bg-slate-100 text-slate-600 border border-slate-200"
      )}
    >
      {value}
    </span>
  );
};

const OfficerBadge = ({ names }: { names: string[] }) => {
  if (!names || names.length === 0) {
    return (
      <span className="text-xs text-slate-400 italic">None assigned</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
        >
          <User className="h-3 w-3" />
          {name}
        </span>
      ))}
    </div>
  );
};

const DataCell = ({
  val,
  isMissing,
}: {
  val: React.ReactNode;
  isMissing: boolean;
}) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "block w-full truncate text-sm cursor-default leading-snug",
            isMissing
              ? "text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded-full text-xs"
              : "text-slate-600 font-medium"
          )}
        >
          {val}
        </div>
      </TooltipTrigger>
      {val && val !== "Missing" && (
        <TooltipContent
          side="top"
          className="max-w-sm bg-slate-800 text-white border-none shadow-xl text-sm rounded-lg px-3 py-2 z-[100] break-words"
        >
          {String(val)}
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

export function ImmigrationTrackerView({
  tasks,
  sortConfig,
  handleSort,
  currentPage,
  setCurrentPage,
  rowsPerPage,
  setRowsPerPage,
  getCellValue,
}: any) {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = INDEX_COL_WIDTH;
    TRACKER_COLUMNS.forEach((col) => {
      if (STICKY_COLUMN_IDS.has(col.id)) {
        offsets[col.id] = cursor;
        cursor += columnSizing[col.id] || col.width;
      }
    });
    return offsets;
  }, [columnSizing]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return tasks.slice(start, start + rowsPerPage);
  }, [tasks, currentPage, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(tasks.length / rowsPerPage));

  return (
    <div className="flex flex-col h-full antialiased pt-0 bg-slate-100">
      {/* Table Wrapper */}
      <div className="relative overflow-hidden border border-slate-200 rounded-lg shadow-sm bg-white">
        <div className="overflow-auto max-h-[calc(100vh-340px)] custom-scrollbar">
          <Table
            className="border-separate border-spacing-0 table-fixed"
            style={{ minWidth: "100%" }}
          >
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {TRACKER_COLUMNS.map((col) => (
                <col key={col.id} style={{ width: col.width }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              {/* Main Header Row — Dark Navy */}
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 bg-slate-800 border-r border-b border-slate-600 text-center py-3 px-2">
                  <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    #
                  </span>
                </TableHead>

                {TRACKER_COLUMNS.map((col) => {
                  const isSticky = STICKY_COLUMN_IDS.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "group relative border-r border-b border-slate-600 transition-colors cursor-pointer select-none px-4 py-3 bg-slate-800",
                        isSticky &&
                          "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && "bg-slate-700"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap",
                            isActive ? "text-white" : "text-slate-300"
                          )}
                        >
                          {col.label}
                        </span>
                        <ArrowUpDown
                          className={cn(
                            "h-3 w-3 shrink-0",
                            isActive
                              ? "text-white"
                              : "text-slate-500 opacity-0 group-hover:opacity-100"
                          )}
                        />
                      </div>
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-slate-400/30 transition-colors" />
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedTasks.length > 0 ? (
                paginatedTasks.map((task: any, idx: number) => {
                  const globalIdx = (currentPage - 1) * rowsPerPage + idx;
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
                      <TableCell
                        className={cn(
                          "sticky left-0 z-20 border-r border-b border-slate-200 text-center py-3",
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                          "group-hover:bg-blue-50/50"
                        )}
                      >
                        <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                          {globalIdx + 1}
                        </span>
                      </TableCell>

                      {/* Data Cells */}
                      {TRACKER_COLUMNS.map((col) => {
                        const isSticky = STICKY_COLUMN_IDS.has(col.id);
                        const left = isSticky
                          ? stickyColumnOffsets[col.id]
                          : undefined;

                        const val = getCellValue(task, col.id);
                        const isMissing =
                          typeof val === "string" &&
                          val.toLowerCase() === "missing";

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-3 border-r border-b border-slate-200 transition-colors max-w-0 overflow-hidden",
                              isSticky
                                ? "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)]"
                                : "",
                              idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                              "group-hover:bg-blue-50/50"
                            )}
                            style={
                              isSticky ? { left: `${left}px` } : undefined
                            }
                          >
                            {col.id === "current_stage_follow_up" ? (
                              <FollowUpBadge value={val} />
                            ) : col.id === "current_stage_officer" ? (
                              <OfficerBadge names={val || []} />
                            ) : col.id === "age_days" ? (
                              <span
                                className={cn(
                                  "text-sm font-semibold tabular-nums",
                                  typeof val === "number" && val > 30
                                    ? "text-red-600"
                                    : typeof val === "number" && val > 14
                                    ? "text-amber-600"
                                    : "text-slate-600"
                                )}
                              >
                                {typeof val === "number" ? `${val}d` : val || "—"}
                              </span>
                            ) : (
                              <DataCell val={val} isMissing={isMissing} />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={TRACKER_COLUMNS.length + 1}
                    className="h-64 bg-slate-50"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                        <SearchX size={24} className="text-slate-500" />
                      </div>
                      <p className="text-[14px] font-semibold text-slate-700">
                        No records found
                      </p>
                      <p className="text-sm mt-1 text-slate-500">
                        Adjust your filters to see more results
                      </p>
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
        <div className="text-[11px] text-slate-400">
          Showing{" "}
          <span className="font-medium text-slate-600">
            {(currentPage - 1) * rowsPerPage + 1}
          </span>{" "}
          to{" "}
          <span className="font-medium text-slate-600">
            {Math.min(currentPage * rowsPerPage, tasks.length)}
          </span>{" "}
          of{" "}
          <span className="font-medium text-slate-600">{tasks.length}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Rows:</span>
            <Select
              value={String(rowsPerPage)}
              onValueChange={(v) => {
                setRowsPerPage(Number(v));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[52px] h-7 rounded border-slate-200 text-[11px] font-medium text-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded">
                {[10, 25, 50, 100].map((s) => (
                  <SelectItem
                    key={s}
                    value={String(s)}
                    className="text-[11px]"
                  >
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-0.5">
            <PaginationButton
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft size={12} />
            </PaginationButton>
            <PaginationButton
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft size={12} />
            </PaginationButton>

            <div className="px-2 py-0.5 text-[11px] font-medium text-slate-600 min-w-[24px] text-center">
              {currentPage}
            </div>

            <PaginationButton
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight size={12} />
            </PaginationButton>
            <PaginationButton
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight size={12} />
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
    className={cn(
      "h-6 w-6 rounded text-slate-400 transition-all",
      disabled
        ? "opacity-30 cursor-not-allowed"
        : "hover:text-slate-700 hover:bg-slate-100"
    )}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </Button>
);
