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

interface Department {
  id: string
  name: string
}

interface AddStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddStages: (stages: NewStage[], departmentId: string) => Promise<void>
  departments: Department[]
}

export function AddStageDialog({ open, onOpenChange, onAddStages, departments }: AddStageDialogProps) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
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
      // Show error or highlight the department selector
      return
    }
    
    await onAddStages(newStages, selectedDepartment)
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
    setSelectedDepartment('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Stage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Stage</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
            <div className="space-y-1">
              <Label htmlFor="department" className="flex items-center h-10">
                Department <span className="text-destructive ml-1">*</span>
              </Label>
            </div>
            <div className="md:col-span-3">
              <select
                id="department"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select a department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-6 py-2">
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
                <div className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted rounded">
                  Stage {stageIndex + 1} of {newStages.length}
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="grid md:grid-cols-4 items-start gap-4">
                  <div className="space-y-1">
                    <Label htmlFor={`name-${stage.id}`} className="flex items-center h-10">
                      Stage Name <span className="text-destructive ml-1">*</span>
                    </Label>
                  </div>
                  <div className="md:col-span-3">
                    <Input
                      id={`name-${stage.id}`}
                      value={stage.name}
                      onChange={(e) => updateNewStage(stage.id, { name: e.target.value })}
                      placeholder="e.g., Document Review, Client Communication"
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="grid md:grid-cols-4 items-start gap-4">
                    <div className="space-y-1">
                      <Label className="flex items-center h-10">
                        Stage Type
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Special stages have different time requirements based on application type
                      </p>
                    </div>
                    <div className="md:col-span-3">
                      <div className="flex items-center space-x-4 p-3 border rounded-md bg-muted/20">
                        <Checkbox
                          id={`special-${stage.id}`}
                          checked={stage.isSpecial}
                          onCheckedChange={(checked) => updateNewStage(stage.id, { isSpecial: checked === true })}
                        />
                        <div>
                          <Label htmlFor={`special-${stage.id}`} className="font-medium">
                            Special Stage
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {stage.isSpecial 
                              ? 'This stage has variable time requirements by application type' 
                              : 'This stage has a fixed time requirement'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {stage.isSpecial ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Time Configurations</h4>
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
                            <h5 className="font-medium text-sm">
                              Configuration {configIndex + 1}
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
                                placeholder="e.g., New, Renewal, GI"
                              />
                              <p className="text-xs text-muted-foreground">Leave as 'Default' for standard applications</p>
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
                  <div className="grid md:grid-cols-4 items-start gap-4">
                    <div className="space-y-1">
                      <Label className="flex items-center h-10">
                        Estimated Time
                      </Label>
                    </div>
                    <div className="md:col-span-3">
                      <div className="grid grid-cols-3 gap-3">
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
                  </div>
                )}

                <div className="grid md:grid-cols-4 items-start gap-4 border-t pt-4">
                  <div className="space-y-1">
                    <Label htmlFor={`follow-up-${stage.id}`} className="flex items-center h-10">
                      Follow Up
                    </Label>
                  </div>
                  <div className="md:col-span-3">
                    <select
                      id={`follow-up-${stage.id}`}
                      value={stage.followUp}
                      onChange={(e) => updateNewStage(stage.id, { followUp: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="none">No follow up required</option>
                      <option value="Client">Client</option>
                      <option value="Officer">Officer</option>
                      <option value="BCL">BCL</option>
                    </select>
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
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!selectedDepartment || newStages.some(stage => !stage.name.trim())}
            >
              Add Stage{newStages.length > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
