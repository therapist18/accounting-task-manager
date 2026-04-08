// @ts-nocheck
"use client"

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileIcon, Eye, EyeOff } from "lucide-react"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"
import { getInheritedOfficer } from "../../departments/departments/database"

// --- Helper Functions & Constants ---

const DEBUG = process.env.NODE_ENV !== 'production';

// Helper function to get inherited officer for a task
const getInheritedOfficerForTask = (task: any, departments: any[]) => {
  if (!task || !departments.length) return null;

  const department = departments.find(d =>
    d.id === task.department_id || d.id === task.department?.id
  );
  if (!department) return null;

  const subdepartment = department.tm_subdepartments?.find(s =>
    s.id === task.subdepartment_id || s.id === task.subdepartment?.id
  );
  if (!subdepartment) return null;

  // Create a mock department structure for inheritance logic
  const departmentForInheritance = {
    ...department,
    officers_history: [] // Departments don't have officers_history in the current schema
  };

  return getInheritedOfficer(
    subdepartment.officers_history || [],
    departmentForInheritance
  );
};

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

const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string' || typeof content === 'number') return content;
  if (content === null || content === undefined) return null;
  if (Array.isArray(content)) {
    return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  }
  if (typeof content === 'object') {
    if ('status' in content) {
      const status = content.status;
      if (typeof status === 'string' || typeof status === 'number') return status;
      if (React.isValidElement(status)) return status;
      if (!status) return null;
      return JSON.stringify(status);
    }
    return <span className="text-xs text-gray-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
  }
  return String(content);
};

