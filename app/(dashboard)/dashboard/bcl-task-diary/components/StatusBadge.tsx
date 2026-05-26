// @ts-nocheck
import { cn } from "@/lib/utils"
import { STATUS_STYLES, PRIORITY_STYLES, PRIORITY_DOT } from "../constants"
import type { BTaskStatus, BTaskPriority } from "../types"

const STATUS_LABELS: Record<BTaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
}

const PRIORITY_LABELS: Record<BTaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

export function StatusBadge({ status, className }: { status: BTaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        STATUS_STYLES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority, className }: { priority: BTaskPriority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        PRIORITY_STYLES[priority],
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[priority])} />
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

export function TypeBadge({ type, className }: { type: "personal" | "department" | "system"; className?: string }) {
  const styles = {
    personal: "bg-violet-50 text-violet-700 border-violet-200",
    department: "bg-blue-50 text-blue-700 border-blue-200",
    system: "bg-amber-50 text-amber-700 border-amber-200",
  }
  const labels = {
    personal: "Personal",
    department: "Department",
    system: "System",
  }
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", styles[type], className)}>
      {labels[type]}
    </span>
  )
}
