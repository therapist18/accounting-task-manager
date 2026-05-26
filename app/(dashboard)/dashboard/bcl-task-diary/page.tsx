// @ts-nocheck
"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  Plus,
  RefreshCw,
  ListTodo,
  Building2,
  RepeatIcon,
  Bell,
  ShieldCheck,
  FileText,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

import { TaskStats } from "./components/TaskStats"
import { TaskFilters } from "./components/TaskFilters"
import { TaskCard } from "./components/TaskCard"
import { TaskForm } from "./components/TaskForm"
import { DepartmentView } from "./components/DepartmentView"
import { RecurringTemplates } from "./components/RecurringTemplates"
import { RemindersView } from "./components/RemindersView"
import { AdminView } from "./components/AdminView"

import { DEPT_COLOR_MAP } from "./constants"
import {
  fetchDiaryDepartments,
  fetchDiaryUsers,
  fetchDiaryTasks,
  fetchRecurringTemplates,
  fetchReminders,
  createDiaryTask,
  updateDiaryTask,
  deleteDiaryTask,
} from "./database"
import type { BTask, BTaskFilters, BTaskStats, BUser, BDepartment, BRecurringTemplate, BReminder } from "./types"

const DEFAULT_FILTERS: BTaskFilters = {
  search: "",
  status: "all",
  priority: "all",
  departmentId: "all",
  userId: "all",
  type: "all",
  dateView: "all",
}

// Apply colour metadata to real departments using DEPT_COLOR_MAP keyed by lowercased name
function applyDeptColors(depts: BDepartment[]): BDepartment[] {
  return depts.map(d => {
    const key = d.name.toLowerCase().replace(/\s+/g, "")
    const colorClass = DEPT_COLOR_MAP[key] ?? "bg-slate-100 text-slate-700 border-slate-200"
    return { ...d, color: key, bgColor: colorClass }
  })
}

