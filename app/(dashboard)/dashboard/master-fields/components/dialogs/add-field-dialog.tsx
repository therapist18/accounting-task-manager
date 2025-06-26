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
  
  // State for table and field selection
  const [tables, setTables] = useState<Array<{name: string, label: string}>>([])
  const [selectedTable, setSelectedTable] = useState<string>("")
  const [fields, setFields] = useState<Array<{name: string, type: string}>>([])
  const [selectedField, setSelectedField] = useState<string>("")
  const [loadingTables, setLoadingTables] = useState(false)
  const [loadingFields, setLoadingFields] = useState(false)
  const [sourceType, setSourceType] = useState<"profile" | "document" | "company">("profile")

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

      // Prepare sources array if table and field are selected
      const sources = selectedTable && selectedField ? [{
        source_type: sourceType,
        table: selectedTable,
        path: selectedField,
        priority: 1
      }] : []

      const { error } = await supabase.from("tm_job_fields").insert({
        ...formData,
        options,
        sources,
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
      options: null,
      sources: [],
    })
    setOptionsText("")
    setSelectedTable("")
    setSelectedField("")
    setSourceType("profile")
    setFields([])
  }

  // Fetch available tables
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoadingTables(true)
        const { data, error } = await supabase.rpc('get_all_tables')
        if (error) throw error
        
        const formattedTables = data
          .filter((table: { table_name: string }) => table.table_name && !table.table_name.startsWith('pg_') && !table.table_name.startsWith('sql_'))
          .map((table: { table_name: string }) => ({
            name: table.table_name,
            label: table.table_name
              .split('_')
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ')
          }))
          .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label))
        
        setTables(formattedTables)
      } catch (error) {
        console.error('Error fetching tables:', error)
        toast({
          title: "Error",
          description: "Failed to fetch database tables",
          variant: "destructive",
        })
      } finally {
        setLoadingTables(false)
      }
    }

    if (open) {
      fetchTables()
    }
  }, [open])

  // Fetch fields when table is selected
  useEffect(() => {
    const fetchFields = async () => {
      if (!selectedTable) return
      
      try {
        setLoadingFields(true)
        const { data, error } = await supabase.rpc('get_table_columns', {
          table_name: selectedTable
        })
        
        if (error) throw error
        
        const formattedFields = data.map((col: { column_name: string; data_type: string }) => ({
          name: col.column_name,
          type: col.data_type
        }))
        
        setFields(formattedFields)
      } catch (error) {
        console.error('Error fetching table fields:', error)
        toast({
          title: "Error",
          description: `Failed to fetch fields for table ${selectedTable}`,
          variant: "destructive",
        })
      } finally {
        setLoadingFields(false)
      }
    }

    fetchFields()
  }, [selectedTable])

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

          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium">Data Source (Optional)</h4>
            
            <div className="space-y-2">
              <Label htmlFor="source_type">Source Type</Label>
              <Select
                value={sourceType}
                onValueChange={(value: "profile" | "document" | "company") => setSourceType(value)}
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
              <Label htmlFor="table">Table</Label>
              <Select
                value={selectedTable}
                onValueChange={setSelectedTable}
                disabled={loadingTables}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTables ? "Loading tables..." : "Select a table"} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.name} value={table.name}>
                      {table.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTable && (
              <div className="space-y-2">
                <Label htmlFor="field">Field</Label>
                <Select
                  value={selectedField}
                  onValueChange={setSelectedField}
                  disabled={loadingFields || !selectedTable}
                >
                  <SelectTrigger>
                    <SelectValue 
                      placeholder={loadingFields ? "Loading fields..." : "Select a field"} 
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.name} value={field.name}>
                        {field.name} <span className="text-muted-foreground text-xs ml-2">({field.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
