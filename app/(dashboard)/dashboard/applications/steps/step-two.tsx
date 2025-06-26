"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { WizardData } from "../page"
import { mockOfficers } from "../components/supabase"

interface StepTwoProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepTwo({ data, updateData, onNext, onPrev }: StepTwoProps) {
  const [officer, setOfficer] = useState(data.officer || "")
  const [taskManager, setTaskManager] = useState(data.taskManager || "")
  const [taskAssistant, setTaskAssistant] = useState(data.taskAssistant || "")

  const officers = mockOfficers.filter((o) => o.role === "officer")
  const taskManagers = mockOfficers.filter((o) => o.role === "task_manager")
  const taskAssistants = mockOfficers.filter((o) => o.role === "task_assistant")

  const handleNext = () => {
    updateData({
      officer,
      taskManager,
      taskAssistant,
    })
    onNext()
  }

  const isValid = officer && taskManager && taskAssistant

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Assign Officers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="officer">Officer *</Label>
          <Select value={officer} onValueChange={setOfficer}>
            <SelectTrigger>
              <SelectValue placeholder="Select an officer" />
            </SelectTrigger>
            <SelectContent>
              {officers.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taskManager">Task Manager *</Label>
          <Select value={taskManager} onValueChange={setTaskManager}>
            <SelectTrigger>
              <SelectValue placeholder="Select a task manager" />
            </SelectTrigger>
            <SelectContent>
              {taskManagers.map((tm) => (
                <SelectItem key={tm.id} value={tm.id}>
                  {tm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taskAssistant">Task Assistant *</Label>
          <Select value={taskAssistant} onValueChange={setTaskAssistant}>
            <SelectTrigger>
              <SelectValue placeholder="Select a task assistant" />
            </SelectTrigger>
            <SelectContent>
              {taskAssistants.map((ta) => (
                <SelectItem key={ta.id} value={ta.id}>
                  {ta.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrev}>
            Previous
          </Button>
          <Button onClick={handleNext} disabled={!isValid}>
            Next Step
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
