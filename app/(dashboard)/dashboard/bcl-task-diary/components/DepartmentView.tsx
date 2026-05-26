// @ts-nocheck
"use client"

import { useMemo } from "react"
import { Building2, CheckCircle2, Clock, AlertCircle, ListTodo } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEPT_HEADER_COLOR, DEPT_COLOR_MAP } from "../constants"
import type { BTask, BDepartment, BUser } from "../types"

interface DepartmentViewProps {
  tasks: BTask[]
  departments: BDepartment[]
  users: BUser[]
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", className)}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

export function DepartmentView({ tasks, departments, users }: DepartmentViewProps) {
  const today = new Date().toISOString().split("T")[0]

  const deptStats = useMemo(() =>
    departments.map(dept => {
      const deptTasks = tasks.filter(t => t.departmentId === dept.id)
      const done = deptTasks.filter(t => t.status === "done").length
      const inProgress = deptTasks.filter(t => t.status === "in_progress").length
      const todo = deptTasks.filter(t => t.status === "todo").length
      const overdue = deptTasks.filter(t => t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length
      const completion = deptTasks.length > 0 ? Math.round((done / deptTasks.length) * 100) : 0

      // Members assigned to this department
      const members = users.filter(u =>
        u.assignments.some(a => a.departmentId === dept.id)
      )

      const activeTasks = deptTasks.filter(t => t.status !== "done" && t.status !== "cancelled")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 3)

      return { dept, total: deptTasks.length, done, inProgress, todo, overdue, completion, members, activeTasks }
    })
    .filter(s => s.total > 0)
  , [tasks, departments, today])

  if (deptStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Building2 className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">No department tasks found.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {deptStats.map(({ dept, total, done, inProgress, todo, overdue, completion, members, activeTasks }) => (
        <div
          key={dept.id}
          className={cn(
            "bg-white dark:bg-slate-900 rounded-xl border-l-4 border border-slate-200 dark:border-slate-800 shadow-sm",
            "hover:shadow-md transition-shadow",
            DEPT_HEADER_COLOR[dept.id] || "border-l-slate-400 bg-slate-50"
          )}
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", DEPT_COLOR_MAP[dept.id])}>
                  {dept.name}
                </span>
              </div>
              <span className="text-xs text-slate-400">{total} task{total !== 1 ? "s" : ""}</span>
            </div>

            {/* Progress bar */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Progress</span>
                <span className="font-semibold">{completion}%</span>
              </div>
              <ProgressBar
                value={completion}
                className={
                  completion >= 80 ? "bg-green-500" :
                  completion >= 50 ? "bg-blue-500" :
                  completion >= 25 ? "bg-amber-500" : "bg-red-500"
                }
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-0 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            {[
              { icon: ListTodo, value: todo, label: "Todo", color: "text-slate-500" },
              { icon: Clock, value: inProgress, label: "Active", color: "text-blue-600" },
              { icon: CheckCircle2, value: done, label: "Done", color: "text-green-600" },
              { icon: AlertCircle, value: overdue, label: "Overdue", color: overdue > 0 ? "text-red-600" : "text-slate-300" },
            ].map(({ icon: Icon, value, label, color }) => (
              <div key={label} className="flex flex-col items-center">
                <Icon className={cn("w-4 h-4 mb-0.5", color)} />
                <span className={cn("text-base font-bold", color)}>{value}</span>
                <span className="text-[10px] text-slate-400">{label}</span>
              </div>
            ))}
          </div>

          {/* Active tasks preview */}
          {activeTasks.length > 0 && (
            <div className="px-5 py-3 space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active Tasks</p>
              {activeTasks.map(t => {
                const isOverdue = t.dueDate < today
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      t.priority === "urgent" ? "bg-red-500" :
                      t.priority === "high" ? "bg-orange-500" :
                      t.priority === "medium" ? "bg-yellow-500" : "bg-slate-300"
                    )} />
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{t.title}</span>
                    <span className={cn("text-[10px] shrink-0", isOverdue ? "text-red-500 font-semibold" : "text-slate-400")}>
                      {isOverdue ? "Overdue" : t.dueDate.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Members */}
          {members.length > 0 && (
            <div className="px-5 pb-4 pt-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-slate-400 mr-1">Team:</p>
                {members.slice(0, 5).map(u => (
                  <span
                    key={u.id}
                    title={u.name}
                    className={cn("w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 -ml-1 first:ml-0", u.avatarColor)}
                  >
                    {u.avatarInitials}
                  </span>
                ))}
                {members.length > 5 && (
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-[10px] font-bold flex items-center justify-center border-2 border-white text-slate-500 -ml-1">
                    +{members.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
