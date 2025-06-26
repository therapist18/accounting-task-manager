"use client"

import type React from "react"

import { useState } from "react"
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
import type { JobFieldInsert } from "../types/database"

interface AddFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddFieldDialog({ open, onOpenChange, onSuccess }: AddFieldDialogProps) {
  const [formData, setFormData] = useState<Partial<JobFieldInsert>>({
    field_key: "",
    label: "",
    type: "text",
    is_required: false,
    options: null,
    sources: [],
  })
  const [optionsText, setOptionsText] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let options = null
      if (formData.type === "select" && optionsText.trim()) {
        try {
          options = JSON.parse(optionsText)
        } catch {
          // If JSON parsing fails, treat as comma-separated values
          options = optionsText
            .split(",")
            .map((opt) => opt.trim())
            .filter(Boolean)
        }
      }

      const { error } = await supabase.from("tm_job_fields").insert({
        ...formData,
        options,
      } as JobFieldInsert)

      if (error) throw error

      toast({
        title: "Success",
        description: "Field added successfully",
      })

      onSuccess()
      onOpenChange(false)
      resetForm()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add field",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      field_key: "",
      label: "",
      type: "text",
      is_required: false,
      options: null,
      sources: [],
    })
    setOptionsText("")
  }

  const handleClose = () => {
    onOpenChange(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Field</DialogTitle>
          <DialogDescription>Create a new job application field with its configuration.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field_key">Field Key</Label>
            <Input
              id="field_key"
              value={formData.field_key}
              onChange={(e) => setFormData((prev) => ({ ...prev, field_key: e.target.value }))}
              placeholder="e.g., first_name, email, phone"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="e.g., First Name, Email Address"
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
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_required: checked }))}
            />
            <Label htmlFor="is_required">Required field</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
