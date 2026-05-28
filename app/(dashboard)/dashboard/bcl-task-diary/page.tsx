// @ts-nocheck
"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  Plus, RefreshCw, ListTodo, Building2, RepeatIcon,
  Bell, ShieldCheck, FileText, Loader2, LayoutGrid, Table2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

import { TaskStats } from "./components/TaskStats"
import { TaskFilters } from "./components/TaskFilters"
import { TaskCard } from "./components/TaskCard"
import { TaskTable } from "./components/TaskTable"
import { TaskForm } from "./components/TaskForm"
import { DepartmentView } from "./components/DepartmentView"
import { RecurringTemplates } from "./components/RecurringTemplates"
import { RemindersView } from "./components/RemindersView"
import { AdminView } from "./components/AdminView"

import { DEPT_COLOR_MAP } from "./constants"
import {
  fetchDiaryDepartments,
  fetchDiaryUsers,
  fetchRecurringTemplates,
  fetchReminders,
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

const PAGE_SIZE = 20

function applyDeptColors(depts: BDepartment[]): BDepartment[] {
  return depts.map(d => {
    const key = d.name.toLowerCase().replace(/\s+/g, "")
    return { ...d, color: key, bgColor: DEPT_COLOR_MAP[key] ?? "bg-slate-100 text-slate-700 border-slate-200" }
  })
}

export default function BCLTaskDiaryPage() {
  // ── Session ────────────────────────────────────────────────────────────────
  const [sessionUser, setSessionUser] = useState<any>(null)

  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(json => { if (json.authenticated) setSessionUser(json.user) })
      .catch(() => {})
  }, [])

  // ── Data state ─────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<BDepartment[]>([])
  const [allUsers, setAllUsers] = useState<BUser[]>([])
  const [tasks, setTasks] = useState<BTask[]>([])
  const [templates, setTemplates] = useState<BRecurringTemplate[]>([])
  const [reminders, setReminders] = useState<BReminder[]>([])
  const [rawUserData, setRawUserData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<BTaskFilters>(DEFAULT_FILTERS)
  const [activeTab, setActiveTab] = useState("my-tasks")
  const [isCreating, setIsCreating] = useState(false)
  const [editingTask, setEditingTask] = useState<BTask | null>(null)
  const [viewMode, setViewMode] = useState<"cards" | "table">("table")
  const [page, setPage] = useState(1)

  // ── Derived auth ───────────────────────────────────────────────────────────
  const isAdmin = useMemo(() =>
    sessionUser?.isSuperAdmin ||
    (sessionUser?.permissions ?? []).includes("bcl_task_diary.admin.view"),
    [sessionUser]
  )

  const currentUser = useMemo(() =>
    allUsers.find(u => u.id === sessionUser?.id) ?? null,
    [allUsers, sessionUser]
  )

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!sessionUser) return
    setLoading(true)
    setError(null)
    try {
      const [deptsRaw, usersResult] = await Promise.all([
        fetchDiaryDepartments(),
        fetchDiaryUsers(),
      ])

      setDepartments(applyDeptColors(deptsRaw))
      setAllUsers(usersResult.allUsers)
      setRawUserData(usersResult.raw)

      const userId = sessionUser.id

      const tasksRes = await fetch("/api/bcl-diary/tasks")
      const tasksJson = tasksRes.ok ? await tasksRes.json() : { tasks: [] }

      const [templatesData, remindersData] = await Promise.all([
        fetchRecurringTemplates(undefined, userId, isAdmin),
        fetchReminders(isAdmin ? undefined : userId),
      ])

      const tasksData = tasksJson.tasks ?? []

      setTasks(tasksData)
      setTemplates(templatesData)
      setReminders(remindersData)
    } catch (err: any) {
      console.error("BCL Task Diary load error:", err)
      setError("Failed to load data. Please refresh.")
    } finally {
      setLoading(false)
    }
  }, [sessionUser, isAdmin])

  useEffect(() => { loadData() }, [loadData])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [filters])

  // ── Derived data ───────────────────────────────────────────────────────────
  const today = useMemo(() => new Date().toISOString().split("T")[0], [])
  const weekEnd = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 7)
    return d.toISOString().split("T")[0]
  }, [])

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const q = filters.search.toLowerCase()
      if (q && !task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q)) return false
      if (filters.status !== "all" && task.status !== filters.status) return false
      if (filters.priority !== "all" && task.priority !== filters.priority) return false
      if (filters.departmentId !== "all" && task.departmentId !== filters.departmentId) return false
      if (filters.type !== "all" && task.type !== filters.type) return false
      if (filters.dateView === "today" && task.dueDate !== today) return false
      if (filters.dateView === "week" && (task.dueDate < today || task.dueDate > weekEnd)) return false
      if (filters.dateView === "overdue" && (task.dueDate >= today || task.status === "done" || task.status === "cancelled")) return false
      if (filters.userId !== "all") {
        const uid = filters.userId
        if (
          task.assignedToUserId !== uid &&
          task.createdByUserId !== uid &&
          !(task.assignedToUserIds ?? []).includes(uid) &&
          !(task.collaboratorIds ?? []).includes(uid)
        ) return false
      }
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
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: newStatus, updatedAt: new Date().toISOString(), completedAt: newStatus === "done" ? new Date().toISOString() : t.completedAt }
        : t
    ))
    try {
      const res = await fetch(`/api/bcl-diary/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error("status update failed")
    } catch {
      await loadData()
    }
  }

  async function handleCreate(taskData: Omit<BTask, "id" | "createdAt" | "updatedAt">) {
    try {
      const res = await fetch("/api/bcl-diary/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskData),
      })
      if (!res.ok) throw new Error("create failed")
      const { task } = await res.json()
      setTasks(prev => [task, ...prev])
      setIsCreating(false)
    } catch (err) {
      console.error("Create task error:", err)
    }
  }

  async function handleUpdate(taskId: string, updates: Partial<BTask>) {
    try {
      const res = await fetch(`/api/bcl-diary/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("update failed")
      const { task } = await res.json()
      setTasks(prev => prev.map(t => t.id === taskId ? task : t))
      setEditingTask(null)
    } catch (err) {
      console.error("Update task error:", err)
    }
  }

  async function handleDelete(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    try {
      const res = await fetch(`/api/bcl-diary/tasks/${taskId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("delete failed")
    } catch {
      await loadData()
    }
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading || !sessionUser) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Loading task diary…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-slate-400 max-w-sm text-center">
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
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
        <Plus className="w-3.5 h-3.5" /> Create Task
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 -m-4 md:-m-6">
      {/* Page header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow">
              <FileText className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">BCL Task Diary</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAdmin ? `${tasks.length} tasks · ${allUsers.length} users` : `${tasks.length} tasks assigned to you`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-white shadow text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                title="Table view"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "cards" ? "bg-white shadow text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex" onClick={loadData}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <Button
              onClick={() => setIsCreating(true)}
              size="sm"
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow"
            >
              <Plus className="w-4 h-4" /> New Task
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-4 w-full">
          <TaskStats stats={stats} />

          <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1) }} className="space-y-4">
            <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 h-auto rounded-xl">
              <TabsTrigger
                value="my-tasks"
                className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
              >
                <ListTodo className="w-3.5 h-3.5" />
                {isAdmin ? "All Tasks" : "My Tasks"}
                {stats.total > 0 && (
                  <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4">{stats.total}</Badge>
                )}
              </TabsTrigger>

              <TabsTrigger
                value="departments"
                className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
              >
                <Building2 className="w-3.5 h-3.5" /> Departments
              </TabsTrigger>

              <TabsTrigger
                value="recurring"
                className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
              >
                <RepeatIcon className="w-3.5 h-3.5" /> Recurring
                {templates.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] h-4">{templates.length}</Badge>
                )}
              </TabsTrigger>

              <TabsTrigger
                value="reminders"
                className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
              >
                <Bell className="w-3.5 h-3.5" /> Reminders
                {pendingReminderCount > 0 && (
                  <Badge className="ml-0.5 px-1.5 py-0 text-[10px] h-4 bg-amber-500 hover:bg-amber-500">{pendingReminderCount}</Badge>
                )}
              </TabsTrigger>

              {isAdmin && (
                <TabsTrigger
                  value="admin"
                  className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Admin
                  {overdueCount > 0 && (
                    <Badge className="ml-0.5 px-1.5 py-0 text-[10px] h-4 bg-red-500 hover:bg-red-500">{overdueCount}</Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {/* ── My / All Tasks ─────────────────────────────────────────────── */}
            <TabsContent value="my-tasks" className="mt-0 space-y-3">
              <TaskFilters
                filters={filters}
                onFiltersChange={setFilters}
                departments={departments}
                users={allUsers}
                showUserFilter={isAdmin}
              />

              {filteredTasks.length === 0 ? emptyState : viewMode === "table" ? (
                <TaskTable
                  tasks={filteredTasks}
                  users={allUsers}
                  departments={departments}
                  page={page}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  onStatusChange={handleStatusChange}
                  onEdit={setEditingTask}
                  onDelete={handleDelete}
                />
              ) : (
                <>
                  <div className="space-y-3">
                    {(["in_progress", "todo", "done", "cancelled"] as const).map(status => {
                      const group = filteredTasks.filter(t => t.status === status)
                      const paged = group.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                      if (group.length === 0) return null
                      const groupLabels = { in_progress: "In Progress", todo: "To Do", done: "Completed", cancelled: "Cancelled" }
                      return (
                        <div key={status}>
                          <div className="flex items-center gap-2 py-2 px-1">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{groupLabels[status]}</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{group.length}</span>
                            <div className="flex-1 h-px bg-slate-100" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {paged.map(task => (
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
                  {/* Card view pagination */}
                  {filteredTasks.length > PAGE_SIZE && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                      <span className="text-xs text-slate-500">Page {page} of {Math.ceil(filteredTasks.length / PAGE_SIZE)}</span>
                      <Button variant="outline" size="sm" disabled={page >= Math.ceil(filteredTasks.length / PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>Next</Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Departments ───────────────────────────────────────────────── */}
            <TabsContent value="departments" className="mt-0">
              <DepartmentView tasks={tasks} departments={departments} users={allUsers} />
            </TabsContent>

            {/* ── Recurring ─────────────────────────────────────────────────── */}
            <TabsContent value="recurring" className="mt-0">
              <RecurringTemplates templates={templates} departments={departments} users={allUsers} />
            </TabsContent>

            {/* ── Reminders ─────────────────────────────────────────────────── */}
            <TabsContent value="reminders" className="mt-0">
              <RemindersView reminders={reminders} tasks={tasks} />
            </TabsContent>

            {/* ── Admin ─────────────────────────────────────────────────────── */}
            {isAdmin && (
              <TabsContent value="admin" className="mt-0">
                <AdminView tasks={tasks} users={allUsers} departments={departments} templates={templates} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Task create / edit dialog */}
      <TaskForm
        open={isCreating || !!editingTask}
        task={editingTask}
        users={allUsers}
        departments={departments}
        currentUserId={currentUser?.id ?? sessionUser?.id ?? ""}
        isAdmin={isAdmin}
        onClose={() => { setIsCreating(false); setEditingTask(null) }}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />
    </div>
  )
}
