// @ts-nocheck
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Check, ChevronsUpDown, Settings2, Database, Trash2, Plus, Link2, Calculator } from "lucide-react"
import { cn } from "@/lib/utils"

import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { JobFieldInsert } from "../types/database"

// --- CONSTANTS (from EditFieldDialog context) ---
const COMPUTED_FUNCTIONS = [
    { value: "getLatestDocumentNumber", label: "Get Document Number (e.g. Passport No)" },
    { value: "getLatestDocumentExpiryDate", label: "Get Expiry Date" },
    { value: "getLatestDocumentIssueDate", label: "Get Issue Date" },
    { value: "determineImmigrationStatus", label: "Determine Immigration Status" },
    { value: "getLatestWorkPermit", label: "Get Latest Work Permit No" },
    { value: "getEducationalDetails", label: "Extract Educational History (Array)" },
    { value: "calculateArithmetic", label: "Arithmetic Calculation (Plus, Minus, etc.)" },
    { value: "calculateDateDifference", label: "Date Difference (Days, Months, Years)" },
]

// --- TYPE DEFINITIONS (from EditFieldDialog context) ---
interface JsonbArrayConfig {
  fields: Array<{
    id: string
    name: string
    type: string
    parentField: string
  }>
  maxItems: number
}
interface JsonbProperty {
  id: string
  name: string
  type: string
  isArray?: boolean
  arrayConfig?: JsonbArrayConfig
}
interface TableColumn {
  column_name: string
  data_type: string
  is_jsonb: boolean
  jsonb_properties?: JsonbProperty[] | null
}

// State for each individual field card
interface FieldCardState {
  id: string
  field_key: string
  label: string
  type: "text" | "date" | "number" | "select" | "image"
  is_required: boolean
  optionsText: string
  // Data source related state
  source_type: "individual" | "document" | "company"
  selectedTable: string
  tableFields: TableColumn[]
  loadingTableFields: boolean
  selectedField: string
  selectedJsonPath: string
  // New computed state
  is_computed: boolean // ADDED
  computed_function: string // ADDED
  // Arithmetic configuration
  arithmeticOperation?: string // ADDED
  arithmeticField2Path?: string // ADDED
  arithmeticOperand?: number // ADDED
  arithmeticUnit?: 'days' | 'months' | 'years' // ADDED
}

interface AddFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

/**
 * Custom Searchable/Selectable component wrapper for Popover/Command pattern.
 */
