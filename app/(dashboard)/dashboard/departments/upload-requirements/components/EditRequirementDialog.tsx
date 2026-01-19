// @ts-nocheck
"use client"
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { FileText, Zap, Webhook, Users, Check, ChevronsUpDown, Search, Eraser, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import supabase from "@/lib/supabase/client"
import { Checkbox } from '@/components/ui/checkbox'

export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee' | 'understudy';

const APPLICANT_OPTIONS = [
  { label: 'Company', value: 'company' },
  { label: 'Principal', value: 'principal' },
  { label: 'Director', value: 'director' },
  { label: 'Shareholder', value: 'shareholder' },
  { label: 'Dependent', value: 'dependent' },
  { label: 'Employee', value: 'employee' },
  { label: 'Understudy', value: 'understudy' },
]

interface EditRequirementDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  requirement: any | null
  onSave: (updatedRequirement: any) => Promise<void>
  isSubmitting: boolean
  context: any | null
}

export function EditRequirementDialog({
  isOpen,
  onOpenChange,
  requirement,
  onSave,
  isSubmitting: propIsSubmitting,
  context
}: EditRequirementDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>({
    id: '',
    name: '',
    description: '',
    type: 'standard',
    isVisible: true,
    isRequired: true,
    kycDocumentIds: [],
    hasWebForm: false,
    webFormName: '',
    automationId: '',
    applicantTypes: ['principal'],
    requiredDocumentCount: 1,
    instructions: '',
    isStageDocument: false, // Added stage document field
    category: 'general' // Added category field
  })
  
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [automationTypes, setAutomationTypes] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)

  useEffect(() => {
    if (requirement && isOpen) {
      setFormData({
        ...requirement,
        name: requirement.name || '',
        description: requirement.description || '',
        type: requirement.type || 'standard',
        isVisible: requirement.isVisible !== false,
        isRequired: requirement.isRequired !== false,
        kycDocumentIds: requirement.kyc_document_ids || (requirement.kyc_document_id ? [requirement.kyc_document_id] : []), // Backward compatibility
        hasWebForm: !!requirement.web_automation?.automationId || requirement.hasWebForm,
        webFormName: requirement.web_automation?.webFormName || requirement.webFormName || '',
        automationId: requirement.web_automation?.automationId || requirement.automationId || '',
        applicantTypes: requirement.applicantTypes || (requirement.applicantType ? [requirement.applicantType] : ['principal']), // Backward compatibility
        requiredDocumentCount: requirement.requiredDocumentCount || 1,
        instructions: requirement.instructions || '',
        isStageDocument: requirement.isStageDocument || false, // Added stage document field
        category: requirement.category || 'general' // Added category field
      })
      fetchKycDocuments()
      fetchAutomationTypes()
    }
  }, [requirement, isOpen])

  const fetchKycDocuments = async () => {
    try {
      setLoadingKycDocs(true)
      const { data } = await supabase.from('acc_portal_kyc').select('id, name, display_name').order('name')
      setKycDocuments(data || [])
    } finally {
      setLoadingKycDocs(false)
    }
  }

  const fetchAutomationTypes = async () => {
    const { data } = await supabase.from('tm_automations').select('*').eq('is_active', true).order('name')
    setAutomationTypes(data || [])
  }

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleApplicantType = (type: ApplicantType) => {
    const current = formData.applicantTypes || []
    const updated = current.includes(type) ? current.filter(t => t !== type) : [...current, type]
    updateField('applicantTypes', updated)
  }

  const toggleKycDoc = (docId: string) => {
    const current = formData.kycDocumentIds || []
    const updated = current.includes(docId) ? current.filter(id => id !== docId) : [...current, docId]
    updateField('kycDocumentIds', updated)
  }

  // Helper function to get selected document names
  const getSelectedDocumentNames = () => {
    const selectedIds = formData.kycDocumentIds || []
    if (selectedIds.length === 0) return []
    
    return selectedIds.map(id => {
      const doc = kycDocuments.find(d => d.id.toString() === id)
      return doc?.display_name || doc?.name || `Document ${id}`
    })
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) return
    
    setIsSubmitting(true)
    try {
      let web_automation = null
      if (formData.hasWebForm && formData.automationId) {
        const auto = automationTypes.find(a => String(a.id) === String(formData.automationId))
        web_automation = {
          automationId: formData.automationId,
          automationName: auto?.name,
          webFormName: formData.webFormName,
          webhookUrl: auto?.webhook_url
        }
      }

      // Create updated requirement with only new JSON column structure
      const updatedRequirement = {
        id: formData.id,
        name: formData.name.trim(),
        description: formData.description || '',
        type: formData.type,
        order: formData.order || 0,
        isVisible: formData.isVisible,
        isRequired: formData.isRequired,
        is_mandatory: formData.isRequired,
        // New JSON columns only
        applicantTypes: formData.applicantTypes || ['principal'],
        kyc_document_ids: formData.kycDocumentIds || [],
        requiredDocumentCount: formData.requiredDocumentCount || 1,
        instructions: formData.instructions || '',
        isStageDocument: formData.isStageDocument || false, // Added stage document field
        category: 'processing', // Force to 'processing' for Upload Processing Requirements section
        web_automation,
        updated_at: new Date().toISOString()
        // Legacy fields removed: applicantType, kyc_document_id
      }

      await onSave(updatedRequirement)
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!requirement) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Requirement</DialogTitle>
          <DialogDescription>Modify requirement properties and mappings</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Requirement Name</Label>
              <Input value={formData.name} onChange={e => updateField('name', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label className="flex justify-between items-center">
                Applies To
                <Button variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => updateField('applicantTypes', [])}>Clear</Button>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <div className="flex gap-1 truncate">
                      {(formData.applicantTypes || []).length > 0 ? formData.applicantTypes.map(t => (
                        <Badge key={t} variant="secondary" className="capitalize text-[10px]">{t}</Badge>
                      )) : "Select..."}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search roles..." />
                    <CommandList>
                      <CommandGroup>
                        {APPLICANT_OPTIONS.map(opt => (
                          <CommandItem key={opt.value} onSelect={() => toggleApplicantType(opt.value as ApplicantType)}>
                            <Check className={cn("mr-2 h-4 w-4", (formData.applicantTypes || []).includes(opt.value) ? "opacity-100" : "opacity-0")} />
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Requirement Type</Label>
              <Select value={formData.type} onValueChange={v => updateField('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="multi-document">Multi-Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Required Doc Count</Label>
              <Input type="number" min="1" value={formData.requiredDocumentCount} onChange={e => updateField('requiredDocumentCount', parseInt(e.target.value))} />
            </div>
          </div>

          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border">
            <Label className="flex items-center gap-2 text-primary font-semibold"><FileText className="h-4 w-4"/> Document Mapping</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between bg-white">
                  <div className="flex gap-1 truncate">
                    {(formData.kycDocumentIds || []).length > 0 ? (
                      <div className="flex gap-1 truncate">
                        {getSelectedDocumentNames().map((name, index) => (
                          <Badge key={index} variant="secondary" className="text-[10px] truncate max-w-[150px]">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : "Select documents..."}
                  </div>
                  <Search className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search documents..." />
                  <CommandList>
                    <CommandGroup>
                      {kycDocuments.map(doc => (
                        <CommandItem key={doc.id} onSelect={() => toggleKycDoc(doc.id.toString())}>
                          <Check className={cn("mr-2 h-4 w-4", (formData.kycDocumentIds || []).includes(doc.id.toString()) ? "opacity-100" : "opacity-0")} />
                          {doc.display_name || doc.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                       <CommandItem onSelect={() => updateField('kycDocumentIds', [])} className="justify-center text-destructive font-medium cursor-pointer">
                        <Eraser className="mr-2 h-4 w-4" /> Clear Links
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Stage Document Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="stage-document"
              checked={formData.isStageDocument || false}
              onCheckedChange={(checked) => updateField('isStageDocument', checked)}
            />
            <Label htmlFor="stage-document" className="text-sm font-medium cursor-pointer">
              Mark as Stage Document
            </Label>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="flex items-center gap-2"><Zap className="h-4 w-4"/> Web Form Automation</Label>
              <Switch checked={formData.hasWebForm} onCheckedChange={v => updateField('hasWebForm', v)} />
            </div>
            {formData.hasWebForm && (
              <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                <div className="space-y-2">
                  <Label>Form Name</Label>
                  <Input value={formData.webFormName} onChange={e => updateField('webFormName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Automation</Label>
                  <Select value={formData.automationId} onValueChange={v => updateField('automationId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {automationTypes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Instructions</Label>
            <Textarea value={formData.instructions} onChange={e => updateField('instructions', e.target.value)} placeholder="Display instructions to users..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}