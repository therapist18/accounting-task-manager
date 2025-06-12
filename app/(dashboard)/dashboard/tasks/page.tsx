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
import { supabase } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type Task = Database['public']['Tables']['tm_tasks']['Row'] & {
  department?: { id: string; name: string } | null
  subdepartment?: { 
    id: string; 
    name: string; 
    department_id: string;
    stages?: Array<{
      id: string;
      name: string;
      order_num: number;
      estimated_time: number;
    }>
  } | null
  task_manager?: { id: string; full_name: string | null; email: string } | null
  task_assistant?: { id: string; full_name: string | null; email: string } | null
  client?: { id: string; full_name: string | null; email: string | null } | null
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
}

export default function TasksPage() {
  // Remove unused date state
  // const [date, setDate] = useState<Date>()
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false)
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch tasks from the database
  const fetchTasks = async () => {
    try {
      setLoading(true)
      const fetchedTasks = await getTasks()
      setTasks(fetchedTasks)
    } catch (err) {
      console.error("Error fetching tasks:", err)
      setError("Failed to load tasks. Please try again later.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  // Format task data for display
  const formatTaskData = (task: Task) => {
    // Parse dates to ensure consistent formatting
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return ''
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd')
      } catch (e) {
        return dateString
      }
    }

    const formattedTask: any = {
      ...task,
      // Basic info
      website: task.client?.website || '',
      job_description: task.job_description || '',
      job_head: task.task_manager?.full_name || 'Unassigned',
      class: task.subdepartment?.name || 'N/A',
      
      // Applicant info
      applicant_name: task.client?.full_name || 'N/A',
      company_name: task.client_company || 'N/A',
      dependent_name: '', // This would come from client data if available
      renewal_status: 'New', // Default to New, would come from task data
      
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
      applied_by: task.created_by || 'System',
      batch: task.batch_number || '',
      
      // Original fields (kept for compatibility)
      department: task.department?.name || 'N/A',
      subdepartment: task.subdepartment?.name || 'N/A',
      taskManager: task.task_manager?.full_name || 'Unassigned',
      taskAssistant: task.task_assistant?.full_name || 'Unassigned',
      client: task.client?.full_name || task.client_company || 'N/A',
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
    const task = tasks.find((t) => t.id === taskId)
    if (task && task.current_stage) {
      setSelectedTask({
        id: task.id,
        currentStage: {
          id: task.current_stage.id,
          name: task.current_stage.name,
          estimatedDuration: task.current_stage.estimated_time || 0,
          startedAt: task.current_stage_started_at || task.created_at || new Date().toISOString(),
          actualDuration: Math.floor((new Date().getTime() - new Date(task.current_stage_started_at || task.created_at || new Date()).getTime()) / (1000 * 60)),
          order_num: task.current_stage.order_num || 0,
        },
        nextStages: (task.subdepartment?.stages || [])
          .filter((s) => s.order_num > (task.current_stage?.order_num || 0))
          .map((s) => ({
            id: s.id,
            name: s.name,
            estimatedDuration: s.estimated_time || 0,
            order_num: s.order_num || 0,
          })) || [],
      } as any)
      setTransitionDialogOpen(true)
    }
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
          {/* <TabsTrigger value="active">Active Tasks</TabsTrigger> */}
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {loading ? (
            <div className="col-span-2 flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading tasks...</div>
            </div>
          ) : error ? (
            <div className="col-span-2 flex items-center justify-center py-12 text-destructive">
              {error}
            </div>
          ) : tasks
              .filter((task) => task.status !== "completed")
              .map((task) => (formatTaskData(task))).map((task) => (
                <Card key={task.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{task.jobDescription}</CardTitle>
                        <CardDescription>
                          {task.department} • {task.subdepartment}
                        </CardDescription>
                      </div>
                      {getStatusBadge(task.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Manager:</span>
                        <p className="font-medium">{task.taskManager}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Assistant:</span>
                        <p className="font-medium">{task.taskAssistant}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Client:</span>
                        <p className="font-medium">{task.client}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Initiated:</span>
                        <p className="font-medium">{task.dateInitiated}</p>
                      </div>
                    </div>

                    {(() => {
                      const subdepartment = mockSubdepartments.find((s) => s.id === task.subdepartmentId)
                      if (!subdepartment) return null

                      const stageProgression = StageAutomation.calculateStageProgression(subdepartment, mockStages)
                      const currentStage = stageProgression.find((s) => s.id === task.currentStageId)
                      const timeline = StageAutomation.generateStageTimeline(task, stageProgression)

                      return (
                        <div className="space-y-4">
                          {currentStage && (
                            <StageTimer
                              stageName={currentStage.name}
                              estimatedMinutes={currentStage.timeEstimate}
                              startedAt={task.currentStageStartedAt || task.dateInitiated}
                              autoCalculated={true}
                              onCompleteStage={() => handleStageTransition(task.id)}
                              onNextStage={() => handleStageTransition(task.id)}
                            />
                          )}
                          <StageTimeline timeline={timeline} />
                        </div>
                      )
                    })()}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleTaskAssignment(task.id)}>
                        <Users className="h-4 w-4 mr-2" />
                        Reassign
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleStageTransition(task.id)}>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Transition
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Tasks</CardTitle>
              <CardDescription>Complete overview of all tasks in the system.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 h-[calc(100vh-250px)] flex flex-col">
              <div className="rounded-md border w-full overflow-hidden flex-1 flex flex-col">
                <div className="overflow-auto flex-1">
                  <Table className="min-w-full w-[1600px] relative">
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                      {taskColumns.map((column) => (
                        <TableHead key={column.key} className="whitespace-nowrap">
                          {column.header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.length > 0 ? (
                      tasks.map((task) => {
                        const formattedTask = formatTaskData(task)
                        return (
                          <TableRow key={task.id}>
                            {taskColumns.map((column) => (
                              <TableCell key={`${task.id}-${column.key}`} className="whitespace-nowrap">
                                {column.render 
                                  ? column.render(formattedTask[column.key as keyof typeof formattedTask], formattedTask)
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
                    <TableHead>Job Description</TableHead>
                    <TableHead>Current Stage</TableHead>
                    <TableHead>Overdue By</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks
                    .filter((task) => {
                      if (!task.current_stage_started_at || !task.current_stage?.estimated_time) return false
                      const elapsedMinutes = (new Date().getTime() - new Date(task.current_stage_started_at).getTime()) / (1000 * 60)
                      return elapsedMinutes > (task.current_stage.estimated_time * 1.5) // 50% over estimated time
                    })
                    .map((task) => (formatTaskData(task))).map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.jobDescription}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {task.currentStage?.name}
                          </Badge>
                        </TableCell>
                        <TableCell>2 hours</TableCell>
                        <TableCell>{task.taskManager}</TableCell>
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
                    <TableHead>Job Description</TableHead>
                    <TableHead>Completed Date</TableHead>
                    <TableHead>Total Time</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Manager</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Vehicle Registration - DEF Motors</TableCell>
                    <TableCell>2023-05-28</TableCell>
                    <TableCell>2.5 days</TableCell>
                    <TableCell>
                      <Badge variant="success">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        On Time
                      </Badge>
                    </TableCell>
                    <TableCell>John Doe</TableCell>
                  </TableRow>
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
              
              // Update local state
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
          open={transitionDialogOpen}
          onOpenChange={setTransitionDialogOpen}
          currentStage={selectedTask.currentStage}
          nextStages={selectedTask.nextStages || []}
          onTransition={async (data) => {
            try {
              // Update task's current stage
              await supabase
                .from('tm_tasks')
                .update({
                  current_stage_id: data.nextStageId,
                  current_stage_started_at: new Date().toISOString(),
                  status: data.nextStageId ? 'in_progress' : 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('id', selectedTask.id)
              
              // Add to stage history
              if (selectedTask.currentStage) {
                await supabase
                  .from('tm_task_stages')
                  .insert([{
                    task_id: selectedTask.id,
                    stage_id: selectedTask.currentStage.id,
                    started_at: selectedTask.currentStage.startedAt || new Date().toISOString(),
                    completed_at: new Date().toISOString(),
                    notes: data.notes
                  }])
              }
              
              // Refresh tasks
              await fetchTasks()
              setTransitionDialogOpen(false)
            } catch (err) {
              console.error("Error updating stage:", err)
            }
          }}
        />
      )}
    </div>
  )
}
