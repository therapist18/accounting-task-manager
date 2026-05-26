// @ts-nocheck
"use client"

import { useMemo } from "react"
import {
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  BarChart2,
  RefreshCw,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DEPT_COLOR_MAP, DEPT_HEADER_COLOR } from "../constants"
import { StatusBadge, PriorityBadge } from "./StatusBadge"
import type { BTask, BUser, BDepartment, BRecurringTemplate } from "../types"

interface AdminViewProps {
  tasks: BTask[]
  users: BUser[]
  departments: BDepartment[]
  templates: BRecurringTemplate[]
}

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-7 text-right">{pct}%</span>
    </div>
  )
}

export function AdminView({ tasks, users, departments, templates }: AdminViewProps) {
  const today = new Date().toISOString().split("T")[0]

  const globalStats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter(t => t.status === "done").length
    const inProgress = tasks.filter(t => t.status === "in_progress").length
    const overdue = tasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, inProgress, overdue, completionRate }
  }, [tasks, today])

  const userStats = useMemo(() =>
    users
      .map(user => {
        const userTasks = tasks.filter(t => t.assignedToUserId === user.id || t.createdByUserId === user.id)
        const done = userTasks.filter(t => t.status === "done").length
        const inProgress = userTasks.filter(t => t.status === "in_progress").length
        const overdue = userTasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length
        return { user, total: userTasks.length, done, inProgress, overdue }
      })
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total)
  , [tasks, users, today])

  const deptStats = useMemo(() =>
    departments.map(dept => {
      const deptTasks = tasks.filter(t => t.departmentId === dept.id)
      const done = deptTasks.filter(t => t.status === "done").length
      const overdue = deptTasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length
      return { dept, total: deptTasks.length, done, overdue }
    }).filter(s => s.total > 0)
  , [tasks, departments, today])

  const overdueTasks = useMemo(() =>
    tasks
      .filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  , [tasks, today])

  const maxDeptTasks = Math.max(...deptStats.map(s => s.total), 1)

  return (
    <div className="space-y-6">
      {/* Global stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Tasks", value: globalStats.total, icon: BarChart2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "In Progress", value: globalStats.inProgress, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Completed", value: globalStats.done, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
          { label: "Overdue", value: globalStats.overdue, icon: AlertCircle, color: globalStats.overdue > 0 ? "text-red-600" : "text-slate-400", bg: globalStats.overdue > 0 ? "bg-red-50" : "bg-slate-50" },
          { label: "Completion", value: `${globalStats.completionRate}%`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", card.bg)}>
              <card.icon className={cn("w-4 h-4", card.color)} />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department workload bars */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            Department Workload
          </h3>
          <div className="space-y-4">
            {deptStats.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">No data</p>
            )}
            {deptStats.map(({ dept, total, done, overdue }) => (
              <div key={dept.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", DEPT_COLOR_MAP[dept.id])}>
                    {dept.name}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{total} tasks</span>
                    {overdue > 0 && (
                      <span className="text-red-600 font-semibold">{overdue} overdue</span>
                    )}
                  </div>
                </div>
                <ProgressBar
                  value={total}
                  max={maxDeptTasks}
                  className={
                    dept.id === "immigration" ? "bg-blue-400" :
                    dept.id === "payroll" ? "bg-green-400" :
                    dept.id === "banking" ? "bg-purple-400" :
                    dept.id === "kra" ? "bg-orange-400" :
                    dept.id === "hr" ? "bg-pink-400" : "bg-slate-400"
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* User task loads */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            User Task Load
          </h3>
          <div className="space-y-3">
            {userStats.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">No data</p>
            )}
            {userStats.map(({ user, total, done, inProgress, overdue }) => (
              <div key={user.id} className="flex items-center gap-3">
                <span
                  className={cn("w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0", user.avatarColor)}
                  title={user.name}
                >
                  {user.avatarInitials}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{user.name}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0 ml-2">
                      <span className="text-blue-600">{inProgress} active</span>
                      {overdue > 0 && <span className="text-red-600 font-semibold">{overdue} overdue</span>}
                      <span>{done}/{total} done</span>
                    </div>
                  </div>
                  <ProgressBar
                    value={done}
                    max={total}
                    className={overdue > 0 ? "bg-amber-400" : done === total ? "bg-green-400" : "bg-blue-400"}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue tasks tracker */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          Overdue Tasks
          {overdueTasks.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
              {overdueTasks.length}
            </span>
          )}
        </h3>

        {overdueTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <CheckCircle2 className="w-8 h-8 mb-2 text-green-400" />
            <p className="text-sm">No overdue tasks — great work!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdueTasks.map(task => {
              const assignee = users.find(u => u.id === task.assignedToUserId)
              const dept = departments.find(d => d.id === task.departmentId)
              const daysOverdue = Math.floor((new Date().getTime() - new Date(task.dueDate + "T00:00:00").getTime()) / 86400000)
              return (
                <div key={task.id} className="flex items-center gap-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {dept && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", DEPT_COLOR_MAP[task.departmentId])}>
                          {dept.name}
                        </span>
                      )}
                      <PriorityBadge priority={task.priority} className="text-[10px] px-1.5" />
                      {assignee && (
                        <span className="text-[10px] text-slate-400">→ {assignee.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-red-600">
                      {daysOverdue === 1 ? "1 day" : `${daysOverdue} days`} late
                    </p>
                    <p className="text-[10px] text-slate-400">Due {task.dueDate}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recurring templates summary */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-blue-500" />
          Recurring Templates Summary
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{templates.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Total Templates</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
            <p className="text-2xl font-bold text-green-700">{templates.filter(t => t.active).length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Active</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {templates.reduce((sum, t) => sum + t.defaultReminderOffsetsMinutes.length, 0)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Reminders Configured</p>
          </div>
        </div>
      </div>
    </div>
  )
}
