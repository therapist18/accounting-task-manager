"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, User, FileText } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StageDocuments } from "./stage-documents"
import { DurationInput } from "./duration-input"

type TimeConfig = {
  applicationType: string
  days: number
  hours: number
  minutes: number
}

type DocumentExtraction = {
  fieldName: string
  fieldType: 'text' | 'date' | 'number' | 'boolean'
  isRequired: boolean
  description?: string
}

type StageDocument = {
  id: string
  name: string
  description?: string
  isRequired: boolean
  extractionSpecs?: DocumentExtraction[]
}

type Stage = {
  id: string
  name: string
  description?: string
  estimated_time: number | null
  follow_up?: 'Client' | 'Officer' | 'BCL' | null
  isSpecial: boolean
  timeConfigs?: TimeConfig[]
  documents?: StageDocument[]
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
    description: '',
    estimated_time: 0,
    follow_up: null,
    isSpecial: false,
    timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
    documents: []
  })
  
  const [activeTab, setActiveTab] = useState('general')

  useEffect(() => {
    if (stage) {
      setFormData({
        ...stage,
        description: stage.description || '',
        documents: stage.documents || [],
        timeConfigs: stage.timeConfigs?.length ? stage.timeConfigs : [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
      })
    } else {
      setFormData({
        id: '',
        name: '',
        description: '',
        estimated_time: 0,
        follow_up: null,
        isSpecial: false,
        timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
        documents: []
      })
    }
    setActiveTab('general')
  }, [stage, open])

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

  const updateDocuments = (documents: StageDocument[]) => {
    setFormData(prev => ({
      ...prev,
      documents
    }))
  }
  
  const getTimeFromMinutes = (minutes: number | null) => {
    if (minutes === null) return { days: 0, hours: 0, minutes: 0 }
    const days = Math.floor(minutes / (24 * 60))
    const remainingMinutes = minutes % (24 * 60)
    const hours = Math.floor(remainingMinutes / 60)
    const mins = remainingMinutes % 60
    return { days, hours, minutes: mins }
  }
  
  const { days: totalDays, hours: totalHours, minutes: totalMins } = getTimeFromMinutes(formData.estimated_time)
  
  const handleTimeChange = (days: number, hours: number, minutes: number) => {
    setFormData(prev => ({
      ...prev,
      estimated_time: calculateTotalMinutes(days, hours, minutes)
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stage ? 'Edit Stage' : 'Create New Stage'}</DialogTitle>
          <DialogDescription>
            {stage ? 'Update the stage details below' : 'Fill in the details to create a new stage'}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">
              <FileText className="h-4 w-4 mr-2" /> General
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" /> Documents
            </TabsTrigger>
          </TabsList>
          
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <TabsContent value="general" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name">
                    Stage Name
                  </Label>
                </div>
                <div className="md:col-span-3">
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Application Review"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                <div className="space-y-1">
                  <Label htmlFor="description">
                    Description
                  </Label>
                </div>
                <div className="md:col-span-3">
                  <textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Stage description (optional)"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                          <DurationInput
                            days={config.days}
                            hours={config.hours}
                            minutes={config.minutes}
                            onDaysChange={(days) => updateTimeConfig(index, { days })}
                            onHoursChange={(hours) => updateTimeConfig(index, { hours })}
                            onMinutesChange={(minutes) => updateTimeConfig(index, { minutes })}
                            className="mt-1"
                          />
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
                  <div className="space-y-2">
                    <Label>Estimated Duration</Label>
                    <DurationInput
                      days={totalDays}
                      hours={totalHours}
                      minutes={totalMins}
                      onDaysChange={(days) => handleTimeChange(days, totalHours, totalMins)}
                      onHoursChange={(hours) => handleTimeChange(totalDays, hours, totalMins)}
                      onMinutesChange={(minutes) => handleTimeChange(totalDays, totalHours, minutes)}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                <div className="space-y-1">
                  <Label>Follow Up With</Label>
                </div>
                <div className="md:col-span-3">
                  <Select
                    value={formData.follow_up || 'none'}
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      follow_up: value === 'none' ? null : value as 'Client' | 'Officer' | 'BCL'
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select follow up person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No follow up required</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                      <SelectItem value="Officer">Officer</SelectItem>
                      <SelectItem value="BCL">BCL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <StageDocuments 
                documents={formData.documents || []} 
                onChange={updateDocuments} 
              />
            </TabsContent>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {stage ? 'Save Changes' : 'Create Stage'}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
