// @ts-nocheck
"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, Eye, Upload, Download } from "lucide-react"
import { format, parseISO } from "date-fns"
import { StageTimer } from "@/components/stage-timer"
import EditableStageCell from "./EditableStageCell"
import { EditTaskDialog } from "./EditTaskDialog"
import { toast } from "@/hooks/use-toast"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "../../departments/main-shared-components/column-visibility"

interface StagesTableProps {
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
  selectedDepartment?: string
  selectedSubdepartment?: string
  selectedClass?: string
  selectedSubclass?: string
  getTaskStageStatus?: (taskId: string, stageId: string) => any
  handleStageStatusSave?: (stageId: string, taskId: string, date: string) => Promise<any>
  onTaskUpdate?: (updatedTask: any) => void
}

export function StagesTable({
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
  selectedDepartment,
  selectedSubdepartment,
  selectedClass,
  selectedSubclass,
  getTaskStageStatus,
  handleStageStatusSave,
  onTaskUpdate
}: StagesTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({})
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)

  // Define base stage columns
  const baseStageColumns = [
    { key: 'index', header: '#', width: '50px', group: 'General', isDefault: true },
    { key: 'website', header: 'Website', width: '120px', group: 'General' },
    { key: 'job_description', header: 'Job', width: '150px', group: 'General', isDefault: true },
    { key: 'task_manager', header: 'Task Manager', width: '120px', group: 'Assignment' },
    { key: 'task_assistant', header: 'Task Assistant', width: '120px', group: 'Assignment' },
    { key: 'officer', header: 'Officer', width: '120px', group: 'Assignment' },
    { key: 'applicant_name', header: 'Applicant Name', width: '150px', group: 'General', isDefault: true },
    { key: 'principal_member_name', header: 'Principal Member Name', width: '180px', group: 'General', isDefault: true },
    { key: 'company_name', header: 'Company Name', width: '150px', group: 'General' },
    { key: 'documents', header: 'All Submitted Documents', width: '80px', group: 'General', isDefault: true },
    { key: 'renewal_status', header: 'New/Renewal', width: '120px', group: 'General', isDefault: true },
    { key: 'account_used', header: 'Account Used', width: '120px', group: 'Additional Info' },
    { key: 'applied_by', header: 'Applied by Who', width: '120px', group: 'Additional Info' },
    { key: 'batch', header: 'Batch', width: '100px', group: 'Additional Info' },
    { key: 'actions', header: 'Actions', width: '120px', group: 'Additional Info', isDefault: true }
  ];

  // Get stage visibility configuration
  const getStageVisibilityConfig = useCallback(() => {
    const currentDept = departments.find(d => d.id === selectedDepartment);
    if (!currentDept) return {};

    let stageConfig = {};
    let departmentStages = currentDept.stages || [];

    // Apply subdepartment filter if selected
    if (selectedSubdepartment) {
      const currentSubdept = currentDept.tm_subdepartments?.find(s => s.id === selectedSubdepartment);
      if (currentSubdept) {
        departmentStages.forEach(stage => {
          const subdeptStageConfig = currentSubdept.stages?.find(s => s.stage_id === stage.id);
          if (subdeptStageConfig) {
            stageConfig[stage.id] = {
              applicable: subdeptStageConfig.applicable !== false,
              display: subdeptStageConfig.display !== false
            };
          } else {
            stageConfig[stage.id] = { applicable: true, display: true };
          }
        });
      }
    }

    // Apply class filter if selected
    if (selectedClass) {
      const currentSubdept = currentDept.tm_subdepartments?.find(s => s.id === selectedSubdepartment);
      if (currentSubdept) {
        const currentClass = currentSubdept.classes?.find(c =>
          c.id === selectedClass || c.name === selectedClass
        );

        if (currentClass && currentClass.stages) {
          departmentStages.forEach(stage => {
            const classStageConfig = currentClass.stages?.find(s => s.stage_id === stage.id);
            if (classStageConfig) {
              stageConfig[stage.id] = {
                applicable: classStageConfig.applicable !== false,
                display: classStageConfig.display !== false
              };
            }
          });
        }
      }
    }

    return stageConfig;
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass]);

  const generateStageColumns = useCallback(() => {
    const baseColumns = baseStageColumns
      .slice(0, baseStageColumns.findIndex(col => col.key === 'renewal_status') + 1);

    const movedColumns = baseStageColumns
      .slice(baseStageColumns.findIndex(col => col.key === 'account_used'));

    const currentDept = departments.find(d => d.id === selectedDepartment);
    if (!currentDept) {
      return baseColumns;
    }

    let departmentStages = currentDept.stages || [];
    const stageVisibilityConfig = getStageVisibilityConfig();

    // Filter stages based on applicable property
    departmentStages = departmentStages.filter(stage => {
      const config = stageVisibilityConfig[stage.id];
      return config ? config.applicable : true;
    });

    // Generate stage columns
    const stageColumnsList = departmentStages.map(stage => {
      const config = stageVisibilityConfig[stage.id];
      const stageKey = `stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`;
      
      return {
        key: stageKey,
        header: stage.name,
        width: '150px',
        parentHeader: 'Stages',
        group: 'Stages',
        sortable: true,
        stage: stage,
        isDefault: config ? config.display : true,
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
      };
    });

    return [
      ...baseColumns,
      ...stageColumnsList,
      ...movedColumns.map(col => ({
        ...col,
        parentHeader: 'Additional Info'
      }))
    ];
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, getStageVisibilityConfig, getTaskStageStatus, handleStageStatusSave, onStageDocumentUpload, onShowUploadDialog]);

  // Initialize column visibility based on isDefault
  const initializeColumnVisibility = useCallback(() => {
    const columns = generateStageColumns();
    const initialVisibility = {};
    
    columns.forEach(col => {
      if (columnVisibility[col.key] === undefined) {
        initialVisibility[col.key] = col.isDefault !== false;
      }
    });

    if (Object.keys(initialVisibility).length > 0) {
      setColumnVisibility(prev => ({ ...prev, ...initialVisibility }));
    }
  }, [generateStageColumns, columnVisibility]);

  // Initialize on mount and when stage configuration changes
  useMemo(() => {
    initializeColumnVisibility();
  }, [initializeColumnVisibility]);

  const columns = useMemo(() => generateStageColumns(), [generateStageColumns]);

  // Generate column visibility options
  const columnVisibilityOptions: ColumnVisibilityOption[] = useMemo(() => {
    return columns.map(col => ({
      id: col.key,
      label: col.header,
      visible: columnVisibility[col.key] !== false,
      group: col.group || 'General',
      isDefault: col.isDefault,
      disabled: col.key === 'index' // Always keep index visible
    }));
  }, [columns, columnVisibility]);

  // Filter visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter(col => columnVisibility[col.key] !== false);
  }, [columns, columnVisibility]);

  // Column visibility handlers
  const handleColumnVisibilityChange = (columnId: string, visible: boolean) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: visible
    }));
  };

  const handleShowAllColumns = () => {
    const newVisibility = {};
    columns.forEach(col => {
      newVisibility[col.key] = true;
    });
    setColumnVisibility(newVisibility);
  };

  const handleHideAllColumns = () => {
    const newVisibility = {};
    columns.forEach(col => {
      newVisibility[col.key] = col.key === 'index'; // Keep index visible
    });
    setColumnVisibility(newVisibility);
  };

  const handleResetToDefault = () => {
    const defaultVisibility = {};
    columns.forEach(col => {
      defaultVisibility[col.key] = col.isDefault !== false;
    });
    setColumnVisibility(defaultVisibility);
  };

  // Export functionality
  const handleExport = () => {
    try {
      const exportData = tasks.map((task, index) => {
        const row = {};
        visibleColumns.forEach(col => {
          if (col.key === 'index') {
            row[col.header] = index + 1;
          } else if (col.key.startsWith('stage_')) {
            const stageDate = task.stages?.[col.stage?.id];
            row[col.header] = stageDate?.date || 'Pending';
          } else {
            row[col.header] = task[col.key] || '-';
          }
        });
        return row;
      });

      // Convert to CSV
      const headers = visibleColumns.map(col => col.header);
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => `"${(row[header] || '').toString().replace(/"/g, '""')}"`).join(',')
        )
      ].join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stages-table-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Exported ${tasks.length} tasks to CSV`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the data",
        variant: "destructive"
      });
    }
  };

  // Task actions
  const handleTaskEdit = (task: any) => {
    setEditingTask(task);
    setEditDialogOpen(true);
  };

  const handleTaskUpdate = (updatedTask: any) => {
    onTaskUpdate?.(updatedTask);
    setEditDialogOpen(false);
    setEditingTask(null);
  };

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
      website: task.website || '',
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

  const sortedTasks = useMemo(() => {
    return getSortedTasks(tasks);
  }, [tasks, getSortedTasks]);

  // Group columns by parent header for display
  const groupedColumns = useMemo(() => {
    const grouped = {};
    visibleColumns.forEach(col => {
      const parent = col.parentHeader || 'ungrouped';
      if (!grouped[parent]) grouped[parent] = [];
      grouped[parent].push(col);
    });
    return grouped;
  }, [visibleColumns]);

  const renderCellContent = useCallback((col: any, task: any, index: number) => {
    const formattedTask = formatTaskData(task, index);

    if (col.render) {
      return col.render(formattedTask[col.key], task, index, col.stage);
    }

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

    if (col.key === 'actions') {
      return (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleTaskEdit(task)}
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
      );
    }

    return formattedTask[col.key] || '-';
  }, [formatTaskData, onShowUploadDialog, onTaskAction, handleTaskEdit]);

  const getParentHeaderBgColor = (groupName: string) => {
    if (groupName === 'ungrouped') return 'bg-blue-600';
    if (groupName === 'Stages') return 'bg-blue-600';
    if (groupName === 'Additional Info') return 'bg-blue-600';
    return 'bg-blue-500';
  };

  const getParentHeaderTextColor = (groupName: string) => {
    return 'text-white';
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ColumnVisibilityControl
            columns={columnVisibilityOptions}
            onVisibilityChange={handleColumnVisibilityChange}
            onShowAll={handleShowAllColumns}
            onHideAll={handleHideAllColumns}
            onResetToDefault={handleResetToDefault}
            title="Stage Columns"
            description="Show/hide table columns and stages"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {sortedTasks.length} tasks, {visibleColumns.length} columns visible
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border w-full flex flex-col bg-background shadow-sm" style={{ maxHeight: '80vh', maxWidth: '95vw' }}>
        <div className="overflow-auto flex-1 relative">
          <Table className="min-w-full w-full border-collapse">
            <TableHeader className="sticky top-0 z-10">
              {/* Parent headers row */}
              {Object.keys(groupedColumns).length > 1 && (
                <TableRow className="h-10">
                  {Object.entries(groupedColumns).map(([groupName, groupCols]) => (
                    <TableHead
                      key={groupName}
                      colSpan={groupCols.length}
                      className={`text-center border-b-2 border-gray-200 font-medium text-sm ${getParentHeaderBgColor(groupName)} ${getParentHeaderTextColor(groupName)}`}
                    >
                      {groupName !== 'ungrouped' ? groupName : ''}
                    </TableHead>
                  ))}
                </TableRow>
              )}

              {/* Column headers row */}
              <TableRow className="h-12">
                {visibleColumns.map((col: any) => {
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
                    colSpan={visibleColumns.length}
                    className="h-24 text-center bg-gray-50"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                      <span>Loading stages...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
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
                      {visibleColumns.map((col: any) => {
                        const cellValue = renderCellContent(col, task, index);

                        return (
                          <TableCell
                            key={`${task.id}-${col.key}`}
                            className="p-2 border-r border-b"
                          >
                            <div className="truncate max-w-xs">
                              {cellValue}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className="text-center p-8 text-muted-foreground bg-gray-50"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <FileText className="h-8 w-8 text-muted-foreground/50" />
                      <p className="font-medium">No tasks found</p>
                      <p className="text-sm text-muted-foreground">
                        Try adjusting your filters or create a new task
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditTaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        task={editingTask}
        departments={departments}
        onTaskUpdate={handleTaskUpdate}
      />
    </div>
  );
}