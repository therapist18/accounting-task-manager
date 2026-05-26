// @ts-nocheck
"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  ShieldCheck,
  ArrowLeft,
  BarChart2,
  Users,
  AlertCircle,
  RefreshCw,
  Download,
  Filter,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { AdminView } from "../components/AdminView"
import { TaskCard } from "../components/TaskCard"
import { TaskFilters } from "../components/TaskFilters"
import {
  fetchDiaryDepartments,
  fetchDiaryUsers,
  fetchDiaryTasks,
  fetchRecurringTemplates,
  updateDiaryTask,
  deleteDiaryTask,
} from "../database"
import type { BTask, BTaskFilters, BDepartment, BUser, BRecurringTemplate } from "../types"

const DEFAULT_FILTERS: BTaskFilters = {
  search: "",
  status: "all",
  priority: "all",
  departmentId: "all",
  userId: "all",
  type: "all",
  dateView: "all",
}

export default function AdminDashboardPage() {
  const [tasks, setTasks] = useState<BTask[]>([])
  const [departments, setDepartments] = useState<BDepartment[]>([])
  const [allUsers, setAllUsers] = useState<BUser[]>([])
  const [templates, setTemplates] = useState<BRecurringTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<BTaskFilters>(DEFAULT_FILTERS)
  const [activeTab, setActiveTab] = useState("overview")

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [deptsRaw, usersResult] = await Promise.all([
        fetchDiaryDepartments(),
        fetchDiaryUsers(),
      ])
      setDepartments(deptsRaw)
      setAllUsers(usersResult.allUsers)

      const [tasksData, templatesData] = await Promise.all([
        fetchDiaryTasks("", true),
        fetchRecurringTemplates(),
      ])
      setTasks(tasksData)
      setTemplates(templatesData)
    } catch (err) {
      console.error("Admin load error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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

  async function handleStatusChange(taskId: string, newStatus: BTask["status"]) {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t
    ))
    try {
      await updateDiaryTask(taskId, { status: newStatus })
    } catch {
      await loadData()
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

  const overdue = tasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length
  const inProgress = tasks.filter(t => t.status === "in_progress").length
  const done = tasks.filter(t => t.status === "done").length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/bcl-task-diary">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Global task oversight across all users and departments
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 hidden md:flex">
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFilters(DEFAULT_FILTERS)}>
              <Filter className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-screen-2xl mx-auto w-full">
        {/* Quick stat strip */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "All Tasks", value: tasks.length, color: "border-l-blue-500" },
            { label: "In Progress", value: inProgress, color: "border-l-blue-400" },
            { label: "Completed", value: done, color: "border-l-green-500" },
            { label: "Overdue", value: overdue, color: overdue > 0 ? "border-l-red-500" : "border-l-green-400" },
          ].map(s => (
            <div
              key={s.label}
              className={cn(
                "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 px-4 py-3 shadow-sm",
                s.color
              )}
            >
              <p className={cn(
                "text-2xl font-bold",
                s.label === "Overdue" && overdue > 0 ? "text-red-600" : "text-slate-900 dark:text-white"
              )}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 h-auto rounded-xl">
            <TabsTrigger
              value="overview"
              className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="all-tasks"
              className="gap-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none"
            >
              <Users className="w-3.5 h-3.5" />
              All Tasks
            </TabsTrigger>
          </TabsList>

          {/* Overview tab */}
          <TabsContent value="overview" className="mt-0">
            <AdminView
              tasks={tasks}
              users={allUsers}
              departments={departments}
              templates={templates}
            />
          </TabsContent>

          {/* All Tasks tab */}
          <TabsContent value="all-tasks" className="mt-0 space-y-3">
            <TaskFilters
              filters={filters}
              onFiltersChange={setFilters}
              departments={departments}
              users={allUsers}
              showUserFilter
            />

            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-slate-500 font-medium">
                Showing <strong>{filteredTasks.length}</strong> of <strong>{tasks.length}</strong> tasks
              </p>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <AlertCircle className="w-10 h-10 mb-3 opacity-25" />
                <p className="text-sm">No tasks match the current filters</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    users={allUsers}
                    departments={departments}
                    onStatusChange={handleStatusChange}
                    onEdit={() => {}}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
