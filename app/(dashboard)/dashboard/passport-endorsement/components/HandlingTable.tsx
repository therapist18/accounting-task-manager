// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, parse, isValid } from "date-fns";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2, ArrowUpDown, ArrowLeftRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SearchX, Layers, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_LABELS, type HandlingStep } from "../utils/database";

export const HANDLING_COLUMNS = [
  { id: "task_id", label: "Task ID" },
  { id: "applicant", label: "Applicant" },
  { id: "company", label: "Company" },
  { id: "company_prefix", label: "Company / Place" },
  { id: "sub_department", label: "Sub-Department" },
  { id: "class_name", label: "Class" },
  { id: "write_up_date", label: "Write Up Date" }, // Matched screenshot label
  { id: "doc_issue_date", label: "Document Date of Issue" },
  { id: "doc_expiry_date", label: "Document Expiry Date" },
  { id: "passport_number", label: "Passport No." },
  { id: "mode", label: "Mode" },
  { id: "current_step", label: "Current Step" },
  { id: "received_by", label: "Received By" },
  { id: "received_date", label: "Received Date" },
  { id: "received_time", label: "Received Time" },
  { id: "taken_by", label: "Taken By" },
  { id: "taken_date", label: "Taken Date" },
  { id: "taken_time", label: "Taken Time" },
  { id: "returned_by", label: "Returned By" },
  { id: "returned_date", label: "Returned Date" },
  { id: "returned_time", label: "Returned Time" },
  { id: "notified_by", label: "Notified By" },
  { id: "notified_date", label: "Notified Date" },
  { id: "notified_time", label: "Notified Time" },
  { id: "dispatch_mode", label: "Dispatch Mode" },
  { id: "dispatch_handled_by", label: "Handled By (BCL)" },
  { id: "dispatch_by", label: "Dispatch By" },
  { id: "dispatch_date", label: "Dispatch Date" },
  { id: "dispatch_time", label: "Dispatch Time" },
  { id: "completed_date", label: "Completed Date" },
  { id: "completed_time", label: "Completed Time" },
];

export const DEFAULT_VISIBLE_COLUMN_IDS = HANDLING_COLUMNS.map((c) => c.id).filter((id) => id !== "company" && id !== "write_up_date");

const DEFAULT_COL_WIDTH = 170;
const INDEX_COL_WIDTH = 48;
const ACTIONS_COL_WIDTH = 128;
const STICKY_COLUMN_DEFAULT_WIDTHS: Record<string, number> = {
  task_id: 80,
  applicant: 192,
  company_prefix: 128,
};
const STICKY_COLUMN_IDS = ["task_id", "applicant", "company_prefix"] as const;

