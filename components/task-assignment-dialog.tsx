// @ts-nocheck
"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { User, UserCheck } from "lucide-react"

interface User {
  id: string
  email: string
  name: string
  role: string
  start_date: string
  end_date: string | null
  created_at: string
  updated_at: string
  status_history: Array<{
    status: 'active' | 'inactive'
    changed_at: string
    changed_by: string
    reason?: string
  }>
}

interface TaskAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: {
    id: string
    jobDescription: string
    currentAssignments?: {
      taskManager?: string
      taskAssistant?: string
    }
  }
  users: User[]
  onAssign: (assignments: Record<string, string>) => void
}

export function TaskAssignmentDialog({ open, onOpenChange, task, users, onAssign }: TaskAssignmentDialogProps) {
  const [taskManagerId, setTaskManagerId] = useState<string>(task.currentAssignments?.taskManager || "none")
  const [taskAssistantId, setTaskAssistantId] = useState<string>(task.currentAssignments?.taskAssistant || "none")
  const [notes, setNotes] = useState("")

  const handleAssign = () => {
    const assignments: Record<string, string> = {}
    
    if (taskManagerId !== "none") {
      assignments.taskManagerId = taskManagerId
    }
    
    if (taskAssistantId !== "none") {
      assignments.taskAssistantId = taskAssistantId
    }
    
    if (notes) {
      assignments.notes = notes
    }
    
    onAssign(assignments)
    onOpenChange(false)
    setNotes("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Task</DialogTitle>
          <DialogDescription>Assign users to manage this task: {task.jobDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="task-manager">Task Manager</Label>
            <Select value={taskManagerId} onValueChange={setTaskManagerId}>
              <SelectTrigger id="task-manager">
                <SelectValue placeholder="Select task manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No assignment</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{user.username}</span>
                      <span className="text-muted-foreground">({user.email})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-assistant">Task Assistant</Label>
            <Select value={taskAssistantId} onValueChange={setTaskAssistantId}>
              <SelectTrigger id="task-assistant">
                <SelectValue placeholder="Select task assistant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No assignment</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{user.username}</span>
                      <span className="text-muted-foreground">({user.email})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {task.currentAssignments && (
            <div className="space-y-2">
              <Label>Current Assignments</Label>
              <div className="flex gap-2">
                {task.currentAssignments.taskManager && (
                  <Badge variant="secondary">
                    <UserCheck className="h-3 w-3 mr-1" />
                    Manager: {users.find((u) => u.id === task.currentAssignments?.taskManager)?.name || 'Unknown'}
                  </Badge>
                )}
                {task.currentAssignments.taskAssistant && (
                  <Badge variant="secondary">
                    <UserCheck className="h-3 w-3 mr-1" />
                    Assistant: {users.find((u) => u.id === task.currentAssignments?.taskAssistant)?.name || 'Unknown'}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="notes">Assignment Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign}>Assign Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
