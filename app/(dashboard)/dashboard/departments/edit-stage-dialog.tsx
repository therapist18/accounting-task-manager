"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X } from "lucide-react"

type TimeConfig = {
  applicationType: string
  days: number
  hours: number
  minutes: number
}

type Stage = {
  id: string
  name: string
  estimated_time: number | null
  follow_up?: 'Client' | 'Officer' | 'BCL' | null
  isSpecial: boolean
  timeConfigs?: TimeConfig[]
}

interface EditStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: Stage | null
  onSave: (stage: Stage) => Promise<void>
}

export function EditStageDialog({ open, onOpenChange, stage, onSave }: EditStageDialogProps) {
  const [formData, setFormData] = useState<Stage>({
    id: '',
    name: '',
    estimated_time: 0,
    follow_up: null,
    isSpecial: false,
    timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
  })

  useEffect(() => {
    if (stage) {
      setFormData({
        ...stage,
        timeConfigs: stage.timeConfigs?.length ? stage.timeConfigs : [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
      })
    }
  }, [stage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave(formData)
  }

  const updateTimeConfig = (index: number, updates: Partial<TimeConfig>) => {
    setFormData(prev => ({
      ...prev,
      timeConfigs: prev.timeConfigs?.map((config, i) => 
        i === index ? { ...config, ...updates } : config
      )
    }))
  }

  const addTimeConfig = () => {
    setFormData(prev => ({
      ...prev,
      timeConfigs: [
        ...(prev.timeConfigs || []),
        { applicationType: '', days: 0, hours: 0, minutes: 0 }
      ]
    }))
  }

  const removeTimeConfig = (index: number) => {
    setFormData(prev => ({
      ...prev,
      timeConfigs: prev.timeConfigs?.filter((_, i) => i !== index)
    }))
  }

  const calculateTotalMinutes = (days: number, hours: number, minutes: number) => {
    return (days * 24 * 60) + (hours * 60) + minutes
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Stage</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
            <div className="space-y-1">
              <Label htmlFor="name">
                Stage Name <span className="text-destructive">*</span>
              </Label>
            </div>
            <div className="md:col-span-3">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isSpecial"
                checked={formData.isSpecial}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isSpecial: Boolean(checked) }))}
              />
              <Label htmlFor="isSpecial">This stage has special time requirements based on application type</Label>
            </div>

            {formData.isSpecial ? (
              <div className="space-y-4 border rounded-md p-4">
                <h4 className="font-medium">Time Configurations</h4>
                {formData.timeConfigs?.map((config, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-4">
                      <Label>Application Type</Label>
                      <Input
                        value={config.applicationType}
                        onChange={(e) => updateTimeConfig(index, { applicationType: e.target.value })}
                        placeholder="e.g., Standard, Express"
                        required
                      />
                    </div>
                    <div className="md:col-span-6">
                      <Label>Time Required</Label>
                      <div className="flex gap-2">
                        <div>
                          <Input
                            type="number"
                            min="0"
                            value={config.days}
                            onChange={(e) => updateTimeConfig(index, { days: parseInt(e.target.value) || 0 })}
                            className="w-20"
                            placeholder="Days"
                          />
                          <p className="text-xs text-muted-foreground text-center">Days</p>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            value={config.hours}
                            onChange={(e) => updateTimeConfig(index, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                            className="w-20"
                            placeholder="Hours"
                          />
                          <p className="text-xs text-muted-foreground text-center">Hours</p>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="0"
                            max="59"
                            value={config.minutes}
                            onChange={(e) => updateTimeConfig(index, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                            className="w-20"
                            placeholder="Mins"
                          />
                          <p className="text-xs text-muted-foreground text-center">Minutes</p>
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeTimeConfig(index)}
                        disabled={formData.timeConfigs?.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTimeConfig}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Configuration
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                <div className="space-y-1">
                  <Label>Estimated Time</Label>
                </div>
                <div className="md:col-span-3">
                  <div className="flex gap-4">
                    <div>
                      <Input
                        type="number"
                        min="0"
                        value={Math.floor((formData.estimated_time || 0) / (24 * 60))}
                        onChange={(e) => {
                          const days = parseInt(e.target.value) || 0
                          const hours = Math.floor(((formData.estimated_time || 0) % (24 * 60)) / 60)
                          const minutes = (formData.estimated_time || 0) % 60
                          setFormData(prev => ({
                            ...prev,
                            estimated_time: calculateTotalMinutes(days, hours, minutes)
                          }))
                        }}
                      />
                      <p className="text-xs text-muted-foreground text-center">Days</p>
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={Math.floor(((formData.estimated_time || 0) % (24 * 60)) / 60)}
                        onChange={(e) => {
                          const days = Math.floor((formData.estimated_time || 0) / (24 * 60))
                          const hours = Math.min(23, parseInt(e.target.value) || 0)
                          const minutes = (formData.estimated_time || 0) % 60
                          setFormData(prev => ({
                            ...prev,
                            estimated_time: calculateTotalMinutes(days, hours, minutes)
                          }))
                        }}
                      />
                      <p className="text-xs text-muted-foreground text-center">Hours</p>
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={(formData.estimated_time || 0) % 60}
                        onChange={(e) => {
                          const days = Math.floor((formData.estimated_time || 0) / (24 * 60))
                          const hours = Math.floor(((formData.estimated_time || 0) % (24 * 60)) / 60)
                          const minutes = Math.min(59, parseInt(e.target.value) || 0)
                          setFormData(prev => ({
                            ...prev,
                            estimated_time: calculateTotalMinutes(days, hours, minutes)
                          }))
                        }}
                      />
                      <p className="text-xs text-muted-foreground text-center">Minutes</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
            <div className="space-y-1">
              <Label>Follow Up</Label>
            </div>
            <div className="md:col-span-3">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.follow_up || 'none'}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  follow_up: e.target.value === 'none' ? null : e.target.value as 'Client' | 'Officer' | 'BCL'
                }))}
              >
                <option value="none">No follow up required</option>
                <option value="Client">Client</option>
                <option value="Officer">Officer</option>
                <option value="BCL">BCL</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
