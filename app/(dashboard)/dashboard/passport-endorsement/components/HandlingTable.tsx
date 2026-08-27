// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_LABELS, type HandlingStep } from "../utils/database";

export const HANDLING_COLUMNS = [
  { id: "applicant", label: "Applicant" },
  { id: "company", label: "Company" },
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

export const DEFAULT_VISIBLE_COLUMN_IDS = HANDLING_COLUMNS.map((c) => c.id);

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

  return (
    <div className="flex flex-col flex-1 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
      <div className="flex-1 overflow-auto custom-scrollbar">
        <Table className="border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent border-0">
              <TableHead className="w-12 border-r border-b border-white/30 text-center py-2.5 px-2 bg-custom-blue">
                <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
              </TableHead>
              {visibleCols.map((col) => {
                const isActive = sortConfig?.key === col.id;
                return (
                  <TableHead
                    key={col.id}
                    onClick={() => handleSort?.(col.id)}
                    className={cn(
                      "group border-r border-b border-white/30 px-4 py-2.5 select-none transition-colors bg-custom-blue hover:bg-slate-700",
                      handleSort && "cursor-pointer",
                      isActive && "bg-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-white whitespace-nowrap">
                        {col.label}
                      </span>
                      {handleSort && (
                        <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-white/40 opacity-0 group-hover:opacity-100")} />
                      )}
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-24 border-b border-white/30 text-center py-2.5 px-2 bg-custom-blue">
                <span className="text-[10px] font-semibold text-white uppercase tracking-wider">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length > 0 ? (
              paginatedRows.map((row: any, idx: number) => {
                const { task, record, mode, step } = row;
                const company = companies.get(task.company_id);
                const globalIdx = (currentPage - 1) * rowsPerPage + idx;

                return (
                  <TableRow
                    key={task.id}
                    className={cn("group border-0 transition-colors", globalIdx % 2 === 0 ? "bg-white" : "bg-slate-50", "hover:bg-blue-50/50")}
                  >
                    <TableCell className="border-r border-b border-slate-200 text-center py-2.5">
                      <span className="text-sm font-semibold text-slate-400">{globalIdx + 1}</span>
                    </TableCell>
                    {visibleCols.map((col) => {
                      let content: React.ReactNode;
                      switch (col.id) {
                        case "applicant":
                          content = <span className="font-semibold text-slate-800">{task.applicant_name}</span>;
                          break;
                        case "company":
                          content = <span className="text-slate-600">{company?.name || task.company_name || "—"}</span>;
                          break;
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
                        <TableCell key={col.id} className="px-4 py-2.5 border-r border-b border-slate-200 text-sm max-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
                          {content}
                        </TableCell>
                      );
                    })}
                    <TableCell className="border-b border-slate-200 py-2.5 text-center">
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
  );
}
