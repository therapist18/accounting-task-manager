// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, Plus, Minus, Loader2, AlertTriangle, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Eye, CheckCircle2 } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"
import { cn } from "@/lib/utils"
import { formatDateValue } from "../utils/taskManagerData"

// --- INTERFACE ---
interface StandardTableProps {
  departments: any[]
  tasks: any[]
  tableType: string
  ENHANCED_TABLE_HEADERS_IMMIGRATION: any[]
  stages: any[]
  companies: Map<number, string>
  visibleHeaders: Set<string>
  visibleStageIds: Set<string>
  expandedStages: Set<string>
  expandedDocuments: Set<string>
  expandedDependants: Set<string>
  taskDependants: Map<string, any[]>
  kycDocuments: Map<string, any>
  allDocuments: any[]
  sortConfig: { key: string, direction: 'asc' | 'desc' } | null
  dataLoading: any
  error: string | null
  isPushingCase: boolean
  isDownloading: boolean
  enhancedTasksData: Map<string, any>
  getCellContent: (task: any, headerId: string) => any
  getSortedTasks: (tasks: any[]) => any[]
  getDocumentForTaskStage: (task: any, stage: any) => any
  getTaskHierarchy: (task: any) => any
  getStaffName: (userId: any) => string
  requestSort: (key: string) => void
  onTaskAction: (action: any) => void
  getKycFields: (doc: any) => Promise<any[]>
  toggleStageExpansion: (stageId: string) => void
  toggleDocumentExpansion: (docId: string) => void
  toggleDependantsExpansion: (taskId: string) => void
  renderCellContent: (row: any, task: any, columnType?: 'date' | 'actions' | 'combined') => React.ReactNode
  officers?: any[]
  readOnly?: boolean
  showStats?: boolean
  reportDocDefaults?: any[]
  allIndividualDocuments?: Record<number, any[]>
  allCompanyDocuments?: Record<number, any[]>
  handleViewReportDocument?: (colRecords: any[], docMetadata: any, task: any) => void
}

const DEFAULT_COL_WIDTH = 180;
const ACTION_WIDTH = 150;

