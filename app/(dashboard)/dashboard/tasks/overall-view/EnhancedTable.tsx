// @ts-nocheck
"use client"

import React, { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select" // Assuming you have a Select component
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap, Trash2, ChevronLeft, ChevronRight, FileIcon, Link as LinkIcon, Eye } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"

interface DocumentPreviewProps {
  document: any;
  kycDocuments: Map<string, any>;
  onPreview: (doc: any) => void;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({ document, kycDocuments, onPreview }) => {
  if (!document) return null;

  // Try to get KYC document, but don't fail if not found
  const kycDoc = document.document_id ? kycDocuments.get(document.document_id) : null;
  const docName = kycDoc?.display_name || kycDoc?.name || document.name || 'Document';

  return (
    <div className="flex items-center gap-2 p-1 bg-blue-50 rounded-md text-xs">
      <FileIcon className="h-3 w-3 text-blue-600 flex-shrink-0" />
      <span className="truncate flex-1" title={docName}>{docName}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPreview(document);
        }}
        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100"
        title="Preview Document"
      >
        <Eye className="h-3 w-3" />
      </button>
    </div>
  );
};

interface EnhancedTableProps {
  tasks: any[]
  tableType: string
  ENHANCED_TABLE_HEADERS_IMMIGRATION: any[]
  visibleHeaders: Set<string>
  taskDependants: Map<string, any[]>
  expandedDependants: Set<string>
  expandedSections: Set<string>
  companies: Map<number, string>
  tableRows: any[]
  loading: boolean
  error: string | null
  getCellContent: (task: any, headerId: string) => any
  renderCellContent: (row: any, task: any) => any
  toggleSectionExpansion: (sectionId: string) => void
  toggleStageExpansion: (stageId: string) => void
  toggleDocumentExpansion: (docId: string) => void
  getTaskHierarchy: (task: any) => any
  getStaffName: (userId: any) => string
  onDeleteTask?: (task: any) => void
  initialColumnsPerPage?: number;
  allDocuments?: any[];
  kycDocuments?: Map<string, any>;
  onDocumentPreview?: (document: any) => void;
}

// Cache for storing processed documents
const documentCache = new Map<string, any[]>();

// Generate a cache key for the document cache
const getDocumentCacheKey = (taskId: string | number, stageId: string) => {
  return `${taskId}:${stageId}`;
};

