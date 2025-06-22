// @ts-nocheck
"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, FileText, User } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { NewStage, TimeConfig, StageDocument, DepartmentOption } from "./types"

// Simple UUID generator
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

interface AddStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddStages: (stages: NewStage[], departmentId: string) => Promise<void>
  departments: DepartmentOption[]
}

export function AddStageDialog({ open, onOpenChange, onAddStages, departments }: AddStageDialogProps) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [newStages, setNewStages] = useState<NewStage[]>([{
    id: generateId(),
    name: '',
    description: '',
    days: 0,
    hours: 0,
    minutes: 0,
    followUp: 'none',
    isSpecial: false,
    timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
    documents: []
  }])
  const [saving, setSaving] = useState(false)

  const addNewStageRow = () => {
    setNewStages(prev => [...prev, {
      id: generateId(),
      name: '',
      description: '',
      days: 0,
      hours: 0,
      minutes: 0,
      followUp: 'none',
      isSpecial: false,
      timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
      documents: []
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
      prev.map(stage => {
        if (stage.id === stageId) {
          const newTimeConfigs = [...stage.timeConfigs];
          newTimeConfigs[index] = { ...newTimeConfigs[index], ...updates };
          return { ...stage, timeConfigs: newTimeConfigs };
        }
        return stage;
      })
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
    if (!selectedDepartment) {
      return
    }

    setSaving(true)
    try {
      await onAddStages(newStages, selectedDepartment)
      // Reset form
      setNewStages([{
        id: generateId(),
        name: '',
        description: '',
        days: 0,
        hours: 0,
        minutes: 0,
        followUp: 'none',
        isSpecial: false,
        timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
        documents: []
      }])
      setSelectedDepartment('')
    } finally {
      setSaving(false)
    }
  }

  const isFormValid = selectedDepartment && newStages.every(stage => stage.name.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Stage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Stage{newStages.length > 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4 pb-4 border-b">
            <div className="space-y-1">
              <Label htmlFor="department" className="flex items-center gap-1">
                Department
                <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Select which department these stages belong to
              </p>
            </div>
            <div className="md:col-span-3">
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-6">
            {newStages.map((stage, stageIndex) => (
              <div key={stage.id} className="space-y-6 border rounded-lg p-6 relative bg-card shadow-sm">
                <div className="absolute right-4 top-4 flex items-center space-x-2">
                  {newStages.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeStageRow(stage.id)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove stage</span>
                    </Button>
                  )}
                  <Badge variant="outline" className="text-xs">
                    Stage {stageIndex + 1} of {newStages.length}
                  </Badge>
                </div>

                <div className="space-y-6 pr-20">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`name-${stage.id}`} className="flex items-center gap-1">
                        Stage Name
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`name-${stage.id}`}
                        value={stage.name}
                        onChange={(e) => updateNewStage(stage.id, { name: e.target.value })}
                        placeholder="e.g., Document Review, Client Communication"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`description-${stage.id}`}>
                        Description
                      </Label>
                      <Input
                        id={`description-${stage.id}`}
                        value={stage.description || ''}
                        onChange={(e) => updateNewStage(stage.id, { description: e.target.value })}
                        placeholder="Brief description of this stage..."
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center space-x-4 p-3 border rounded-md bg-muted/20">
                      <Checkbox
                        id={`special-${stage.id}`}
                        checked={stage.isSpecial}
                        onCheckedChange={(checked) => updateNewStage(stage.id, { isSpecial: checked === true })}
                      />
                      <div>
                        <Label htmlFor={`special-${stage.id}`} className="font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Special Time Requirements
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {stage.isSpecial
                            ? 'This stage has variable time requirements by application type'
                            : 'This stage has a fixed time requirement'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {stage.isSpecial ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Time Configurations
                        </h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => addTimeConfig(stage.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Configuration
                        </Button>
                      </div>

                      <div className="space-y-4">
                        {stage.timeConfigs.map((config, configIndex) => (
                          <div key={configIndex} className="space-y-4 border rounded-lg p-4 bg-background relative">
                            <div className="flex justify-between items-center">
                              <h5 className="font-medium text-sm flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  Config {configIndex + 1}
                                </Badge>
                              </h5>
                              {stage.timeConfigs.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeTimeConfig(stage.id, configIndex)}
                                >
                                  <X className="h-4 w-4" />
                                  <span className="sr-only">Remove configuration</span>
                                </Button>
                              )}
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm">Application Type</Label>
                                <Input
                                  value={config.applicationType}
                                  onChange={(e) => updateTimeConfig(stage.id, configIndex, { applicationType: e.target.value })}
                                  placeholder="e.g., New, Renewal, Express"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Leave as 'Default' for standard applications
                                </p>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-sm">Estimated Time</Label>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={config.days}
                                      onChange={(e) => updateTimeConfig(stage.id, configIndex, { days: parseInt(e.target.value) || 0 })}
                                      className="text-center"
                                    />
                                    <Label className="block text-center text-xs text-muted-foreground mt-1">Days</Label>
                                  </div>
                                  <div>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="23"
                                      value={config.hours}
                                      onChange={(e) => updateTimeConfig(stage.id, configIndex, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                                      className="text-center"
                                    />
                                    <Label className="block text-center text-xs text-muted-foreground mt-1">Hours</Label>
                                  </div>
                                  <div>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="59"
                                      value={config.minutes}
                                      onChange={(e) => updateTimeConfig(stage.id, configIndex, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                                      className="text-center"
                                    />
                                    <Label className="block text-center text-xs text-muted-foreground mt-1">Minutes</Label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Estimated Duration
                      </h4>
                      <div className="grid grid-cols-3 gap-3 max-w-md">
                        <div>
                          <Input
                            type="number"
                            min="0"
                            value={stage.days}
                            onChange={(e) => updateNewStage(stage.id, { days: parseInt(e.target.value) || 0 })}
                            className="text-center"
                          />
                          <Label className="block text-center text-xs text-muted-foreground mt-1">Days</Label>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            value={stage.hours}
                            onChange={(e) => updateNewStage(stage.id, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                            className="text-center"
                          />
                          <Label className="block text-center text-xs text-muted-foreground mt-1">Hours</Label>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="0"
                            max="59"
                            value={stage.minutes}
                            onChange={(e) => updateNewStage(stage.id, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                            className="text-center"
                          />
                          <Label className="block text-center text-xs text-muted-foreground mt-1">Minutes</Label>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label htmlFor={`follow-up-${stage.id}`} className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Follow Up With
                      </Label>
                      <Select
                        value={stage.followUp}
                        onValueChange={(value) => updateNewStage(stage.id, { followUp: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select follow up person" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No follow up required</SelectItem>
                          <SelectItem value="Client">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Client
                            </div>
                          </SelectItem>
                          <SelectItem value="Officer">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              Officer
                            </div>
                          </SelectItem>
                          <SelectItem value="BCL">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              BCL
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documents
                      </Label>
                      <div className="text-sm text-muted-foreground p-3 border rounded bg-muted/20">
                        Documents can be added after creating the stage via the edit function
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={addNewStageRow}
              className="gap-2"
              disabled={saving}
            >
              <Plus className="h-4 w-4" />
              Add Another Stage
            </Button>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!isFormValid || saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-muted border-t-current rounded-full animate-spin mr-2"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    Add Stage{newStages.length > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}