"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X } from "lucide-react"
import { generateId } from "@/lib/utils"

interface TimeConfig {
  applicationType: string
  days: number
  hours: number
  minutes: number
}

interface NewStage {
  id: string
  name: string
  days: number
  hours: number
  minutes: number
  followUp: string
  isSpecial: boolean
  timeConfigs: TimeConfig[]
}

interface AddStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddStages: (stages: NewStage[]) => Promise<void>
}

export function AddStageDialog({ open, onOpenChange, onAddStages }: AddStageDialogProps) {
  const [newStages, setNewStages] = useState<NewStage[]>([{
    id: generateId(),
    name: '',
    days: 0,
    hours: 0,
    minutes: 0,
    followUp: 'none',
    isSpecial: false,
    timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
  }])

  const addNewStageRow = () => {
    setNewStages(prev => [...prev, {
      id: generateId(),
      name: '',
      days: 0,
      hours: 0,
      minutes: 0,
      followUp: 'none',
      isSpecial: false,
      timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
    }])
  }

  const removeStageRow = (id: string) => {
    if (newStages.length > 1) {
      setNewStages(prev => prev.filter(stage => stage.id !== id))
    }
  }

  const addTimeConfig = (stageId: string) => {
    setNewStages(prev =>
      prev.map(stage =>
        stage.id === stageId
          ? {
              ...stage,
              timeConfigs: [
                ...stage.timeConfigs,
                { applicationType: '', days: 0, hours: 0, minutes: 0 }
              ]
            }
          : stage
      )
    )
  }

  const removeTimeConfig = (stageId: string, index: number) => {
    setNewStages(prev =>
      prev.map(stage =>
        stage.id === stageId
          ? {
              ...stage,
              timeConfigs: stage.timeConfigs.filter((_, i) => i !== index)
            }
          : stage
      )
    )
  }

  const updateTimeConfig = (stageId: string, index: number, updates: Partial<TimeConfig>) => {
    setNewStages(prev =>
      prev.map(stage =>
        stage.id === stageId
          ? {
              ...stage,
              timeConfigs: stage.timeConfigs.map((config, i) =>
                i === index ? { ...config, ...updates } : config
              )
            }
          : stage
      )
    )
  }

  const updateNewStage = (id: string, updates: Partial<NewStage>) => {
    setNewStages(prev =>
      prev.map(stage =>
        stage.id === id ? { ...stage, ...updates } : stage
      )
    )
  }

  const handleSubmit = async () => {
    await onAddStages(newStages)
    // Reset form
    setNewStages([{
      id: generateId(),
      name: '',
      days: 0,
      hours: 0,
      minutes: 0,
      followUp: 'none',
      isSpecial: false,
      timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
    }])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Stage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Stage{newStages.length > 1 ? 's' : ''}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {newStages.map((stage, stageIndex) => (
            <div key={stage.id} className="space-y-4 border rounded-lg p-4 relative">
              {newStages.length > 1 && (
                <button
                  onClick={() => removeStageRow(stage.id)}
                  className="absolute right-3 top-3 p-1 rounded-full hover:bg-muted"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={`name-${stage.id}`} className="text-right">
                  Stage Name
                </Label>
                <Input
                  id={`name-${stage.id}`}
                  value={stage.name}
                  onChange={(e) => updateNewStage(stage.id, { name: e.target.value })}
                  className="col-span-3"
                  placeholder="Enter stage name"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">
                  Special Stage
                </Label>
                <div className="col-span-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`special-${stage.id}`}
                      checked={stage.isSpecial}
                      onCheckedChange={(checked) => updateNewStage(stage.id, { isSpecial: checked === true })}
                    />
                    <Label htmlFor={`special-${stage.id}`} className="text-sm font-normal">
                      This stage has special time requirements based on application type
                    </Label>
                  </div>
                </div>
              </div>

              {stage.isSpecial ? (
                <div className="space-y-4 mt-4">
                  <h4 className="text-sm font-medium">Time Configurations</h4>
                  {stage.timeConfigs.map((config, configIndex) => (
                    <div key={configIndex} className="space-y-2 border-l-2 border-muted pl-4 py-2">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-medium">Configuration {configIndex + 1}</h5>
                        {stage.timeConfigs.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeTimeConfig(stage.id, configIndex)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Application Type</Label>
                          <Input
                            value={config.applicationType}
                            onChange={(e) => updateTimeConfig(stage.id, configIndex, { applicationType: e.target.value })}
                            placeholder="e.g., New, Renewal, GI Investigation"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Days</Label>
                            <Input
                              type="number"
                              min="0"
                              value={config.days}
                              onChange={(e) => updateTimeConfig(stage.id, configIndex, { days: parseInt(e.target.value) || 0 })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Hours</Label>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              value={config.hours}
                              onChange={(e) => updateTimeConfig(stage.id, configIndex, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Mins</Label>
                            <Input
                              type="number"
                              min="0"
                              max="59"
                              value={config.minutes}
                              onChange={(e) => updateTimeConfig(stage.id, configIndex, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => addTimeConfig(stage.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Time Configuration
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor={`time-${stage.id}`} className="text-right">
                    Estimated Time
                  </Label>
                  <div className="col-span-3 grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Days</Label>
                      <Input
                        id={`time-${stage.id}`}
                        type="number"
                        min="0"
                        value={stage.days}
                        onChange={(e) => updateNewStage(stage.id, { days: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hours</Label>
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={stage.hours}
                        onChange={(e) => updateNewStage(stage.id, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mins</Label>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={stage.minutes}
                        onChange={(e) => updateNewStage(stage.id, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={`follow-up-${stage.id}`} className="text-right">
                  Follow Up
                </Label>
                <div className="col-span-3">
                  <select
                    id={`follow-up-${stage.id}`}
                    value={stage.followUp}
                    onChange={(e) => updateNewStage(stage.id, { followUp: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="none">None</option>
                    <option value="Client">Client</option>
                    <option value="Officer">Officer</option>
                    <option value="BCL">BCL</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addNewStageRow}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Stage
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
            >
              Add Stage{newStages.length > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
