// @ts-nocheck
"use client"

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap, Trash2, ChevronLeft, ChevronRight, FileIcon, Eye, EyeOff } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"

// --- Helper Functions & Constants ---

const DEBUG = process.env.NODE_ENV !== 'production';

const debugLog = (...args: any[]) => {
  if (DEBUG) {
    console.debug('[EnhancedTable]', ...args);
  }
};

const getDocumentCacheKey = (taskId: string | number, stageId: string) => `${taskId}:${stageId}`;

// --- Document Processing Logic (Optimized) ---

const processDocumentsForTasks = (tasks: any[], allDocuments: any[] = []) => {
  const documentMap = new Map<string, any[]>();

  if (!tasks || tasks.length === 0) {
    return documentMap;
  }

  const allDocsById = new Map(allDocuments.map(d => [d?.id || d?.document_id, d]));

  for (const task of tasks) {
    if (!task?.id) continue;

    // Process documents from task.documents array
    if (Array.isArray(task.documents)) {
      for (const doc of task.documents) {
        if (!doc.stageId) continue;
        const cacheKey = getDocumentCacheKey(task.id, doc.stageId);
        if (!documentMap.has(cacheKey)) documentMap.set(cacheKey, []);

        const docId = doc.document_id || doc.id;
        documentMap.get(cacheKey)!.push({
          ...doc,
          id: doc.id || `${task.id}-${doc.stageId}-${Math.random().toString(36).substr(2, 9)}`,
          document_id: docId,
          type: 'document',
          file_path: doc.file_path || doc.path || doc.url,
          ...(allDocsById.get(docId) || {}),
        });
      }
    }

    // Process source_document_id object
    if (task.source_document_id && typeof task.source_document_id === 'object') {
      for (const [stageId, sourceDocs] of Object.entries(task.source_document_id)) {
        if (!stageId || !sourceDocs) continue;

        const docsArray = Array.isArray(sourceDocs) ? sourceDocs : [sourceDocs];
        const cacheKey = getDocumentCacheKey(task.id, stageId);
        if (!documentMap.has(cacheKey)) documentMap.set(cacheKey, []);

        const processedDocs = docsArray.map((doc: any) => {
          const docId = typeof doc === 'object' ? (doc.document_id || doc.id) : doc;
          return {
            id: typeof doc === 'object' ? doc.id : `${task.id}-${stageId}-${docId}`,
            stageId,
            document_id: docId,
            type: 'document',
            file_path: typeof doc === 'object' ? (doc.file_path || doc.path || doc.url) : undefined,
            ...(allDocsById.get(docId) || {}),
            ...(typeof doc === 'object' ? doc : {}),
          };
        });
        documentMap.get(cacheKey)!.push(...processedDocs);
      }
    }
  }
  return documentMap;
};


// --- Child Components (Memoized for Performance) ---

const DocumentCell = React.memo(({ task, stageId, processedDocuments }) => {
  const cacheKey = getDocumentCacheKey(task.id, stageId);
  const documents = processedDocuments.get(cacheKey) || [];

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center p-2">
        <span className="text-sm text-gray-500">-</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <button
        className="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50"
        onClick={(e) => {
          e.stopPropagation();
          // You can add document preview logic here
          console.log('Preview document:', documents[0]);
        }}
        title="Preview document"
      >
        <Eye className="h-4 w-4" />
      </button>
    </div>
  );
});

const TableHeaderCell = React.memo(({ item, header, getCellContent }) => {
  const renderContent = () => {
    if (item.type === 'principal') {
      return getCellContent(item.task, header.id);
    }
    // Dependant logic
    switch (header.id) {
      case 'applicant_name':
        return (
          <div className="flex flex-col">
            <span>{item.dependant.full_name || 'N/A'}</span>
            <span className="text-xs text-gray-500">{item.dependant.relationship || 'Dependant'}</span>
          </div>
        );
      case 'nationality':
        return item.dependant.nationality || 'N/A';
      case 'age':
        return item.dependant.age?.toString() || 'N/A';
      case 'case_status':
        return (
          <div className="flex flex-col">
            <span className="text-sm">{item.dependant.relationship || 'Dependant'}</span>
            <span className="text-xs text-gray-500">{item.dependant.nationality || ''}</span>
          </div>
        );
      default:
        return <span className="text-sm text-gray-400">-</span>;
    }
  };

  const content = renderContent();

  // Ensure we're not rendering objects directly
  if (content && typeof content === 'object' && !React.isValidElement(content)) {
    return JSON.stringify(content);
  }

  return content;
});

