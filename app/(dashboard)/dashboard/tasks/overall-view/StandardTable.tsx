// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Trash2, ChevronUp, ChevronDown, Edit, Send, DownloadCloud } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import EditableStageCell from "../components/EditableStageCell"
import { formatDateValue, isDocumentOlderThanTask } from "../utils/taskManagerData"

interface StandardTableProps {
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
}

export const StandardTable: React.FC<StandardTableProps> = ({
  tasks,
  tableType,
  ENHANCED_TABLE_HEADERS_IMMIGRATION,
  stages,
  companies,
  visibleHeaders,
  visibleStageIds,
  expandedStages,
  expandedDocuments,
  expandedDependants,
  taskDependants,
  kycDocuments,
  allDocuments,
  sortConfig,
  dataLoading = {},
  error,
  isPushingCase,
  isDownloading,
  enhancedTasksData,
  getCellContent,
  getSortedTasks,
  getDocumentForTaskStage,
  getTaskHierarchy,
  getStaffName,
  requestSort,
  handleTaskEdit,
  handleStageDocumentUpload,
  handleViewDocument,
  handlePushCase,
  handleDownloadZip,
  onTaskAction,
  enhancedHandleStageStatusSave,
  getKycFields,
  toggleStageExpansion,
  toggleDocumentExpansion,
  toggleDependantsExpansion
}) => {
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<{
    classId: string,
    requirementId: number,
    subDeptId?: string,
    taskId: string,
    task?: any
  } | null>(null);

  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [allColumns, setAllColumns] = useState<any[]>([]);

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
    if (taskToDelete && onTaskAction) {
      try {
        await onTaskAction({ type: 'delete', taskId: taskToDelete.id });
      } catch (error) {
        console.error('Error in delete confirmation:', error);
      } finally {
        setTaskToDelete(null);
      }
    } else {
      setTaskToDelete(null);
    }
  };

  const visibleCaseDetailHeaders = useMemo(() => ENHANCED_TABLE_HEADERS_IMMIGRATION.filter(header =>
    visibleHeaders.has(header.id)
  ), [ENHANCED_TABLE_HEADERS_IMMIGRATION, visibleHeaders]);

  const visibleStages = useMemo(() => stages
    .filter(stage => visibleStageIds.has(stage.id.toString()))
    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0)), [stages, visibleStageIds]);

  useEffect(() => {
    let isMounted = true;

    const updateColumns = async () => {
      const columns = [];
      visibleCaseDetailHeaders.forEach(header => {
        columns.push({ type: 'case_detail', header, key: `header-${header.id}` });
      });

      const fieldFetchers = [];
      visibleStages.forEach(stage => {
        columns.push({ type: 'stage', stage, key: `stage-${stage.id}` });

        if (expandedStages.has(stage.id.toString()) && stage.documents?.length > 0) {
          stage.documents.forEach(doc => {
            const kycData = kycDocuments.get(doc.kycId);
            const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';
            const docColumn = { type: 'document', stage, document: doc, key: `doc-${stage.id}-${doc.id}`, label: docDisplayName, isSubColumn: true };
            columns.push(docColumn);

            if (expandedDocuments.has(doc.id.toString()) && doc.kycId) {
              fieldFetchers.push(
                getKycFields(doc).then(fields => ({
                  parentDocKey: docColumn.key,
                  fieldData: (fields || []).map(field => ({
                    type: 'field', stage, document: doc, field,
                    key: `field-${stage.id}-${doc.id}-${field.id || field.fieldName}`,
                    label: field.fieldName, isSubColumn: true, isSubSubColumn: true,
                  }))
                }))
              );
            }
          });
        }
      });

      columns.push({ type: 'actions', key: 'actions', label: 'Actions' });

      const allFieldColumnsData = await Promise.all(fieldFetchers);
      const fieldColumnsMap = new Map(allFieldColumnsData.map(item => [item.parentDocKey, item.fieldData]));

      let columnsWithFields = [];
      columns.forEach(col => {
        columnsWithFields.push(col);
        if (col.type === 'document' && fieldColumnsMap.has(col.key)) {
          columnsWithFields.push(...fieldColumnsMap.get(col.key));
        }
      });

      if (isMounted) {
        setAllColumns(columnsWithFields);
      }
    };

    updateColumns();
    return () => { isMounted = false; };
  }, [visibleCaseDetailHeaders, visibleStages, expandedStages, expandedDocuments, kycDocuments, getKycFields]);

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

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return <ChevronUp className="h-4 w-4 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  const renderCellForColumn = (column: any, row: any) => {
    if (column.type === 'case_detail') {
      if (row.type === 'principal') {
        return <div className="truncate w-full text-sm" title={getCellContent(row.task, column.header.id)?.toString()}>{getCellContent(row.task, column.header.id)}</div>;
      } else {
        switch (column.header.id) {
          case 'applicant_name': return <div className="flex flex-col text-xs text-left"><span className="font-medium">{row.dependant.full_name || 'N/A'}</span><span className="text-gray-500">{row.dependant.relationship || 'Dependant'}</span></div>;
          case 'nationality': return <span className="text-xs">{row.dependant.nationality || 'N/A'}</span>;
          case 'age': return <span className="text-xs">{row.dependant.age?.toString() || 'N/A'}</span>;
          case 'case_status': return <div className="flex flex-col text-xs"><span>{row.dependant.relationship || 'Dependant'}</span><span className="text-gray-500">{row.dependant.nationality || ''}</span></div>;
          default: return <span className="text-gray-400 text-xs">-</span>;
        }
      }
    }

    if (column.type === 'stage' && row.type === 'principal') {
      return <EditableStageCell key={`${column.stage.id}-${row.task.id}`} stage={column.stage} task={row.task} value={row.task.stages?.[column.stage.id]?.status} onSave={enhancedHandleStageStatusSave} onDocumentUpload={handleStageDocumentUpload} onShowDocuments={handleViewDocument} requiresUpload={column.stage.requires_upload !== false} onAutomationClick={(e) => { e.stopPropagation(); if (column.stage.automation) { handleAutomationClick(row.task.class_id?.toString() || '', column.stage.automation.requirementId || 0, row.task.id.toString()); } }} getKycFields={getKycFields} allDocuments={allDocuments} />;
    }

    if (column.type === 'document' && row.type === 'principal') {
      return <EditableStageCell key={`${column.stage.id}-${column.document.id}-${row.task.id}`} stage={column.stage} task={row.task} value={(() => { const linkedDocument = getDocumentForTaskStage(row.task, { ...column.stage, documents: [column.document] }); const isOldDoc = linkedDocument && row.task.created_at && isDocumentOlderThanTask(linkedDocument.created_at, row.task.created_at); const hasIndicator = linkedDocument?.indicator === true; return { hasDocument: !!linkedDocument, isOldDocument: isOldDoc, hasIndicator, status: hasIndicator ? 'Preview Not Available' : isOldDoc ? 'Old Document - No Preview' : (linkedDocument ? 'Linked' : 'Not Linked') }; })()} isDocumentRow={true} documentData={column.document} onSave={enhancedHandleStageStatusSave} onDocumentUpload={handleStageDocumentUpload} onShowDocuments={(task, stage) => handleViewDocument(task, { ...stage, documents: [column.document] })} onAutomationClick={(e, docData) => { e.stopPropagation(); if (docData?.automation) { handleAutomationClick(row.task.class_id?.toString() || '', docData.automation.requirementId || 0, row.task.id.toString()); } }} getKycFields={getKycFields} allDocuments={allDocuments} />;
    }

    if (column.type === 'field' && row.type === 'principal') {
      const linkedDocument = getDocumentForTaskStage(row.task, { ...column.stage, documents: [column.document] });
      if (!linkedDocument || !linkedDocument.extracted_details || linkedDocument.indicator === true) {
        return <span className="text-xs text-gray-400">N/A</span>;
      }
      const value = linkedDocument.extracted_details[column.field.fieldName] || linkedDocument.extracted_details[column.field.id] || 'N/A';
      const isOldDoc = linkedDocument && row.task.created_at && isDocumentOlderThanTask(linkedDocument.created_at, row.task.created_at);

      if (column.field?.fieldType?.toLowerCase() === 'date') {
        const formattedDate = formatDateValue(value);
        return <div className="flex items-center gap-1 justify-center"><span className="text-xs text-slate-700" title={formattedDate}>{formattedDate}</span>{isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}</div>;
      }
      return <div className="flex items-center gap-1 justify-center"><span className="text-xs text-slate-700 truncate" title={value}>{value}</span>{isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}</div>;
    }

    if (column.type === 'actions' && row.type === 'principal') {
      return <div className="flex items-center justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => handleTaskEdit(row.task)} className="h-7 w-7 text-blue-600 hover:bg-blue-100" title="Edit Task"><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setTaskToDelete(row.task); }} className="h-7 w-7 text-red-600 hover:bg-red-100" title="Delete Task" disabled={dataLoading.tasks}><Trash2 className="h-4 w-4" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:bg-slate-100" title="More Actions"><Plus className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handlePushCase(row.task, 6, 'Alien')} disabled={isPushingCase}><Send className="mr-2 h-4 w-4" /> Push to Alien</DropdownMenuItem><DropdownMenuItem onClick={() => handlePushCase(row.task, 7, 'Re-Entry Pass')} disabled={isPushingCase}><Send className="mr-2 h-4 w-4" /> Push to Re-Entry</DropdownMenuItem><DropdownMenuItem onClick={() => handleDownloadZip(row.task)} disabled={isDownloading}><DownloadCloud className="mr-2 h-4 w-4" /> Download Docs</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
    }

    return <span className="text-gray-400 text-xs">-</span>;
  };

  if (!tasks.length && !dataLoading.tasks) {
    return <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200"><FileText className="h-12 w-12 text-slate-400" /><p className="mt-4 font-semibold text-slate-700">No {tableType} found</p><p className="text-sm text-slate-500">Tasks with this status will appear here.</p></div>
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
        loading={dataLoading?.tasks || false}
      />

      <div className="border-2 border-slate-200/60 rounded-xl bg-gradient-to-br from-white to-slate-50/30 overflow-hidden shadow-xl ring-1 ring-slate-900/5" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="overflow-auto h-full">
          <Table className="min-w-full border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="group">
                {/* Index Column */}
                <TableHead className="sticky left-0 z-30 bg-gradient-to-r from-blue-600 to-blue-700 text-white border-r border-blue-500/30 font-bold text-sm p-3 text-center w-16 shadow-lg">
                  <div className="flex items-center justify-center">
                    <span className="text-blue-100">#</span>
                  </div>
                </TableHead>

                {/* Applicant Column */}
                <TableHead className="sticky left-16 z-30 bg-gradient-to-r from-blue-600 to-blue-700 text-white border-r border-blue-500/30 font-bold text-sm p-3 min-w-[280px] shadow-lg">Applicant / Dependant</TableHead>

                {/* Dynamic Columns */}
                {allColumns.map((column) => {
                  const isMainColumn = !column.isSubColumn && !column.isSubSubColumn;
                  const isDocColumn = column.isSubColumn && !column.isSubSubColumn;
                  const isFieldColumn = column.isSubSubColumn;

                  return (
                    <TableHead
                      key={column.key}
                      className={`
                        text-center text-sm p-3 border-r w-[180px] min-w-[180px] max-w-[180px]
                        transition-all duration-200
                        ${isMainColumn ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-500/30 font-semibold shadow-md' : ''}
                        ${isDocColumn ? 'bg-gradient-to-b from-slate-100 to-slate-200 text-slate-800 border-slate-300 font-medium' : ''}
                        ${isFieldColumn ? 'bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 border-slate-200 font-normal' : ''}
                        hover:brightness-95
                      `}
                    >
                      <div className="flex flex-col items-center justify-center gap-2 h-full">
                        <div
                          className={`
                            truncate w-full text-center leading-tight
                            ${isFieldColumn ? 'pl-6 text-xs' : isDocColumn ? 'pl-3 text-xs' : 'text-sm'}
                          `}
                          title={column.label || column.header?.label || column.stage?.name || 'Actions'}
                        >
                          {column.label || column.header?.label || column.stage?.name || 'Actions'}
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Sort Button */}
                          {column.type === 'case_detail' && column.header.sortable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 p-0 rounded-md transition-all ${isMainColumn
                                  ? 'text-white/80 hover:text-white hover:bg-white/20'
                                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/50'
                                }`}
                              onClick={() => requestSort(column.header.id)}
                            >
                              {getSortIcon(column.header.id)}
                            </Button>
                          )}

                          {/* Stage Expand Button */}
                          {column.type === 'stage' && column.stage.documents?.length > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 p-0 rounded-md transition-all text-white/80 hover:text-white hover:bg-white/20"
                              onClick={() => toggleStageExpansion(column.stage.id.toString())}
                              title="Expand/Collapse Stage Documents"
                            >
                              {expandedStages.has(column.stage.id.toString()) ?
                                <Minus className="h-3.5 w-3.5" /> :
                                <Plus className="h-3.5 w-3.5" />
                              }
                            </Button>
                          )}

                          {/* Document Expand Button */}
                          {column.type === 'document' && column.document.kycId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 p-0 rounded-md transition-all text-slate-600 hover:text-slate-800 hover:bg-slate-300/50"
                              onClick={() => toggleDocumentExpansion(column.document.id.toString())}
                              title="Expand/Collapse Document Fields"
                            >
                              {expandedDocuments.has(column.document.id.toString()) ?
                                <Minus className="h-3.5 w-3.5" /> :
                                <Plus className="h-3.5 w-3.5" />
                              }
                            </Button>
                          )}
                        </div>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {dataLoading.tasks ? (
                <TableRow>
                  <TableCell colSpan={allColumns.length + 2} className="h-48 text-center bg-white">
                    <div className="flex flex-col justify-center items-center gap-3 text-slate-600">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                      <span className="text-sm font-medium">Loading table data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={allColumns.length + 2} className="h-48 text-center bg-white">
                    <div className="flex flex-col justify-center items-center gap-3 text-red-600">
                      <AlertTriangle className="h-8 w-8" />
                      <span className="text-sm font-medium">{error}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                taskRows.map((row, rowIndex) => {
                  const isPrincipal = row.type === 'principal';
                  const isDependant = row.type === 'dependant';

                  return (
                    <TableRow
                      key={row.key}
                      className={`
                        h-16 align-middle group transition-all duration-200
                        ${isDependant
                          ? 'bg-gradient-to-r from-amber-50/80 via-amber-50/50 to-white'
                          : rowIndex % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50/30'
                        }
                        hover:bg-gradient-to-r hover:from-blue-50 hover:via-blue-50/50 hover:to-transparent
                        hover:shadow-sm
                        border-b border-slate-200/60
                      `}
                    >
                      {/* Index Cell */}
                      <TableCell
                        className={`
                          sticky left-0 z-10 border-r border-slate-200/60 font-semibold text-sm p-3 text-center w-16
                          transition-all duration-200
                          ${isDependant
                            ? 'bg-gradient-to-r from-amber-50/80 to-amber-50/50 text-amber-700'
                            : rowIndex % 2 === 0
                              ? 'bg-white text-slate-700'
                              : 'bg-slate-50/30 text-slate-700'
                          }
                          group-hover:bg-blue-50/80 group-hover:text-blue-900
                          shadow-sm
                        `}
                      >
                        <div className="flex items-center justify-center">
                          <span className="text-xs font-mono font-bold">{row.taskIndex + 1}</span>
                        </div>
                      </TableCell>

                      {/* Applicant/Dependant Cell */}
                      <TableCell
                        className={`
                          sticky left-16 z-10 border-r border-slate-200/60 p-3 min-w-[280px]
                          transition-all duration-200
                          ${isDependant
                            ? 'bg-gradient-to-r from-amber-50/80 to-amber-50/50'
                            : rowIndex % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-50/30'
                          }
                          group-hover:bg-blue-50/80
                          shadow-sm
                        `}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Dependant Indicator */}
                            {/* {isDependant && (
                              <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex-shrink-0 shadow-md ring-2 ring-amber-200" title="Dependant">
                                <div className="w-2 h-2 bg-white rounded-full" />
                              </div>
                            )} */}

                            {/* Principal Indicator */}
                            {/* {isPrincipal && (
                              <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex-shrink-0 shadow-md ring-2 ring-blue-200" title="Principal">
                                <FileText className="w-3.5 h-3.5 text-white" />
                              </div>
                            )} */}

                            {/* Name & Details */}
                            <div className="flex flex-col text-left flex-1 min-w-0">
                              <span className={`
                                font-semibold truncate
                                ${isDependant ? 'text-amber-900' : 'text-slate-900'}
                              `}>
                                {row.label}
                              </span>
                              {isDependant && (
                                <span className="text-xs text-amber-600 font-medium">
                                  {row.dependant.relationship || 'Dependant'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand/Collapse Dependants Button */}
                          {isPrincipal && taskDependants.get(row.task.id.toString())?.length > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`
                                h-8 w-8 rounded-lg flex-shrink-0 transition-all
                                ${expandedDependants.has(row.task.id.toString())
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 shadow-sm'
                                  : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'
                                }
                              `}
                              onClick={() => toggleDependantsExpansion(row.task.id.toString())}
                              title={`${expandedDependants.has(row.task.id.toString()) ? 'Hide' : 'Show'} Dependants (${taskDependants.get(row.task.id.toString())?.length})`}
                            >
                              {expandedDependants.has(row.task.id.toString()) ?
                                <Minus className="h-4 w-4" /> :
                                <Plus className="h-4 w-4" />
                              }
                            </Button>
                          )}
                        </div>
                      </TableCell>

                      {/* Data Cells */}
                      {allColumns.map((column) => {
                        const isFieldColumn = column.isSubSubColumn;
                        const isDocColumn = column.isSubColumn && !column.isSubSubColumn;

                        return (
                          <TableCell
                            key={`${row.key}-${column.key}`}
                            className={`
                              text-center text-sm p-3 border-r border-slate-200/60 w-[180px] min-w-[180px] max-w-[180px]
                              transition-all duration-200
                              ${isDependant
                                ? 'bg-gradient-to-r from-transparent to-white/50'
                                : isFieldColumn
                                  ? 'bg-slate-50/50'
                                  : isDocColumn
                                    ? 'bg-slate-50/30'
                                    : ''
                              }
                              group-hover:bg-blue-50/30
                            `}
                          >
                            {renderCellForColumn(column, row)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
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