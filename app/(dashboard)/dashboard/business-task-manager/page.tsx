"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { format, isSameDay, isThisWeek } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  departments,
  generateDueTemplates,
  getPendingReminders,
  isTaskVisibleToUser,
  recurringTemplates,
  reminders,
  tasks,
  users,
} from "./task-data"
import type { BusinessTask, TaskFilters, TaskPriority, TaskStatus, TaskType } from "./types"

const statusStyles: Record<TaskStatus, string> = {
  todo: "border-slate-200 bg-slate-50 text-slate-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
}

const priorityStyles: Record<TaskPriority, string> = {
  low: "border-slate-200 bg-white text-slate-600",
  medium: "border-cyan-200 bg-cyan-50 text-cyan-700",
  high: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
}

const typeStyles: Record<TaskType, string> = {
  user: "bg-indigo-50 text-indigo-700 border-indigo-200",
  department: "bg-teal-50 text-teal-700 border-teal-200",
  system: "bg-purple-50 text-purple-700 border-purple-200",
}

const defaultFilters: TaskFilters = {
  search: "",
  status: "all",
  priority: "all",
  departmentId: "all",
  userId: "all",
  type: "all",
  dateView: "all",
}

function getUserName(userId?: string | null) {
  if (!userId) return "Unassigned"
  return users.find((user) => user.id === userId)?.name ?? "Unknown user"
}

function getDepartment(departmentId: string) {
  return departments.find((department) => department.id === departmentId) ?? departments[0]
}

function isOverdue(task: BusinessTask) {
  return new Date(task.dueDate) < new Date() && !["done", "cancelled"].includes(task.status)
}

function filterTasks(allTasks: BusinessTask[], filters: TaskFilters) {
  const search = filters.search.trim().toLowerCase()
  return allTasks.filter((task) => {
    const matchesSearch =
      !search ||
      task.title.toLowerCase().includes(search) ||
      task.description.toLowerCase().includes(search) ||
      task.tags.some((tag) => tag.toLowerCase().includes(search))

    const dueDate = new Date(task.dueDate)
    const matchesDate =
      filters.dateView === "all" ||
      (filters.dateView === "today" && isSameDay(dueDate, new Date())) ||
      (filters.dateView === "week" && isThisWeek(dueDate, { weekStartsOn: 1 })) ||
      (filters.dateView === "overdue" && isOverdue(task))

    return (
      matchesSearch &&
      (filters.status === "all" || task.status === filters.status) &&
      (filters.priority === "all" || task.priority === filters.priority) &&
      (filters.departmentId === "all" || task.departmentId === filters.departmentId) &&
      (filters.userId === "all" || task.assignedToUserId === filters.userId) &&
      (filters.type === "all" || task.type === filters.type) &&
      matchesDate
    )
  })
}