const MemoizedTableRow = React.memo(({
  row,
  rowIndex,
  paginatedHeaderStructure,
  expandedSections,
  toggleSectionExpansion,
  toggleStageExpansion,
  toggleDocumentExpansion,
  onDeleteTask,
  handleAutomationClick,
  setTaskToDelete,
  processedDocuments,
  kycDocuments,
  renderCellContent
}) => {
  const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
  const hoverBg = 'hover:bg-blue-50/50';

  if (row.type === 'section_header') {
    const Icon = row.icon;
    return (
      <TableRow className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200">
        <TableCell colSpan={paginatedHeaderStructure.length + 2} className="p-0">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-slate-600" />
              <span className="font-bold text-slate-700 text-lg">{row.label}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleSectionExpansion(row.id)}>
              {expandedSections.has(row.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className={`${rowBg} ${hoverBg} group border-b border-slate-200`}>
      <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-20`}>
        {row.stageOrder || (row.type !== 'stage' && row.type !== 'document' && row.type !== 'field' && row.type !== 'actions' ? (rowIndex + 1) : '')}
      </TableCell>
      <TableCell className={`sticky left-8 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 min-w-[400px]`}>
        <div className="flex items-center gap-2 justify-between">
          <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
            <span className={row.type === 'stage' ? 'font-semibold' : ''}>{row.label}</span>
            {row.type === 'principal' && onDeleteTask && row.task?.id && (
              <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-400 hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setTaskToDelete(row.task); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {row.type === 'stage' && row.stage?.documents?.length > 0 && (
            <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800" onClick={() => toggleStageExpansion(row.stage.id)}>
              {expandedSections.has(row.stage.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </Button>
          )}
          {row.type === 'requirement' && (
            <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800" onClick={() => handleAutomationClick(row.classId, row.requirementId, row.taskId)}>
              <Zap className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
      {paginatedHeaderStructure.map((item, colIndex) => (
        <TableCell key={`${row.key}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}>
          {item.type === 'principal' ? (
            row.type === 'document' && item.task && row.document?.stageId ? (
              <DocumentCell
                task={item.task}
                stageId={row.document.stageId}
                processedDocuments={processedDocuments}
                kycDocuments={kycDocuments}
              />
            ) : (
              renderCellContent(row, item.task)
            )
          ) : (
            <span className="text-sm text-gray-400">-</span>
          )}
        </TableCell>
      ))}
    </TableRow>
  );
});


// --- Main EnhancedTable Component ---

interface EnhancedTableProps {
  tasks: any[]
  tableType: string
  ENHANCED_TABLE_HEADERS_IMMIGRATION: any[]
  visibleHeaders: Set<string>
  taskDependants: Map<string, any[]>
  expandedDependants: Set<string>
  expandedSections: Set<string>
  tableRows: any[]
  loading: boolean
  error: string | null
  getCellContent: (task: any, headerId: string) => any
  renderCellContent: (row: any, task: any) => any
  toggleSectionExpansion: (sectionId: string) => void
  toggleStageExpansion: (stageId: string) => void
  toggleDocumentExpansion: (docId: string) => void
  onDeleteTask?: (task: any) => void
  initialColumnsPerPage?: number;
  allDocuments?: any[];
  kycDocuments?: Map<string, any>;
}

