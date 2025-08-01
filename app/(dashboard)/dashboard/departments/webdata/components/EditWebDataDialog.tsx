// @ts-nocheck
"use client"
import React, { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { FileText, Info, X, Link2, Plus } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import supabase from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// Updated ApiWebData interface to handle both old and new format
interface ApiWebData {
  id: string
  name: string
  variableName: string
  description: string
  type: 'standard' | 'conditional' | 'optional'
  order: number
  isVisible: boolean
  isRequired: boolean
  kycDocumentId?: string
  // Handle both old single field format and new array format
  masterField?: any // Legacy single field
  masterFieldId?: string // Legacy single field ID
  masterFields?: any[] // New array format
  masterFieldIds?: string[] // New array format
  fieldType?: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object'
  efnsDisplayName?: string
  arrayItems?: Array<{ name: string; variableName: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select' }>
}

interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  is_required: boolean;
  sources?: Array<{
    source_type: 'profile' | 'document' | 'company';
    table: string;
    path: string;
    priority: number
  }>;
  options?: string[];
  created_at?: string;
  updated_at?: string;
}

interface EditWebDataDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  webData: ApiWebData | null
  onSave: (updatedWebData: ApiWebData) => Promise<void>
  isSubmitting: boolean
  context: { subdepartmentName: string } | null
}