// Process documents for multiple tasks and stages at once
const processDocumentsForTasks = (tasks: any[], allDocuments: any[] = []) => {
  const cache = new Map();

  tasks.forEach(task => {
    if (!task) return;

    // Process documents from task.documents array
    if (task.documents && Array.isArray(task.documents)) {
      task.documents.forEach((doc: any) => {
        if (!doc.stageId) return;

        const cacheKey = getDocumentCacheKey(task.id, doc.stageId);
        const processedDoc = {
          ...doc,
          id: doc.id || `${task.id}-${doc.stageId}-${Math.random().toString(36).substr(2, 9)}`,
          stageId: doc.stageId,
          document_id: doc.document_id || doc.id,
          name: doc.name || `Document ${doc.stageId}`,
          type: 'document',
          file_path: doc.file_path || doc.path || doc.url
        };

        if (!cache.has(cacheKey)) {
          cache.set(cacheKey, [processedDoc]);
        } else {
          cache.get(cacheKey).push(processedDoc);
        }
      });
    }

    // Process source_document_id
    if (task.source_document_id && typeof task.source_document_id === 'object') {
      Object.entries(task.source_document_id).forEach(([stageId, sourceDocs]) => {
        if (!stageId) return;

        const docsArray = Array.isArray(sourceDocs) ? sourceDocs : [sourceDocs];
        const processedDocs = docsArray.map((doc: any, index: number) => {
          if (typeof doc === 'string') {
            return {
              id: `${task.id}-${stageId}-${index}`,
              stageId,
              document_id: doc,
              name: `Document ${stageId}`,
              type: 'document',
              ...(allDocuments.find((d: any) => d?.id === doc || d?.document_id === doc) || {})
            };
          }

          if (typeof doc === 'object' && doc !== null) {
            const docId = doc.document_id || doc.id;
            return {
              id: doc.id || `${task.id}-${stageId}-${index}`,
              stageId,
              document_id: docId,
              name: doc.name || `Document ${stageId}`,
              type: 'document',
              file_path: doc.file_path || doc.path || doc.url,
              ...(docId && allDocuments.find((d: any) => d?.id === docId || d?.document_id === docId) || {}),
              ...doc
            };
          }

          return {
            id: `${task.id}-${stageId}-${index}`,
            stageId,
            document_id: doc,
            name: `Document ${stageId}`,
            type: 'document',
            ...(allDocuments.find((d: any) => d?.id === doc || d?.document_id === doc) || {})
          };
        });

        const cacheKey = getDocumentCacheKey(task.id, stageId);
        if (processedDocs.length > 0) {
          cache.set(cacheKey, processedDocs);
        }
      });
    }

    // Process direct document_id on task
    if (task.document_id) {
      const stageId = task.stageId || 'default';
      const cacheKey = getDocumentCacheKey(task.id, stageId);
      cache.set(cacheKey, [{
        id: task.id,
        stageId,
        document_id: task.document_id,
        name: task.document_name || `Document ${stageId}`,
        type: 'document',
        file_path: task.document_path || task.document_url,
        ...(allDocuments.find((d: any) => d?.id === task.document_id || d?.document_id === task.document_id) || {})
      }]);
    }
  });

  // Update the global cache
  cache.forEach((value, key) => {
    documentCache.set(key, value);
  });

  return cache;
};

// Get documents for a specific task and stage
const getDocumentForTaskStage = (task: any, stageId: string) => {
  if (!task?.id || !stageId) {
    return [];
  }

  const cacheKey = getDocumentCacheKey(task.id, stageId);

  // Return from cache if available
  if (documentCache.has(cacheKey)) {
    return documentCache.get(cacheKey) || [];
  }

  // If not in cache, process this task and return the result
  const result = processDocumentsForTasks([task], window.allDocuments || []);
  return result.get(cacheKey) || [];
};

// Shared debug logging utilities
const DEBUG = process.env.NODE_ENV !== 'production';
let lastLogTime = 0;
const LOG_THROTTLE_MS = 1000; // Throttle logs to once per second

const debugLog = (...args: any[]) => {
  if (!DEBUG) return;

  const now = Date.now();
  if (now - lastLogTime > LOG_THROTTLE_MS) {
    lastLogTime = now;
    console.debug('[EnhancedTable]', ...args);
  }
};

