// @ts-nocheck
"use client"

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2,
  CheckCircle2, Clock, XCircle, Circle, Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BTask, BUser } from "../types"

const STATUS_CFG = {
  todo:        { label: "To Do",      cls: "bg-slate-100 text-slate-700",   Icon: Circle },
  in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-700",   Icon: Clock },
  done:        { label: "Done",        cls: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
  cancelled:   { label: "Cancelled",   cls: "bg-red-100 text-red-700",      Icon: XCircle },
}

const PRIORITY_CFG = {
  low:    { label: "Low",    cls: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", cls: "bg-amber-100 text-amber-700" },
  high:   { label: "High",   cls: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", cls: "bg-red-100 text-red-700" },
}

interface TaskTableProps {
  tasks: BTask[]
  users: BUser[]
  departments: any[]
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onStatusChange: (taskId: string, status: BTask["status"]) => void
  onEdit: (task: BTask) => void
  onDelete: (taskId: string) => void
}

export function TaskTable({
  tasks, users, page, pageSize,
  onPageChange, onStatusChange, onEdit, onDelete,
}: TaskTableProps) {
  const today = new Date().toISOString().split("T")[0]
  const total = tasks.length
  const totalPages = Math.ceil(total / pageSize)
  const paged = tasks.slice((page - 1) * pageSize, page * pageSize)

  function getUser(id?: string | null) { return users.find(u => u.id === id) }

  function dueCls(dueDate: string, status: string) {
    if (status === "done" || status === "cancelled") return "text-slate-400 line-through"
    if (dueDate < today) return "text-red-600 font-semibold"
    if (dueDate === today) return "text-amber-600 font-semibold"
    return "text-slate-600"
  }

  function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  }

  // Page numbers to show (up to 5 around current)
  function pageNumbers() {
    const pages: number[] = []
    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
    for (let i = start; i <= Math.min(start + 4, totalPages); i++) pages.push(i)
    return pages
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
      <div className="overflow-x-auto flex-1">
        <Table>
          <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
            <TableRow className="hover:bg-slate-50/80">
              <TableHead className="w-[38%] font-semibold text-slate-700 py-3">Task</TableHead>
              <TableHead className="font-semibold text-slate-700 py-3">Status</TableHead>
              <TableHead className="font-semibold text-slate-700 py-3">Priority</TableHead>
              <TableHead className="font-semibold text-slate-700 py-3">Assignee(s)</TableHead>
              <TableHead className="font-semibold text-slate-700 py-3">Due Date</TableHead>
              <TableHead className="text-right font-semibold text-slate-700 py-3 pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-36 text-center text-slate-400 text-sm">
                  No tasks match your filters
                </TableCell>
              </TableRow>
            ) : paged.map(task => {
              const { cls, label, Icon } = STATUS_CFG[task.status]
              const priCfg = PRIORITY_CFG[task.priority]
              const primaryAssignee = getUser(task.assignedToUserId) ?? getUser(task.assignedToUserIds?.[0])
              const extraCount = (task.assignedToUserIds?.length ?? 0) > 1
                ? task.assignedToUserIds.length - 1
                : 0
              const collabCount = task.collaboratorIds?.length ?? 0

              return (
                <TableRow key={task.id} className="hover:bg-slate-50/40 transition-colors group">
                  {/* Task title + meta */}
                  <TableCell className="py-3">
                    <div className="space-y-0.5">
                      <p className="font-medium text-slate-900 leading-tight">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-slate-400 truncate max-w-xs">{task.description}</p>
                      )}
                      {task.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap pt-0.5">
                          {task.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium">
                              {tag}
                            </span>
                          ))}
                          {task.tags.length > 3 && (
                            <span className="text-[10px] text-slate-400">+{task.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="py-3">
                    <Badge className={cn("gap-1 shadow-none border-0 font-medium text-xs", cls)}>
                      <Icon className="w-3 h-3" />
                      {label}
                    </Badge>
                  </TableCell>

                  {/* Priority */}
                  <TableCell className="py-3">
                    <Badge className={cn("shadow-none border-0 font-medium text-xs", priCfg.cls)}>
                      {priCfg.label}
                    </Badge>
                  </TableCell>

                  {/* Assignee(s) */}
                  <TableCell className="py-3">
                    {primaryAssignee ? (
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0",
                          primaryAssignee.avatarColor
                        )}>
                          {primaryAssignee.avatarInitials}
                        </div>
                        <span className="text-sm text-slate-700 truncate max-w-[90px]">
                          {primaryAssignee.name.split(" ")[0]}
                        </span>
                        {(extraCount > 0 || collabCount > 0) && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Users className="w-3 h-3" />
                            +{extraCount + collabCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Unassigned</span>
                    )}
                  </TableCell>

                  {/* Due date */}
                  <TableCell className="py-3">
                    <span className={cn("text-sm", dueCls(task.dueDate, task.status))}>
                      {fmt(task.dueDate)}
                    </span>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="py-3 text-right pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onEdit(task)} className="gap-2 cursor-pointer">
                          <Pencil className="w-3.5 h-3.5" /> Edit Task
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {task.status !== "in_progress" && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "in_progress")} className="gap-2 cursor-pointer">
                            <Clock className="w-3.5 h-3.5 text-blue-500" /> Mark In Progress
                          </DropdownMenuItem>
                        )}
                        {task.status !== "done" && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "done")} className="gap-2 cursor-pointer">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Mark Done
                          </DropdownMenuItem>
                        )}
                        {task.status !== "todo" && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "todo")} className="gap-2 cursor-pointer">
                            <Circle className="w-3.5 h-3.5" /> Reset to To Do
                          </DropdownMenuItem>
                        )}
                        {task.status !== "cancelled" && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, "cancelled")} className="gap-2 cursor-pointer text-orange-600">
                            <XCircle className="w-3.5 h-3.5" /> Cancel
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(task.id)} className="gap-2 cursor-pointer text-red-600">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-xs text-slate-500">
            {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of{" "}
            <span className="font-semibold">{total}</span> tasks
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {pageNumbers().map(p => (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="sm"
                className={cn("h-7 w-7 p-0 text-xs", p === page && "bg-blue-600 hover:bg-blue-700")}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