export const StandardTable: React.FC<StandardTableProps> = ({
  tasks, tableType, ENHANCED_TABLE_HEADERS_IMMIGRATION, stages,
  visibleHeaders, visibleStageIds, expandedStages,
  expandedDocuments, expandedDependants, taskDependants, kycDocuments,
  sortConfig, dataLoading = {}, error,
  getCellContent, getSortedTasks, getDocumentForTaskStage, requestSort,
  onTaskAction, getKycFields, toggleStageExpansion,
  toggleDocumentExpansion, toggleDependantsExpansion, renderCellContent,
  readOnly = false,
  showStats = true,
  reportDocDefaults = [],
  allIndividualDocuments = {},
  allCompanyDocuments = {},
  handleViewReportDocument
}) => {
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<any>(null);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [documentFields, setDocumentFields] = useState<Map<string, any[]>>(new Map());

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const visibleCaseDetailHeaders = useMemo(() => ENHANCED_TABLE_HEADERS_IMMIGRATION.filter(header =>
    visibleHeaders.has(header.id)
  ), [ENHANCED_TABLE_HEADERS_IMMIGRATION, visibleHeaders]);

  const visibleStages = useMemo(() => stages
    .filter(stage => visibleStageIds.has(stage.id.toString()))
    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0)), [stages, visibleStageIds]);

  useEffect(() => {
    let isMounted = true;
    expandedDocuments.forEach(docId => {
      let foundDoc = null;
      visibleStages.forEach(stage => {
        const doc = stage.documents?.find(d => d.id.toString() === docId);
        if (doc) foundDoc = doc;
      });

      if (foundDoc && !documentFields.has(docId)) {
        getKycFields(foundDoc).then(fields => {
          if (isMounted) {
            setDocumentFields(prev => new Map(prev).set(docId, fields || []));
          }
        });
      }
    });
    return () => { isMounted = false; };
  }, [expandedDocuments, visibleStages, getKycFields, documentFields]);

  const sortedTasks = useMemo(() => getSortedTasks(tasks), [tasks, getSortedTasks, sortConfig]);

  const totalItems = sortedTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / rowsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalItems, rowsPerPage, totalPages, currentPage]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedTasks.slice(start, start + rowsPerPage);
  }, [sortedTasks, currentPage, rowsPerPage]);

  const taskRows = useMemo(() => {
    const rows = [];
    paginatedTasks.forEach((task, index) => {
      const globalIndex = (currentPage - 1) * rowsPerPage + index;
      rows.push({ type: 'principal', task, taskIndex: globalIndex, key: `task-${task.id}` });
      const taskDeps = taskDependants.get(task.id.toString()) || [];
      if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
        taskDeps.forEach((dep, depIndex) => {
          rows.push({ type: 'dependant', task, dependant: dep, taskIndex: globalIndex, depIndex, key: `dep-${task.id}-${dep.id || depIndex}` });
        });
      }
    });
    return rows;
  }, [paginatedTasks, taskDependants, expandedDependants, currentPage, rowsPerPage]);

  const handleConfirmDelete = async () => {
    if (taskToDelete && onTaskAction) {
      await onTaskAction({ type: 'delete', taskId: taskToDelete.id });
      setTaskToDelete(null);
    }
  };

  // --- FLAT COLUMNS GENERATOR FOR ALIGNED ROWS & STATS ---
  const flatColumns = useMemo(() => {
    const cols = [];
    visibleCaseDetailHeaders.forEach((h, idx) => cols.push({ id: `case-${h.id}`, type: 'case', header: h, idx }));

    visibleStages.forEach(stage => {
      if (!expandedStages.has(stage.id.toString()) || !stage.documents || stage.documents.length === 0) {
        cols.push({ id: `stage-${stage.id}`, type: 'stage', stage });
      } else {
        stage.documents.forEach(doc => {
          if (!expandedDocuments.has(doc.id.toString())) {
            cols.push({ id: `doc-${doc.id}`, type: 'document', stage, document: doc });
          } else {
            cols.push({ id: `doc-expanded-${doc.id}`, type: 'document', stage, document: doc });
            const fields = documentFields.get(doc.id.toString()) || [];
            fields.forEach(field => {
              cols.push({ id: `field-${doc.id}-${field.id}`, type: 'field', stage, document: doc, field });
            });
          }
        });
      }
    });

    // Add Report Doc columns
    if (reportDocDefaults && reportDocDefaults.length > 0) {
      reportDocDefaults.forEach(doc => {
        cols.push({ id: `report-doc-${doc.id}`, type: 'report_doc', reportDoc: doc });
      });
    }

    cols.push({ id: 'actions', type: 'actions' });
    return cols;
  }, [visibleCaseDetailHeaders, visibleStages, expandedStages, expandedDocuments, documentFields]);

  // Track the boundaries of the "Stages" section for distinctive borders
  const stageColsIndices = useMemo(() => {
    return flatColumns
      .map((c, i) => (['stage', 'document', 'field'].includes(c.type) ? i : -1))
      .filter(i => i !== -1);
  }, [flatColumns]);

  const firstStageColIdx = stageColsIndices.length > 0 ? stageColsIndices[0] : -1;
  const lastStageColIdx = stageColsIndices.length > 0 ? stageColsIndices[stageColsIndices.length - 1] : -1;

  // --- STATS CALCULATOR ---
  const getColStats = useCallback((col: any) => {
    if (col.type === 'actions') return { total: '-', completed: '-', missing: '-' };

    let completed = 0;
    const total = sortedTasks.length;

    sortedTasks.forEach(t => {
      if (col.type === 'case') {
        let hasValue = false;
        const v = t[col.header.id];

        if (col.header.id === 'applicant_name') hasValue = !!(t.applicant_name || t.applicant_details?.name || t.full_name);
        else if (col.header.id === 'company_name') hasValue = !!(t.company_name || t.company?.name || t.company_id);
        else if (col.header.id === 'job_description') hasValue = !!t.job_description;
        else if (col.header.id === 'task_ref' || col.header.id === 'id') hasValue = !!t.id;
        else if (col.header.id === 'case_status' || col.header.id === 'status') hasValue = !!t.status;
        else if (col.header.id === 'nationality') hasValue = !!(t.nationality || t.applicant_details?.nationality);
        else if (col.header.id === 'passport_number') hasValue = !!(t.passport_number || t.applicant_details?.passport_number);
        else hasValue = v !== null && v !== undefined && v !== '';

        if (hasValue) completed++;
      }
      else if (col.type === 'stage') {
        const status = t.stages?.[col.stage.id]?.status;
        if (['write_up_completed', 'completed', 'endorsed', 'skipped'].includes(status)) completed++;
      }
      else if (col.type === 'document') {
        const docs = t.source_document_id?.[col.stage.id];
        const arr = Array.isArray(docs) ? docs : (docs ? [docs] : []);
        if (arr.some((d: any) => d.document_id === col.document.kycId && d.indicator !== true)) completed++;
      }
      else if (col.type === 'field') {
        const docData = getDocumentForTaskStage(t, { ...col.stage, documents: [col.document] });
        if (docData && docData.length > 0 && docData[0]?.extracted_details?.[col.field.fieldName]) completed++;
      }
    });

    return { total, completed, missing: total - completed };
  }, [sortedTasks, getDocumentForTaskStage]);

  const getStageRowSpan = useCallback((stage: any) => {
    if (!expandedStages.has(stage.id.toString()) || !stage.documents || stage.documents.length === 0) return 3;
    return 1;
  }, [expandedStages]);

  const getStageColSpan = useCallback((stage: any) => {
    if (!expandedStages.has(stage.id.toString()) || !stage.documents || stage.documents.length === 0) return 1;
    return stage.documents.reduce((total, doc) => {
      return total + (expandedDocuments.has(doc.id.toString()) ? 1 + (documentFields.get(doc.id.toString())?.length || 0) : 1);
    }, 0);
  }, [expandedStages, expandedDocuments, documentFields]);

  // Column 0 is sticky at left-0; column 1's sticky offset must match column 0's rendered width.
  const secondCaseColLeftPx = useMemo(
    () => visibleCaseDetailHeaders[0]?.width || DEFAULT_COL_WIDTH,
    [visibleCaseDetailHeaders]
  );

  const getStickyClasses = (idx: number) => {
    if (idx === 0) return "sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]";
    if (idx === 1) return "sticky z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]";
    return "";
  };

  if (!tasks.length && !dataLoading.tasks) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
        <FileText className="h-12 w-12 text-slate-400" />
        <p className="mt-4 text-sm font-semibold text-slate-700">No {tableType} found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full antialiased bg-white border border-slate-200 shadow-sm overflow-hidden">
      <DeleteConfirmationDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)} onConfirm={handleConfirmDelete} title="Delete Task" confirmText="Delete" loading={dataLoading?.tasks || false} />

      <div className="h-[calc(100vh-280px)] overflow-auto custom-scrollbar relative">
        <Table className="border-separate border-spacing-0 min-w-max w-full">

          <TableHeader className="sticky top-0 z-40 bg-blue-700">
            {/* ROW 1: Case Details & Stages */}
            <TableRow className="hover:bg-transparent border-0">
              {visibleCaseDetailHeaders.map((header, idx) => {
                const w = header.width || DEFAULT_COL_WIDTH;
                return (
                  <TableHead
                    key={header.id}
                    rowSpan={3}
                    className={cn("border-r border-b border-white/30 text-center px-4 py-2.5 bg-[#376bae]", getStickyClasses(idx))}
                    style={{
                      width: w, minWidth: w, maxWidth: w,
                      ...(idx === 1 ? { left: secondCaseColLeftPx } : {})
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-white uppercase tracking-wider whitespace-normal break-words leading-snug text-left" title={header.label}>{header.label}</span>
                      <button
                        onClick={() => requestSort(header.id)}
                        className="shrink-0 rounded hover:bg-white/20 text-white p-0.5 transition-all ml-1"
                        title="Sort"
                      >
                        {sortConfig?.key === header.id
                          ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                          : <ArrowUpDown size={11} className="opacity-50 hover:opacity-100" />
                        }
                      </button>
                    </div>
                  </TableHead>
                );
              })}

              {visibleStages.map((stage, i) => (
                <TableHead
                  key={stage.id}
                  colSpan={getStageColSpan(stage)}
                  rowSpan={getStageRowSpan(stage)}
                  className={cn(
                    "border-r border-b border-white/30 text-center px-2 py-2.5 bg-[#376bae]",
                    i === 0 && "border-l-[3px] border-l-blue-400",
                    i === visibleStages.length - 1 && "border-r-[3px] border-r-blue-400"
                  )}
                  style={!expandedStages.has(stage.id.toString()) ? { width: DEFAULT_COL_WIDTH, minWidth: DEFAULT_COL_WIDTH, maxWidth: DEFAULT_COL_WIDTH } : {}}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[11px] font-semibold text-white uppercase tracking-wider whitespace-normal break-words leading-snug" title={stage.name}>{stage.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => requestSort(`stage_${stage.id}`)} className="text-white" title="Sort by Stage">
                        {sortConfig?.key === `stage_${stage.id}`
                          ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                          : <ArrowUpDown size={11} className="opacity-50 hover:opacity-100" />
                        }
                      </button>
                      {stage.documents?.length > 0 && (
                        <button onClick={() => toggleStageExpansion(stage.id.toString())} className="text-white">
                          {expandedStages.has(stage.id.toString()) ? <Minus size={12} /> : <Plus size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                </TableHead>
              ))}

              {/* Report Doc Default Columns */}
              {reportDocDefaults && reportDocDefaults.length > 0 && (
                <>
                  <TableHead
                    colSpan={reportDocDefaults.length}
                    rowSpan={1}
                    className="border-r border-b border-white/30 text-center px-2 py-2.5 bg-emerald-600 border-l-[3px] border-l-emerald-400"
                    style={{ width: DEFAULT_COL_WIDTH * reportDocDefaults.length, minWidth: DEFAULT_COL_WIDTH * reportDocDefaults.length }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">Report Documents</span>
                  </TableHead>
                </>
              )}

              <TableHead
                rowSpan={3}
                className="border-b border-white/30 text-center px-4 py-2.5 bg-[#376bae] sticky right-0 z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH, maxWidth: ACTION_WIDTH }}
              >
                <span className="text-xs font-semibold text-white uppercase tracking-wider">Actions</span>
              </TableHead>
            </TableRow>

            {/* ROW 2: Documents */}
            <TableRow className="hover:bg-transparent border-0">
              {visibleStages.flatMap((stage, stageIdx) => {
                if (!expandedStages.has(stage.id.toString()) || !stage.documents?.length) return [];

                const isFirstStage = stageIdx === 0;
                const isLastStage = stageIdx === visibleStages.length - 1;

                return stage.documents.map((doc, docIdx) => {
                  const kycData = kycDocuments.get(doc.kycId);
                  const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';
                  const isExpanded = expandedDocuments.has(doc.id.toString());

                  const isFirstDoc = isFirstStage && docIdx === 0;
                  const isLastDoc = isLastStage && docIdx === stage.documents.length - 1;

                  return (
                    <TableHead
                      key={`doc-${doc.id}`}
                      rowSpan={isExpanded ? 1 : 2}
                      colSpan={isExpanded ? 1 + (documentFields.get(doc.id.toString())?.length || 0) : 1}
                      className={cn(
                        "text-center px-3 py-2 border-r border-b border-white/30 bg-[#376bae]",
                        isFirstDoc && "border-l-[3px] border-l-blue-400",
                        isLastDoc && "border-r-[3px] border-r-blue-400"
                      )}
                      style={!isExpanded ? { width: DEFAULT_COL_WIDTH, minWidth: DEFAULT_COL_WIDTH, maxWidth: DEFAULT_COL_WIDTH } : {}}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-[11px] font-semibold text-white uppercase tracking-wider whitespace-normal break-words leading-snug" title={docDisplayName}>{docDisplayName}</span>
                        {doc.kycId && (
                          <button onClick={() => toggleDocumentExpansion(doc.id.toString())} className="shrink-0 rounded bg-slate-600 hover:bg-slate-500 text-white p-0.5">
                            {isExpanded ? <Minus size={10} /> : <Plus size={10} />}
                          </button>
                        )}
                      </div>
                    </TableHead>
                  );
                });
              })}
              {reportDocDefaults && reportDocDefaults.length > 0 && reportDocDefaults.map((doc: any) => (
                <TableHead
                  key={`report-doc-header-${doc.id}`}
                  rowSpan={2}
                  colSpan={1}
                  className="border-r border-b border-white/30 text-center px-3 py-2 bg-[#059669] border-l border-l-emerald-400/50"
                  style={{ width: DEFAULT_COL_WIDTH, minWidth: DEFAULT_COL_WIDTH, maxWidth: DEFAULT_COL_WIDTH }}
                >
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className="text-[11px] font-semibold text-white uppercase tracking-wider whitespace-normal break-words leading-snug" title={doc.documentName}>
                      {doc.documentName || 'Document'}
                    </span>
                    <span className="text-[9px] text-emerald-100 font-bold opacity-80 uppercase">
                      {doc.docType === 'individual' ? 'IND' : doc.docType === 'company' ? 'CO' : 'APP'}
                    </span>
                  </div>
                </TableHead>
              ))}
            </TableRow>

            {/* ROW 3: Fields */}
            <TableRow className="hover:bg-transparent border-0">
              {visibleStages.flatMap((stage, stageIdx) => {
                if (!expandedStages.has(stage.id.toString()) || !stage.documents?.length) return [];

                const isFirstStage = stageIdx === 0;
                const isLastStage = stageIdx === visibleStages.length - 1;

                return stage.documents.flatMap((doc, docIdx) => {
                  if (!expandedDocuments.has(doc.id.toString())) return [];

                  const fields = documentFields.get(doc.id.toString()) || [];
                  const isFirstDoc = isFirstStage && docIdx === 0;
                  const isLastDoc = isLastStage && docIdx === stage.documents.length - 1;

                  const docActionHeader = (
                    <TableHead
                      key={`doc-action-${doc.id}`}
                      className={cn(
                        "text-center px-3 py-2 border-r border-b border-white/30 bg-[#376bae]",
                        isFirstDoc && "border-l-[3px] border-l-blue-400",
                        isLastDoc && fields.length === 0 && "border-r-[3px] border-r-blue-400"
                      )}
                      style={{ width: DEFAULT_COL_WIDTH, minWidth: DEFAULT_COL_WIDTH, maxWidth: DEFAULT_COL_WIDTH }}
                    >
                      <span className="text-[10px] font-semibold text-white uppercase tracking-wider">Status</span>
                    </TableHead>
                  );

                  const fieldHeaders = fields.map((field, fIdx) => {
                    const isLastField = isLastDoc && fIdx === fields.length - 1;
                    return (
                      <TableHead
                        key={`field-${field.id}`}
                        className={cn(
                          "text-center px-3 py-2 border-r border-b border-white/30 bg-[#376bae]",
                          isLastField && "border-r-[3px] border-r-blue-400"
                        )}
                        style={{ width: DEFAULT_COL_WIDTH, minWidth: DEFAULT_COL_WIDTH, maxWidth: DEFAULT_COL_WIDTH }}
                      >
                        <span className="text-[10px] font-semibold text-white uppercase tracking-wider whitespace-normal break-words leading-snug" title={field.fieldName}>{field.fieldName}</span>
                      </TableHead>
                    );
                  });
                  return [docActionHeader, ...fieldHeaders];
                });
              })}
            </TableRow>

            {/* --- STATS ROWS --- */}
            {!dataLoading.tasks && taskRows.length > 0 && showStats && [
              { label: 'Total', bg: 'bg-slate-100', text: 'text-slate-800' },
              { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-800' },
              { label: 'Missing', bg: 'bg-rose-50', text: 'text-rose-800' }
            ].map((stat) => (
              <TableRow key={stat.label} className="border-0 hover:bg-transparent shadow-sm">
                {flatColumns.map((col, idx) => {
                  const s = getColStats(col);
                  const val = stat.label === 'Total' ? s.total : stat.label === 'Completed' ? s.completed : s.missing;
                  const colWidth = col.type === 'case' ? (col.header.width || DEFAULT_COL_WIDTH) : (col.type === 'actions' ? ACTION_WIDTH : DEFAULT_COL_WIDTH);

                  const isStageStart = idx === firstStageColIdx;
                  const isStageEnd = idx === lastStageColIdx;

                  return (
                    <TableHead
                      key={col.id}
                      className={cn(
                        "text-center py-1 px-2 border-r border-b border-slate-200 text-[11px] font-bold h-7",
                        stat.bg, stat.text,
                        col.type === 'actions' && "sticky right-0 z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                        idx < 2 && getStickyClasses(idx),
                        isStageStart && "border-l-[3px] border-l-blue-400",
                        isStageEnd && "border-r-[3px] border-r-blue-400"
                      )}
                      style={{
                        width: colWidth, minWidth: colWidth, maxWidth: colWidth,
                        ...(idx === 1 ? { left: secondCaseColLeftPx } : {})
                      }}
                    >
                      {val}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {/* --- DATA ROWS --- */}
            {dataLoading.tasks ? (
              <TableRow><TableCell colSpan={100} className="h-48 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-[#376bae]" /></TableCell></TableRow>
            ) : taskRows.length === 0 ? (
              <TableRow><TableCell colSpan={100} className="h-48 text-center text-slate-500">No records found matching criteria.</TableCell></TableRow>
            ) : (
              taskRows.map((row, rowIndex) => (
                <TableRow key={row.key} className={cn("group border-0 transition-colors", row.type === 'dependant' ? "bg-orange-50/40" : (rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/50"), "hover:bg-blue-50/50")}>
                  {flatColumns.map((col, idx) => {
                    const colWidth = col.type === 'case' ? (col.header.width || DEFAULT_COL_WIDTH) : (col.type === 'actions' ? ACTION_WIDTH : DEFAULT_COL_WIDTH);

                    const isStageStart = idx === firstStageColIdx;
                    const isStageEnd = idx === lastStageColIdx;
                    const stageBorderClasses = cn(
                      isStageStart && "border-l-[3px] border-l-blue-400",
                      isStageEnd && "border-r-[3px] border-r-blue-400"
                    );

                    // --- CASE DETAILS ---
                    if (col.type === 'case') {
                      let content = <span className="text-slate-400 text-xs">-</span>;

                      if (row.type === 'principal') {
                        content = <div className="truncate w-full text-sm">{getCellContent(row.task, col.header.id)}</div>;

                        if (col.idx === 0 && taskDependants.get(row.task.id.toString())?.length > 0) {
                          content = (
                            <div className="flex items-center justify-between w-full">
                              {content}
                              <button onClick={() => toggleDependantsExpansion(row.task.id.toString())} className={cn("h-6 w-6 rounded flex items-center justify-center shrink-0 transition-all", expandedDependants.has(row.task.id.toString()) ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                                {expandedDependants.has(row.task.id.toString()) ? <Minus size={14} /> : <Plus size={14} />}
                              </button>
                            </div>
                          )
                        }
                      } else {
                        if (['applicant_name', 'client_name'].includes(col.header.id)) content = <span className="text-sm font-semibold text-amber-900 truncate">{row.dependant.full_name} <span className="text-xs font-normal text-amber-600">({row.dependant.relationship})</span></span>;
                        else if (col.header.id === 'nationality') content = <span className="text-sm">{row.dependant.nationality || '-'}</span>;
                        else if (col.header.id === 'age') content = <span className="text-sm">{row.dependant.age || '-'}</span>;
                      }

                      return (
                        <TableCell
                          key={`${row.key}-${col.id}`}
                          className={cn("px-4 py-2.5 border-r border-b border-slate-200", col.idx < 2 ? getStickyClasses(col.idx).replace('z-30', 'z-20') : "", col.idx < 2 && (row.type === 'dependant' ? "bg-orange-50/90" : (rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/90")), stageBorderClasses)}
                          style={{
                            width: colWidth, minWidth: colWidth, maxWidth: colWidth,
                            ...(col.idx === 1 ? { left: secondCaseColLeftPx } : {})
                          }}
                        >
                          {content}
                        </TableCell>
                      );
                    }

                    // --- DEPENDANT BLANK CELLS ---
                    if (row.type === 'dependant') {
                      return (
                        <TableCell
                          key={`${row.key}-${col.id}`}
                          className={cn("text-center px-4 py-2.5 border-r border-b border-slate-200 text-slate-400 text-xs", col.type === 'actions' && "sticky right-0 bg-orange-50/90 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]", stageBorderClasses)}
                          style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                        >
                          -
                        </TableCell>
                      );
                    }

                    // --- STAGE ---
                    if (col.type === 'stage') {
                      return (
                        <TableCell key={`${row.key}-${col.id}`} className={cn("text-center px-2 py-2 border-r border-b border-slate-200", stageBorderClasses)} style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}>
                          {renderCellContent({ type: 'stage', stage: col.stage }, row.task, 'combined')}
                        </TableCell>
                      );
                    }

                    // --- REPORT DOC ---
                    if (col.type === 'report_doc') {
                      let rowEntityType = 'principal';
                      let entityId = null;
                      if (col.reportDoc.docType === 'company') {
                        rowEntityType = 'company';
                        entityId = row.task.company_id;
                      } else if (row.type === 'principal') {
                        rowEntityType = 'principal';
                        entityId = row.task.individual_id || row.task.applicant_details?.id;
                      } else if (row.type === 'dependant') {
                        rowEntityType = 'dependant';
                        entityId = row.dependant?.id;
                      }

                      const isJobLevelApplicable = row.task.report_doc_defaults?.some((d: any) => d.documentId === col.reportDoc.documentId);
                      const isEntityApplicable = col.reportDoc.appliesTo?.includes(row.type === 'principal' ? (col.reportDoc.docType === 'company' ? 'company' : 'principal') : 'dependant');
                      const isApplicable = isJobLevelApplicable && isEntityApplicable;

                      if (!isApplicable) {
                        return (
                          <TableCell
                            key={`${row.key}-${col.id}`}
                            className={cn("text-center px-2 py-2 border-r border-b border-slate-200 bg-slate-50/50 text-gray-400 italic text-[11px]")}
                            style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                          >
                            N/A
                          </TableCell>
                        );
                      }

                      const snapshot = [
                        ...(row.task.processing_requirements_documents || []),
                        ...(row.task.issuance_requirements_documents || [])
                      ];
                      const entry = snapshot.find((s: any) =>
                        s.documentTypeId === col.reportDoc.documentId &&
                        s.entityType === rowEntityType &&
                        Number(s.entityId) === Number(entityId)
                      );

                      let colRecords = [];
                      let isFromSnapshot = false;

                      if (entry) {
                        const pool = rowEntityType === 'company'
                          ? (allCompanyDocuments[entityId] || [])
                          : (allIndividualDocuments[entityId] || []);
                        colRecords = pool.filter((d: any) => (entry.documentRecordIds || []).includes(d.id));
                        isFromSnapshot = true;
                      } else {
                        const pool = rowEntityType === 'company'
                          ? (allCompanyDocuments[entityId] || [])
                          : (allIndividualDocuments[entityId] || []);
                        colRecords = pool.filter((d: any) => d.document_id === col.reportDoc.documentId);
                      }

                      const docMetadata = { display_name: col.reportDoc.documentName };
                      const hasFiles = colRecords.length > 0;

                      // NEW: Extract immigration date value if it exists
                      let immigrationDateValue = null;
                      if (hasFiles) {
                        const docRecord = colRecords[0];
                        const kycData = kycDocuments.get(col.reportDoc.documentId);
                        if (kycData?.fields) {
                          const immigrationField = kycData.fields.find((f: any) => f.isImmigrationDate);
                          if (immigrationField) {
                            const fieldName = immigrationField.fieldName || immigrationField.name || immigrationField.id;
                            immigrationDateValue = docRecord.extracted_details?.[fieldName] ||
                              docRecord.extracted_data?.[fieldName] ||
                              docRecord.edited_details?.[fieldName];
                          }
                        }
                      }

                      return (
                        <TableCell
                          key={`${row.key}-${col.id}`}
                          className={cn("text-center px-2 py-2 border-r border-b border-slate-200 bg-emerald-50/10")}
                          style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                        >
                          {hasFiles ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              {/* NEW: Render the immigration date value */}
                              {immigrationDateValue && (
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {formatDateValue ? formatDateValue(immigrationDateValue) : immigrationDateValue}
                                </span>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 py-0 px-2 bg-white text-blue-600 border-blue-200 hover:bg-blue-50 shadow-sm flex items-center gap-1 text-[10px]"
                                onClick={() => handleViewReportDocument?.(colRecords, docMetadata, row.task)}
                              >
                                <Eye className="h-3 w-3" />
                                <span>View</span>
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200 text-[9px] font-medium py-0 px-1.5">
                              Not Uploaded
                            </Badge>
                          )}
                        </TableCell>
                      );
                    }

                    // --- DOCUMENT ---
                    if (col.type === 'document') {
                      const kycData = kycDocuments.get(col.document.kycId);
                      const mockDocRow = {
                        type: 'document', stage: col.stage,
                        document: { ...col.document, stageId: col.stage.id, document_id: col.document.kycId, name: kycData?.display_name || col.document.name },
                        getValue: (t: any) => {
                          const linkedDocs = t.source_document_id?.[col.stage.id];
                          const docsArray = Array.isArray(linkedDocs) ? linkedDocs : (linkedDocs ? [linkedDocs] : []);
                          const linked = docsArray.find((d: any) => d.document_id === col.document.kycId);
                          return { hasDocument: !!linked, hasIndicator: linked?.indicator === true, isApplicable: true, status: linked?.indicator ? 'Preview Not Available' : (linked ? 'Linked' : 'Not Linked'), documentInfo: linked ? { name: linked.name, type: linked.type } : null };
                        }
                      };
                      return (
                        <TableCell key={`${row.key}-${col.id}`} className={cn("text-center px-3 py-2.5 border-r border-b border-slate-200 bg-slate-50/30", stageBorderClasses)} style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}>
                          {renderCellContent(mockDocRow, row.task, 'date')}
                        </TableCell>
                      );
                    }

                    // --- FIELD ---
                    if (col.type === 'field') {
                      const mockFieldRow = {
                        type: 'field', stage: col.stage, document: col.document, field: col.field,
                        getValue: (t: any) => {
                          const linked = getDocumentForTaskStage(t, { ...col.stage, documents: [col.document] });
                          return { value: linked && linked.length > 0 && !linked[0].indicator ? (linked[0].extracted_details?.[col.field.fieldName] || 'N/A') : 'N/A' };
                        }
                      };
                      return (
                        <TableCell key={`${row.key}-${col.id}`} className={cn("text-center px-3 py-2.5 border-r border-b border-slate-200", stageBorderClasses)} style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}>
                          {renderCellContent(mockFieldRow, row.task, 'date')}
                        </TableCell>
                      );
                    }

                    // --- ACTIONS ---
                    if (col.type === 'actions') {
                      return (
                        <TableCell
                          key={`${row.key}-${col.id}`}
                          className={cn("text-center px-4 py-2.5 border-b border-slate-200 sticky right-0 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]", rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/90", stageBorderClasses)}
                          style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                        >
                          {renderCellContent({ type: 'actions' }, row.task, 'actions')}
                        </TableCell>
                      );
                    }

                    return null;
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {!dataLoading.tasks && totalItems > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/80 sticky bottom-0 w-full z-30">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Rows per page:</span>
              <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="h-7 w-16 rounded border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 px-1 cursor-pointer">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="h-4 border-l border-slate-300"></div>
            <span className="text-xs text-slate-600">
              Showing <span className="font-semibold text-slate-800">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="font-semibold text-slate-800">{Math.min(currentPage * rowsPerPage, totalItems)}</span> of <span className="font-semibold text-slate-800">{totalItems}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 font-medium">Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}