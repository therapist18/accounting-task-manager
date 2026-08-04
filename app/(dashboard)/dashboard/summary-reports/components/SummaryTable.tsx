// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDateSafe } from "../../reports/utils/reportStageLogic";
import { MILESTONE_STAGE_COLUMNS } from "../stageColumnConfig";

const DATE_ONLY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DATE_TIME_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/;

function resolveMilestoneParts(task: any, stageId: string): { date: string | null; time: string | null } {
  const stageData = task?.stages?.[stageId];
  const raw = stageData?.date || stageData?.completedAt || null;
  if (!raw || typeof raw !== 'string') return { date: null, time: null };
  if (DATE_ONLY_RE.test(raw)) return { date: raw, time: null };
  const dtMatch = raw.match(DATE_TIME_RE);
  if (dtMatch) return { date: `${dtMatch[1]}/${dtMatch[2]}/${dtMatch[3]}`, time: `${dtMatch[4].padStart(2, '0')}:${dtMatch[5]}` };
  const parsed = parseDateSafe(raw);
  if (!parsed) return { date: raw, time: null };
  return { date: format(parsed, 'dd/MM/yyyy'), time: format(parsed, 'HH:mm') };
}

// Fixed columns rendered ahead of the milestone date/time pairs. Mirrors StandardReportView's
// column-driven table (bg-custom-blue header, zebra rows, sticky header, border-slate-200
// grid) but with a static column set instead of a dynamic report configuration.
const buildColumns = () => {
  const cols: any[] = [
    { id: 'company', label: 'Company Name', render: (t: any, companies: any) => companies.get(t.company_id)?.name || t.company_name || null, primary: true },
    { id: 'applicant', label: 'Applicant Name', render: (t: any) => t.applicant_name, primary: true },
    { id: 'job_description', label: 'Job Description', render: (t: any) => t.job_description, highlight: true },
  ];
  MILESTONE_STAGE_COLUMNS.forEach(col => {
    cols.push({ id: `${col.key}_date`, label: col.dateLabel, highlight: col.highlight, milestone: col, part: 'date' });
    cols.push({ id: `${col.key}_time`, label: col.timeLabel, highlight: col.highlight, milestone: col, part: 'time' });
  });
  return cols;
};

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

export function SummaryTable({ tasks, companies }: { tasks: any[]; companies: Map<number, { name: string; prefix: string }> }) {
  const columns = useMemo(() => buildColumns(), []);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const rows = useMemo(() => tasks.map(task => {
    const milestoneParts: Record<string, { date: string | null; time: string | null }> = {};
    MILESTONE_STAGE_COLUMNS.forEach(col => { milestoneParts[col.key] = resolveMilestoneParts(task, col.stageId); });
    return { task, milestoneParts };
  }), [tasks]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, currentPage, rowsPerPage]);

  const firstHighlightId = useMemo(() => columns.find(c => c.highlight)?.id, [columns]);

  return (
    <div className="flex flex-col flex-1 antialiased pt-0 bg-white">
      <div className="relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-330px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ minWidth: '100%' }}>
            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-2.5 px-2 bg-custom-blue" style={{ width: 48 }}>
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>
                {columns.map(col => (
                  <TableHead
                    key={col.id}
                    className={cn(
                      "border-r border-b border-white/30 px-4 py-2.5 whitespace-nowrap",
                      col.highlight ? "bg-amber-500" : "bg-custom-blue",
                      col.id === firstHighlightId && "border-l-[3px] border-l-amber-300"
                    )}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white whitespace-normal break-words leading-snug">
                      {col.label}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.length > 0 ? (
                paginatedRows.map(({ task, milestoneParts }, idx) => (
                  <TableRow key={task.id} className={cn("group border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-50/70", "hover:bg-blue-50/50")}>
                    <TableCell className={cn("sticky left-0 z-20 border-r border-b border-slate-200 text-center py-1.5", idx % 2 === 0 ? "bg-white" : "bg-slate-50/70", "group-hover:bg-blue-50/50")}>
                      <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                        {((currentPage - 1) * rowsPerPage) + idx + 1}
                      </span>
                    </TableCell>
                    {columns.map(col => {
                      let value: React.ReactNode;
                      if (col.milestone) {
                        value = milestoneParts[col.milestone.key]?.[col.part] ?? null;
                      } else {
                        value = col.render(task, companies);
                      }
                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-4 py-1.5 border-r border-b border-slate-200 text-sm whitespace-nowrap transition-colors",
                            col.highlight ? "bg-amber-50/40 group-hover:bg-amber-50/70 text-amber-800 font-medium" : "group-hover:bg-blue-50/50",
                            col.primary ? "text-slate-900 font-semibold" : !col.highlight && "text-slate-600",
                            col.id === firstHighlightId && "border-l-[3px] border-l-amber-300"
                          )}
                        >
                          {value ?? <span className="text-slate-300">—</span>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-64 bg-slate-50">
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
      </div>

      {/* Pagination */}
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
                {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)} className="text-[11px]">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-0.5">
            <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft size={12} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft size={12} /></PaginationButton>
            <div className="px-2 py-1.5 text-[11px] font-medium text-slate-600 min-w-[24px] text-center">{currentPage}</div>
            <PaginationButton onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}><ChevronRight size={12} /></PaginationButton>
            <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight size={12} /></PaginationButton>
          </div>
        </div>
      </div>
    </div>
  );
}
