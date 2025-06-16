// @ts-nocheck
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, AlertTriangle, CheckCircle, ArrowRight, Calendar, Upload, FileText } from "lucide-react"
import { format, parseISO } from "date-fns"
import { taskColumns } from "./components/tasksfields"
import { StageTimer } from "@/components/stage-timer"
import { StageTransitionDialog } from "@/components/stage-transition-dialog"
import { StageTimeline } from "@/components/stage-timeline"
import { StageAutomation } from "@/lib/stage-automation"
import { NewTaskDialog } from "@/app/(dashboard)/dashboard/tasks/components/new-task-dialog"
import { getTasks, updateTaskAssignment } from "@/lib/supabase/tasks"
import { getStages } from "@/lib/supabase/stages"
import { supabase } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { Stage, Department } from "@/lib/supabase/departments"
import { fetchDepartments } from "../departments/database"

type Task = Database['public']['Tables']['tm_tasks']['Row'] & {
  department?: { id: string; name: string } | null
  subdepartment?: { 
    id: string; 
    name: string; 
    department_id: string;
    classes?: Array<{
      name: string;
      description: string | null;
      requirements: Array<{
        name: string;
        description: string | null;
        is_required: boolean;
      }>
    }>
    stages?: Array<{
      id: string;
      name: string;
      order_num: number;
      estimated_time: number;
    }>
  } | null
  task_manager?: { id: string; full_name: string | null; email: string } | null
  task_assistant?: { id: string; full_name: string | null; email: string } | null
  officer?: { id: string; full_name: string | null; email: string } | null
  client?: { 
    id: string; 
    full_name: string | null; 
    email: string | null;
    bill_to?: {
      company_name?: string;
      company_address?: string;
      contact_person?: string;
    } | null;
  } | null
  current_stage?: { 
    id: string; 
    name: string; 
    estimated_time: number;
    order_num: number;
  } | null
  current_stage_started_at?: string | null
  subdepartment_id?: string | null
  job_description?: string | null
  date_initiated?: string | null
  created_at?: string
  status: string
  class_name?: string | null
  renewal_status?: string | null
  account_used?: string | null
  applied_by?: string | null
  batch?: string | null
  dependent_name?: string | null
}