function MasterFieldPicker({ availableFields, onSelect }: { availableFields: JobField[]; onSelect: (field: JobField) => void }) {
  const [open, setOpen] = useState(false)

  console.log('MasterFieldPicker - Available fields:', availableFields.length, availableFields.map(f => ({ id: f.id, label: f.label })));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7">
          <Plus className="mr-1 h-3 w-3" />
          Add Field
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search master fields..." />
          <CommandList>
            <CommandEmpty>No fields available.</CommandEmpty>
            <CommandGroup>
              {availableFields.map((field) => (
                <CommandItem
                  key={`field-${field.id}`}
                  onSelect={() => {
                    onSelect(field);
                    setOpen(false);
                  }}
                >
                  {field.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function EditWebDataDialog({
  isOpen,
  onOpenChange,
  webData,
  onSave,
  isSubmitting: propIsSubmitting,
  context
}: EditWebDataDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ApiWebData | null>(null)
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)
  const [kycDocumentOption, setKycDocumentOption] = useState<'existing' | 'create_new' | 'none'>('none')
  const [allMasterFields, setAllMasterFields] = useState<JobField[]>([])
  const [loadingMasterFields, setLoadingMasterFields] = useState(false)

  useEffect(() => {
    if (webData && isOpen) {
      console.log('EditWebDataDialog - Opening with webData:', JSON.stringify(webData, null, 2));

      // Convert legacy single field format to new array format if needed
      let masterFields = [];
      let masterFieldIds = [];

      if (webData.masterFields && Array.isArray(webData.masterFields) && webData.masterFields.length > 0) {
        // New format with full objects - use as is
        masterFields = webData.masterFields;
        masterFieldIds = webData.masterFieldIds || webData.masterFields.map(f => f.id?.toString()).filter(Boolean);
      } else if (webData.masterFieldIds && Array.isArray(webData.masterFieldIds) && webData.masterFieldIds.length > 0) {
        // We have IDs but no objects - we'll populate the objects once master fields are loaded
        masterFieldIds = webData.masterFieldIds;
        masterFields = []; // Will be populated in the next useEffect
      } else if (webData.masterField && webData.masterFieldId) {
        // Legacy format - convert to array
        masterFields = [webData.masterField];
        masterFieldIds = [webData.masterFieldId];
      } else if (webData.masterFieldId) {
        // Legacy format with only ID - we'll need to fetch the field data
        masterFieldIds = [webData.masterFieldId];
        masterFields = []; // Will be populated once we fetch all master fields
      }

      console.log('EditWebDataDialog - Initial master field setup:', {
        masterFieldIds,
        masterFieldsCount: masterFields.length
      });

      setFormData({
        ...webData,
        kycDocumentId: webData.kycDocumentId || '',
        masterFields: masterFields,
        masterFieldIds: masterFieldIds,
        fieldType: webData.fieldType || 'text',
        efnsDisplayName: webData.efnsDisplayName || webData.name,
        arrayItems: webData.arrayItems || []
      })

      setKycDocumentOption(webData.kycDocumentId ? 'existing' : 'none')

      fetchKycDocuments()
      fetchMasterFields()
    }
  }, [webData, isOpen])

  // Update master fields in formData once all master fields are loaded
  useEffect(() => {
    if (formData && allMasterFields.length > 0 && formData.masterFieldIds && formData.masterFieldIds.length > 0) {
      // If we have IDs but no field objects (or empty array), populate them
      if (!formData.masterFields || formData.masterFields.length === 0) {
        console.log('EditWebDataDialog - Attempting to populate master fields from IDs:', formData.masterFieldIds);
        console.log('EditWebDataDialog - Available master fields:', allMasterFields.length);

        const populatedFields = formData.masterFieldIds
          .map(id => {
            const field = allMasterFields.find(f => f.id.toString() === id.toString());
            if (!field) {
              console.warn(`EditWebDataDialog - Master field with ID ${id} not found`);
            }
            return field;
          })
          .filter(Boolean);

        console.log('EditWebDataDialog - Populated master fields:', populatedFields.map(f => ({ id: f.id, label: f.label })));

        if (populatedFields.length > 0) {
          setFormData(prev => prev ? ({
            ...prev,
            masterFields: populatedFields
          }) : null);
        } else {
          console.warn('EditWebDataDialog - No master fields could be populated from IDs:', formData.masterFieldIds);
        }
      } else {
        console.log('EditWebDataDialog - Master fields already populated:', formData.masterFields.map(f => ({ id: f.id, label: f.label })));
      }
    }
  }, [allMasterFields, formData?.masterFieldIds]);

  const availableMasterFields = useMemo(() => {
    if (!formData) return []
    const linkedIds = new Set(formData.masterFields?.map(f => f.id) || []);
    return allMasterFields.filter(f => !linkedIds.has(f.id));
  }, [allMasterFields, formData?.masterFields]);

  const fetchKycDocuments = async () => {
    setLoadingKycDocs(true);
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('id, name, display_name').order('name')
      if (error) throw error
      setKycDocuments(data || [])
    } catch (error) { toast({ title: 'Error', description: 'Failed to load document types', variant: 'destructive' }) }
    finally { setLoadingKycDocs(false) }
  }

  const fetchMasterFields = async () => {
    setLoadingMasterFields(true);
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('*').order('label')
      if (error) throw error
      setAllMasterFields(data || [])
    } catch (error) { toast({ title: 'Error', description: 'Failed to load master fields', variant: 'destructive' }) }
    finally { setLoadingMasterFields(false) }
  }

  const createNewKycDocument = async (webDataName: string, departmentName: string) => {
    const { data, error } = await supabase.from('acc_portal_kyc').insert({ name: webDataName, display_name: webDataName, department: departmentName, category: 'application-docs', fields: [], listed: true, created_at: new Date().toISOString() }).select('id').single()
    if (error) throw error
    toast({ title: "KYC Document Created", description: `Created new document type: ${webDataName}` })
    return data.id
  }

  const handleSubmit = async () => {
    if (!formData || !formData.name.trim()) {
      toast({ title: 'Error', description: 'WebData name is required', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const updatedData = { ...formData }

      if (kycDocumentOption === 'create_new') {
        const departmentName = context?.subdepartmentName?.split(' ')[0] || 'General'
        const newDocId = await createNewKycDocument(formData.name, departmentName)
        updatedData.kycDocumentId = newDocId
        await fetchKycDocuments()
      } else if (kycDocumentOption === 'none') {
        updatedData.kycDocumentId = ''
      }

      // Extract only essential master field data for storage (just id, label, field_key)
      const simplifiedMasterFields = (updatedData.masterFields || []).map(field => ({
        id: field.id,
        label: field.label,
        field_key: field.field_key,
        type: field.type,
        is_required: field.is_required
      }));

      const updatedWebData: ApiWebData = {
        ...updatedData,
        name: updatedData.name.trim(),
        description: updatedData.description?.trim() || '',
        kycDocumentId: updatedData.kycDocumentId || undefined,
        // Don't store the full masterFields objects in the database - only store the IDs
        masterFields: undefined, // Remove this from database storage
        masterFieldIds: (updatedData.masterFields || []).map(f => f.id.toString()), // Only store IDs
        fieldType: updatedData.fieldType || 'text',
        efnsDisplayName: updatedData.efnsDisplayName || updatedData.name,
        arrayItems: updatedData.arrayItems || []
      }

      console.log('EditWebDataDialog - Submitting webData with master field IDs:', updatedWebData.masterFieldIds);
      console.log('EditWebDataDialog - Full webData being submitted:', JSON.stringify(updatedWebData, null, 2));

      await onSave(updatedWebData)
      toast({ title: 'Success', description: 'WebData updated successfully' })
      handleClose()

    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save webData', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const linkMasterField = (fieldToAdd: JobField) => {
    console.log('EditWebDataDialog - Linking master field:', { id: fieldToAdd.id, label: fieldToAdd.label });
    setFormData(prev => prev ? ({
      ...prev,
      masterFields: [...(prev.masterFields || []), fieldToAdd],
      masterFieldIds: [...(prev.masterFieldIds || []), fieldToAdd.id.toString()]
    }) : null);
  };

  const unlinkMasterField = (fieldIdToRemove: number) => {
    console.log('EditWebDataDialog - Unlinking master field:', fieldIdToRemove);
    setFormData(prev => prev ? ({
      ...prev,
      masterFields: (prev.masterFields || []).filter(f => f.id !== fieldIdToRemove),
      masterFieldIds: (prev.masterFieldIds || []).filter(id => id !== fieldIdToRemove.toString())
    }) : null);
  };

  const addArrayItem = () => {
    setFormData(prev => prev ? ({
      ...prev,
      arrayItems: [...(prev.arrayItems || []), { name: '', variableName: '', type: 'text' }]
    }) : null);
  };

  const removeArrayItem = (index: number) => {
    setFormData(prev => {
      if (!prev?.arrayItems) return prev;
      const newItems = [...prev.arrayItems];
      newItems.splice(index, 1);
      return { ...prev, arrayItems: newItems };
    });
  };

  const updateArrayItem = (index: number, field: string, value: string) => {
    setFormData(prev => {
      if (!prev?.arrayItems) return prev;
      const newItems = [...prev.arrayItems];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, arrayItems: newItems };
    });
  };

  const handleClose = () => { onOpenChange(false); setFormData(null); }

  if (!formData) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit WebData</DialogTitle>
          <DialogDescription>Update the webData details and field associations.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>WebData Name (EFNS Display Name) *</Label>
              <Input
                value={formData.efnsDisplayName || formData.name}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  name: e.target.value,
                  efnsDisplayName: e.target.value
                }))}
                placeholder="e.g., Full Legal Name"
              />
            </div>
            <div className="space-y-2">
              <Label>Automation Variable Name</Label>
              <Input
                value={formData.variableName || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, variableName: e.target.value }))}
                placeholder="e.g., fullName"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select
                value={formData.fieldType || 'text'}
                onValueChange={(value) => setFormData(prev => ({ ...prev, fieldType: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="array">Array</SelectItem>
                  <SelectItem value="object">Object</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
            />
          </div>

          {/* Master Field Linking UI */}
          <div className="space-y-3">
            <Label className="font-medium">Linked Master Fields</Label>
            <div className="p-3 border rounded-md bg-gray-50/50 min-h-[80px] space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                {(formData.masterFields || []).map(field => (
                  <Badge key={field.id} variant="secondary" className="pl-2 pr-1 py-1 text-sm">
                    {field.label}
                    <button
                      onClick={() => unlinkMasterField(field.id)}
                      className="ml-2 rounded-full hover:bg-gray-300 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {loadingMasterFields ? (
                  <span className="text-xs text-muted-foreground">Loading master fields...</span>
                ) : (
                  <MasterFieldPicker availableFields={availableMasterFields} onSelect={linkMasterField} />
                )}
              </div>
              {(formData.masterFields || []).length === 0 && !loadingMasterFields && (
                <p className="text-sm text-gray-500 italic">
                  {formData.masterFieldIds && formData.masterFieldIds.length > 0
                    ? `Found ${formData.masterFieldIds.length} master field ID(s) but couldn't load field details. Use "Add Field" to link new fields.`
                    : "No master fields linked. Use the \"Add Field\" button to link master fields."
                  }
                </p>
              )}
            </div>
          </div>

          {/* Array Items Section */}
          {formData.fieldType === 'array' && (
            <div className="space-y-3">
              <Label className="font-medium">Array Item Structure</Label>
              <div className="p-4 border rounded-lg bg-gray-50/50 space-y-3">
                {(formData.arrayItems || []).map((item, index) => (
                  <div key={index} className="flex items-end gap-2 p-3 border rounded-md bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                      <div className="space-y-1">
                        <Label className="text-xs">Display Name</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => updateArrayItem(index, 'name', e.target.value)}
                          placeholder="Item name"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Variable Name</Label>
                        <Input
                          value={item.variableName}
                          onChange={(e) => updateArrayItem(index, 'variableName', e.target.value)}
                          placeholder="itemVariable"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={item.type}
                          onValueChange={(value) => updateArrayItem(index, 'type', value)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="select">Select</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeArrayItem(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addArrayItem}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={formData.isRequired}
                onCheckedChange={(c) => setFormData(p => ({ ...p, isRequired: !!c }))}
              />
              <Label>Required</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={formData.isVisible}
                onCheckedChange={(c) => setFormData(p => ({ ...p, isVisible: !!c }))}
              />
              <Label>Visible</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.name.trim()}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}