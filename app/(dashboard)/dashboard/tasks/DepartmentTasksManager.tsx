// @ts-nocheck
"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, Upload, Download, Plus, Globe, CheckCheckIcon, Building, Workflow, Layers, Target } from "lucide-react"
import { format, parseISO } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditableStageCell } from "./components/EditableStageCell"
import { EditTaskDialog } from "./components/EditTaskDialog"
import ColumnVisibilityControl, { ColumnVisibilityOption } from "../departments/main-shared-components/column-visibility"
import { fetchDepartments } from "../departments/departments/database"

interface Stage {
  id: string;
  name: string;
  order_num: number;
  documents: Array<{
    id: string;
    name: string;
    kycId: string;
    inputType: string;
    isRequired: boolean;
    documentType: string;
    extractionSpecs?: Array<{
      id: string;
      fieldName: string;
      fieldType: string;
      isRequired: boolean;
      description?: string;
    }>;
  }>;
  follow_up: string;
  isSpecial: boolean;
  allocations: Record<string, any>;
  timeConfigs: Array<{
    days: number;
    hours: number;
    minutes: number;
    applicationType: string;
  }>;
  estimated_time: number;
  description?: string;
}

interface Task {
  id: number;
  job_description: string;
  status: string;
  department_id: number;
  subdepartment_id: number;
  current_stage_id: number | null;
  current_stage_started_at: string | null;
  task_manager_id: number | null;
  task_assistant_id: number | null;
  date_initiated: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  account_used: string | null;
  batch: string | null;
  applied_by: string | null;
  applicant_type: string;
  class_id: string;
  subclass_id: string | null;
  applicant_name: string;
  officer_id: number | null;
  r_number: string | null;
  principal_member_name: string | null;
  renewal_status: string | null;
  individual_id: number;
  stages: Record<string, {
    date: string;
    status: string;
    completedAt: string;
  }>;
  selections: any;
  company_id: number;
  principal_member: number;
  dependant_member: Array<{
    id: number;
    name: string;
    relationship: string;
  }>;
  understudy: number | null;
  references: any[];
  department: {
    id: number;
    name: string;
  };
  subdepartment: {
    id: number;
    name: string;
  };
  current_stage: Stage | null;
}

interface Department {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  stages: Stage[];
  order: number;
  default_display: boolean;
  tm_subdepartments: Array<{
    id: number;
    name: string;
    order: number;
    stages: Array<{
      display: boolean;
      stage_id: string;
      applicable: boolean;
    }>;
    classes: Array<{
      id: string;
      name: string;
      order: number;
      stages: Array<{
        display: boolean;
        stage_id: string;
        applicable: boolean;
      }>;
      isVisible: boolean;
      subClasses: any[];
      description: string;
      default_display: boolean;
      subdepartmentId: number;
    }>;
  }>;
}

interface DepartmentTasksManagerProps {
  error: string | null
  onTaskAction?: (action: string, task: Task) => void
  onStageDocumentUpload?: (task: Task, stage: Stage) => void
  onViewStageDocument?: (task: Task, stage: Stage, stageDoc: any, document: any) => void
  onShowUploadDialog?: (task: Task) => void
  applicantDocuments?: Record<number, any[]>
  getTaskStageStatus?: (taskId: string, stageId: string) => any
  handleStageStatusSave?: (stageId: string, taskId: string, date: string) => Promise<any>
  onTaskUpdate?: (updatedTask: Task) => void
  getCurrentRequirements?: () => any[]
}

