// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderReportCellContent } from "./reportCellRenderers";

// Card-per-task layout for narrow (mobile) viewports. Officers already have
// authenticated access to this page - this is just a responsive alternative
// to the wide desktop table, since a table (however chunked) is unusable on a phone.
export function MobileReportView({
  allTasks, filteredColumns, renderCellValue, safeRender,
  initialRowsPerPage = 10, showTime = false, showOfficers = false,
  activeDeptId = '', onSaveStageDate,
}: any) {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = initialRowsPerPage;
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string | number>>(new Set());

  const totalPages = Math.max(1, Math.ceil(allTasks.length / rowsPerPage));

  // A refresh (or filter change) can shrink the result set out from under
  // whatever page the user was sitting on — snap back into range.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allTasks.slice(start, start + rowsPerPage);
  }, [allTasks, currentPage, rowsPerPage]);

  const primaryCol = useMemo(
    () => filteredColumns.find((c: any) => c.field === 'applicant_name' || c.field === 'company_name') || filteredColumns[0],
    [filteredColumns]
  );
  const secondaryCols = useMemo(
    () => filteredColumns.filter((c: any) => c.id !== primaryCol?.id),
    [filteredColumns, primaryCol]
  );

  const toggleExpand = (id: string | number) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (allTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 bg-white">
        <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
          <SearchX size={24} className="text-slate-500" />
        </div>
        <p className="text-[14px] font-semibold text-slate-700">No records found</p>
        <p className="text-sm mt-1 text-slate-500">Adjust your filters to see more results</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
        {paginatedTasks.map((task: any) => {
          const isExpanded = expandedTaskIds.has(task.id);
          const primaryVal = primaryCol ? safeRender(renderCellValue(task, primaryCol)) : `Task #${task.id}`;

          return (
            <div key={task.id} className="bg-white">
              <button
                onClick={() => toggleExpand(task.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-slate-50"
              >
                <div className="min-w-0">
                  <span
                    className="text-sm font-semibold text-blue-700 truncate block"
                  >
                    {primaryVal}
                  </span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {secondaryCols.length} more field{secondaryCols.length !== 1 ? 's' : ''}
                  </div>
                </div>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 bg-slate-50/60 border-t border-slate-100">
                  {secondaryCols.map((col: any) => (
                    <div key={col.id} className={cn("flex flex-col gap-1 pt-3", col.type === 'report_doc' && "bg-emerald-50/40 -mx-1 px-1 rounded")}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{col.label}</span>
                      <div className="text-sm text-slate-800">
                        {renderReportCellContent(task, col, {
                          renderCellValue, safeRender, showTime, showOfficers, activeDeptId, onSaveStageDate,
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white">
        <span className="text-[11px] text-slate-600 font-semibold">
          {((currentPage - 1) * rowsPerPage) + 1}–{Math.min(currentPage * rowsPerPage, allTasks.length)} of {allTasks.length}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs px-1 font-medium text-slate-600">{currentPage} / {totalPages}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