// Table columns for stages view
const stageColumns = [
  { key: 'index', header: '#', width: '50px' },
  { key: 'website', header: 'Website', width: '120px' },
  { key: 'job_description', header: 'Job', width: '150px' },
  { key: 'job_head', header: 'Job Head', width: '120px' },
  { key: 'class', header: 'Class', width: '100px' },
  { key: 'documents', header: 'All Submitted Documents', width: '180px' },
  { key: 'applicant_name', header: 'Applicant Name', width: '150px' },
  { key: 'company_name', header: 'Company Name', width: '150px' },
  { key: 'dependent_name', header: 'Dependent Name', width: '150px' },
  { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
  // Dynamic stage columns will be added here
  { key: 'account_used', header: 'Account Used', width: '120px' },
  { key: 'applied_by', header: 'Applied by Who', width: '120px' },
  { key: 'batch', header: 'Batch', width: '100px' },
]

// Table columns for requirements view
const requirementColumns = [
  { key: 'index', header: '#', width: '50px' },
  { key: 'website', header: 'Website', width: '120px' },
  { key: 'job_description', header: 'Job', width: '150px' },
  { key: 'job_head', header: 'Job Head', width: '120px' },
  { key: 'class', header: 'Class', width: '100px' },
  { key: 'documents', header: 'All Submitted Documents', width: '180px' },
  { key: 'applicant_name', header: 'Applicant Name', width: '150px' },
  { key: 'company_name', header: 'Company Name', width: '150px' },
  { key: 'dependent_name', header: 'Dependent Name', width: '150px' },
  { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
  // Dynamic requirement columns will be added here
  { key: 'account_used', header: 'Account Used', width: '120px' },
  { key: 'applied_by', header: 'Applied by Who', width: '120px' },
  { key: 'batch', header: 'Batch', width: '100px' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null; role?: string }[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [stageTransitionDialogOpen, setStageTransitionDialogOpen] = useState(false)
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tasksData, departmentsData, { data: usersData, error: usersError }, stagesData] = await Promise.all([
          getTasks(),
          fetchDepartments(),
          supabase.from('tm_users').select('id, name, email, role'),
          getStages()
        ])

        if (usersError) throw usersError

        setTasks(tasksData)
        setDepartments(departmentsData)
        setUsers(usersData || [])
        setStages(stagesData)
        
        // Set default department/subdepartment
        if (departmentsData.length > 0) {
          setSelectedDepartment(departmentsData[0].id)
          if (departmentsData[0].subdepartments.length > 0) {
            setSelectedSubdepartment(departmentsData[0].subdepartments[0].id)
          }
        }
        
        setError(null)
      } catch (error) {
        console.error('Error loading data:', error)
        setError('Failed to load tasks. Please try again later.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Get filtered tasks based on selected department/subdepartment
  const getFilteredTasks = (status?: string) => {
    let filtered = tasks.filter(task => {
      if (selectedDepartment && task.department?.id !== selectedDepartment) return false
      if (selectedSubdepartment && task.subdepartment?.id !== selectedSubdepartment) return false
      return true
    })

    if (status) {
      filtered = filtered.filter(task => task.status === status)
    }

    return filtered
  }

  // Get current subdepartment details with proper typing
  const getCurrentSubdepartment = (): Subdepartment | undefined => {
    const dept = departments.find(d => d.id === selectedDepartment)
    const subdept = dept?.subdepartments?.find(s => s.id === selectedSubdepartment)
    
    // If subdepartment has classes but no display_stages, use the first class's display_stages as fallback
    if (subdept?.classes?.length && (!subdept.display_stages || subdept.display_stages.length === 0)) {
      const firstClassWithStages = subdept.classes.find(c => c.display_stages?.length)
      if (firstClassWithStages?.display_stages) {
        return {
          ...subdept,
          display_stages: firstClassWithStages.display_stages
        }
      }
    }
    
    return subdept
  }

  // Format task data for display
  const formatTaskData = (task: Task, index: number) => {
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return ''
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd')
      } catch (e) {
        return dateString
      }
    }

    const getCompanyName = () => {
      if (task.client?.bill_to?.company_name) {
        return task.client.bill_to.company_name
      }
      return task.client?.full_name || 'N/A'
    }

    return {
      ...task,
      index: index + 1,
      website: task.client?.website || '',
      job_description: task.job_description || '',
      job_head: task.task_manager?.full_name || 'Unassigned',
      class: task.class_name || 'N/A',
      documents: 'View Documents', // Placeholder - could be a button/link
      applicant_name: task.client?.full_name || 'N/A',
      company_name: getCompanyName(),
      dependent_name: task.dependent_name || '',
      renewal_status: task.renewal_status || 'New',
      account_used: task.account_used || '',
      applied_by: task.applied_by || 'System',
      batch: task.batch || '',
    }
  }

  // Generate dynamic stage columns based on current subdepartment
  const generateStageColumns = () => {
    const subdept = getCurrentSubdepartment()
    if (!subdept?.stages) return stageColumns

    // Get all displayable stages (either from subdepartment or its classes)
    let displayStages = [...(subdept.display_stages || [])]
    
    // If subdepartment has classes and a task has a class, use that class's display_stages
    if (subdept.classes?.length) {
      const taskClass = subdept.classes.find(c => c.name === tasks[0]?.class_name)
      if (taskClass?.display_stages?.length) {
        displayStages = taskClass.display_stages
      }
    }

    // Only show stages that are both in stages and display_stages
    const visibleStages = subdept.stages.filter(stage => 
      displayStages.includes(stage.id) || 
      subdept.stages?.includes(stage.id) // Fallback to all allocated stages if no display_stages
    )

    const dynamicStageColumns = visibleStages.map(stage => ({
      key: `stage_${stage.id}`,
      header: stage.name,
      width: '120px',
      render: (value: any, task: Task) => {
        // Check if task is in this stage
        const isCurrentStage = task.current_stage?.id === stage.id
        const isCompleted = task.current_stage && task.current_stage.order > stage.order
        
        if (isCurrentStage) {
          return <Badge variant="default">In Progress</Badge>
        } else if (isCompleted) {
          return <Badge variant="secondary">Completed</Badge>
        } else {
          return <Badge variant="outline">Pending</Badge>
        }
      }
    }))


    // Insert stage columns before account_used
    const baseColumns = stageColumns.slice(0, -3) // Remove last 3 columns
    const endColumns = stageColumns.slice(-3) // Get last 3 columns
    
    return [...baseColumns, ...dynamicStageColumns, ...endColumns]
  }

  // Generate dynamic requirement columns based on current subdepartment and class
  const generateRequirementColumns = (className?: string) => {
    const subdept = getCurrentSubdepartment()
    if (!subdept?.classes) return requirementColumns

    const selectedClass = subdept.classes.find(c => c.name === className)
    if (!selectedClass?.requirements) return requirementColumns

    const dynamicRequirementColumns = selectedClass.requirements.map(req => ({
      key: `req_${req.name.replace(/\s+/g, '_').toLowerCase()}`,
      header: req.name,
      width: '150px',
      render: (value: any, task: Task) => {
        // Check if requirement is fulfilled - this would need to be tracked in your task data
        // For now, showing placeholder status
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline">Pending</Badge>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <Upload className="h-3 w-3" />
            </Button>
          </div>
        )
      }
    }))

    // Insert requirement columns before account_used
    const baseColumns = requirementColumns.slice(0, -3) // Remove last 3 columns
    const endColumns = requirementColumns.slice(-3) // Get last 3 columns
    
    return [...baseColumns, ...dynamicRequirementColumns, ...endColumns]
  }

  const handleTaskAssignment = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      setSelectedTask({
        id: task.id,
        jobDescription: task.job_description || '',
        currentAssignments: {
          taskManager: task.task_manager_id || "",
          taskAssistant: task.task_assistant_id || "",
        },
      } as any)
      setAssignmentDialogOpen(true)
    }
  }

  const handleStageTransition = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
    setSelectedTask(task)
    setStageTransitionDialogOpen(true)
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      in_progress: "default",
      completed: "success",
      cancelled: "destructive",
      pending: "secondary",
    } as const

    return <Badge variant={variants[status as keyof typeof variants] || "secondary"}>{status}</Badge>
  }

  const renderTaskTable = (tasks: Task[], columns: any[], showRequirements = false, selectedClass?: string) => {
    const finalColumns = showRequirements ? generateRequirementColumns(selectedClass) : generateStageColumns()
    
    return (
      <div className="rounded-md border w-full overflow-hidden">
        <div className="w-full overflow-auto" style={{ maxHeight: '70vh', maxWidth: '90vw' }}>
          <Table className="min-w-[1400px] w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {finalColumns.map((column) => (
                  <TableHead 
                    key={column.key} 
                    className="whitespace-nowrap border-r border-border last:border-r-0 bg-muted/50 font-semibold"
                    style={{ width: column.width }}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={finalColumns.length} className="h-24 text-center">
                    Loading tasks...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={finalColumns.length} className="h-24 text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : tasks.length > 0 ? (
                tasks.map((task, index) => {
                  const formattedTask = formatTaskData(task, index)
                  return (
                    <TableRow 
                      key={task.id}
                      className="hover:bg-muted/50"
                    >
                      {finalColumns.map((column) => (
                        <TableCell 
                          key={`${task.id}-${column.key}`} 
                          className="whitespace-nowrap border-r border-border last:border-r-0 py-2"
                        >
                          {column.render 
                            ? column.render(
                                formattedTask[column.key as keyof typeof formattedTask], 
                                formattedTask,
                                index
                              )
                            : (formattedTask[column.key as keyof typeof formattedTask] || '-')}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={finalColumns.length} className="h-24 text-center">
                    No tasks found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-2">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading tasks...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-2">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Task Management</h2>
        <div className="flex items-center space-x-2">
          <Button 
            onClick={() => setNewTaskDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      <Tabs defaultValue={departments[0]?.id || 'default'} className="space-y-4">
        <TabsList>
          {departments.map((dept) => (
            <TabsTrigger 
              key={dept.id} 
              value={dept.id}
              onClick={() => {
                setSelectedDepartment(dept.id)
                if (dept.subdepartments.length > 0) {
                  setSelectedSubdepartment(dept.subdepartments[0].id)
                }
              }}
            >
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map((dept) => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4">
            <Tabs 
              defaultValue={dept.subdepartments[0]?.id || 'default'} 
              className="space-y-4"
              onValueChange={(value) => setSelectedSubdepartment(value)}
            >
              <TabsList>
                {dept.subdepartments.map((subdept) => (
                  <TabsTrigger 
                    key={subdept.id} 
                    value={subdept.id}
                  >
                    {subdept.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {dept.subdepartments.map((subdept) => (
                <TabsContent key={subdept.id} value={subdept.id} className="space-y-4">
                  {/* Show classes tabs if they exist, otherwise show direct WIP/Completed tabs */}
                  {subdept.classes && subdept.classes.length > 0 ? (
                    <Tabs 
                      defaultValue={subdept.classes[0]?.name || ''} 
                      className="space-y-4"
                    >
                      <TabsList>
                        {subdept.classes.map((cls) => (
                          <TabsTrigger key={cls.name} value={cls.name}>
                            {cls.name}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {subdept.classes.map((cls) => (
                        <TabsContent key={cls.name} value={cls.name} className="space-y-4">
                          <Tabs defaultValue="work-in-progress" className="space-y-4">
                            <TabsList>
                              <TabsTrigger value="work-in-progress">Work in Progress</TabsTrigger>
                              <TabsTrigger value="completed">Completed</TabsTrigger>
                            </TabsList>

                            <TabsContent value="work-in-progress" className="space-y-4">
                              <Tabs defaultValue="stages" className="space-y-4">
                                <TabsList>
                                  <TabsTrigger value="stages">
                                    <FileText className="h-4 w-4 mr-2" />
                                    Stages
                                  </TabsTrigger>
                                  <TabsTrigger value="upload-requirements">
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload Requirements
                                  </TabsTrigger>
                                  <TabsTrigger value="webdata">
                                    <Upload className="h-4 w-4 mr-2" />
                                    Web Data
                                  </TabsTrigger>
                                </TabsList>

                                <TabsContent value="stages" className="space-y-4">
                                  <Card>
                                    <CardHeader>
                                      <CardTitle>Stages Progress - {subdept.name} - {cls.name}</CardTitle>
                                      <CardDescription>
                                        Track tasks through various stages of completion
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                      {renderTaskTable(
                                        tasks.filter(task => 
                                          task.status === 'in_progress' && 
                                          task.class_name === cls.name &&
                                          task.subdepartment_id === subdept.id
                                        ), 
                                        stageColumns, 
                                        false
                                      )}
                                    </CardContent>
                                  </Card>
                                </TabsContent>

                                <TabsContent value="upload-requirements" className="space-y-4">
                                  <Card>
                                    <CardHeader>
                                      <CardTitle>Upload Requirements - {cls.name}</CardTitle>
                                      <CardDescription>
                                        {cls.description || `Manage document requirements for ${cls.name}`}
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                      {renderTaskTable(
                                        tasks.filter(task => 
                                          task.status === 'in_progress' && 
                                          task.class_name === cls.name &&
                                          task.subdepartment_id === subdept.id
                                        ), 
                                        requirementColumns, 
                                        true, 
                                        cls.name
                                      )}
                                    </CardContent>
                                  </Card>
                                </TabsContent>

                                <TabsContent value="webdata" className="space-y-4">
                                  <Card>
                                    <CardHeader>
                                      <CardTitle>Web Data - {cls.name}</CardTitle>
                                      <CardDescription>
                                        {cls.description || `Web data for ${cls.name}`}
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                      {renderTaskTable(
                                        tasks.filter(task => 
                                          task.status === 'in_progress' && 
                                          task.class_name === cls.name &&
                                          task.subdepartment_id === subdept.id
                                        ), 
                                        requirementColumns, 
                                        true, 
                                        cls.name
                                      )}
                                    </CardContent>
                                  </Card>
                                </TabsContent>
                              </Tabs>
                            </TabsContent>

                            <TabsContent value="completed" className="space-y-4">
                              <Card>
                                <CardHeader>
                                  <CardTitle>Completed Tasks - {subdept.name} - {cls.name}</CardTitle>
                                  <CardDescription>Successfully completed tasks with performance metrics</CardDescription>
                                </CardHeader>
                                <CardContent className="p-4">
                                  {renderTaskTable(
                                    tasks.filter(task => 
                                      task.status === 'completed' && 
                                      task.class_name === cls.name &&
                                      task.subdepartment_id === subdept.id
                                    ), 
                                    stageColumns, 
                                    false
                                  )}
                                </CardContent>
                              </Card>
                            </TabsContent>
                          </Tabs>
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <Tabs defaultValue="work-in-progress" className="space-y-4">
                      <TabsList>
                        <TabsTrigger value="work-in-progress">Work in Progress</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                      </TabsList>

                      <TabsContent value="work-in-progress" className="space-y-4">
                        <Tabs defaultValue="stages" className="space-y-4">
                          <TabsList>
                            <TabsTrigger value="stages">
                              <FileText className="h-4 w-4 mr-2" />
                              Stages
                            </TabsTrigger>
                            <TabsTrigger value="upload-requirements">
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Requirements
                            </TabsTrigger>
                            <TabsTrigger value="webdata">
                              <Upload className="h-4 w-4 mr-2" />
                              Web Data
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="stages" className="space-y-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>Stages Progress - {subdept.name}</CardTitle>
                                <CardDescription>
                                  Track tasks through various stages of completion
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="p-4">
                                {renderTaskTable(
                                  tasks.filter(task => 
                                    task.status === 'in_progress' &&
                                    task.subdepartment_id === subdept.id
                                  ), 
                                  stageColumns, 
                                  false
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="upload-requirements" className="space-y-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>Upload Requirements</CardTitle>
                                <CardDescription>
                                  Manage document requirements for this subdepartment
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="p-4">
                                {renderTaskTable(
                                  tasks.filter(task => 
                                    task.status === 'in_progress' &&
                                    task.subdepartment_id === subdept.id
                                  ), 
                                  requirementColumns, 
                                  true
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="webdata" className="space-y-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>Web Data</CardTitle>
                                <CardDescription>
                                  Web data for this subdepartment
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="p-4">
                                {renderTaskTable(
                                  tasks.filter(task => 
                                    task.status === 'in_progress' &&
                                    task.subdepartment_id === subdept.id
                                  ), 
                                  requirementColumns, 
                                  true
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>
                        </Tabs>
                      </TabsContent>

                      <TabsContent value="completed" className="space-y-4">
                        <Card>
                          <CardHeader>
                            <CardTitle>Completed Tasks - {subdept.name}</CardTitle>
                            <CardDescription>Successfully completed tasks with performance metrics</CardDescription>
                          </CardHeader>
                          <CardContent className="p-4">
                            {renderTaskTable(
                              tasks.filter(task => 
                                task.status === 'completed' &&
                                task.subdepartment_id === subdept.id
                              ), 
                              stageColumns, 
                              false
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
      {/* Dialogs */}
      <NewTaskDialog
        open={newTaskDialogOpen}
        onOpenChange={setNewTaskDialogOpen}
        onCreate={(newTask) => {
          setTasks(prev => [newTask, ...prev])
        }}
      />

      {selectedTask && (
        <TaskAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          task={selectedTask}
          users={users.map(u => ({
            id: u.id,
            username: u.name || u.email,
            email: u.email
          }))}
          onAssign={async (assignments) => {
            try {
              const updatedTask = await updateTaskAssignment(selectedTask.id, {
                taskManager: assignments.taskManager,
                taskAssistant: assignments.taskAssistant
              })
              
              setTasks(tasks.map(t => 
                t.id === selectedTask.id 
                  ? { ...t, ...updatedTask } 
                  : t
              ))
              
              setAssignmentDialogOpen(false)
            } catch (err) {
              console.error("Error updating task assignment:", err)
            }
          }}
        />
      )}

      {selectedTask && (
        <StageTransitionDialog
          open={stageTransitionDialogOpen}
          onOpenChange={setStageTransitionDialogOpen}
          currentStage={{
            id: selectedTask.current_stage?.id?.toString() || '',
            name: selectedTask.current_stage?.name || 'Not Started',
            estimatedDuration: selectedTask.current_stage?.estimated_time || 0,
            actualDuration: selectedTask.current_stage_started_at
              ? (new Date().getTime() - new Date(selectedTask.current_stage_started_at).getTime()) / (1000 * 60)
              : 0
          }}
          stages={stages}
          currentStageId={selectedTask.current_stage?.id?.toString()}
          onTransition={async (data) => {
            try {
              const { data: updatedTask, error } = await supabase
                .from('tm_tasks')
                .update({
                  current_stage_id: data.nextStageId ? parseInt(data.nextStageId) : null,
                  current_stage_started_at: data.nextStageId ? new Date().toISOString() : null,
                  status: data.nextStageId ? 'in_progress' : 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('id', selectedTask.id)
                .select('*')
                .single()

              if (error) throw error

              setTasks(tasks.map(t => t.id === selectedTask.id ? updatedTask : t))
              
              const [tasksData] = await Promise.all([getTasks()])
              setTasks(tasksData)
              setStageTransitionDialogOpen(false)
            } catch (err) {
              console.error("Error updating stage:", err)
            }
          }}
        />
      )}
    </div>
  )
}