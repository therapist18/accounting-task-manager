// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useRef, useReducer } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area" // Ensure this is installed in your UI library
import { 
  Plus, 
  Trash2, 
  Database, 
  Check, 
  ChevronsUpDown, 
  Settings2,
  X
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// --- Types ---
interface JsonbArrayConfig {
  fields: Array<{ id: string; name: string; type: string; parentField: string }>
  maxItems: number
}
interface JsonbProperty {
  id: string; name: string; type: string; isArray?: boolean; arrayConfig?: JsonbArrayConfig
}
interface TableColumn {
  column_name: string; data_type: string; is_jsonb: boolean; jsonb_properties?: JsonbProperty[] | null
}
export type SourceCardState = {
  id: string
  source_type: "individual" | "document" | "company" | "field"
  table: string
  path: string
  priority: number
  linking_variable?: "id" | "director_id" | "kyc_document_id" | "company_id" | null
  document_id?: string[] | null
  // UI state
  fields?: TableColumn[]
  loadingFields?: boolean
}

interface DataSourceConfigurationProps {
  sources: SourceCardState[]
  onChange: (sources: SourceCardState[]) => void
  documentTypes: Array<{ value: string; label: string }>
}

// --- 1. Robust Multi-Select Component (Fixes Document Search & Scrolling) ---
interface MultiSelectBoxProps {
  options: Array<{ value: string; label: string }>
  selectedValues: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}

function MultiSelectBox({ options, selectedValues, onChange, placeholder = "Select items..." }: MultiSelectBoxProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value))
    } else {
      onChange([...selectedValues, value])
    }
  }

  const handleRemove = (value: string) => {
    onChange(selectedValues.filter((item) => item !== value))
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-white h-auto min-h-[40px] py-2"
          >
            <span className="text-muted-foreground text-sm font-normal">
                {selectedValues.length > 0 
                    ? `${selectedValues.length} selected` 
                    : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search documents..." />
            <CommandList>
                {/* ScrollArea added here for smooth vertical scrolling */}
                <ScrollArea className="h-[200px]">
                    <CommandEmpty>No documents found.</CommandEmpty>
                    <CommandGroup>
                        {options.map((option) => {
                            const isSelected = selectedValues.includes(option.value)
                            return (
                                <CommandItem
                                    key={option.value}
                                    value={option.label} // Value must be label for search to work
                                    onSelect={() => handleSelect(option.value)}
                                >
                                    <div className={cn(
                                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                                    )}>
                                        <Check className={cn("h-4 w-4")} />
                                    </div>
                                    <span>{option.label}</span>
                                </CommandItem>
                            )
                        })}
                    </CommandGroup>
                </ScrollArea>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Items Tags - Uses flex-wrap to prevent horizontal scrolling issues */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedValues.map((val) => {
            const label = options.find(o => o.value === val)?.label || val
            return (
              <Badge key={val} variant="secondary" className="flex items-center gap-1 pr-1 py-1">
                <span className="truncate max-w-[200px]">{label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 rounded-full hover:bg-slate-200"
                  onClick={() => handleRemove(val)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}


// --- 2. Single Select Component with ScrollArea ---
interface SearchableSelectProps {
  value: string | undefined
  onValueChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  searchPlaceholder?: string
  loading?: boolean
  emptyMessage?: string
}

function SearchableSelect({ 
  value, 
  onValueChange, 
  options, 
  placeholder = "Select...", 
  searchPlaceholder = "Search...",
  loading = false,
  emptyMessage = "No results found."
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-slate-900 bg-white"
        >
          <span className="truncate">
            {value
                ? options.find((framework) => framework.value === value)?.label || value
                : <span className="text-muted-foreground">{loading ? "Loading..." : placeholder}</span>}
          </span>
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
                {options.map((framework) => (
                    <CommandItem
                    key={framework.value}
                    value={framework.label} 
                    onSelect={(currentValue) => {
                        const selectedOption = options.find(o => o.label.toLowerCase() === currentValue.toLowerCase()) || options.find(o => o.value === currentValue);
                        onValueChange(selectedOption ? selectedOption.value : currentValue)
                        setOpen(false)
                    }}
                    >
                    <Check
                        className={cn(
                        "mr-2 h-4 w-4",
                        value === framework.value ? "opacity-100" : "opacity-0"
                        )}
                    />
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

// Reducer for internal field state management
type FieldAction =
  | { type: 'SET_LOADING'; index: number }
  | { type: 'SET_FIELDS'; index: number; fields: TableColumn[] }
  | { type: 'CLEAR_LOADING'; index: number }

function fieldsReducer(state: Record<number, { fields: TableColumn[]; loading: boolean }>, action: FieldAction) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, [action.index]: { fields: state[action.index]?.fields || [], loading: true } }
    case 'SET_FIELDS':
      return { ...state, [action.index]: { fields: action.fields, loading: false } }
    case 'CLEAR_LOADING':
      return { ...state, [action.index]: { ...state[action.index], loading: false } }
    default:
      return state
  }
}

export function DataSourceConfiguration({ sources, onChange, documentTypes }: DataSourceConfigurationProps) {  
  const [tables, setTables] = useState<Array<{ name: string; label: string }>>([])
  const [loadingTables, setLoadingTables] = useState(false)
  
  const [fieldState, dispatchField] = useReducer(fieldsReducer, {})
  
  const fieldCacheRef = useRef<Record<string, TableColumn[]>>({})
  const fetchInProgressRef = useRef<Record<string, boolean>>({})
  const isInitialMountRef = useRef(true)
  
  // Fetch Tables
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoadingTables(true)
        const { data, error } = await supabase.rpc("get_all_tables")
        if (error) throw error

        const formattedTables = data
          .filter((t: any) => t.table_name && !t.table_name.startsWith("pg_") && !t.table_name.startsWith("sql_"))
          .map((t: any) => ({
            name: t.table_name,
            label: t.table_name.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          }))
          .sort((a: any, b: any) => a.label.localeCompare(b.label))

        setTables(formattedTables)
      } catch (error) {
        console.error("Error fetching tables:", error)
      } finally {
        setLoadingTables(false)
      }
    }
    fetchTables()
  }, [])

  // Fetch Fields Logic
  const fetchFieldsForTable = useCallback(async (tableName: string, index: number) => {
    if (!tableName) return
    if (fieldCacheRef.current[tableName]) {
      dispatchField({ type: 'SET_FIELDS', index, fields: fieldCacheRef.current[tableName] })
      return
    }

    const fetchKey = `${tableName}-${index}`
    if (fetchInProgressRef.current[fetchKey]) return

    fetchInProgressRef.current[fetchKey] = true
    dispatchField({ type: 'SET_LOADING', index })

    try {
      const { data, error } = await supabase.rpc("get_table_columns", { input_table_name: tableName })
      if (error) throw error
      fieldCacheRef.current[tableName] = data || []
      dispatchField({ type: 'SET_FIELDS', index, fields: data || [] })
    } catch (error) {
      console.error(`Error fetching columns:`, error)
      toast({ title: "Error", description: "Failed to fetch table columns", variant: "destructive" })
      dispatchField({ type: 'CLEAR_LOADING', index })
    } finally {
      delete fetchInProgressRef.current[fetchKey]
    }
  }, []) 

  // Sync internal state
  useEffect(() => {
    const needsUpdate = sources.some((source, index) => {
      const internalState = fieldState[index]
      if (!internalState) return false
      if (internalState.fields.length > 0 && (!source.fields || source.fields.length === 0)) return true
      if (internalState.loading !== source.loadingFields) return true
      return false
    })

    if (needsUpdate) {
      const updated = sources.map((source, index) => {
        const internalState = fieldState[index]
        if (!internalState) return source
        return {
          ...source,
          fields: internalState.fields.length > 0 ? internalState.fields : source.fields,
          loadingFields: internalState.loading
        }
      })
      onChange(updated)
    }
  }, [fieldState, sources, onChange])

  useEffect(() => {
    if (!isInitialMountRef.current) return
    sources.forEach((source, index) => {
      if (source.table && (!source.fields || source.fields.length === 0)) {
        setTimeout(() => fetchFieldsForTable(source.table, index), index * 100)
      }
    })
    isInitialMountRef.current = false
  }, [])

  const addSource = () => {
    onChange([
      ...sources,
      {
        id: crypto.randomUUID(),
        source_type: "individual",
        table: "",
        path: "",
        priority: sources.length + 1,
        fields: [],
        loadingFields: false,
        document_id: [],
        linking_variable: "id",
      },
    ])
  }

  const updateSource = useCallback((index: number, updates: Partial<SourceCardState>) => {
    const newSources = [...sources]
    newSources[index] = { ...newSources[index], ...updates }
    
    if ("table" in updates && updates.table && updates.table !== sources[index]?.table) {
      newSources[index].path = ""
      onChange(newSources)
      setTimeout(() => {
        fetchFieldsForTable(updates.table!, index)
      }, 100)
      return
    }
    onChange(newSources)
  }, [sources, onChange, fetchFieldsForTable])

  const removeSource = (index: number) => {
    onChange(sources.filter((_, i) => i !== index))
  }

  const generateJsonbPathOptions = (columnSpec: TableColumn) => {
    const columnName = columnSpec.column_name
    const props = columnSpec.jsonb_properties
    const options = []
    options.push({ value: columnName, label: `${columnName} (Full Object)` })
    if (props && Array.isArray(props)) {
        props.forEach(prop => {
            if (!prop.isArray) {
                options.push({
                    value: `${columnName}->>'${prop.name}'`,
                    label: `Extract: ${prop.name}`,
                })
            }
        })
    }
    return options
  }

  const getSelectedFieldFromPath = (path: string) => (path ? path.split("->")[0] : "")

  return (
    <div className="space-y-4">
      {sources.map((source, index) => {
        const selectedField = getSelectedFieldFromPath(source.path)
        const columnSpec = source.fields?.find(f => f.column_name === selectedField)
        const fieldIsJsonb = columnSpec?.is_jsonb
        const isLoadingFields = fieldState[index]?.loading || source.loadingFields || false

        return (
          <Card key={source.id || index} className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Database className="h-3 w-3" /> Source {index + 1}
                </CardTitle>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 hover:bg-red-50 hover:text-red-500" 
                  onClick={() => removeSource(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500 uppercase font-bold">Type</Label>
                  <SearchableSelect
                    value={source.source_type}
                    onValueChange={value => updateSource(index, { source_type: value as any })}
                    options={[
                      { value: "individual", label: "Individual" },
                      { value: "document", label: "Document" },
                      { value: "company", label: "Company" },
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500 uppercase font-bold">Priority</Label>
                  <Input
                    type="number"
                    className="h-9 bg-white"
                    value={source.priority}
                    onChange={e => updateSource(index, { priority: Number.parseInt(e.target.value) || 1 })}
                    min="1"
                  />
                </div>
              </div>

              {/* REPLACED MultiSelectDocumentTypes with local MultiSelectBox */}
              {source.source_type === "document" && (
                <div className="space-y-1 bg-white p-2 rounded border border-slate-100">
                  <Label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Required Documents</Label>
                  <MultiSelectBox
                    options={documentTypes}
                    selectedValues={source.document_id || []}
                    onChange={(newValues) => updateSource(index, { document_id: newValues })}
                    placeholder="Search & Select Documents..."
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 uppercase font-bold">Linking Variable</Label>
                <SearchableSelect
                  value={source.linking_variable || ""}
                  onValueChange={value => updateSource(index, { linking_variable: value as any })}
                  options={[
                    { value: "id", label: "ID" },
                    { value: "director_id", label: "Director ID" },
                    { value: "kyc_document_id", label: "KYC Document ID" },
                    { value: "company_id", label: "Company ID" },
                  ]}
                  placeholder="Select linking ID..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 uppercase font-bold">Database Table</Label>
                <SearchableSelect
                  value={source.table}
                  onValueChange={value => {
                    if (value && value !== source.table) {
                      updateSource(index, { table: value })
                    }
                  }}
                  loading={loadingTables}
                  options={tables.map(t => ({ value: t.name, label: t.label }))}
                  placeholder="Search table..."
                  searchPlaceholder="Type to search tables..."
                />
              </div>

              {source.table && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500 uppercase font-bold">Column</Label>
                  <SearchableSelect
                    value={selectedField}
                    onValueChange={value => { 
                      if (value !== selectedField) updateSource(index, { path: value }) 
                    }}
                    loading={isLoadingFields}
                    options={source.fields?.map(f => ({ value: f.column_name, label: f.column_name })) || []}
                    placeholder={isLoadingFields ? "Loading columns..." : "Search column..."}
                    searchPlaceholder="Type to search columns..."
                  />
                </div>
              )}

              {fieldIsJsonb && columnSpec && (
                <div className="mt-2 p-2 bg-blue-50/50 rounded-md border border-blue-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Settings2 className="w-3 h-3 text-blue-600"/>
                    <Label className="text-[10px] text-blue-600 uppercase font-bold">JSON Path Selection</Label>
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="flex-1">
                        <Input 
                            value={source.path}
                            onChange={(e) => updateSource(index, { path: e.target.value })}
                            placeholder={`e.g. ${columnSpec.column_name}->>'key'`}
                            className="bg-white h-9 text-xs"
                        />
                    </div>
                    
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" className="h-9 w-9 bg-white shrink-0" title="Select from detected keys">
                                <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="end">
                             <Command>
                                <CommandInput placeholder="Search detected keys..." />
                                <CommandList>
                                    <ScrollArea className="h-[200px]">
                                        <CommandEmpty>No specific keys detected.</CommandEmpty>
                                        <CommandGroup heading="Detected Options">
                                            {generateJsonbPathOptions(columnSpec).map((opt) => (
                                                <CommandItem 
                                                    key={opt.value} 
                                                    value={opt.label}
                                                    onSelect={() => updateSource(index, { path: opt.value })}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{opt.label}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono">{opt.value}</span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </ScrollArea>
                                </CommandList>
                             </Command>
                        </PopoverContent>
                    </Popover>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Type manually if the key isn't listed, or use the dropdown to auto-fill.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      
      <Button 
        type="button" 
        variant="outline" 
        onClick={addSource} 
        className="w-full border-dashed h-10 hover:bg-slate-50 hover:text-slate-900"
      >
        <Plus className="mr-2 h-4 w-4" /> Add Data Source
      </Button>
    </div>
  )
}