export const EnhancedTable: React.FC<EnhancedTableProps> = ({
  tasks,
  tableType,
  ENHANCED_TABLE_HEADERS_IMMIGRATION,
  visibleHeaders,
  taskDependants,
  expandedDependants,
  expandedSections,
  tableRows,
  loading,
  error,
  getCellContent,
  renderCellContent,
  toggleSectionExpansion,
  toggleStageExpansion,
  toggleDocumentExpansion,
  onDeleteTask,
  initialColumnsPerPage = 10,
  allDocuments = [],
  kycDocuments = new Map(),
}) => {
  const didLogRef = useRef(false);
  useEffect(() => {
    if (DEBUG && !didLogRef.current) {
      console.groupCollapsed(`[EnhancedTable] Initializing with ${tasks.length} tasks`);
      console.log('Tasks:', tasks.length);
      console.log('KYC Documents:', kycDocuments.size);
      if (kycDocuments.size > 0) {
        console.log('Sample KYC IDs:', Array.from(kycDocuments.keys()).slice(0, 3));
      }
      console.groupEnd();
      didLogRef.current = true;
    }
  }, [tasks, kycDocuments]);

  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<any>(null);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [showNAStages, setShowNAStages] = useState(false);

  // Memoized derived data
  const processedDocuments = useMemo(() => processDocumentsForTasks(tasks, allDocuments), [tasks, allDocuments]);

  const headerStructure = useMemo(() => {
    return tasks.flatMap(task => {
      const principal = { type: 'principal', task, key: `principal-${task.id}` };
      const deps = taskDependants.get(task.id.toString()) || [];
      if (expandedDependants.has(task.id.toString()) && deps.length > 0) {
        const dependants = deps.map((dep, index) => ({ type: 'dependant', task, dependant: dep, index, key: `dep-${task.id}-${dep.id || index}` }));
        return [principal, ...dependants];
      }
      return [principal];
    });
  }, [tasks, taskDependants, expandedDependants]);

  const visibleCaseDetailHeaders = useMemo(() =>
    ENHANCED_TABLE_HEADERS_IMMIGRATION.filter(header => visibleHeaders.has(header.id)),
    [ENHANCED_TABLE_HEADERS_IMMIGRATION, visibleHeaders]
  );

  const totalColumns = headerStructure.length;
  const totalPages = Math.ceil(totalColumns / columnsPerPage);

  const paginatedHeaderStructure = useMemo(() => {
    const startIndex = (currentPage - 1) * columnsPerPage;
    return headerStructure.slice(startIndex, startIndex + columnsPerPage);
  }, [headerStructure, currentPage, columnsPerPage]);

  const filteredTableRows = useMemo(() => {
    if (showNAStages) {
      return tableRows;
    }
    return tableRows.filter(row => !(row.type === 'stage' && row.isNA));
  }, [tableRows, showNAStages]);

  useEffect(() => {
    console.log('EnhancedTable - Rows built:', {
      rowCount: tableRows.length,
      firstFewRows: tableRows.slice(0, 5).map(r => ({
        key: r.key,
        type: r.type,
        label: r.label,
        stageId: r.stage?.id,
        stageName: r.stage?.name
      }))
    });
  }, [tableRows]);

  const visibleStages = useMemo(() => {
    const filtered = tableRows.filter(row => row.type === 'stage' && !row.isNA);
    console.log('EnhancedTable - visibleStages:', {
      allStages: tableRows.filter(row => row.type === 'stage').map(s => ({ id: s.stage?.id, name: s.stage?.name, status: s.stage?.status })),
      visibleStageIds: Array.from(expandedSections),
      filteredStages: filtered.map(s => ({ id: s.stage?.id, name: s.stage?.name, status: s.stage?.status }))
    });
    return filtered.sort((a, b) => (a.stage?.order_num || 0) - (b.stage?.order_num || 0));
  }, [tableRows, expandedSections]);

  // Callbacks
  const handleAutomationClick = useCallback((classId: string, requirementId: number, taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setSelectedRequirement({
        classId,
        requirementId,
        subDeptId: task.subdepartment?.id?.toString() || task.subdepartment_id?.toString() || task.sub_dept_id?.toString() || '',
        taskId,
        task
      });
      setAutomationDialogOpen(true);
    }
  }, [tasks]);

  const handleConfirmDelete = useCallback(async () => {
    if (taskToDelete && onDeleteTask) {
      try {
        await onDeleteTask(taskToDelete);
      } catch (err) {
        console.error('Error in delete confirmation:', err);
      }
    }
    setTaskToDelete(null);
  }, [taskToDelete, onDeleteTask]);

  const handleNextPage = useCallback(() => setCurrentPage(prev => Math.min(prev + 1, totalPages)), [totalPages]);
  const handlePreviousPage = useCallback(() => setCurrentPage(prev => Math.max(prev - 1, 1)), []);

  const handleColumnsPerPageChange = useCallback((value: string) => {
    setColumnsPerPage(parseInt(value, 10));
    setCurrentPage(1);
  }, []);


  // Render logic
  if (!tasks.length && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
        <FileText className="h-12 w-12 text-slate-400" />
        <p className="mt-4 font-semibold text-slate-700">No {tableType} found</p>
        <p className="text-sm text-slate-500">Tasks with this status will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DeleteConfirmationDialog
        open={!!taskToDelete}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete Task"
        loading={loading}
      />

      <div className="flex items-center justify-end gap-4 px-4 py-2 bg-slate-50 border-b-2 border-slate-300">
        {/* === MODIFICATION START: Integrated Pagination Controls === */}
        {totalColumns > columnsPerPage && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Showing <strong>{Math.min((currentPage - 1) * columnsPerPage + 1, totalColumns)}</strong>-<strong>{Math.min(currentPage * columnsPerPage, totalColumns)}</strong> of <strong>{totalColumns}</strong> columns
            </span>
            <span className="text-sm text-slate-600">Columns:</span>
            <Select onValueChange={handleColumnsPerPageChange} defaultValue={columnsPerPage.toString()}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40].map(val => <SelectItem key={val} value={val.toString()}>{val}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8" onClick={handlePreviousPage} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="h-8" onClick={handleNextPage} disabled={currentPage >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
        {/* === MODIFICATION END === */}
      </div>

      <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            {expandedSections.has('case_details') && visibleCaseDetailHeaders.map((header, index) => (
              <TableRow key={header.id} className="bg-blue-600 text-white group border-b border-slate-200">
                <TableCell className="sticky left-0 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center w-20">
                  {index + 1}
                </TableCell>
                <TableCell className="sticky left-8 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 min-w-[400px]">
                  {header.label}
                </TableCell>
                {paginatedHeaderStructure.map((item) => (
                  <TableCell key={`${header.id}-${item.key}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    <TableHeaderCell item={item} header={header} getCellContent={getCellContent} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-slate-200">
            {loading ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Loading...</div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length + 2} className="h-32 text-center text-red-600">
                  <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                </TableCell>
              </TableRow>
            ) : (
              filteredTableRows.map((row, index) => (
                <MemoizedTableRow
                  key={row.key}
                  row={row}
                  rowIndex={index}
                  paginatedHeaderStructure={paginatedHeaderStructure}
                  expandedSections={expandedSections}
                  toggleSectionExpansion={toggleSectionExpansion}
                  toggleStageExpansion={toggleStageExpansion}
                  toggleDocumentExpansion={toggleDocumentExpansion}
                  onDeleteTask={onDeleteTask}
                  setTaskToDelete={setTaskToDelete}
                  handleAutomationClick={handleAutomationClick}
                  processedDocuments={processedDocuments}
                  kycDocuments={kycDocuments}
                  renderCellContent={renderCellContent}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedRequirement && (
        <AutomationMappingDialog
          isOpen={automationDialogOpen}
          onClose={() => setAutomationDialogOpen(false)}
          classId={selectedRequirement.classId}
          requirementId={selectedRequirement.requirementId.toString()}
          taskId={selectedRequirement.taskId}
          subDeptId={selectedRequirement.subDeptId}
          task={selectedRequirement.task}
          isSubclass={!!selectedRequirement.task?.subclass_id}
          subclassId={selectedRequirement.task?.subclass_id?.toString()}
        />
      )}
    </div>
  )
}