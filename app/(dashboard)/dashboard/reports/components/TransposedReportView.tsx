"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Briefcase, FileText, AlertTriangle, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DATA_COLUMN_WIDTH = "w-[150px]";
const INDEX_WIDTH = "w-14 min-w-14 max-w-14";
const LABEL_WIDTH = "w-[280px] min-w-[280px] max-w-[280px]";

// --- Safe Rendering Function (Matching EnhancedTable) ---
const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string' || typeof content === 'number') {
    // Handle special styling for 'Undedicated' status
    if (typeof content === 'string' && content === 'Undedicated') {
      return <span className="text-red-600 font-medium">{content}</span>;
    }
    return content;
  }
  if (content === null || content === undefined) return null;
  if (Array.isArray(content)) {
    return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  }
  if (typeof content === 'object') {
    if ('status' in content) {
      const status = content.status;
      if (typeof status === 'string' || typeof status === 'number') {
        if (status === 'Undedicated') {
          return <span className="text-red-600 font-medium">{status}</span>;
        }
        return status;
      }
      if (React.isValidElement(status)) return status;
      if (!status) return null;
      return JSON.stringify(status);
    }
    return <span className="text-xs text-gray-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
  }
  return String(content);
};

interface TransposedReportViewProps {
  paginatedTasks: any[];
  transposedRows: any[];
  currentPage: number;
  itemsPerPage: number;
  expandedSections: Set<string>;
  renderCellValue: (task: any, col: any) => React.ReactNode;
  toggleSection: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  initialColumnsPerPage?: number;
}

