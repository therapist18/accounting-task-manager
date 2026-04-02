// --- START OF FILE Paste February 05, 2026 - 8:34AM ---

// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useRef, useReducer } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus,
  Trash2,
  Database,
  Check,
  ChevronsUpDown,
  Settings2,
  X,
  AlertCircle,
  Code,
  ListTree
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
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
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as ComputedConstants from "@/lib/constants/computed-functions"

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
  linking_variable?: "id" | "individual_id" | "director_id" | "kyc_document_id" | "company_id" | null
  document_id?: string[] | null
  fields?: TableColumn[]
  loadingFields?: boolean
  is_computed?: boolean
  computed_function?: string
  computed_config?: {
    document_ids?: string[]
    arithmeticConfig?: {
      operation?: string
      field1Path?: string
      field2Path?: string
    }
    dateDiffConfig?: {
      unit?: string
      startDatePath?: string
      endDatePath?: string
    }
  }
}

interface DataSourceConfigurationProps {
  sources: SourceCardState[]
  onChange: (sources: SourceCardState[]) => void
  documentTypes: Array<{ value: string; label: string }>
  tables?: TableOption[]
  loadingTables?: boolean
  fetchFieldsForTable?: (tableName: string, index?: number) => void
  getFieldsForTable?: (tableName: string, index?: number) => TableColumn[]
  getLoadingForTable?: (tableName: string, index?: number) => boolean
  masterFields?: Array<{ id: string; label: string; field_key: string }>
}