export function DepartmentTasksManager({
  error,
  onTaskAction,
  onStageDocumentUpload,
  onViewStageDocument,
  onShowUploadDialog,
  applicantDocuments = {},
  getTaskStageStatus,
  handleStageStatusSave,
  onTaskUpdate,
  getCurrentRequirements
}: DepartmentTasksManagerProps) {
  const [departments, setDepartments] = useState<any[]>([])
  const [departmentsLoading, setDepartmentsLoading] = useState(true)
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<string>("")
  const [activeSubTab, setActiveSubTab] = useState<string>("enquiries")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  // Fetch tasks with related data
  const fetchTasks = async () => {
    try {
      setTasksLoading(true)
      const { data, error } = await supabase
        .from('tm_tasks')
        .select(`
          *,
          department:department_id (id, name),
          subdepartment:subdepartment_id (id, name),
          current_stage:current_stage_id (id, name, order_num)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
      toast({
        title: "Error",
        description: "Failed to load tasks. Please try again.",
        variant: "destructive"
      })
    } finally {
      setTasksLoading(false)
    }
  }

  // Fetch stages for a department
  const fetchStages = async (departmentId: string) => {
    try {
      const department = departments.find(d => d.id === departmentId)
      if (!department) return

      // Get all stages from the department and subdepartments
      const allStages = department.stages.map(stage => ({
        ...stage,
        departmentId: department.id,
        departmentName: department.name
      }))

      // Add stages from subdepartments that are applicable
      department.tm_subdepartments.forEach(subdept => {
        subdept.stages.forEach(stageMapping => {
          if (stageMapping.applicable) {
            const stage = department.stages.find(s => s.id === stageMapping.stage_id)
            if (stage) {
              allStages.push({
                ...stage,
                departmentId: department.id,
                departmentName: department.name,
                subdepartmentId: subdept.id,
                subdepartmentName: subdept.name
              })
            }
          }
        })
      })

      // Sort stages by order_num
      allStages.sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
      
      setStages(allStages)
    } catch (error) {
      console.error('Error fetching stages:', error)
      toast({
        title: "Error",
        description: "Failed to load stages. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Fetch departments data
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        setDepartmentsLoading(true)
        const departmentsData = await fetchDepartments()
        setDepartments(departmentsData)
        
        // Set initial department tab
        if (departmentsData.length > 0) {
          setActiveDepartmentTab(departmentsData[0].id)
        }
      } catch (error) {
        console.error('Error fetching departments:', error)
        toast({
          title: "Error",
          description: "Failed to load departments. Please try again.",
          variant: "destructive"
        })
      } finally {
        setDepartmentsLoading(false)
      }
    }

    loadDepartments()
  }, [])

  // Fetch tasks and stages when department changes
  useEffect(() => {
    if (activeDepartmentTab) {
      fetchTasks()
      fetchStages(activeDepartmentTab)
    }
  }, [activeDepartmentTab])

  // Helper function to get task hierarchy info
  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null

    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return null

    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id === task.class_id)
    const subCls = cls?.subClasses?.find(sc => sc.id === task.subclass_id)

    return {
      department: dept,
      subdepartment: subdept,
      class: cls,
      subclass: subCls
    }
  }, [departments])

  // Filter tasks by department and status
  const getFilteredTasks = useCallback((status?: string) => {
    if (!departments || !Array.isArray(departments) || !activeDepartmentTab || !tasks || !Array.isArray(tasks)) {
      return [];
    }
    
    const currentDept = departments.find(d => d.id === activeDepartmentTab);
    if (!currentDept) return [];

    let filtered = tasks.filter(task => {
      if (!task) return false;
      // Filter by department
      if (task.department?.id !== currentDept.id) return false;
      // Filter by status if provided
      if (status && task.status !== status) return false;
      return true;
    });

    return filtered;
  }, [tasks, departments, activeDepartmentTab]);

  // Get tasks for each tab
  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status)
  }

  const enquiryTasks = useMemo(() => getTasksByStatus('enquiry'), [tasks]);
  const wipTasks = useMemo(() => getTasksByStatus('in_progress'), [tasks]);
  const completedTasks = useMemo(() => getTasksByStatus('completed'), [tasks]);

  // Generate table rows for transposed view
  const generateTableRows = useCallback((tasks: Task[], tableType: string) => {
    if (!tasks.length) return [];

    const currentDept = departments.find(d => d.id === activeDepartmentTab);
    if (!currentDept) return [];

    // Get all stages for the current department, sorted by order
    const allStages = stages
      .filter(stage => stage)
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    // Define the row structure
    const rows = [
      {
        key: 'task_id',
        label: 'Task ID',
        type: 'basic',
        getValue: (task: any) => `#${task.id}`
      },
      {
        key: 'job_description',
        label: 'Job Description',
        type: 'basic',
        getValue: (task: any) => task.job_description || 'No description'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        getValue: (task: any) => task.status || 'pending'
      },
      {
        key: 'applicant_name',
        label: 'Applicant Name',
        type: 'basic',
        getValue: (task: any) => task.applicant_name || 'Missing'
      },
      {
        key: 'company_name',
        label: 'Company Name',
        type: 'basic',
        getValue: (task: any) => task.company_name || 'Missing'
      },
      {
        key: 'department',
        label: 'Department',
        type: 'hierarchy',
        getValue: (task: any) => {
          const hierarchy = getTaskHierarchy(task);
          return hierarchy?.department?.name || 'Not assigned';
        }
      },
      {
        key: 'subdepartment',
        label: 'Subdepartment',
        type: 'hierarchy',
        getValue: (task: any) => {
          const hierarchy = getTaskHierarchy(task);
          return hierarchy?.subdepartment?.name || 'Not assigned';
        }
      },
      {
        key: 'class',
        label: 'Class',
        type: 'hierarchy',
        getValue: (task: any) => {
          const hierarchy = getTaskHierarchy(task);
          return hierarchy?.class?.name || 'Not assigned';
        }
      },
      {
        key: 'subclass',
        label: 'Subclass',
        type: 'hierarchy',
        getValue: (task: any) => {
          const hierarchy = getTaskHierarchy(task);
          return hierarchy?.subclass?.name || 'Not assigned';
        }
      },
      {
        key: 'task_manager',
        label: 'Task Manager',
        type: 'basic',
        getValue: (task: any) => task.task_manager?.name || task.task_manager?.email || 'Unassigned'
      },
      {
        key: 'renewal_status',
        label: 'New/Renewal',
        type: 'badge',
        getValue: (task: any) => task.renewal_status || 'New'
      },
      {
        key: 'created_at',
        label: 'Created Date',
        type: 'date',
        getValue: (task: any) => {
          try {
            return task.created_at ? format(parseISO(task.created_at), 'dd/MM/yyyy') : 'N/A';
          } catch (e) {
            return 'N/A';
          }
        }
      },
      {
        key: 'separator_stages',
        label: '--- STAGES ---',
        type: 'separator',
        getValue: () => ''
      },
      // Add stage rows
      ...allStages.map(stage => ({
        key: `stage_${stage.id}`,
        label: `${stage.order_num || 0}. ${stage.name}`,
        type: 'stage',
        stage: stage,
        getValue: (task: Task) => {
          const stageData = task.stages?.[stage.id];
          if (!stageData) return '';
          
          return (
            <div className="flex flex-col gap-1">
              <span className="text-sm">
                {stageData.status === 'completed' ? (
                  <Badge variant="default">Completed</Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </span>
              <span className="text-xs text-gray-600">{stageData.date}</span>
              {stageData.completedAt && (
                <span className="text-xs text-gray-600">Completed: {stageData.completedAt}</span>
              )}
            </div>
          );
        }
      })),
      {
        key: 'separator_actions',
        label: '--- ACTIONS ---',
        type: 'separator',
        getValue: () => ''
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'actions',
        getValue: () => ''
      }
    ];

    return rows;
  }, [departments, activeDepartmentTab, getTaskHierarchy, getTaskStageStatus]);

  // Handle task edit
  const handleTaskEdit = (task: any) => {
    setEditingTask(task);
    setEditDialogOpen(true);
  };

  // Handle task update
  const handleTaskUpdate = (updatedTask: any) => {
    onTaskUpdate?.(updatedTask);
    setEditDialogOpen(false);
    setEditingTask(null);
  };

  // Render cell content based on type
  const renderCellContent = useCallback((row: any, task: any, taskIndex: number) => {
    const value = row.getValue(task);

    switch (row.type) {
      case 'basic':
        return <span className="text-sm">{value}</span>;
      
      case 'badge':
        return (
          <Badge 
            variant={value === 'completed' ? 'default' : 
                   value === 'in_progress' ? 'secondary' : 
                   value === 'enquiry' ? 'outline' : 'destructive'}
            className="text-xs"
          >
            {value}
          </Badge>
        );
      
      case 'hierarchy':
        return (
          <div className="flex items-center gap-1 text-xs">
            {row.key === 'department' && <Building className="h-3 w-3 text-blue-600" />}
            {row.key === 'subdepartment' && <Workflow className="h-3 w-3 text-green-600" />}
            {row.key === 'class' && <Layers className="h-3 w-3 text-orange-600" />}
            {row.key === 'subclass' && <Target className="h-3 w-3 text-purple-600" />}
            <span className="font-medium">{value}</span>
          </div>
        );
      
      case 'date':
        return <span className="text-xs text-gray-600">{value}</span>;
      
      case 'stage':
        return (
          <EditableStageCell
            stage={row.stage}
            task={task}
            value={value}
            onSave={handleStageStatusSave}
            onDocumentUpload={onStageDocumentUpload}
            onShowDocuments={onShowUploadDialog}
          />
        );
      
      case 'actions':
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTaskEdit(task)}
              className="h-6 w-6 p-0"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTaskAction?.('delete', task)}
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        );
      
      case 'separator':
        return null;
      
      default:
        return <span className="text-sm">{value}</span>;
    }
  }, [handleStageStatusSave, onStageDocumentUpload, onShowUploadDialog, onTaskAction, handleTaskEdit]);

  // Render transposed table
  const renderTransposedTable = useCallback((tasks: any[], tableType: string) => {
    const rows = generateTableRows(tasks, tableType);
    
    if (!tasks.length) {
      return (
        <div className="text-center p-8 text-muted-foreground bg-gray-50 rounded-md border">
          <div className="flex flex-col items-center space-y-2">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">No {tableType} found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or create new tasks
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-md border w-full flex flex-col bg-background shadow-sm" style={{ maxHeight: '80vh', maxWidth: '95vw' }}>
        <div className="overflow-auto flex-1 relative">
          <Table className="min-w-full w-full border-collapse">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="h-12 bg-blue-600">
                <TableHead className="whitespace-nowrap p-3 border-b border-r font-medium text-sm text-white bg-blue-600 sticky left-0 z-20 min-w-[200px]">
                  Field
                </TableHead>
                {tasks.map((task, index) => (
                  <TableHead
                    key={task.id}
                    className="whitespace-nowrap p-3 border-b border-r font-medium text-sm text-white bg-blue-600 min-w-[150px] text-center"
                  >
                    Task #{task.id}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y">
              {tasksLoading || departmentsLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={tasks.length + 1}
                    className="h-24 text-center bg-gray-50"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                      <span>Loading {tableType}...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell
                    colSpan={tasks.length + 1}
                    className="h-24 text-center text-destructive bg-red-50"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      <span>{error}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, rowIndex) => {
                  if (row.type === 'separator') {
                    return (
                      <TableRow key={row.key} className="bg-gray-100">
                        <TableCell 
                          colSpan={tasks.length + 1} 
                          className="p-2 text-center font-semibold text-gray-700 text-sm"
                        >
                          {row.label}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const isEven = rowIndex % 2 === 0;
                  
                  return (
                    <TableRow
                      key={row.key}
                      className={`hover:bg-gray-50 ${isEven ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <TableCell 
                        className="p-3 border-r border-b font-medium text-sm bg-gray-50 sticky left-0 z-10"
                      >
                        {row.label}
                      </TableCell>
                      {tasks.map((task, taskIndex) => (
                        <TableCell
                          key={`${row.key}-${task.id}`}
                          className="p-3 border-r border-b text-center"
                        >
                          {renderCellContent(row, task, taskIndex)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }, [generateTableRows, tasksLoading, departmentsLoading, error, renderCellContent]);

  const currentDept = departments.find(d => d.id === activeDepartmentTab);

  // Loading state
  if (departmentsLoading) {
    return (
      <div className="flex-1 space-y-4 p-4">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading departments...</p>
          </div>
        </div>
      </div>
    );
  }

  // No departments state
  if (!departments || !Array.isArray(departments) || departments.length === 0) {
    return (
      <div className="flex-1 space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>No Departments Found</CardTitle>
            <CardDescription>
              No departments are available. Please add departments first using the Departments page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/dashboard/departments'}>
              Go to Departments
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Department Task Management (Transposed View)</h2>
          <p className="text-muted-foreground">
            View tasks in a transposed layout with fields as rows and tasks as columns
          </p>
        </div>
      </div>

      {/* Department Tabs */}
      <Tabs value={activeDepartmentTab} onValueChange={setActiveDepartmentTab} className="space-y-4">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id} className="text-sm">
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4">
            {/* Sub Tabs for each department */}
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="enquiries" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Enquiries
                  <Badge variant="secondary">{enquiryTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="wip-stages" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  WIP Stages Progress
                  <Badge variant="secondary">{wipTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="flex items-center gap-2">
                  <CheckCheckIcon className="h-4 w-4" />
                  Completed Tasks
                  <Badge variant="secondary">{completedTasks.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {/* Enquiries Tab */}
              <TabsContent value="enquiries" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Enquiries - {dept.name}</CardTitle>
                        <CardDescription>
                          Transposed view of enquiry tasks with fields as rows
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          New Enquiry
                        </Button>
                        <Button variant="outline" size="sm" className="flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    {renderTransposedTable(enquiryTasks, 'enquiries')}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* WIP Stages Progress Tab */}
              <TabsContent value="wip-stages" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>WIP Stages Progress - {dept.name}</CardTitle>
                        <CardDescription>
                          Transposed view showing all workflow stages (regardless of visibility settings)
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    {renderTransposedTable(wipTasks, 'work in progress tasks')}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Completed Tasks Tab */}
              <TabsContent value="completed" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Completed Tasks - {dept.name}</CardTitle>
                        <CardDescription>
                          Transposed view of completed tasks with performance metrics
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    {renderTransposedTable(completedTasks, 'completed tasks')}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>

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

export default DepartmentTasksManager;