// @ts-nocheck
"use client"

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BTaskFilters, BDepartment, BUser } from "../types"

interface TaskFiltersProps {
  filters: BTaskFilters
  onFiltersChange: (f: BTaskFilters) => void
  departments: BDepartment[]
  users: BUser[]
  showUserFilter?: boolean
}

function patch(filters: BTaskFilters, key: keyof BTaskFilters, value: string): BTaskFilters {
  return { ...filters, [key]: value }
}

const hasActiveFilters = (f: BTaskFilters) =>
  f.search || f.status !== "all" || f.priority !== "all" || f.departmentId !== "all" ||
  f.userId !== "all" || f.type !== "all" || f.dateView !== "all"

export function TaskFilters({ filters, onFiltersChange, departments, users, showUserFilter = true }: TaskFiltersProps) {
  const reset = () =>
    onFiltersChange({ search: "", status: "all", priority: "all", departmentId: "all", userId: "all", type: "all", dateView: "all" })

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 mb-4">
      {/* Search + Reset row */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search tasks…"
            value={filters.search}
            onChange={e => onFiltersChange(patch(filters, "search", e.target.value))}
            className="pl-9 h-9"
          />
        </div>
        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-slate-500 hover:text-slate-700 shrink-0">
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter selects */}
      <div className="flex flex-wrap gap-2">
        <Select value={filters.dateView} onValueChange={v => onFiltersChange(patch(filters, "dateView", v))}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={v => onFiltersChange(patch(filters, "status", v))}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.priority} onValueChange={v => onFiltersChange(patch(filters, "priority", v))}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.type} onValueChange={v => onFiltersChange(patch(filters, "type", v))}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.departmentId} onValueChange={v => onFiltersChange(patch(filters, "departmentId", v))}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showUserFilter && (
          <Select value={filters.userId} onValueChange={v => onFiltersChange(patch(filters, "userId", v))}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