// Create a separate component for document cell to properly use React.memo
const DocumentCell = React.memo(({
  row,
  task,
  kycDocuments,
  onDocumentPreview,
  renderCellContent
}: {
  row: any;
  task: any;
  kycDocuments: Map<string, any>;
  onDocumentPreview: (doc: any) => void;
  renderCellContent: (row: any, task: any) => any;
}) => {
  // Debug logging for document cell rendering
  debugLog(`Rendering cell - Task:${task?.id}`, row?.type);

  // For document rows, try to get the document data
  if (row.type === 'document' && task) {
    // Get the stage ID from the row or document
    const stageId = row.stageId || row.document?.stageId;

    if (!stageId) {
      debugLog('No stage ID for document row');
      return renderCellContent(row, task);
    }

    // Get documents for this task and stage
    const documents = getDocumentForTaskStage(task, stageId);

    const renderDocumentItem = (doc: any, index: number) => {
      const docId = doc.document_id || doc.id;
      const kycDoc = docId ? kycDocuments.get(docId) : null;
      const docName = kycDoc?.display_name || kycDoc?.name || doc.name || `Document ${index + 1}`;
      const documentStatus = doc.status || 'pending';

      // Status color mapping
      const statusColors = {
        completed: 'bg-green-100 text-green-800',
        pending: 'bg-yellow-100 text-yellow-800',
        rejected: 'bg-red-100 text-red-800',
        in_review: 'bg-blue-100 text-blue-800',
      };

      return (
        <div
          key={docId || index}
          className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 truncate" title={docName}>
                {docName}
              </span>
              {documentStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[documentStatus] || 'bg-gray-100 text-gray-800'}`}>
                  {documentStatus.replace('_', ' ')}
                </span>
              )}
            </div>
            {doc.updated_at && (
              <div className="text-xs text-gray-500">
                {new Date(doc.updated_at).toLocaleDateString()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDocumentPreview({
                  ...doc,
                  kycDoc,
                  documentId: docId,
                  documentName: docName,
                  file: doc.file_path ? {
                    url: doc.file_path,
                    name: doc.file_path.split('/').pop() || docName,
                    type: doc.file_path.split('.').pop()?.toLowerCase() || 'pdf'
                  } : undefined
                });
              }}
              className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50 transition-colors"
              title="Preview Document"
            >
              <Eye className="h-4 w-4" />
            </button>
            {doc.download_url && (
              <a
                href={doc.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                title="Download Document"
                onClick={(e) => e.stopPropagation()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            )}
          </div>
        </div>
      );
    };

    if (documents && documents.length > 0) {
      // If we have multiple documents, render them in a list
      if (documents.length > 1) {
        return (
          <div className="space-y-2">
            {documents.map((doc: any, index: number) => renderDocumentItem(doc, index))}
          </div>
        );
      }
      // Single document
      else {
        return renderDocumentItem(documents[0], 0);
      }
    } else {
      console.log('No documents found for task', task.id, 'stage', stageId);
      return (
        <div className="flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-gray-300 rounded-lg">
          <FileText className="h-6 w-6 text-gray-400 mb-2" />
          <span className="text-sm text-gray-500">No documents linked</span>
          <span className="text-xs text-gray-400">Click to add documents</span>
        </div>
      );
    }
  }

  // If not a document row, use the default cell content renderer
  const content = renderCellContent(row, task);

  // For stage rows, add document handling
  if (row.type === 'stage') {
    const stageId = row.stageId || row.id;
    const stageDocuments = getDocumentForTaskStage(task, stageId);

    return (
      <div className="group relative">
        {content}
      </div>
    );
  }

  return content;
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  return (
    prevProps.row === nextProps.row &&
    prevProps.task === nextProps.task &&
    prevProps.kycDocuments === nextProps.kycDocuments &&
    prevProps.renderCellContent === nextProps.renderCellContent
  );
});

// Keep the original function signature for backward compatibility
const renderDocumentCell = (row: any, task: any, kycDocuments: Map<string, any>, onDocumentPreview: (doc: any) => void, renderCellContent: (row: any, task: any) => any) => {
  return (
    <DocumentCell
      row={row}
      task={task}
      kycDocuments={kycDocuments}
      onDocumentPreview={onDocumentPreview}
      renderCellContent={renderCellContent}
    />
  );
};

export const EnhancedTable: React.FC<EnhancedTableProps> = ({
  tasks,
  tableType,
  ENHANCED_TABLE_HEADERS_IMMIGRATION,
  visibleHeaders,
  taskDependants,
  expandedDependants,
  expandedSections,
  companies,
  tableRows,
  loading,
  error,
  getCellContent,
  renderCellContent,
  toggleSectionExpansion,
  toggleStageExpansion,
  toggleDocumentExpansion,
  getTaskHierarchy,
  getStaffName,
  onDeleteTask,
  initialColumnsPerPage = 5, // Default initial value
  allDocuments = [],
  kycDocuments = new Map(),
  onDocumentPreview = () => { }
}) => {
  // Initial render debug info
  React.useEffect(() => {
    if (DEBUG) {
      console.groupCollapsed(`[EnhancedTable] Initial render with ${tasks.length} tasks`);
      console.log('Tasks:', tasks.length);
      console.log('KYC Documents:', kycDocuments.size);
      if (kycDocuments.size > 0) {
        console.log('Sample KYC IDs:', Array.from(kycDocuments.keys()).slice(0, 3));
      }
      console.groupEnd();
    }
  }, [tasks.length, kycDocuments.size]);
  // State for column pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);

  const headerStructure = useMemo(() => {
    const structure = []
    tasks.forEach(task => {
      structure.push({ type: 'principal', task })
      const taskDeps = taskDependants.get(task.id.toString()) || []
      if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
        taskDeps.forEach((dep, index) => {
          structure.push({ type: 'dependant', task, dependant: dep, index })
        })
      }
    })
    return structure;
  }, [tasks, taskDependants, expandedDependants]);

  // Calculate total columns and paginate the header structure
  const totalColumns = headerStructure.length;
  const totalPages = Math.ceil(totalColumns / columnsPerPage);

  const paginatedHeaderStructure = useMemo(() => {
    const startIndex = (currentPage - 1) * columnsPerPage;
    const endIndex = startIndex + columnsPerPage;
    return headerStructure.slice(startIndex, endIndex);
  }, [headerStructure, currentPage, columnsPerPage]);

  // Memoize the preview handler to prevent recreation on every render
  const handlePreview = useCallback((doc: any) => {
    if (onDocumentPreview) {
      onDocumentPreview({
        ...doc,
        file: doc.file_path ? {
          url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${doc.file_path}`,
          name: doc.file_path.split('/').pop() || doc.name,
          type: doc.file_path.split('.').pop()?.toLowerCase() || 'pdf'
        } : undefined
      });
    }
  }, [onDocumentPreview]);

  // Memoize the cell renderer with stable dependencies
  const memoizedRenderCell = useCallback((row: any, task: any) => {
    return renderDocumentCell(row, task, kycDocuments, handlePreview, renderCellContent);
  }, [kycDocuments, handlePreview, renderCellContent]);

  const visibleCaseDetailHeaders = useMemo(() => ENHANCED_TABLE_HEADERS_IMMIGRATION.filter(header =>
    visibleHeaders.has(header.id)
  ), [ENHANCED_TABLE_HEADERS_IMMIGRATION, visibleHeaders]);

  // State for automation dialog
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<{
    classId: string,
    requirementId: number,
    subDeptId?: string,
    taskId: string,
    task?: any
  } | null>(null);

  const [taskToDelete, setTaskToDelete] = useState<any>(null);

  const handleAutomationClick = (classId: string, requirementId: number, taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    setSelectedRequirement({
      classId,
      requirementId,
      subDeptId: task.subdepartment?.id?.toString() || task.subdepartment_id?.toString() || task.sub_dept_id?.toString() || '',
      taskId,
      task
    });
    setAutomationDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (taskToDelete && onDeleteTask) {
      try {
        await onDeleteTask(taskToDelete);
      } catch (error) {
        console.error('Error in delete confirmation:', error);
      } finally {
        setTaskToDelete(null);
      }
    } else {
      setTaskToDelete(null);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleColumnsPerPageChange = (value: string) => {
    setColumnsPerPage(parseInt(value, 10));
    setCurrentPage(1); // Reset to the first page to avoid invalid page numbers
  };

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
        <FileText className="h-12 w-12 text-slate-400" />
        <p className="mt-4 font-semibold text-slate-700">No {tableType} found</p>
        <p className="text-sm text-slate-500">Tasks with this status will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={!!taskToDelete}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete Task"
        loading={loading}
      />
      {/* Column Pagination Controls */}
      {totalColumns > initialColumnsPerPage && (
        <div className="flex items-center justify-between gap-4 px-4 py-2bg-slate-50 border-b-2 border-slate-300">
          <span className="text-sm text-slate-600 ml-2">
            Showing <strong>{(currentPage - 1) * columnsPerPage + 1}</strong> to{' '}
            <strong>{Math.min(currentPage * columnsPerPage, totalColumns)}</strong> of{' '}
            <strong>{totalColumns}</strong> columns
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Columns per view:</span>
            <Select onValueChange={handleColumnsPerPageChange} defaultValue={columnsPerPage.toString()}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="40">40</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" size="sm" className="h-8" onClick={handlePreviousPage} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={handleNextPage} disabled={currentPage === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
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
                {paginatedHeaderStructure.map((item, colIndex) => (
                  <TableCell key={`${header.id}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    {(() => {
                      const content = item.type === 'principal'
                        ? getCellContent(item.task, header.id)
                        : (() => {
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
                        })();

                      // Ensure we're not rendering objects directly
                      if (content && typeof content === 'object' && !React.isValidElement(content)) {
                        if ('status' in content) {
                          return content.status || 'N/A';
                        }
                        return JSON.stringify(content); // Fallback for other objects
                      }
                      return content;
                    })()}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-slate-200">
            {loading ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading table data...
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length + 2} className="h-32 text-center text-red-600 border border-gray-100">
                  <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                </TableCell>
              </TableRow>
            ) : (
              tableRows.map((row, index) => {
                const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
                const hoverBg = 'hover:bg-blue-50/50';

                if (row.type === 'section_header') {
                  const Icon = row.icon;
                  return (
                    <TableRow key={row.key} className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200 border-b">
                      <TableCell className="py-0 px-0" colSpan={2}>
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-3">
                            <Icon className="h-5 w-5 text-slate-600" />
                            <span className="font-bold text-slate-700 text-lg">{row.label}</span>
                          </div>
                          <div className="py-0 px-0 text-right">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleSectionExpansion(row.id)}>
                              {expandedSections.has(row.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell colSpan={paginatedHeaderStructure.length} className="py-0 px-0"></TableCell>
                    </TableRow>
                  )
                }

                return (
                  <TableRow key={row.key} className={`${rowBg} ${hoverBg} group border-b border-slate-200`}>
                    <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-20`}>
                      {row.stageOrder || (row.type !== 'stage' && row.type !== 'document' && row.type !== 'field' && row.type !== 'actions' ? (index + 1) : '')}
                    </TableCell>
                    <TableCell className={`sticky left-8 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 min-w-[400px]`}>
                      <div className="flex items-center gap-2 justify-between">
                        <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
                          <span className={row.type === 'stage' ? 'font-semibold' : ''}>{row.label}</span>
                          {row.type === 'principal' && onDeleteTask && row.task && row.task.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0 text-slate-400 hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTaskToDelete(row.task);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {row.type === 'stage' && row.stage?.documents?.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800" onClick={() => toggleStageExpansion(row.stage.id)}>
                            {expandedSections.has(row.stage.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          </Button>
                        )}
                        {row.type === 'document' && row.document?.kycId && (
                          <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800" onClick={() => toggleDocumentExpansion(row.document.id)}>
                            {expandedSections.has(row.document.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          </Button>
                        )}
                        {row.type === 'requirement' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800"
                            onClick={() => handleAutomationClick(row.classId, row.requirementId, row.taskId)}
                          >
                            <Zap className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    {paginatedHeaderStructure.map((item, colIndex) => (
                      <TableCell
                        key={`${row.key}-${colIndex}`}
                        className={`text-center text-sm py-1 px-2 align-middle border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
                        onClick={(e) => {
                          // Only trigger for document cells
                          if (row.type === 'document' && item.type === 'principal' && item.task) {
                            const documents = getDocumentForTaskStage(item.task, row.document?.stageId) || [];
                            if (documents.length > 0) {
                              e.stopPropagation();
                              onDocumentPreview(documents[0]);
                            }
                          }
                        }}
                      >
                        {item.type === 'principal' ? (
                          <div className={row.type === 'document' ? 'cursor-pointer hover:bg-blue-50 rounded' : ''}>
                            {memoizedRenderCell(row, item.task)}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
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