// Updated step badge classes to match the vibrant pill styling from the screenshot
const STEP_BADGE_CLASSES: Record<HandlingStep, string> = {
  mode_unset: "bg-[#fff7ed] text-[#ea580c] border-[#ffedd5]", // Exact match for the orange MODE NOT SET pill
  client_managed: "bg-violet-50 text-violet-700 border-violet-200",
  awaiting_receipt: "bg-slate-100 text-slate-600 border-slate-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  at_nyayo: "bg-amber-50 text-amber-700 border-amber-200",
  stamped_back: "bg-teal-50 text-teal-700 border-teal-200",
  ready_for_dispatch: "bg-blue-50 text-blue-700 border-blue-200",
  out_for_delivery: "bg-indigo-50 text-indigo-700 border-indigo-200",
  awaiting_pickup: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const GROUP_ACCENTS: Record<string, {
  label: string;
  headerBg: string;
  headerHover: string;
  headerActive: string;
  bodyTint: string;
  hoverTint: string;
  endBorder: string;
}> = {
  case: {
    label: "Case Details",
    headerBg: "bg-custom-blue",
    headerHover: "hover:bg-[#153a75]",
    headerActive: "bg-[#153a75]",
    bodyTint: "",
    hoverTint: "",
    endBorder: "border-r-2 border-slate-200",
  },
  received: {
    label: "Received at Office",
    headerBg: "bg-sky-600",
    headerHover: "hover:bg-sky-700",
    headerActive: "bg-sky-700",
    bodyTint: "bg-sky-50/60",
    hoverTint: "hover:bg-sky-100/60",
    endBorder: "border-r-2 border-r-sky-400/70",
  },
  taken: {
    label: "Taken to Nyayo",
    headerBg: "bg-amber-500",
    headerHover: "hover:bg-amber-600",
    headerActive: "bg-amber-600",
    bodyTint: "bg-amber-50/70",
    hoverTint: "hover:bg-amber-100/60",
    endBorder: "border-r-2 border-r-amber-400/70",
  },
  returned: {
    label: "Returned Stamped",
    headerBg: "bg-teal-600",
    headerHover: "hover:bg-teal-700",
    headerActive: "bg-teal-700",
    bodyTint: "bg-teal-50/70",
    hoverTint: "hover:bg-teal-100/60",
    endBorder: "border-r-2 border-r-teal-400/70",
  },
  notified: {
    label: "Client Notified",
    headerBg: "bg-violet-600",
    headerHover: "hover:bg-violet-700",
    headerActive: "bg-violet-700",
    bodyTint: "bg-violet-50/70",
    hoverTint: "hover:bg-violet-100/60",
    endBorder: "border-r-2 border-r-violet-400/70",
  },
  dispatch: {
    label: "Dispatch",
    headerBg: "bg-indigo-600",
    headerHover: "hover:bg-indigo-700",
    headerActive: "bg-indigo-700",
    bodyTint: "bg-indigo-50/70",
    hoverTint: "hover:bg-indigo-100/60",
    endBorder: "border-r-2 border-r-indigo-400/70",
  },
  completed: {
    label: "Completed",
    headerBg: "bg-emerald-600",
    headerHover: "hover:bg-emerald-700",
    headerActive: "bg-emerald-700",
    bodyTint: "bg-emerald-50/70",
    hoverTint: "hover:bg-emerald-100/60",
    endBorder: "border-r-2 border-r-emerald-400/70",
  },
};

const COLUMN_GROUP_BY_ID: Record<string, string> = {
  task_id: "case", applicant: "case", company: "case", company_prefix: "case",
  sub_department: "case", class_name: "case", write_up_date: "case",
  doc_issue_date: "case", doc_expiry_date: "case", passport_number: "case",
  mode: "case", current_step: "case",
  received_by: "received", received_date: "received", received_time: "received",
  taken_by: "taken", taken_date: "taken", taken_time: "taken",
  returned_by: "returned", returned_date: "returned", returned_time: "returned",
  notified_by: "notified", notified_date: "notified", notified_time: "notified",
  dispatch_mode: "dispatch", dispatch_handled_by: "dispatch", dispatch_by: "dispatch",
  dispatch_date: "dispatch", dispatch_time: "dispatch",
  completed_date: "completed", completed_time: "completed",
};

const colGroupId = (colId: string) => COLUMN_GROUP_BY_ID[colId] || "case";

function StepBadge({ step }: { step: HandlingStep }) {
  // Overriding STEP_LABELS display if it's mode_unset to exactly match screenshot text
  const label = step === "mode_unset" ? "MODE NOT SET" : STEP_LABELS[step];
  return (
    <span className={cn("inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-black uppercase tracking-wider shadow-sm", STEP_BADGE_CLASSES[step])}>
      {label}
    </span>
  );
}

function fmtDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), "dd/MM/yyyy");
  } catch {
    return null;
  }
}

function fmtTimeOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), "HH:mm");
  } catch {
    return null;
  }
}

export function fmtStageDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const desiredFormatRegex = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/;
  if (desiredFormatRegex.test(dateStr)) return dateStr.slice(0, 10);
  try {
    const date = new Date(dateStr);
    if (isValid(date)) return format(date, "dd/MM/yyyy");
  } catch {}
  const formats = ["MM/dd/yyyy HH:mm", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return format(parsed, "dd/MM/yyyy");
  }
  return dateStr;
}

const PaginationButton = ({ children, onClick, disabled }: any) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn("h-8 w-8 rounded-md text-slate-500 transition-all", disabled ? "opacity-30 cursor-not-allowed" : "hover:text-slate-800 hover:bg-slate-100")}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </Button>
);

