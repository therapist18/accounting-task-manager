// @ts-nocheck
"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { JobField, JobFieldUpdate } from "../types/database"
import { MultiSelectDocumentTypes } from "../ui/multi-select-document-types"
            
interface EditFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onSuccess: () => void
  availableFields?: Array<{ id: string; label: string; type: string }>
}

export function EditFieldDialog({ open, onOpenChange, field, onSuccess, availableFields = [] }: EditFieldDialogProps) {
  const [formData, setFormData] = useState<Partial<JobFieldUpdate> & {
    fieldType: 'normal' | 'dropdown';
    dependentFieldId?: string;
    date_config?: {
      useCurrentDate?: boolean;
      defaultDate?: string;
      format?: string;
    };
    // Document type related state
    documentTypes: Array<{ value: string; label: string }>;
    selectedDocumentTypes: string[];
    linkingVariable: "id" | "director_id" | null;
  }>({
    fieldType: 'normal',
    date_config: {
      useCurrentDate: true,
      format: 'YYYY-MM-DD'
    },
    documentTypes: [],
    selectedDocumentTypes: [],
    linkingVariable: null
  })
  const [optionsText, setOptionsText] = useState("")
  const [loading, setLoading] = useState(false)
  const [isDependent, setIsDependent] = useState(false)

  // Filter available fields to only show dropdown fields for dependency selection
  const dropdownFields = availableFields.filter(f => f.type === 'select' && f.id !== field?.id)

  // Fetch document types when dialog opens
  useEffect(() => {
    const fetchDocumentTypes = async () => {
      try {
        const { data: docTypes, error } = await supabase
          .from('acc_portal_kyc')
          .select('id, display_name')
          .order('display_name', { ascending: true })

        if (error) throw error

        const formattedDocTypes = docTypes.map((dt: { id: string; name: string }) => ({
          value: dt.id,
          label: dt.name
        }))

        setFormData(prev => ({
          ...prev,
          documentTypes: formattedDocTypes
        }))
      } catch (error) {
        console.error("Error fetching document types:", error)
        toast({
          title: "Error",
          description: "Failed to fetch document types",
          variant: "destructive"
        })
      }
    }

    if (open) {
      fetchDocumentTypes()
    }
  }, [open])

  useEffect(() => {
    if (field) {
      const isDropdown = field.type === 'select'
      const dependentField = field.sources?.find(s => s.source_type === 'field')
      const documentSource = field.sources?.find(s => s.source_type === 'document')

      setFormData(prev => ({
        ...prev,
        field_key: field.field_key,
        label: field.label,
        type: field.type,
        is_required: field.is_required,
        fieldType: isDropdown ? 'dropdown' : 'normal',
        dependentFieldId: dependentField?.table,
        selectedDocumentTypes: documentSource?.document_id || [],
        linkingVariable: documentSource?.linking_variable || null,
        date_config: field.date_config || {
          useCurrentDate: true,
          format: 'YYYY-MM-DD'
        }
      }))

      setIsDependent(!!dependentField)

      if (field.options) {
        setOptionsText(
          Array.isArray(field.options)
            ? JSON.stringify(field.options, null, 2)
            : JSON.stringify(field.options, null, 2),
        )
      } else {
        setOptionsText("")
      }
    } else {
      setFormData(prev => ({
        ...prev,
        fieldType: 'normal',
        selectedDocumentTypes: [],
        linkingVariable: null
      }))
      setOptionsText("")
      setIsDependent(false)
    }
  }, [field])

  // Initialize options variable with a default empty array
  let options: any[] = []

  if (formData.fieldType === 'dropdown' && !isDependent) {
    try {
      options = JSON.parse(optionsText)
    } catch {
      options = optionsText.split(',').map(opt => opt.trim()).filter(Boolean)
    }
  } else if (field?.options) {
    options = Array.isArray(field.options) ? field.options : []
  }

  // Prepare sources array
  const sources: any[] = []

  // Add dependent field source if this is a dependent dropdown
  if (isDependent && formData.dependentFieldId) {
    sources.push({
      source_type: 'field',
      table: formData.dependentFieldId,
      path: 'id',
      priority: 1
    })
  }

  // Add document source if source type is document
  if (field) {
    const documentSource = field.sources?.find(s => s.source_type === 'document')
    if (documentSource) {
      sources.push({
        ...documentSource,
        document_id: formData.selectedDocumentTypes?.length ? formData.selectedDocumentTypes : null,
        linking_variable: formData.linkingVariable || null
      })
    }
  }

  const updateData: JobFieldUpdate = {
    field_key: formData.field_key || field?.field_key || '',
    label: formData.label || field?.label || '',
    type: formData.fieldType === 'dropdown' ? 'select' : (formData.type || field?.type || 'text'),
    is_required: formData.is_required ?? field?.is_required ?? false,
    options,
    sources,
    date_config: formData.type === 'date' ? {
      useCurrentDate: formData.date_config?.useCurrentDate,
      defaultDate: formData.date_config?.defaultDate,
      format: formData.date_config?.format
    } : undefined,
    updated_at: new Date().toISOString()
  }

  delete updateData.fieldType
  delete updateData.dependentFieldId

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return

    setLoading(true)

    try {
      const { error } = await supabase
        .from('tm_job_fields')
        .update(updateData)
        .eq('id', field.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Field updated successfully",
      })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating field:", error)
      toast({
        title: "Error",
        description: "Failed to update field",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Field</DialogTitle>
          <DialogDescription>Update the field configuration and settings.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field-key">Field Key</Label>
            <Input
              id="field-key"
              value={formData.field_key || ''}
              onChange={(e) => setFormData({ ...formData, field_key: e.target.value })}
              placeholder="Enter field key (snake_case)"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={formData.label || ''}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Enter display label"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Field Type</Label>
            <Select
              value={formData.type || ''}
              onValueChange={(value) => setFormData({
                ...formData,
                type: value as any,
                fieldType: value === 'select' ? 'dropdown' : 'normal',
                date_config: value === 'date' ? (formData.date_config || { useCurrentDate: true, format: 'YYYY-MM-DD' }) : undefined
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select field type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="select">Dropdown</SelectItem>
                <SelectItem value="image">Image</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'date' && (
            <div className="space-y-4 border-t pt-4">
              <Label>Date Configuration</Label>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-current-date"
                    checked={formData.date_config?.useCurrentDate ?? true}
                    onCheckedChange={(checked) =>
                      setFormData(prev => ({
                        ...prev,
                        date_config: {
                          ...prev.date_config,
                          useCurrentDate: checked as boolean,
                        },
                      }))
                    }
                  />
                  <Label htmlFor="use-current-date" className="font-normal">
                    Use current date automatically
                  </Label>
                </div>
                
                {!(formData.date_config?.useCurrentDate ?? true) && (
                  <div className="space-y-2">
                    <Label htmlFor="default-date">Default Date</Label>
                    <Input
                      id="default-date"
                      type="date"
                      value={formData.date_config?.defaultDate || ''}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          date_config: {
                            ...prev.date_config,
                            defaultDate: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="date-format">Date Format</Label>
                  <Select
                    value={formData.date_config?.format || 'YYYY-MM-DD'}
                    onValueChange={(value) =>
                      setFormData(prev => ({
                        ...prev,
                        date_config: {
                          ...prev.date_config,
                          format: value,
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select date format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (e.g., 2023-12-31)</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (e.g., 12/31/2023)</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (e.g., 31/12/2023)</SelectItem>
                      <SelectItem value="MMMM D, YYYY">MMMM D, YYYY (e.g., December 31, 2023)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Source Type</Label>
            <Select
              value={formData.source_type || ''}
              onValueChange={(value) => {
                const newSourceType = value as any
                setFormData({
                  ...formData,
                  source_type: newSourceType,
                  // Reset document-related fields when source type changes
                  ...(newSourceType !== 'document' && {
                    selectedDocumentTypes: [],
                    linkingVariable: null
                  })
                })
              }}
              disabled={isDependent}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profile">Profile</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>

            {/* Document Type Selection (only for document source type) */}
            {formData.source_type === 'document' && (
              <>
                <div className="space-y-2 mt-4">
                  <Label>Document Types</Label>
                  <MultiSelectDocumentTypes
                    options={formData.documentTypes || []}
                    selectedValues={formData.selectedDocumentTypes || []}
                    onSelect={(value) => {
                      if (!formData.selectedDocumentTypes?.includes(value)) {
                        setFormData({
                          ...formData,
                          selectedDocumentTypes: [...(formData.selectedDocumentTypes || []), value]
                        })
                      }
                    }}
                    onRemove={(value) => {
                      setFormData({
                        ...formData,
                        selectedDocumentTypes: formData.selectedDocumentTypes?.filter(v => v !== value) || []
                      })
                    }}
                    onClear={() => {
                      setFormData({
                        ...formData,
                        selectedDocumentTypes: [],
                        linkingVariable: null
                      })
                    }}
                    placeholder="Select document types..."
                    emptyMessage="No document types found."
                  />
                </div>

                {formData.selectedDocumentTypes?.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Label>Linking Variable</Label>
                    <Select
                      value={formData.linkingVariable || ''}
                      onValueChange={(value: "id" | "director_id") =>
                        setFormData({ ...formData, linkingVariable: value })
                      }
                      disabled={!formData.selectedDocumentTypes?.length}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select linking variable" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="id">Document ID</SelectItem>
                        <SelectItem value="director_id">Director ID</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select how to link to the document (e.g., by document ID or director ID)
                    </p>
                  </div>
                )}
              </>
            )}

                  </div>

          {formData.fieldType === 'dropdown' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isDependent"
                    checked={isDependent}
                    onCheckedChange={setIsDependent}
                  />
                  <Label htmlFor="isDependent">Dependent on another field</Label>
                </div>
                {isDependent && dropdownFields.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="dependentField">Depends on</Label>
                    <Select
                      value={formData.dependentFieldId || ''}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, dependentFieldId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a field" />
                      </SelectTrigger>
                      <SelectContent>
                        {dropdownFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {!isDependent && (
                <div className="space-y-2">
                  <Label htmlFor="options">Options (comma-separated or JSON array)</Label>
                  <Textarea
                    id="options"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                  placeholder='JSON array: ["Option 1", "Option 2"] or comma-separated: Option 1, Option 2'
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Switch
              id="is_required"
              checked={formData.is_required || false}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_required: checked }))}
            />
            <Label htmlFor="is_required">Required field</Label>
          </div>

          <DialogFooter className="mt-6">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update Field"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
