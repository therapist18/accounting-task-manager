// @ts-nocheck
"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, X, Eye, Upload } from "lucide-react"
import { format, parseISO } from "date-fns"
import { StageTimer } from "@/components/stage-timer"

interface TaskTableProps {
  tasks: any[]
  columns: any[]
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
 showRequirements?: boolean
}

export function TaskTable({
 tasks,
 columns,
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
 showRequirements = false
}: TaskTableProps) {
 // Format task data for display
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

 // Apply sorting to tasks
 const sortedTasks = useMemo(() => {
   return getSortedTasks(tasks);
 }, [tasks, getSortedTasks]);

 // Group columns by parent header for display
 const groupedColumns = useMemo(() => {
   return columns.reduce((acc: Record<string, any[]>, col: any) => {
     const parent = col.parentHeader || 'ungrouped';
     if (!acc[parent]) acc[parent] = [];
     acc[parent].push(col);
     return acc;
   }, {} as Record<string, any[]>);
 }, [columns]);

 // Flatten all columns for easier access
 const allColumns = useMemo(() => {
   return Object.values(groupedColumns).flat();
 }, [groupedColumns]);

 // Define background colors for parent headers
 const getParentHeaderBgColor = (groupName: string) => {
   if (groupName === 'ungrouped') return 'bg-blue-600';
   if (groupName === 'Stages') return 'bg-blue-600';
   if (groupName === 'Additional Info') return 'bg-blue-600';
   return 'bg-blue-500';
 };

 // Define text color for parent headers
 const getParentHeaderTextColor = (groupName: string) => {
   if (groupName === 'ungrouped') return 'text-foreground';
   return 'text-white';
 };

 // Render stage column content
 const renderStageColumn = useCallback((task: any, stage: any) => {
   const isCurrentStage = task.current_stage?.name === stage.name;
   const isCompleted = task.current_stage &&
     (task.current_stage.order_num || 0) > (stage.order_num || 0);

   const taskDocuments = applicantDocuments[task.id] || [];

   // Handle document upload for document-based stages
   if (stage.documents && stage.documents.length > 0) {
     return (
       <div className="flex flex-col gap-1">
         <Button
           variant="ghost"
           size="sm"
           className="h-8 w-full p-0"
           onClick={(e) => {
             e.stopPropagation();
             onStageDocumentUpload?.(task, stage);
           }}
         >
           <Upload className="h-4 w-4 mr-1" />
           Upload
         </Button>

         {/* Show document indicators with enhanced status */}
         <div className="flex items-center justify-center gap-1 flex-wrap">
           {stage.documents.map((stageDoc: any, docIndex: number) => {
             const hasDocument = taskDocuments.some(doc =>
               doc.document_id === stageDoc.kycId ||
               doc.kyc_document_id === stageDoc.id
             );

             const matchingDoc = taskDocuments.find(doc =>
               doc.document_id === stageDoc.kycId ||
               doc.kyc_document_id === stageDoc.id
             );

             return (
               <div key={docIndex} className="relative">
                 <Button
                   variant="ghost"
                   size="sm"
                   className={`h-6 w-6 p-0 ${hasDocument ? 'text-green-600 bg-green-50' : 'text-gray-300'}`}
                   onClick={(e) => {
                     e.stopPropagation();
                     if (hasDocument && matchingDoc) {
                       onViewStageDocument?.(task, stage, stageDoc, matchingDoc);
                     }
                   }}
                   title={`${stageDoc.name} - ${hasDocument ? 'Uploaded' : 'Not uploaded'}${matchingDoc ? ` (${matchingDoc.status})` : ''}`}
                 >
                   <Eye className="h-4 w-4" />
                 </Button>
                 {hasDocument && matchingDoc && (
                   <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                     matchingDoc.status === 'valid' ? 'bg-green-500' :
                     matchingDoc.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-500'
                   }`} />
                 )}
               </div>
             );
           })}
         </div>

         {isCurrentStage && task.current_stage_started_at && (
           <StageTimer
             startTime={task.current_stage_started_at}
             estimatedTime={stage.estimated_time}
           />
         )}
       </div>
     );
   }

   // Regular stage status display
   let status = 'Pending';
   let variant: 'default' | 'secondary' | 'outline' = 'outline';

   if (isCurrentStage) {
     status = 'In Progress';
     variant = 'default';
     return (
       <div className="flex flex-col gap-1">
         <Badge variant={variant} className="w-fit">{status}</Badge>
         {task.current_stage_started_at && (
           <StageTimer
             startTime={task.current_stage_started_at}
             estimatedTime={stage.estimated_time}
           />
         )}
       </div>
     );
   } else if (isCompleted) {
     status = 'Completed';
     variant = 'secondary';
   }

   return <Badge variant={variant} className="w-fit">{status}</Badge>;
 }, [applicantDocuments, onStageDocumentUpload, onViewStageDocument]);

 // Render cell content based on column configuration
 const renderCellContent = useCallback((col: any, task: any, index: number) => {
   const formattedTask = formatTaskData(task, index);

   if (col.render) {
     return col.render(formattedTask[col.key], task, index);
   }

   // Handle special cases
   if (col.key === 'documents') {
     return (
       <Button
         variant="ghost"
         size="icon"
         className="h-8 w-8 p-0 text-destructive hover:text-destructive"
         onClick={() => onShowUploadDialog?.(task)}
       >
         <X className="h-4 w-4" />
       </Button>
     );
   }

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

   // Handle stage columns
   if (col.key.startsWith('stage_')) {
     const stageName = col.header;
     const stage = departments
       .flatMap(d => d.stages || [])
       .find(s => s.name === stageName);
     
     if (stage) {
       return renderStageColumn(task, stage);
     }
   }

   return formattedTask[col.key] || '-';
 }, [formatTaskData, onTaskAction, onShowUploadDialog, departments, renderStageColumn]);

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
                   colSpan={groupCols.length}
                   className={`text-center border-b-2 border-gray-200 font-medium text-sm ${getParentHeaderBgColor(groupName)} ${getParentHeaderTextColor(groupName)}`}
                 >
                   {groupName !== 'ungrouped' ? groupName : ''}
                 </TableHead>
               ))}
             </TableRow>
           )}

           {/* Second row - column headers */}
           <TableRow className="h-12">
             {allColumns.map((col: any) => {
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
                 colSpan={allColumns.length}
                 className="h-24 text-center bg-gray-50"
               >
                 <div className="flex items-center justify-center space-x-2">
                   <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                   <span>Loading tasks...</span>
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
                 colSpan={allColumns.length}
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
 );
}