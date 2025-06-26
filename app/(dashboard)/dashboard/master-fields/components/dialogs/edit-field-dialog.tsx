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
}

export function EditFieldDialog({ open, onOpenChange, field, onSuccess }: EditFieldDialogProps) {
  const [formData, setFormData] = useState<Partial<JobFieldUpdate>>({})
  const [optionsText, setOptionsText] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (field) {
      setFormData({
        field_key: field.field_key,
        label: field.label,
        type: field.type,
        is_required: field.is_required,
      })

      if (field.options) {
        setOptionsText(
          Array.isArray(field.options)
            ? JSON.stringify(field.options, null, 2)
            : JSON.stringify(field.options, null, 2),
        )
      } else {
        setOptionsText("")
      }
    }
  }, [field])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return

    setLoading(true)

    try {
      let options = null
      if (formData.type === "select" && optionsText.trim()) {
        try {
          options = JSON.parse(optionsText)
        } catch {
          options = optionsText
            .split(",")
            .map((opt) => opt.trim())
            .filter(Boolean)
        }
      }

      const { error } = await supabase
        .from("tm_job_fields")
        .update({
          ...formData,
          options,
          updated_at: new Date().toISOString(),
        })
        .eq("id", field.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Field updated successfully",
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
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

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
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
                <SelectItem value="select">Select</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type === "select" && (
            <div className="space-y-2">
              <Label htmlFor="options">Options</Label>
              <Textarea
                id="options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder='JSON array: ["Option 1", "Option 2"] or comma-separated: Option 1, Option 2'
                rows={3}
              />
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
