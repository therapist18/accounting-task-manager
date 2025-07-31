// @ts-nocheck
"use client"

import React, { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Edit, Trash2, ChevronDown, Plus, Minus, Eye, Send, DownloadCloud, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDateValue, isDocumentOlderThanTask } from "../utils/taskManagerData"
import EditableStageCell from "../components/EditableStageCell"
import { DocumentFieldCell } from "../components/DocumentFieldCell"

interface StandardTableProps {
  tasks: any[]
  tableType: string
  ENHANCED_TABLE_HEADERS: any[]
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
  isStageApplicableToTask: (stage: any, task: any) => boolean
  getDocumentForTaskStage: (task: any, stage: any) => any
  getTaskHierarchy: (task: any) => any
  getStaffName: (userId: any) => string
  requestSort: (key: string) => void
  handleTaskEdit: (task: any) => void
  handleStageDocumentUpload: (task: any, stage: any) => void
  handleViewDocument: (task: any, stage: any) => void
  handlePushCase: (task: any, targetSubDeptId: number, targetSubDeptName: string) => void
  handleDownloadZip: (task: any) => void
  onTaskAction: any
  enhancedHandleStageStatusSave: any
  getKycFields: any
  toggleStageExpansion: (stageId: string) => void
  toggleDocumentExpansion: (docId: string) => void
}