function StatCard({
  title,
  value,
  helper,
  icon: Icon,
  className,
}: {
  title: string
  value: string | number
  helper: string
  icon: typeof ClipboardList
  className?: string
}) {
  return (
    <Card className={cn("rounded-lg border-slate-200 shadow-sm", className)}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function TaskCard({ task }: { task: BusinessTask }) {
  const department = getDepartment(task.departmentId)

  return (
    <Card className="rounded-lg border-slate-200 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", department.color)} />
              <h3 className="truncate text-base font-semibold text-slate-950">{task.title}</h3>
              {isOverdue(task) && (
                <Badge className="rounded-md border-red-200 bg-red-50 text-red-700 hover:bg-red-50">
                  Overdue
                </Badge>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{task.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Badge variant="outline" className={cn("rounded-md", statusStyles[task.status])}>
              {task.status.replace("_", " ")}
            </Badge>
            <Badge variant="outline" className={cn("rounded-md", priorityStyles[task.priority])}>
              {task.priority}
            </Badge>
            <Badge variant="outline" className={cn("rounded-md", typeStyles[task.type])}>
              {task.type}
            </Badge>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Department</p>
            <p className="mt-1 font-medium text-slate-800">{department.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned</p>
            <p className="mt-1 font-medium text-slate-800">{getUserName(task.assignedToUserId)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Start</p>
            <p className="mt-1 font-medium text-slate-800">{format(new Date(task.startDate), "dd MMM, p")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due</p>
            <p className="mt-1 font-medium text-slate-800">{format(new Date(task.dueDate), "dd MMM, p")}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="rounded-md bg-slate-100 text-slate-600">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function NewTaskDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-blue-700 hover:bg-blue-800">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-lg">
        <DialogHeader>
          <DialogTitle>Create business task</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Task title" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="What needs to happen?" className="min-h-24" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select defaultValue="user">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User task</SelectItem>
                <SelectItem value="department">Department task</SelectItem>
                <SelectItem value="system">System task</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select defaultValue="banking">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assignee</Label>
            <Select defaultValue="unassigned">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select defaultValue="medium">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline">Save draft</Button>
          <Button className="bg-blue-700 hover:bg-blue-800">Create task</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function BusinessTaskManagerPage() {
  const [activeUserId, setActiveUserId] = useState("u-admin")
  const [filters, setFilters] = useState<TaskFilters>(defaultFilters)
  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0]
  const visibleTasks = useMemo(
    () => tasks.filter((task) => isTaskVisibleToUser(task, activeUser)),
    [activeUser]
  )
  const filteredTasks = useMemo(() => filterTasks(visibleTasks, filters), [visibleTasks, filters])
  const pendingReminders = getPendingReminders(reminders)
  const dueTemplates = generateDueTemplates()
  const overdueTasks = visibleTasks.filter(isOverdue)
  const doneCount = visibleTasks.filter((task) => task.status === "done").length
  const completionRate = Math.round((doneCount / Math.max(visibleTasks.length, 1)) * 100)

  const departmentWorkload = departments.map((department) => {
    const departmentTasks = visibleTasks.filter((task) => task.departmentId === department.id)
    const openTasks = departmentTasks.filter((task) => !["done", "cancelled"].includes(task.status)).length
    return { ...department, openTasks, totalTasks: departmentTasks.length }
  })

  const updateFilter = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="min-h-full bg-slate-50 p-1 text-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-md bg-blue-50 text-blue-700 hover:bg-blue-50">
                BCL internal platform
              </Badge>
              {activeUser.role === "admin" && (
                <Badge className="gap-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin view
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
              Task Manager and Diary
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              A separate multi-user workspace for personal tasks, department queues, recurring system work,
              reminders, and admin oversight.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={activeUserId} onValueChange={setActiveUserId}>
              <SelectTrigger className="w-full min-w-56 bg-white sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} - {user.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <NewTaskDialog />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Visible Tasks" value={visibleTasks.length} helper="Access controlled workspace" icon={ClipboardList} />
          <StatCard title="Overdue" value={overdueTasks.length} helper="Needs follow-up today" icon={AlertTriangle} />
          <StatCard title="Pending Reminders" value={pendingReminders.length} helper="Ready for notification job" icon={Bell} />
          <StatCard title="Completion" value={`${completionRate}%`} helper="Current visible task set" icon={CheckCircle2} />
        </div>

        <Tabs defaultValue="workspace" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg bg-white p-1 shadow-sm md:w-fit md:grid-cols-5">
            <TabsTrigger value="workspace" className="gap-2 rounded-md"><ClipboardList className="h-4 w-4" />Workspace</TabsTrigger>
            <TabsTrigger value="departments" className="gap-2 rounded-md"><Users className="h-4 w-4" />Departments</TabsTrigger>
            <TabsTrigger value="recurring" className="gap-2 rounded-md"><RefreshCw className="h-4 w-4" />Recurring</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-2 rounded-md"><Bell className="h-4 w-4" />Reminders</TabsTrigger>
            <TabsTrigger value="admin" className="gap-2 rounded-md"><Layers3 className="h-4 w-4" />Admin</TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="space-y-4">
            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                  <div className="relative xl:col-span-2">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      value={filters.search}
                      onChange={(event) => updateFilter("search", event.target.value)}
                      placeholder="Search title, description, tag"
                      className="pl-9"
                    />
                  </div>
                  <Select value={filters.status} onValueChange={(value) => updateFilter("status", value as TaskFilters["status"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="todo">Todo</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.priority} onValueChange={(value) => updateFilter("priority", value as TaskFilters["priority"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All priorities</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.departmentId} onValueChange={(value) => updateFilter("departmentId", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.type} onValueChange={(value) => updateFilter("type", value as TaskFilters["type"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="user">User tasks</SelectItem>
                      <SelectItem value="department">Department tasks</SelectItem>
                      <SelectItem value="system">System tasks</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.dateView} onValueChange={(value) => updateFilter("dateView", value as TaskFilters["dateView"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dates</SelectItem>
                      <SelectItem value="today">Due today</SelectItem>
                      <SelectItem value="week">Due this week</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {filteredTasks.length === 0 && (
                  <Card className="rounded-lg border-dashed border-slate-300">
                    <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
                      <Filter className="h-8 w-8 text-slate-400" />
                      <p className="font-semibold text-slate-800">No tasks match this view</p>
                      <p className="text-sm text-slate-500">Clear a filter or switch user context.</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card className="h-fit rounded-lg border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">My Access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{activeUser.name}</p>
                    <p className="text-sm text-slate-500">{activeUser.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeUser.departmentIds.map((departmentId) => (
                      <Badge key={departmentId} variant="outline" className="rounded-md">
                        {getDepartment(departmentId).name}
                      </Badge>
                    ))}
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    {activeUser.jobLevels.map((level) => (
                      <div key={level} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span>{level}</span>
                        <Badge className="rounded-md bg-white text-slate-600 hover:bg-white">job level</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="departments" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {departmentWorkload.map((department) => (
              <Card key={department.id} className="rounded-lg border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <span className={cn("h-10 w-2 rounded-full", department.color)} />
                    <div>
                      <p className="font-semibold text-slate-950">{department.name}</p>
                      <p className="text-sm text-slate-500">{department.openTasks} open tasks</p>
                    </div>
                  </div>
                  <Progress className="mt-4 h-2" value={(department.openTasks / Math.max(department.totalTasks, 1)) * 100} />
                  <div className="mt-4 space-y-2">
                    {department.jobLevels.map((level) => (
                      <div key={level} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{level}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="recurring" className="space-y-4">
            <Card className="rounded-lg border-blue-200 bg-blue-50 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 text-blue-700" />
                  <div>
                    <p className="font-semibold text-blue-950">Recurring generation queue</p>
                    <p className="text-sm text-blue-700">{dueTemplates.length} templates are due for the background generator.</p>
                  </div>
                </div>
                <Button variant="outline" className="gap-2 bg-white">
                  <RefreshCw className="h-4 w-4" />
                  Run generator
                </Button>
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-3">
              {recurringTemplates.map((template) => (
                <Card key={template.id} className="rounded-lg border-slate-200 shadow-sm">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{template.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{template.description}</p>
                      </div>
                      <Badge className="rounded-md bg-slate-100 text-slate-700 hover:bg-slate-100">{template.frequency}</Badge>
                    </div>
                    <Separator />
                    <div className="grid gap-2 text-sm text-slate-600">
                      <p><span className="font-medium text-slate-900">Department:</span> {getDepartment(template.departmentId).name}</p>
                      <p><span className="font-medium text-slate-900">Assigned:</span> {getUserName(template.assignedToUserId)}</p>
                      <p><span className="font-medium text-slate-900">Next run:</span> {format(new Date(template.nextRunAt), "dd MMM yyyy, p")}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="reminders" className="space-y-3">
            {reminders.map((reminder) => {
              const task = tasks.find((item) => item.id === reminder.taskId)
              return (
                <Card key={reminder.id} className="rounded-lg border-slate-200 shadow-sm">
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <CalendarClock className="mt-0.5 h-5 w-5 text-slate-500" />
                      <div>
                        <p className="font-semibold text-slate-950">{task?.title ?? "Unknown task"}</p>
                        <p className="text-sm text-slate-500">{format(new Date(reminder.remindAt), "dd MMM yyyy, p")}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reminder.channels.map((channel) => (
                        <Badge key={channel} variant="outline" className="rounded-md">{channel.replace("_", " ")}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>

          <TabsContent value="admin" className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-lg border-slate-200 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Admin Oversight</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {users.map((user) => {
                  const userTasks = tasks.filter((task) => task.assignedToUserId === user.id)
                  const userOverdue = userTasks.filter(isOverdue).length
                  return (
                    <div key={user.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_120px_120px] md:items-center">
                      <div>
                        <p className="font-semibold text-slate-900">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.departmentIds.map((id) => getDepartment(id).name).join(", ")}</p>
                      </div>
                      <Badge variant="outline" className="w-fit rounded-md">{userTasks.length} assigned</Badge>
                      <Badge className={cn("w-fit rounded-md", userOverdue ? "bg-red-50 text-red-700 hover:bg-red-50" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50")}>
                        {userOverdue} overdue
                      </Badge>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
            <Card className="rounded-lg border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Production Hooks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>FCM push delivery is modelled as a reminder channel and should connect to the existing Firebase clients.</p>
                <p>Email and WhatsApp can be added as delivery adapters behind the same reminder job.</p>
                <p>Admin-only template controls should write to recurring templates and audit all generated task instances.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
