// @ts-nocheck
"use client"

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileIcon, Eye, EyeOff, Edit, X } from "lucide-react"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"
import { EnquiryDialog } from "../components/EnquiryDialog"
import { userService, getOfficerDisplayName } from "@/lib/shared-user-assignment-service"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// --- Helper Functions & Constants ---

const DEBUG = process.env.NODE_ENV !== 'production';

// Helper function to get inherited officer for a task using userService
const getInheritedOfficerForTask = (task: any, departments: any[], officers: any[] = []) => {
  if (!task || !departments.length) return null;

  const department = departments.find(d =>
    d.id === task.department_id || d.id === task.department?.id
  );
  if (!department) return null;

  const subdepartment = department.tm_subdepartments?.find(s =>
    s.id === task.subdepartment_id || s.id === task.subdepartment?.id
  );
  if (!subdepartment) return null;

  // Use new userService for staff assignments
  const subdepartmentUsers = userService.getSubdepartmentUsers(
    officers.map(o => ({
      id: o.id,
      displayName: getOfficerDisplayName(o),
      email: o.email,
      role: 'officer',
      firstName: o.firstName,
      lastName: o.lastName,
      isActive: o.isActive,
      assignments: o.assignments || [],
      username: o.username || null,
      createdAt: o.createdAt || new Date().toISOString()
    })),
    department.id.toString(),
    subdepartment.id.toString()
  );

  return subdepartmentUsers.officers.length > 0 ? subdepartmentUsers.officers[0] : null;
};

