// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { X, Check, ChevronsUpDown } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { REMINDER_PRESETS } from "../constants"
import type { BTask, BUser, BDepartment } from "../types"

interface TaskFormProps {
  open: boolean
  task: BTask | null
  users: BUser[]
  departments: BDepartment[]
  currentUserId: string
  isAdmin: boolean
  onClose: () => void
  onCreate: (data: Omit<BTask, "id" | "createdAt" | "updatedAt">) => void
  onUpdate: (taskId: string, data: Partial<BTask>) => void
}

// ── Multi-user select popover ──────────────────────────────────────────────────
function UserMultiSelect({
  label,
  placeholder,
  value,
  onChange,
  users,
  excludeIds = [],
}: {
  label: string
  placeholder: string
  value: string[]
  onChange: (ids: string[]) => void
  users: BUser[]
  excludeIds?: string[]
}) {
  const [open, setOpen] = useState(false)
  const eligible = users.filter(u => !excludeIds.includes(u.id))
  const selected = users.filter(u => value.includes(u.id))

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between font-normal h-auto min-h-9 px-3"
          >
            {selected.length === 0 ? (
              <span className="text-slate-400 text-sm">{placeholder}</span>
            ) : (
              <div className="flex flex-wrap gap-1 py-0.5">
                {selected.map(u => (
                  <Badge
                    key={u.id}
                    variant="secondary"
                    className="gap-1 text-xs pr-1"
                    onClick={e => { e.stopPropagation(); toggle(u.id) }}
                  >
                    <span className={cn("w-3.5 h-3.5 rounded-full text-white text-[8px] flex items-center justify-center font-bold", u.avatarColor)}>
                      {u.avatarInitials[0]}
                    </span>
                    {u.name.split(" ")[0]}
                    <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-500" />
                  </Badge>
                ))}
              </div>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <ScrollArea className="h-52">
            <div className="p-1.5 space-y-0.5">
              {eligible.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">No users available</p>
              )}
              {eligible.map(u => (
                <div
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", u.avatarColor)}>
                    {u.avatarInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{u.role?.replace(/_/g, " ")}</p>
                  </div>
                  {value.includes(u.id) && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── Empty form template ────────────────────────────────────────────────────────
function emptyForm(currentUserId: string, isAdmin: boolean): Omit<BTask, "id" | "createdAt" | "updatedAt"> {
  return {
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    type: "personal",
    departmentId: "",
    subdepartmentId: null,
    classId: null,
    jobLevel: {},
    createdByUserId: currentUserId,
    assignedToUserId: isAdmin ? null : currentUserId,
    assignedToUserIds: isAdmin ? [] : [currentUserId],
    collaboratorIds: [],
    officerId: null,
    managerId: null,
    assistantId: null,
    startDate: new Date().toISOString().split("T")[0],
    dueDate: new Date().toISOString().split("T")[0],
    tags: [],
    reminderIds: [],
    recurringTemplateId: null,
    notes: null,
    completedAt: null,
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TaskForm({
  open, task, users, departments, currentUserId, isAdmin,
  onClose, onCreate, onUpdate,
}: TaskFormProps) {
  const [form, setForm] = useState(() => emptyForm(currentUserId, isAdmin))
  const [tagInput, setTagInput] = useState("")
  const [selectedReminders, setSelectedReminders] = useState<number[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditing = !!task
  const currentUser = users.find(u => u.id === currentUserId)

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        type: task.type,
        departmentId: task.departmentId,
        subdepartmentId: task.subdepartmentId ?? null,
        classId: task.classId ?? null,
        jobLevel: task.jobLevel,
        createdByUserId: task.createdByUserId,
        assignedToUserId: task.assignedToUserId ?? null,
        assignedToUserIds: task.assignedToUserIds ?? [],
        collaboratorIds: task.collaboratorIds ?? [],
        officerId: task.officerId ?? null,
        managerId: task.managerId ?? null,
        assistantId: task.assistantId ?? null,
        startDate: task.startDate,
        dueDate: task.dueDate,
        tags: task.tags,
        reminderIds: task.reminderIds,
        recurringTemplateId: task.recurringTemplateId ?? null,
        notes: task.notes ?? null,
        completedAt: task.completedAt ?? null,
      })
    } else {
      setForm(emptyForm(currentUserId, isAdmin))
    }
    setTagInput("")
    setSelectedReminders([])
    setErrors({})
  }, [task, open, currentUserId, isAdmin])

  const selectedDept = departments.find(d => d.id === form.departmentId)
  const selectedSubdept = selectedDept?.subdepartments.find(s => s.id === form.subdepartmentId)

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: "" }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-")
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t])
    setTagInput("")
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = "Title is required"
    if (!form.dueDate) errs.dueDate = "Due date is required"
    if (form.startDate > form.dueDate) errs.dueDate = "Due date must be after start date"
    if (isAdmin && form.assignedToUserIds.length === 0) errs.assignedToUserIds = "Assign to at least one user"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit() {
    if (!validate()) return

    const assignedToUserId = isAdmin
      ? (form.assignedToUserIds[0] ?? null)
      : currentUserId

    const payload = {
      ...form,
      assignedToUserId,
      assignedToUserIds: isAdmin ? form.assignedToUserIds : [currentUserId],
    }

    if (isEditing && task) {
      onUpdate(task.id, payload)
    } else {
      onCreate(payload)
    }
  }

  // Collaborator exclusion: exclude already-assigned users
  const assignedIds = isAdmin ? form.assignedToUserIds : [currentUserId]

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {isEditing ? "Edit Task" : "Create New Task"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-sm font-medium">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Task title…"
              className={errors.title ? "border-red-400" : ""}
            />
            {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-sm font-medium">Description</Label>
            <Textarea
              id="desc"
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="What needs to be done…"
              rows={3}
            />
          </div>

          {/* Status / Priority / Type */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Type</Label>
              <Select value={form.type} onValueChange={v => set("type", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Department hierarchy */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={v => { set("departmentId", v); set("subdepartmentId", null); set("classId", null) }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDept && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Sub-department</Label>
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
                <Label className="text-sm font-medium">Service Class</Label>
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

          {/* ── Assignment section ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Assignment</p>

            {isAdmin ? (
              /* Admin: multi-select assign to */
              <div>
                <UserMultiSelect
                  label="Assign To *"
                  placeholder="Select users to assign…"
                  value={form.assignedToUserIds}
                  onChange={ids => set("assignedToUserIds", ids)}
                  users={users}
                />
                {errors.assignedToUserIds && (
                  <p className="text-xs text-red-500 mt-1">{errors.assignedToUserIds}</p>
                )}
                {form.assignedToUserIds.length > 1 && (
                  <p className="text-xs text-blue-600 mt-1">
                    This task will appear in each assigned user&apos;s dashboard.
                  </p>
                )}
              </div>
            ) : (
              /* Normal user: locked to self */
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Assigned To</Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200">
                  {currentUser && (
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold", currentUser.avatarColor)}>
                      {currentUser.avatarInitials}
                    </div>
                  )}
                  <span className="text-sm text-slate-700 font-medium">{currentUser?.name ?? "You"}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">You</Badge>
                </div>
              </div>
            )}

            {/* Collaborators — available to everyone */}
            <UserMultiSelect
              label="Collaborators (optional)"
              placeholder="Add collaborators…"
              value={form.collaboratorIds}
              onChange={ids => set("collaboratorIds", ids)}
              users={users}
              excludeIds={assignedIds}
            />
            {form.collaboratorIds.length > 0 && (
              <p className="text-xs text-slate-400">
                Collaborators can view and update this task.
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Due Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={e => set("dueDate", e.target.value)}
                className={errors.dueDate ? "border-red-400" : ""}
              />
              {errors.dueDate && <p className="text-xs text-red-500">{errors.dueDate}</p>}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
                placeholder="Add tag and press Enter…"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => set("tags", form.tags.filter(t => t !== tag))}>
                    {tag} <X className="w-3 h-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes ?? ""}
              onChange={e => set("notes", e.target.value || null)}
              placeholder="Additional notes…"
              rows={2}
            />
          </div>

          {/* Reminder presets */}
          {!isEditing && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Reminders</Label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setSelectedReminders(prev =>
                      prev.includes(p.value) ? prev.filter(v => v !== p.value) : [...prev, p.value]
                    )}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      selectedReminders.includes(p.value)
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {selectedReminders.length > 0 && (
                <p className="text-xs text-slate-400">{selectedReminders.length} reminder(s) will be created</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700 text-white">
            {isEditing ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
