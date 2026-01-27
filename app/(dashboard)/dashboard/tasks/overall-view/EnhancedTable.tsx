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

// ✅ FIXED: Robust safeRender to handle objects, JSX, and arrays correctly
const safeRender = (content: any) => {
  // 1. Valid React Element (JSX) - Pass through
  if (React.isValidElement(content)) return content;

  // 2. Primitives - Pass through
  if (typeof content === 'string' || typeof content === 'number') return content;
  if (content === null || content === undefined) return null;

  // 3. Arrays - Process recursively
  if (Array.isArray(content)) {
    return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  }

  // 4. Plain Objects - Handle specific structure or stringify
  if (typeof content === 'object') {
    // If the object has a 'status' property
    if ('status' in content) {
      const status = content.status;

      // If status is primitive, return it
      if (typeof status === 'string' || typeof status === 'number') return status;

      // If status is a React Element, return it directly
      if (React.isValidElement(status)) return status;

      // If status is null/undefined
      if (!status) return null;

      // If status is an object/array, stringify it
      return JSON.stringify(status);
    }

    // Fallback for objects without status: Stringify to prevent crash
    return <span className="text-xs text-gray-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
  }

  return String(content);
};

const TableHeaderCell = React.memo(({ item, header, getCellContent }) => {
  const renderContent = () => {
    if (item.type === 'principal') {
      return getCellContent(item.task, header.id);
    }
    // Dependant logic - handle both old and new data structures
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
      {/* Row Number */}
      <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-20`}>
        {/* ✅ FIXED: Wrapped stageOrder in safeRender just in case */}
        {safeRender(row.stageOrder) || (row.type !== 'stage' && row.type !== 'document' && row.type !== 'field' && row.type !== 'actions' ? (rowIndex + 1) : '')}
      </TableCell>

      {/* Row Label */}
      <TableCell className={`sticky left-20 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 min-w-[300px]`}>
        <div className="flex items-center gap-2 justify-between">
          <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
            {/* ✅ FIXED: Wrapped row.label in safeRender */}
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

      {/* Task Columns - Now DOUBLED: Date column + Actions column for each task */}
      {paginatedHeaderStructure.map((item, colIndex) => (
        <React.Fragment key={`${row.key}-${colIndex}`}>
          {/* DATE COLUMN */}
          <TableCell
            className={`text-center text-sm py-1 px-2 align-middle border-l-4 border-t border-b border-gray-100 w-[150px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
          >
            {item.type === 'principal' ? (
              // ✅ FIXED: Wrapped result in safeRender
              safeRender(renderCellContent(row, item.task, 'date'))
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
          </TableCell>

          {/* ACTIONS COLUMN */}
          <TableCell
            className={`text-center text-sm py-1 px-2 align-middle border-r-4 border-t border-b border-gray-100 w-[120px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
          >
            {item.type === 'principal' ? (
              // ✅ FIXED: Wrapped result in safeRender
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
  getCellContent: (task: any, headerId: string, departments: any[]) => any
  renderCellContent: (row: any, task: any, columnType?: 'date' | 'actions') => any
  toggleSectionExpansion: (sectionId: string) => void
  toggleStageExpansion: (stageId: string) => void
  toggleDocumentExpansion: (docId: string) => void
  onDeleteTask?: (task: any) => void
  initialColumnsPerPage?: number;
  allDocuments?: any[];
  kycDocuments?: Map<string, any>;
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
  initialColumnsPerPage = 5,  // ✅ Reduced default since we now have 2 columns per task
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
  // Set default columns per page to show all tasks initially
  const [columnsPerPage, setColumnsPerPage] = useState(tasks.length || initialColumnsPerPage);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<any>(null);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [showNAStages, setShowNAStages] = useState(false);

  // Memoized derived data
  const processedDocuments = useMemo(() => processDocumentsForTasks(tasks, allDocuments), [tasks, allDocuments]);

  // Update columns per page when tasks change
  useEffect(() => {
    if (tasks.length > 0 && tasks.length !== columnsPerPage) {
      setColumnsPerPage(tasks.length);
      setCurrentPage(1);
    }
  }, [tasks.length]);

  const headerStructure = useMemo(() => {
    if (!Array.isArray(tasks)) return [];
    
    return tasks.flatMap(task => {
      if (!task) return [];
      
      // Ensure task has an ID
      const taskId = task.id || Math.random().toString(36).substr(2, 9);
      
      // Handle the task data structure from the API
      const taskWithDetails = {
        ...task,
        // Map the nested department and subdepartment to the expected format
        department: task.department || { id: task.department_id, name: '' },
        subdepartment: task.subdepartment || { id: task.subdepartment_id, name: '' },
        officer: task.officer || { id: task.officer_id, name: '' },
        task_manager: task.task_manager || { id: task.task_manager_id, name: '' },
        // Ensure we have a valid ID
        id: taskId,
        // Ensure we have a valid status
        status: task.status || 'pending'
      };

      const principal = { 
        type: 'principal', 
        task: taskWithDetails, 
        key: `principal-${taskId}` 
      };
      
      // Handle dependents if they exist in the task data
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

  // Debug logging for tasks
  useEffect(() => {
    if (DEBUG) {
      console.groupCollapsed('[EnhancedTable] Tasks data structure');
      console.log('Tasks array:', tasks);
      console.log('Tasks count:', tasks?.length || 0);
      if (tasks?.length > 0) {
        console.log('First task sample:', JSON.parse(JSON.stringify(tasks[0])));
      }
      console.log('Header structure:', headerStructure);
      console.log('Paginated header structure:', paginatedHeaderStructure);
      console.groupEnd();
    }
  }, [tasks, headerStructure, paginatedHeaderStructure]);

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
        {totalColumns > columnsPerPage && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Showing <strong>{Math.min((currentPage - 1) * columnsPerPage + 1, totalColumns)}</strong>-<strong>{Math.min(currentPage * columnsPerPage, totalColumns)}</strong> of <strong>{totalColumns}</strong> tasks
            </span>
            <span className="text-sm text-slate-600">Tasks per page:</span>
            <Select onValueChange={handleColumnsPerPageChange} defaultValue={columnsPerPage.toString()}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20].map(val => <SelectItem key={val} value={val.toString()}>{val}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8" onClick={handlePreviousPage} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="h-8" onClick={handleNextPage} disabled={currentPage >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            {expandedSections.has('case_details') && visibleCaseDetailHeaders.map((header, index) => (
              <TableRow key={header.id} className="bg-blue-600 text-white group border-b border-slate-200">
                <TableCell className="sticky left-0 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center w-20">
                  {index + 1}
                </TableCell>
                <TableCell className="sticky left-20 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 min-w-[300px]">
                  {header.label}
                </TableCell>

                {/* ✅ NEW: Each task now gets TWO header columns */}
                {paginatedHeaderStructure.map((item) => (
                  <React.Fragment key={`header-${header.id}-${item.key}`}>
                    {/* DATE HEADER */}
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