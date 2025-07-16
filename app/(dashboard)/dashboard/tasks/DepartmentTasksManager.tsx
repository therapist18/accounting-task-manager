// @ts-nocheck
"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TruncatedText } from "@/app/(dashboard)/dashboard/departments/documents+fields/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, FileText, Edit, Trash2, Download, Plus, Building, RotateCcw, TableProperties, Search, Hash } from "lucide-react"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format, parseISO } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditableStageCell } from "./components/EditableStageCell"
import { EditTaskDialog } from "./components/EditTaskDialog"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentTasksManagerProps, Task } from "./components/types"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { Input } from "@/components/ui/input"

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
  const [activeSubTab, setActiveSubTab] = useState<string>("wip-stages")
  const [activeFollowUpFilter, setActiveFollowUpFilter] = useState<string>("all") // New state for follow-up filter
  const [isTransposedView, setIsTransposedView] = useState<boolean>(true) // New state for view toggle
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [isEnquiryDialogOpen, setIsEnquiryDialogOpen] = useState(false)
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null)
  const [isStageUploadDialogOpen, setIsStageUploadDialogOpen] = useState(false)
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('')

  const handleStageDocumentUpload = useCallback((task: any, stage: any) => {
    // Ensure the task has all necessary entity hierarchy information
    const enrichedTask = {
      ...task,
      // Make sure we have the complete hierarchy
      department: task.department || departments.find(d => d.id === task.department_id),
      subdepartment: task.subdepartment || departments
        .find(d => d.id === task.department_id)
        ?.tm_subdepartments?.find(s => s.id === task.subdepartment_id),
      // Ensure class_id and subclass_id are properly set
      class_id: task.class_id,
      subclass_id: task.subclass_id,
    }
  
    console.log('Setting selected stage task:', {
      task: enrichedTask,
      stage,
      taskClassId: enrichedTask.class_id,
      taskSubdepartmentId: enrichedTask.subdepartment?.id,
      stageDocuments: stage.documents?.map(doc => ({
        id: doc.id,
        name: doc.name,
        isSpecial: doc.isSpecial,
        entityType: doc.entityType,
        class_id: doc.class_id,
        subdept_id: doc.subdept_id
      }))
    })
  
    setSelectedStageTask({ task: enrichedTask, stage })
    setIsStageUploadDialogOpen(true)
  }, [departments])

  // Add this function for fuzzy matching (implement based on your needs)
  const fuzzyMatch = useCallback((str1: string, str2: string, threshold = 0.7) => {
    // Simple fuzzy matching implementation
    if (!str1 || !str2) return false
    const similarity = str1.toLowerCase().includes(str2.toLowerCase()) ||
      str2.toLowerCase().includes(str1.toLowerCase())
    return similarity
  }, [])

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

  // Check if stage is applicable to a task based on its hierarchy
  const isStageApplicableToTask = useCallback((stage: any, task: any, departments: any[]) => {
    if (!task || !departments.length) return false

    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return false

    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    if (!subdept) return false

    // Check subdepartment level stage applicability
    const subdeptStage = subdept.stages?.find(s => s.stage_id === stage.id)
    if (subdeptStage && !subdeptStage.applicable) return false

    // Check class level stage applicability if task has a class
    if (task.class_id) {
      const cls = subdept.classes?.find(c => c.id.toString() === task.class_id.toString())
      if (cls) {
        const classStage = cls.stages?.find(s => s.stage_id === stage.id)
        if (classStage && !classStage.applicable) return false
      }
    }

    return true
  }, [])

  // Get stage follow-up for a specific task and stage
  const getStageFollowUpForTask = useCallback((stage: any, task: any) => {
    const taskStage = task.stages?.[stage.id]
    if (taskStage?.follow_up) return taskStage.follow_up
    return stage.follow_up || null
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

  const filterTasksBySearch = useCallback((tasks: any[], searchTerm: string) => {
    if (!searchTerm.trim()) return tasks

    const term = searchTerm.toLowerCase()
    return tasks.filter(task =>
      task.id?.toString().includes(term) ||
      task.applicant_name?.toLowerCase().includes(term) ||
      task.principal_member_name?.toLowerCase().includes(term) ||
      task.job_description?.toLowerCase().includes(term) ||
      task.r_number?.toLowerCase().includes(term) ||
      companies.get(task.company_id)?.toLowerCase().includes(term) ||
      getTaskHierarchy(task)?.department?.name?.toLowerCase().includes(term) ||
      getTaskHierarchy(task)?.subdepartment?.name?.toLowerCase().includes(term) ||
      getClassName(task, departments)?.toLowerCase().includes(term) ||
      getSubClassName(task, departments)?.toLowerCase().includes(term)
    )
  }, [companies, getTaskHierarchy, departments, getClassName, getSubClassName])

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

  // Filter WIP tasks by follow-up
  const getWIPTasksByFollowUp = useCallback((followUpFilter: string) => {
    const wipTasks = getFilteredTasks('in_progress')
    if (followUpFilter === 'all') return wipTasks

    return wipTasks.filter(task => {
      if (!task.current_stage) return false
      const currentStage = stages.find(s => s.id === task.current_stage.id)
      if (!currentStage) return false

      const stageFollowUp = getStageFollowUpForTask(currentStage, task)
      const normalizedFollowUp = stageFollowUp?.toLowerCase() || null

      switch (followUpFilter) {
        case 'bcl':
          return normalizedFollowUp === 'bcl'
        case 'officer':
          return normalizedFollowUp === 'officer'
        case 'client':
          return normalizedFollowUp === 'client'
        default:
          return true
      }
    })
  }, [getFilteredTasks, stages, getStageFollowUpForTask])

  // Memoized task lists
  const enquiryTasks = useMemo(() => getFilteredTasks('enquiry'), [getFilteredTasks])
  const wipTasks = useMemo(() => getWIPTasksByFollowUp(activeFollowUpFilter), [getWIPTasksByFollowUp, activeFollowUpFilter])
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
        getValue: (task: Task) => {
          if (!isStageApplicableToTask(stage, task, departments)) {
            return 'N/A'
          }
          return task.stages?.[stage.id]
        }
      })),
      { key: 'separator_actions', label: 'ACTIONS', type: 'separator' },
      { key: 'actions', label: 'Actions', type: 'actions' }
    ]
  }, [departments, activeDepartmentTab, stages, companies, getTaskHierarchy, getClassName, getSubClassName, isStageApplicableToTask])

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

  // Render cell content for transposed view
  const renderCellContent = useCallback((row: any, task: any) => {
    const value = row.getValue ? row.getValue(task) : ''

    if (value === 'N/A') {
      return <span className="text-sm text-gray-400 italic">N/A</span>
    }

    switch (row.type) {
      case 'basic': return <span className="text-sm font-medium text-slate-800">{value}</span>
      case 'badge': return <Badge variant={value === 'completed' ? 'success' : value === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">{value}</Badge>
      case 'date': return <span className="text-sm text-slate-600">{value}</span>
      case 'stage':
        if (value === 'N/A') {
          return <span className="text-sm text-gray-400 italic">N/A</span>
        }
        return (
          <EditableStageCell
            stage={row.stage}
            task={task}
            value={value}
            onSave={handleStageStatusSave}
            onDocumentUpload={handleStageDocumentUpload} // Make sure this is passed
            onShowDocuments={onShowUploadDialog}
          />
        )
      case 'actions': return (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onTaskAction?.('delete', task)} className="h-8 w-8 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></Button>
        </div>
      )
      default: return <span className="text-sm text-slate-800">{value}</span>
    }
  }, [handleStageStatusSave, onStageDocumentUpload, onShowUploadDialog, onTaskAction, handleTaskEdit])

  const renderNormalTable = useCallback((tasks: any[], tableType: string) => {
    if (!tasks.length) {
      return (
        <div className="flex flex-col items-center justify-center p-16 bg-blue-50/30 rounded-lg border-2 border-dashed border-gray-200">
          <FileText className="h-12 w-12" />
          <p className="mt-4 font-semibold">No {tableType} found</p>
          <p className="text-sm">Tasks with this status will appear here.</p>
        </div>
      )
    }

    const visibleStages = stages.filter(stage => stage).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    return (
      <div className="border border-gray-200 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 350px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-blue-100/80 backdrop-blur-sm">
            <TableRow className="border-b-2 border-gray-200">
              {/* Task ID - Sticky */}
              <TableHead className="sticky left-0 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r border-gray-200 min-w-[80px]">
                <div className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  ID
                </div>
              </TableHead>

              {/* Applicant Name - Sticky */}
              <TableHead className="sticky left-20 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r border-gray-200 min-w-[150px]">
                Applicant Name
              </TableHead>

              {/* Principal Member - New column */}
              <TableHead className="font-semibold bg-blue-600 text-white min-w-[150px] text-center text-sm py-2 border-r border-gray-200">
                Principal Member
              </TableHead>

              <TableHead className="font-semibold bg-blue-600 text-white min-w-[150px] text-center text-sm py-2 border-r border-gray-200">Company</TableHead>
              <TableHead className="font-semibold bg-blue-600 text-white min-w-[120px] text-center text-sm py-2 border-r border-gray-200">Status</TableHead>
              <TableHead className="font-semibold bg-blue-600 text-white min-w-[150px] text-center text-sm py-2 border-r border-gray-200">Department</TableHead>
              <TableHead className="font-semibold bg-blue-600 text-white min-w-[150px] text-center text-sm py-2 border-r border-gray-200">Subdepartment</TableHead>
              <TableHead className="font-semibold bg-blue-600 text-white min-w-[120px] text-center text-sm py-2 border-r border-gray-200">Class</TableHead>
              <TableHead className="font-semibold bg-blue-600 text-white min-w-[120px] text-center text-sm py-2 border-r border-gray-200">Subclass</TableHead>

              {/* Stages with indexing and document indicators */}
              {visibleStages.map((stage, index) => {
                const hasDocuments = stage?.documents && stage.documents.length > 0;
                return (
                  <TableHead key={stage.id} className="font-semibold bg-blue-600 text-white min-w-[150px] text-center text-sm py-2 border-r border-gray-200">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1">
                        <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">{index + 1}</span>
                        {hasDocuments && (
                          <Badge variant="outline" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {stage.documents.length}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs">{stage.name}</span>
                    </div>
                  </TableHead>
                );
              })}

              <TableHead className="font-semibold bg-blue-600 text-white min-w-[100px] text-center text-sm py-2 border-r border-gray-200">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tasksLoading || departmentsLoading || companiesLoading) ? (
              <TableRow>
                <TableCell colSpan={10 + visibleStages.length} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-blue-600">
                    <div className="h-5 w-5 border-2 border-t-blue-600 border-gray-200 rounded-full animate-spin"></div>
                    Loading {tableType}...
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={10 + visibleStages.length} className="h-32 text-center text-red-600">
                  <div className="flex justify-center items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {error}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task, index) => (
                <TableRow key={task.id} className="hover:bg-blue-50/50 border-b border-gray-100">
                  {/* Task ID - Sticky */}
                  <TableCell className="sticky left-0 z-10 bg-white hover:bg-blue-50/50 border-r border-gray-200 font-semibold text-sm text-slate-700 py-3">
                    #{task.id}
                  </TableCell>

                  {/* Applicant Name - Sticky */}
                  <TableCell className="sticky left-20 z-10 bg-white hover:bg-blue-50/50 border-r border-gray-200 font-medium text-sm text-slate-700 py-3">
                    {task.applicant_name || 'N/A'}
                  </TableCell>

                  {/* Principal Member - New column */}
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">
                    {task.principal_member_name || 'N/A'}
                  </TableCell>

                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">{companies.get(task.company_id) || 'N/A'}</TableCell>
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">
                    <Badge variant={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">
                      {task.status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">{getTaskHierarchy(task)?.department?.name || 'N/A'}</TableCell>
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">{getTaskHierarchy(task)?.subdepartment?.name || 'N/A'}</TableCell>
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">{getClassName(task, departments)}</TableCell>
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">{getSubClassName(task, departments)}</TableCell>

                  {/* Stages */}
                  {visibleStages.map(stage => (
                    <TableCell key={stage.id} className="border-r border-gray-100 text-center text-sm py-2 px-3">
                      {!isStageApplicableToTask(stage, task, departments) ? (
                        <span className="text-sm text-gray-400 italic">N/A</span>
                      ) : (
                        <EditableStageCell
                          stage={stage}
                          task={task}
                          value={task.stages?.[stage.id]}
                          onSave={handleStageStatusSave}
                          onDocumentUpload={handleStageDocumentUpload}
                          onShowDocuments={onShowUploadDialog}
                        />
                      )}
                    </TableCell>
                  ))}

                  {/* Actions */}
                  <TableCell className="border-r border-gray-100 text-center text-sm py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onTaskAction?.('delete', task)} className="h-8 w-8 text-red-600 hover:bg-red-100">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    )
  }, [stages, tasksLoading, departmentsLoading, companiesLoading, error, companies, getTaskHierarchy, getClassName, getSubClassName, departments, isStageApplicableToTask, handleStageStatusSave, handleStageDocumentUpload, onShowUploadDialog, onTaskAction, handleTaskEdit])

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
                  <Badge variant="secondary">{getFilteredTasks('in_progress').length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Completed
                  <Badge variant="secondary">{completedTasks.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {/* Enquiries Tab */}
              <TabsContent value="enquiries" className="mt-4">
                <CardHeader className="border-b border-gray-100 bg-white">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg text-slate-800">Enquiries - {dept.name}</CardTitle>
                      <CardDescription className="text-slate-600">
                        {isTransposedView ? 'Transposed view' : 'Normal view'} of enquiries.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search tasks, names, companies..."
                          value={globalSearchTerm}
                          onChange={(e) => setGlobalSearchTerm(e.target.value)}
                          className="pl-10 pr-4"
                        />
                      </div>
                      <Button
                        className="flex items-center gap-2"
                        onClick={() => setIsEnquiryDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        New Enquiry
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        onClick={() => setIsTransposedView(!isTransposedView)}
                      >
                        {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        {isTransposedView ? 'Normal View' : 'Transposed View'}
                      </Button>
                      <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(enquiryTasks, 'enquiries')}>
                        <Download className="h-4 w-4" />Export CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-2 sm:p-4">
                  {isTransposedView ? renderTransposedTable(enquiryTasks, 'enquiries') : renderNormalTable(enquiryTasks, 'enquiries')}
                </CardContent>
              </TabsContent>

              {/* WIP Stages Tab with Follow-up Filter */}
              < TabsContent value="wip-stages" className="mt-4" >
                <Card className="bg-white/80 backdrop-blur-sm shadow-md border-gray-100">
                  <CardHeader className="border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg text-slate-800">WIP Stages Progress - {dept.name}</CardTitle>
                        <CardDescription className="text-slate-600">Transposed view showing all workflow stages for in-progress tasks.</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 md:w-80">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search tasks, names, companies..."
                            value={globalSearchTerm}
                            onChange={(e) => setGlobalSearchTerm(e.target.value)}
                            className="pl-10 pr-4"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => setIsTransposedView(!isTransposedView)}
                        >
                          {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          {isTransposedView ? 'Normal View' : 'Transposed View'}
                        </Button>
                        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(wipTasks, 'wip-stages')}>
                          <Download className="h-4 w-4" />Export CSV
                        </Button>
                      </div>
                    </div>

                    {/* Follow-up Filter Tabs */}
                    <div className="mt-4">
                      <Tabs value={activeFollowUpFilter} onValueChange={setActiveFollowUpFilter}>
                        <TabsList className="rounded-lg p-1 shadow-sm bg-slate-100">
                          <TabsTrigger value="all" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">
                            All
                            <Badge variant="outline">{getWIPTasksByFollowUp('all').length}</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="bcl" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">
                            BCL
                            <Badge variant="outline">{getWIPTasksByFollowUp('bcl').length}</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="officer" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">
                            Officer
                            <Badge variant="outline">{getWIPTasksByFollowUp('officer').length}</Badge>
                          </TabsTrigger>
                          <TabsTrigger value="client" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">
                            Client
                            <Badge variant="outline">{getWIPTasksByFollowUp('client').length}</Badge>
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {isTransposedView ? renderTransposedTable(wipTasks, 'wip-stages') : renderNormalTable(wipTasks, 'wip-stages')}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Completed Tab */}
              <TabsContent value="completed" className="mt-4">
                <Card className="bg-white/80 backdrop-blur-sm shadow-md border-gray-100">
                  <CardHeader className="border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg text-slate-800">Completed Tasks - {dept.name}</CardTitle>
                        <CardDescription className="text-slate-600">Transposed view of all completed tasks.</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 md:w-80">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search tasks, names, companies..."
                            value={globalSearchTerm}
                            onChange={(e) => setGlobalSearchTerm(e.target.value)}
                            className="pl-10 pr-4"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => setIsTransposedView(!isTransposedView)}
                        >
                          {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          {isTransposedView ? 'Normal View' : 'Transposed View'}
                        </Button>
                        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(completedTasks, 'completed')}>
                          <Download className="h-4 w-4" />Export CSV
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {isTransposedView ? renderTransposedTable(completedTasks, 'completed') : renderNormalTable(completedTasks, 'completed')}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent >
        ))
        }
      </Tabs >

      <EditTaskDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} task={editingTask} departments={departments} onTaskUpdate={handleTaskUpdate} />

      {/* Enquiry Dialog */}
      <EnquiryDialog
        open={isEnquiryDialogOpen}
        onOpenChange={setIsEnquiryDialogOpen}
        onEnquiryCreated={handleEnquiryCreated}
      />

      <StageUploadDialog
        open={isStageUploadDialogOpen}
        onOpenChange={setIsStageUploadDialogOpen}
        selectedStageTask={selectedStageTask}
        getCurrentRequirements={getCurrentRequirements}
        fuzzyMatch={fuzzyMatch}
      />
    </div >
  )
}