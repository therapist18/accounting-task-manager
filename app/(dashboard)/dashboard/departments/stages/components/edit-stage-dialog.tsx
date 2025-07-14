// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, User, FileText, Info, Pencil, MessageSquare } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import type { Stage, TimeConfig, StageDocument, DocumentExtraction } from "../types"
import { createKYCDocument, updateKYCDocument } from "../kycDocuments"   

// Simple UUID generator
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
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
    order_num: 1,
    estimated_time: 0,
    follow_up: null,
    isSpecial: false,
    timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
    documents: []
  })
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)

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
        order_num: 1,
        estimated_time: 0,
        follow_up: null,
        isSpecial: false,
        timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
        documents: []
      })
    }
    setActiveTab('general')
  }, [stage, open])

// Updated handleSubmit in edit-stage-dialog.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  const trimmedName = formData.name.trim()
  if (!trimmedName) {
    return
  }
  setSaving(true)
  try {
    // Get department name for KYC documents
    const departmentName = "Applications" // You'll need to pass this from parent component
    
    // Process documents and sync with KYC
    const processedDocs = await Promise.all(
      (formData.documents || []).map(async (doc) => {
        if (doc.name.trim() && !doc.kycId) {
          // Create new KYC document if it doesn't exist
          try {
            const kycId = await createKYCDocument({
              name: doc.name,
              department: departmentName,
              category: 'application-docs',
              document_type: 'one_off',
              fields: doc.extractionSpecs || [],
              display_name: doc.name
            })
            return { ...doc, kycId }
          } catch (error) {
            console.error('Error creating KYC document:', error)
            return doc
          }
        } else if (doc.kycId && doc.name.trim()) {
          // Update existing KYC document
          try {
            await updateKYCDocument(doc.kycId, {
              name: doc.name,
              fields: doc.extractionSpecs || [],
              display_name: doc.name
            })
          } catch (error) {
            console.error('Error updating KYC document:', error)
          }
        }
        return doc
      })
    )

    const updatedStage = {
      ...formData,
      name: trimmedName,
      description: formData.description?.trim() || undefined,
      documents: processedDocs,
      timeConfigs: formData.timeConfigs?.map(tc => ({
        ...tc,
        applicationType: tc.applicationType || 'Default',
        days: tc.days || 0,
        hours: tc.hours || 0,
        minutes: tc.minutes || 0
      })) || []
    }

    await onSave(updatedStage)
    onOpenChange(false)
  } catch (error) {
    console.error('Error saving stage:', error)
    toast({
      title: "Error",
      description: "Failed to save stage. Please try again.",
      variant: "destructive"
    })
  } finally {
    setSaving(false)
  }
}

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target

    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const updateTimeConfig = (index: number, updates: Partial<TimeConfig>) => {
    setFormData(prev => {
      const updatedTimeConfigs = [...(prev.timeConfigs || [])]
      updatedTimeConfigs[index] = { ...updatedTimeConfigs[index], ...updates }

      return {
        ...prev,
        timeConfigs: updatedTimeConfigs
      }
    })
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

  const getTimeFromMinutes = (minutes: number | null) => {
    if (minutes === null) return { days: 0, hours: 0, minutes: 0 }
    const days = Math.floor(minutes / (24 * 60))
    const remainingMinutes = minutes % (24 * 60)
    const hours = Math.floor(remainingMinutes / 60)
    const mins = remainingMinutes % 60
    return { days, hours, minutes: mins }
  }

  const { days: totalDays, hours: totalHours, minutes: totalMins } = getTimeFromMinutes(formData.estimated_time)

  const handleTimeChange = (field: 'days' | 'hours' | 'minutes', value: number) => {
    setFormData(prev => {
      const currentTime = getTimeFromMinutes(prev.estimated_time || 0)
      const newTime = { ...currentTime, [field]: value }
      return {
        ...prev,
        estimated_time: calculateTotalMinutes(newTime.days, newTime.hours, newTime.minutes)
      }
    })
  }

  // Document management functions
  const addDocument = () => {
    const newDoc: StageDocument = {
      id: `doc-${Date.now()}`,
      name: '',
      description: '',
      isRequired: false,
      documentType: 'both',
      extractionSpecs: []
    }
    setFormData(prev => ({
      ...prev,
      documents: [...(prev.documents || []), newDoc]
    }))
    // Switch to the Documents tab when adding a new document
    setActiveTab('documents')
  }

  const updateDocument = (docId: string, updates: Partial<StageDocument>) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents?.map(doc =>
        doc.id === docId ? { ...doc, ...updates } : doc
      )
    }))
  }

  const removeDocument = (docId: string) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents?.filter(doc => doc.id !== docId)
    }))
  }

  const addExtractionField = useCallback((docId: string) => {
    setFormData(prev => {
      const doc = prev.documents?.find(d => d.id === docId);
      if (!doc) return prev;

      const newField: DocumentExtraction = {
        id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fieldName: '',
        description: '',
        isRequired: true,
        fieldType: 'text'
      };

      const updatedDocs = prev.documents?.map(doc =>
        doc.id === docId
          ? {
            ...doc,
            extractionSpecs: [...(doc.extractionSpecs || []), newField]
          }
          : doc
      ) || [];

      // Auto-scroll to the new field
      requestAnimationFrame(() => {
        const fieldElement = document.querySelector(
          `[name^="doc-${docId}-extraction-"][name$="-name"]:last-of-type`
        ) as HTMLInputElement | null;

        if (fieldElement) {
          fieldElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          fieldElement.focus();

          // Set cursor to end of input
          const length = fieldElement.value.length;
          fieldElement.setSelectionRange(length, length);
        }
      });

      return { ...prev, documents: updatedDocs };
    });
  }, []);

  const updateExtraction = useCallback((docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => {
    setFormData(prev => {
      // Only update if there are actual changes
      const doc = prev.documents?.find(d => d.id === docId);
      if (!doc) return prev;

      const extraction = doc.extractionSpecs?.find(e => e.id === extractionId);
      if (!extraction) return prev;

      // Check if any of the updated values are actually different
      const hasChanges = Object.entries(updates).some(
        ([key, value]) => extraction[key as keyof DocumentExtraction] !== value
      );

      if (!hasChanges) return prev;

      const updatedDocs = prev.documents?.map(doc => {
        if (doc.id === docId) {
          const updatedExtractions = (doc.extractionSpecs || []).map(ext =>
            ext.id === extractionId ? { ...ext, ...updates } : ext
          )
          return { ...doc, extractionSpecs: updatedExtractions }
        }
        return doc
      }) || [];

      return { ...prev, documents: updatedDocs };
    });
  }, []);

  const removeExtraction = useCallback((docId: string, extractionId: string) => {
    setFormData(prev => {
      const doc = prev.documents?.find(d => d.id === docId);
      if (!doc || !doc.extractionSpecs?.some(e => e.id === extractionId)) {
        return prev;
      }

      return {
        ...prev,
        documents: prev.documents?.map(doc => {
          if (doc.id === docId) {
            return {
              ...doc,
              extractionSpecs: doc.extractionSpecs?.filter(ext => ext.id !== extractionId) || []
            }
          }
          return doc
        }) || []
      };
    });
  }, []);

  const DocumentsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Stage Documents</h3>
          <p className="text-sm text-muted-foreground">
            Define documents required for this stage and their data extraction requirements
          </p>
        </div>
        <Button onClick={addDocument} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      {formData.documents && formData.documents.length > 0 ? (
        <div className="space-y-4">
          {formData.documents.map((doc, docIndex) => (
            <div key={doc.id} className="border rounded-lg p-4 space-y-4 bg-card">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">Document {docIndex + 1}</h4>
                  {doc.isRequired && (
                    <Badge variant="destructive" className="text-xs">Required</Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {doc.documentType}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDocument(doc.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Document Name *</Label>
                  <Input
                    name={`doc-${doc.id}-name`}
                    value={doc.name || ''}
                    onChange={(e) => updateDocument(doc.id, { name: e.target.value })}
                    placeholder="e.g., Application Form, Passport Copy"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select
                    value={doc.documentType}
                    onValueChange={(value: 'upload' | 'extraction' | 'both') =>
                      updateDocument(doc.id, { documentType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upload">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Upload Only
                        </div>
                      </SelectItem>
                      <SelectItem value="extraction">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Data Extraction Only
                        </div>
                      </SelectItem>
                      <SelectItem value="both">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <Info className="h-4 w-4" />
                          Upload + Extraction
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Input Type</Label>
                  <Select
                    value={doc.inputType || 'file'}
                    onValueChange={(value: 'file' | 'message' | 'both') =>
                      updateDocument(doc.id, { inputType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="file">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          File Upload
                        </div>
                      </SelectItem>
                      <SelectItem value="message">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Message/Text
                        </div>
                      </SelectItem>
                      <SelectItem value="both">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <MessageSquare className="h-4 w-4" />
                          Both
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  name={`doc-${doc.id}-description`}
                  value={doc.description || ''}
                  onChange={(e) => updateDocument(doc.id, { description: e.target.value })}
                  placeholder="Brief description of this document's purpose..."
                  className="resize-none min-h-[80px]"
                  rows={2}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={doc.isRequired}
                  onCheckedChange={(checked) => updateDocument(doc.id, { isRequired: checked as boolean })}
                />
                <Label className="text-sm">This document is required for stage completion</Label>
              </div>

              {(doc.documentType === 'extraction' || doc.documentType === 'both') && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label className="text-sm font-medium">Data Extraction Fields</Label>
                      <p className="text-xs text-muted-foreground">
                        Define what data should be extracted from this document
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addExtractionField(doc.id)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Field
                    </Button>
                  </div>

                  {doc.extractionSpecs && doc.extractionSpecs.length > 0 ? (
                    <div className="space-y-3">
                      {doc.extractionSpecs.map((extraction, extractionIndex) => (
                        <div key={extraction.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end p-3 bg-muted/20 rounded-lg">
                          <div className="space-y-1 col-span-2">
                            <Label className="text-xs">Field Name</Label>
                            <Input
                              name={`doc-${doc.id}-extraction-${extraction.id}-name`}
                              value={extraction.fieldName || ''}
                              onChange={(e) => updateExtraction(doc.id, extraction.id, { fieldName: e.target.value })}
                              placeholder="e.g., Application Date"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1 col-span-2">
                            <Label className="text-xs">Description</Label>
                            <Input
                              name={`doc-${doc.id}-extraction-${extraction.id}-description`}
                              value={extraction.description || ''}
                              onChange={(e) => updateExtraction(doc.id, extraction.id, { description: e.target.value })}
                              placeholder="Optional description"
                              className="h-8"
                            />
                          </div>
                          <div className="pt-4 col-span-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeExtraction(doc.id, extraction.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No extraction fields defined</p>
                      <p className="text-xs">Add fields to specify what data should be extracted</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No documents added yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add documents that are required for this stage
          </p>
          <Button onClick={addDocument} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add First Document
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage ? (
              <>
                <Pencil className="h-5 w-5" />
                Edit Stage: {stage.name}
              </>
            ) : (
              <>
                <Plus className="h-5 w-5" />
                Create New Stage
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {stage ? 'Update the stage details below' : 'Fill in the details to create a new stage'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
              {formData.documents && formData.documents.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 text-xs">
                  {formData.documents.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <TabsContent value="general" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name" className="flex items-center gap-1">
                    Stage Name
                    <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Give this stage a clear, descriptive name
                  </p>
                </div>
                <div className="md:col-span-3">
                  <Input
                    id="name"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., Application Review, Document Verification"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                <div className="space-y-1">
                  <Label htmlFor="description">
                    Description
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Explain what happens in this stage
                  </p>
                </div>
                <div className="md:col-span-3">
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description || ''}
                    onChange={handleInputChange}
                    placeholder="Describe the purpose and activities of this stage..."
                    className="resize-none min-h-[100px]"
                    rows={3}
                  />
                </div>
              </div>

              <div className="space-y-4 border-t pt-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isSpecial"
                    checked={formData.isSpecial}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isSpecial: Boolean(checked) }))}
                  />
                  <div>
                    <Label htmlFor="isSpecial" className="font-medium">
                      Special Time Requirements
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      This stage has different time requirements based on application type
                    </p>
                  </div>
                </div>

                {formData.isSpecial ? (
                  <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Time Configurations
                      </h4>
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

                    {formData.timeConfigs?.map((config, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end p-4 border rounded-lg bg-background">
                        <div className="md:col-span-2">
                          <Label className="text-sm">Application Type</Label>
                          <Input
                            name={`timeConfigs[${index}].applicationType`}
                            value={config.applicationType || ''}
                            onChange={(e) => updateTimeConfig(index, { applicationType: e.target.value })}
                            placeholder="e.g., Standard, Express, Renewal"
                            required
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Days</Label>
                          <Input
                            type="number"
                            name={`timeConfigs[${index}].days`}
                            min="0"
                            value={config.days || 0}
                            onChange={(e) => updateTimeConfig(index, { days: parseInt(e.target.value) || 0 })}
                            className="text-center"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Hours</Label>
                          <Input
                            type="number"
                            name={`timeConfigs[${index}].hours`}
                            min="0"
                            max="23"
                            value={config.hours || 0}
                            onChange={(e) => updateTimeConfig(index, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                            className="text-center"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Minutes</Label>
                          <Input
                            type="number"
                            name={`timeConfigs[${index}].minutes`}
                            min="0"
                            max="59"
                            value={config.minutes || 0}
                            onChange={(e) => updateTimeConfig(index, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                            className="text-center"
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeTimeConfig(index)}
                            disabled={formData.timeConfigs?.length === 1}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Estimated Duration
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        How long should this stage typically take?
                      </p>
                    </div>
                    <div className="md:col-span-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Input
                            type="number"
                            min="0"
                            value={totalDays}
                            onChange={(e) => handleTimeChange('days', parseInt(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Label className="block text-center text-xs text-muted-foreground mt-1">Days</Label>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            value={totalHours}
                            onChange={(e) => handleTimeChange('hours', Math.min(23, parseInt(e.target.value) || 0))}
                            onFocus={(e) => e.target.select()}
                            className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Label className="block text-center text-xs text-muted-foreground mt-1">Hours</Label>
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="0"
                            max="59"
                            value={totalMins}
                            onChange={(e) => handleTimeChange('minutes', Math.min(59, parseInt(e.target.value) || 0))}
                            onFocus={(e) => e.target.select()}
                            className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Label className="block text-center text-xs text-muted-foreground mt-1">Minutes</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 items-start gap-4 border-t pt-6">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Follow Up With
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Who should be contacted when this stage is complete?
                  </p>
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
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <DocumentsTab />
            </TabsContent>

            <div className="flex justify-end gap-2 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !formData.name.trim()}>
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-muted border-t-current rounded-full animate-spin mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    {stage ? 'Save Changes' : 'Create Stage'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}