export default function BCLTaskDiaryPage() {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<BDepartment[]>([])
  const [allUsers, setAllUsers] = useState<BUser[]>([])
  const [tasks, setTasks] = useState<BTask[]>([])
  const [templates, setTemplates] = useState<BRecurringTemplate[]>([])
  const [reminders, setReminders] = useState<BReminder[]>([])

  // Internal: keep FilteredUserData.raw for scoped dropdown filtering in TaskForm
  const [rawUserData, setRawUserData] = useState<any>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<BTaskFilters>(DEFAULT_FILTERS)
  const [activeTab, setActiveTab] = useState("my-tasks")
  const [isCreating, setIsCreating] = useState(false)
  const [editingTask, setEditingTask] = useState<BTask | null>(null)

  // Internal tool: all users are admins (can be narrowed once auth is wired)
  const isAdmin = true

  // First user in list acts as the "current user" for task authorship
  const currentUser = allUsers[0] ?? null

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [deptsRaw, usersResult] = await Promise.all([
        fetchDiaryDepartments(),
        fetchDiaryUsers(),
      ])

      const coloredDepts = applyDeptColors(deptsRaw)
      setDepartments(coloredDepts)
      setAllUsers(usersResult.allUsers)
      setRawUserData(usersResult.raw)

      // Tasks + templates + reminders fetched after we have departments
      const [tasksData, templatesData, remindersData] = await Promise.all([
        fetchDiaryTasks("", true),          // admin=true: fetch all tasks
        fetchRecurringTemplates(),
        fetchReminders(),
      ])

      setTasks(tasksData)
      setTemplates(templatesData)
      setReminders(remindersData)
    } catch (err: any) {
      console.error("BCL Task Diary load error:", err)
      setError("Failed to load data. Please refresh.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Derived data ───────────────────────────────────────────────────────────
  const today = useMemo(() => new Date().toISOString().split("T")[0], [])
  const weekEnd = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split("T")[0]
  }, [])

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const q = filters.search.toLowerCase()
      if (q && !task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q)) return false
      if (filters.status !== "all" && task.status !== filters.status) return false
      if (filters.priority !== "all" && task.priority !== filters.priority) return false
      if (filters.departmentId !== "all" && task.departmentId !== filters.departmentId) return false
      if (filters.userId !== "all" && task.assignedToUserId !== filters.userId && task.createdByUserId !== filters.userId) return false
      if (filters.type !== "all" && task.type !== filters.type) return false
      if (filters.dateView === "today" && task.dueDate !== today) return false
      if (filters.dateView === "week" && (task.dueDate < today || task.dueDate > weekEnd)) return false
      if (filters.dateView === "overdue" && (task.dueDate >= today || task.status === "done" || task.status === "cancelled")) return false
      return true
    })
  }, [tasks, filters, today, weekEnd])

  const stats = useMemo<BTaskStats>(() => {
    const done = tasks.filter(t => t.status === "done")
    return {
      total: tasks.length,
      todo: tasks.filter(t => t.status === "todo").length,
      inProgress: tasks.filter(t => t.status === "in_progress").length,
      done: done.length,
      overdue: tasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length,
      pendingReminders: reminders.filter(r => !r.deliveredAt).length,
      completionRate: tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0,
    }
  }, [tasks, reminders, today])

  const pendingReminderCount = reminders.filter(r => !r.deliveredAt).length
  const overdueCount = tasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleStatusChange(taskId: string, newStatus: BTask["status"]) {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: newStatus, updatedAt: new Date().toISOString(), completedAt: newStatus === "done" ? new Date().toISOString() : t.completedAt }
        : t
    ))
    try {
      await updateDiaryTask(taskId, { status: newStatus })
    } catch {
      // Roll back on error
      await loadData()
    }
  }

  async function handleCreate(taskData: Omit<BTask, "id" | "createdAt" | "updatedAt">) {
    try {
      const created = await createDiaryTask({
        ...taskData,
        createdByUserId: taskData.createdByUserId || currentUser?.id || "",
      })
      setTasks(prev => [created, ...prev])
      setIsCreating(false)
    } catch (err) {
      console.error("Create task error:", err)
    }
  }

  async function handleUpdate(taskId: string, updates: Partial<BTask>) {
    try {
      const updated = await updateDiaryTask(taskId, updates)
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
      setEditingTask(null)
    } catch (err) {
      console.error("Update task error:", err)
    }
  }

  async function handleDelete(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    try {
      await deleteDiaryTask(taskId)
    } catch {
      await loadData()
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Loading task diary…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400 max-w-sm text-center">
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <ListTodo className="w-12 h-12 mb-3 opacity-25" />
      <p className="text-sm font-medium">No tasks found</p>
      <p className="text-xs mt-1">Try adjusting your filters or create a new task</p>
      <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setIsCreating(true)}>
        <Plus className="w-3.5 h-3.5" />
        Create Task
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Page header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">BCL Task Diary</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tasks.length} tasks · {departments.length} departments
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 hidden sm:flex"
              onClick={loadData}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button
              onClick={() => setIsCreating(true)}
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow"
            >
              <Plus className="w-4 h-4" />
              New Task
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-screen-2xl mx-auto w-full">
        <TaskStats stats={stats} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 h-auto rounded-xl">
            <TabsTrigger
              value="my-tasks"
              className="gap-2 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            >
              <ListTodo className="w-3.5 h-3.5" />
              All Tasks
              {stats.total > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4">
                  {stats.total}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="departments"
              className="gap-2 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            >
              <Building2 className="w-3.5 h-3.5" />
              Departments
            </TabsTrigger>

            <TabsTrigger
              value="recurring"
              className="gap-2 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            >
              <RepeatIcon className="w-3.5 h-3.5" />
              Recurring
              {templates.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4">
                  {templates.length}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="reminders"
              className="gap-2 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            >
              <Bell className="w-3.5 h-3.5" />
              Reminders
              {pendingReminderCount > 0 && (
                <Badge className="ml-0.5 px-1.5 py-0 text-[10px] h-4 bg-amber-500 hover:bg-amber-500">
                  {pendingReminderCount}
                </Badge>
              )}
            </TabsTrigger>

            {isAdmin && (
              <TabsTrigger
                value="admin"
                className="gap-2 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
                {overdueCount > 0 && (
                  <Badge className="ml-0.5 px-1.5 py-0 text-[10px] h-4 bg-red-500 hover:bg-red-500">
                    {overdueCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* All Tasks tab */}
          <TabsContent value="my-tasks" className="mt-0 space-y-0">
            <TaskFilters
              filters={filters}
              onFiltersChange={setFilters}
              departments={departments}
              users={allUsers}
              showUserFilter={isAdmin}
            />
            {filteredTasks.length === 0 ? (
              emptyState
            ) : (
              <div className="space-y-3">
                {(["in_progress", "todo", "done", "cancelled"] as const).map(status => {
                  const group = filteredTasks.filter(t => t.status === status)
                  if (group.length === 0) return null
                  const groupLabels = {
                    in_progress: "In Progress",
                    todo: "To Do",
                    done: "Completed",
                    cancelled: "Cancelled",
                  }
                  return (
                    <div key={status}>
                      <div className="flex items-center gap-2 py-2 px-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          {groupLabels[status]}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
                          {group.length}
                        </span>
                        <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                      </div>
                      <div className="space-y-2">
                        {group.map(task => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            users={allUsers}
                            departments={departments}
                            onStatusChange={handleStatusChange}
                            onEdit={setEditingTask}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* Departments tab */}
          <TabsContent value="departments" className="mt-0">
            <DepartmentView tasks={tasks} departments={departments} users={allUsers} />
          </TabsContent>

          {/* Recurring tab */}
          <TabsContent value="recurring" className="mt-0">
            <RecurringTemplates templates={templates} departments={departments} users={allUsers} />
          </TabsContent>

          {/* Reminders tab */}
          <TabsContent value="reminders" className="mt-0">
            <RemindersView reminders={reminders} tasks={tasks} />
          </TabsContent>

          {/* Admin tab */}
          {isAdmin && (
            <TabsContent value="admin" className="mt-0">
              <AdminView tasks={tasks} users={allUsers} departments={departments} templates={templates} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Task create / edit dialog */}
      <TaskForm
        open={isCreating || !!editingTask}
        task={editingTask}
        users={allUsers}
        departments={departments}
        currentUserId={currentUser?.id ?? ""}
        onClose={() => { setIsCreating(false); setEditingTask(null) }}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />
    </div>
  )
}
