"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, ArrowUpDown, Briefcase, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

const COLUMN_WIDTH_CLASS = "w-[200px] min-w-[200px] max-w-[200px]";
const INDEX_WIDTH_CLASS = "w-14 min-w-14 max-w-14";

interface StandardReportViewProps {
  allTasks: any[];
  filteredColumns: any[];
  columnGroups: any[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  expandedStageColumns: Set<string>;
  renderCellValue: (task: any, col: any) => React.ReactNode;
  safeRender: (content: any) => React.ReactNode;
  handleSort: (columnId: string) => void;
  toggleStageColumns: (stageId: string) => void;
  isStageApplicableToCurrentFilter: (stageId: string) => boolean;
  initialRowsPerPage?: number;
}

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
  initialRowsPerPage = 25
}: StandardReportViewProps) {

  // Row pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  // Reset to page 1 when allTasks changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [allTasks]);

  // Calculate pagination
  const totalRows = allTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return allTasks.slice(startIndex, startIndex + rowsPerPage);
  }, [allTasks, currentPage, rowsPerPage]);

  // Pagination callbacks
  const handleNextPage = useCallback(() => setCurrentPage(prev => Math.min(prev + 1, totalPages)), [totalPages]);
  const handlePreviousPage = useCallback(() => setCurrentPage(prev => Math.max(prev - 1, 1)), []);
  const handleFirstPage = useCallback(() => setCurrentPage(1), []);
  const handleLastPage = useCallback(() => setCurrentPage(totalPages), [totalPages]);
  const handleRowsPerPageChange = useCallback((value: string) => {
    setRowsPerPage(parseInt(value, 10));
    setCurrentPage(1);
  }, []);
  return (
    <div className="space-y-4">
      {/* Row Pagination Controls */}
      {totalRows > 0 && (
        <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-sm text-slate-500">
            Showing{' '}
            <span className="font-bold text-slate-800">{((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * rowsPerPage, totalRows)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalRows}</span> rows
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Rows:</span>
              <Select
                value={String(rowsPerPage)}
                onValueChange={handleRowsPerPageChange}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue placeholder={rowsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(size => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleFirstPage}
                disabled={currentPage === 1}
                aria-label="Go to first page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 text-sm font-bold">Page {totalPages > 0 ? currentPage : 0} / {Math.max(1, totalPages)}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
                aria-label="Go to next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleLastPage}
                disabled={currentPage >= totalPages}
                aria-label="Go to last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-2 border-slate-300 rounded-b-lg rounded-tl-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <Table className="border-separate border-spacing-0 w-full min-w-max">
          <TableHeader className="sticky top-0 z-30 shadow-sm backdrop-blur-md">

            {/* --- GROUP HEADER ROW --- */}
            <TableRow className="bg-slate-200 border-y-2 border-slate-400">
              <TableHead className={`${INDEX_WIDTH_CLASS} sticky left-0 z-40 bg-slate-200 border-r border-slate-300 text-center font-bold text-slate-500 text-xs`}>
                #
              </TableHead>
              {columnGroups.map((group, i) => (
                <TableHead
                  key={i}
                  colSpan={group.span}
                  className={cn(
                    "text-center font-bold border-r border-slate-300 last:border-r-0 py-2 text-sm text-slate-700",
                    !group.applicable ? 'bg-amber-50/80 text-amber-800' : 'bg-slate-200'
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    {group.label}
                    {!group.applicable && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                        FILTER N/A
                      </Badge>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>

            {/* --- COLUMN HEADER ROW --- */}
            <TableRow className="bg-blue-600 text-white">
              <TableHead className={`${INDEX_WIDTH_CLASS} sticky left-0 z-40 bg-blue-600 border-r border-blue-500 text-center text-white font-semibold text-xs`}>
                IDX
              </TableHead>
              {filteredColumns.map(col => {
                const isColFilterNA = col.stageId ? !isStageApplicableToCurrentFilter(col.stageId) : false;

                return (
                  <TableHead
                    key={col.id}
                    onClick={() => handleSort(col.id)}
                    className={cn(
                      `${COLUMN_WIDTH_CLASS} whitespace-nowrap px-3 py-2.5 font-medium text-sm border-r border-blue-500/50 cursor-pointer transition-colors group select-none`,
                      isColFilterNA ? 'bg-blue-700/80 text-blue-100' : 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate">{col.label}</span>

                        {isColFilterNA && (
                          <Badge variant="outline" className="bg-blue-800 text-blue-200 border-blue-400 text-[10px] px-1 py-0 h-4 shrink-0">
                            N/A
                          </Badge>
                        )}

                        {col.hasSubColumns && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                            className="h-5 w-5 hover:bg-blue-800/50 text-white shrink-0 transition-colors p-0 rounded-sm"
                          >
                            {expandedStageColumns.has(col.stageId) ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>

                      {/* Subtle Sort Icon */}
                      <ArrowUpDown className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-all duration-200",
                        sortConfig?.key === col.id
                          ? "text-white opacity-100 scale-110"
                          : "text-blue-200 opacity-0 group-hover:opacity-100 -translate-y-1 group-hover:translate-y-0"
                      )} />
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-slate-100 bg-white">
            {paginatedTasks.length > 0 ? paginatedTasks.map((task, idx) => {

              // Determine row background for seamless sticky column hovering
              const isEven = idx % 2 === 0;
              const rowBg = isEven ? 'bg-white' : 'bg-slate-50/60';
              const hoverBg = 'hover:bg-blue-50/50';
              const baseBgClass = rowBg.split('/')[0];

              return (
                <TableRow key={task.id} className={`${rowBg} ${hoverBg} group border-b border-slate-200 transition-colors`}>

                  {/* Sticky Index Cell */}
                  <TableCell className={`${INDEX_WIDTH_CLASS} sticky left-0 z-20 ${baseBgClass} group-hover:bg-blue-50/50 border-r border-slate-200 font-medium text-xs text-center text-slate-500`}>
                    {(currentPage - 1) * rowsPerPage + idx + 1}
                  </TableCell>

                  {/* Data Cells */}
                  {filteredColumns.map(col => (
                    <TableCell key={col.id} className={`${COLUMN_WIDTH_CLASS} border-r border-slate-100 px-3 py-2.5 text-sm text-slate-700 align-middle`}>
                      <div className="truncate w-full flex items-center min-h-[24px]">
                        {safeRender(renderCellValue(task, col))}
                      </div>
                    </TableCell>
                  ))}

                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={filteredColumns.length + 1} className="h-[40vh] text-center bg-slate-50/30">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <SearchX className="h-12 w-12 mb-4 text-slate-300" strokeWidth={1.5} />
                    <p className="text-base font-semibold text-slate-600">No matching tasks found</p>
                    <p className="text-sm text-slate-500 mt-1">Try adjusting your search or modifying the active filters above.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}