// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, parse, isValid } from "date-fns";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2, ArrowUpDown, ArrowLeftRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SearchX, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_LABELS, type HandlingStep } from "../utils/database";

export const HANDLING_COLUMNS = [
  { id: "task_id", label: "Task ID" },
  { id: "applicant", label: "Applicant" },
  { id: "company", label: "Company" },
  { id: "company_prefix", label: "Company Prefix" },
  { id: "sub_department", label: "Sub-Department" },
  { id: "class_name", label: "Class" },
  { id: "write_up_date", label: "Write Up Date" },
  { id: "passport_number", label: "Passport No." },
  { id: "mode", label: "Mode" },
  { id: "current_step", label: "Current Step" },
  { id: "received", label: "Received" },
  { id: "taken", label: "Taken to Nyayo" },
  { id: "returned", label: "Returned" },
  { id: "notified", label: "Client Notified" },
  { id: "dispatch", label: "Dispatch" },
  { id: "completed", label: "Completed" },
];

// Company column is kept in HANDLING_COLUMNS (toggleable via the columns dialog) but hidden
// by default — the Company Prefix column alongside Applicant carries enough identity per row.
export const DEFAULT_VISIBLE_COLUMN_IDS = HANDLING_COLUMNS.map((c) => c.id).filter((id) => id !== "company");

// ── Column widths — same tanstack react-table sizing/resizing mechanism Summary Reports'
// SummaryTable uses. DEFAULT_COL_WIDTH (in px) is the starting width of every non-sticky data
// column; the sticky ones keep the exact widths their old fixed w-*/max-w-* classes gave them
// (task_id w-20 = 80px, applicant w-48 = 192px, company_prefix w-32 = 128px) so the layout
// starts pixel-identical to before resizing existed, then lets the user drag column edges
// (or apply one column's width to all) from the header.
const DEFAULT_COL_WIDTH = 170;
const INDEX_COL_WIDTH = 48;
const ACTIONS_COL_WIDTH = 128;
const STICKY_COLUMN_DEFAULT_WIDTHS: Record<string, number> = {
  task_id: 80,
  applicant: 192,
  company_prefix: 128,
};
const STICKY_COLUMN_IDS = ["task_id", "applicant", "company_prefix"] as const;

const STEP_BADGE_CLASSES: Record<HandlingStep, string> = {
  mode_unset: "bg-amber-50 text-amber-700 border-amber-200",
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

function StepBadge({ step }: { step: HandlingStep }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-black uppercase tracking-widest", STEP_BADGE_CLASSES[step])}>
      {STEP_LABELS[step]}
    </span>
  );
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return format(new Date(iso), "dd MMM yyyy, HH:mm");
  } catch {
    return null;
  }
}

// Same date-display logic EditableStageCell.tsx's own formatDateDisplay uses to render a
// stage's date (Write Up included) inside DepartmentTasksManager — replicated here (rather
// than imported, since that's a local, non-exported function) so this column shows the exact
// same value the same way. Passes an already-dd/mm/yyyy string through unchanged, otherwise
// parses it (ISO first, then a few legacy formats) and renders dd/MM/yyyy — no time component,
// matching EditableStageCell's own showTime=false path.
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

function PersonDate({ dateIso, personName }: { dateIso: string | null | undefined; personName?: string | null }) {
  const formatted = fmtDateTime(dateIso);
  if (!formatted) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-col">
      <span className="text-slate-700 font-semibold text-sm">{formatted}</span>
      {personName && <span className="text-[11px] text-slate-400">{personName}</span>}
    </div>
  );
}

