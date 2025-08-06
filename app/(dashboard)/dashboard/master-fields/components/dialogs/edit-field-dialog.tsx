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
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { JobField, JobFieldUpdate } from "../types/database"

interface EditFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onSuccess: () => void
  availableFields?: Array<{ id: string; label: string; type: string }>
}

export function EditFieldDialog({ open, onOpenChange, field, onSuccess, availableFields = [] }: EditFieldDialogProps) {
  const [formData, setFormData] = useState<Partial<JobFieldUpdate> & { fieldType: 'normal' | 'dropdown'; dependentFieldId?: string }>({ fieldType: 'normal' })
  const [optionsText, setOptionsText] = useState("")
  const [loading, setLoading] = useState(false)
  const [isDependent, setIsDependent] = useState(false)
  
  // Filter available fields to only show dropdown fields for dependency selection
  const dropdownFields = availableFields.filter(f => f.type === 'select' && f.id !== field?.id)

  useEffect(() => {
    if (field) {
      const isDropdown = field.type === 'select'
      const dependentField = field.sources?.find(s => s.source_type === 'field')
      
      setFormData({
        field_key: field.field_key,
        label: field.label,
        type: field.type,
        is_required: field.is_required,
        fieldType: isDropdown ? 'dropdown' : 'normal',
        dependentFieldId: dependentField?.table
      })
      
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
      setFormData({ fieldType: 'normal' })
      setOptionsText("")
      setIsDependent(false)
    }
  }, [field])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return

    setLoading(true)

    try {
      let options = null
      let sources = []
      
      if (formData.fieldType === 'dropdown') {
        try {
          options = optionsText.trim() ? JSON.parse(optionsText) : []
        } catch {
          options = optionsText
            .split(",")
            .map((opt) => opt.trim())
            .filter(Boolean)
        }
        
        if (isDependent && formData.dependentFieldId) {
          sources = [
            ...(field.sources || []).filter(s => s.source_type !== 'field'),
            {
              source_type: 'field' as const,
              table: formData.dependentFieldId,
              path: '',
              priority: 1
            }
          ]
        } else {
          sources = (field.sources || []).filter(s => s.source_type !== 'field')
        }
      }

      const updateData: any = {
        ...formData,
        type: formData.fieldType === 'dropdown' ? 'select' : formData.type,
        options,
        sources,
        updated_at: new Date().toISOString(),
      }
      
      delete updateData.fieldType
      delete updateData.dependentFieldId

      const { error } = await supabase
        .from("tm_job_fields")
        .update(updateData)
        .eq("id", field.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Field updated successfully",
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error(error)
      toast({
        title: "Error",
        description: "Failed to update field",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!field) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Field</DialogTitle>
          <DialogDescription>Update the field configuration and settings.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field_key">Field Key</Label>
            <Input
              id="field_key"
              value={formData.field_key || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, field_key: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={formData.label || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Field Type</Label>
              <div className="flex space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="normalField"
                    name="fieldType"
                    checked={formData.fieldType === 'normal'}
                    onChange={() => setFormData(prev => ({ ...prev, fieldType: 'normal' }))}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="normalField">Normal Field</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="dropdownField"
                    name="fieldType"
                    checked={formData.fieldType === 'dropdown'}
                    onChange={() => setFormData(prev => ({ ...prev, fieldType: 'dropdown' }))}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="dropdownField">Dropdown Field</Label>
                </div>
              </div>
            </div>

            {formData.fieldType === 'normal' && (
              <div className="space-y-2">
                <Label htmlFor="type">Input Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  <Label htmlFor="options">Options</Label>
                  <Textarea
                    id="options"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    placeholder='JSON array: ["Option 1", "Option 2"] or comma-separated: Option 1, Option 2'
                    rows={3}
                    disabled={isDependent}
                  />
                  {isDependent && (
                    <p className="text-sm text-muted-foreground">
                      Options will be populated from the selected field
                    </p>
                  )}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
