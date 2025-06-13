// @ts-nocheck
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, AlertTriangle, CheckCircle, ArrowRight, Calendar } from "lucide-react"
import { format, parseISO } from "date-fns"
import { taskColumns } from "./components/tasksfields"
import { StageTimer } from "@/components/stage-timer"
import { TaskAssignmentDialog } from "@/components/task-assignment-dialog"
import { StageTransitionDialog } from "@/components/stage-transition-dialog"
import { StageTimeline } from "@/components/stage-timeline"
import { StageAutomation } from "@/lib/stage-automation"
import { NewTaskDialog } from "@/app/(dashboard)/dashboard/tasks/components/new-task-dialog"
import { getTasks, updateTaskAssignment } from "@/lib/supabase/tasks"
import { getStages } from "@/lib/supabase/stages"
import { supabase } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { Stage } from "@/lib/supabase/stages"

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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null; role?: string }[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [stageTransitionDialogOpen, setStageTransitionDialogOpen] = useState(false)
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tasksData, { data: usersData, error: usersError }, stagesData] = await Promise.all([
          getTasks(),
          supabase.from('tm_users').select('id, name, email, role'),
          getStages()
        ])

        if (usersError) throw usersError

        setTasks(tasksData)
        setUsers(usersData || [])
        setStages(stagesData)
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

  // Format task data for display with enhanced company name mapping
  const formatTaskData = (task: Task, index: number) => {
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return ''
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd')
      } catch (e) {
        return dateString
      }
    }

    // Get company name from bill_to details
    const getCompanyName = () => {
      if (task.client?.bill_to?.company_name) {
        return task.client.bill_to.company_name
      }
      return 'N/A'
    }

    const formattedTask: any = {
      ...task,
      // Basic info with index
      index: index,
      website: task.client?.website || '',
      job_description: task.job_description || '',
      job_head: task.task_manager?.full_name || 'Unassigned',
      class: task.class_name || 'N/A',
      
      // Applicant info with enhanced company mapping
      applicant_name: task.client?.full_name || 'N/A',
      company_name: getCompanyName(),
      dependent_name: task.dependent_name || '',
      renewal_status: task.renewal_status || 'New',
      
      // Dates
      applied_date: formatDate(task.date_initiated),
      processing_paid_date: formatDate(task.processing_paid_date),
      paid_ksh: task.paid_amount || 0,
      processing_upload_date: formatDate(task.processing_upload_date),
      received_date: formatDate(task.received_date),
      approved_date: formatDate(task.approved_date),
      kcb_paid_date: formatDate(task.kcb_paid_date),
      issuance_upload_date: formatDate(task.issuance_upload_date),
      write_up_date: formatDate(task.write_up_date),
      
      // Additional info
      account_used: task.account_used || '',
      applied_by: task.applied_by || 'System',
      batch: task.batch || '',
      
      // Original fields (kept for compatibility)
      department: task.department?.name || 'N/A',
      subdepartment: task.subdepartment?.name || 'N/A',
      taskManager: task.task_manager?.full_name || 'Unassigned',
      taskAssistant: task.task_assistant?.full_name || 'Unassigned',
      officer: task.officer?.full_name || 'Unassigned',
      client: task.client?.full_name || getCompanyName() || 'N/A',
      dateInitiated: formatDate(task.date_initiated),
      currentStage: task.current_stage ? {
        id: task.current_stage.id,
        name: task.current_stage.name,
        estimatedMinutes: task.current_stage.estimated_time || 0,
      } : null,
      currentStageId: task.current_stage_id,
      currentStageStartedAt: task.current_stage_started_at || task.created_at
    }
    
    return formattedTask as Task & {
      jobDescription: string
      department: string
      subdepartment: string
      taskManager: string
      taskAssistant: string
      officer: string
      client: string
      dateInitiated: string
      currentStage: { id: string; name: string; estimatedMinutes: number } | null
    }
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
      Registered: "secondary",
      Confirmed: "default",
      Completed: "success",
      Cancelled: "destructive",
    } as const

    return <Badge variant={variants[status as keyof typeof variants] || "secondary"}>{status}</Badge>
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
          <NewTaskDialog
            open={newTaskDialogOpen}
            onOpenChange={setNewTaskDialogOpen}
            onCreate={(newTask) => {
              setTasks(prev => [newTask, ...prev])
            }}
          />
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Tasks</CardTitle>
              <CardDescription>Complete overview of all tasks in the system.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="rounded-md border w-full overflow-hidden">
                <div className="w-full overflow-auto" style={{ maxHeight: '70vh', maxWidth: '90vw' }}>
                  <Table className="min-w-[1400px] w-full">
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        {taskColumns.map((column) => (
                          <TableHead 
                            key={column.key} 
                            className="whitespace-nowrap border-r border-border last:border-r-0 bg-muted/50 font-semibold"
                          >
                            {column.header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={taskColumns.length} className="h-24 text-center">
                            Loading tasks...
                          </TableCell>
                        </TableRow>
                      ) : error ? (
                        <TableRow>
                          <TableCell colSpan={taskColumns.length} className="h-24 text-center text-destructive">
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
                              {taskColumns.map((column) => (
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
                          <TableCell colSpan={taskColumns.length} className="h-24 text-center">
                            No tasks found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="overdue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overdue Tasks</CardTitle>
              <CardDescription>Tasks that have exceeded their estimated stage time.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="border-r border-border">Job Description</TableHead>
                    <TableHead className="border-r border-border">Current Stage</TableHead>
                    <TableHead className="border-r border-border">Overdue By</TableHead>
                    <TableHead className="border-r border-border">Manager</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks
                    .filter((task) => {
                      if (!task.current_stage_started_at || !task.current_stage?.estimated_time) return false
                      const elapsedMinutes = (new Date().getTime() - new Date(task.current_stage_started_at).getTime()) / (1000 * 60)
                      return elapsedMinutes > (task.current_stage.estimated_time * 1.5)
                    })
                    .map((task) => (formatTaskData(task, 0))).map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium border-r border-border">{task.jobDescription}</TableCell>
                        <TableCell className="border-r border-border">
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {task.currentStage?.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="border-r border-border">2 hours</TableCell>
                        <TableCell className="border-r border-border">{task.taskManager}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => handleStageTransition(task.id)}>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Completed Tasks</CardTitle>
              <CardDescription>Successfully completed tasks with performance metrics.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="border-r border-border">Job Description</TableHead>
                    <TableHead className="border-r border-border">Completed Date</TableHead>
                    <TableHead className="border-r border-border">Total Time</TableHead>
                    <TableHead className="border-r border-border">Performance</TableHead>
                    <TableHead>Manager</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks
                    .filter(task => task.status === 'completed')
                    .map((task) => (formatTaskData(task, 0))).map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium border-r border-border">{task.jobDescription}</TableCell>
                        <TableCell className="border-r border-border">{task.dateInitiated}</TableCell>
                        <TableCell className="border-r border-border">2.5 days</TableCell>
                        <TableCell className="border-r border-border">
                          <Badge variant="default">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            On Time
                          </Badge>
                        </TableCell>
                        <TableCell>{task.taskManager}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Task Assignment Dialog */}
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

      {/* Stage Transition Dialog */}
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
              
              if (data.nextStageId) {
                await supabase.from('tm_task_stage_history').insert({
                  task_id: selectedTask.id,
                  stage_id: parseInt(data.nextStageId),
                  started_at: new Date().toISOString(),
                  notes: data.notes
                })
              } else {
                await supabase.from('tm_task_stage_history').insert({
                  task_id: selectedTask.id,
                  stage_id: selectedTask.current_stage?.id,
                  started_at: selectedTask.currentStage.startedAt || new Date().toISOString(),
                  completed_at: new Date().toISOString(),
                  notes: data.notes
                })
              }
              
              const [tasksData] = await Promise.all([
                getTasks()
              ])
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