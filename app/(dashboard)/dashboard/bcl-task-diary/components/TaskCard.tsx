// @ts-nocheck
"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  Calendar,
  ChevronDown,
  Edit2,
  MoreHorizontal,
  Tag,
  Trash2,
  User,
  Building2,
  Bell,
  CheckCircle2,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { StatusBadge, PriorityBadge, TypeBadge } from "./StatusBadge"
import { DEPT_COLOR_MAP } from "../constants"
import type { BTask, BUser, BDepartment } from "../types"

interface TaskCardProps {
  task: BTask
  users: BUser[]
  departments: BDepartment[]
  onStatusChange: (taskId: string, status: BTask["status"]) => void
  onEdit: (task: BTask) => void
  onDelete: (taskId: string) => void
}

function UserAvatar({ userId, users }: { userId: string; users: BUser[] }) {
  const user = users.find(u => u.id === userId)
  if (!user) return null
  return (
    <span
      title={user.name}
      className={cn("w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center shrink-0", user.avatarColor)}
    >
      {user.avatarInitials}
    </span>
  )
}

const STATUS_FLOW: Record<BTask["status"], BTask["status"]> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  cancelled: "todo",
}

const NEXT_STATUS_LABEL: Record<BTask["status"], string> = {
  todo: "Start",
  in_progress: "Mark Done",
  done: "Reopen",
  cancelled: "Reopen",
}

export function TaskCard({ task, users, departments, onStatusChange, onEdit, onDelete }: TaskCardProps) {
  const [showDelete, setShowDelete] = useState(false)

  const dept = departments.find(d => d.id === task.departmentId)
  const subdept = dept?.subdepartments.find(s => s.id === task.subdepartmentId)
  const assignee = users.find(u => u.id === task.assignedToUserId)

  const today = new Date().toISOString().split("T")[0]
  const isOverdue = task.dueDate < today && task.status !== "done" && task.status !== "cancelled"
  const isDueToday = task.dueDate === today
  const isDone = task.status === "done"

  const dueLabel = (() => {
    try {
      return format(new Date(task.dueDate + "T00:00:00"), "dd MMM yyyy")
    } catch {
      return task.dueDate
    }
  })()

  return (
    <>
      <div
        className={cn(
          "group bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200",
          "hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800",
          isOverdue && "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20",
          isDone && "opacity-60",
          !isOverdue && !isDone && "border-slate-200 dark:border-slate-800"
        )}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Status toggle button */}
            <button
              onClick={() => onStatusChange(task.id, STATUS_FLOW[task.status])}
              className={cn(
                "mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 transition-all duration-200 flex items-center justify-center",
                task.status === "done"
                  ? "bg-green-500 border-green-500 text-white"
                  : task.status === "in_progress"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : task.status === "cancelled"
                  ? "border-red-400 bg-red-50 dark:bg-red-950"
                  : "border-slate-300 dark:border-slate-600 hover:border-blue-400"
              )}
              title={NEXT_STATUS_LABEL[task.status]}
            >
              {task.status === "done" && <CheckCircle2 className="w-3 h-3" />}
              {task.status === "in_progress" && <Clock className="w-3 h-3 text-blue-500" />}
            </button>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={cn(
                    "font-semibold text-sm text-slate-900 dark:text-white leading-snug",
                    isDone && "line-through text-slate-400 dark:text-slate-500"
                  )}
                >
                  {task.title}
                </h3>

                {/* Actions menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl">
                    <DropdownMenuLabel className="text-xs text-slate-500">Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onEdit(task)} className="gap-2 cursor-pointer">
                      <Edit2 className="w-3.5 h-3.5" /> Edit Task
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onStatusChange(task.id, STATUS_FLOW[task.status])}
                      className="gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {NEXT_STATUS_LABEL[task.status]}
                    </DropdownMenuItem>
                    {task.status !== "cancelled" && (
                      <DropdownMenuItem
                        onClick={() => onStatusChange(task.id, "cancelled")}
                        className="gap-2 cursor-pointer text-slate-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Cancel Task
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDelete(true)}
                      className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {task.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {task.description}
                </p>
              )}

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <TypeBadge type={task.type} />
                {dept && (
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", DEPT_COLOR_MAP[task.departmentId] || "bg-slate-100 text-slate-700")}>
                    <Building2 className="w-3 h-3" />
                    {dept.name}
                    {subdept && ` · ${subdept.name}`}
                  </span>
                )}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {/* Due date */}
                <span className={cn(
                  "flex items-center gap-1 text-xs",
                  isOverdue ? "text-red-600 font-semibold" : isDueToday ? "text-amber-600 font-semibold" : "text-slate-400"
                )}>
                  <Calendar className="w-3.5 h-3.5" />
                  {isOverdue ? `Overdue · ${dueLabel}` : isDueToday ? `Due today` : `Due ${dueLabel}`}
                </span>

                {/* Assignee */}
                {assignee && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <User className="w-3.5 h-3.5" />
                    {assignee.name}
                  </span>
                )}

                {/* Reminder count */}
                {task.reminderIds.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <Bell className="w-3.5 h-3.5" />
                    {task.reminderIds.length}
                  </span>
                )}

                {/* Tags */}
                {task.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="flex items-center gap-0.5 text-xs text-slate-400">
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
                {task.tags.length > 2 && (
                  <span className="text-xs text-slate-400">+{task.tags.length - 2} more</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick status bar at bottom */}
        <div className="px-4 pb-3">
          <div className="flex gap-1.5 justify-end">
            {(["todo", "in_progress", "done"] as const).map(s => (
              <button
                key={s}
                onClick={() => onStatusChange(task.id, s)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors opacity-0 group-hover:opacity-100",
                  task.status === s
                    ? "opacity-100 bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {s === "todo" ? "To Do" : s === "in_progress" ? "In Progress" : "Done"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{task.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(task.id); setShowDelete(false) }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
