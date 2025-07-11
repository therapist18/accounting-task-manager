// @ts-nocheck
"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, Eye, Upload, Users } from "lucide-react"
import { format, parseISO } from "date-fns"
import { StageTimer } from "@/components/stage-timer"
import { EditableStageCell } from "./EditableStageCell"

interface EnquiryTableProps {
  tasks: any[]
  loading: boolean
  error: string | null
  onTaskAction?: (action: string, task: any) => void
  onStageDocumentUpload?: (task: any, stage: any) => void
  onViewStageDocument?: (task: any, stage: any, stageDoc: any, document: any) => void
  onShowUploadDialog?: (task: any) => void
  applicantDocuments?: Record<number, any[]>
  departments?: any
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null
  onSort?: (key: string) => void
  columnVisibility?: Record<string, boolean>
  selectedDepartment?: string
  selectedSubdepartment?: string
  selectedClass?: string
  selectedSubclass?: string
  getTaskStageStatus?: (taskId: string, stageId: string) => any
  handleStageStatusSave?: (stageId: string, taskId: string, date: string) => Promise<any>
}

export function EnquiryTable({
  tasks,
  loading,
  error,
  onTaskAction,
  onStageDocumentUpload,
  onViewStageDocument,
  onShowUploadDialog,
  applicantDocuments = {},
  departments = [],
  sortConfig,
  onSort,
  columnVisibility = {},
  selectedDepartment,
  selectedSubdepartment,
  selectedClass,
  selectedSubclass,
  getTaskStageStatus,
  handleStageStatusSave
}: EnquiryTableProps) {

  // Define base enquiry columns
  const baseEnquiryColumns = [
    { key: 'index', header: '#', width: '50px' },
    { key: 'job_description', header: 'Job', width: '150px' },
    // { key: 'task_manager', header: 'Task Manager', width: '120px' },
    // { key: 'task_assistant', header: 'Task Assistant', width: '120px' },
    // { key: 'officer', header: 'Officer', width: '120px' },
    { key: 'applicant_name', header: 'Applicant Name', width: '150px' },
    { key: 'company_name', header: 'Company Name', width: '150px' },
    { key: 'principal_member_name', header: 'Principal Member Name', width: '180px' },
    { key: 'documents', header: 'All Submitted Documents', width: '80px' },
    { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
    // Additional Info columns will be added after stages
  ];

  // Generate enquiry-specific columns (only Enquiry and Confirmation stages)
  const generateEnquiryColumns = useCallback(() => {
    const baseColumns = baseEnquiryColumns.filter(col => columnVisibility[col.key] !== false);

    const currentDept = departments.find(d => d.id === selectedDepartment);
    if (!currentDept) return baseColumns;

    // Get only Enquiry and Confirmation stages for enquiry table
    const enquiryStages = currentDept.stages?.filter(stage =>
      stage.name === 'Enquiry' || stage.name === 'Confirmation'
    ) || [];

    // Add Additional Info columns
    const additionalInfoColumns = [
      { key: 'account_used', header: 'Account Used', width: '120px', parentHeader: 'Additional Info' },
      { key: 'applied_by', header: 'Applied by Who', width: '120px', parentHeader: 'Additional Info' },
      { key: 'batch', header: 'Batch', width: '100px', parentHeader: 'Additional Info' },
      { 
        key: 'actions', 
        header: 'Actions', 
        width: '120px', 
        parentHeader: 'Additional Info',
        render: (value: any, task: any) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTaskAction?.('edit', task)}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTaskAction?.('delete', task)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      }
    ].filter(col => columnVisibility[col.key] !== false);

    const stageColumns = enquiryStages.map(stage => ({
      key: `stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`,
      header: stage.name,
      width: '150px',
      parentHeader: 'Stages',
      sortable: true,
      stage: stage,
      render: (value: any, task: any, index: number, stage: any) => {
        const taskStageStatus = getTaskStageStatus?.(task.id, stage.id);

        return (
          <EditableStageCell
            stage={stage}
            task={task}
            value={taskStageStatus?.completedAt || taskStageStatus?.date}
            onSave={handleStageStatusSave}
            onDocumentUpload={onStageDocumentUpload}
            onShowDocuments={onShowUploadDialog}
          />
        );
      }
    }));

    return [...baseColumns, ...stageColumns, ...additionalInfoColumns];
  }, [departments, selectedDepartment, columnVisibility, getTaskStageStatus, handleStageStatusSave, onStageDocumentUpload, onShowUploadDialog, onTaskAction]);

  // Generate columns once and store them
  const columns = useMemo(() => generateEnquiryColumns(), [generateEnquiryColumns]);

  const formatTaskData = useCallback((task: any, index: number) => {
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return '';
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd');
      } catch (e) {
        return dateString;
      }
    };

    const taskManagerName = task.task_manager?.name || task.task_manager?.email || 'Unassigned';
    const taskAssistantName = task.task_assistant?.name || task.task_assistant?.email || 'None';
    const officerName = task.officer?.name || task.officer?.email || 'None';

    return {
      ...task,
      index: index + 1,
      job_description: task.job_description || 'No description',
      task_manager: taskManagerName,
      task_assistant: taskAssistantName,
      officer: officerName,
      class: task.class_id || 'Missing',
      subclass: task.subclass_id || 'Missing',
      documents: 'View Documents',
      applicant_name: task.applicant_name || 'Missing',
      company_name: task.company_name || 'Missing',
      principal_member_name: task.principal_member_name || 'Missing',
      renewal_status: task.renewal_status || 'New',
      application_type: task.application_type || 'Standard',
      r_number: task.r_number || 'N/A',
      status: task.status || 'pending',
      account_used: task.account_used || 'Missing',
      applied_by: task.applied_by || 'System',
      batch: task.batch || 'Missing',
      current_stage: task.current_stage?.name || 'Not Started',
      date_initiated: task.date_initiated ? formatDate(task.date_initiated) : 'Missing',
      created_at: formatDate(task.created_at),
      updated_at: formatDate(task.updated_at)
    };
  }, []);

  // Sort tasks based on sortConfig
  const getSortedTasks = useCallback((tasks: any[]) => {
    if (!sortConfig) return tasks;

    return [...tasks].sort((a, b) => {
      const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
      };

      let aValue = getNestedValue(a, sortConfig.key);
      let bValue = getNestedValue(b, sortConfig.key);

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  // Apply sorting to tasks
  const sortedTasks = useMemo(() => {
    return getSortedTasks(tasks);
  }, [tasks, getSortedTasks]);

  // Group columns by parent header for display
  const groupedColumns = useMemo(() => {
    const grouped = {};
    columns.forEach(col => {
      const parentHeader = col.parentHeader || 'ungrouped';
      if (!grouped[parentHeader]) {
        grouped[parentHeader] = [];
      }
      grouped[parentHeader].push(col);
    });
    return grouped;
  }, [columns]);

  // Define background colors for parent headers
  const getParentHeaderBgColor = (groupName: string) => {
    if (groupName === 'ungrouped') return 'bg-blue-600';
    if (groupName === 'Stages') return 'bg-blue-600';
    if (groupName === 'Additional Info') return 'bg-blue-600';
    return 'bg-blue-500';
  };

  // Define text color for parent headers
  const getParentHeaderTextColor = (groupName: string) => {
    if (groupName === 'ungrouped') return 'text-white';
    return 'text-white';
  };

  const renderCellContent = useCallback((col: any, task: any, index: number) => {
    const formattedTask = formatTaskData(task, index);

    if (col.render) {
      // Pass the stage object as the fourth parameter to the render function
      return col.render(formattedTask[col.key], task, index, col.stage);
    }

    // Special rendering for dependants column
    if (col.key === 'dependant_member') {
      const dependants = task.dependant_member;
      if (!dependants || !Array.isArray(dependants) || dependants.length === 0) {
        return <Badge variant="secondary">0</Badge>;
      }
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="p-2 h-auto cursor-pointer">
              <Badge variant="default">{dependants.length}</Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold text-sm leading-none">Included Dependants</h4>
              </div>
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-2">
                {dependants.map((dep: any, idx: number) => (
                  <div key={dep.id || idx} className="flex justify-between items-center text-xs p-1.5 rounded-md hover:bg-muted">
                    <span className="font-medium">{dep.name}</span>
                    <span className="text-muted-foreground capitalize">{dep.relationship}</span>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    // Handle special cases
    if (col.key === 'documents') {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
          onClick={() => onShowUploadDialog?.(task)}
        >
          <FileText className="h-4 w-4 mr-1" />
          View Documents
        </Button>
      );
    }

    // Actions are now handled in the column definition

    // Handle stage columns
    if (col.key.startsWith('stage_')) {
      // Use the stage from the column definition
      if (col.stage) {
        const taskStageStatus = getTaskStageStatus?.(task.id, col.stage.id);

        return (
          <EditableStageCell
            stage={col.stage}
            task={task}
            value={taskStageStatus?.completedAt || taskStageStatus?.date}
            onSave={handleStageStatusSave}
            onDocumentUpload={onStageDocumentUpload}
            onShowDocuments={onShowUploadDialog}
          />
        );
      }
    }

    return formattedTask[col.key] || '-';
  }, [formatTaskData, onShowUploadDialog, getTaskStageStatus, handleStageStatusSave, onStageDocumentUpload, onShowUploadDialog]);

  return (
    <div className="rounded-md border w-full flex flex-col bg-background shadow-sm" style={{ maxHeight: '80vh', maxWidth: '95vw' }}>
      <div className="overflow-auto flex-1 relative">
        <Table className="min-w-full w-full border-collapse">
          <TableHeader className="sticky top-0 z-10">
            {/* First row - parent headers */}
            {Object.keys(groupedColumns).length > 1 && (
              <TableRow className="h-10">
                {Object.entries(groupedColumns).map(([groupName, groupCols]) => (
                  <TableHead
                    key={groupName}
                    colSpan={groupCols.filter(c => columnVisibility[c.key] !== false).length}
                    className={`text-center border-b-2 border-gray-200 font-medium text-sm ${getParentHeaderBgColor(groupName)} ${getParentHeaderTextColor(groupName)}`}
                  >
                    {groupName !== 'ungrouped' ? groupName : ''}
                  </TableHead>
                ))}
              </TableRow>
            )}

            {/* Second row - column headers */}
            <TableRow className="h-12">
              {columns.map((col: any) => {
                if (columnVisibility[col.key] === false) return null;
                const isStageColumn = col.parentHeader === 'Stages';
                const bgColor = isStageColumn ? 'bg-blue-500' : 'bg-blue-600';
                return (
                  <TableHead
                    key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                    className={`whitespace-nowrap p-2 border-b border-r font-medium text-sm text-white ${bgColor} hover:opacity-90`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{typeof col.header === 'function' ? col.header() : col.header}</span>
                      {col.sortable && onSort && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSort(col.key);
                          }}
                          className="ml-1 hover:text-primary-foreground"
                        >
                          {sortConfig?.key === col.key ? (
                            sortConfig.direction === 'asc' ? '↑' : '↓'
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y">
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.filter(c => columnVisibility[c.key] !== false).length}
                  className="h-24 text-center bg-gray-50"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                    <span>Loading enquiries...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={columns.filter(c => columnVisibility[c.key] !== false).length}
                  className="h-24 text-center text-destructive bg-red-50"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span>{error}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : sortedTasks.length > 0 ? (
              sortedTasks.map((task, index) => {
                const isEven = index % 2 === 0;

                return (
                  <TableRow
                    key={task.id}
                    className={`hover:bg-gray-50 ${isEven ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    {columns.map((col: any) => {
                      if (columnVisibility[col.key] === false) return null;
                      const cellValue = renderCellContent(col, task, index);

                      return (
                        <TableCell
                          key={`${task.id}-${col.key}`}
                          className={`p-2 border-r border-b ${col.key.startsWith('separator') ? 'w-px p-0' : ''}`}
                        >
                          {col.key.startsWith('separator') ? (
                            <div className="w-px h-6 bg-gray-200"></div>
                          ) : (
                            <div className="truncate max-w-xs">
                              {cellValue}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.filter(c => columnVisibility[c.key] !== false).length}
                  className="text-center p-8 text-muted-foreground bg-gray-50"
                >
                  <div className="flex flex-col items-center space-y-2">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                    <p className="font-medium">No enquiries found</p>
                    <p className="text-sm text-muted-foreground">
                      Try adjusting your filters or create a new enquiry
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}