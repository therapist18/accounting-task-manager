// @ts-nocheck
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
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import type { JobField, JobFieldUpdate } from "../../types/database"
import { MultiSelectDocumentTypes } from "../ui/multi-select-document-types"
import { Calculator, FunctionSquare, Database, Settings2 } from "lucide-react"
import { DataSourceConfiguration, SourceCardState } from "./link-sources-dialog"

interface EditFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onSuccess: () => void
  availableFields?: Array<{ id: string; label: string; type: string }>
}

const COMPUTED_FUNCTIONS = [
  { value: "getLatestDocumentNumber", label: "Get Document Number (e.g. Passport No)" },
  { value: "getLatestDocumentExpiryDate", label: "Get Expiry Date" },
  { value: "getLatestDocumentIssueDate", label: "Get Issue Date" },
  { value: "determineImmigrationStatus", label: "Determine Immigration Status" },
  { value: "getLatestWorkPermit", label: "Get Latest Work Permit No" },
]

export function EditFieldDialog({ open, onOpenChange, field, onSuccess, availableFields = [] }: EditFieldDialogProps) {
  const [formData, setFormData] = useState<Partial<JobFieldUpdate> & {
    fieldType: 'normal' | 'dropdown';
    dependentFieldId?: string;
    date_config?: {
      useCurrentDate?: boolean;
      defaultDate?: string;
      format?: string;
    };
    documentTypes: Array<{ value: string; label: string }>;
    is_computed: boolean;
    computed_function: string;
    computed_config: { document_ids?: string[] };
  }>({
    fieldType: 'normal',
    date_config: { useCurrentDate: true, format: 'YYYY-MM-DD' },
    documentTypes: [],
    is_computed: false,
    computed_function: "",
    computed_config: {}
  })
  
  // Advanced Sources State
  const [sources, setSources] = useState<SourceCardState[]>([])

  const [optionsText, setOptionsText] = useState("")
  const [loading, setLoading] = useState(false)
  const [isDependent, setIsDependent] = useState(false)

  // Filter available fields for dependency selection
  const dropdownFields = availableFields.filter(f => f.type === 'select' && f.id !== field?.id)

  // Fetch document types
  useEffect(() => {
    const fetchDocumentTypes = async () => {
      try {
        const { data } = await supabase.from('acc_portal_kyc').select('id, display_name').order('display_name', { ascending: true })
        if (data) {
            setFormData(prev => ({ 
                ...prev, 
                documentTypes: data.map((dt: any) => ({ value: dt.id, label: dt.display_name || `Doc ${dt.id}` })) 
            }))
        }
      } catch (error) { console.error(error) }
    }
    if (open) fetchDocumentTypes()
  }, [open])

  // Init Data
  useEffect(() => {
    if (field) {
      const isDropdown = field.type === 'select'
      const dependentField = field.sources?.find(s => s.source_type === 'field')

      // Extract computed config details
      const computedConfig = field.computed_config || {}
      const isComputedFromConfig = computedConfig.is_computed || false
      const computedFunction = computedConfig.computed_function || ""
      const documentIds = computedConfig.document_ids || []

      setFormData({
        field_key: field.field_key,
        label: field.label,
        type: field.type,
        is_required: field.is_required,
        fieldType: isDropdown ? 'dropdown' : 'normal',
        dependentFieldId: dependentField?.table,
        date_config: field.date_config || { useCurrentDate: true, format: 'YYYY-MM-DD' },
        is_computed: isComputedFromConfig,
        computed_function: computedFunction,
        computed_config: { document_ids: documentIds },
        documentTypes: formData.documentTypes
      })

      // Initialize Advanced Sources
      if (field.sources && field.sources.length > 0) {
          setSources(field.sources.map(s => ({
              ...s,
              id: crypto.randomUUID(), // Temp ID for UI list
              fields: [], // Will be lazy loaded by the component
              loadingFields: false
          })))
      } else {
          setSources([])
      }

      setIsDependent(!!dependentField)
      setOptionsText(field.options ? JSON.stringify(field.options, null, 2) : "")
    }
  }, [field, open])

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!field) return
    setLoading(true)

    try {
      let options: any[] = []
      if (formData.fieldType === 'dropdown' && !isDependent) {
        try { options = JSON.parse(optionsText) } catch { options = optionsText.split(',').map(opt => opt.trim()).filter(Boolean) }
      } else if (field.options) {
        options = Array.isArray(field.options) ? field.options : []
      }

      const updateData: JobFieldUpdate = {
        field_key: formData.field_key || field.field_key,
        label: formData.label || field.label,
        type: formData.fieldType === 'dropdown' ? 'select' : (formData.type || field.type),
        is_required: formData.is_required ?? field.is_required,
        options,
          updated_at: new Date().toISOString()
      }

      // Prepare clean sources (remove UI props like 'fields' and 'loadingFields')
      const cleanSources = sources.map(({ id, fields, loadingFields, ...rest }) => rest)

      if (formData.is_computed) {
               // Extract Document IDs from the configured sources
        const extractedDocIds = sources
            .filter(s => s.source_type === 'document' && s.document_id && s.document_id.length > 0)
            .flatMap(s => s.document_id || []);
            
        updateData.computed_config = {
            document_ids: [...new Set(extractedDocIds)], // Save unique IDs
            is_computed: formData.is_computed,
            computed_function: formData.computed_function,
        };
        
        // Save sources so the UI can restore them later
        updateData.sources = cleanSources; 
      } else {
        // --- 2. Standard Field Mode ---
        updateData.computed_config = null;
        
        if (formData.fieldType === 'dropdown' && isDependent && formData.dependentFieldId) {
            // Dropdown Dependency Override
            updateData.sources = [{
                source_type: 'field',
                table: formData.dependentFieldId,
                path: 'id',
                priority: 1
            }];
        } else {
            // Standard Sources
            updateData.sources = cleanSources
        }
      }

      if (formData.type === 'date') {
        updateData.date_config = {
          useCurrentDate: formData.date_config?.useCurrentDate,
          defaultDate: formData.date_config?.defaultDate,
          format: formData.date_config?.format
        }
      }

      const { error } = await supabase.from('tm_job_fields').update(updateData).eq('id', field.id)
      if (error) throw error

      toast({ title: "Success", description: "Field updated successfully" })
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({ title: "Error", description: "Failed to update field", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Edit Field: {field?.label}</DialogTitle>
          <DialogDescription>Configure field settings and data mapping.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* 1. GENERAL SETTINGS */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                    <Settings2 className="w-4 h-4 text-slate-500" />
                    <h3 className="font-semibold text-slate-800">General Settings</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="field-key">Field Key</Label>
                        <Input id="field-key" value={formData.field_key || ''} onChange={(e) => setFormData({ ...formData, field_key: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="label">Display Label</Label>
                        <Input id="label" value={formData.label || ''} onChange={(e) => setFormData({ ...formData, label: e.target.value })} required />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Field Type</Label>
                    <Select value={formData.type || ''} onValueChange={(value) => setFormData({ ...formData, type: value as any, fieldType: value === 'select' ? 'dropdown' : 'normal' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="select">Dropdown</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch id="is_required" checked={formData.is_required || false} onCheckedChange={(c) => setFormData(p => ({ ...p, is_required: c }))} />
                    <Label htmlFor="is_required">Required field</Label>
                </div>
            </div>

            {/* 2. LOGIC & DATA */}
            <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-slate-500" />
                        <h3 className="font-semibold text-slate-800">Data & Logic</h3>
                    </div>
                    {/* Computed Toggle */}
                    <div className="flex items-center gap-2">
                        <Label htmlFor="computed_toggle" className="text-xs text-slate-500">Smart/Computed Field?</Label>
                        <Switch id="computed_toggle" checked={formData.is_computed} onCheckedChange={(c) => setFormData({ ...formData, is_computed: c })} />
                    </div>
                </div>

                {/* A. Computed Configuration */}
                {formData.is_computed && (
                    <div className="space-y-4 p-4 border border-purple-100 bg-purple-50/50 rounded-lg animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-2 mb-2 text-purple-700 font-medium">
                            <FunctionSquare className="h-4 w-4" /> Computed Logic Config
                        </div>
                        <div className="space-y-2">
                            <Label className="text-purple-900">Logic Function</Label>
                            <Select value={formData.computed_function} onValueChange={(val) => setFormData({...formData, computed_function: val})}>
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Select logic..." /></SelectTrigger>
                                <SelectContent>
                                    {COMPUTED_FUNCTIONS.map(fn => (<SelectItem key={fn.value} value={fn.value}>{fn.label}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-purple-600 mt-1">
                                Select the function. Use the <strong>Data Sources</strong> section below to define which documents/tables are used.
                            </p>
                        </div>
                    </div>
                )}

                {/* B. Dropdown Configuration */}
                {!formData.is_computed && formData.fieldType === 'dropdown' && (
                    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
                        <div className="flex items-center space-x-2">
                            <Switch id="isDependent" checked={isDependent} onCheckedChange={setIsDependent} />
                            <Label htmlFor="isDependent">Dependent on another field</Label>
                        </div>
                        {isDependent ? (
                            <div className="space-y-2">
                                <Label>Parent Dropdown</Label>
                                <Select value={formData.dependentFieldId || ''} onValueChange={(value) => setFormData(prev => ({ ...prev, dependentFieldId: value }))}>
                                    <SelectTrigger><SelectValue placeholder="Select parent field..." /></SelectTrigger>
                                    <SelectContent>
                                        {dropdownFields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="options">Static Options (JSON array or comma-separated)</Label>
                                <Textarea id="options" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} placeholder='["Option 1", "Option 2"]' />
                            </div>
                        )}
                    </div>
                )}

                {/* C. Data Sources Builder (Visible for Computed OR Standard) */}
                {!(formData.fieldType === 'dropdown' && isDependent) && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold">Data Sources</Label>
                            {formData.is_computed && (
                                <span className="text-xs text-purple-600 italic">Define documents/inputs for the logic function here</span>
                            )}
                        </div>
                        <DataSourceConfiguration 
                            sources={sources} 
                            onChange={setSources} 
                            documentTypes={formData.documentTypes}
                        />
                    </div>
                )}

                {/* D. Date Configuration */}
                {!formData.is_computed && formData.type === 'date' && (
                    <div className="space-y-4 pt-4 border-t">
                        <Label>Date Formatting</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="use-current-date" checked={formData.date_config?.useCurrentDate ?? true} onCheckedChange={(c) => setFormData(p => ({ ...p, date_config: { ...p.date_config, useCurrentDate: c as boolean } }))} />
                                <Label htmlFor="use-current-date">Use Current Date Default</Label>
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

            <DialogFooter className="pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Configuration"}</Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}