// @ts-nocheck
"use client"

import React, { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap, Trash2 } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog"

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
}

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
  onDeleteTask
}) => {
  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
        <FileText className="h-12 w-12 text-slate-400" />
        <p className="mt-4 font-semibold text-slate-700">No {tableType} found</p>
        <p className="text-sm text-slate-500">Tasks with this status will appear here.</p>
      </div>
    )
  }

  // Calculate header structure with dependants from registry_individuals
  const headerStructure = []
  tasks.forEach(task => {
    headerStructure.push({ type: 'principal', task })
    
    // Use fetched dependants instead of dependants_members
    const taskDeps = taskDependants.get(task.id.toString()) || []
    if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
      taskDeps.forEach((dep, index) => {
        headerStructure.push({ type: 'dependant', task, dependant: dep, index })
      })
    }
  })

  const totalColumns = headerStructure.length;
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
    // Find the task to get the subDeptId
    const task = tasks.find(t => t.id === taskId);
    setSelectedRequirement({ 
      classId, 
      requirementId,
      subDeptId: task.subdepartment?.id?.toString() || task.subdepartment_id?.toString() || task.sub_dept_id?.toString() || '',
      taskId,
      task // Store the entire task object
    });
    setAutomationDialogOpen(true);
  };

  // Handle delete confirmation
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
      <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            {/* Case Details Rows */}
            {expandedSections.has('case_details') && visibleCaseDetailHeaders.map((header, index) => (
              <TableRow key={header.id} className="bg-blue-600 text-white group border-b border-slate-200">
                <TableCell className="sticky left-0 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center w-20">
                  {index + 1}
                </TableCell>
                <TableCell className="sticky left-8 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 min-w-[400px]">
                  {header.label}
                </TableCell>
                {headerStructure.map((item, colIndex) => (
                  <TableCell key={`${header.id}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    {item.type === 'principal'
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
                          default: return <span className="text-sm text-gray-400">-</span>;
                        }
                      })()
                    }
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-slate-200">
          {loading ? (
            <TableRow>
              <TableCell colSpan={totalColumns + 2} className="h-32 text-center">
                <div className="flex justify-center items-center gap-2 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading table data...
                </div>
              </TableCell>
            </TableRow>
          ) : error ? (
            <TableRow>
              <TableCell colSpan={totalColumns + 2} className="h-32 text-center text-red-600 border border-gray-100">
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
                    <TableCell colSpan={totalColumns} className="py-0 px-0"></TableCell>
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
                              console.log('Setting task to delete:', row.task);
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
                  {headerStructure.map((item, colIndex) => (
                    <TableCell key={`${row.key}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}>
                      {item.type === 'principal' ? (
                        renderCellContent(row, item.task)
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
    task={selectedRequirement.task} // Pass the complete task object
    isSubclass={!!selectedRequirement.task?.subclass_id}
    subclassId={selectedRequirement.task?.subclass_id?.toString()}
  />
)}
  </div>
  )
}