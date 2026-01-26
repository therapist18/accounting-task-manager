// @ts-nocheck
"use client"

import type React from "react"
import { useState, useEffect, useCallback, useReducer, useRef } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
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
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { JobField, JobFieldUpdate } from "../../types/database"
import { Calculator, FunctionSquare, Database, Settings2, Check, ChevronsUpDown, Link2, Plus, Trash2, Edit2, Save, ArrowDown, Fingerprint, X } from "lucide-react"
import { Card, CardDescription, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

// --- TYPES ---
interface FieldDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    field?: JobField | null
    onSuccess: () => void
    availableFields?: Array<{ id: string; label: string; type: string }>
    mode?: 'add' | 'edit'
}

interface DropdownOption {
    label: string;
    value: string;
}

interface ParentOptionItem {
    label: string;
    value: string;
}

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
}

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

const ARITHMETIC_OPERATIONS = [
    { value: "plus", label: "Addition (+)" },
    { value: "minus", label: "Subtraction (-)" },
    { value: "multiply", label: "Multiplication (×)" },
    { value: "divide", label: "Division (÷)" },
]

const DATE_DIFF_UNITS = [
    { value: "days", label: "Days" },
    { value: "months", label: "Months" },
    { value: "years", label: "Years" },
]

// --- HELPER COMPONENTS FOR DATA SOURCE CONFIG ---

