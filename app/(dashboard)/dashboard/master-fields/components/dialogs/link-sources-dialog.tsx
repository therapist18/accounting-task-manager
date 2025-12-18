// @ts-nocheck
"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
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
import { Check, ChevronsUpDown, Plus, Trash2, X } from "lucide-react"
import { ComboBox } from "@/components/ui/combobox"
import type { JobField, JobFieldSource } from "../types/database"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

interface LinkSourcesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onSuccess: () => void
}

// --- START: Updated Type Definitions for new JSONB structure ---
// Structure for the arrayConfig inside a JSONB property
interface JsonbArrayConfig {
  fields: Array<{
    id: string
    name: string
    type: string
    parentField: string
  }>
  maxItems: number
}

// Structure for a single property within the jsonb_properties array
interface JsonbProperty {
  id: string
  name: string
  type: string
  isArray?: boolean
  arrayConfig?: JsonbArrayConfig
}

// Represents a database column, now with an array of JSONB properties
interface TableColumn {
  column_name: string
  data_type: string
  is_jsonb: boolean
  jsonb_properties?: JsonbProperty[] | null
}
// --- END: Updated Type Definitions ---

// Extend the source type with UI-specific state
type SourceCardState = JobFieldSource & {
  id: string
  fields: TableColumn[]
  loadingFields: boolean
  document_id?: string[] | null
  linking_variable?: "id" | "director_id" | "kyc_document_id" | null
}

