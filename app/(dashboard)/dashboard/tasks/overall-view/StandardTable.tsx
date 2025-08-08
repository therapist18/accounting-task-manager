// @ts-nocheck
"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Plus, Minus, Loader2, AlertTriangle, Zap } from "lucide-react"
import { AutomationMappingDialog } from "../components/AutomationMappingDialog"

interface StandardTableProps {
  tasks: any[]
  tableType: string
  ENHANCED_TABLE_HEADERS: any[]
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
}

export const StandardTable: React.FC<StandardTableProps> = ({
  tasks,
  tableType,
  ENHANCED_TABLE_HEADERS,
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
  getStaffName
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

  // This structure now defines the COLUMNS of the transposed table
  const columnStructure = []
  tasks.forEach(task => {
    columnStructure.push({ type: 'principal', task })
    
    const taskDeps = taskDependants.get(task.id.toString()) || []
    if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
      taskDeps.forEach((dep, index) => {
        columnStructure.push({ type: 'dependant', task, dependant: dep, index })
      })
    }
  })

  const visibleCaseDetailHeaders = ENHANCED_TABLE_HEADERS.filter(header =>
    visibleHeaders.has(header.id)
  );

  // State for automation dialog
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<{
    classId: string, 
    requirementId: number, 
    subDeptId?: string,
    taskId: string,
    task?: any
  } | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          {/* --- TRANSPOSED HEADER --- */}
          {/* The header row now lists the tasks/dependants as columns */}
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            <TableRow className="border-b border-slate-300">
              <TableCell className="sticky left-0 z-10 bg-blue-600 text-white font-medium text-sm p-2 min-w-[400px] border-r border-slate-300">
                Details
              </TableCell>
              {columnStructure.map((item, colIndex) => (
                <TableCell
                  key={`${item.task.id}-${item.type}-${item.dependant?.id || colIndex}`}
                  className={`text-center text-sm py-1 px-2 align-middle font-medium border-l border-slate-300 w-[200px] ${
                    item.type === 'dependant' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'
                  }`}
                >
                  {item.type === 'principal' ? (
                    <div className="flex flex-col">
                      <span>{getCellContent(item.task, 'applicant_name') || 'N/A'}</span>
                      <span className="text-xs text-blue-200">Principal Applicant</span>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <span>{item.dependant.full_name || 'N/A'}</span>
                      <span className="text-xs text-orange-200">{item.dependant.relationship || 'Dependant'}</span>
                    </div>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>

          {/* --- TRANSPOSED BODY --- */}
          {/* The body now iterates through details/stages as rows */}
          <TableBody className="divide-y divide-slate-200">
          {loading ? (
            <TableRow>
              <TableCell colSpan={columnStructure.length + 1} className="h-32 text-center">
                <div className="flex justify-center items-center gap-2 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading table data...
                </div>
              </TableCell>
            </TableRow>
          ) : error ? (
            <TableRow>
              <TableCell colSpan={columnStructure.length + 1} className="h-32 text-center text-red-600 border border-gray-100">
                <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
              </TableCell>
            </TableRow>
          ) : (
            <>
              {/* Case Details Rows */}
              {expandedSections.has('case_details') &&
                visibleCaseDetailHeaders.map((header, rowIndex) => (
                  <TableRow key={header.id} className="group hover:bg-blue-50/50">
                    <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 border-r border-slate-200 font-medium text-sm text-slate-700 p-2 min-w-[400px]">
                      {header.label}
                    </TableCell>
                    {columnStructure.map((item, colIndex) => (
                      <TableCell key={`${header.id}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle border-l border-slate-200 w-[200px] ${item.type === 'dependant' ? 'bg-orange-50/50' : 'bg-white'}`}>
                        {item.type === 'principal'
                          ? getCellContent(item.task, header.id)
                          : (() => {
                              switch (header.id) {
                                case 'applicant_name': 
                                  return item.dependant.full_name || 'N/A';
                                case 'nationality': 
                                  return item.dependant.nationality || 'N/A';
                                case 'age': 
                                  return item.dependant.age?.toString() || 'N/A';
                                case 'case_status': 
                                  return item.dependant.relationship || 'Dependant';
                                default: return <span className="text-sm text-gray-400">-</span>;
                              }
                            })()
                        }
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {/* Main Body Rows (Stages, Documents, Requirements) */}
              {tableRows.map((row) => {
                if (row.type === 'section_header') {
                  const Icon = row.icon;
                  return (
                    <TableRow key={row.key} className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200">
                      <TableCell colSpan={columnStructure.length + 1} className="py-0 px-0">
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

                const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
                const hoverBg = 'hover:bg-blue-50/50';

                return (
                  <TableRow key={row.key} className={`${rowBg} ${hoverBg} group`}>
                    <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border-r border-slate-200 font-medium text-sm text-slate-700 p-2 min-w-[400px]`}>
                       <div className="flex items-center gap-2 justify-between">
                         <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }}>
                           <span className={row.type === 'stage' ? 'font-semibold' : ''}>{row.label}</span>
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
                       </div>
                    </TableCell>

                    {/* Data Cells */}
                    {columnStructure.map((item, colIndex) => (
                      <TableCell key={`${row.key}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle border-l border-slate-200 w-[200px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}>
                        {item.type === 'principal' ? (
                          <div className="flex items-center justify-center gap-1">
                            {renderCellContent(row, item.task)}
                            {/* FIX: The Zap button is now inside the cell, tied to the specific task (column) and requirement (row). */}
                            {row.type === 'requirement' && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-5 w-5 p-0 text-slate-400 hover:text-blue-600" 
                                onClick={() => handleAutomationClick(row.classId, row.requirementId, item.task.id)}
                              >
                                <Zap className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </>
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