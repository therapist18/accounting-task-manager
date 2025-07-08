// @ts-nocheck
"use client"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase/client"
import type { FieldSection, MasterField, FieldSource } from "../types/database"
import { toast } from "@/hooks/use-toast"
import type { FieldSection, MasterField } from "../types/database"

interface EnhancedAddFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  sections: FieldSection[]
  initialData?: Partial<MasterField>
}

export function EnhancedAddFieldDialog({ open, onOpenChange, onSuccess, sections, initialData }: EnhancedAddFieldDialogProps) {
  // Remove sections state since it's now passed as prop
  const [formData, setFormData] = useState<Partial<MasterField>>(initialData || {
    field_key: "",
    label: "",
    type: "text",
    is_required: false,
    show_in_table: true,
    show_in_dialog: true,
    col_span: 1,
    has_dependent: false,
    order_index: 0,
    sources: [],
    entity_type: "individual",
    section_id: sections[0]?.id || undefined
  })
  const [optionsText, setOptionsText] = useState("")
  const [loading, setLoading] = useState(false)

  // No need to fetch sections since they are passed as prop

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

      // Find or create the section
      const section = sections.find(s => s.id === formData.section_id);
      if (!section) {
        throw new Error('Selected section not found');
      }

      // Update the section's fields JSON column
      const { error } = await supabase
        .from('tm_field_sections')
        .update({
          fields: {
            ...section.fields,
            [Date.now().toString()]: {
              ...formData,
              options,
              table_header: formData.table_header || formData.label,
              placeholder: formData.placeholder || `Enter ${formData.label}`,
              id: Date.now().toString() // Generate a unique ID for the field
            }
          }
        })
        .eq('id', section.id);

      if (error) throw error

      toast({
        title: "Success",
        description: "Field added successfully",
      })

      onSuccess()
      onOpenChange(false)
      resetForm()
    } catch (error) {
      console.error('Error adding field:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add field",
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
      show_in_table: true,
      show_in_dialog: true,
      col_span: 1,
      has_dependent: false,
      order_index: 0,
      sources: []
    })
    setOptionsText("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Master Field</DialogTitle>
          <DialogDescription>Create a new master field with section assignment and display configuration.</DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
            <TabsTrigger value="sources">Data Sources</TabsTrigger>
          </TabsList>
          
          <form onSubmit={handleSubmit}>
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="field_key">Field Key *</Label>
                  <Input
                    id="field_key"
                    value={formData.field_key}
                    onChange={(e) => setFormData(prev => ({ ...prev, field_key: e.target.value }))}
                    placeholder="e.g., first_name, email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label *</Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g., First Name, Email Address"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="password">Password</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Entity Type *</Label>
                  <Select
                    value={formData.entity_type}
                    onValueChange={(value: any) => setFormData(prev => ({ ...prev, entity_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select
                    value={formData.section_id?.toString()}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, section_id: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map(section => (
                        <SelectItem key={section.id} value={section.id.toString()}>
                          {section.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="placeholder">Placeholder</Label>
                <Input
                  id="placeholder"
                  value={formData.placeholder}
                  onChange={(e) => setFormData(prev => ({ ...prev, placeholder: e.target.value }))}
                  placeholder="Enter placeholder text"
                />
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
            </TabsContent>

            <TabsContent value="display" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="table_header">Table Header</Label>
                  <Input
                    id="table_header"
                    value={formData.table_header}
                    onChange={(e) => setFormData(prev => ({ ...prev, table_header: e.target.value }))}
                    placeholder="Header text for table display"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="col_span">Column Span</Label>
                  <Select
                    value={formData.col_span?.toString()}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, col_span: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Column</SelectItem>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.show_in_table}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_in_table: checked }))}
                  />
                  <Label>Show in Table</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.show_in_dialog}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_in_dialog: checked }))}
                  />
                  <Label>Show in Dialog</Label>
                </div>
              </div>

            </TabsContent>

            <TabsContent value="behavior" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="order_index">Order Index</Label>
                  <Input
                    id="order_index"
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => setFormData(prev => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="callback">Callback Function</Label>
                  <Input
                    id="callback"
                    value={formData.callback}
                    onChange={(e) => setFormData(prev => ({ ...prev, callback: e.target.value }))}
                    placeholder="e.g., updateFullPostalAddress"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.is_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: checked }))}
                  />
                  <Label>Required Field</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.has_dependent}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_dependent: checked }))}
                  />
                  <Label>Has Dependent Fields</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="depends_on">Depends On Field</Label>
                <Input
                  id="depends_on"
                  value={formData.depends_on}
                  onChange={(e) => setFormData(prev => ({ ...prev, depends_on: e.target.value }))}
                  placeholder="field_key that this field depends on"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="static_options">Static Options Reference</Label>
                <Input
                  id="static_options"
                  value={formData.static_options}
                  onChange={(e) => setFormData(prev => ({ ...prev, static_options: e.target.value }))}
                  placeholder="e.g., companyTypeOptions"
                />
              </div>
            </TabsContent>

            <TabsContent value="sources" className="space-y-4">
              {/* Data Source Configuration */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <Select
                    value={formData.sources?.[0]?.source_type || "profile"}
                    onValueChange={(value: "profile" | "document" | "company") => {
                      const newSources = formData.sources || [];
                      newSources[0] = { ...newSources[0], source_type: value };
                      setFormData(prev => ({ ...prev, sources: newSources }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profile">Profile</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Table</Label>
                  <Input
                    value={formData.sources?.[0]?.table || ""}
                    onChange={(e) => {
                      const newSources = formData.sources || [];
                      newSources[0] = { ...newSources[0], table: e.target.value };
                      setFormData(prev => ({ ...prev, sources: newSources }));
                    }}
                    placeholder="Enter table name"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Path</Label>
                  <Input
                    value={formData.sources?.[0]?.path || ""}
                    onChange={(e) => {
                      const newSources = formData.sources || [];
                      newSources[0] = { ...newSources[0], path: e.target.value };
                      setFormData(prev => ({ ...prev, sources: newSources }));
                    }}
                    placeholder="Enter field path"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Input
                    type="number"
                    value={formData.sources?.[0]?.priority || 1}
                    onChange={(e) => {
                      const newSources = formData.sources || [];
                      newSources[0] = { ...newSources[0], priority: parseInt(e.target.value) || 1 };
                      setFormData(prev => ({ ...prev, sources: newSources }));
                    }}
                    placeholder="1"
                  />
                </div>
              </div>
            </TabsContent>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Field"}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}