export function HandlingTable({
  rows,
  visibleColumnIds,
  getStaffName,
  companies,
  departments,
  subDepartments,
  activeSubDeptId,
  onManage,
  sortConfig,
  handleSort,
  loading = false,
}: any) {
  const visibleCols = HANDLING_COLUMNS.filter((c) => visibleColumnIds.includes(c.id));

  const allGroupChunks = useMemo(() => {
    const chunks: { gid: string; cols: (typeof HANDLING_COLUMNS)[number][] }[] = [];
    let cur: { gid: string; cols: any[] } | null = null;
    for (const col of visibleCols) {
      const gid = colGroupId(col.id);
      if (!cur || cur.gid !== gid) { cur = { gid, cols: [] }; chunks.push(cur); }
      cur.cols.push(col);
    }
    return chunks;
  }, [visibleCols]);

  const nonStickyChunks = useMemo(() => {
    const chunks: { gid: string; cols: (typeof HANDLING_COLUMNS)[number][] }[] = [];
    let cur: { gid: string; cols: any[] } | null = null;
    for (const col of visibleCols.filter((c) => !STICKY_COLUMN_IDS.includes(c.id as any))) {
      const gid = colGroupId(col.id);
      if (!cur || cur.gid !== gid) { cur = { gid, cols: [] }; chunks.push(cur); }
      cur.cols.push(col);
    }
    return chunks;
  }, [visibleCols]);

  const chunkEndColIds = useMemo(
    () => new Set(allGroupChunks.map((chunk) => chunk.cols[chunk.cols.length - 1].id)),
    [allGroupChunks]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10); // Defaulting to 10 matching screenshot

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  useEffect(() => { setCurrentPage(1); }, [rows.length]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, currentPage, rowsPerPage]);

  const isSubDeptScoped = activeSubDeptId != null && activeSubDeptId !== "all";

  const sectionedRows = useMemo(() => {
    const stack: ({ type: "section"; name: string; count: number } | { type: "row"; row: any; idx: number })[] = [];

    if (isSubDeptScoped) {
      paginatedRows.forEach((row: any, idx: number) => stack.push({ type: "row", row, idx }));
      return stack;
    }

    const subDeptNameFor = (task: any) => {
      const sdId = task.subdepartment_id?.toString();
      if (!sdId) return "—";
      const dept = (departments || []).find((d: any) => (d.tm_subdepartments || []).some((s: any) => s.id.toString() === sdId));
      return dept?.tm_subdepartments?.find((s: any) => s.id.toString() === sdId)?.name || "—";
    };

    const map = new Map<string, typeof paginatedRows>();
    paginatedRows.forEach((row: any) => {
      const name = subDeptNameFor(row.task);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(row);
    });

    const orderedNames: string[] = [];
    const seen = new Set<string>();
    (subDepartments || []).forEach((s: any) => {
      const name = s?.name || "N/A";
      if (!seen.has(name)) { seen.add(name); orderedNames.push(name); }
    });
    Array.from(map.keys())
      .filter((n) => !seen.has(n))
      .sort((a, b) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)))
      .forEach((n) => { seen.add(n); orderedNames.push(n); });

    let pageIdx = 0;
    orderedNames.forEach((name) => {
      const group = map.get(name);
      if (!group || group.length === 0) return;
      stack.push({ type: "section", name, count: group.length });
      group.forEach((row: any) => { stack.push({ type: "row", row, idx: pageIdx }); pageIdx++; });
    });
    return stack;
  }, [paginatedRows, departments, subDepartments, isSubDeptScoped]);

  const dispatchLabelFor = (record: any) => {
    if (record?.dispatch_method === "delivery") {
      if (record.delivery_type === "courier") return record.courier_rider_name ? `Courier — ${record.courier_rider_name}` : "Courier";
      if (record.delivery_type === "staff") return `Staff — ${getStaffName(record.delivered_by) || ""}`;
    }
    if (record?.dispatch_method === "pickup") {
      return record.pickup_person_name ? `Pickup — ${record.pickup_person_name}` : "Client Pickup";
    }
    return null;
  };

  const getSubDeptName = (task: any) => {
    const sdId = task.subdepartment_id?.toString();
    if (!sdId) return "—";
    const dept = (departments || []).find((d: any) => (d.tm_subdepartments || []).some((s: any) => s.id.toString() === sdId));
    return dept?.tm_subdepartments?.find((s: any) => s.id.toString() === sdId)?.name || "—";
  };

  const getClassName = (task: any) => {
    const cid = task.class_id?.toString();
    if (!cid) return "—";
    for (const d of departments || []) {
      for (const s of d.tm_subdepartments || []) {
        const c = (s.classes || []).find((x: any) => x.id.toString() === cid);
        if (c) return c.name || "—";
      }
    }
    return "—";
  };

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const columnDefs = useMemo<ColumnDef<any>[]>(() => [
    { id: "__index__", size: INDEX_COL_WIDTH, enableResizing: false },
    ...HANDLING_COLUMNS.map((col) => ({ id: col.id, size: STICKY_COLUMN_DEFAULT_WIDTHS[col.id] ?? DEFAULT_COL_WIDTH, minSize: 60, maxSize: 640 })),
    { id: "__actions__", size: ACTIONS_COL_WIDTH, enableResizing: false },
  ], []);

  const table = useReactTable({
    data: [],
    columns: columnDefs,
    columnResizeMode: "onChange",
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
  });

  const getColWidth = (colId: string): number => table.getColumn(colId)?.getSize() ?? DEFAULT_COL_WIDTH;

  const applyWidthToAllColumns = (colId: string) => {
    const width = getColWidth(colId);
    setColumnSizing((prev) => {
      const next = { ...prev };
      HANDLING_COLUMNS.forEach((c) => { next[c.id] = width; });
      return next;
    });
  };

  const headerById: Record<string, any> = {};
  table.getHeaderGroups().forEach((hg) => hg.headers.forEach((h) => { headerById[h.id] = h; }));

  const renderColHeader = (col: any, rowSpan: number) => {
    const isActive = sortConfig?.key === col.id;
    const isStickyLeft = STICKY_COLUMN_IDS.includes(col.id as any);
    const accent = GROUP_ACCENTS[colGroupId(col.id)];
    return (
      <TableHead
        key={col.id}
        rowSpan={rowSpan}
        onClick={() => handleSort?.(col.id)}
        className={cn(
          "group relative border-r border-b border-white/20 px-4 py-2 select-none transition-colors",
          accent.headerBg,
          accent.headerHover,
          handleSort && "cursor-pointer",
          isActive && accent.headerActive,
          isStickyLeft && "sticky left-0 z-50"
        )}
        style={isStickyLeft ? { left: stickyColumnOffsets[col.id] } : undefined}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 pr-1">
          <span className="text-[12px] font-bold tracking-wider text-white uppercase min-w-0">
            {col.label}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); applyWidthToAllColumns(col.id); }}
                    className="h-4 w-4 shrink-0 hidden group-hover:flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/20 transition-all"
                  >
                    <ArrowLeftRight size={10} strokeWidth={2.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999]">
                  Apply this column's width to all columns
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {handleSort && (
              <ArrowUpDown className={cn("h-3.5 w-3.5 shrink-0 ml-1", isActive ? "text-white" : "text-white/40")} />
            )}
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
  };

  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = INDEX_COL_WIDTH;
    visibleCols.forEach((col) => {
      if (!STICKY_COLUMN_IDS.includes(col.id as any)) return;
      offsets[col.id] = cursor;
      cursor += columnSizing[col.id] ?? STICKY_COLUMN_DEFAULT_WIDTHS[col.id] ?? DEFAULT_COL_WIDTH;
    });
    return offsets;
  }, [visibleCols, columnSizing]);

  const totalWidth = useMemo(
    () => INDEX_COL_WIDTH + visibleCols.reduce((sum, col) => sum + getColWidth(col.id), 0) + ACTIONS_COL_WIDTH,
    [visibleCols, columnSizing]
  );

  return (
    <div className="flex flex-col flex-1 px-8 pt-2 pb-6 bg-[#f8fafc]">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white flex flex-col">
        <div className="overflow-auto custom-scrollbar max-h-[calc(100vh-360px)]">
        <Table className="border-separate border-spacing-0 table-fixed" style={{ width: totalWidth, minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: INDEX_COL_WIDTH }} />
            {visibleCols.map((col) => (
              <col key={col.id} style={{ width: getColWidth(col.id) }} />
            ))}
            <col style={{ width: ACTIONS_COL_WIDTH }} />
          </colgroup>
          <TableHeader className="sticky top-0 z-40">
            <TableRow className="hover:bg-transparent border-0">
              <TableHead rowSpan={2} className="sticky left-0 z-50 w-12 max-w-12 border-r border-b border-white/20 text-center px-2 bg-custom-blue">
                <span className="text-[12px] font-bold text-white tracking-wider">#</span>
              </TableHead>
              {visibleCols.filter((col) => colGroupId(col.id) === "case").map((col) => renderColHeader(col, 2))}
              {nonStickyChunks
                .filter((chunk) => chunk.gid !== "case")
                .map((chunk) => {
                  const accent = GROUP_ACCENTS[chunk.gid];
                  return (
                    <TableHead
                      key={chunk.gid}
                      colSpan={chunk.cols.length}
                      className={cn("h-7 px-3 text-center border-r border-b border-white/10", accent.headerBg)}
                    >
                      <span className="text-[11px] font-bold text-white/90 uppercase tracking-widest">{accent.label}</span>
                    </TableHead>
                  );
                })}
              <TableHead className="sticky right-0 z-50 border-l border-b border-white/20 bg-custom-blue px-3 text-center">
                <span className="text-[12px] font-bold text-white uppercase tracking-wider">Actions</span>
              </TableHead>
            </TableRow>

            <TableRow className="hover:bg-transparent border-0">
              {visibleCols.filter((col) => colGroupId(col.id) !== "case").map((col) => renderColHeader(col, 1))}
              <TableHead className="sticky right-0 z-50 w-32 max-w-32 border-l border-b border-white/20 text-center px-3 bg-custom-blue">
                <span className="text-[12px] font-bold text-white tracking-wider uppercase">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visibleCols.length + 2} className="h-72 bg-white">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-custom-blue" />
                    <p className="text-[14px] font-semibold text-slate-600">Loading tasks...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : sectionedRows.length > 0 ? (
              sectionedRows.map((item) => {
                if (item.type === "section") {
                  const stickyColCount = visibleCols.filter((c) => ["task_id", "applicant", "company_prefix"].includes(c.id)).length;
                  const headerSpacerColSpan = Math.max(1, visibleCols.length - stickyColCount);
                  return (
                    <TableRow key={`section-${item.name}`} className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={1 + stickyColCount}
                        className="sticky left-0 z-30 bg-slate-50 border-r border-t-2 border-t-custom-blue border-b border-b-slate-200 py-2.5 pl-4 pr-4"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="h-4 w-4 text-custom-blue shrink-0" />
                          <span className="text-[12px] font-bold uppercase tracking-wider text-custom-blue whitespace-nowrap">
                            {item.name === "—" ? "Unassigned" : item.name}
                          </span>
                          <span className="text-[12px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                            · {item.count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell colSpan={headerSpacerColSpan} className="bg-slate-50 px-4 py-2 border-t-2 border-t-custom-blue border-b border-b-slate-200" />
                      <TableCell className="sticky right-0 z-30 bg-slate-50 border-l border-t-2 border-t-custom-blue border-b border-b-slate-200 py-2 px-2" />
                    </TableRow>
                  );
                }

                const { task, record, mode, step, writeUpDate, docIssueDate, docExpiryDate } = item.row;
                const company = companies.get(task.company_id);
                const globalIdx = (currentPage - 1) * rowsPerPage + item.idx;

                return (
                  <TableRow
                    key={task.id}
                    className={cn("group border-0 transition-colors", globalIdx % 2 === 0 ? "bg-white" : "bg-[#fcfdfd]", "hover:bg-blue-50/50")}
                  >
                    <TableCell className={cn("sticky left-0 z-20 w-12 border-r border-b border-slate-100 text-center py-4", globalIdx % 2 === 0 ? "bg-white" : "bg-[#fcfdfd]", "group-hover:bg-blue-50/50")}>
                      <span className="text-[13px] font-semibold text-slate-500 tabular-nums">{globalIdx + 1}</span>
                    </TableCell>
                    {visibleCols.map((col) => {
                      let content: React.ReactNode;
                      const isStickyLeft = STICKY_COLUMN_IDS.includes(col.id as any);
                      const colAccent = GROUP_ACCENTS[colGroupId(col.id)];
                      const isChunkEnd = chunkEndColIds.has(col.id);
                      switch (col.id) {
                        case "task_id":
                          content = <span className="font-mono text-[11px] font-medium text-slate-500">#{task.id}</span>;
                          break;
                        case "applicant":
                          content = <span className="font-bold text-slate-800 uppercase text-[11px]">{task.applicant_name}</span>;
                          break;
                        case "company":
                          content = <span className="text-[11px] text-slate-600 uppercase font-semibold">{company?.name || task.company_name || "—"}</span>;
                          break;
                        case "company_prefix":
                          content = <span className="text-[11px] text-slate-600 uppercase font-semibold">{company?.prefix || "—"}</span>;
                          break;
                        case "sub_department":
                          content = <span className="text-[11px] font-semibold text-slate-600 uppercase">{getSubDeptName(task)}</span>;
                          break;
                        case "class_name":
                          content = <span className="text-[11px] font-semibold text-slate-600">{getClassName(task)}</span>;
                          break;
                        case "write_up_date": {
                          const wud = fmtStageDate(writeUpDate);
                          content = wud ? <span className="text-[11px] font-medium text-slate-600">{wud}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "doc_issue_date": {
                          const val = fmtStageDate(docIssueDate);
                          content = val ? <span className="text-[11px] font-medium text-slate-600">{val}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "doc_expiry_date": {
                          const val = fmtStageDate(docExpiryDate);
                          content = val ? <span className="text-[11px] font-medium text-slate-600">{val}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "passport_number":
                          content = <span className="text-[11px] font-medium text-slate-600 uppercase">{task.passport_number || "—"}</span>;
                          break;
                        case "mode":
                          content = mode ? (
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[12px] font-bold uppercase tracking-wider",
                              mode === "bcl" ? "text-blue-600" : "text-slate-600"
                            )}>
                              {mode === "bcl" ? "BCL Handles" : "Client Handles"}
                            </span>
                          ) : <span className="text-[#ea580c] font-bold text-[12px]">Not Set</span>; // Exact match to image styling
                          break;
                        case "current_step":
                          content = <StepBadge step={step} />;
                          break;
                        case "received_by": {
                          const by = getStaffName(record?.received_by) || record?.brought_by_name;
                          content = by ? <span className="text-[11px] font-semibold text-slate-700">{by}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "received_date": {
                          const d = fmtDateOnly(record?.received_at);
                          content = d ? <span className="text-[11px] font-medium text-slate-600">{d}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "received_time": {
                          const t = fmtTimeOnly(record?.received_at);
                          content = t ? <span className="text-[11px] font-medium text-slate-600 tabular-nums">{t}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "taken_by": {
                          const by = getStaffName(record?.taken_by);
                          content = by ? <span className="text-[11px] font-semibold text-slate-700">{by}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "taken_date": {
                          const d = fmtDateOnly(record?.taken_at);
                          content = d ? <span className="text-[11px] font-medium text-slate-600">{d}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "taken_time": {
                          const t = fmtTimeOnly(record?.taken_at);
                          content = t ? <span className="text-[11px] font-medium text-slate-600 tabular-nums">{t}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "returned_by": {
                          const by = getStaffName(record?.returned_by);
                          content = by ? <span className="text-[11px] font-semibold text-slate-700">{by}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "returned_date": {
                          const d = fmtDateOnly(record?.returned_at);
                          content = d ? <span className="text-[11px] font-medium text-slate-600">{d}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "returned_time": {
                          const t = fmtTimeOnly(record?.returned_at);
                          content = t ? <span className="text-[11px] font-medium text-slate-600 tabular-nums">{t}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "notified_by": {
                          const by = getStaffName(record?.client_notified_by);
                          content = by ? <span className="text-[11px] font-semibold text-slate-700">{by}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "notified_date": {
                          const d = fmtDateOnly(record?.client_notified_at);
                          content = d ? <span className="text-[11px] font-medium text-slate-600">{d}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "notified_time": {
                          const t = fmtTimeOnly(record?.client_notified_at);
                          content = t ? <span className="text-[11px] font-medium text-slate-600 tabular-nums">{t}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "dispatch_mode": {
                          if (!record?.dispatch_method) {
                            content = <span className="text-slate-300">—</span>;
                            break;
                          }
                          const isPickup = record.dispatch_method === "pickup";
                          const isCourier = record.delivery_type === "courier";
                          content = (
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-black uppercase tracking-widest",
                              isPickup
                                ? "bg-slate-100 text-slate-600 border-slate-200"
                                : isCourier
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            )}>
                              {isPickup ? "Client Pickup" : isCourier ? "Delivery · Courier" : "Delivery · Staff"}
                            </span>
                          );
                          break;
                        }
                        case "dispatch_handled_by": {
                          const by = getStaffName(record?.dispatch_handled_by);
                          content = by ? <span className="text-[11px] font-semibold text-slate-700">{by}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "dispatch_by": {
                          const by = dispatchLabelFor(record);
                          content = by ? <span className="text-[11px] font-semibold text-slate-700">{by}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "dispatch_date": {
                          const d = fmtDateOnly(record?.delivered_at || record?.pickup_at);
                          content = d ? <span className="text-[11px] font-medium text-slate-600">{d}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "dispatch_time": {
                          const t = fmtTimeOnly(record?.delivered_at || record?.pickup_at);
                          content = t ? <span className="text-[11px] font-medium text-slate-600 tabular-nums">{t}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "completed_date": {
                          const d = step === "completed" ? fmtDateOnly(record?.delivered_at || record?.pickup_at || record?.returned_at) : null;
                          content = d ? <span className="text-[11px] font-medium text-slate-600">{d}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "completed_time": {
                          const t = step === "completed" ? fmtTimeOnly(record?.delivered_at || record?.pickup_at || record?.returned_at) : null;
                          content = t ? <span className="text-[11px] font-medium text-slate-600 tabular-nums">{t}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        default:
                          content = <span className="text-slate-300">—</span>;
                      }
                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-4 py-4 border-b border-r border-slate-100 text-sm transition-colors",
                            !isStickyLeft && colAccent.bodyTint,
                            !isStickyLeft && colAccent.hoverTint,
                            isChunkEnd && colAccent.endBorder,
                            isStickyLeft && "sticky z-20",
                            isStickyLeft && (globalIdx % 2 === 0 ? "bg-white" : "bg-[#fcfdfd]"),
                            isStickyLeft && "group-hover:bg-blue-50/50"
                          )}
                          style={isStickyLeft ? { left: stickyColumnOffsets[col.id] } : undefined}
                        >
                          {content}
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn("sticky right-0 z-20 w-32 border-l border-b border-slate-100 py-3.5 text-center", globalIdx % 2 === 0 ? "bg-white" : "bg-[#fcfdfd]", "group-hover:bg-blue-50/50")}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onManage(task, record)}
                        className="h-8 px-3 rounded-md text-[11px] font-bold gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
                      >
                        <Settings2 className="h-3.5 w-3.5" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={visibleCols.length + 2} className="h-72 bg-white">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <SearchX size={24} className="text-slate-400" />
                    </div>
                    <p className="text-[14px] font-semibold text-slate-800">No tasks found</p>
                    <p className="text-[13px] mt-1 text-slate-500">Adjust your filters to see more results</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Matching Screenshot Pagination Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
        <div className="text-[13px] text-slate-600 font-medium">
          Showing <span className="font-semibold tabular-nums">{(rows.length === 0 ? 0 : ((currentPage - 1) * rowsPerPage) + 1)}</span> to{' '}
          <span className="font-semibold tabular-nums">{Math.min(currentPage * rowsPerPage, rows.length)}</span> of{' '}
          <span className="font-semibold tabular-nums">{rows.length}</span> entries
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-slate-600 font-medium">Rows per page</span>
            <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[70px] h-8 rounded-md border-slate-200 text-[13px] font-semibold text-slate-700 bg-white shadow-sm hover:bg-slate-50 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                {[10, 25, 50, 100].map((s) => <SelectItem key={s} value={String(s)} className="text-[13px] font-medium">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft size={16} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1}><ChevronLeft size={16} /></PaginationButton>

            {(() => {
              const pages: (number | "…")[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (currentPage > 4) pages.push("…");
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);
                for (let i = start; i <= end; i++) pages.push(i);
                if (currentPage < totalPages - 3) pages.push("…");
                pages.push(totalPages);
              }
              return pages;
            })().map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-[13px] text-slate-400 select-none">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={cn(
                    "h-8 w-8 rounded-md text-[13px] font-bold flex items-center justify-center select-none transition-all",
                    p === currentPage
                      ? "bg-custom-blue text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  )}
                >
                  {p}
                </button>
              )
            )}

            <PaginationButton onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages}><ChevronRight size={16} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight size={16} /></PaginationButton>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}