const PaginationButton = ({ children, onClick, disabled }: any) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn("h-6 w-6 rounded text-slate-600 transition-all", disabled ? "opacity-30 cursor-not-allowed" : "hover:text-slate-700 hover:bg-slate-100")}
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
}: any) {
  const visibleCols = HANDLING_COLUMNS.filter((c) => visibleColumnIds.includes(c.id));

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  // Jump back to page 1 whenever the underlying row set shrinks/changes shape (new filter,
  // search, or status tab) — otherwise the user can land on a stale, now out-of-range page.
  useEffect(() => { setCurrentPage(1); }, [rows.length]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, currentPage, rowsPerPage]);

  // ── Sub-department section grouping ── mirrors Summary Reports' SummaryTable: the current
  // page's rows are chunked into sub-department sections ordered the same way the HierarchyTabs
  // show them (tm_subdepartments's stored order), each headed by a bordered section row.
  // Skipped when a single sub-department is active — the tab already scoped the list to it.
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

    // Canonical section order — same order the Sub-Department tabs present (tm_subdepartments
    // in their stored order), with anything not covered (e.g. rows with no sub-department)
    // trailing after, "—" last.
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

  // ── Column sizing (tanstack react-table, resizable columns) — same mechanism Summary
  // Reports' SummaryTable uses. The columnDefs carry widths/min/max only (cell content still
  // renders through the hand-rolled switch above); columnResizeMode 'onChange' updates the
  // <colgroup> widths live while dragging, and the sticky `left` offsets below recompute from
  // the live widths so pinned cells stay glued to whatever scrolls out from under them.
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

  // Left offsets accumulate INDEX_COL_WIDTH followed by each sticky column's *current* width —
  // unlike SummaryTable only the sticky columns that are actually visible participate, so
  // hiding task_id/applicant/company_prefix keeps the remaining pinned cells flush against
  // the index column instead of leaving a gap where the hidden column's old width was.
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

  // table-fixed lays the table out from the <colgroup> (col widths win over cell classes), so
  // the table's own width = index + every visible data column + actions. Computed over visible
  // columns only — tanstack's getTotalSize() also counts hidden columns like `company`, which
  // would otherwise leave a phantom ~170px gap even when that column is toggled off.
  const totalWidth = useMemo(
    () => INDEX_COL_WIDTH + visibleCols.reduce((sum, col) => sum + getColWidth(col.id), 0) + ACTIONS_COL_WIDTH,
    [visibleCols, columnSizing]
  );

  return (
    <div className="flex flex-col flex-1 px-4 pt-3 pb-4 bg-slate-50">
      {/* Card wrapper — holds the border/shadow; the scroll div inside is the only overflow
          point, with its height bounded by a viewport-relative cap so the table scrolls
          internally and the pagination footer below always stays on-screen — same technique
          Summary Reports' SummaryTable uses (max-h-[calc(100vh-300px)]) rather than relying
          on an unbroken flex-1/overflow-hidden chain all the way up through the shared
          dashboard layout's <main>, which has no fixed height of its own. */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white flex flex-col">
        <div className="overflow-auto custom-scrollbar max-h-[calc(100vh-300px)]">
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
              <TableHead className="sticky left-0 z-50 w-12 max-w-12 border-r border-b border-white/30 text-center py-1.5 px-2 bg-custom-blue">
                <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
              </TableHead>
              {visibleCols.map((col) => {
                const isActive = sortConfig?.key === col.id;
                const isStickyLeft = STICKY_COLUMN_IDS.includes(col.id as any);
                return (
                  <TableHead
                    key={col.id}
                    onClick={() => handleSort?.(col.id)}
                    className={cn(
                      "group relative border-r border-b border-white/30 px-4 py-1.5 select-none transition-colors bg-custom-blue hover:bg-slate-700",
                      handleSort && "cursor-pointer",
                      isActive && "bg-slate-700",
                      isStickyLeft && "sticky z-50"
                    )}
                    style={isStickyLeft ? { left: stickyColumnOffsets[col.id] } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0 pr-1">
                      <span
                        className={cn(
                          "text-[11px] font-semibold uppercase tracking-wider text-white whitespace-nowrap",
                          isStickyLeft && "truncate"
                        )}
                      >
                        {col.label}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); applyWidthToAllColumns(col.id); }}
                                className="h-4 w-4 shrink-0 hidden group-hover:flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-slate-600 transition-all"
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
                          <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-white/60")} />
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
              })}
              <TableHead className="sticky right-0 z-50 w-32 max-w-32 border-l border-b border-white/30 text-center py-1.5 px-2 bg-custom-blue">
                <span className="text-[10px] font-semibold text-white uppercase tracking-wider">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sectionedRows.length > 0 ? (
              sectionedRows.map((item) => {
                if (item.type === "section") {
                  // The name/count cell must NOT span every column if it's going to stay
                  // pinned on horizontal scroll — a full-width sticky cell would cover the
                  // whole table. Instead the sticky block spans just the index + sticky data
                  // columns (same widths the data rows' sticky cells occupy), so the section
                  // name and count stay visible while the rest of the row scrolls underneath.
                  const stickyColCount = visibleCols.filter((c) => ["task_id", "applicant", "company_prefix"].includes(c.id)).length;
                  const headerSpacerColSpan = Math.max(1, visibleCols.length - stickyColCount);
                  return (
                    <TableRow key={`section-${item.name}`} className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={1 + stickyColCount}
                        className="sticky left-0 z-30 bg-white border-r border-t-2 border-t-custom-blue border-b border-b-slate-200 py-2 pl-3 pr-4"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="h-3 w-3 text-custom-blue/60 shrink-0" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-custom-blue whitespace-nowrap">
                            {item.name === "—" ? "Unassigned" : item.name}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400 tabular-nums whitespace-nowrap">
                            · {item.count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell colSpan={headerSpacerColSpan} className="bg-white px-4 py-2 border-t-2 border-t-custom-blue border-b border-b-slate-200" />
                      <TableCell className="sticky right-0 z-30 bg-white border-l border-t-2 border-t-custom-blue border-b border-b-slate-200 py-2 px-2" />
                    </TableRow>
                  );
                }

                const { task, record, mode, step, writeUpDate } = item.row;
                const company = companies.get(task.company_id);
                const globalIdx = (currentPage - 1) * rowsPerPage + item.idx;

                return (
                  <TableRow
                    key={task.id}
                    className={cn("group border-0 transition-colors", globalIdx % 2 === 0 ? "bg-white" : "bg-slate-50", "hover:bg-blue-50/50")}
                  >
                    <TableCell className={cn("sticky left-0 z-20 w-12 border-r border-b border-slate-200 text-center py-1.5", globalIdx % 2 === 0 ? "bg-white" : "bg-slate-50", "group-hover:bg-blue-50")}>
                      <span className="text-sm font-semibold text-slate-400">{globalIdx + 1}</span>
                    </TableCell>
                    {visibleCols.map((col) => {
                      let content: React.ReactNode;
                      const isStickyLeft = STICKY_COLUMN_IDS.includes(col.id as any);
                      switch (col.id) {
                        case "task_id":
                          content = <span className="font-mono text-slate-500">#{task.id}</span>;
                          break;
                        case "applicant":
                          content = <span className="font-semibold text-slate-800">{task.applicant_name}</span>;
                          break;
                        case "company":
                          content = <span className="text-slate-600">{company?.name || task.company_name || "—"}</span>;
                          break;
                        case "company_prefix":
                          content = <span className="font-mono text-slate-600">{company?.prefix || "—"}</span>;
                          break;
                        case "sub_department":
                          content = <span className="text-slate-600">{getSubDeptName(task)}</span>;
                          break;
                        case "class_name":
                          content = <span className="text-slate-600">{getClassName(task)}</span>;
                          break;
                        case "write_up_date": {
                          const wud = fmtStageDate(writeUpDate);
                          content = wud ? <span className="text-slate-600">{wud}</span> : <span className="text-slate-300">—</span>;
                          break;
                        }
                        case "passport_number":
                          content = <span className="font-mono text-slate-600">{task.passport_number || "—"}</span>;
                          break;
                        case "mode":
                          content = mode ? (
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-black uppercase tracking-widest",
                              mode === "bcl" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-600 border-slate-200"
                            )}>
                              {mode === "bcl" ? "BCL Handles" : "Client Handles"}
                            </span>
                          ) : <span className="text-amber-600 text-xs font-bold">Not Set</span>;
                          break;
                        case "current_step":
                          content = <StepBadge step={step} />;
                          break;
                        case "received":
                          content = <PersonDate dateIso={record?.received_at} personName={getStaffName(record?.received_by) || record?.brought_by_name} />;
                          break;
                        case "taken":
                          content = <PersonDate dateIso={record?.taken_at} personName={getStaffName(record?.taken_by)} />;
                          break;
                        case "returned":
                          content = <PersonDate dateIso={record?.returned_at} personName={getStaffName(record?.returned_by)} />;
                          break;
                        case "notified":
                          content = <PersonDate dateIso={record?.client_notified_at} personName={getStaffName(record?.client_notified_by)} />;
                          break;
                        case "dispatch":
                          content = dispatchLabelFor(record) || <span className="text-slate-300">—</span>;
                          break;
                        case "completed":
                          content = step === "completed"
                            ? <PersonDate dateIso={record?.delivered_at || record?.pickup_at || record?.returned_at} />
                            : <span className="text-slate-300">—</span>;
                          break;
                        default:
                          content = "—";
                      }
                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-4 py-1.5 border-r border-b border-slate-200 text-sm whitespace-nowrap",
                            isStickyLeft && "sticky z-20 overflow-hidden",
                            isStickyLeft && (globalIdx % 2 === 0 ? "bg-white" : "bg-slate-50"),
                            isStickyLeft && "group-hover:bg-blue-50"
                          )}
                          style={isStickyLeft ? { left: stickyColumnOffsets[col.id] } : undefined}
                        >
                          {content}
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn("sticky right-0 z-20 w-32 border-l border-b border-slate-200 py-1.5 text-center", globalIdx % 2 === 0 ? "bg-white" : "bg-slate-50", "group-hover:bg-blue-50")}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onManage(task, record)}
                        className="h-8 px-3 rounded-md text-xs font-bold gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Settings2 className="h-3.5 w-3.5" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={visibleCols.length + 2} className="h-64 bg-slate-50">
                  <div className="flex flex-col items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                      <SearchX size={24} className="text-slate-500" />
                    </div>
                    <p className="text-[14px] font-semibold text-slate-700">No tasks found</p>
                    <p className="text-sm mt-1 text-slate-500">Adjust your filters to see more results</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination — same layout/classes as Summary Reports' SummaryTable footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
        <div className="text-[11px] text-slate-600 font-semibold">
          Showing <span className="text-slate-600">{rows.length === 0 ? 0 : ((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
          <span className="font-medium text-slate-600">{Math.min(currentPage * rowsPerPage, rows.length)}</span> of{' '}
          <span className="font-medium text-slate-600">{rows.length}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-600 font-semibold">Rows:</span>
            <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[64px] h-8 rounded border-slate-200 text-[11px] font-medium text-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded">
                {[10, 25, 50, 100].map((s) => <SelectItem key={s} value={String(s)} className="text-[11px]">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-0.5">
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft size={12} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1}><ChevronLeft size={12} /></PaginationButton>
            <div className="px-2 py-1.5 text-[11px] font-medium text-slate-600 min-w-[24px] text-center">{currentPage}</div>
            <PaginationButton onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages}><ChevronRight size={12} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight size={12} /></PaginationButton>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}