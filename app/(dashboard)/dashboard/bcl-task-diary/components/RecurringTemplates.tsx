// @ts-nocheck
"use client"

import { useState } from "react"
import { RefreshCw, Calendar, Tag, User, Power, Plus, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { DEPT_COLOR_MAP, PRIORITY_STYLES, PRIORITY_DOT } from "../constants"
import type { BRecurringTemplate, BDepartment, BUser } from "../types"

interface RecurringTemplatesProps {
  templates: BRecurringTemplate[]
  departments: BDepartment[]
  users: BUser[]
  onToggle?: (id: string, active: boolean) => void
  onAddNew?: () => void
}

const FREQ_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }
const FREQ_ICON_COLOR = { daily: "text-blue-500", weekly: "text-purple-500", monthly: "text-green-500" }

function offsetToLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${minutes / 60}h`
  return `${minutes / 1440}d`
}

function nextRunLabel(nextRunAt: string) {
  try {
    const d = new Date(nextRunAt)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    if (diffDays < 7) return `In ${diffDays} days`
    return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" })
  } catch {
    return nextRunAt.slice(0, 10)
  }
}

export function RecurringTemplates({ templates, departments, users, onToggle, onAddNew }: RecurringTemplatesProps) {
  const [localTemplates, setLocalTemplates] = useState(templates)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const active = localTemplates.filter(t => t.active).length
  const totalReminders = localTemplates.reduce((sum, t) => sum + t.defaultReminderOffsetsMinutes.length, 0)

  function toggle(id: string) {
    setLocalTemplates(prev => prev.map(t => t.id === id ? { ...t, active: !t.active } : t))
    const tmpl = localTemplates.find(t => t.id === id)
    if (tmpl) onToggle?.(id, !tmpl.active)
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <RefreshCw className="w-4 h-4 text-blue-500" />
            <span><strong>{localTemplates.length}</strong> templates</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-slate-600 dark:text-slate-300"><strong>{active}</strong> active</span>
          </div>
          <div className="text-sm text-slate-400">
            {totalReminders} reminder{totalReminders !== 1 ? "s" : ""} configured
          </div>
        </div>
        {onAddNew && (
          <Button onClick={onAddNew} size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5" />
            New Template
          </Button>
        )}
      </div>

      {/* Template cards */}
      <div className="space-y-3">
        {localTemplates.map(tmpl => {
          const dept = departments.find(d => d.id === tmpl.departmentId)
          const subdept = dept?.subdepartments.find(s => s.id === tmpl.subdepartmentId)
          const assignee = users.find(u => u.id === tmpl.assignedToUserId)
          const isExpanded = expandedId === tmpl.id

          return (
            <div
              key={tmpl.id}
              className={cn(
                "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-all shadow-sm",
                !tmpl.active && "opacity-55"
              )}
            >
              {/* Header row */}
              <div className="p-4 flex items-center gap-4">
                {/* Frequency badge */}
                <div className={cn(
                  "shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold",
                  tmpl.frequency === "daily" ? "bg-blue-50 text-blue-600" :
                  tmpl.frequency === "weekly" ? "bg-purple-50 text-purple-600" : "bg-green-50 text-green-600"
                )}>
                  <RefreshCw className={cn("w-4 h-4 mb-0.5", FREQ_ICON_COLOR[tmpl.frequency])} />
                  {tmpl.frequency.slice(0, 3).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{tmpl.title}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {dept && (
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", DEPT_COLOR_MAP[tmpl.departmentId])}>
                        {dept.name}{subdept ? ` · ${subdept.name}` : ""}
                      </span>
                    )}
                    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", PRIORITY_STYLES[tmpl.priority])}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[tmpl.priority])} />
                      {tmpl.priority}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Calendar className="w-3 h-3" />
                      Next: {nextRunLabel(tmpl.nextRunAt)}
                    </span>
                    {assignee && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <User className="w-3 h-3" />
                        {assignee.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={tmpl.active}
                    onCheckedChange={() => toggle(tmpl.id)}
                    aria-label={tmpl.active ? "Disable template" : "Enable template"}
                  />
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800 mt-0 space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 pt-3 leading-relaxed">{tmpl.description}</p>

                  {/* Reminders */}
                  {tmpl.defaultReminderOffsetsMinutes.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Reminders</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tmpl.defaultReminderOffsetsMinutes.map(offset => (
                          <Badge key={offset} variant="outline" className="text-xs px-2">
                            {offsetToLabel(offset)} before
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {tmpl.tags.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      <div className="flex flex-wrap gap-1">
                        {tmpl.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Schedule detail */}
                  <p className="text-[10px] text-slate-400">
                    Frequency: <strong className="text-slate-600 dark:text-slate-300">{FREQ_LABEL[tmpl.frequency]}</strong>
                    {tmpl.dayOfMonth && <> · Day <strong>{tmpl.dayOfMonth}</strong> of month</>}
                    {tmpl.dayOfWeek !== null && tmpl.dayOfWeek !== undefined && (
                      <> · Every {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][tmpl.dayOfWeek]}</>
                    )}
                    {" "}· Started {tmpl.startDate}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {localTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No recurring templates yet.</p>
          {onAddNew && (
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onAddNew}>
              <Plus className="w-3.5 h-3.5" /> Create first template
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
