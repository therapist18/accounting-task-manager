// @ts-nocheck
"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TruncatedText } from "@/app/(dashboard)/dashboard/departments/documents+fields/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, FileText, Edit, Trash2, Download, Plus, Building } from "lucide-react"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format, parseISO } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditableStageCell } from "./components/EditableStageCell"
import { EditTaskDialog } from "./components/EditTaskDialog"
import { fetchDepartments } from "../departments/departments/database"

// Interface definitions
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

export default function DepartmentTasksManager({
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
  const [companies, setCompanies] = useState<Map<number, string>>(new Map())
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<string>("")
  const [activeSubTab, setActiveSubTab] = useState<string>("enquiries")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [isEnquiryDialogOpen, setIsEnquiryDialogOpen] = useState(false)

  // Helper functions to resolve class names
  const getClassName = useCallback((task: any, departments: any[]) => {
    if (!task?.class_id || !task?.subdepartment?.id || !departments?.length) return 'N/A'
    const dept = departments.find(d => d.id === task.department?.id)
    const subdept = dept?.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id.toString())
    return cls?.name || 'N/A'
  }, [])

  const getSubClassName = useCallback((task: any, departments: any[]) => {
    if (!task?.subclass_id || !task?.class_id || !task?.subdepartment?.id || !departments?.length) return 'N/A'
    const dept = departments.find(d => d.id === task.department?.id)
    const subdept = dept?.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id.toString())
    const subCls = cls?.subClasses?.find(sc => sc.id.toString() === task.subclass_id.toString())
    return subCls?.name || 'N/A'
  }, [])

  // Fetch companies from acc_portal_company_duplicate
  const fetchCompanies = async () => {
    try {
      setCompaniesLoading(true)
      const { data, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name')

      if (error) throw error

      if (data) {
        const companyMap = new Map(data.map(c => [c.id, c.company_name]))
        setCompanies(companyMap)
      }
    } catch (error) {
      console.error('Error fetching companies:', error)
      toast({
        title: "Error",
        description: "Failed to load company data.",
        variant: "destructive"
      })
    } finally {
      setCompaniesLoading(false)
    }
  }

  // Handle new enquiry creation
  const handleEnquiryCreated = useCallback((newEnquiry: any) => {
    setTasks(prevTasks => [newEnquiry, ...prevTasks])
    toast({
      title: "Success",
      description: "New enquiry created successfully",
      variant: "default"
    })
  }, [])

  // Fetch tasks with related data
  const fetchTasks = useCallback(async () => {
    try {
      setTasksLoading(true)
      const { data, error } = await supabase
        .from('tm_tasks')
        .select(`*, department:department_id (id, name), subdepartment:subdepartment_id (id, name), current_stage:current_stage_id (id, name, order_num)`)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
      toast({ title: "Error", description: "Failed to load tasks.", variant: "destructive" })
    } finally {
      setTasksLoading(false)
    }
  }, [])

  // Fetch and process stages for a department
  const fetchStages = async (departmentId: string) => {
    try {
      const department = departments.find(d => d.id.toString() === departmentId.toString())
      if (!department) return

      const uniqueStages = new Map()
      department.stages.forEach(stage => {
        if (!uniqueStages.has(stage.id)) {
          uniqueStages.set(stage.id, { ...stage, departmentId: department.id, departmentName: department.name })
        }
      })
      const allStages = Array.from(uniqueStages.values()).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
      setStages(allStages)
    } catch (error) {
      console.error('Error fetching stages:', error)
      toast({ title: "Error", description: "Failed to load stages.", variant: "destructive" })
    }
  }

  // Fetch initial data on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      setDepartmentsLoading(true)
      try {
        const [departmentsData] = await Promise.all([
          fetchDepartments(),
          fetchCompanies(),
        ])
        setDepartments(departmentsData)
        if (departmentsData.length > 0) {
          setActiveDepartmentTab(departmentsData[0].id.toString())
        }
      } catch (error) {
        console.error('Error loading initial data:', error)
        toast({ title: "Error", description: "Failed to load initial data.", variant: "destructive" })
      } finally {
        setDepartmentsLoading(false)
      }
    }
    loadInitialData()
  }, [])

  // Fetch tasks and stages when department changes
  useEffect(() => {
    if (activeDepartmentTab && departments.length > 0) {
      fetchTasks()
      fetchStages(activeDepartmentTab)
    }
  }, [activeDepartmentTab, departments])

  // Get task hierarchy info
  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return null
    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id?.toString())
    const subCls = cls?.subClasses?.find(sc => sc.id.toString() === task.subclass_id?.toString())
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls }
  }, [departments])

  // Filter tasks by department and status
  const getFilteredTasks = useCallback((status?: string) => {
    if (!departments.length || !activeDepartmentTab || !tasks.length) return []
    const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
    if (!currentDept) return []
    return tasks.filter(task =>
      task &&
      task.department?.id?.toString() === currentDept.id.toString() &&
      (!status || task.status === status)
    )
  }, [tasks, departments, activeDepartmentTab])

  // Memoized task lists
  const enquiryTasks = useMemo(() => getFilteredTasks('enquiry'), [getFilteredTasks])
  const wipTasks = useMemo(() => getFilteredTasks('in_progress'), [getFilteredTasks])
  const completedTasks = useMemo(() => getFilteredTasks('completed'), [getFilteredTasks])

  // Generate table rows for transposed view
  const generateTableRows = useCallback((tasks: Task[]) => {
    if (!tasks.length) return []

    const allStages = stages.filter(stage => stage).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    return [
      { key: 'task_id', label: 'Task ID', type: 'basic', getValue: (task: any) => `${task.id}` },
      { key: 'job_description', label: 'Job Description', type: 'basic', getValue: (task: any) => task.job_description || 'N/A' },
      { key: 'status', label: 'Status', type: 'badge', getValue: (task: any) => task.status || 'pending' },
      { key: 'applicant_name', label: 'Applicant Name', type: 'basic', getValue: (task: any) => task.applicant_name || 'N/A' },
      { key: 'company_name', label: 'Company Name', type: 'basic', getValue: (task: any) => companies.get(task.company_id) || 'N/A' },
      { key: 'department', label: 'Department', type: 'basic', getValue: (task: any) => getTaskHierarchy(task)?.department?.name || 'N/A' },
      { key: 'subdepartment', label: 'Subdepartment', type: 'basic', getValue: (task: any) => getTaskHierarchy(task)?.subdepartment?.name || 'N/A' },
      { key: 'class', label: 'Class', type: 'basic', getValue: (task: any) => getClassName(task, departments) },
      { key: 'subclass', label: 'Subclass', type: 'basic', getValue: (task: any) => getSubClassName(task, departments) },
      { key: 'task_manager', label: 'Task Manager', type: 'basic', getValue: (task: any) => task.task_manager?.name || task.task_manager?.email || 'Unassigned' },
      { key: 'renewal_status', label: 'New/Renewal', type: 'badge', getValue: (task: any) => task.renewal_status || 'New' },
      { key: 'created_at', label: 'Created Date', type: 'date', getValue: (task: any) => task.created_at ? format(parseISO(task.created_at), 'dd MMM, yyyy') : 'N/A' },
      { key: 'separator_stages', label: 'STAGES', type: 'separator' },
      ...allStages.map(stage => ({
        key: `stage_${activeDepartmentTab}_${stage.id}`,
        label: `${stage.name}`,
        type: 'stage',
        stage,
        getValue: (task: Task) => task.stages?.[stage.id]
      })),
      { key: 'separator_actions', label: 'ACTIONS', type: 'separator' },
      { key: 'actions', label: 'Actions', type: 'actions' }
    ]
  }, [departments, activeDepartmentTab, stages, companies, getTaskHierarchy, getClassName, getSubClassName])

  // Task actions handlers
  const handleTaskEdit = (task: any) => { setEditingTask(task); setEditDialogOpen(true) }
  const handleTaskUpdate = (updatedTask: any) => { onTaskUpdate?.(updatedTask); setEditDialogOpen(false); setEditingTask(null) }

  // Export to CSV
  const handleExport = useCallback((tasks: any[], tableType: string) => {
    if (!tasks.length) {
      toast({ title: "No Data", description: "No data available to export.", variant: "destructive" })
      return
    }

    const rows = generateTableRows(tasks)
    const csvContent = []
    const headerRow = ['Field', ...tasks.map(task => `Task #${task.id}`)]
    csvContent.push(headerRow.join(','))

    rows.forEach(row => {
      if (row.type === 'separator') return
      const rowData = [`"${row.label}"`, ...tasks.map(task => {
        const value = row.getValue(task)
        if (typeof value === 'object' && value !== null) {
          return `"${value.status || ''} | ${value.date || ''}"`
        }
        return `"${String(value || '').replace(/"/g, '""')}"`
      })]
      csvContent.push(rowData.join(','))
    })

    const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `${tableType}_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({ title: "Export Successful", description: `${tableType} data exported.` })
  }, [generateTableRows])

  // Render cell content
  const renderCellContent = useCallback((row: any, task: any) => {
    const value = row.getValue ? row.getValue(task) : ''
    switch (row.type) {
      case 'basic': return <span className="text-sm font-medium text-slate-800">{value}</span>
      case 'badge': return <Badge variant={value === 'completed' ? 'success' : value === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">{value}</Badge>
      case 'date': return <span className="text-sm text-slate-600">{value}</span>
      case 'stage': return <EditableStageCell stage={row.stage} task={task} value={value} onSave={handleStageStatusSave} onDocumentUpload={onStageDocumentUpload} onShowDocuments={onShowUploadDialog} />
      case 'actions': return (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onTaskAction?.('delete', task)} className="h-8 w-8 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></Button>
        </div>
      )
      default: return <span className="text-sm text-slate-800">{value}</span>
    }
  }, [handleStageStatusSave, onStageDocumentUpload, onShowUploadDialog, onTaskAction, handleTaskEdit])

  // Render transposed table
  const renderTransposedTable = useCallback((tasks: any[], tableType: string) => {
    const rows = generateTableRows(tasks)

    if (!tasks.length) {
      return (
        <div className="flex flex-col items-center justify-center p-16 bg-blue-50/30 rounded-lg border-2 border-dashed border-gray-200">
          <FileText className="h-12 w-12" />
          <p className="mt-4 font-semibold">No {tableType} found</p>
          <p className="text-sm">Tasks with this status will appear here.</p>
        </div>
      )
    }

    return (
      <div className="border border-gray-200 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 350px)' }}>
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 z-20 bg-blue-100/80 backdrop-blur-sm">
            <TableRow className="border-b-2 border-gray-200">
            <TableHead className="sticky left-0 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r border-gray-200">#</TableHead>
            <TableHead className="sticky left-10 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r border-gray-200">Field</TableHead>
              {tasks.map(task => (
                <TableHead key={`header-${task.id}`} className="font-semibold bg-blue-600 text-white min-w-[200px] text-center text-sm py-2 border-r border-gray-200">
                  <div className="space-y-1">
                    <div className="font-bold">Task #{task.id}</div>
                    <div className="text-xs font-normal text-white">{task.applicant_name}</div>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tasksLoading || departmentsLoading || companiesLoading) ? (
              <TableRow><TableCell colSpan={tasks.length + 1} className="h-32 text-center"><div className="flex justify-center items-center gap-2 text-blue-600"><div className="h-5 w-5 border-2 border-t-blue-600 border-gray-200 rounded-full animate-spin"></div>Loading {tableType}...</div></TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={tasks.length + 1} className="h-32 text-center text-red-600"><div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div></TableCell></TableRow>
            ) : (
              rows.map((row, index) => {
                if (row.type === 'separator') {
                  return (
                    <TableRow key={row.key} className="bg-blue-50 hover:bg-blue-50">
                      <TableCell colSpan={1} className="py-2.5 text-center font-bold text-blue-700 text-xs tracking-wider uppercase border-t border-b border-gray-200"></TableCell>
                      <TableCell colSpan={tasks.length + 1} className="py-2.5 text-center font-bold text-blue-700 text-xs tracking-wider uppercase border-t border-b border-gray-200">{row.label}</TableCell>
                    </TableRow>
                  )
                }
                return (
                  <TableRow key={row.key} className="hover:bg-blue-50/50 border-b border-gray-100">
                    <TableCell className="sticky left-0 z-10 bg-white hover:bg-blue-50/50 border-r border-gray-200 font-semibold text-sm text-slate-700 py-3">{row.stage?.order_num || index + 1}</TableCell>
                    <TableCell className="sticky left-10 z-10 bg-white hover:bg-blue-50/50 border-r border-gray-200 font-semibold text-sm text-slate-700 py-3">
  <TruncatedText text={row.label} maxLength={30} className="text-slate-700" />
</TableCell>
                    {tasks.map(task => (
                      <TableCell key={`${row.key}-${task.id}`} className="border-r border-gray-100 text-center text-sm py-2 px-3">{renderCellContent(row, task)}</TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    )
  }, [generateTableRows, tasksLoading, departmentsLoading, companiesLoading, error, renderCellContent])

  if (departmentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50/30">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
          <p className="font-semibold text-blue-800">Loading Workspace...</p>
          <p className="text-sm text-blue-600">Fetching departments and tasks.</p>
        </div>
      </div>
    )
  }

  if (!departments.length) {
    return (
      <div className="flex-1 p-8 bg-blue-50/30">
        <Card className="border-2 border-dashed border-gray-300 bg-white">
          <CardHeader className="text-center items-center">
            <Building className="h-12 w-12 text-blue-400 mb-2" />
            <CardTitle className="text-xl">No Departments Found</CardTitle>
            <CardDescription className="text-blue-700">Please add departments via the Admin panel to start managing tasks.</CardDescription>
          </CardHeader>
          <CardContent className="text-center"><Button onClick={() => window.location.href = '/dashboard/departments'}>Go to Departments</Button></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 bg-blue-50/30 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Task Manager</h2>
        </div>
      </div>

      <Tabs value={activeDepartmentTab} onValueChange={setActiveDepartmentTab} className="space-y-4">
        <TabsList className="grid w-full rounded-lg p-1 shadow-sm" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id.toString()} className="text-sm font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id.toString()} className="space-y-4">
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
              <TabsList className="rounded-lg p-1 shadow-sm">
                <TabsTrigger value="enquiries" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Enquiries
                  <Badge variant="secondary">{enquiryTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="wip-stages" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  WIP Stages
                  <Badge variant="secondary">{wipTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Completed
                  <Badge variant="secondary">{completedTasks.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {[
                { value: "enquiries", title: "Enquiries", tasks: enquiryTasks, description: "Transposed view of enquiry tasks with fields as rows." },
                { value: "wip-stages", title: "WIP Stages Progress", tasks: wipTasks, description: "Transposed view showing all workflow stages for in-progress tasks." },
                { value: "completed", title: "Completed Tasks", tasks: completedTasks, description: "Transposed view of all completed tasks." },
              ].map(tab => (
                <TabsContent key={tab.value} value={tab.value} className="mt-4">
                  <Card className="bg-white/80 backdrop-blur-sm shadow-md border-gray-100">
                    <CardHeader className="border-b border-gray-100 bg-white">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-lg text-slate-800">{tab.title} - {dept.name}</CardTitle>
                          <CardDescription className="text-slate-600">{tab.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {tab.value === 'enquiries' && (
                            <Button
                              className="flex items-center gap-2"
                              onClick={() => setIsEnquiryDialogOpen(true)}
                            >
                              <Plus className="h-4 w-4" />
                              New Enquiry
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(tab.tasks, tab.title.toLowerCase())}>
                            <Download className="h-4 w-4" />Export CSV
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 sm:p-4">
                      {renderTransposedTable(tab.tasks, tab.title.toLowerCase())}
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>

      <EditTaskDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} task={editingTask} departments={departments} onTaskUpdate={handleTaskUpdate} />

      {/* Enquiry Dialog */}
      <EnquiryDialog
        open={isEnquiryDialogOpen}
        onOpenChange={setIsEnquiryDialogOpen}
        onEnquiryCreated={handleEnquiryCreated}
      />
    </div>
  )
}