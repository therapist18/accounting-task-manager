// @ts-nocheck
import { CheckCircle2, AlertCircle, Clock, TrendingUp, ListTodo, Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BTaskStats } from "../types"

interface TaskStatsProps {
  stats: BTaskStats
}

export function TaskStats({ stats }: TaskStatsProps) {
  const cards = [
    {
      label: "My Tasks",
      value: stats.total,
      sub: `${stats.inProgress} in progress`,
      icon: ListTodo,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      sub: stats.overdue === 0 ? "All on track" : "Need attention",
      icon: AlertCircle,
      color: stats.overdue > 0 ? "text-red-600" : "text-green-600",
      bg: stats.overdue > 0 ? "bg-red-50" : "bg-green-50",
      border: stats.overdue > 0 ? "border-red-100" : "border-green-100",
    },
    {
      label: "Pending Reminders",
      value: stats.pendingReminders,
      sub: "Undelivered",
      icon: Bell,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
    },
    {
      label: "Completion Rate",
      value: `${stats.completionRate}%`,
      sub: `${stats.done} of ${stats.total} done`,
      icon: stats.completionRate >= 70 ? TrendingUp : Clock,
      color: stats.completionRate >= 70 ? "text-green-600" : "text-slate-500",
      bg: stats.completionRate >= 70 ? "bg-green-50" : "bg-slate-50",
      border: stats.completionRate >= 70 ? "border-green-100" : "border-slate-100",
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div
          key={card.label}
          className={cn(
            "rounded-xl border p-4 flex items-start gap-3 bg-white dark:bg-slate-900 dark:border-slate-800",
            "shadow-sm hover:shadow-md transition-shadow"
          )}
        >
          <div className={cn("rounded-lg p-2.5 shrink-0", card.bg, "dark:bg-opacity-20")}>
            <card.icon className={cn("w-5 h-5", card.color)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{card.value}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