function MultiSelectDocumentTypes({
  options,
  selectedValues = [],
  onSelect,
  onRemove,
  onClear,
  placeholder = "Select items...",
  emptyMessage = "No items found."
}: {
  options: Array<{ value: string; label: string }>
  selectedValues: string[]
  onSelect: (value: string) => void
  onRemove: (value: string) => void
  onClear: () => void
  placeholder?: string
  emptyMessage?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredOptions = useMemo(() => {
    if (!search) return options
    const searchLower = search.toLowerCase()
    return options.filter(option =>
      option.label.toLowerCase().includes(searchLower) ||
      option.value.toLowerCase().includes(searchLower)
    )
  }, [options, search])

  const selectedItems = useMemo(() =>
    options.filter(option => selectedValues.includes(option.value)),
    [options, selectedValues]
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedItems.length > 0
                  ? `${selectedItems.length} selected`
                  : placeholder}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredOptions.map((option) => {
                    const isSelected = selectedValues.includes(option.value)
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => {
                          if (isSelected) {
                            onRemove(option.value)
                          } else {
                            onSelect(option.value)
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="truncate">{option.label}</div>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedItems.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Selected items chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedItems.map(item => (
            <Badge
              key={item.value}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5"
            >
              {item.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.value)
                }}
                className="rounded-full hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function LinkSourcesDialog({ open, onOpenChange, field, onSuccess }: LinkSourcesDialogProps) {
  const [sources, setSources] = useState<SourceCardState[]>([])
  const [loading, setLoading] = useState(false)
  const [tables, setTables] = useState<Array<{ name: string; label: string }>>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [documentTypes, setDocumentTypes] = useState<Array<{ value: string; label: string }>>([])
  const [loadingDocumentTypes, setLoadingDocumentTypes] = useState(false)
  const [selectedDocumentTypes, setSelectedDocumentTypes] = useState<string[]>([])

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
            label: table.table_name
              .split("_")
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" "),
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

  // Fetch document types if a source type is 'document'
  useEffect(() => {
    const fetchDocumentTypes = async () => {
      if (sources.some(s => s.source_type === "document")) {
        try {
          setLoadingDocumentTypes(true)
          const { data, error } = await supabase.from("acc_portal_kyc").select("id, display_name")
          if (error) throw error

          // --- FIX APPLIED HERE ---
          // Added `|| ""` to ensure the label is always a string, even if
          // `display_name` from the database is null. This prevents the crash.
          const formattedDocTypes = data.map(doc => ({
            value: doc.id,
            label: doc.display_name || "",
          }));

          setDocumentTypes(formattedDocTypes);

          // Initialize selected document types from existing sources
          const docSource = sources.find(s => s.source_type === "document");
          if (docSource?.document_id) {
            setSelectedDocumentTypes(Array.isArray(docSource.document_id) ? docSource.document_id : [docSource.document_id]);
          }
        } catch (error) {
          console.error("Error fetching document types:", error)
          toast({ title: "Error", description: "Failed to fetch document types", variant: "destructive" })
        } finally {
          setLoadingDocumentTypes(false)
        }
      }
    }
    fetchDocumentTypes()
  }, [sources])

  // Initialize and update sources state when the field prop changes
  useEffect(() => {
    if (field) {
      const initialSources =
        field.sources?.map(s => ({
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

    setSources(prev => prev.map((s, i) => (i === index ? { ...s, loadingFields: true } : s)))

    try {
      const { data, error } = await supabase.rpc("get_table_columns", { input_table_name: tableName })
      if (error) throw error
      setSources(prev => prev.map((s, i) => (i === index ? { ...s, fields: data || [], loadingFields: false } : s)))
    } catch (error) {
      console.error(`Error fetching fields for ${tableName}:`, error)
      toast({ title: "Error", description: `Failed to fetch fields for table ${tableName}`, variant: "destructive" })
      setSources(prev => prev.map((s, i) => (i === index ? { ...s, loadingFields: false } : s)))
    }
  }, [])

  // Effect to fetch fields for existing sources on load
  useEffect(() => {
    if (open && sources.length > 0) {
      sources.forEach((source, index) => {
        if (source.table && source.fields.length === 0 && !source.loadingFields) {
          fetchFieldsForSource(index, source.table)
        }
      })
    }
  }, [open, sources, fetchFieldsForSource])

  const addSource = () => {
    setSources(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        source_type: "individual",
        table: "",
        path: "",
        priority: prev.length + 1,
        fields: [],
        loadingFields: false,
        document_id: [],
        linking_variable: "id",
      },
    ])
    setSelectedDocumentTypes([])
  }

  const updateSource = (index: number, updates: Partial<SourceCardState>) => {
    setSources(prev => {
      const updated = prev.map((source, i) => (i === index ? { ...source, ...updates } : source));

      // Update selectedDocumentTypes when document_id changes
      if ('document_id' in updates) {
        const docSource = updated.find(s => s.source_type === "document");
        if (docSource?.document_id) {
          setSelectedDocumentTypes(Array.isArray(docSource.document_id) ? docSource.document_id : [docSource.document_id]);
        } else {
          setSelectedDocumentTypes([]);
        }
      }

      return updated;
    });

    if ("table" in updates && updates.table) {
      fetchFieldsForSource(index, updates.table)
    }
  }

  const removeSource = (index: number) => {
    setSources(prev => prev.filter((_, i) => i !== index))
  }

  const generateJsonbPathOptions = (columnSpec: TableColumn): Array<{ value: string; label: string; className?: string }> => {
    const columnName = columnSpec.column_name
    const props = columnSpec.jsonb_properties

    if (!props || !Array.isArray(props)) {
      return [
        { value: columnName, label: `${columnName} (Full Object)` },
        { value: `${columnName}->>'key'`, label: `Extract text key (e.g., a->>'b')`, className: "text-muted-foreground" },
      ]
    }

    const options: Array<{ value: string; label: string; className?: string }> = []
    options.push({ value: columnName, label: `${columnName} (Full Object)` })

    props.forEach(prop => {
      const propName = prop.name.replace(/'/g, "''").trim()

      if (prop.isArray && prop.arrayConfig?.fields) {
        prop.arrayConfig.fields.forEach(field => {
          const fieldName = field.name.replace(/'/g, "''").trim()
          options.push({
            value: `${columnName}->'${propName}'->[INDEX]->>'${fieldName}'`,
            label: `${fieldName} (from ${propName})`,
            className: "pl-4",
          })
        })
      } else if (!prop.isArray) {
        options.push({
          value: `${columnName}->>'${propName}'`,
          label: `${propName} (top-level property)`,
        })
      }
    })

    return options
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return

    setLoading(true)

    try {
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

  const getSelectedFieldFromPath = (path: string) => (path ? path.split("->")[0] : "")

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
            const columnSpec = source.fields.find(f => f.column_name === selectedField)
            const fieldIsJsonb = columnSpec?.is_jsonb

            return (
              <Card key={source.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Source {index + 1}
                      <Badge variant="outline" className="ml-2 capitalize">
                        {source.source_type}
                      </Badge>
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
                        onValueChange={value => updateSource(index, { source_type: value as any })}
                        options={[
                          { value: "individual", label: "Individual" },
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
                        onChange={e => updateSource(index, { priority: Number.parseInt(e.target.value) || 1 })}
                        min="1"
                      />
                    </div>
                  </div>
                  {source.source_type === "document" && (
                    <div className="space-y-2">
                      <Label>Document Types</Label>
                      <MultiSelectDocumentTypes
                        options={documentTypes}
                        selectedValues={source.document_id || []}
                        onSelect={(value) => {
                          updateSource(index, {
                            document_id: [...(source.document_id || []), value]
                          })
                        }}
                        onRemove={(value) => {
                          updateSource(index, {
                            document_id: (source.document_id || []).filter(id => id !== value)
                          })
                        }}
                        onClear={() => {
                          updateSource(index, { document_id: [] })
                        }}
                        placeholder="Select document types..."
                        emptyMessage="No document types found."
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Linking Variable</Label>
                    <ComboBox
                      value={source.linking_variable}
                      onValueChange={value => updateSource(index, { linking_variable: value as any })}
                      options={[
                        { value: "id", label: "ID" },
                        { value: "director_id", label: "Director ID" },
                        { value: "kyc_document_id", label: "KYC Document ID" },
                      ]}
                      placeholder="Select a linking variable..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Table</Label>
                    <ComboBox
                      value={source.table}
                      onValueChange={value => {
                        updateSource(index, { table: value, path: "", fields: [] })
                      }}
                      loading={loadingTables}
                      options={tables.map(t => ({ value: t.name, label: t.label, description: t.name }))}
                      placeholder="Select a table..."
                    />
                  </div>
                  {source.table && (
                    <div className="space-y-2">
                      <Label>Field / Path</Label>
                      <ComboBox
                        value={selectedField}
                        onValueChange={value => {
                          if (value !== selectedField) {
                            updateSource(index, { path: value })
                          }
                        }}
                        loading={source.loadingFields}
                        disabled={!source.table}
                        options={source.fields.map(f => ({
                          value: f.column_name,
                          label: f.column_name,
                          description: f.data_type,
                        }))}
                        placeholder="Select a field..."
                      />
                    </div>
                  )}
                  {fieldIsJsonb && columnSpec && (
                    <div className="mt-2 pl-4 border-l-2 border-muted">
                      <Label>JSON Property</Label>
                      <ComboBox
                        value={source.path.includes("->") ? source.path : ""}
                        onValueChange={value => {
                          const newPath = value || selectedField
                          updateSource(index, { path: newPath })
                        }}
                        options={generateJsonbPathOptions(columnSpec)}
                        placeholder="Select a JSON property or path..."
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