function SearchableSelect({ value, onValueChange, options, placeholder = "Select...", searchPlaceholder = "Search...", loading = false, emptyMessage = "No results found." }: any) {
    const [open, setOpen] = useState(false)
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal text-slate-900 bg-white">
            <span className="truncate">{value ? options.find((f: any) => f.value === value)?.label || value : <span className="text-muted-foreground">{loading ? "Loading..." : placeholder}</span>}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <ScrollArea className="h-[200px]">
                  <CommandEmpty>{loading ? "Loading..." : emptyMessage}</CommandEmpty>
                  <CommandGroup>
                  {options.map((framework: any) => (
                      <CommandItem key={framework.value} value={framework.label} onSelect={(currentValue) => {
                          const selectedOption = options.find((o: any) => o.label.toLowerCase() === currentValue.toLowerCase()) || options.find((o: any) => o.value === currentValue);
                          onValueChange(selectedOption ? selectedOption.value : currentValue)
                          setOpen(false)
                      }}>
                      <Check className={cn("mr-2 h-4 w-4", value === framework.value ? "opacity-100" : "opacity-0")} />
                      {framework.label}
                      </CommandItem>
                  ))}
                  </CommandGroup>
              </ScrollArea>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
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
    source_type: "individual",
    selectedTable: "",
    tableFields: [],
    loadingTableFields: false,
    selectedField: "",
    selectedJsonPath: "",
    is_computed: false, // ADDED
    computed_function: "", // ADDED
    // Arithmetic configuration
    arithmeticOperation: undefined, // ADDED
    arithmeticField2Path: undefined, // ADDED
    arithmeticOperand: undefined, // ADDED
    arithmeticUnit: undefined, // ADDED
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
      .split(/[\n,]+/)
      .map((name) => name.trim())
      .filter(Boolean)

    if (names.length > 0) {
      const newCards = names.map((name) => createNewCard(name.toLowerCase().replace(/\s/g, "_"), name))
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

  /**
   * Generates dropdown options for a JSONB column based on its embedded properties array.
   */
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

    props.forEach((prop) => {
      const propName = prop.name.replace(/'/g, "''").trim()

      if (prop.isArray && prop.arrayConfig?.fields) {
        prop.arrayConfig.fields.forEach((field) => {
          const fieldName = field.name.replace(/'/g, "''").trim()
          options.push({
            value: `${columnName}->'${propName}'->[INDEX]->>'${fieldName}'`,
            label: `${fieldName} (from ${propName})`,
            className: "pl-4",
          })
        })
      }
      else if (!prop.isArray) {
        options.push({
          value: `${columnName}->>'${propName}'`,
          label: `${propName} (top-level property)`,
        })
      }
    })

    return options
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
            options = card.optionsText.split(/[\n,]+/).map((opt) => opt.trim()).filter(Boolean)
          }
        }
        
        // Build sources array with proper path handling
        // Note: For AddDialog simplicity, we don't have document_id in state, 
        // which is needed for computed field configuration if source_type is 'document'.
        // We will include the configured source as-is.
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
          category: "General",
          // ADDED COMPUTED FIELD LOGIC
          computed_config: card.is_computed ? {
              is_computed: true,
              computed_function: card.computed_function,
              // document_ids extraction is complex and depends on the specific source card's 'document_id' array
              // Since we don't have that state in FieldCardState, we leave it out, 
              // relying on the sources array for data retrieval by the computed function.
              // Arithmetic configuration
              arithmetic_config: (card.computed_function === 'calculateArithmetic' || card.computed_function === 'calculateDateDifference') ? {
                  operation: card.arithmeticOperation,
                  field2Path: card.arithmeticField2Path,
                  operand: card.arithmeticOperand,
                  unit: card.arithmeticUnit
              } : undefined
          } : null,
        }
      }).filter(field => field.field_key && field.label)
      
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

  // Fetch available tables (once per dialog open) - UNCHANGED
  useEffect(() => {
    const fetchTables = async () => {
      // ... (table fetching logic) ...
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
      } finally {
        setLoadingTables(false)
      }
    }
    if (open) {
      fetchTables()
    }
  }, [open])

  // Fetch fields for a specific card when its table selection changes - UNCHANGED
  const fetchFieldsForCard = async (index: number, tableName: string) => {
    if (!tableName) {
      handleCardChange(index, { tableFields: [], selectedField: "", selectedJsonPath: "", selectedTable: "" })
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
      handleCardChange(index, { tableFields: data || [], loadingTableFields: false })
    } catch (error) {
      console.error(`Error fetching fields for ${tableName}:`, error)
      toast({ title: "Error", description: `Failed to fetch fields for table ${tableName}`, variant: "destructive" })
      handleCardChange(index, { tableFields: [], loadingTableFields: false })
    }
  }
  
  const handleClose = () => {
    onOpenChange(false)
  }

  // Helper function to get the selected field from a path - UNCHANGED
  const getSelectedFieldFromPath = (path: string) => (path ? path.split("->")[0] : "")


  return (
    <Dialog open={open} onOpenChange={handleClose}>
        {/* Adopting the EditDialog's structure and styling */}
      <DialogContent className="sm:max-w-[900px] h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        <DialogHeader className="px-6 py-4 border-b bg-white">
          <DialogTitle>Add New Field(s)</DialogTitle>
          <DialogDescription>
            Create job application fields. Configure key, type, and optional data sources or computation logic.
          </DialogDescription>
        </DialogHeader>

        <form id="add-fields-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* Bulk Input Section */}
            <Card className="p-5 border shadow-sm bg-white rounded-xl space-y-3">
                <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                    <Plus className="w-4 h-4 text-slate-500" />
                    <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Bulk Input</h3>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="bulk-input" className="text-xs font-bold uppercase text-slate-500">Paste Field Names (Optional)</Label>
                    <div className="flex items-start gap-3">
                        <Textarea
                        id="bulk-input"
                        value={bulkInput}
                        onChange={(e) => setBulkInput(e.target.value)}
                        placeholder="e.g. first_name, last_name, phone_number (comma or newline separated)"
                        rows={2}
                        className="flex-1 text-xs"
                        />
                        <Button type="button" onClick={handleBulkGenerate} className="h-full bg-slate-800 hover:bg-slate-900">Generate Cards</Button>
                    </div>
                </div>
            </Card>

            {/* Field Cards */}
            <div className="space-y-6">
                <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-slate-500" />
                    <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Field Configuration Cards</h3>
                </div>
                
                {cards.map((card, index) => {
                    const selectedField = getSelectedFieldFromPath(card.selectedJsonPath || card.selectedField)
                    const columnSpec = card.tableFields.find(f => f.column_name === selectedField)
                    const fieldIsJsonb = columnSpec?.is_jsonb

                    return (
                        <Card key={card.id} className="p-5 border shadow-sm bg-white rounded-xl relative space-y-4">
                            <CardHeader className="flex flex-row items-center justify-between p-0 pb-3 border-b border-slate-100">
                                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Settings2 className="h-3 w-3" /> Field {index + 1}</CardTitle>
                                {cards.length > 1 && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-50 hover:text-red-500" onClick={() => removeCard(index)}><Trash2 className="h-3 w-3" /></Button>
                                )}
                            </CardHeader>
                            <CardContent className="p-0 space-y-4">
                                
                                {/* 1. Basic Settings */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor={`field_key-${card.id}`} className="text-xs font-bold uppercase text-slate-500">Variable Name</Label>
                                        <Input id={`field_key-${card.id}`} className="font-mono text-sm bg-slate-50" value={card.field_key} onChange={(e) => handleCardChange(index, { field_key: e.target.value })} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`label-${card.id}`} className="text-xs font-bold uppercase text-slate-500">Label</Label>
                                        <Input id={`label-${card.id}`} className="text-sm font-medium" value={card.label} onChange={(e) => handleCardChange(index, { label: e.target.value })} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`type-${card.id}`} className="text-xs font-bold uppercase text-slate-500">Input Type</Label>
                                        <Select value={card.type} onValueChange={(v) => handleCardChange(index, { type: v as any })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="text">Text Input</SelectItem>
                                                <SelectItem value="number">Number Input</SelectItem>
                                                <SelectItem value="date">Date Picker</SelectItem>
                                                <SelectItem value="select">Dropdown Select</SelectItem>
                                                <SelectItem value="image">Image Upload</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center space-x-2 pt-2 self-end">
                                        <Switch id={`is_required-${card.id}`} checked={card.is_required} onCheckedChange={(c) => handleCardChange(index, { is_required: c })} />
                                        <Label htmlFor={`is_required-${card.id}`} className="text-sm font-medium">Required field</Label>
                                    </div>
                                </div>

                                {/* 2. Dropdown Options */}
                                {card.type === "select" && (
                                    <div className="space-y-2 pt-2 border-t mt-4">
                                        <Label htmlFor={`options-${card.id}`} className="text-xs font-bold uppercase text-slate-500">Static Options</Label>
                                        <Textarea id={`options-${card.id}`} value={card.optionsText} onChange={(e) => handleCardChange(index, { optionsText: e.target.value })}
                                            placeholder='["Option 1", "Option 2"] or Option 1, Option 2 (comma or newline separated)' rows={3} className="font-mono text-xs bg-slate-50"
                                        />
                                    </div>
                                )}
                                
                                {/* 3. Data Source / Computed Configuration */}
                                <div className="space-y-4 pt-4 border-t mt-4">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                        <div className="flex items-center gap-2">
                                            <Database className="w-4 h-4 text-slate-500" />
                                            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Data Source / Logic</h3>
                                        </div>
                                        <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                                            <Label htmlFor={`computed_toggle-${card.id}`} className="text-xs font-bold text-purple-700 cursor-pointer">Computed?</Label>
                                            <Switch id={`computed_toggle-${card.id}`} checked={card.is_computed} onCheckedChange={(c) => handleCardChange(index, { is_computed: c })} className="data-[state=checked]:bg-purple-600" />
                                        </div>
                                    </div>

                                    {/* A. Computed Configuration Block */}
                                    {card.is_computed && (
                                        <div className="p-5 border border-purple-200 bg-purple-50/30 rounded-xl">
                                            <Label className="text-xs font-bold text-purple-900 uppercase flex items-center gap-1 mb-2"><Calculator className="w-3 h-3"/> Computed Function</Label>
                                            <SearchableSelect 
                                                value={card.computed_function} 
                                                onValueChange={(v: any) => handleCardChange(index, { computed_function: v })}
                                                options={COMPUTED_FUNCTIONS}
                                                placeholder="Select computation logic..."
                                                searchPlaceholder="Search function..."
                                            />
                                        </div>
                                    )}

                                    {/* B. Data Source (Applies to both regular and computed fields as a dependency) */}
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase text-slate-500">Source Type</Label>
                                                <Select value={card.source_type} onValueChange={(v) => handleCardChange(index, { source_type: v as any })}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="individual">Individual</SelectItem>
                                                        <SelectItem value="document">Document</SelectItem>
                                                        <SelectItem value="company">Company</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase text-slate-500">Database Table</Label>
                                                <SearchableSelect 
                                                    value={card.selectedTable} 
                                                    onValueChange={(v: any) => fetchFieldsForCard(index, v)}
                                                    loading={loadingTables}
                                                    options={tables.map(t => ({ value: t.name, label: t.label }))} 
                                                    placeholder="Search table..." 
                                                    searchPlaceholder="Type to search tables..."
                                                />
                                            </div>
                                        </div>
                                        {card.selectedTable && (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase text-slate-500">Column</Label>
                                                <SearchableSelect 
                                                    value={selectedField} 
                                                    onValueChange={(v: any) => handleCardChange(index, { selectedField: v, selectedJsonPath: "" })}
                                                    loading={card.loadingTableFields}
                                                    options={card.tableFields.map(f => ({ value: f.column_name, label: f.column_name }))}
                                                    placeholder={card.loadingTableFields ? "Loading columns..." : "Search column..."} 
                                                    searchPlaceholder="Type to search columns..."
                                                />
                                                {fieldIsJsonb && columnSpec && (
                                                    <div className="mt-2 p-2 bg-blue-50/50 rounded-md border border-blue-100">
                                                        <div className="flex items-center gap-2 mb-1"><Link2 className="w-3 h-3 text-blue-600"/><Label className="text-[10px] text-blue-600 uppercase font-bold">JSON Path Selection</Label></div>
                                                        <SearchableSelect 
                                                            value={card.selectedJsonPath.includes("->") ? card.selectedJsonPath : ""}
                                                            onValueChange={(value) => {
                                                                const newPath = value || selectedField
                                                                handleCardChange(index, { selectedJsonPath: newPath })
                                                            }}
                                                            options={generateJsonbPathOptions(columnSpec)}
                                                            placeholder="Select a JSON property or path..."
                                                        />
                                                        <p className="text-[10px] text-slate-500 mt-1">If selecting a full path, use format: `column_name-&gt;&gt;'sub_key'`</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
            
            <Button type="button" variant="outline" onClick={addCard} className="w-full border-dashed h-10 hover:bg-slate-50 hover:text-slate-900"><Plus className="mr-2 h-4 w-4" /> Add Another Field</Button>

            {/* Sticky Footer */}
            <DialogFooter className="pt-4 border-t bg-white sticky bottom-0 z-10 -m-6 p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>Cancel</Button>
                <Button type="submit" form="add-fields-form" disabled={loading || cards.length === 0} className="bg-blue-600 hover:bg-blue-700">
                    {loading ? "Adding..." : `Add ${cards.length} Field(s)`}
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}