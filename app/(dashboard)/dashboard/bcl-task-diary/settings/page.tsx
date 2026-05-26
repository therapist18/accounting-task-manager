// @ts-nocheck
"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  RefreshCw,
  Calendar,
  ArrowLeft,
  Power,
  Building2,
  User,
  Bell,
  X,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  PRIORITY_STYLES,
  PRIORITY_DOT,
  DEPT_COLOR_MAP,
  REMINDER_PRESETS,
} from "../constants"
import {
  fetchDiaryDepartments,
  fetchDiaryUsers,
  fetchRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
} from "../database"
import type { BRecurringTemplate, BTaskPriority, BDepartment, BUser } from "../types"

const FREQ_STYLES = {
  daily: "bg-blue-100 text-blue-700 border-blue-200",
  weekly: "bg-purple-100 text-purple-700 border-purple-200",
  monthly: "bg-green-100 text-green-700 border-green-200",
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function nextRunLabel(nextRunAt: string) {
  try {
    const d = new Date(nextRunAt)
    return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return nextRunAt.slice(0, 10)
  }
}

function offsetToLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m before`
  if (minutes < 1440) return `${minutes / 60}h before`
  return `${minutes / 1440}d before`
}

const EMPTY_TEMPLATE: Partial<BRecurringTemplate> = {
  title: "",
  description: "",
  departmentId: "",
  subdepartmentId: null,
  classId: null,
  assignedToUserId: null,
  officerId: null,
  managerId: null,
  priority: "medium",
  frequency: "monthly",
  dayOfMonth: 1,
  dayOfWeek: null,
  startDate: new Date().toISOString().split("T")[0],
  active: true,
  defaultReminderOffsetsMinutes: [1440],
  tags: [],
}

export default function RecurringSettingsPage() {
  const [templates, setTemplates] = useState<BRecurringTemplate[]>([])
  const [departments, setDepartments] = useState<BDepartment[]>([])
  const [allUsers, setAllUsers] = useState<BUser[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<BRecurringTemplate | null>(null)
  const [form, setForm] = useState<Partial<BRecurringTemplate>>(EMPTY_TEMPLATE)
  const [tagInput, setTagInput] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [deptsRaw, usersResult, templatesData] = await Promise.all([
        fetchDiaryDepartments(),
        fetchDiaryUsers(),
        fetchRecurringTemplates(),
      ])
      setDepartments(deptsRaw)
      setAllUsers(usersResult.allUsers)
      setTemplates(templatesData)
    } catch (err) {
      console.error("Settings load error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const activeCount = templates.filter(t => t.active).length
  const totalReminders = templates.reduce((sum, t) => sum + t.defaultReminderOffsetsMinutes.length, 0)

  const selectedDept = departments.find(d => d.id === form.departmentId)
  const selectedSubdept = selectedDept?.subdepartments.find(s => s.id === form.subdepartmentId)

  // Build a dept-id → colour-key map using the lowercased dept name
  const deptColorKey = (deptId: string) => {
    const dept = departments.find(d => d.id === deptId)
    return dept ? dept.name.toLowerCase().replace(/\s+/g, "") : deptId
  }

  function openCreate() {
    setForm({ ...EMPTY_TEMPLATE })
    setEditingTemplate(null)
    setTagInput("")
    setErrors({})
    setShowForm(true)
  }

  function openEdit(tmpl: BRecurringTemplate) {
    setForm({ ...tmpl })
    setEditingTemplate(tmpl)
    setTagInput("")
    setErrors({})
    setShowForm(true)
  }

  async function toggleActive(id: string) {
    const tmpl = templates.find(t => t.id === id)
    if (!tmpl) return
    const newActive = !tmpl.active
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, active: newActive } : t))
    try {
      await updateRecurringTemplate(id, { active: newActive })
    } catch {
      await loadData()
    }
  }

  function set<K extends keyof BRecurringTemplate>(key: K, value: BRecurringTemplate[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: "" }))
  }

  function toggleReminder(value: number) {
    const current = form.defaultReminderOffsetsMinutes ?? []
    set("defaultReminderOffsetsMinutes",
      current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    )
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-")
    if (t && !(form.tags ?? []).includes(t)) set("tags", [...(form.tags ?? []), t])
    setTagInput("")
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.title?.trim()) errs.title = "Title is required"
    if (!form.departmentId) errs.departmentId = "Department is required"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const jobLevel = {
        level: (form.classId ? 3 : form.subdepartmentId ? 2 : 1) as 1 | 2 | 3,
        departmentId: form.departmentId!,
        subdepartmentId: form.subdepartmentId ?? null,
        classId: form.classId ?? null,
      }

      if (editingTemplate) {
        const updated = await updateRecurringTemplate(editingTemplate.id, { ...form, jobLevel })
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? updated : t))
      } else {
        const firstUserId = allUsers[0]?.id ?? ""
        const created = await createRecurringTemplate({
          ...(form as BRecurringTemplate),
          jobLevel,
          nextRunAt: new Date().toISOString(),
          createdByUserId: firstUserId,
        })
        setTemplates(prev => [created, ...prev])
      }
      setShowForm(false)
    } catch (err) {
      console.error("Save template error:", err)
    } finally {
      setSaving(false)
    }
  }

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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow">
              <RefreshCw className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Recurring Tasks</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure templates that auto-generate tasks on a schedule
              </p>
            </div>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow">
            <Plus className="w-4 h-4" />
            New Template
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-screen-xl mx-auto w-full space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Templates", value: templates.length, icon: RefreshCw, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Active", value: activeCount, icon: Power, color: "text-green-600", bg: "bg-green-50" },
            { label: "Reminders Configured", value: totalReminders, icon: Bell, color: "text-amber-600", bg: "bg-amber-50" },
          ].map(card => (
            <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", card.bg)}>
                <card.icon className={cn("w-5 h-5", card.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Template list */}
        <div className="space-y-3">
          {templates.map(tmpl => {
            const dept = departments.find(d => d.id === tmpl.departmentId)
            const subdept = dept?.subdepartments.find(s => s.id === tmpl.subdepartmentId)
            const assignee = allUsers.find(u => u.id === tmpl.assignedToUserId)

            return (
              <div
                key={tmpl.id}
                className={cn(
                  "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm",
                  "hover:shadow-md transition-all group",
                  !tmpl.active && "opacity-55"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Frequency indicator */}
                  <div className={cn(
                    "shrink-0 px-2 py-1 rounded-lg border text-xs font-bold",
                    FREQ_STYLES[tmpl.frequency]
                  )}>
                    {tmpl.frequency.toUpperCase()}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{tmpl.title}</h3>
                        {tmpl.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{tmpl.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={tmpl.active}
                          onCheckedChange={() => toggleActive(tmpl.id)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(tmpl)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs"
                        >
                          Edit
                        </Button>
                      </div>
                    </div>

                    {/* Meta badges */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {dept && (
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1", DEPT_COLOR_MAP[deptColorKey(tmpl.departmentId)] ?? "bg-slate-100 text-slate-700 border-slate-200")}>
                          <Building2 className="w-3 h-3" />
                          {dept.name}{subdept ? ` · ${subdept.name}` : ""}
                        </span>
                      )}
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1.5", PRIORITY_STYLES[tmpl.priority])}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[tmpl.priority])} />
                        {tmpl.priority}
                      </span>
                      {assignee && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <User className="w-3 h-3" />
                          {assignee.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />
                        Next: {nextRunLabel(tmpl.nextRunAt)}
                      </span>
                      {tmpl.dayOfMonth && (
                        <span className="text-xs text-slate-400">Day {tmpl.dayOfMonth} of month</span>
                      )}
                      {tmpl.dayOfWeek !== null && tmpl.dayOfWeek !== undefined && (
                        <span className="text-xs text-slate-400">Every {WEEKDAYS[tmpl.dayOfWeek]}</span>
                      )}
                    </div>

                    {/* Reminders */}
                    {tmpl.defaultReminderOffsetsMinutes.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <Bell className="w-3 h-3 text-amber-500 shrink-0" />
                        <div className="flex flex-wrap gap-1">
                          {tmpl.defaultReminderOffsetsMinutes.map(offset => (
                            <Badge key={offset} variant="outline" className="text-[10px] px-1.5 py-0">
                              {offsetToLabel(offset)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {tmpl.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tmpl.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="w-12 h-12 mb-3 opacity-25" />
              <p className="text-sm font-medium">No recurring templates yet</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" />
                Create First Template
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={v => !v && setShowForm(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Recurring Template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input
                value={form.title ?? ""}
                onChange={e => set("title", e.target.value)}
                placeholder="Template title…"
                className={errors.title ? "border-red-400" : ""}
              />
              {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={e => set("description", e.target.value)}
                placeholder="What this recurring task involves…"
                rows={2}
              />
            </div>

            {/* Frequency + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frequency <span className="text-red-500">*</span></Label>
                <Select value={form.frequency ?? "monthly"} onValueChange={v => set("frequency", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority ?? "medium"} onValueChange={v => set("priority", v as BTaskPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Schedule detail */}
            {form.frequency === "weekly" && (
              <div className="space-y-1.5">
                <Label>Day of Week</Label>
                <Select
                  value={form.dayOfWeek?.toString() ?? "1"}
                  onValueChange={v => set("dayOfWeek", parseInt(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day, i) => (
                      <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.frequency === "monthly" && (
              <div className="space-y-1.5">
                <Label>Day of Month</Label>
                <Select
                  value={form.dayOfMonth?.toString() ?? "1"}
                  onValueChange={v => set("dayOfMonth", parseInt(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <SelectItem key={d} value={d.toString()}>Day {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Department */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Department <span className="text-red-500">*</span></Label>
                <Select
                  value={form.departmentId ?? ""}
                  onValueChange={v => { set("departmentId", v); set("subdepartmentId", null); set("classId", null) }}
                >
                  <SelectTrigger className={errors.departmentId ? "border-red-400" : ""}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.departmentId && <p className="text-xs text-red-500">{errors.departmentId}</p>}
              </div>

              {selectedDept && (
                <div className="space-y-1.5">
                  <Label>Sub-department</Label>
                  <Select
                    value={form.subdepartmentId ?? "none"}
                    onValueChange={v => { set("subdepartmentId", v === "none" ? null : v); set("classId", null) }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {selectedDept.subdepartments.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedSubdept && selectedSubdept.classes.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Service Class</Label>
                  <Select
                    value={form.classId ?? "none"}
                    onValueChange={v => set("classId", v === "none" ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {selectedSubdept.classes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Assign to */}
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Select
                value={form.assignedToUserId ?? "none"}
                onValueChange={v => set("assignedToUserId", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unassigned —</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate ?? ""}
                onChange={e => set("startDate", e.target.value)}
              />
            </div>

            {/* Reminders */}
            <div className="space-y-2">
              <Label>Default Reminders</Label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => toggleReminder(p.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      (form.defaultReminderOffsetsMinutes ?? []).includes(p.value)
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
                  placeholder="Add tag and press Enter…"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
              </div>
              {(form.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(form.tags ?? []).map(tag => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 cursor-pointer"
                      onClick={() => set("tags", (form.tags ?? []).filter(t => t !== tag))}
                    >
                      {tag}
                      <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <Switch
                checked={form.active ?? true}
                onCheckedChange={v => set("active", v)}
              />
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-slate-400">When disabled, tasks will not be generated from this template</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
