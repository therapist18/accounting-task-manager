"use client"

import { useState, useEffect } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Clock, CheckCircle } from "lucide-react"
import type { Stage } from "@/lib/supabase/stages"

interface StageTransitionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentStage: {
    id: string
    name: string
    estimatedDuration: number
    actualDuration?: number
  }
  stages: Stage[]
  currentStageId?: string | null
  onTransition: (data: {
    nextStageId?: string
    notes?: string
    skipToStage?: boolean
  }) => void
}

export function StageTransitionDialog({
  open,
  onOpenChange,
  currentStage,
  stages,
  currentStageId,
  onTransition,
}: StageTransitionDialogProps) {
  const [nextStageId, setNextStageId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [skipToStage, setSkipToStage] = useState(false)
  const [availableStages, setAvailableStages] = useState<Stage[]>([])

  useEffect(() => {
    if (!currentStageId) {
      // If no current stage, show all stages
      setAvailableStages(stages)
      setNextStageId(stages[0]?.id?.toString() || "")
    } else {
      // Show only stages that come after the current one
      const currentStageIndex = stages.findIndex(s => s.id.toString() === currentStageId)
      const nextStages = currentStageIndex >= 0 ? stages.slice(currentStageIndex + 1) : []
      setAvailableStages(nextStages)
      setNextStageId(nextStages[0]?.id?.toString() || "")
    }
  }, [stages, currentStageId])

  const handleTransition = () => {
    onTransition({
      nextStageId: nextStageId || undefined,
      notes: notes || undefined,
      skipToStage,
    })
    onOpenChange(false)
    setNotes("")
    setSkipToStage(false)
  }

  const formatDuration = (minutes: number) => {
    if (!minutes) return "0m"
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  const isOverdue = currentStage.actualDuration && currentStage.actualDuration > currentStage.estimatedDuration

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Stage Transition</DialogTitle>
          <DialogDescription>Complete the current stage and move to the next stage in the workflow.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Current Stage</Label>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">{currentStage.name || 'Not Started'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isOverdue ? "destructive" : "secondary"}>
                  <Clock className="h-3 w-3 mr-1" />
                  {currentStage.actualDuration
                    ? formatDuration(currentStage.actualDuration)
                    : formatDuration(currentStage.estimatedDuration)}
                </Badge>
                {isOverdue && <Badge variant="destructive">Overdue</Badge>}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="next-stage">Next Stage</Label>
            <Select value={nextStageId} onValueChange={setNextStageId}>
              <SelectTrigger id="next-stage">
                <SelectValue placeholder="Select next stage" />
              </SelectTrigger>
              <SelectContent>
                {availableStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id.toString()}>
                    <div className="flex items-center justify-between w-full">
                      <span>{stage.name}</span>
                      <Badge variant="outline" className="ml-2">
                        {formatDuration(stage.estimated_time || 0)}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="complete">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Complete Task</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="transition-notes">Transition Notes</Label>
            <Textarea
              id="transition-notes"
              placeholder="Add notes about this stage completion and transition..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {nextStageId && nextStageId !== "complete" && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <ArrowRight className="h-4 w-4" />
              <span className="text-sm">
                Transitioning to: <strong>{availableStages.find((s) => s.id.toString() === nextStageId)?.name}</strong>
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleTransition} disabled={!nextStageId}>
            {nextStageId === "complete" ? "Complete Task" : "Transition Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
