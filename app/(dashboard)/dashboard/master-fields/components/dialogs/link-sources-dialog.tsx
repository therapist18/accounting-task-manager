"use-client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { ComboBox } from "@/components/ui/combobox"
import type { JobField, JobFieldSource } from "../types/database"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

interface LinkSourcesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onSuccess: () => void
}

interface TableColumn {
  column_name: string
  data_type: string
  is_jsonb: boolean
  jsonb_properties?: Array<{
    id: string
    name: string
    type: string
    properties?: Array<{
      id: string
      name: string
      type: string
    }>
  }>
}

// Extend the source type with UI-specific state
type SourceCardState = JobFieldSource & {
  id: string
  fields: TableColumn[]
  loadingFields: boolean
}

export function LinkSourcesDialog({ open, onOpenChange, field, onSuccess }: LinkSourcesDialogProps) {
  const [sources, setSources] = useState<SourceCardState[]>([])
  const [loading, setLoading] = useState(false)
  const [tables, setTables] = useState<Array<{ name: string; label: string }>>([])
  const [loadingTables, setLoadingTables] = useState(false)

  // Fetch all available tables when dialog opens
  useEffect(() => {
    const fetchTables = async () => {
      if (!open) return
      try {
        setLoadingTables(true)
        const { data, error } = await supabase.rpc("get_all_tables")
        if (error) throw error

        const formattedTables = data
          .filter(
            (table: { table_name: string }) =>
              table.table_name && !table.table_name.startsWith("pg_") && !table.table_name.startsWith("sql_"),
          )
          .map((table: { table_name: string }) => ({
            name: table.table_name,
            label: table.table_name.split("_").map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
          }))
          .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label))

        setTables(formattedTables)
      } catch (error) {
        console.error("Error fetching tables:", error)
        toast({ title: "Error", description: "Failed to fetch database tables", variant: "destructive" })
      } finally {
        setLoadingTables(false)
      }
    }
    fetchTables()
  }, [open])

  // Initialize and update sources state when the field prop changes
  useEffect(() => {
    if (field) {
      const initialSources =
        field.sources?.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          fields: [],
          loadingFields: false,
        })) || []
      setSources(initialSources)
    }
  }, [field])

  // Fetch fields for a specific source card
  const fetchFieldsForSource = useCallback(async (index: number, tableName: string) => {
    if (!tableName) return

    setSources((prev) =>
      prev.map((s, i) => (i === index ? { ...s, loadingFields: true, fields: [], path: "" } : s)),
    )

    try {
      const { data, error } = await supabase.rpc("get_table_columns", { input_table_name: tableName })
      if (error) throw error
      setSources((prev) => prev.map((s, i) => (i === index ? { ...s, fields: data || [], loadingFields: false } : s)))
    } catch (error) {
      console.error(`Error fetching fields for ${tableName}:`, error)
      toast({ title: "Error", description: `Failed to fetch fields for table ${tableName}`, variant: "destructive" })
      setSources((prev) => prev.map((s, i) => (i === index ? { ...s, loadingFields: false } : s)))
    }
  }, [])

  // Effect to fetch fields for existing sources on load
  useEffect(() => {
    if (open && sources.length > 0 && tables.length > 0) {
      sources.forEach((source, index) => {
        if (source.table && source.fields.length === 0 && !source.loadingFields) {
          fetchFieldsForSource(index, source.table)
        }
      })
    }
  }, [open, sources, tables.length, fetchFieldsForSource])

  const addSource = () => {
    setSources((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        source_type: "profile",
        table: "",
        path: "",
        priority: prev.length + 1,
        fields: [],
        loadingFields: false,
      },
    ])
  }

  const updateSource = (index: number, updates: Partial<SourceCardState>) => {
    setSources((prev) =>
      prev.map((source, i) => (i === index ? { ...source, ...updates } : source)),
    )
    if ("table" in updates && updates.table) {
      fetchFieldsForSource(index, updates.table)
    }
  }

  const removeSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return

    setLoading(true)

    try {
      // Strip UI-specific properties before saving
      const sourcesToSave: JobFieldSource[] = sources.map(({ id, fields, loadingFields, ...rest }) => rest)

      const { error } = await supabase
        .from("tm_job_fields")
        .update({
          sources: sourcesToSave,
          updated_at: new Date().toISOString(),
        })
        .eq("id", field.id)

      if (error) throw error

      toast({ title: "Success", description: "Sources updated successfully" })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({ title: "Error", description: "Failed to update sources", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  if (!field) return null

  // Helper to parse the path for UI selection
  const getSelectedFieldFromPath = (path: string) => path.split("->")[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Link Data Sources</DialogTitle>
          <DialogDescription>
            Configure data sources for field: <strong>{field.label}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} id="link-sources-form" className="flex-1 overflow-y-auto -mr-4 pr-4 space-y-4">
          {sources.map((source, index) => {
            const selectedField = getSelectedFieldFromPath(source.path)
            const fieldIsJsonb = source.fields.find((f) => f.column_name === selectedField)?.is_jsonb

            return (
              <Card key={source.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Source {index + 1}
                      <Badge variant="outline" className="ml-2 capitalize">{source.source_type}</Badge>
                    </CardTitle>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeSource(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Source Type</Label>
                      <ComboBox
                        value={source.source_type}
                        onValueChange={(value) => updateSource(index, { source_type: value as any })}
                        options={[
                          { value: "profile", label: "Profile" },
                          { value: "document", label: "Document" },
                          { value: "company", label: "Company" },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        value={source.priority}
                        onChange={(e) => updateSource(index, { priority: Number.parseInt(e.target.value) || 1 })}
                        min="1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Table</Label>
                    <ComboBox
                      value={source.table}
                      onValueChange={(value) => updateSource(index, { table: value })}
                      loading={loadingTables}
                      options={tables.map((t) => ({ value: t.name, label: t.label, description: t.name }))}
                      placeholder="Select a table..."
                    />
                  </div>
                  {source.table && (
                    <div className="space-y-2">
                      <Label>Field / Path</Label>
                      <ComboBox
                        value={selectedField}
                        onValueChange={(value) => updateSource(index, { path: value })}
                        loading={source.loadingFields}
                        disabled={!source.table}
                        options={source.fields.map((f) => ({ value: f.column_name, label: f.column_name, description: f.data_type }))}
                        placeholder="Select a field..."
                      />
                    </div>
                  )}
                  {fieldIsJsonb && (
                    <div className="mt-2 pl-4 border-l-2 border-muted">
                      <Label>JSON Property</Label>
                      <ComboBox
                        value={source.path.includes("->") ? source.path : ""}
                        onValueChange={(value) => updateSource(index, { path: value })}
                        options={(source.fields.find(f => f.column_name === selectedField)?.jsonb_properties ?? []).flatMap(prop => {
                            const baseItem = { value: `${selectedField}->>'${prop.name}'`, label: `${prop.name} (${prop.type})` };
                            return prop.properties?.length
                              ? [baseItem, ...prop.properties.map(nested => ({
                                  value: `${selectedField}->'${prop.name}'->>'${nested.name}'`,
                                  label: `${prop.name}.${nested.name} (${nested.type})`,
                                  className: 'pl-6'
                                }))]
                              : [baseItem];
                          })}
                        placeholder="Select a JSON property..."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
          <Button type="button" variant="outline" onClick={addSource} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        </form>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="link-sources-form" disabled={loading}>
            {loading ? "Saving..." : "Save Sources"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}