// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { REMINDER_PRESETS } from "../constants"
import type { BTask, BUser, BDepartment } from "../types"

interface TaskFormProps {
  open: boolean
  task: BTask | null
  users: BUser[]
  departments: BDepartment[]
  currentUserId: string
  onClose: () => void
  onCreate: (data: Omit<BTask, "id" | "createdAt" | "updatedAt">) => void
  onUpdate: (taskId: string, data: Partial<BTask>) => void
}

const EMPTY: Omit<BTask, "id" | "createdAt" | "updatedAt"> = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  type: "personal",
  departmentId: "",
  subdepartmentId: null,
  classId: null,
  jobLevel: { level: 1, departmentId: "" },
  createdByUserId: "",
  assignedToUserId: null,
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

export function TaskForm({ open, task, users, departments, currentUserId, onClose, onCreate, onUpdate }: TaskFormProps) {
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY, createdByUserId: currentUserId })
  const [tagInput, setTagInput] = useState("")
  const [selectedReminders, setSelectedReminders] = useState<number[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditing = !!task

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
      setTagInput("")
      setSelectedReminders([])
    } else {
      setForm({ ...EMPTY, createdByUserId: currentUserId })
      setTagInput("")
      setSelectedReminders([])
    }
    setErrors({})
  }, [task, open, currentUserId])

  const selectedDept = departments.find(d => d.id === form.departmentId)
  const selectedSubdept = selectedDept?.subdepartments.find(s => s.id === form.subdepartmentId)

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: "" }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-")
    if (t && !form.tags.includes(t)) {
      set("tags", [...form.tags, t])
    }
    setTagInput("")
  }

  function removeTag(tag: string) {
    set("tags", form.tags.filter(t => t !== tag))
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = "Title is required"
    if (!form.departmentId) errs.departmentId = "Department is required"
    if (!form.dueDate) errs.dueDate = "Due date is required"
    if (form.startDate > form.dueDate) errs.dueDate = "Due date must be after start date"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    const jobLevel = {
      level: form.classId ? 3 : form.subdepartmentId ? 2 : 1,
      departmentId: form.departmentId,
      subdepartmentId: form.subdepartmentId ?? null,
      classId: form.classId ?? null,
    } as const

    if (isEditing && task) {
      onUpdate(task.id, { ...form, jobLevel })
    } else {
      onCreate({ ...form, jobLevel })
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          {/* Status, Priority, Type */}
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
              <Label className="text-sm font-medium">
                Department <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.departmentId}
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

          {/* Assign to */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Assign To</Label>
            <Select value={form.assignedToUserId ?? "none"} onValueChange={v => set("assignedToUserId", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role.replace("_", " ")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={e => set("startDate", e.target.value)}
              />
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
                  <Badge key={tag} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeTag(tag)}>
                    {tag}
                    <X className="w-3 h-3" />
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

          {/* Reminder presets (display only — in real app would create reminder records) */}
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
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedReminders.includes(p.value)
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
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