export const StandardTable: React.FC<StandardTableProps> = ({
  tasks,
  tableType,
  ENHANCED_TABLE_HEADERS,
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
  dataLoading,
  error,
  isPushingCase,
  isDownloading,
  enhancedTasksData,
  getCellContent,
  getSortedTasks,
  isStageApplicableToTask,
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
  toggleDocumentExpansion
}) => {
  const sortedTasks = getSortedTasks(tasks || []);

  if (!sortedTasks.length) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
        <FileText className="h-12 w-12 text-slate-400" />
        <p className="mt-4 font-semibold text-slate-700">No {tableType} found</p>
        <p className="text-sm text-slate-500">Tasks with this status will appear here.</p>
      </div>
    )
  }

  const kycFieldsMap = new Map(
    Array.from(kycDocuments.entries()).map(([kycId, kycDoc]) => [kycId, kycDoc.fields || []])
  );

  const visibleStages = stages
    .filter(stage => stage && visibleStageIds.has(stage.id.toString()))
    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

  // Filter headers based on visibility settings
  const visibleTableHeaders = ENHANCED_TABLE_HEADERS.filter(header =>
    visibleHeaders.has(header.id)
  );

  const totalStageColumns = visibleStages.reduce((total, stage) => {
    if (!isStageApplicableToTask(stage, tasks[0])) {
      return total + 1;
    }
    if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
      return total + stage.documents.reduce((docTotal, doc) => {
        if (expandedDocuments.has(doc.id) && doc.kycId && kycFieldsMap.has(doc.kycId)) {
          const fields = kycFieldsMap.get(doc.kycId) || [];
          return docTotal + (fields.length > 0 ? fields.length : 1);
        }
        return docTotal + 1;
      }, 0);
    }
    return total + 1;
  }, 0);

  const SortableHeader = ({ sortKey, children, className, rowSpan = 1 }) => {
    const isSorted = sortConfig?.key === sortKey;
    return (
      <TableHead className={className} onClick={() => requestSort(sortKey)} rowSpan={rowSpan}>
        <div className="flex items-center justify-center gap-2 cursor-pointer">
          {children}
          {isSorted ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
          ) : <ArrowUpDown className="h-4 w-4 opacity-30" />}
        </div>
      </TableHead>
    )
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-blue-500 overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      <Table className="min-w-full border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-20 bg-blue-500/80 backdrop-blur-sm">
          <TableRow className="h-12">
            {/* Render only visible headers */}
            {visibleTableHeaders.map(header => (
              <SortableHeader
                key={header.id}
                rowSpan={2}
                sortKey={header.id}
                className={`bg-blue-500 border-r border-b-2 border-slate-300 text-white font-semibold text-center align-middle ${header.width || 'w-auto'} hover:bg-slate-200`}
              >
                {header.label}
              </SortableHeader>
            ))}

            {/* Workflow stages section */}
            <TableHead colSpan={totalStageColumns} className="bg-blue-500 border-r border-b-2 border-slate-300 text-white text-center font-bold px-2 align-middle">
              <div className="flex items-center justify-center gap-2">
                WORKFLOW STAGES
                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-white hover:bg-slate-200" onClick={() => {}} title="Expand All"><Plus className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-white hover:bg-slate-200" onClick={() => {}} title="Collapse All"><Minus className="h-4 w-4" /></Button>
              </div>
            </TableHead>
            <TableHead rowSpan={2} className="bg-blue-500 border-r-0 border-b-2 border-slate-300 text-white font-semibold text-center w-[120px] sticky right-0 z-20 align-middle">
              Actions
            </TableHead>
          </TableRow>
          <TableRow className="h-14">
            {/* Stage Sub-Headers */}
            {visibleStages.map(stage => {
              const subHeaderBaseClasses = "bg-blue-400 border-r border-b border-slate-300 text-white text-center text-sm font-medium align-middle p-1 whitespace-nowrap";
              if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                return <TableHead key={`subhead-stage-${stage.id}`} className={subHeaderBaseClasses}><div className="flex items-center justify-center gap-1">{stage.name} <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:bg-slate-200" onClick={() => toggleStageExpansion(stage.id)}><Plus className="h-3 w-3" /></Button></div></TableHead>
              }

              return stage.documents.map(doc => {
                const kycData = kycDocuments.get(doc.kycId);
                const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || 'Document';
                const isOldDoc = false;
                const hasIndicator = false;

                if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0 || hasIndicator || isOldDoc) {
                  return <TableHead key={`subhead-doc-${doc.id}`} className={subHeaderBaseClasses}><div className="flex items-center justify-center gap-1">{docDisplayName} <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:bg-slate-200" onClick={() => toggleDocumentExpansion(doc.id)}><Plus className="h-3 w-3" /></Button></div></TableHead>
                }

                const kycFields = kycFieldsMap.get(doc.kycId) || [];
                return kycFields.map(field => (
                  <TableHead key={`subhead-field-${field.id}`} className={subHeaderBaseClasses}>{field.fieldName}</TableHead>
                ))
              }).flat()
            })}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-200">
          {(dataLoading.tasks || dataLoading.stages || dataLoading.companies) ? (
            <TableRow><TableCell colSpan={visibleTableHeaders.length + totalStageColumns + 1} className="h-32 text-center text-slate-500">Loading...</TableCell></TableRow>
          ) : error ? (
            <TableRow><TableCell colSpan={visibleTableHeaders.length + totalStageColumns + 1} className="h-32 text-center text-destructive">{error}</TableCell></TableRow>
          ) : (
            <>
              {sortedTasks.map((task) => (
                <React.Fragment key={task.id}>
                  {/* Main task row */}
                  <TableRow className="group bg-white hover:bg-blue-50/50">
                    {/* DYNAMICALLY RENDERED CELLS BASED ON VISIBLE HEADERS */}
                    {visibleTableHeaders.map(header => {
                      const cellContent = getCellContent(task, header.id);
                      const isComplex = React.isValidElement(cellContent);
                      return (
                        <TableCell key={`${task.id}-${header.id}`} className="border border-gray-200 text-sm p-2 align-middle text-center">
                          {isComplex ? cellContent : <div className="max-w-[180px] mx-auto truncate" title={cellContent}>{cellContent}</div>}
                        </TableCell>
                      );
                    })}
                    {/* STAGE CELLS - ALWAYS USE EditableStageCell */}
                    {visibleStages.map(stage => {
                      if (!isStageApplicableToTask(stage, task)) {
                        return <TableCell key={`${stage.id}-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle">N/A</TableCell>
                      }

                      // ALWAYS use EditableStageCell - this ensures automation buttons appear
                      if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                        return (
                          <TableCell key={stage.id} className="border border-gray-200 p-1 align-middle">
                            <EditableStageCell
                              stage={stage}
                              task={task}
                              value={task.stages?.[stage.id]}
                              allDocuments={allDocuments}
                              onDocumentUpload={handleStageDocumentUpload}
                              onShowDocuments={handleViewDocument}
                              getKycFields={getKycFields}
                              onSave={enhancedHandleStageStatusSave}
                            />
                          </TableCell>
                        )
                      }

                      return stage.documents.map(doc => {
                        const linkedDocumentForType = getDocumentForTaskStage(task, { ...stage, documents: [doc] });
                        const isOldDoc = linkedDocumentForType && task.created_at && isDocumentOlderThanTask(linkedDocumentForType.created_at, task.created_at);
                        const hasIndicator = linkedDocumentForType?.indicator === true;

                        if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0 || hasIndicator || isOldDoc) {
                          return (
                            <TableCell key={`${doc.id}`} className="border border-gray-200 p-1 align-middle">
                              {/* ALWAYS use EditableStageCell for consistency and automation buttons */}
                              <EditableStageCell
                                stage={{ ...stage, documents: [doc] }}
                                task={task}
                                value={task.stages?.[stage.id]}
                                allDocuments={allDocuments}
                                onDocumentUpload={handleStageDocumentUpload}
                                onShowDocuments={handleViewDocument}
                                getKycFields={getKycFields}
                                onSave={enhancedHandleStageStatusSave}
                              />
                            </TableCell>
                          )
                        } else {
                          const kycFields = kycFieldsMap.get(doc.kycId) || [];
                          return kycFields.map(field => (
                            <TableCell key={`${field.id || field.fieldName}`} className="border border-gray-200 p-1 align-middle">
                              <DocumentFieldCell document={linkedDocumentForType} field={field} isOldDocument={isOldDoc} />
                            </TableCell>
                          ))
                        }
                      }).flat()
                    })}
                    {/* ACTIONS CELL */}
                    <TableCell className="text-center text-sm p-2 align-middle sticky right-0 bg-white group-hover:bg-blue-50/50 border-l border-gray-200">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100" title="Edit Task"><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => onTaskAction?.({ type: 'delete', task })} className="h-8 w-8 text-red-600 hover:bg-red-100" title="Delete Task"><Trash2 className="h-4 w-4" /></Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:bg-slate-100" title="More Actions"><ChevronDown className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handlePushCase(task, 6, 'Alien')} disabled={isPushingCase}><Send className="mr-2 h-4 w-4" /> Push to Alien</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePushCase(task, 7, 'Re-Entry Pass')} disabled={isPushingCase}><Send className="mr-2 h-4 w-4" /> Push to Re-Entry</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadZip(task)} disabled={isDownloading}><DownloadCloud className="mr-2 h-4 w-4" /> Download Docs</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Dependant rows */}
                  {expandedDependants.has(task.id.toString()) && (() => {
                    const taskDeps = taskDependants.get(task.id.toString()) || [];
                    return taskDeps.map((dependant, depIndex) => (
                      <TableRow key={`${task.id}-dep-${depIndex}`} className="group bg-orange-50/30 hover:bg-orange-100/50 border-l-4 border-orange-400">
                        {/* DEPENDANT CELLS BASED ON VISIBLE HEADERS */}
                        {visibleTableHeaders.map(header => {
                          let cellContent = '';
                          switch (header.id) {
                            case 'id': cellContent = `${task.id}-D${depIndex + 1}`; break;
                            case 'applicant_name': cellContent = (
                              <div className="flex items-center gap-2">
                                <div className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded">DEP</div>
                                <div>
                                  <div className="font-medium">{dependant.full_name}</div>
                                  <div className="text-xs text-gray-500">{dependant.relationship}</div>
                                </div>
                              </div>
                            ); break;
                            case 'nationality': cellContent = dependant.nationality || 'N/A'; break;
                            case 'age': cellContent = dependant.age?.toString() || 'N/A'; break;
                            case 'company_name': cellContent = companies.get(task.company_id) || 'N/A'; break;
                            case 'job_level': cellContent = getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || 'N/A'; break;
                            case 'task_manager': cellContent = getStaffName(task.task_manager_id); break;
                            case 'officer': cellContent = getStaffName(task.officer_id); break;
                            case 'task_assistant': cellContent = getStaffName(task.task_assistant_id); break;
                            case 'case_status': cellContent = task.status || 'N/A'; break;
                            case 'renewal_new': cellContent = task.renewal_status || 'New'; break;
                            default: cellContent = '-'; break;
                          }
                          
                          const isComplex = React.isValidElement(cellContent);
                          return (
                            <TableCell key={`${task.id}-dep-${depIndex}-${header.id}`} className="border border-gray-200 text-sm p-2 align-middle text-center bg-orange-50/20">
                              {isComplex ? cellContent : <div className="max-w-[180px] mx-auto truncate" title={cellContent}>{cellContent}</div>}
                            </TableCell>
                          );
                        })}
                        {/* STAGE CELLS FOR DEPENDANTS - Show N/A */}
                        {visibleStages.map(stage => {
                          if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                            return <TableCell key={`${stage.id}-dep-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle bg-orange-50/20">N/A</TableCell>
                          }
                          return stage.documents.map(doc => {
                            if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0) {
                              return <TableCell key={`${doc.id}-dep-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle bg-orange-50/20">N/A</TableCell>
                            } else {
                              const kycFields = kycFieldsMap.get(doc.kycId) || [];
                              return kycFields.map(field => (
                                <TableCell key={`${field.id || field.fieldName}-dep-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle bg-orange-50/20">N/A</TableCell>
                              ))
                            }
                          }).flat()
                        })}
                        {/* ACTIONS CELL FOR DEPENDANTS */}
                        <TableCell className="text-center text-sm p-2 align-middle sticky right-0 bg-orange-50/20 border-l border-gray-200">
                          <span className="text-xs text-gray-500">Dependant</span>
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </React.Fragment>
              ))}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  )
}