// Helper function to extract participant by role from participants_details
const getParticipantByRole = (task: any, role: string) => {
  if (!task?.participants_details || !Array.isArray(task.participants_details)) {
    return null;
  }

  const participant = task.participants_details.find(p =>
    p.role && Array.isArray(p.role) && p.role.includes(role)
  );

  if (participant) {
    return {
      id: participant.id,
      name: participant.name || '',
      email: participant.email || '',
      type: participant.type || 'individual'
    };
  }

  return null;
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
  renderCellContent,
  onEditTask,
  setEditingTask,
  setEditDialogOpen,
  readOnly,
  allIndividualDocuments = {},
  allCompanyDocuments = {},
  handleViewReportDocument
}: {
  row: any;
  rowIndex: number;
  paginatedHeaderStructure: any[];
  expandedSections: Set<string>;
  toggleSectionExpansion: (id: string) => void;
  toggleStageExpansion: (taskId: string, stageId: string) => void;
  toggleDocumentExpansion: (taskId: string, documentId: string) => void;
  onDeleteTask?: (task: any) => void;
  setTaskToDelete: (task: any) => void;
  processedDocuments: Map<string, any[]>;
  kycDocuments: Map<string, any>;
  renderCellContent: (content: any, item: any, header: any) => React.ReactNode;
  onEditTask?: (task: any) => void;
  setEditingTask: (task: any) => void;
  setEditDialogOpen: (open: boolean) => void;
  readOnly?: boolean;
  allIndividualDocuments?: Record<number, any[]>;
  allCompanyDocuments?: Record<number, any[]>;
  handleViewReportDocument?: (colRecords: any[], docMetadata: any, task: any) => void;
}) => {
  const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
  const hoverBg = 'hover:bg-blue-50/50';

  if (row.type === 'section_header') {
    const Icon = row.icon;
    return (
      <TableRow className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200">
        <TableCell colSpan={2} className="p-0 sticky left-0 z-10">
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
        <TableCell colSpan={paginatedHeaderStructure.length * 2 + 2}></TableCell>
      </TableRow>
    );
  }

  // Render report doc rows
  if (row.type === 'report_doc') {
    const doc = row.reportDoc;
    const docTypeBadge = doc?.docType === 'individual' ? 'bg-blue-100 text-blue-700 border-blue-200' :
      doc?.docType === 'company' ? 'bg-purple-100 text-purple-700 border-purple-200' :
        'bg-emerald-100 text-emerald-700 border-emerald-200';

    return (
      <TableRow className="bg-emerald-50/30 hover:bg-emerald-50 group border-b border-slate-200 border-l-4 border-l-emerald-500">
        <TableCell className="sticky left-0 z-10 bg-emerald-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-14 min-w-14 max-w-14">
          {row.stageOrder}
        </TableCell>
        <TableCell className="sticky left-14 z-10 bg-emerald-50/50 group-hover:bg-emerald-50 border border-gray-100 font-medium text-sm text-slate-700 p-2 w-[280px] min-w-[280px] max-w-[280px]">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="truncate font-semibold text-slate-800" title={row.label}>{row.label}</span>
            <Badge variant="outline" className={cn("text-[8px] font-bold uppercase shrink-0", docTypeBadge)}>
              {doc?.docType === 'individual' ? 'IND' : doc?.docType === 'company' ? 'CO' : 'APP'}
            </Badge>
          </div>
        </TableCell>
        {paginatedHeaderStructure.map((item, colIndex) => {
          let colEntityType = 'principal';
          let entityId = null;
          if (doc?.docType === 'company') {
            colEntityType = 'company';
            entityId = item.task.company_id;
          } else if (item.type === 'principal') {
            colEntityType = 'principal';
            entityId = item.task.individual_id || item.task.applicant_details?.id;
          } else if (item.type === 'dependant') {
            colEntityType = 'dependant';
            entityId = item.dependant?.id;
          }

          const isJobLevelApplicable = item.task.report_doc_defaults?.some((d: any) => d.documentId === doc?.documentId);
          const isEntityApplicable = doc?.appliesTo?.includes(item.type === 'principal' ? (doc?.docType === 'company' ? 'company' : 'principal') : 'dependant');
          const isApplicable = isJobLevelApplicable && isEntityApplicable;

          if (!isApplicable) {
            return (
              <React.Fragment key={`${row.key}-${colIndex}`}>
                <TableCell className={cn("text-center text-sm py-1 px-2 align-middle border-l-4 border-t border-b border-gray-100 w-[150px] bg-slate-50/50 text-gray-400 italic text-[11px]", item.type === 'dependant' ? 'bg-orange-50/20' : '')}>
                  N/A
                </TableCell>
                <TableCell className={cn("text-center text-sm py-1 px-2 align-middle border-r-4 border-t border-b border-gray-100 w-[120px] bg-slate-50/50 text-gray-400 italic text-[11px]", item.type === 'dependant' ? 'bg-orange-50/20' : '')}>
                  -
                </TableCell>
              </React.Fragment>
            );
          }

          const snapshot = [
            ...(item.task.processing_requirements_documents || []),
            ...(item.task.issuance_requirements_documents || [])
          ];
          const entry = snapshot.find((s: any) =>
            s.documentTypeId === doc?.documentId &&
            s.entityType === colEntityType &&
            Number(s.entityId) === Number(entityId)
          );

          let colRecords = [];
          let isFromSnapshot = false;

          if (entry) {
            const pool = colEntityType === 'company'
              ? (allCompanyDocuments[entityId] || [])
              : (allIndividualDocuments[entityId] || []);
            colRecords = pool.filter((d: any) => (entry.documentRecordIds || []).includes(d.id));
            isFromSnapshot = true;
          } else {
            const pool = colEntityType === 'company'
              ? (allCompanyDocuments[entityId] || [])
              : (allIndividualDocuments[entityId] || []);
            colRecords = pool.filter((d: any) => d.document_id === doc?.documentId);
          }

          const docMetadata = { display_name: doc?.documentName };
          const hasFiles = colRecords.length > 0;

          // NEW: Extract immigration date value if it exists
          let immigrationDateValue = null;
          if (hasFiles) {
            const docRecord = colRecords[0];
            const kycData = kycDocuments.get(doc?.documentId);
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
            <React.Fragment key={`${row.key}-${colIndex}`}>
              <TableCell className={cn("text-center text-sm py-1.5 px-2 align-middle border-l-4 border-t border-b border-gray-100 w-[150px] bg-emerald-50/10", item.type === 'dependant' ? 'bg-orange-50/30' : '')}>
                {hasFiles ? (
                  <div className="flex flex-col items-center justify-center gap-1">
                    {/* NEW: Render the immigration date value */}
                    {immigrationDateValue && (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {String(immigrationDateValue)}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 py-0 px-2 bg-white text-blue-600 border-blue-200 hover:bg-blue-50 shadow-sm flex items-center gap-1 text-[10px]"
                      onClick={() => handleViewReportDocument?.(colRecords, docMetadata, item.task)}
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
              <TableCell className={cn("text-center text-sm py-1 px-2 align-middle border-r-4 border-t border-b border-gray-100 w-[120px] bg-emerald-50/10", item.type === 'dependant' ? 'bg-orange-50/30' : '')}>
                -
              </TableCell>
            </React.Fragment>
          );
        })}
      </TableRow>
    );
  }

  return (
    <TableRow className={`${rowBg} ${hoverBg} group border-b border-slate-200`}>
      {row.type !== 'actions' && (
        <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-14 min-w-14 max-w-14`}>
          {safeRender(row.stageOrder) || (row.type !== 'stage' && row.type !== 'document' && row.type !== 'field' && row.type !== 'actions' ? (rowIndex + 1) : '')}
        </TableCell>
      )}

      <TableCell
        colSpan={row.type === 'actions' ? 2 : 1}
        className={`sticky ${row.type === 'actions' ? 'left-0' : 'left-14'} z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 ${row.type === 'actions' ? 'w-[294px] min-w-[294px] max-w-[294px]' : 'w-[280px] min-w-[280px] max-w-[280px]'}`}
      >
        <div className="flex items-center gap-2 justify-between">
          <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
            <span className={row.type === 'stage' ? 'font-semibold' : ''}>{safeRender(row.label)}</span>
            {row.type === 'principal' && row.task?.id && !readOnly && (
              <div className="flex items-center gap-1">
                {onEditTask && (
                  <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); setEditingTask(row.task); setEditDialogOpen(true); }}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onDeleteTask && (
                  <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-400 hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setTaskToDelete(row.task); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
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
          {row.type !== 'actions' && (
            <TableCell
              className={`text-center text-sm py-1 px-2 align-middle border-l-4 border-t border-b border-gray-100 w-[150px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
            >
              {item.type === 'principal' ? (
                safeRender(renderCellContent(row, item.task, 'date'))
              ) : (
                <span className="text-sm text-gray-400">-</span>
              )}
            </TableCell>
          )}

          <TableCell
            colSpan={row.type === 'actions' ? 2 : 1}
            className={`text-center text-sm py-1 px-2 align-middle border-r-4 border-t border-b border-gray-100 ${row.type === 'actions' ? 'w-[270px] min-w-[270px] max-w-[270px]' : 'w-[120px] min-w-[120px] max-w-[120px]'} ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}
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
  onEditTask?: (task: any) => void;
  users?: any[];
  officers?: any[];
  initialColumnsPerPage?: number;
  allDocuments?: any[];
  kycDocuments?: Map<string, any>;
  enhancedTasksData?: Map<string, any>;
  readOnly?: boolean;
  reportDocDefaults?: any[];
  allIndividualDocuments?: Record<number, any[]>;
  allCompanyDocuments?: Record<number, any[]>;
  handleViewReportDocument?: (colRecords: any[], docMetadata: any, task: any) => void;
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
  onEditTask,
  users = [],
  officers = [],
  initialColumnsPerPage = 10,
  allDocuments = [],
  kycDocuments = new Map(),
  enhancedTasksData = new Map(),
  readOnly = false,
  reportDocDefaults = [],
  allIndividualDocuments = {},
  allCompanyDocuments = {},
  handleViewReportDocument,
}) => {
  const didLogRef = useRef(false);
  const getCellContentWithCancel = useCallback((task: any, headerId: string) => {
    return getCellContent(task, headerId);
  }, [getCellContent]);
  useEffect(() => {
    if (DEBUG && !didLogRef.current) {
      didLogRef.current = true;
    }
  }, [tasks, kycDocuments]);
  const [currentPage, setCurrentPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showNAStages, setShowNAStages] = useState(false);
  const processedDocuments = useMemo(() => processDocumentsForTasks(tasks, allDocuments), [tasks, allDocuments]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tasks]);

  const headerStructure = useMemo(() => {
    if (!Array.isArray(tasks)) return [];

    return tasks.flatMap(task => {
      if (!task) return [];
      const taskId = task.id || Math.random().toString(36).substr(2, 9);
      const officerFromParticipants = getParticipantByRole(task, 'officer');
      const managerFromParticipants = getParticipantByRole(task, 'task_manager');
      const assistantFromParticipants = getParticipantByRole(task, 'task_assistant');
      const inheritedOfficer = getInheritedOfficerForTask(task, departments || [], officers || []);
      const officerWithInheritance = officerFromParticipants || task.officer || inheritedOfficer || { id: task.officer_id, name: '' };
      const managerWithDetails = managerFromParticipants || task.task_manager || { id: task.task_manager_id, name: '' };
      const assistantWithDetails = assistantFromParticipants || task.task_assistant || { id: task.task_assistant_id, name: '' };

      const taskWithDetails = {
        ...task,
        department: task.department || { id: task.department_id, name: '' },
        subdepartment: task.subdepartment || { id: task.subdepartment_id, name: '' },
        officer: officerWithInheritance,
        task_manager: managerWithDetails,
        task_assistant: assistantWithDetails,
        id: taskId,
        status: task.status || 'pending',
        isInheritedOfficer: !!inheritedOfficer && !task.officer && !officerFromParticipants
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
  const totalPages = Math.max(1, Math.ceil(totalColumns / columnsPerPage));

  const paginatedHeaderStructure = useMemo(() => {
    const startIndex = (currentPage - 1) * columnsPerPage;
    return headerStructure.slice(startIndex, startIndex + columnsPerPage);
  }, [headerStructure, currentPage, columnsPerPage]);

  const filteredTableRows = useMemo(() => {
    if (showNAStages) return tableRows;
    return tableRows.filter(row => !(row.type === 'stage' && row.isNA && row.stage?.documents?.length === 0));
  }, [tableRows, showNAStages]);

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
    setCurrentPage(1);
  }, []);

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
    <div>
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

      <div className="bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 260px)' }}>
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

                {paginatedHeaderStructure.map((item, colIndex) => (
                  <React.Fragment key={`header-${header.id}-${item.key}`}>
                    <TableCell colSpan={2} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 w-[150px] ${item.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                      <div className="flex flex-col items-center gap-1">
                        <TableHeaderCell item={item} header={header} getCellContent={getCellContentWithCancel} />
                      </div>
                    </TableCell>
                  </React.Fragment>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-slate-200">
            {error ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length * 2 + 2} className="h-32 text-center text-red-600">
                  <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                </TableCell>
              </TableRow>
            ) : loading && filteredTableRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={paginatedHeaderStructure.length * 2 + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Loading...</div>
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
                  onEditTask={onEditTask}
                  setEditingTask={setEditingTask}
                  setEditDialogOpen={setEditDialogOpen}
                  readOnly={readOnly}
                  allIndividualDocuments={allIndividualDocuments}
                  allCompanyDocuments={allCompanyDocuments}
                  handleViewReportDocument={handleViewReportDocument}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* EnquiryDialog for editing tasks */}
      <EnquiryDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingTask(null);
          }
        }}
        taskToEdit={editingTask}
        departments={departments}
        users={users}
        officers={officers}
        onEnquiryCreated={(updatedTask) => {
          if (onEditTask) {
            onEditTask(updatedTask);
          }
          setEditDialogOpen(false);
          setEditingTask(null);
        }}
      />
    </div>
  )
}
