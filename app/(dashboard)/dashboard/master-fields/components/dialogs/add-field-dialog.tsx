"use client"

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
import { ComboBox } from "@/components/ui/combobox"
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

// State for each individual field card
interface FieldCardState {
  id: string // For React key prop
  field_key: string
  label: string
  type: "text" | "date" | "number" | "select"
  is_required: boolean
  optionsText: string
  // Data source related state
  source_type: "profile" | "document" | "company"
  selectedTable: string
  tableFields: TableColumn[]
  loadingTableFields: boolean
  selectedField: string
  selectedJsonPath: string
}

export function AddFieldDialog({ open, onOpenChange, onSuccess }: AddFieldDialogProps) {
  const [cards, setCards] = useState<FieldCardState[]>([])
  const [bulkInput, setBulkInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [tables, setTables] = useState<Array<{ name: string; label: string }>>([])
  const [loadingTables, setLoadingTables] = useState(false)

  // Helper to create a new, empty card state
  const createNewCard = (field_key = "", label = ""): FieldCardState => ({
    id: crypto.randomUUID(),
    field_key,
    label: label || field_key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    type: "text",
    is_required: false,
    optionsText: "",
    source_type: "profile",
    selectedTable: "",
    tableFields: [],
    loadingTableFields: false,
    selectedField: "",
    selectedJsonPath: "",
  })

  // Resets the dialog to its initial state with one empty card
  const resetForm = useCallback(() => {
    setCards([createNewCard()])
    setBulkInput("")
  }, [])

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      resetForm()
    }
  }, [open, resetForm])

  // Generic handler to update a specific card's state
  const handleCardChange = (index: number, updatedValues: Partial<FieldCardState>) => {
    setCards((currentCards) =>
      currentCards.map((card, i) => (i === index ? { ...card, ...updatedValues } : card)),
    )
  }
  
  // Handler to parse bulk input and generate cards
  const handleBulkGenerate = () => {
    if (!bulkInput.trim()) return
    const names = bulkInput
      .split(/[\n,]+/) // Split by newlines or commas
      .map((name) => name.trim())
      .filter(Boolean)

    if (names.length > 0) {
      const newCards = names.map((name) => createNewCard(name))
      setCards(newCards)
    }
    setBulkInput("")
  }
  
  // Handlers to add or remove a card from the list
  const addCard = () => {
    setCards((currentCards) => [...currentCards, createNewCard()])
  }

  const removeCard = (index: number) => {
    setCards((currentCards) => currentCards.filter((_, i) => i !== index))
  }

  // Submission logic for all cards
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const fieldsToInsert: JobFieldInsert[] = cards.map((card) => {
        let options = null
        if (card.type === "select" && card.optionsText.trim()) {
          try {
            options = JSON.parse(card.optionsText)
          } catch {
            options = card.optionsText.split(",").map((opt) => opt.trim()).filter(Boolean)
          }
        }
        
        const sources = card.selectedTable && card.selectedField ? [{
          source_type: card.source_type,
          table: card.selectedTable,
          path: card.selectedJsonPath || card.selectedField,
          priority: 1
        }] : []

        return {
          field_key: card.field_key,
          label: card.label,
          type: card.type,
          is_required: card.is_required,
          options,
          sources,
        }
      }).filter(field => field.field_key && field.label) // Ensure essential fields are present
      
      if (fieldsToInsert.length === 0) {
        toast({ title: "No fields to add", description: "Please fill in at least one field's Key and Label.", variant: "default" })
        setLoading(false)
        return
      }

      const { error } = await supabase.from("tm_job_fields").insert(fieldsToInsert)

      if (error) throw error

      toast({
        title: "Success",
        description: `${fieldsToInsert.length} field(s) added successfully`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error adding fields:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add fields",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Fetch available tables (once per dialog open)
  useEffect(() => {
    const fetchTables = async () => {
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
    if (open) {
      fetchTables()
    }
  }, [open])

  // Fetch fields for a specific card when its table selection changes
  const fetchFieldsForCard = async (index: number, tableName: string) => {
    if (!tableName) {
      handleCardChange(index, { tableFields: [], selectedField: "", selectedJsonPath: "" })
      return
    }

    handleCardChange(index, {
      selectedTable: tableName,
      loadingTableFields: true,
      selectedField: "",
      selectedJsonPath: "",
    })

    try {
      const { data, error } = await supabase.rpc("get_table_columns", { input_table_name: tableName })
      if (error) throw error
      handleCardChange(index, { tableFields: data || [] })
    } catch (error) {
      console.error(`Error fetching fields for ${tableName}:`, error)
      toast({ title: "Error", description: `Failed to fetch fields for table ${tableName}`, variant: "destructive" })
      handleCardChange(index, { tableFields: [] })
    } finally {
      handleCardChange(index, { loadingTableFields: false })
    }
  }
  
  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Field(s)</DialogTitle>
          <DialogDescription>
            Create job application fields. Paste a list of names to generate multiple cards at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 p-1">
          <Label htmlFor="bulk-input">Paste Field Names (Optional)</Label>
          <div className="flex items-start gap-2">
            <Textarea
              id="bulk-input"
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="e.g. first_name, last_name, phone_number (comma or newline separated)"
              rows={2}
              className="flex-1"
            />
            <Button type="button" onClick={handleBulkGenerate} className="h-full">Generate Cards</Button>
          </div>
        </div>

        <form id="add-fields-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-6 -mr-6 pr-6 py-2">
          {cards.map((card, index) => (
            <div key={card.id} className="p-4 border rounded-lg relative space-y-4 bg-muted/30">
              {cards.length > 1 && (
                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => removeCard(index)}>
                  <span className="text-xl font-bold leading-none">×</span>
                  <span className="sr-only">Remove field</span>
                </Button>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`field_key-${card.id}`}>Field Key</Label>
                  <Input id={`field_key-${card.id}`} value={card.field_key} onChange={(e) => handleCardChange(index, { field_key: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`label-${card.id}`}>Label</Label>
                  <Input id={`label-${card.id}`} value={card.label} onChange={(e) => handleCardChange(index, { label: e.target.value })} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`type-${card.id}`}>Type</Label>
                <ComboBox value={card.type} onValueChange={(v) => handleCardChange(index, { type: v as any })}
                  options={[{ value: 'text', label: 'Text' }, { value: 'date', label: 'Date' }, { value: 'number', label: 'Number' }, { value: 'select', label: 'Select' }]}
                />
              </div>

              {card.type === "select" && (
                <div className="space-y-2">
                  <Label htmlFor={`options-${card.id}`}>Options</Label>
                  <Textarea id={`options-${card.id}`} value={card.optionsText} onChange={(e) => handleCardChange(index, { optionsText: e.target.value })}
                    placeholder='["Option 1", "Option 2"] or Option 1, Option 2' rows={2}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 pt-2">
                <Switch id={`is_required-${card.id}`} checked={card.is_required} onCheckedChange={(c) => handleCardChange(index, { is_required: c })} />
                <Label htmlFor={`is_required-${card.id}`}>Required field</Label>
              </div>

              <div className="space-y-4 border-t pt-4 mt-4">
                <h4 className="text-sm font-medium">Data Source (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Source Type</Label>
                    <ComboBox value={card.source_type} onValueChange={(v) => handleCardChange(index, { source_type: v as any })}
                      options={[{ value: 'profile', label: 'Profile' }, { value: 'document', label: 'Document' }, { value: 'company', label: 'Company' }]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Table</Label>
                    <ComboBox value={card.selectedTable} onValueChange={(v) => fetchFieldsForCard(index, v)}
                      disabled={loadingTables || loading} loading={loadingTables}
                      options={tables.map(t => ({ value: t.name, label: t.label }))} placeholder="Select a table"
                    />
                  </div>
                </div>
                {card.selectedTable && (
                  <div className="space-y-2">
                    <Label>Field</Label>
                    <ComboBox value={card.selectedField} onValueChange={(v) => handleCardChange(index, { selectedField: v, selectedJsonPath: "" })}
                      disabled={card.loadingTableFields} loading={card.loadingTableFields}
                      options={card.tableFields.map(f => ({ value: f.column_name, label: f.column_name, description: f.data_type }))}
                      placeholder="Select a field"
                    />
                    {card.selectedField && card.tableFields.find(f => f.column_name === card.selectedField)?.is_jsonb && (
                      <div className="mt-2 pl-4 border-l-2 border-muted">
                        <Label>JSON Property</Label>
                        <ComboBox value={card.selectedJsonPath} onValueChange={p => handleCardChange(index, { selectedJsonPath: p })}
                          options={(card.tableFields.find(f => f.column_name === card.selectedField)?.jsonb_properties ?? []).flatMap(prop => {
                            const baseItem = { value: `${card.selectedField}->>'${prop.name}'`, label: `${prop.name} (${prop.type})` };
                            return prop.properties?.length
                              ? [baseItem, ...prop.properties.map(nested => ({
                                  value: `${card.selectedField}->'${prop.name}'->>'${nested.name}'`,
                                  label: `${prop.name}.${nested.name} (${nested.type})`,
                                  className: 'pl-6'
                                }))]
                              : [baseItem];
                          })}
                          placeholder="Select a property"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </form>

        <DialogFooter className="mt-auto pt-4 border-t gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={addCard}>Add Another Field</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" form="add-fields-form" disabled={loading || cards.length === 0}>
              {loading ? "Adding..." : `Add ${cards.length} Field(s)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}