function MultiSelectBox({ options, selectedValues, onChange, placeholder = "Select items..." }: { options: Array<{ value: string; label: string }>, selectedValues: string[], onChange: (values: string[]) => void, placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  
  const handleSelect = (value: string) => {
    if (selectedValues.includes(value)) onChange(selectedValues.filter((item) => item !== value))
    else onChange([...selectedValues, value])
  }
  const handleRemove = (value: string) => onChange(selectedValues.filter((item) => item !== value))

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          <div className="p-3 border-b">
            <Input
              placeholder="Search..."
              className="h-9 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ScrollArea className="h-[200px]">
            <div className="p-1">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  No results found.
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = selectedValues.includes(option.value)
                  return (
                    <div
                      key={option.value}
                      className="flex items-center gap-2 p-2 rounded-sm hover:bg-slate-100 cursor-pointer"
                      onClick={() => handleSelect(option.value)}
                    >
                      <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                        <Check className={cn("h-4 w-4")} />
                      </div>
                      <span>{option.label}</span>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedValues.map((val) => {
            const label = options.find(o => o.value === val)?.label || val
            return (
              <Badge key={val} variant="secondary" className="flex items-center gap-1 pr-1 py-1">
                <span className="truncate max-w-[200px]">{label}</span>
                <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-slate-200" onClick={() => handleRemove(val)}><X className="h-3 w-3" /></Button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SearchableSelect({ value, onValueChange, options, placeholder = "Select...", searchPlaceholder = "Search...", loading = false, emptyMessage = "No results found." }: any) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  
  const filteredOptions = options.filter((option: any) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal text-slate-900 bg-white">
          <span className="truncate">{value ? options.find((f: any) => f.value === value)?.label || value : <span className="text-muted-foreground">{loading ? "Loading..." : placeholder}</span>}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder={searchPlaceholder}
            className="h-9 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-1">
            {loading ? (
              <div className="py-6 text-center text-sm text-slate-500">
                Loading...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((framework: any) => (
                <div
                  key={framework.value}
                  className="flex items-center gap-2 p-2 rounded-sm hover:bg-slate-100 cursor-pointer"
                  onClick={() => {
                    onValueChange(framework.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === framework.value ? "opacity-100" : "opacity-0")} />
                  {framework.label}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

// Reducer for DataSource fields
type FieldAction = { type: 'SET_LOADING'; index: number } | { type: 'SET_FIELDS'; index: number; fields: TableColumn[] } | { type: 'CLEAR_LOADING'; index: number }
function fieldsReducer(state: Record<number, { fields: TableColumn[]; loading: boolean }>, action: FieldAction) {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, [action.index]: { fields: state[action.index]?.fields || [], loading: true } }
    case 'SET_FIELDS': return { ...state, [action.index]: { fields: action.fields, loading: false } }
    case 'CLEAR_LOADING': return { ...state, [action.index]: { ...state[action.index], loading: false } }
    default: return state
  }
}

// --- DATA SOURCE COMPONENT (Integrated) ---
function DataSourceConfiguration({ sources, onChange, documentTypes }: { sources: SourceCardState[], onChange: (s: SourceCardState[]) => void, documentTypes: any[] }) {
  const [tables, setTables] = useState<Array<{ name: string; label: string }>>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [fieldState, dispatchField] = useReducer(fieldsReducer, {})
  const fieldCacheRef = useRef<Record<string, TableColumn[]>>({})
  const fetchInProgressRef = useRef<Record<string, boolean>>({})
  
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoadingTables(true)
        const { data, error } = await supabase.rpc("get_all_tables")
        if (error) throw error
        setTables(data.filter((t: any) => !t.table_name.startsWith("pg_") && !t.table_name.startsWith("sql_")).map((t: any) => ({ name: t.table_name, label: t.table_name.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") })).sort((a: any, b: any) => a.label.localeCompare(b.label)))
      } catch (error) { console.error("Error fetching tables:", error) } finally { setLoadingTables(false) }
    }
    fetchTables()
  }, [])

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
    } catch (error) { console.error(`Error fetching columns:`, error); dispatchField({ type: 'CLEAR_LOADING', index }) } finally { delete fetchInProgressRef.current[fetchKey] }
  }, []) 

  useEffect(() => {
    sources.forEach((source, index) => {
        if (source.table && (!fieldState[index]?.fields || fieldState[index].fields.length === 0)) {
            fetchFieldsForTable(source.table, index);
        }
    });
  }, [sources, fetchFieldsForTable]);

  const addSource = () => onChange([...sources, { id: crypto.randomUUID(), source_type: "individual", table: "", path: "", priority: sources.length + 1, fields: [], loadingFields: false, document_id: [], linking_variable: "id" }])
  const updateSource = (index: number, updates: Partial<SourceCardState>) => {
    const newSources = [...sources]; newSources[index] = { ...newSources[index], ...updates };
    if (updates.table && updates.table !== sources[index]?.table) { newSources[index].path = ""; onChange(newSources); setTimeout(() => fetchFieldsForTable(updates.table!, index), 100); return; }
    onChange(newSources)
  }
  const removeSource = (index: number) => onChange(sources.filter((_, i) => i !== index))
  const getSelectedFieldFromPath = (path: string) => (path ? path.split("->")[0] : "")

  return (
    <div className="space-y-4">
      {sources.map((source, index) => {
        const internalFields = fieldState[index]?.fields || source.fields || [];
        const loading = fieldState[index]?.loading || false;
        const selectedField = getSelectedFieldFromPath(source.path)
        const columnSpec = internalFields.find(f => f.column_name === selectedField)
        const fieldIsJsonb = columnSpec?.is_jsonb

        return (
          <Card key={source.id || index} className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2 pt-3 px-3"><div className="flex items-center justify-between"><CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Database className="h-3 w-3" /> Source {index + 1}</CardTitle><Button type="button" variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-50 hover:text-red-500" onClick={() => removeSource(index)}><Trash2 className="h-3 w-3" /></Button></div></CardHeader>
            <CardContent className="space-y-3 px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-[10px] text-slate-500 uppercase font-bold">Type</Label><SearchableSelect value={source.source_type} onValueChange={(v: any) => updateSource(index, { source_type: v })} options={[{ value: "individual", label: "Individual" }, { value: "document", label: "Document" }, { value: "company", label: "Company" }]} /></div>
                <div className="space-y-1"><Label className="text-[10px] text-slate-500 uppercase font-bold">Priority</Label><Input type="number" className="h-9 bg-white" value={source.priority} onChange={e => updateSource(index, { priority: Number.parseInt(e.target.value) || 1 })} min="1" /></div>
              </div>
              {source.source_type === "document" && <div className="space-y-1 bg-white p-2 rounded border border-slate-100"><Label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Required Documents</Label><MultiSelectBox options={documentTypes} selectedValues={source.document_id || []} onChange={(v) => updateSource(index, { document_id: v })} placeholder="Search & Select Documents..." /></div>}
              <div className="space-y-1"><Label className="text-[10px] text-slate-500 uppercase font-bold">Linking Variable</Label><SearchableSelect value={source.linking_variable || ""} onValueChange={(v: any) => updateSource(index, { linking_variable: v })} options={[{ value: "id", label: "ID" }, { value: "individual_id", label: "Individual ID" }, { value: "director_id", label: "Director ID" }, { value: "kyc_document_id", label: "KYC Document ID" }, { value: "company_id", label: "Company ID" }]} placeholder="Select linking ID..." /></div>
              <div className="space-y-1"><Label className="text-[10px] text-slate-500 uppercase font-bold">Database Table</Label><SearchableSelect value={source.table} onValueChange={(v: any) => v && v !== source.table && updateSource(index, { table: v })} loading={loadingTables} options={tables.map(t => ({ value: t.name, label: t.label }))} placeholder="Search table..." searchPlaceholder="Type to search tables..." /></div>
              {source.table && <div className="space-y-1"><Label className="text-[10px] text-slate-500 uppercase font-bold">Column</Label><SearchableSelect value={selectedField} onValueChange={(v: any) => v !== selectedField && updateSource(index, { path: v })} loading={loading} options={internalFields.map(f => ({ value: f.column_name, label: f.column_name }))} placeholder={loading ? "Loading columns..." : "Search column..."} searchPlaceholder="Type to search columns..." /></div>}
              {fieldIsJsonb && columnSpec && (
                <div className="mt-2 p-2 bg-blue-50/50 rounded-md border border-blue-100">
                  <div className="flex items-center gap-2 mb-1"><Settings2 className="w-3 h-3 text-blue-600"/><Label className="text-[10px] text-blue-600 uppercase font-bold">JSON Path Selection</Label></div>
                  <div className="flex gap-2"><div className="flex-1"><Input value={source.path} onChange={(e) => updateSource(index, { path: e.target.value })} placeholder={`e.g. ${columnSpec.column_name}->>'key'`} className="bg-white h-9 text-xs" /></div></div>
                  <p className="text-[10px] text-slate-500 mt-1">Type the full path (e.g. {columnSpec.column_name}-&gt;&gt;'sub_key')</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      <Button type="button" variant="outline" onClick={addSource} className="w-full border-dashed h-10 hover:bg-slate-50 hover:text-slate-900"><Plus className="mr-2 h-4 w-4" /> Add Data Source</Button>
    </div>
  )
}

// --- MAIN DIALOG COMPONENT ---

export function FieldDialog({ open, onOpenChange, field, onSuccess, availableFields = [], mode }: FieldDialogProps) {
    const isEditMode = mode === 'edit' || (field !== null && field !== undefined)
    
    const [formData, setFormData] = useState<Partial<JobFieldUpdate> & {
        fieldType: 'normal' | 'dropdown';
        dependentFieldId?: string;
        dependencyConfig?: {
            mode: 'db_filter' | 'manual_mapping';
            parentOptionKey?: string;
            valueKey?: string;
            labelKey?: string;
        };
        manualMapping?: Record<string, DropdownOption[]>;
        date_config?: {
            useCurrentDate?: boolean;
            defaultDate?: string;
            format?: string;
        };
        documentTypes: Array<{ value: string; label: string }>;
        is_computed: boolean;
        computed_function: string;
        computed_config: { 
            document_ids?: string[];
            arithmeticConfig?: {
                operation?: string;
                field1Path?: string;
                field2Path?: string;
                operand?: number;
                unit?: string;
            };
        };
        category: string;
    }>({
        fieldType: 'normal',
        date_config: { useCurrentDate: true, format: 'YYYY-MM-DD' },
        documentTypes: [],
        is_computed: false,
        computed_function: "",
        category: "General",
        computed_config: {},
        dependencyConfig: { mode: 'db_filter', valueKey: "name", labelKey: "name", parentOptionKey: "parent_id" },
        manualMapping: {}
    })

    const [sources, setSources] = useState<SourceCardState[]>([])
    const [optionsText, setOptionsText] = useState("")
    const [loading, setLoading] = useState(false)
    const [isDependent, setIsDependent] = useState(false)
    const [existingCategories, setExistingCategories] = useState<string[]>([])
    
    const [openCategoryCombo, setOpenCategoryCombo] = useState(false)
    const [openParentCombo, setOpenParentCombo] = useState(false)
    const [openFunctionCombo, setOpenFunctionCombo] = useState(false)

    const [parentFieldOptions, setParentFieldOptions] = useState<ParentOptionItem[]>([]) 
    const [loadingParentOptions, setLoadingParentOptions] = useState(false)
    const [currentParentValue, setCurrentParentValue] = useState("") 
    const [currentChildInput, setCurrentChildInput] = useState("") 
    const [currentChildList, setCurrentChildList] = useState<DropdownOption[]>([]) 
    const [openParentValueCombo, setOpenParentValueCombo] = useState(false)
    const [masterFields, setMasterFields] = useState<Array<{ id: string; label: string; field_key: string }>>([])
    const [loadingMasterFields, setLoadingMasterFields] = useState(false)

    // Bulk input for add mode
    const [bulkInput, setBulkInput] = useState("")

    const dropdownFields = availableFields.filter(f => f.type === 'select' && f.id !== field?.id)

    const fetchParentOptions = useCallback(async (parentId: string) => {
        setLoadingParentOptions(true);
        try {
            const { data: parentField } = await supabase.from('tm_job_fields').select('*').eq('id', parentId).single();
            if (parentField) {
                const results: ParentOptionItem[] = [];
                if (Array.isArray(parentField.options) && parentField.options.length > 0) {
                    const rawOptions = parentField.options;
                    rawOptions.forEach(opt => {
                        if (typeof opt === 'string') {
                            if (opt.includes('\n') || opt.includes(',')) {
                                const splits = opt.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
                                splits.forEach(s => results.push({ label: s, value: s })); 
                            } else {
                                results.push({ label: opt.trim(), value: opt.trim() });
                            }
                        } else if (typeof opt === 'object' && opt.label && opt.value) {
                            results.push(opt as ParentOptionItem);
                        }
                    });
                } 
                else if (parentField.sources && parentField.sources.length > 0) {
                    const source = parentField.sources[0];
                    if (source.table) {
                        const labelCol = source.path || 'name'; 
                        const { data: dbOptions } = await supabase.from(source.table).select('*').limit(100);
                        if (dbOptions) {
                            dbOptions.forEach((row: any) => {
                                const val = row.id || row.uuid || row.code || row[labelCol];
                                const lab = row[labelCol] || row.name || row.title || val;
                                if (val && lab) results.push({ label: String(lab), value: String(val) });
                            });
                        }
                    }
                }
                const uniqueResults = Array.from(new Map(results.map(item => [item.value, item])).values());
                const sorted = uniqueResults.sort((a, b) => a.label.localeCompare(b.label));
                setParentFieldOptions(sorted);
                return sorted; 
            }
        } catch (e) { console.error("Error fetching parent options", e); } finally { setLoadingParentOptions(false); }
        return [];
    }, []);

    useEffect(() => {
        const fetchDocumentTypes = async () => {
            try {
                const { data } = await supabase.from('acc_portal_kyc').select('id, display_name').order('display_name', { ascending: true })
                if (data) {
                    setFormData(prev => ({ ...prev, documentTypes: data.map((dt: any) => ({ value: dt.id, label: dt.display_name || `Doc ${dt.id}` })) }))
                }
            } catch (error) { console.error(error) }
        }
        
        const fetchMasterFields = async () => {
            setLoadingMasterFields(true)
            try {
                const { data } = await supabase.from('tm_job_fields').select('id, label, field_key').order('label')
                if (data) {
                    setMasterFields(data)
                }
            } catch (error) { console.error(error) } finally { setLoadingMasterFields(false) }
        }
        
        if (open) {
            fetchDocumentTypes()
            fetchMasterFields()
        }
    }, [open])

    useEffect(() => {
        const initData = async () => {
            if (isEditMode && field) {
                const isDropdown = field.type === 'select'
                let depConfig = field.options?.dependencyConfig || {};
                const dependentSource = field.sources?.find(s => s.source_type === 'field')
                const isDep = !!depConfig.dependentFieldId || !!dependentSource;
                const parentId = depConfig.dependentFieldId || dependentSource?.table;
                const computedConfig = field.computed_config || {}
                
                let currentDepConfig = { mode: 'db_filter', valueKey: "name", labelKey: "name", parentOptionKey: "parent_id", dependentFieldId: parentId };
                let currentManualMapping: Record<string, DropdownOption[]> = {};

                if (field.options && !Array.isArray(field.options) && (field.options as any).dependencyConfig) {
                    currentDepConfig = { ...currentDepConfig, ...(field.options as any).dependencyConfig };
                }
                
                if (field.options && !Array.isArray(field.options) && (field.options as any).manualMapping) {
                    currentManualMapping = (field.options as any).manualMapping;
                }

                if (isDep && parentId) { await fetchParentOptions(parentId); }

                setFormData({
                    field_key: field.field_key,
                    label: field.label,
                    type: field.type,
                    is_required: field.is_required,
                    fieldType: isDropdown ? 'dropdown' : 'normal',
                    dependentFieldId: parentId,
                    dependencyConfig: currentDepConfig,
                    manualMapping: currentManualMapping,
                    date_config: field.date_config || { useCurrentDate: true, format: 'YYYY-MM-DD' },
                    is_computed: computedConfig.is_computed || false,
                    computed_function: computedConfig.computed_function || "",
                    computed_config: { 
                        document_ids: computedConfig.document_ids || [],
                        arithmeticConfig: computedConfig.arithmeticConfig || {}
                    },
                    category: field.category || "General",
                    documentTypes: formData.documentTypes
                })

                if (field.sources && field.sources.length > 0) {
                    const validSources = field.sources.filter(s => s.source_type !== 'field');
                    if (validSources.length > 0) {
                        setSources(validSources.map(s => ({ ...s, id: crypto.randomUUID(), fields: [], loadingFields: false })));
                    } else { setSources([]); }
                } else { setSources([]); }

                setIsDependent(isDep)
                
                if(isDropdown && !isDep && Array.isArray(field.options)) {
                    if (field.options.length === 1 && typeof field.options[0] === 'string' && field.options[0].includes('\n')) {
                        setOptionsText(field.options[0]);
                    } else { setOptionsText(JSON.stringify(field.options, null, 2)) }
                } else { setOptionsText("") }
            } else {
                setFormData({
                    field_key: "",
                    label: "",
                    type: "text",
                    is_required: false,
                    fieldType: 'normal',
                    date_config: { useCurrentDate: true, format: 'YYYY-MM-DD' },
                    documentTypes: formData.documentTypes,
                    is_computed: false,
                    computed_function: "",
                    category: "General",
                    computed_config: {},
                    dependencyConfig: { mode: 'db_filter', valueKey: "name", labelKey: "name", parentOptionKey: "parent_id" },
                    manualMapping: {}
                })
                setSources([])
                setOptionsText("")
                setBulkInput("")
                setIsDependent(false)
                setParentFieldOptions([])
                setCurrentParentValue("")
                setCurrentChildInput("")
                setCurrentChildList([])
            }
        };
        initData();
    }, [field, open, fetchParentOptions, isEditMode])

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('tm_job_fields').select('category')
            if (data) {
                const uniqueCats = Array.from(new Set(data.map(d => d.category).filter(Boolean))) as string[]
                setExistingCategories(uniqueCats.sort())
            }
        }
        if (open) fetchCategories()
    }, [open])

    useEffect(() => {
        if (open && formData.dependentFieldId && parentFieldOptions.length === 0) {
            fetchParentOptions(formData.dependentFieldId)
        }
    }, [formData.dependentFieldId, open, parentFieldOptions.length, fetchParentOptions])

    useEffect(() => {
        if (parentFieldOptions.length > 0 && formData.manualMapping && Object.keys(formData.manualMapping).length > 0) {
            const normalized = normalizeManualMapping(formData.manualMapping, parentFieldOptions);
            const hasChanges = Object.keys(normalized).some(key => {
                const originalChildren = formData.manualMapping?.[key];
                const normalizedChildren = normalized[key];
                return !originalChildren || JSON.stringify(originalChildren) !== JSON.stringify(normalizedChildren);
            });
            if (hasChanges) { setFormData(prev => ({ ...prev, manualMapping: normalized })); }
        }
    }, [parentFieldOptions])

    const addValuesToCurrentList = () => {
        if(!currentChildInput.trim()) return;
        const rawLabels = currentChildInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        const newOptions: DropdownOption[] = rawLabels.map(label => ({
            label: label,
            value: label.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + crypto.randomUUID().slice(0, 6)
        }));
        setCurrentChildList(prev => {
            const existingLabels = new Set(prev.map(p => p.label));
            const uniqueNew = newOptions.filter(o => !existingLabels.has(o.label));
            return [...prev, ...uniqueNew];
        });
        setCurrentChildInput("");
    }

    const saveMappingSet = () => {
        if(!currentParentValue || currentChildList.length === 0) return;
        const matchedOption = parentFieldOptions.find(opt => opt.value === currentParentValue || opt.label.toLowerCase() === currentParentValue.toLowerCase());
        const finalKey = matchedOption ? matchedOption.value : currentParentValue;
        setFormData(prev => ({ ...prev, manualMapping: { ...prev.manualMapping, [finalKey]: currentChildList } }));
        setCurrentParentValue("");
        setCurrentChildList([]);
        toast({ title: "Mapping Added", description: `Added ${currentChildList.length} items for ${matchedOption ? matchedOption.label : finalKey}` });
    }

    const editMappingSet = (parentValue: string) => {
        const children = formData.manualMapping?.[parentValue] || [];
        setCurrentParentValue(parentValue);
        setCurrentChildList(children);
    }

    const deleteMappingSet = (parentValue: string) => {
        const newMap = { ...formData.manualMapping };
        delete newMap[parentValue];
        setFormData(prev => ({ ...prev, manualMapping: newMap }));
    }

    const removeChildFromList = (childValue: string) => {
        setCurrentChildList(prev => prev.filter(c => c.value !== childValue));
    }

    const getParentLabel = (val: string) => {
        if (!val) return "";
        const found = parentFieldOptions.find(p => p.value === val);
        if (found) return found.label;
        return val;
    }

    const normalizeManualMapping = (mapping: Record<string, DropdownOption[]>, parentOpts: ParentOptionItem[]): Record<string, DropdownOption[]> => {
        const normalized: Record<string, DropdownOption[]> = {};
        Object.entries(mapping).forEach(([key, children]) => {
            const matchingOption = parentOpts.find(p => p.label === key);
            if (matchingOption) { normalized[matchingOption.value] = children; } else { normalized[key] = children; }
        });
        return normalized;
    }

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            let options: any = []
            if (formData.fieldType === 'dropdown') {
                if (isDependent) {
                    options = {
                        isDependencyConfig: true,
                        dependencyConfig: { ...formData.dependencyConfig, dependentFieldId: formData.dependentFieldId },
                        manualMapping: formData.dependencyConfig?.mode === 'manual_mapping' ? formData.manualMapping : null
                    }
                } else {
                    try { 
                        const parsed = JSON.parse(optionsText);
                        options = Array.isArray(parsed) ? parsed : [parsed]; 
                    } catch { options = optionsText.split(/[\n,]+/).map(opt => opt.trim()).filter(Boolean) }
                }
            } else if (isEditMode && field?.options) {
                options = Array.isArray(field.options) ? field.options : []
            }

            if (formData.fieldType === 'dropdown' && !isDependent && Array.isArray(options)) {
                const idBasedOptions: DropdownOption[] = [];
                let optionIndex = 1;
                options.forEach(opt => {
                    if (typeof opt === 'string') {
                        if (opt.includes('\n') || opt.includes(',')) {
                            const splits = opt.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
                            splits.forEach(s => { const id = String(optionIndex++); idBasedOptions.push({ label: s, value: id }); });
                        } else { const id = String(optionIndex++); idBasedOptions.push({ label: opt.trim(), value: id }); }
                    } else if (typeof opt === 'object' && opt.label && opt.value) { idBasedOptions.push(opt); }
                });
                if (idBasedOptions.length > 0) { options = idBasedOptions; }
            }

            const updateData: any = {
                field_key: formData.field_key || (isEditMode ? field?.field_key : ""),
                label: formData.label || (isEditMode ? field?.label : ""),
                type: formData.fieldType === 'dropdown' ? 'select' : (formData.type || (isEditMode ? field?.type : 'text')),
                is_required: formData.is_required ?? (isEditMode ? field?.is_required : false),
                options,
                category: formData.category,
                updated_at: new Date().toISOString()
            }

            let finalSources: any[] = []
            const userConfiguredSources = sources.map(({ id, fields, loadingFields, ...rest }) => rest);

            if (formData.is_computed) {
                const extractedDocIds = sources.filter(s => s.source_type === 'document' && s.document_id).flatMap(s => s.document_id || []);
                updateData.computed_config = {
                    document_ids: [...new Set(extractedDocIds)],
                    is_computed: formData.is_computed,
                    computed_function: formData.computed_function,
                    arithmeticConfig: formData.computed_config.arithmeticConfig
                };
                finalSources = userConfiguredSources;
            } else {
                updateData.computed_config = null;
                finalSources = userConfiguredSources;
            }
            updateData.sources = finalSources;

            if (formData.type === 'date') {
                updateData.date_config = {
                    useCurrentDate: formData.date_config?.useCurrentDate,
                    defaultDate: formData.date_config?.defaultDate,
                    format: formData.date_config?.format
                }
            }

            if (isEditMode && field) {
                const { error } = await supabase.from('tm_job_fields').update(updateData).eq('id', field.id)
                if (error) throw error
                toast({ title: "Success", description: "Field updated successfully" })
            } else {
                updateData.created_at = new Date().toISOString()
                const { error } = await supabase.from('tm_job_fields').insert(updateData)
                if (error) throw error
                toast({ title: "Success", description: "Field created successfully" })
            }

            onSuccess()
            onOpenChange(false)
        } catch (error) {
            console.error(error)
            toast({ 
                title: "Error", 
                description: isEditMode ? "Failed to update field" : "Failed to create field", 
                variant: "destructive" 
            })
        } finally { setLoading(false) }
    }

    const requiresArithmeticConfig = formData.computed_function === 'calculateArithmetic' || formData.computed_function === 'calculateDateDifference';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[900px] h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
                <DialogHeader className="px-6 py-4 border-b bg-white">
                    <DialogTitle>
                        {isEditMode ? `Edit Field: ${field?.label}` : "Add New Field"}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditMode 
                            ? "Configure field settings and data mapping." 
                            : "Create a new job field with custom configuration."}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* BULK INPUT SECTION (ADD MODE ONLY) */}
                    {!isEditMode && (
                        <Card className="border-2 border-dashed border-blue-300 bg-blue-50/30">
                            <CardContent className="p-4">
                                <Label className="text-sm font-bold text-blue-900 mb-2 block">Quick Create Multiple Fields (Bulk Input)</Label>
                                <Textarea
                                    value={bulkInput}
                                    onChange={(e) => setBulkInput(e.target.value)}
                                    placeholder="Paste field names here (one per line or comma-separated)&#10;Example:&#10;First Name&#10;Last Name&#10;Email Address"
                                    className="min-h-[120px] font-mono text-sm bg-white"
                                />
                                <p className="text-xs text-slate-500 mt-2">Fields will be created with default settings. You can edit them individually afterward.</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* REST OF THE FORM... */}
                    <Card className="space-y-4 border shadow-sm bg-white p-5 rounded-xl">
                        <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                            <Settings2 className="w-4 h-4 text-slate-500" />
                            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">General Settings</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="field-key" className="text-xs font-bold uppercase text-slate-500">Variable Name</Label>
                                <Input id="field-key" className="font-mono text-sm bg-slate-50" value={formData.field_key || ''} onChange={(e) => setFormData({ ...formData, field_key: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="label" className="text-xs font-bold uppercase text-slate-500">Label</Label>
                                <Input id="label" className="text-sm font-medium" value={formData.label || ''} onChange={(e) => setFormData({ ...formData, label: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-500">Input Type</Label>
                                <Select value={formData.type || ''} onValueChange={(value) => setFormData({ ...formData, type: value as any, fieldType: value === 'select' ? 'dropdown' : 'normal' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text Input</SelectItem>
                                        <SelectItem value="number">Number Input</SelectItem>
                                        <SelectItem value="date">Date Picker</SelectItem>
                                        <SelectItem value="select">Dropdown Select</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-500">Category</Label>
                                <Popover open={openCategoryCombo} onOpenChange={setOpenCategoryCombo}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" aria-expanded={openCategoryCombo} className="w-full justify-between bg-white text-left font-normal">
                                            {formData.category || "Select category..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search category..." />
                                            <CommandList>
                                                <CommandEmpty className="py-2 px-4"><Button variant="secondary" size="sm" className="w-full h-8 text-xs" onClick={() => { setFormData({ ...formData, category: "New Category" }); setOpenCategoryCombo(false); }}>Create New</Button></CommandEmpty>
                                                <CommandGroup>
                                                    {existingCategories.map((cat) => (
                                                        <CommandItem key={cat} value={cat} onSelect={(val) => { setFormData({ ...formData, category: val }); setOpenCategoryCombo(false) }}><Check className={cn("mr-2 h-4 w-4", formData.category === cat ? "opacity-100" : "opacity-0")} />{cat}</CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </Card>

                    {/* DATA LOGIC SECTION */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                                <Database className="w-4 h-4 text-slate-500" />
                                <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Data & Logic</h3>
                            </div>
                            <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                                <Label htmlFor="computed_toggle" className="text-xs font-bold text-purple-700 cursor-pointer">Computed?</Label>
                                <Switch id="computed_toggle" checked={formData.is_computed} onCheckedChange={(c) => setFormData({ ...formData, is_computed: c })} className="data-[state=checked]:bg-purple-600" />
                            </div>
                        </div>

                        {formData.is_computed && (
                            <div className="p-5 border border-purple-200 bg-purple-50/30 rounded-xl space-y-4">
                                <div>
                                    <Label className="text-xs font-bold text-purple-900 uppercase">Computed Function</Label>
                                    <Popover open={openFunctionCombo} onOpenChange={setOpenFunctionCombo}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" aria-expanded={openFunctionCombo} className="w-full justify-between bg-white border-purple-200 mt-2">
                                                {formData.computed_function ? COMPUTED_FUNCTIONS.find((f) => f.value === formData.computed_function)?.label : "Select logic..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0"><Command><CommandInput placeholder="Search function..." /><CommandList><CommandGroup>{COMPUTED_FUNCTIONS.map((fn) => (<CommandItem key={fn.value} value={fn.label} onSelect={() => { setFormData({ ...formData, computed_function: fn.value }); setOpenFunctionCombo(false) }}><Check className={cn("mr-2 h-4 w-4", formData.computed_function === fn.value ? "opacity-100" : "opacity-0")} />{fn.label}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent>
                                    </Popover>
                                </div>

                                {/* ARITHMETIC CONFIG */}
                                {formData.computed_function === 'calculateArithmetic' && (
                                    <div className="space-y-3 pt-3 border-t border-purple-200">
                                        <Label className="text-xs font-bold text-purple-900 uppercase">Arithmetic Configuration</Label>
                                        <Select 
                                            value={formData.computed_config.arithmeticConfig?.operation || ""} 
                                            onValueChange={(v) => setFormData(prev => ({
                                                ...prev,
                                                computed_config: {
                                                    ...prev.computed_config,
                                                    arithmeticConfig: {
                                                        ...prev.computed_config.arithmeticConfig,
                                                        operation: v
                                                    }
                                                }
                                            }))}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder="Select operation" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ARITHMETIC_OPERATIONS.map(op => (
                                                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase text-purple-700">Field 1 Path</Label>
                                                <Input 
                                                    className="h-9 bg-white text-xs font-mono"
                                                    placeholder="e.g. extracted_details->>'permit_wef'"
                                                    value={formData.computed_config.arithmeticConfig?.field1Path || ""}
                                                    onChange={(e) => setFormData(prev => ({
                                                        ...prev,
                                                        computed_config: {
                                                            ...prev.computed_config,
                                                            arithmeticConfig: {
                                                                ...prev.computed_config.arithmeticConfig,
                                                                field1Path: e.target.value
                                                            }
                                                        }
                                                    }))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase text-purple-700">Field 2 Path (Optional)</Label>
                                                <Input 
                                                    className="h-9 bg-white text-xs font-mono"
                                                    placeholder="e.g. extracted_details->>'permit_expiry_date'"
                                                    value={formData.computed_config.arithmeticConfig?.field2Path || ""}
                                                    onChange={(e) => setFormData(prev => ({
                                                        ...prev,
                                                        computed_config: {
                                                            ...prev.computed_config,
                                                            arithmeticConfig: {
                                                                ...prev.computed_config.arithmeticConfig,
                                                                field2Path: e.target.value
                                                            }
                                                        }
                                                    }))}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-purple-700">Or Use Fixed Operand</Label>
                                            <Input 
                                                type="number"
                                                className="h-9 bg-white"
                                                placeholder="e.g. 365"
                                                value={formData.computed_config.arithmeticConfig?.operand || ""}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    computed_config: {
                                                        ...prev.computed_config,
                                                        arithmeticConfig: {
                                                            ...prev.computed_config.arithmeticConfig,
                                                            operand: e.target.value ? Number(e.target.value) : undefined
                                                        }
                                                    }
                                                }))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* DATE DIFFERENCE CONFIG */}
                                {formData.computed_function === 'calculateDateDifference' && (
                                    <div className="space-y-3 pt-3 border-t border-purple-200">
                                        <Label className="text-xs font-bold text-purple-900 uppercase">Date Difference Configuration</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase text-purple-700">Start Date Path</Label>
                                                <SearchableSelect 
                                                    value={formData.computed_config.arithmeticConfig?.startDatePath || ""}
                                                    onValueChange={(value) => setFormData(prev => ({
                                                        ...prev,
                                                        computed_config: {
                                                            ...prev.computed_config,
                                                            arithmeticConfig: {
                                                                ...prev.computed_config.arithmeticConfig,
                                                                startDatePath: value
                                                            }
                                                        }
                                                    }))}
                                                    options={masterFields.map(field => ({ 
                                                        value: field.id, 
                                                        label: `${field.label} (${field.field_key})` 
                                                    }))}
                                                    loading={loadingMasterFields}
                                                    placeholder="Select master field..."
                                                    searchPlaceholder="Search fields..."
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold uppercase text-purple-700">End Date Path</Label>
                                                <SearchableSelect 
                                                    value={formData.computed_config.arithmeticConfig?.endDatePath || ""}
                                                    onValueChange={(value) => setFormData(prev => ({
                                                        ...prev,
                                                        computed_config: {
                                                            ...prev.computed_config,
                                                            arithmeticConfig: {
                                                                ...prev.computed_config.arithmeticConfig,
                                                                endDatePath: value
                                                            }
                                                        }
                                                    }))}
                                                    options={masterFields.map(field => ({ 
                                                        value: field.id, 
                                                        label: `${field.label} (${field.field_key})` 
                                                    }))}
                                                    loading={loadingMasterFields}
                                                    placeholder="Select master field..."
                                                    searchPlaceholder="Search fields..."
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-purple-700">Unit</Label>
                                            <Select 
                                                value={formData.computed_config.arithmeticConfig?.unit || "days"} 
                                                onValueChange={(v) => setFormData(prev => ({
                                                    ...prev,
                                                    computed_config: {
                                                        ...prev.computed_config,
                                                        arithmeticConfig: {
                                                            ...prev.computed_config.arithmeticConfig,
                                                            unit: v
                                                        }
                                                    }
                                                }))}
                                            >
                                                <SelectTrigger className="bg-white">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {DATE_DIFF_UNITS.map(unit => (
                                                        <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!formData.is_computed && formData.fieldType === 'dropdown' && (
                            <Card className="border shadow-sm">
                                <CardDescription className="p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Link2 className="h-4 w-4 text-blue-600" />
                                            <span className="font-bold text-slate-700 text-sm">Dropdown Options</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Switch id="isDependent" checked={isDependent} onCheckedChange={setIsDependent} />
                                            <Label htmlFor="isDependent" className="text-xs font-bold text-slate-600">Dependent Field?</Label>
                                        </div>
                                    </div>
                                    
                                    <Separator />

                                    {isDependent ? (
                                        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <Label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Parent Field (The Trigger)</Label>
                                                <Popover open={openParentCombo} onOpenChange={setOpenParentCombo}>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" role="combobox" aria-expanded={openParentCombo} className="w-full justify-between bg-white">
                                                            {formData.dependentFieldId ? dropdownFields.find((f) => f.id === formData.dependentFieldId)?.label : "Select parent field..."}
                                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[400px] p-0">
                                                        <Command>
                                                            <CommandInput placeholder="Search parent field..." />
                                                            <CommandList>
                                                                <CommandEmpty>No fields available.</CommandEmpty>
                                                                <CommandGroup>
                                                                    {dropdownFields.map((f) => (
                                                                        <CommandItem key={f.id} value={f.label} onSelect={() => { setFormData(prev => ({ ...prev, dependentFieldId: f.id })); setOpenParentCombo(false) }}>
                                                                            <Check className={cn("mr-2 h-4 w-4", formData.dependentFieldId === f.id ? "opacity-100" : "opacity-0")} />
                                                                            {f.label}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>

                                            {formData.dependentFieldId && (
                                                <div className="space-y-4 pt-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-4 border p-4 rounded-lg bg-slate-50">
                                                                <h4 className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2"><Plus className="w-3 h-3" /> Add Mapping Set</h4>
                                                                
                                                                <div className="space-y-2">
                                                                    <Label className="text-[10px] uppercase font-bold text-slate-500">1. Select Parent Value</Label>
                                                                    <div className="flex gap-2">
                                                                        <Popover open={openParentValueCombo} onOpenChange={setOpenParentValueCombo}>
                                                                            <PopoverTrigger asChild>
                                                                                <Button variant="outline" role="combobox" aria-expanded={openParentValueCombo} className="w-full justify-between bg-white text-xs truncate">
                                                                                    {currentParentValue ? getParentLabel(currentParentValue) : "Select from list..."}
                                                                                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                                                                </Button>
                                                                            </PopoverTrigger>
                                                                            <PopoverContent className="w-[200px] p-0">
                                                                                <Command>
                                                                                    <CommandInput placeholder="Search parent option..." />
                                                                                    <CommandList>
                                                                                        <ScrollArea className="h-[200px]">
                                                                                            <CommandGroup>
                                                                                                {parentFieldOptions.map((opt) => (
                                                                                                    <CommandItem key={opt.value} value={opt.value} onSelect={() => { setCurrentParentValue(opt.value); setOpenParentValueCombo(false); }}>
                                                                                                        {opt.label}
                                                                                                    </CommandItem>
                                                                                                ))}
                                                                                            </CommandGroup>
                                                                                        </ScrollArea>
                                                                                    </CommandList>
                                                                                </Command>
                                                                            </PopoverContent>
                                                                        </Popover>
                                                                        <Input className="w-1/2 h-9 text-xs" placeholder="ID/Value" value={currentParentValue} onChange={e => setCurrentParentValue(e.target.value)} />
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between items-end">
                                                                        <Label className="text-[10px] uppercase font-bold text-slate-500">2. Bulk Add Dependents</Label>
                                                                        <span className="text-[9px] text-slate-400">Separate by comma or newline</span>
                                                                    </div>
                                                                    
                                                                    <Textarea className="h-24 text-xs bg-white font-mono" placeholder="Item 1, Item 2&#10;Item 3&#10;Item 4" value={currentChildInput} onChange={e => setCurrentChildInput(e.target.value)} />
                                                                    <Button size="sm" onClick={addValuesToCurrentList} variant="secondary" className="w-full h-7 text-xs gap-2" type="button"><ArrowDown className="w-3 h-3" /> Process to List</Button>
                                                                    
                                                                    <div className="flex flex-wrap gap-1 min-h-[40px] max-h-[100px] overflow-y-auto p-2 bg-white border rounded-md">
                                                                        {currentChildList.length === 0 && <span className="text-[10px] text-slate-300 italic">No items pending...</span>}
                                                                        {currentChildList.map(c => (
                                                                            <Badge key={c.value} variant="outline" className="text-[10px] bg-slate-50 h-5 px-1 pr-0 gap-1">
                                                                                <span title={c.value}>{c.label}</span>
                                                                                <div className="h-full border-l px-1 hover:bg-red-100 cursor-pointer rounded-r" onClick={() => removeChildFromList(c.value)}><X className="w-3 h-3 text-slate-400 hover:text-red-500" /></div>
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                <Button onClick={saveMappingSet} className="w-full bg-slate-800 text-white h-9 text-xs" disabled={!currentParentValue || currentChildList.length === 0}>
                                                                    <Save className="w-3 h-3 mr-2" /> Save this Mapping Set
                                                                </Button>
                                                            </div>

                                                            <div className="border rounded-lg overflow-hidden flex flex-col h-[400px]">
                                                                <div className="bg-slate-100 p-2 text-xs font-bold text-slate-600 border-b flex justify-between items-center">
                                                                    <span>Existing Mappings</span>
                                                                    <Badge variant="secondary" className="text-[10px]">{Object.keys(formData.manualMapping || {}).length} Sets</Badge>
                                                                </div>
                                                                <ScrollArea className="flex-1 bg-white">
                                                                    <div className="p-2 space-y-2">
                                                                        {Object.entries(formData.manualMapping || {}).length === 0 && <div className="text-center p-8 text-slate-300 text-xs">No mappings configured yet.</div>}
                                                                        {Object.entries(formData.manualMapping || {}).map(([parentVal, children]) => (
                                                                            <div key={parentVal} className="border rounded p-2 text-xs group hover:border-blue-200 transition-colors bg-slate-50/50">
                                                                                <div className="flex justify-between items-start mb-1">
                                                                                    <div className="flex flex-col">
                                                                                        <span className="font-bold text-slate-700">{getParentLabel(parentVal)}</span>
                                                                                        <span className="text-[9px] text-slate-400 font-mono">{parentVal}</span>
                                                                                    </div>
                                                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                        <Edit2 className="w-3 h-3 text-blue-500 cursor-pointer" onClick={() => editMappingSet(parentVal)} />
                                                                                        <Trash2 className="w-3 h-3 text-red-500 cursor-pointer" onClick={() => deleteMappingSet(parentVal)} />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-slate-500 leading-relaxed pl-1 border-l-2 border-slate-200 flex flex-wrap gap-1 mt-2">
                                                                                    {children.map(c => (
                                                                                        <span key={c.value} className="bg-white border px-1 rounded text-[10px]" title={c.value}>{c.label}</span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </ScrollArea>
                                                            </div>
                                                        </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label htmlFor="options" className="text-xs font-bold text-slate-500 uppercase">Static Options</Label>
                                            <Textarea id="options" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} placeholder='["Nairobi", "Mombasa"]' className="font-mono text-xs bg-slate-50" />
                                            <p className="text-[10px] text-slate-500">JSON array or comma-separated list.</p>
                                        </div>
                                    )}
                                </CardDescription>
                            </Card>
                        )}

                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-semibold text-slate-800">Data Sources</Label>
                                {isDependent && <span className="text-xs text-blue-600 italic bg-blue-50 px-2 py-0.5 rounded">Source Table for Children (Manual Mapping)</span>}
                            </div>
                            <DataSourceConfiguration sources={sources} onChange={setSources} documentTypes={formData.documentTypes} />
                        </div>
                        
                        {!formData.is_computed && formData.type === 'date' && (
                            <div className="space-y-4 pt-4 border-t">
                                <Label className="text-sm font-bold text-slate-700">Date Formatting</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center space-x-2 p-3 border rounded-lg bg-slate-50">
                                        <Checkbox id="use-current-date" checked={formData.date_config?.useCurrentDate ?? true} onCheckedChange={(c) => setFormData(p => ({ ...p, date_config: { ...p.date_config, useCurrentDate: c as boolean } }))} />
                                        <Label htmlFor="use-current-date" className="text-xs">Default to Current Date</Label>
                                    </div>
                                    <Select value={formData.date_config?.format || 'YYYY-MM-DD'} onValueChange={(v) => setFormData(p => ({ ...p, date_config: { ...p.date_config, format: v } }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                                            <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-4 border-t bg-white sticky bottom-0 z-10 -m-6 p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                            {loading ? "Saving..." : (isEditMode ? "Save Configuration" : "Create Field")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export const EditFieldDialog = FieldDialog
export const AddFieldDialog = FieldDialog