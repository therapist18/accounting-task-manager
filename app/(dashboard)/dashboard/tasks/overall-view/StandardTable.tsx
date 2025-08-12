// @ts-nocheck
"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap, Trash2, ChevronUp, ChevronDown, Edit, Send, DownloadCloud, Eye } from "lucide-react"
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
  dataLoading,
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
  toggleDocumentExpansion
}) => {
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

  const toggleDependantsExpansion = (taskId: string) => {
    // This should be passed from parent - for now just log
    console.log('Toggle dependants for task:', taskId);
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

  const sortedTasks = getSortedTasks(tasks);

  // Get visible headers and stages
  const visibleCaseDetailHeaders = ENHANCED_TABLE_HEADERS_IMMIGRATION.filter(header =>
    visibleHeaders.has(header.id)
  );

  const visibleStages = stages
    .filter(stage => visibleStageIds.has(stage.id.toString()))
    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

  // Generate all column headers
  const generateColumns = () => {
    const columns = [];
    
    // Add case detail columns
    visibleCaseDetailHeaders.forEach(header => {
      columns.push({ type: 'case_detail', header, key: `header-${header.id}` });
    });

    // Add stage columns
    visibleStages.forEach(stage => {
      columns.push({ type: 'stage', stage, key: `stage-${stage.id}` });
      
      // Add document columns if stage is expanded
      if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
        stage.documents.forEach((doc, docIndex) => {
          const kycData = kycDocuments.get(doc.kycId);
          const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';
          
          columns.push({ 
            type: 'document', 
            stage, 
            document: doc, 
            key: `doc-${stage.id}-${doc.id}`,
            label: docDisplayName,
            isSubColumn: true 
          });

          // Add field columns if document is expanded
          if (expandedDocuments.has(doc.id) && doc.kycId) {
            // We'll handle field expansion dynamically since getKycFields is async
            // This will be handled in the rendering phase
          }
        });
      }
    });

    // Add actions column
    columns.push({ type: 'actions', key: 'actions', label: 'Actions' });

    return columns;
  };

  // Generate all task rows
  const generateTaskRows = () => {
    const rows = [];
    
    sortedTasks.forEach((task, taskIndex) => {
      // Add main task row
      rows.push({
        type: 'principal',
        task,
        taskIndex,
        key: `task-${task.id}`,
        label: task.applicant_name || 'N/A'
      });

      // Add dependant rows if expanded
      const taskDeps = taskDependants.get(task.id.toString()) || [];
      if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
        taskDeps.forEach((dep, depIndex) => {
          rows.push({
            type: 'dependant',
            task,
            dependant: dep,
            taskIndex,
            depIndex,
            key: `dep-${task.id}-${dep.id || depIndex}`,
            label: dep.full_name || 'N/A'
          });
        });
      }
    });

    return rows;
  };

  const allColumns = generateColumns();
  const taskRows = generateTaskRows();

  // Get sort direction indicator
  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  // Helper function to render cell content based on column type
  const renderCellForColumn = (column: any, row: any) => {
    if (column.type === 'case_detail') {
      if (row.type === 'principal') {
        return (
          <div className="truncate w-full text-sm" title={getCellContent(row.task, column.header.id)?.toString()}>
            {getCellContent(row.task, column.header.id)}
          </div>
        );
      } else {
        // Dependant row
        switch (column.header.id) {
          case 'applicant_name':
            return (
              <div className="flex flex-col text-xs">
                <span className="font-medium">{row.dependant.full_name || 'N/A'}</span>
                <span className="text-gray-500">{row.dependant.relationship || 'Dependant'}</span>
              </div>
            );
          case 'nationality':
            return <span className="text-xs">{row.dependant.nationality || 'N/A'}</span>;
          case 'age':
            return <span className="text-xs">{row.dependant.age?.toString() || 'N/A'}</span>;
          case 'case_status':
            return (
              <div className="flex flex-col text-xs">
                <span>{row.dependant.relationship || 'Dependant'}</span>
                <span className="text-gray-500">{row.dependant.nationality || ''}</span>
              </div>
            );
          default:
            return <span className="text-gray-400 text-xs">-</span>;
        }
      }
    }

    if (column.type === 'stage') {
      if (row.type === 'principal') {
        return (
          <EditableStageCell
            key={`${column.stage.id}-${row.task.id}`}
            stage={column.stage}
            task={row.task}
            value={row.task.stages?.[column.stage.id]?.status}
            onSave={enhancedHandleStageStatusSave}
            onDocumentUpload={handleStageDocumentUpload}
            onShowDocuments={handleViewDocument}
            requiresUpload={column.stage.requires_upload !== false}
            onAutomationClick={(e) => {
              e.stopPropagation();
              if (column.stage.automation) {
                handleAutomationClick(
                  row.task.class_id?.toString() || '',
                  column.stage.automation.requirementId || 0,
                  row.task.id.toString()
                );
              }
            }}
            getKycFields={getKycFields}
            allDocuments={allDocuments}
          />
        );
      } else {
        // Dependant row - stages don't apply
        return <span className="text-gray-400 text-xs">-</span>;
      }
    }

    if (column.type === 'document') {
      if (row.type === 'principal') {
        return (
          <EditableStageCell
            key={`${column.stage.id}-${column.document.id}-${row.task.id}`}
            stage={column.stage}
            task={row.task}
            value={(() => {
              const linkedDocument = getDocumentForTaskStage(row.task, { ...column.stage, documents: [column.document] });
              const isOldDoc = linkedDocument && row.task.created_at &&
                isDocumentOlderThanTask(linkedDocument.created_at, row.task.created_at);
              const hasIndicator = linkedDocument?.indicator === true;

              return {
                hasDocument: !!linkedDocument,
                isOldDocument: isOldDoc,
                hasIndicator,
                status: hasIndicator ? 'Preview Not Available' :
                  isOldDoc ? 'Old Document - No Preview' :
                    (linkedDocument ? 'Linked' : 'Not Linked')
              };
            })()}
            isDocumentRow={true}
            documentData={column.document}
            onSave={enhancedHandleStageStatusSave}
            onDocumentUpload={handleStageDocumentUpload}
            onShowDocuments={(task, stage) => handleViewDocument(task, { ...stage, documents: [column.document] })}
            onAutomationClick={(e, docData) => {
              e.stopPropagation();
              if (docData?.automation) {
                handleAutomationClick(
                  row.task.class_id?.toString() || '',
                  docData.automation.requirementId || 0,
                  row.task.id.toString()
                );
              }
            }}
            getKycFields={getKycFields}
            allDocuments={allDocuments}
          />
        );
      } else {
        return <span className="text-gray-400 text-xs">-</span>;
      }
    }

    if (column.type === 'field') {
      if (row.type === 'principal') {
        const linkedDocument = getDocumentForTaskStage(row.task, { ...column.stage, documents: [column.document] });
        if (!linkedDocument || !linkedDocument.extracted_details || linkedDocument.indicator === true) {
          return <span className="text-xs text-gray-400">N/A</span>;
        }
        
        const value = linkedDocument.extracted_details[column.field.fieldName] || 
                     linkedDocument.extracted_details[column.field.id] || 'N/A';
        const isOldDoc = linkedDocument && row.task.created_at &&
          isDocumentOlderThanTask(linkedDocument.created_at, row.task.created_at);

        if (column.field?.fieldType?.toLowerCase() === 'date') {
          const formattedDate = formatDateValue(value);
          return (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-700" title={formattedDate}>{formattedDate}</span>
              {isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}
            </div>
          );
        }
        
        return (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-700">{value}</span>
            {isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}
          </div>
        );
      } else {
        return <span className="text-gray-400 text-xs">-</span>;
      }
    }

    if (column.type === 'actions') {
      if (row.type === 'principal') {
        return (
          <div className="flex items-center justify-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => handleTaskEdit(row.task)} 
              className="h-6 w-6 text-blue-600 hover:bg-blue-100" 
              title="Edit Task"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setTaskToDelete(row.task);
              }}
              className="h-6 w-6 text-red-600 hover:bg-red-100"
              title="Delete Task"
              disabled={dataLoading.tasks}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-600 hover:bg-slate-100" title="More Actions">
                  <Plus className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handlePushCase(row.task, 6, 'Alien')}
                  disabled={isPushingCase}
                >
                  <Send className="mr-2 h-3 w-3" /> Push to Alien
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handlePushCase(row.task, 7, 'Re-Entry Pass')}
                  disabled={isPushingCase}
                >
                  <Send className="mr-2 h-3 w-3" /> Push to Re-Entry
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownloadZip(row.task)} disabled={isDownloading}>
                  <DownloadCloud className="mr-2 h-3 w-3" /> Download Docs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      } else {
        return <span className="text-gray-400 text-xs">-</span>;
      }
    }

    return <span className="text-gray-400 text-xs">-</span>;
  };

  // Async component for handling field columns that require KYC data
  const FieldColumns = ({ doc, stage, columns, setColumns }) => {
    React.useEffect(() => {
      if (expandedDocuments.has(doc.id) && doc.kycId) {
        getKycFields(doc).then(kycFields => {
          if (kycFields && kycFields.length > 0) {
            const fieldCols = kycFields.map((field, fieldIndex) => ({
              type: 'field',
              stage,
              document: doc,
              field,
              key: `field-${stage.id}-${doc.id}-${field.id || field.fieldName}`,
              label: field.fieldName,
              isSubColumn: true,
              isSubSubColumn: true
            }));
            
            // Insert field columns after the document column
            const docIndex = columns.findIndex(col => col.key === `doc-${stage.id}-${doc.id}`);
            if (docIndex !== -1) {
              const newColumns = [...columns];
              newColumns.splice(docIndex + 1, 0, ...fieldCols);
              setColumns(newColumns);
            }
          }
        });
      }
    }, [expandedDocuments, doc.id, doc.kycId]);

    return null;
  };

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
        loading={dataLoading.tasks}
      />

      <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            <TableRow className="bg-blue-600 text-white group border-b border-slate-200">
              <TableHead className="sticky left-0 z-30 bg-blue-600 text-white border border-gray-100 font-medium text-sm p-2 text-center w-12">
                #
              </TableHead>
              <TableHead className="sticky left-12 z-30 bg-blue-600 text-white border border-gray-100 font-medium text-sm p-2 min-w-[200px]">
                Applicant / Dependant
              </TableHead>
              {allColumns.map((column, index) => (
                <TableHead 
                  key={column.key} 
                  className={`text-center text-sm py-2 px-1 border border-gray-100 w-[120px] min-w-[120px] max-w-[120px] ${
                    column.isSubColumn ? 'bg-slate-50' : 
                    column.isSubSubColumn ? 'bg-slate-100' : 'bg-blue-600'
                  } ${column.isSubColumn || column.isSubSubColumn ? 'text-slate-700' : 'text-white'}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div 
                      className={`font-medium truncate w-full text-center ${
                        column.isSubColumn ? 'pl-2' : column.isSubSubColumn ? 'pl-4' : ''
                      }`} 
                      title={
                        column.type === 'case_detail' ? column.header.label :
                        column.type === 'stage' ? column.stage.name :
                        column.type === 'document' ? column.label :
                        column.type === 'field' ? column.field.fieldName :
                        column.label
                      }
                    >
                      {column.type === 'case_detail' ? column.header.label :
                       column.type === 'stage' ? column.stage.name :
                       column.type === 'document' ? column.label :
                       column.type === 'field' ? column.field.fieldName :
                       column.label || 'Actions'}
                    </div>
                    {column.type === 'case_detail' && column.header.sortable && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 p-0 text-white hover:text-blue-200"
                        onClick={() => requestSort(column.header.id)}
                      >
                        {getSortIcon(column.header.id)}
                      </Button>
                    )}
                    {column.type === 'stage' && column.stage.documents && column.stage.documents.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 p-0 text-white hover:text-blue-200" 
                        onClick={() => toggleStageExpansion(column.stage.id)}
                        title="Expand/Collapse Stage Documents"
                      >
                        {expandedStages.has(column.stage.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      </Button>
                    )}
                    {column.type === 'document' && column.document.kycId && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 p-0 text-slate-500 hover:text-slate-800" 
                        onClick={() => toggleDocumentExpansion(column.document.id)}
                        title="Expand/Collapse Document Fields"
                      >
                        {expandedDocuments.has(column.document.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-slate-200">
            {dataLoading.tasks ? (
              <TableRow>
                <TableCell colSpan={allColumns.length + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading table data...
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={allColumns.length + 2} className="h-32 text-center text-red-600 border border-gray-100">
                  <div className="flex justify-center items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {error}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              taskRows.map((row, rowIndex) => (
                <TableRow 
                  key={row.key} 
                  className={`hover:bg-blue-50/50 group border-b border-slate-200 ${
                    row.type === 'dependant' ? 'bg-orange-50/30' : ''
                  }`}
                >
                  <TableCell className={`sticky left-0 z-20 ${row.type === 'dependant' ? 'bg-orange-50/30' : 'bg-white'} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center w-12`}>
                    {rowIndex + 1}
                  </TableCell>
                  <TableCell className={`sticky left-12 z-20 ${row.type === 'dependant' ? 'bg-orange-50/30' : 'bg-white'} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 min-w-[200px]`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {row.type === 'dependant' && (
                          <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" title="Dependant" />
                        )}
                        <div className="flex flex-col">
                          <span className={`font-medium ${row.type === 'dependant' ? 'text-orange-700' : 'text-slate-700'}`}>
                            {row.label}
                          </span>
                          {row.type === 'dependant' && (
                            <span className="text-xs text-orange-600">{row.dependant.relationship || 'Dependant'}</span>
                          )}
                        </div>
                      </div>
                      {row.type === 'principal' && taskDependants.get(row.task.id.toString())?.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-500 hover:text-orange-600"
                          onClick={() => toggleDependantsExpansion(row.task.id.toString())}
                          title={`${expandedDependants.has(row.task.id.toString()) ? 'Hide' : 'Show'} Dependants`}
                        >
                          {expandedDependants.has(row.task.id.toString()) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  {allColumns.map((column, colIndex) => (
                    <TableCell 
                      key={`${row.key}-${column.key}`} 
                      className={`text-center text-sm py-2 px-1 border border-gray-100 w-[120px] min-w-[120px] max-w-[120px] ${
                        row.type === 'dependant' ? 'bg-orange-50/30' : ''
                      } ${column.isSubColumn ? 'bg-slate-50/50' : ''} ${column.isSubSubColumn ? 'bg-slate-100/50' : ''}`}
                    >
                      {renderCellForColumn(column, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Automation Mapping Dialog */}
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