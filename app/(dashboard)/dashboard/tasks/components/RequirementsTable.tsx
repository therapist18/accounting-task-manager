// @ts-nocheck
"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, Upload, Eye, CheckCircle, XCircle, Clock } from "lucide-react"
import { format, parseISO } from "date-fns"

interface RequirementsTableProps {
  tasks: any[]
  loading: boolean
  error: string | null
  onTaskAction?: (action: string, task: any) => void
  onShowUploadDialog?: (task: any) => void
  onViewDocument?: (task: any, requirement: any) => void
  requirements: any[]
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null
  onSort?: (key: string) => void
  applicantDocuments?: Record<number, any[]>
}

export function RequirementsTable({
  tasks,
  loading,
  error,
  onTaskAction,
  onShowUploadDialog,
  onViewDocument,
  requirements,
  sortConfig,
  onSort,
  applicantDocuments = {}
}: RequirementsTableProps) {
  
  const formatTaskData = useCallback((task: any, index: number) => {
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return '';
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd');
      } catch (e) {
        return dateString;
      }
    };

    return {
      ...task,
      index: index + 1,
      website: task.website || '',
      job_description: task.job_description || 'No description',
      task_manager: task.task_manager?.name || task.task_manager?.email || 'Unassigned',
      task_assistant: task.task_assistant?.name || task.task_assistant?.email || 'None',
      officer: task.officer?.name || task.officer?.email || 'None',
      applicant_name: task.applicant_name || 'Missing',
      company_name: task.company_name || 'Missing',
      principal_member_name: task.principal_member_name || 'Missing',
      renewal_status: task.renewal_status || 'New',
      account_used: task.account_used || 'Missing',
      applied_by: task.applied_by || 'System',
      batch: task.batch || 'Missing',
      created_at: formatDate(task.created_at),
      updated_at: formatDate(task.updated_at)
    };
  }, []);

  // Generate columns for requirements table
  const generateColumns = useCallback(() => {
    const baseColumns = [
      { key: 'index', header: '#', width: '50px', sortable: false },
      { key: 'website', header: 'Website', width: '120px', sortable: true },
      { key: 'job_description', header: 'Job', width: '150px', sortable: true },
      { key: 'task_manager', header: 'Task Manager', width: '120px', sortable: true },
      { key: 'applicant_name', header: 'Applicant Name', width: '150px', sortable: true },
      { key: 'company_name', header: 'Company Name', width: '150px', sortable: true },
      { key: 'renewal_status', header: 'New/Renewal', width: '120px', sortable: true }
    ];

    // Add requirement columns
    const requirementColumns = requirements.map((req, idx) => ({
      key: `requirement_${idx}`,
      header: req.name,
      width: '150px',
      sortable: false,
      requirement: req,
      parentHeader: 'Requirements'
    }));

    const endColumns = [
      { key: 'account_used', header: 'Account Used', width: '120px', sortable: true, parentHeader: 'Additional Info' },
      { key: 'applied_by', header: 'Applied by Who', width: '120px', sortable: true, parentHeader: 'Additional Info' },
      { key: 'batch', header: 'Batch', width: '100px', sortable: true, parentHeader: 'Additional Info' },
      {
        key: 'actions',
        header: 'Actions',
        width: '120px',
        sortable: false,
        parentHeader: 'Additional Info'
      }
    ];

    return [...baseColumns, ...requirementColumns, ...endColumns];
  }, [requirements]);

  const columns = generateColumns();

  // Group columns by parent header
  const groupedColumns = useMemo(() => {
    return columns.reduce((acc: Record<string, any[]>, col: any) => {
      const parent = col.parentHeader || 'ungrouped';
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(col);
      return acc;
    }, {} as Record<string, any[]>);
  }, [columns]);

  const allColumns = useMemo(() => {
    return Object.values(groupedColumns).flat();
  }, [groupedColumns]);

  // Render requirement status
  const renderRequirementStatus = useCallback((task: any, requirement: any) => {
    const taskDocuments = applicantDocuments[task.id] || [];
    
    // Check if requirement is fulfilled
    const hasDocument = taskDocuments.some(doc => 
      doc.requirement_id === requirement.id || 
      doc.document_type === requirement.name
    );

    const matchingDoc = taskDocuments.find(doc => 
      doc.requirement_id === requirement.id || 
      doc.document_type === requirement.name
    );

    if (hasDocument && matchingDoc) {
      const statusColor = 
        matchingDoc.status === 'approved' ? 'text-green-600' :
        matchingDoc.status === 'rejected' ? 'text-red-600' :
        'text-yellow-600';

      return (
        <div className="flex flex-col items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-full ${statusColor}`}
            onClick={() => onViewDocument?.(task, requirement)}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          <Badge 
            variant={
              matchingDoc.status === 'approved' ? 'default' :
              matchingDoc.status === 'rejected' ? 'destructive' :
              'secondary'
            }
            className="text-xs"
          >
            {matchingDoc.status === 'approved' ? 'Approved' :
             matchingDoc.status === 'rejected' ? 'Rejected' :
             'Pending Review'}
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-gray-500"
          onClick={() => onShowUploadDialog?.(task)}
        >
          <Upload className="h-4 w-4 mr-1" />
          Upload
        </Button>
        <Badge variant="outline" className="text-xs">
          Missing
        </Badge>
      </div>
    );
  }, [applicantDocuments, onViewDocument, onShowUploadDialog]);

  const renderCellContent = useCallback((col: any, task: any, index: number) => {
    const formattedTask = formatTaskData(task, index);

    if (col.render) {
      return col.render(formattedTask[col.key], task, index);
    }

    // Handle requirement columns
    if (col.key.startsWith('requirement_')) {
      return renderRequirementStatus(task, col.requirement);
    }

    // Handle actions
    if (col.key === 'actions') {
      return (
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
      );
    }

    return formattedTask[col.key] || '-';
  }, [formatTaskData, renderRequirementStatus, onTaskAction]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
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
  }, [tasks, sortConfig]);

  const getParentHeaderBgColor = (groupName: string) => {
    if (groupName === 'ungrouped') return 'bg-purple-600';
    if (groupName === 'Requirements') return 'bg-purple-600';
    if (groupName === 'Additional Info') return 'bg-purple-600';
    return 'bg-purple-500';
  };

  const getParentHeaderTextColor = (groupName: string) => {
    return 'text-white';
  };

  return (
    <div className="rounded-md border w-full flex flex-col bg-background shadow-sm" style={{ maxHeight: '80vh', maxWidth: '95vw' }}>
      <div className="overflow-auto flex-1 relative">
        <Table className="min-w-full w-full border-collapse">
          <TableHeader className="sticky top-0 z-10">
            {/* Parent headers */}
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

            {/* Column headers */}
            <TableRow className="h-12">
              {allColumns.map((col: any) => {
                const isRequirementColumn = col.parentHeader === 'Requirements';
                const bgColor = isRequirementColumn ? 'bg-purple-500' : 'bg-purple-600';
                return (
                  <TableHead
                    key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                    className={`whitespace-nowrap p-2 border-b border-r font-medium text-sm text-white ${bgColor} hover:opacity-90`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{col.header}</span>
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
                  colSpan={allColumns.length}
                  className="h-24 text-center bg-gray-50"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                    <span>Loading requirements...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
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
                    {allColumns.map((col: any) => {
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
                  colSpan={allColumns.length}
                  className="text-center p-8 text-muted-foreground bg-gray-50"
                >
                  <div className="flex flex-col items-center space-y-2">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                    <p className="font-medium">No tasks found</p>
                    <p className="text-sm text-muted-foreground">
                      No tasks with requirements to display
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