const TableHeaderCell = React.memo(({ item, header, getCellContent }) => {
  const renderContent = () => {
    if (item.type === 'principal') {
      return getCellContent(item.task, header.id);
    }
    const dependant = item.dependant;
    switch (header.id) {
      case 'applicant_name':
        return (
          <div className="flex flex-col">
            <span>{dependant?.full_name || dependant?.name || 'N/A'}</span>
            <span className="text-xs text-gray-500">
              {dependant?.relationship || 'Dependant'}
            </span>
          </div>
        );
      case 'nationality':
        return dependant?.nationality || 'N/A';
      case 'age':
        if (dependant?.date_of_birth) {
          const age = calculateAge(new Date(dependant.date_of_birth));
          return isNaN(age) ? 'N/A' : age.toString();
        }
        return dependant?.age?.toString() || 'N/A';
      case 'case_status':
        return (
          <div className="flex flex-col">
            <span className="text-sm">
              {dependant?.relationship || 'Dependant'}
            </span>
            <span className="text-xs text-gray-500">
              {dependant?.nationality || ''}
            </span>
          </div>
        );
      default:
        return <span className="text-sm text-gray-400">-</span>;
    }
  };

  const content = renderContent();
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
        <TableCell colSpan={paginatedHeaderStructure.length * 2 + 2} className="p-0">
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
      <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-14 min-w-14 max-w-14`}>
        {safeRender(row.stageOrder) || (row.type !== 'stage' && row.type !== 'document' && row.type !== 'field' && row.type !== 'actions' ? (rowIndex + 1) : '')}
      </TableCell>

      <TableCell className={`sticky left-14 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 w-[280px] min-w-[280px] max-w-[280px]`}>
        <div className="flex items-center gap-2 justify-between">
          <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
            <span className={row.type === 'stage' ? 'font-semibold' : ''}>{safeRender(row.label)}</span>
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
        </div>
      </TableCell>

      {paginatedHeaderStructure.map((item, colIndex) => (
        <React.Fragment key={`${row.key}-${colIndex}`}>
          <TableCell
            className={`text-center text-sm py-1 px-2 align-middle border-l-4 border-t border-b border-gray-100 w-[150px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
          >
            {item.type === 'principal' ? (
              safeRender(renderCellContent(row, item.task, 'date'))
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
          </TableCell>

          <TableCell
            className={`text-center text-sm py-1 px-2 align-middle border-r-4 border-t border-b border-gray-100 w-[120px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
          >
            {item.type === 'principal' ? (
              safeRender(renderCellContent(row, item.task, 'actions'))
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
          </TableCell>
        </React.Fragment>
      ))}
    </TableRow>
  );
});

// --- Main EnhancedTable Component ---

interface EnhancedTableProps {
  departments: any[];
  tasks: any[];
  tableType: string;
  ENHANCED_TABLE_HEADERS_IMMIGRATION: any[];
  visibleHeaders: Set<string>;
  taskDependants: Map<string, any[]>;
  expandedDependants: Set<string>;
  expandedSections: Set<string>;
  tableRows: any[];
  loading: boolean;
  error: string | null;
  getCellContent: (task: any, headerId: string) => any;
  renderCellContent: (content: any, item: any, header: any) => React.ReactNode;
  toggleSectionExpansion: (sectionId: string) => void;
  toggleStageExpansion: (taskId: string, stageId: string) => void;
  toggleDocumentExpansion: (taskId: string, documentId: string) => void;
  onDeleteTask?: (task: any) => void;
  initialColumnsPerPage?: number;
  allDocuments?: any[];
  kycDocuments?: Map<string, any>;
  enhancedTasksData?: Map<string, any>;
}

export const EnhancedTable: React.FC<EnhancedTableProps> = ({
  departments,
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
  initialColumnsPerPage = 10,  // Set default render to 10
  allDocuments = [],
  kycDocuments = new Map(),
  enhancedTasksData = new Map(),
}) => {
  const didLogRef = useRef(false);
  useEffect(() => {
    if (DEBUG && !didLogRef.current) {
      didLogRef.current = true;
    }
  }, [tasks, kycDocuments]);

  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [showNAStages, setShowNAStages] = useState(false);

  // Memoized derived data
  const processedDocuments = useMemo(() => processDocumentsForTasks(tasks, allDocuments), [tasks, allDocuments]);

  // Reset to page 1 ONLY when the base dataset changes (e.g. search filter applied)
  useEffect(() => {
    setCurrentPage(1);
  }, [tasks]);

  const headerStructure = useMemo(() => {
    if (!Array.isArray(tasks)) return [];

    return tasks.flatMap(task => {
      if (!task) return [];
      const taskId = task.id || Math.random().toString(36).substr(2, 9);
      // Get inherited officer if no direct officer assignment
      const inheritedOfficer = getInheritedOfficerForTask(task, departments || []);
      const officerWithInheritance = task.officer || inheritedOfficer || { id: task.officer_id, name: '' };

      const taskWithDetails = {
        ...task,
        department: task.department || { id: task.department_id, name: '' },
        subdepartment: task.subdepartment || { id: task.subdepartment_id, name: '' },
        officer: officerWithInheritance,
        task_manager: task.task_manager || { id: task.task_manager_id, name: '' },
        id: taskId,
        status: task.status || 'pending',
        isInheritedOfficer: !!inheritedOfficer && !task.officer
      };

      const principal = {
        type: 'principal',
        task: taskWithDetails,
        key: `principal-${taskId}`
      };

      const deps = taskDependants.get(taskId.toString()) || [];
      if (expandedDependants.has(taskId.toString()) && deps.length > 0) {
        const dependants = deps.map((dep, index) => ({
          type: 'dependant',
          task: taskWithDetails,
          dependant: dep,
          index,
          key: `dep-${taskId}-${dep.id || index}`
        }));
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
  // Make sure totalPages is at least 1 to prevent UI glitches
  const totalPages = Math.max(1, Math.ceil(totalColumns / columnsPerPage));

  const paginatedHeaderStructure = useMemo(() => {
    const startIndex = (currentPage - 1) * columnsPerPage;
    return headerStructure.slice(startIndex, startIndex + columnsPerPage);
  }, [headerStructure, currentPage, columnsPerPage]);

  const filteredTableRows = useMemo(() => {
    if (showNAStages) return tableRows;
    return tableRows.filter(row => !(row.type === 'stage' && row.isNA && row.stage?.documents?.length === 0));
  }, [tableRows, showNAStages]);

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
  const handleFirstPage = useCallback(() => setCurrentPage(1), []);
  const handleLastPage = useCallback(() => setCurrentPage(totalPages), [totalPages]);

  const handleColumnsPerPageChange = useCallback((value: string) => {
    setColumnsPerPage(parseInt(value, 10));
    setCurrentPage(1); // Reset to first page when changing page size
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

      <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
        {totalColumns > 0 && (
          <>
            <div className="text-sm text-slate-500">
              Showing{' '}
              <span className="font-bold text-slate-800">{((currentPage - 1) * columnsPerPage) + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(currentPage * columnsPerPage, totalColumns)}</span> of{' '}
              <span className="font-bold text-slate-800">{totalColumns}</span> columns
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Columns:</span>
                <Select
                  value={String(columnsPerPage)}
                  onValueChange={(value) => handleColumnsPerPageChange(value)}
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
          </>
        )}
      </div>

      <div className="border-2 border-slate-300 rounded-b-lg rounded-tl-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            {expandedSections.has('case_details') && visibleCaseDetailHeaders.map((header, index) => (
              <TableRow key={header.id} className="bg-blue-600 text-white group border-b border-slate-200">
                <TableCell className="sticky left-0 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center w-14 min-w-14 max-w-14">
                  {index + 1}
                </TableCell>
                <TableCell className="sticky left-14 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 w-[280px] min-w-[280px] max-w-[280px]">
                  {header.label}
                </TableCell>

                {paginatedHeaderStructure.map((item) => (
                  <React.Fragment key={`header-${header.id}-${item.key}`}>
                    <TableCell colSpan={2} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 w-[150px] ${item.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                      <div className="flex flex-col items-center">
                        <TableHeaderCell item={item} header={header} getCellContent={getCellContent} />
                      </div>
                    </TableCell>
                  </React.Fragment>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-slate-200">
            {loading ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length * 2 + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Loading...</div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length * 2 + 2} className="h-32 text-center text-red-600">
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
                  processedDocuments={processedDocuments}
                  kycDocuments={kycDocuments}
                  renderCellContent={renderCellContent}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