export function TransposedReportView({
  paginatedTasks,
  transposedRows,
  currentPage,
  itemsPerPage,
  expandedSections,
  renderCellValue,
  toggleSection,
  loading = false,
  error = null,
  initialColumnsPerPage = 10
}: TransposedReportViewProps) {

  // Column pagination state
  const [columnsPage, setColumnsPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);

  // Reset columns page when paginatedTasks changes
  React.useEffect(() => {
    setColumnsPage(1);
  }, [paginatedTasks]);

  // Calculate pagination
  const totalColumns = paginatedTasks.length;
  const totalColumnsPages = Math.max(1, Math.ceil(totalColumns / columnsPerPage));

  const paginatedColumns = useMemo(() => {
    const startIndex = (columnsPage - 1) * columnsPerPage;
    return paginatedTasks.slice(startIndex, startIndex + columnsPerPage);
  }, [paginatedTasks, columnsPage, columnsPerPage]);

  // Pagination callbacks
  const handleNextColumnsPage = useCallback(() => setColumnsPage(prev => Math.min(prev + 1, totalColumnsPages)), [totalColumnsPages]);
  const handlePreviousColumnsPage = useCallback(() => setColumnsPage(prev => Math.max(prev - 1, 1)), []);
  const handleFirstColumnsPage = useCallback(() => setColumnsPage(1), []);
  const handleLastColumnsPage = useCallback(() => setColumnsPage(totalColumnsPages), [totalColumnsPages]);
  const handleColumnsPerPageChange = useCallback((value: string) => {
    setColumnsPerPage(parseInt(value, 10));
    setColumnsPage(1);
  }, []);

  // Separate Task Details (to be placed in Header) from Body Rows
  const isHeaderRow = (row: any) => row.id === 'task_details' || row.type === 'task';
  const headerRows = transposedRows.filter(isHeaderRow);
  const bodyRows = transposedRows.filter(row => !isHeaderRow(row));

  let dataRowCounter = 1;

  return (
    <div className="space-y-4">
      {/* Column Pagination Controls */}
      {totalColumns > 0 && (
        <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-sm text-slate-500">
            Showing{' '}
            <span className="font-bold text-slate-800">{((columnsPage - 1) * columnsPerPage) + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(columnsPage * columnsPerPage, totalColumns)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalColumns}</span> columns
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Columns:</span>
              <Select
                value={String(columnsPerPage)}
                onValueChange={handleColumnsPerPageChange}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue placeholder={columnsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 50].map(size => (
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
                onClick={handleFirstColumnsPage}
                disabled={columnsPage === 1}
                aria-label="Go to first page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePreviousColumnsPage}
                disabled={columnsPage === 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 text-sm font-bold">Page {totalColumnsPages > 0 ? columnsPage : 0} / {Math.max(1, totalColumnsPages)}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextColumnsPage}
                disabled={columnsPage >= totalColumnsPages}
                aria-label="Go to next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleLastColumnsPage}
                disabled={columnsPage >= totalColumnsPages}
                aria-label="Go to last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-2 border-slate-300 rounded-b-lg rounded-tl-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">

          <TableHeader className="sticky top-0 z-30 bg-slate-100/80 backdrop-blur-sm">

            {/* Section Header for Task Details (Collapsible UI) */}
            {headerRows.find(r => r.id === 'task_details') && (
              <TableRow className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200">
                <TableCell colSpan={paginatedTasks.length + 2} className="p-0">
                  <div className="flex items-center justify-between px-3 py-2 sticky left-0 w-max min-w-full">
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-5 w-5 text-slate-600" />
                      <span className="font-bold text-slate-700 text-lg">Task Details</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-300" onClick={() => toggleSection('task_details')}>
                      {expandedSections.has('task_details') ? <Minus className="h-4 w-4 text-slate-600" /> : <Plus className="h-4 w-4 text-slate-600" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Render Task Detail Fields as normal table headers */}
            {expandedSections.has('task_details') && headerRows.filter(r => r.type === 'task').map((row, idx) => (
              <TableRow key={row.id} className="bg-blue-600 text-white group border-b border-slate-200">

                <TableCell className={`sticky left-0 z-40 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center ${INDEX_WIDTH}`}>
                  {idx + 1}
                </TableCell>

                <TableCell className={`sticky left-14 z-40 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 ${LABEL_WIDTH}`}>
                  {row.label}
                </TableCell>

                {paginatedColumns.map((task) => (
                  <TableCell key={`${row.id}-${task.id}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 ${DATA_COLUMN_WIDTH} ${task.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    {safeRender(renderCellValue(task, row))}
                  </TableCell>
                ))}

              </TableRow>
            ))}

            {/* Fallback Identifiers (Visible only if Task Details is completely collapsed) */}
            {!expandedSections.has('task_details') && (
              <TableRow className="bg-blue-600 text-white group border-b border-slate-200">
                <TableCell className={`sticky left-0 z-40 bg-blue-600 text-white border border-gray-100 font-medium text-sm p-2 text-center ${INDEX_WIDTH}`}>
                  #
                </TableCell>
                <TableCell className={`sticky left-14 z-40 bg-blue-600 text-white border border-gray-100 font-medium text-sm p-2 ${LABEL_WIDTH}`}>
                  Task Identifiers
                </TableCell>
                {paginatedColumns.map((task, idx) => (
                  <TableCell key={`fallback-${task.id}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 ${DATA_COLUMN_WIDTH} ${task.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    <div className="flex flex-col items-center justify-center gap-1 p-1">
                      <span className="font-semibold text-center" title={task.applicant_name}>
                        {task.applicant_name || 'N/A'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${task.type === 'dependant' ? 'bg-orange-600/50 border-orange-400 text-white' : 'bg-blue-600/50 border-blue-400 text-white'}`}>
                        ID: {task.id}
                      </Badge>
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableHeader>

          <TableBody className="divide-y divide-slate-200">
            {loading ? (
              <TableRow>
                <TableCell colSpan={paginatedColumns.length + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Loading...</div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={paginatedColumns.length + 2} className="h-32 text-center text-red-600">
                  <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                </TableCell>
              </TableRow>
            ) : paginatedTasks.length > 0 ? bodyRows.map((row, rIdx) => {

              // --- SECTION HEADER ROWS (Time Tracking, Stages, etc.) ---
              if (row.type === 'section_header') {
                const Icon = row.icon || Briefcase;
                const isFilterNA = row.filterApplicable === false;

                return (
                  <TableRow key={row.id} className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200">
                    <TableCell colSpan={paginatedColumns.length + 2} className="p-0">
                      <div className="flex items-center justify-between px-3 py-2 sticky left-0 w-max min-w-full">
                        <div className="flex items-center gap-3">
                          <Icon className={cn("h-5 w-5", isFilterNA ? "text-amber-600" : "text-slate-600")} />
                          <span className="font-bold text-slate-700 text-lg">{row.label}</span>
                          {isFilterNA && (
                            <Badge variant="secondary" className="bg-amber-500 text-white hover:bg-amber-600 text-xs py-0 h-5">
                              FILTER N/A
                            </Badge>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-300" onClick={() => toggleSection(row.id)}>
                          {expandedSections.has(row.id) ? <Minus className="h-4 w-4 text-slate-600" /> : <Plus className="h-4 w-4 text-slate-600" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              // --- STANDARD DATA ROWS ---
              const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
              const hoverBg = 'hover:bg-blue-50/50';
              const baseBgClass = rowBg.split('/')[0]; // Isolate base class for sticky cells

              const currentIndex = dataRowCounter++;

              return (
                <TableRow key={rIdx} className={`${rowBg} ${hoverBg} group border-b border-slate-200`}>

                  <TableCell className={`sticky left-0 z-20 ${baseBgClass} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center ${INDEX_WIDTH}`}>
                    {row.stageOrder || currentIndex}
                  </TableCell>

                  <TableCell className={`sticky left-14 z-20 ${baseBgClass} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 ${LABEL_WIDTH}`}>
                    <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
                      <span className={row.type === 'stage' ? 'font-semibold' : ''}>
                        {safeRender(row.label)}
                      </span>
                    </div>
                  </TableCell>

                  {paginatedColumns.map(task => (
                    <TableCell key={`${row.id}-${task.id}`} className={`text-center text-sm py-1 px-2 align-middle border-l-4 border-t border-b border-gray-100 ${DATA_COLUMN_WIDTH} ${task.type === 'dependant' ? 'bg-orange-50/50' : ''}`}>
                      <div className="w-full mx-auto flex items-center justify-center min-h-[24px]">
                        {safeRender(renderCellValue(task, row))}
                      </div>
                    </TableCell>
                  ))}

                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={paginatedColumns.length + 2} className="h-32 text-center text-slate-500 bg-slate-50/50">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="h-12 w-12 text-slate-400" />
                    <div className="text-sm font-semibold text-slate-700">No data available</div>
                    <p className="text-sm text-slate-500">Tasks will appear here when available.</p>
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