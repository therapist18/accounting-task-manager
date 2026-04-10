// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { CellContent } from "./types"
import { userService, getOfficerDisplayName } from "@/lib/shared-user-assignment-service"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Trash2, ChevronUp, ChevronDown, Edit, Send, DownloadCloud } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import EditableStageCell from "../components/EditableStageCell"
import { formatDateValue, isDocumentOlderThanTask } from "../utils/taskManagerData"

// --- INTERFACE (No Change) ---
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
  handleTaskEdit: (task: any) => void
  handleStageDocumentUpload: (task: any, stage: any) => void
  handleViewDocument: (task: any, stage: any) => void
  handlePushCase: (task: any, targetSubDeptId: number, targetSubDeptName: string) => void
  handleDownloadZip: (task: any) => void
  onTaskAction: (action: any) => void
  enhancedHandleStageStatusSave: (stageId: string, taskId: string, value: string, updatedExtractedDetails?: Record<string, any>) => void
  getKycFields: (doc: any) => Promise<any[]>
  toggleStageExpansion: (stageId: string) => void
  toggleDocumentExpansion: (docId: string) => void
  toggleDependantsExpansion: (taskId: string) => void
  officers?: any[]
}

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

// --- COMPONENT ---
export const StandardTable: React.FC<StandardTableProps> = ({
  departments, tasks, tableType, ENHANCED_TABLE_HEADERS_IMMIGRATION, stages,
  companies, visibleHeaders, visibleStageIds, expandedStages,
  expandedDocuments, expandedDependants, taskDependants, kycDocuments, allDocuments,
  sortConfig, dataLoading = {}, error, isPushingCase, isDownloading,
  getCellContent, getSortedTasks, getDocumentForTaskStage, getStaffName, requestSort,
  handleTaskEdit, handleStageDocumentUpload, handleViewDocument, handlePushCase, handleDownloadZip,
  onTaskAction, enhancedHandleStageStatusSave, getKycFields, toggleStageExpansion,
  toggleDocumentExpansion, toggleDependantsExpansion
}) => {
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<any>(null);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [documentFields, setDocumentFields] = useState<Map<string, any[]>>(new Map());

  // --- HOOKS & MEMOS ---

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

  const taskRows = useMemo(() => {
    const rows = [];
    sortedTasks.forEach((task, taskIndex) => {
      rows.push({ type: 'principal', task, taskIndex, key: `task-${task.id}`, label: task.applicant_name || 'N/A' });
      const taskDeps = taskDependants.get(task.id.toString()) || [];
      if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
        taskDeps.forEach((dep, depIndex) => {
          rows.push({ type: 'dependant', task, dependant: dep, taskIndex, depIndex, key: `dep-${task.id}-${dep.id || depIndex}`, label: dep.full_name || 'N/A' });
        });
      }
    });
    return rows;
  }, [sortedTasks, taskDependants, expandedDependants]);

  // --- HANDLERS & HELPERS ---
  const handleAutomationClick = (classId: string, requirementId: number, taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    setSelectedRequirement({
      classId, requirementId, taskId, task,
      subDeptId: task.subdepartment?.id?.toString() || task.subdepartment_id?.toString() || task.sub_dept_id?.toString() || '',
    });
    setAutomationDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (taskToDelete && onTaskAction) {
      await onTaskAction({ type: 'delete', taskId: taskToDelete.id });
      setTaskToDelete(null);
    }
  };

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return <ChevronUp className="h-4 w-4 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  // UPDATED: Colspan calculation now accounts for the persistent document cell
  const getStageColSpan = useCallback((stage: any) => {
    if (!expandedStages.has(stage.id.toString())) {
      return 1;
    }
    const docs = stage.documents || [];
    if (docs.length === 0) return 1;

    return docs.reduce((total, doc) => {
      let docSpan = 1; // Collapsed doc takes 1 column
      if (expandedDocuments.has(doc.id.toString())) {
        const fields = documentFields.get(doc.id.toString()) || [];
        docSpan = 1 + (fields.length || 0); // Expanded doc = 1 for its own cell + N for its fields
      }
      return total + docSpan;
    }, 0);
  }, [expandedStages, expandedDocuments, documentFields]);

  // --- RENDER LOGIC ---

  if (!tasks.length && !dataLoading.tasks) {
    return <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200"><FileText className="h-12 w-12 text-slate-400" /><p className="mt-4 font-semibold text-slate-700">No {tableType} found</p><p className="text-sm text-slate-500">Tasks with this status will appear here.</p></div>
  }

  return (
    <div className="space-y-4">
      <DeleteConfirmationDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)} onConfirm={handleConfirmDelete} title="Delete Task" description="Are you sure you want to delete this task?" confirmText="Delete Task" loading={dataLoading?.tasks || false} />

      <div className="border-2 border-slate-200/60 rounded-xl bg-gradient-to-br from-white to-slate-50/30 overflow-hidden shadow-xl ring-1 ring-slate-900/5" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="overflow-auto h-full">
          <Table className="min-w-full border-separate border-spacing-0">
            {/* UPDATED: Hierarchical Table Header */}
            <TableHeader className="sticky top-0 z-20">
              {/* Row 1: Main Headers */}
              <TableRow className="group">
                <TableHead rowSpan={3} className="sticky left-0 z-30 bg-gradient-to-r from-blue-600 to-blue-700 text-white border-r border-blue-500/30 font-bold text-sm p-3 text-center w-16 shadow-lg">#</TableHead>
                <TableHead rowSpan={3} className="sticky left-16 z-30 bg-gradient-to-r from-blue-600 to-blue-700 text-white border-r border-blue-500/30 font-bold text-sm p-3 min-w-[280px] shadow-lg">Applicant / Dependant</TableHead>
                {visibleCaseDetailHeaders.map(header => (
                  <TableHead key={header.id} rowSpan={3} className="text-center text-sm p-3 border-r bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-500/30 font-semibold shadow-md min-w-[180px]">
                    <div className="flex flex-col items-center justify-center gap-2 h-full"><div className="truncate w-full">{header.label}</div>{header.sortable && (<Button variant="ghost" size="icon" className="h-6 w-6 p-0 rounded-md text-white/80 hover:text-white hover:bg-white/20" onClick={() => requestSort(header.id)}>{getSortIcon(header.id)}</Button>)}</div>
                  </TableHead>
                ))}
                {visibleStages.map(stage => (
                  <TableHead key={stage.id} colSpan={getStageColSpan(stage)} className="text-center text-sm p-3 border-r bg-gradient-to-b from-blue-600 to-blue-700 text-white border-b border-blue-500/30 font-semibold shadow-md min-w-[180px]">
                    <div className="flex items-center justify-center gap-2"><span className="truncate">{stage.name}</span>{stage.documents?.length > 0 && (<Button variant="ghost" size="icon" className="h-6 w-6 p-0 rounded-md text-white/80 hover:text-white hover:bg-white/20" onClick={() => toggleStageExpansion(stage.id.toString())}>{expandedStages.has(stage.id.toString()) ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</Button>)}</div>
                  </TableHead>
                ))}
                <TableHead rowSpan={3} className="text-center text-sm p-3 bg-gradient-to-b from-gray-600 to-gray-700 text-white border-l border-gray-500/30 font-semibold shadow-md min-w-[150px]">Actions</TableHead>
              </TableRow>

              {/* Row 2: Document Headers */}
              <TableRow>
                {visibleStages.flatMap(stage => {
                  if (!expandedStages.has(stage.id.toString())) return [];
                  return (stage.documents || []).map(doc => {
                    const kycData = kycDocuments.get(doc.kycId);
                    const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';
                    if (!expandedDocuments.has(doc.id.toString())) {
                      return <TableHead key={`doc-header-${doc.id}`} rowSpan={2} className="text-center text-xs p-2 border-r border-b bg-gradient-to-b from-slate-100 to-slate-200 text-slate-800 border-slate-300 font-medium"><div className="flex items-center justify-center gap-1.5"><span className="truncate">{docDisplayName}</span>{doc.kycId && (<Button variant="ghost" size="icon" className="h-5 w-5 p-0 rounded-md" onClick={() => toggleDocumentExpansion(doc.id.toString())}><Plus className="h-3 w-3" /></Button>)}</div></TableHead>
                    }
                    const fields = documentFields.get(doc.id.toString()) || [];
                    return <TableHead key={`doc-header-${doc.id}`} colSpan={1 + fields.length} className="text-center text-xs p-2 border-r border-b bg-gradient-to-b from-slate-100 to-slate-200 text-slate-800 border-slate-300 font-medium"><div className="flex items-center justify-center gap-1.5"><span className="truncate">{docDisplayName}</span>{doc.kycId && (<Button variant="ghost" size="icon" className="h-5 w-5 p-0 rounded-md" onClick={() => toggleDocumentExpansion(doc.id.toString())}><Minus className="h-3 w-3" /></Button>)}</div></TableHead>
                  });
                })}
              </TableRow>

              {/* Row 3: Field Headers */}
              <TableRow>
                {visibleStages.flatMap(stage => {
                  if (!expandedStages.has(stage.id.toString())) return [];
                  return (stage.documents || []).flatMap(doc => {
                    if (!expandedDocuments.has(doc.id.toString())) return [];
                    const fields = documentFields.get(doc.id.toString()) || [];
                    const docActionHeader = <TableHead key={`doc-action-header-${doc.id}`} className="text-center text-xs p-2 border-r bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 border-slate-200 font-normal">Status</TableHead>;
                    const fieldHeaders = fields.map(field => <TableHead key={`field-header-${doc.id}-${field.id}`} className="text-center text-xs p-2 border-r bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 border-slate-200 font-normal"><div className="truncate" title={field.fieldName}>{field.fieldName}</div></TableHead>);
                    return [docActionHeader, ...fieldHeaders];
                  });
                })}
              </TableRow>
            </TableHeader>

            {/* UPDATED: Declarative Table Body */}
            <TableBody>
              {dataLoading.tasks ? (
                <TableRow><TableCell colSpan={100} className="h-48 text-center bg-white"><div className="flex flex-col justify-center items-center gap-3 text-slate-600"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><span className="text-sm font-medium">Loading...</span></div></TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={100} className="h-48 text-center bg-white"><div className="flex flex-col justify-center items-center gap-3 text-red-600"><AlertTriangle className="h-8 w-8" /><span className="text-sm font-medium">{error}</span></div></TableCell></TableRow>
              ) : (
                taskRows.map((row, rowIndex) => (
                  <TableRow key={row.key} className={`h-16 align-middle group transition-all duration-200 ${row.type === 'dependant' ? 'bg-gradient-to-r from-amber-50/80 to-white' : (rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')} hover:bg-blue-50 border-b border-slate-200/60`}>

                    {/* Index & Applicant Cells */}
                    <TableCell className={`sticky left-0 z-10 border-r border-slate-200/60 font-semibold text-sm p-3 text-center w-16 transition-colors ${row.type === 'dependant' ? 'bg-amber-50/80 text-amber-700' : (rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')} group-hover:bg-blue-50`}>{row.taskIndex + 1}</TableCell>
                    <TableCell className={`sticky left-16 z-10 border-r border-slate-200/60 p-3 min-w-[280px] transition-colors ${row.type === 'dependant' ? 'bg-amber-50/80' : (rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/30')} group-hover:bg-blue-50`}>
                      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3 flex-1 min-w-0"><div className="flex flex-col text-left flex-1 min-w-0"><span className={`font-semibold truncate ${row.type === 'dependant' ? 'text-amber-900' : 'text-slate-900'}`}>{row.label}</span>{row.type === 'dependant' && <span className="text-xs text-amber-600 font-medium">{row.dependant.relationship || 'Dependant'}</span>}</div></div>{row.type === 'principal' && taskDependants.get(row.task.id.toString())?.length > 0 && (<Button variant="ghost" size="icon" className={`h-8 w-8 rounded-lg flex-shrink-0 transition-all ${expandedDependants.has(row.task.id.toString()) ? 'bg-amber-100 text-amber-700' : 'text-slate-500'}`} onClick={() => toggleDependantsExpansion(row.task.id.toString())}>{expandedDependants.has(row.task.id.toString()) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</Button>)}</div>
                    </TableCell>

                    {/* Case Detail Cells */}
                    {visibleCaseDetailHeaders.map(header => (
                      <TableCell key={header.id} className="text-center text-sm p-3 border-r border-slate-200/60 min-w-[180px]">{row.type === 'principal' ? <div className="truncate w-full text-sm">{getCellContent(row.task, header.id)}</div> : <span className="text-gray-400 text-xs">-</span>}</TableCell>
                    ))}

                    {/* Stage, Document, and Field Cells */}
                    {visibleStages.flatMap(stage => {
                      if (row.type === 'dependant') {
                        return [<TableCell key={`dep-stage-${stage.id}`} colSpan={getStageColSpan(stage)} className="text-center text-xs p-3 border-r border-slate-200/60 text-gray-400">-</TableCell>];
                      }
                      // COLLAPSED STAGE
                      if (!expandedStages.has(stage.id.toString())) {
                        return [<TableCell key={stage.id} className="text-center text-sm p-1 border-r border-slate-200/60 min-w-[180px]"><EditableStageCell stage={stage} task={row.task} value={row.task.stages?.[stage.id]?.status} onSave={enhancedHandleStageStatusSave} onDocumentUpload={handleStageDocumentUpload} onShowDocuments={handleViewDocument} onAutomationClick={(e) => { e.stopPropagation(); if (stage.automation) { handleAutomationClick(row.task.class_id?.toString() || '', stage.automation.requirementId || 0, row.task.id.toString()); } }} getKycFields={getKycFields} allDocuments={allDocuments} /></TableCell>];
                      }
                      if (!stage.documents || stage.documents.length === 0) {
                        return [<TableCell key={`stage-empty-${stage.id}`} className="text-center text-xs p-3 border-r border-slate-200/60 min-w-[180px] text-gray-400">-</TableCell>];
                      }
                      // EXPANDED STAGE
                      return (stage.documents || []).flatMap(doc => {
                        // COLLAPSED DOCUMENT
                        if (!expandedDocuments.has(doc.id.toString())) {
                          return [<TableCell key={doc.id} className="text-center text-sm p-1 border-r border-slate-200/60 min-w-[180px] bg-slate-50/30"><EditableStageCell isDocumentRow={true} stage={stage} task={row.task} documentData={doc} onSave={enhancedHandleStageStatusSave} onDocumentUpload={handleStageDocumentUpload} onShowDocuments={(task, stg) => handleViewDocument(task, { ...stg, documents: [doc] })} onAutomationClick={(e, docData) => { e.stopPropagation(); if (docData?.automation) { handleAutomationClick(row.task.class_id?.toString() || '', docData.automation.requirementId || 0, row.task.id.toString()); } }} getKycFields={getKycFields} allDocuments={allDocuments} /></TableCell>];
                        }
                        // EXPANDED DOCUMENT - Renders its own cell + field cells
                        const fields = documentFields.get(doc.id.toString()) || [];
                        const docCell = <TableCell key={`doc-cell-${doc.id}`} className="text-center text-sm p-1 border-r border-slate-200/60 min-w-[180px] bg-slate-50/30"><EditableStageCell isDocumentRow={true} stage={stage} task={row.task} documentData={doc} onSave={enhancedHandleStageStatusSave} onDocumentUpload={handleStageDocumentUpload} onShowDocuments={(task, stg) => handleViewDocument(task, { ...stg, documents: [doc] })} /></TableCell>;

                        const linkedDocument = getDocumentForTaskStage(row.task, { ...stage, documents: [doc] });
                        const fieldCells = fields.map(field => {
                          const value = linkedDocument?.extracted_details?.[field.fieldName] || 'N/A';
                          return <TableCell key={`field-cell-${doc.id}-${field.id}`} className="text-center text-xs p-2 border-r border-slate-200/60 min-w-[180px] bg-slate-50/50"><div className="truncate" title={value}>{field?.fieldType?.toLowerCase() === 'date' ? formatDateValue(value) : value}</div></TableCell>;
                        });

                        return [docCell, ...fieldCells];
                      });
                    })}

                    {/* Actions Cell */}
                    <TableCell className="text-center text-sm p-2 border-l border-slate-200/60 min-w-[150px]">
                      {row.type === 'principal' ? (<div className="flex items-center justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => handleTaskEdit(row.task)} className="h-7 w-7 text-blue-600" title="Edit"><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setTaskToDelete(row.task)} className="h-7 w-7 text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handlePushCase(row.task, 6, 'Alien')}><Send className="mr-2 h-4 w-4" /> Push to Alien</DropdownMenuItem><DropdownMenuItem onClick={() => handlePushCase(row.task, 7, 'Re-Entry Pass')}><Send className="mr-2 h-4 w-4" /> Push to Re-Entry</DropdownMenuItem><DropdownMenuItem onClick={() => handleDownloadZip(row.task)}><DownloadCloud className="mr-2 h-4 w-4" /> Download Docs</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>) : <span className="text-gray-400 text-xs">-</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedRequirement && <AutomationMappingDialog isOpen={automationDialogOpen} onClose={() => setAutomationDialogOpen(false)} classId={selectedRequirement.classId} requirementId={selectedRequirement.requirementId.toString()} taskId={selectedRequirement.taskId} subDeptId={selectedRequirement.subDeptId} task={selectedRequirement.task} isSubclass={!!selectedRequirement.task?.subclass_id} subclassId={selectedRequirement.task?.subclass_id?.toString()} />}
    </div>
  )
}