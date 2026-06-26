// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
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
  Check,
  Calendar,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parse, isValid } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

const STICKY_COLUMN_IDS = new Set(["r_number", "passport_number", "applicant_name"]);
const INDEX_COL_WIDTH = 56;

const FIXED_COLUMNS = [
  { id: "r_number", label: "R NUMBER", width: 120 },
  { id: "passport_number", label: "PASSPORT NUMBER", width: 160 },
  { id: "applicant_name", label: "APPLICANT FULL NAME", width: 220 },
];

const formatDateForDisplay = (dateStr: string | null): string => {
  if (!dateStr) return "—";
  // Handle dd/MM/yyyy format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  // Handle ISO format
  try {
    const d = new Date(dateStr);
    if (isValid(d)) return format(d, "dd/MM/yyyy");
  } catch {}
  return dateStr;
};

const StageDateCell = ({
  task,
  stage,
  getStageDate,
  getStageStatus,
  onSaveStageDate,
}: {
  task: any;
  stage: any;
  getStageDate: (task: any, stageId: string) => string | null;
  getStageStatus: (task: any, stageId: string) => "completed" | "pending" | "missing";
  onSaveStageDate: (taskId: string, stageId: string, date: string) => Promise<void>;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const dateValue = getStageDate(task, stage.id);
  const status = getStageStatus(task, stage.id);
  const hasDate = !!dateValue;

  const handleSave = async () => {
    if (!selectedDate) return;
    setIsSaving(true);
    try {
      const dateStr = format(selectedDate, "dd/MM/yyyy");
      await onSaveStageDate(task.id, stage.id, dateStr);
      setIsEditing(false);
      setSelectedDate(undefined);
    } finally {
      setIsSaving(false);
    }
  };

  // For stages with date input (manual entry stages)
  if (stage.hasDateInput) {
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs border-blue-300 bg-blue-50"
              >
                <Calendar className="h-3 w-3 mr-1" />
                {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <button
            onClick={handleSave}
            disabled={!selectedDate || isSaving}
            className={cn(
              "h-6 w-6 rounded flex items-center justify-center transition-all",
              selectedDate
                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => { setIsEditing(false); setSelectedDate(undefined); }}
            className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        {hasDate ? (
          <span className="text-sm text-slate-700 font-medium">
            {formatDateForDisplay(dateValue)}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">No date</span>
        )}
        <button
          onClick={() => setIsEditing(true)}
          className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // For regular stages (read-only, from database)
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {hasDate ? (
              <>
                <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm text-slate-700 font-medium">
                  {formatDateForDisplay(dateValue)}
                </span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
                <span className="text-sm text-slate-400">Pending</span>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-800 text-white border-none text-xs">
          {hasDate ? `${stage.label}: Completed on ${formatDateForDisplay(dateValue)}` : `${stage.label}: Not yet completed`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export function ImmigrationTrackerView({
  tasks,
  stageColumns,
  sortConfig,
  handleSort,
  currentPage,
  setCurrentPage,
  rowsPerPage,
  setRowsPerPage,
  getStageDate,
  getStageStatus,
  onSaveStageDate,
  companies,
}: any) {
  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = INDEX_COL_WIDTH;
    FIXED_COLUMNS.forEach((col) => {
      if (STICKY_COLUMN_IDS.has(col.id)) {
        offsets[col.id] = cursor;
        cursor += col.width;
      }
    });
    return offsets;
  }, []);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return tasks.slice(start, start + rowsPerPage);
  }, [tasks, currentPage, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(tasks.length / rowsPerPage));

  return (
    <div className="flex flex-col h-full antialiased pt-0 bg-slate-100">
      {/* Table Wrapper */}
      <div className="relative overflow-hidden border border-slate-200 rounded-lg shadow-sm bg-white">
        <div className="overflow-auto max-h-[calc(100vh-380px)] custom-scrollbar">
          <Table
            className="border-separate border-spacing-0 table-fixed"
            style={{ minWidth: "100%" }}
          >
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {FIXED_COLUMNS.map((col) => (
                <col key={col.id} style={{ width: col.width }} />
              ))}
              {stageColumns.map((col) => (
                <col key={col.id} style={{ width: 160 }} />
              ))}
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              {/* Main Header Row — Custom Blue */}
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-blue-200 text-center py-3 px-2" style={{ backgroundColor: '#376bae' }}>
                  <span className="text-[10px] font-semibold text-blue-100 uppercase tracking-wider">
                    #
                  </span>
                </TableHead>

                {FIXED_COLUMNS.map((col) => {
                  const isSticky = STICKY_COLUMN_IDS.has(col.id);
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className={cn(
                        "group relative border-r border-b border-blue-200 transition-colors cursor-pointer select-none px-4 py-3",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && "bg-blue-600"
                      )}
                      style={{ ...isSticky ? { left: `${left}px` } : undefined, backgroundColor: isActive ? undefined : '#376bae' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap",
                            isActive ? "text-white" : "text-blue-100"
                          )}
                        >
                          {col.label}
                        </span>
                        <ArrowUpDown
                          className={cn(
                            "h-3 w-3 shrink-0",
                            isActive
                              ? "text-white"
                              : "text-blue-300 opacity-0 group-hover:opacity-100"
                          )}
                        />
                      </div>
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-blue-400/30 transition-colors" />
                    </TableHead>
                  );
                })}

                {/* Stage Columns */}
                {stageColumns.map((stage) => {
                  const isActive = sortConfig?.key === stage.id;
                  return (
                    <TableHead
                      key={stage.id}
                      onClick={() => handleSort(stage.id)}
                      className={cn(
                        "group relative border-r border-b border-blue-200 transition-colors cursor-pointer select-none px-3 py-3",
                        isActive && "bg-blue-600"
                      )}
                      style={{ backgroundColor: isActive ? undefined : '#376bae' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap leading-tight",
                            isActive ? "text-white" : "text-blue-100"
                          )}
                        >
                          {stage.label}
                        </span>
                        <ArrowUpDown
                          className={cn(
                            "h-3 w-3 shrink-0",
                            isActive
                              ? "text-white"
                              : "text-blue-300 opacity-0 group-hover:opacity-100"
                          )}
                        />
                      </div>
                      {stage.hasDateInput && (
                        <span className="text-[8px] text-amber-300 font-medium uppercase tracking-wider mt-0.5 block">
                          Manual Entry
                        </span>
                      )}
                      <div className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-blue-400/30 transition-colors" />
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
                        "hover:bg-blue-50/50"
                      )}
                    >
                      {/* Index Cell */}
                      <TableCell
                        className={cn(
                          "sticky left-0 z-20 border-r border-b border-slate-200 text-center py-3",
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                          "group-hover:bg-blue-50/60"
                        )}
                      >
                        <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                          {globalIdx + 1}
                        </span>
                      </TableCell>

                      {/* Fixed Columns */}
                      {FIXED_COLUMNS.map((col) => {
                        const isSticky = STICKY_COLUMN_IDS.has(col.id);
                        const left = isSticky ? stickyColumnOffsets[col.id] : undefined;

                        let val = "";
                        switch (col.id) {
                          case "r_number":
                            val = task.applicant_data?.r_number || task.r_number || "—";
                            break;
                          case "passport_number":
                            val = task.passport_number || "—";
                            break;
                          case "applicant_name":
                            val = task.applicant_name || "—";
                            break;
                        }

                        const isMissing =
                          typeof val === "string" && val.toLowerCase() === "missing";

                        return (
                          <TableCell
                            key={col.id}
                          className={cn(
                            "px-4 py-3 border-r border-b border-slate-200 transition-colors max-w-0 overflow-hidden",
                            isSticky && "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                            "group-hover:bg-blue-50/60"
                          )}
                            style={isSticky ? { left: `${left}px` } : undefined}
                          >
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
                                {val && val !== "—" && (
                                  <TooltipContent
                                    side="top"
                                    className="max-w-sm bg-slate-800 text-white border-none shadow-xl text-sm rounded-lg px-3 py-2 z-[100] break-words"
                                  >
                                    {String(val)}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        );
                      })}

                      {/* Stage Columns */}
                      {stageColumns.map((stage) => {
                        return (
                          <TableCell
                            key={stage.id}
                            className={cn(
                              "px-3 py-3 border-r border-b border-slate-200 transition-colors",
                              idx % 2 === 0 ? "bg-white" : "bg-slate-50/70",
                              "group-hover:bg-blue-50/60"
                            )}
                          >
                            <StageDateCell
                              task={task}
                              stage={stage}
                              getStageDate={getStageDate}
                              getStageStatus={getStageStatus}
                              onSaveStageDate={onSaveStageDate}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={FIXED_COLUMNS.length + stageColumns.length + 1}
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
                  <SelectItem key={s} value={String(s)} className="text-[11px]">
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