// --- 1. MultiSelect Component ---
function MultiSelectBox({ options, selectedValues, onChange, placeholder = "Select items..." }: any) {
  const [open, setOpen] = useState(false)

  const handleSelect = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item: any) => item !== value))
    } else {
      onChange([...selectedValues, value])
    }
  }

  const handleRemove = (value: string) => {
    onChange(selectedValues.filter((item: any) => item !== value))
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between bg-white h-auto min-h-[40px] py-2">
            <span className="text-muted-foreground text-sm font-normal">{selectedValues.length > 0 ? `${selectedValues.length} selected` : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <ScrollArea className="h-[200px]">
                <CommandEmpty>No items found.</CommandEmpty>
                <CommandGroup>
                  {options.map((option: any) => {
                    const isSelected = selectedValues.includes(option.value)
                    return (
                      <CommandItem key={option.value} value={option.label} onSelect={() => handleSelect(option.value)}>
                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
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
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedValues.map((val: string) => (
            <Badge key={val} variant="secondary" className="flex items-center gap-1 pr-1 py-1">
              <span className="truncate max-w-[200px]">{options.find((o: any) => o.value === val)?.label || val}</span>
              <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-slate-200" onClick={() => handleRemove(val)}><X className="h-3 w-3" /></Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// --- 2. SearchableSelect Component ---
function SearchableSelect({ value, onValueChange, options, placeholder = "Select...", searchPlaceholder = "Search...", loading = false, emptyMessage = "No results found." }: any) {
  // ... (SearchableSelect implementation remains the same)
  // ... (rest of SearchableSelect implementation)
  // ... (SearchableSelect implementation remains the same)
  const [open, setOpen] = useState(false)

  // Find label from options to display in the closed button
  const displayLabel = options.find((f: any) => f.value === value)?.label || value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal text-slate-900 bg-white">
          <span className="truncate">{value ? displayLabel : <span className="text-muted-foreground">{loading ? "Loading..." : placeholder}</span>}</span>
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
                  <CommandItem
                    key={framework.value}
                    value={framework.label}
                    onSelect={(currentValue) => {
                      const found = options.find((o: any) => o.label.toLowerCase() === currentValue.toLowerCase()) || options.find((o: any) => o.value === currentValue);
                      onValueChange(found ? found.value : currentValue)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === framework.value ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span>{framework.label}</span>
                      {framework.detail && <span className="text-[10px] text-slate-400">{framework.detail}</span>}
                    </div>
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

// --- 3. Reducer & Helpers ---

type FieldStateItem = { fields: TableColumn[]; loading: boolean; tableName: string }
type FieldAction =
  | { type: 'SET_LOADING'; index: number; tableName: string }
  | { type: 'SET_FIELDS'; index: number; tableName: string; fields: TableColumn[] }
  | { type: 'RESET'; index: number }

function fieldsReducer(state: Record<number, FieldStateItem>, action: FieldAction) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, [action.index]: { fields: [], loading: true, tableName: action.tableName } }
    case 'SET_FIELDS':
      return { ...state, [action.index]: { fields: action.fields, loading: false, tableName: action.tableName } }
    case 'RESET':
      const newState = { ...state };
      delete newState[action.index];
      return newState;
    default:
      return state
  }
}

// Generates the deep JSON path options for the Blue Box Popover
const getJsonPathOptions = (field: TableColumn) => {
  if (!field || !field.is_jsonb) return [];

  const options = [];

  // 1. Always add a "Custom Key" option for manual entry
  options.push({
    value: `${field.column_name}->>'?'`,
    label: `Manual Key Entry`,
    detail: "Select to fill template, then type key"
  });

  // 2. Add detected keys
  if (field.jsonb_properties && field.jsonb_properties.length > 0) {
    field.jsonb_properties.forEach(prop => {
      const typeLabel = prop.isArray ? 'Array []' : 'Text';

      // Add Text Extraction (->>)
      if (!prop.isArray) {
        options.push({
          value: `${field.column_name}->>'${prop.name}'`,
          label: `${prop.name}`,
          detail: `Extract as Text`
        });
      }

      // Add Object/Array Extraction (->)
      options.push({
        value: `${field.column_name}->'${prop.name}'`,
        label: `${prop.name}`,
        detail: `Extract as ${typeLabel}`
      });
    });
  }

  return options;
};

export function DataSourceConfiguration({
  sources,
  onChange,
  documentTypes,
  tables = [],
  loadingTables = false,
  fetchFieldsForTable,
  getFieldsForTable,
  getLoadingForTable,
  masterFields = []
}: DataSourceConfigurationProps) {

  // Watcher - fetch fields when tables change
  useEffect(() => {
    sources.forEach((source, index) => {
      if (!source.table || !fetchFieldsForTable) return;
      const currentFields = getFieldsForTable?.(source.table, index) || [];
      const isLoading = getLoadingForTable?.(source.table, index) || false;
      const needsFetch = currentFields.length === 0 && !isLoading;

      if (needsFetch) {
        fetchFieldsForTable(source.table, index);
      }
    });
  }, [sources, fetchFieldsForTable, getFieldsForTable, getLoadingForTable]);

  // Sync - update sources when fields are loaded
  useEffect(() => {
    if (!getFieldsForTable || !getLoadingForTable) return;

    let hasChanges = false;
    const updatedSources = sources.map((source, index) => {
      if (!source.table) return source;

      const currentFields = getFieldsForTable(source.table, index);
      const isLoading = getLoadingForTable(source.table, index);
      const currentFieldCount = source.fields?.length || 0;
      const currentLoading = source.loadingFields;

      if (currentFieldCount !== currentFields.length || currentLoading !== isLoading) {
        hasChanges = true;
        return { ...source, fields: currentFields, loadingFields: isLoading };
      }
      return source;
    });

    if (hasChanges) {
      onChange(updatedSources);
    }
  }, [sources, onChange, getFieldsForTable, getLoadingForTable]);

  const addSource = () => onChange([...sources, {
    id: crypto.randomUUID(),
    source_type: "individual",
    table: "",
    path: "",
    priority: sources.length + 1,
    fields: [],
    linking_variable: "id",
    is_computed: false,
    computed_function: "",
    computed_config: {}
  }])

  const removeSource = (index: number) => {
    onChange(sources.filter((_, i) => i !== index));
  }

  const updateSource = (index: number, updates: Partial<SourceCardState>) => {
    const newSources = [...sources];
    if (updates.table && updates.table !== newSources[index].table && fetchFieldsForTable) {
      newSources[index] = { ...newSources[index], ...updates, fields: [], path: "" };
      fetchFieldsForTable(updates.table, index);
    } else {
      newSources[index] = { ...newSources[index], ...updates };
    }
    onChange(newSources);
  }

  return (
    <div className="space-y-4">
      {sources.map((source, index) => {
        // 1. Get List of Database Columns (Simple list)
        // This ensures the dropdown options are just "id", "name", "specialisation" etc.
        const simpleColumnOptions = (source.fields || []).map(f => ({
          value: f.column_name,
          label: f.column_name,
          detail: f.data_type
        }));

        // 2. Determine currently selected root column
        // We split by "->" or "->>" to get the base column name (e.g., "specialisation" from "specialisation->'core'")
        const selectedRootColumn = source.path ? source.path.split(/->>?/)[0] : "";

        // 3. Find the full spec for that column to see if it's JSONB
        const columnSpec = source.fields?.find(f => f.column_name === selectedRootColumn);
        const fieldIsJsonb = columnSpec?.is_jsonb;

        return (
          <Card key={source.id || index} className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase flex gap-2"><Database className="h-3 w-3" /> Source {index + 1}</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:bg-red-50" onClick={() => removeSource(index)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Type</Label>
                  <SearchableSelect value={source.source_type} onValueChange={(v: any) => updateSource(index, { source_type: v })} options={[{ value: "individual", label: "Individual" }, { value: "document", label: "Document" }, { value: "company", label: "Company" }]} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Priority</Label>
                  <Input type="number" className="h-9 bg-white" value={source.priority} onChange={e => updateSource(index, { priority: parseInt(e.target.value) || 1 })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Linking Variable</Label>
                <SearchableSelect
                  value={source.linking_variable || "id"}
                  onValueChange={(v: any) => updateSource(index, { linking_variable: v })}
                  options={[
                    { value: "id", label: "ID" },
                    { value: "individual_id", label: "Individual ID" },
                    { value: "kyc_document_id", label: "KYC Document ID" },
                    { value: "document_id", label: "Document ID" },
                    { value: "director_id", label: "Director ID" },
                    { value: "company_id", label: "Company ID" }
                  ]}
                  placeholder="Select linking variable..."
                />
              </div>

              {source.source_type === "document" && (
                <div className="space-y-1 bg-white p-2 border rounded"><Label className="text-[10px] font-bold uppercase text-slate-500">Documents</Label>
                  <MultiSelectBox options={documentTypes} selectedValues={source.document_id || []} onChange={(v: any) => updateSource(index, { document_id: v })} /></div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Table</Label>
                <SearchableSelect
                  value={source.table}
                  onValueChange={(v: any) => updateSource(index, { table: v })}
                  loading={loadingTables}
                  options={tables.map(t => ({ value: t.name, label: t.label }))}
                  placeholder="Search table..."
                />
              </div>

              {source.table && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Column</Label>
                  <SearchableSelect
                    value={selectedRootColumn} // Only bind to the ROOT column
                    onValueChange={(v: any) => updateSource(index, { path: v })} // Reset path to just the column when changed
                    loading={source.loadingFields}
                    options={simpleColumnOptions} // Only show simple columns
                    placeholder={source.loadingFields ? "Fetching columns..." : "Select column..."}
                    emptyMessage="No columns found"
                  />
                </div>
              )}

              {fieldIsJsonb && columnSpec && (
                <div className="mt-2 p-2 bg-blue-50/50 rounded border border-blue-100">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex gap-2 items-center"><Settings2 className="w-3 h-3 text-blue-600" /><Label className="text-[10px] font-bold text-blue-600">JSON Path Selection</Label></div>
                    <Badge variant="outline" className="text-[9px] bg-white text-blue-600 border-blue-200">
                      {source.path.includes('->>') ? 'Text' : 'JSON Object'}
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        value={source.path}
                        onChange={e => updateSource(index, { path: e.target.value })}
                        className="bg-white h-8 text-xs font-mono"
                        placeholder={`e.g. ${columnSpec.column_name}->>'key'`}
                      />
                    </div>

                    {/* JSON Helper Menu */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-white border-blue-200 shrink-0" title="Select key">
                          <ListTree className="h-4 w-4 text-blue-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="end">
                        <Command>
                          <CommandInput placeholder="Search detected keys..." />
                          <CommandList>
                            <ScrollArea className="h-[200px]">
                              <CommandEmpty>No keys detected.</CommandEmpty>
                              <CommandGroup heading="Available Properties">
                                {getJsonPathOptions(columnSpec).map(opt => (
                                  <CommandItem
                                    key={opt.value}
                                    value={opt.label}
                                    onSelect={() => updateSource(index, { path: opt.value.replace('?', '') })}
                                  >
                                    <div className="flex flex-col">
                                      <span>{opt.label}</span>
                                      <span className="text-[10px] text-slate-400">{opt.detail}</span>
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
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <Code className="w-3 h-3" />
                    Type {'->'}{'key'} for arrays/objects, or {'->>'}{'key'} for text.
                  </p>
                </div>
              )}

              {/* Computed Function Toggle */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Data & Logic</h4>
                </div>
                <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                  <Label htmlFor={`computed-toggle-${index}`} className="text-xs font-bold text-purple-700 cursor-pointer">Enable Computed Function</Label>
                  <Switch
                    id={`computed-toggle-${index}`}
                    checked={source.is_computed}
                    onCheckedChange={(checked) => updateSource(index, {
                      is_computed: checked,
                      computed_function: checked ? 'concat' : '',
                      computed_config: checked ? { arithmeticConfig: {} } : {}
                    })}
                  />
                </div>
              </div>
              {/* Computed Function Configuration */}
              {source.is_computed && (
                <div className="mt-3 p-3 bg-slate-50 rounded border">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium">Function</Label>
                      <Select
                        value={source.computed_function || ''}
                        onValueChange={(value) => {
                          // FIXED: Use namespace import for getComputedFunction
                          const func = ComputedConstants.getComputedFunction(value);
                          const newConfig: any = {};

                          if (func?.value === 'calculateArithmetic') {
                            newConfig.arithmeticConfig = {};
                          } else if (func?.value === 'calculateDateDifference') {
                            newConfig.dateDiffConfig = {};
                          }

                          updateSource(index, {
                            computed_function: value,
                            computed_config: newConfig
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a function" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* FIXED: Use namespace import for COMPUTED_FUNCTIONS */}
                          {ComputedConstants.COMPUTED_FUNCTIONS.map((func) => (
                            <SelectItem
                              key={func.value}
                              value={func.value}
                              className="flex flex-col items-start"
                            >
                              <span className="font-medium">{func.label}</span>
                              {func.description && (
                                <span className="text-xs text-muted-foreground">
                                  {func.description}
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {source.computed_function === 'calculateArithmetic' && (
                      <div className="space-y-3 pt-3 border-t border-purple-200">
                        <Label className="text-xs font-bold text-purple-900 uppercase">Arithmetic Configuration</Label>
                        <Select
                          value={source.computed_config?.arithmeticConfig?.operation || ""}
                          onValueChange={(v) => updateSource(index, {
                            computed_config: {
                              ...source.computed_config,
                              arithmeticConfig: {
                                ...source.computed_config?.arithmeticConfig,
                                operation: v
                              }
                            }
                          })}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select operation" />
                          </SelectTrigger>
                          <SelectContent>
                            {ComputedConstants.ARITHMETIC_OPERATIONS.map(op => (
                              <SelectItem key={`${source.id}-${op.value}`} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-purple-700">Field 1 Path</Label>
                            <SearchableSelect
                              value={source.computed_config?.arithmeticConfig?.field1Path || ""}
                              onValueChange={(v: any) => updateSource(index, {
                                computed_config: {
                                  ...source.computed_config,
                                  arithmeticConfig: {
                                    ...source.computed_config?.arithmeticConfig,
                                    field1Path: v
                                  }
                                }
                              })}
                              options={masterFields.map(f => ({ label: f.label, value: f.id }))}
                              placeholder="Select Field 1"
                              searchPlaceholder="Search master fields..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-purple-700">Field 2 Path</Label>
                            <SearchableSelect
                              value={source.computed_config?.arithmeticConfig?.field2Path || ""}
                              onValueChange={(v: any) => updateSource(index, {
                                computed_config: {
                                  ...source.computed_config,
                                  arithmeticConfig: {
                                    ...source.computed_config?.arithmeticConfig,
                                    field2Path: v
                                  }
                                }
                              })}
                              options={masterFields.map(f => ({ label: f.label, value: f.id }))}
                              placeholder="Select Field 2"
                              searchPlaceholder="Search master fields..."
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {source.computed_function === 'calculateDateDifference' && (
                      <div className="space-y-3 pt-3 border-t border-purple-200">
                        <Label className="text-xs font-bold text-purple-900 uppercase">Date Difference Configuration</Label>
                        <Select
                          value={source.computed_config?.dateDiffConfig?.unit || ""}
                          onValueChange={(v) => updateSource(index, {
                            computed_config: {
                              ...source.computed_config,
                              dateDiffConfig: {
                                ...source.computed_config?.dateDiffConfig,
                                unit: v
                              }
                            }
                          })}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {ComputedConstants.DATE_DIFF_UNITS.map(unit => (
                              <SelectItem key={`${source.id}-${unit.value}`} value={unit.value}>{unit.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex justify-between">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-purple-700">Start Date Path</Label>
                            <SearchableSelect
                              value={source.computed_config?.dateDiffConfig?.startDatePath || ""}
                              onValueChange={(v: any) => updateSource(index, {
                                computed_config: {
                                  ...source.computed_config,
                                  dateDiffConfig: {
                                    ...source.computed_config?.dateDiffConfig,
                                    startDatePath: v
                                  }
                                }
                              })}
                              options={masterFields.map(f => ({ label: f.label, value: f.id }))}
                              placeholder="Select Start Date Field"
                              searchPlaceholder="Search master fields..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-purple-700">End Date Path</Label>
                            <SearchableSelect
                              value={source.computed_config?.dateDiffConfig?.endDatePath || ""}
                              onValueChange={(v: any) => updateSource(index, {
                                computed_config: {
                                  ...source.computed_config,
                                  dateDiffConfig: {
                                    ...source.computed_config?.dateDiffConfig,
                                    endDatePath: v
                                  }
                                }
                              })}
                              options={masterFields.map(f => ({ label: f.label, value: f.id }))}
                              placeholder="Select End Date Field"
                              searchPlaceholder="Search master fields..."
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      <Button type="button" variant="outline" onClick={addSource} className="w-full border-dashed"><Plus className="mr-2 h-4 w-4" /> Add Source</Button>
    </div>
  )
}