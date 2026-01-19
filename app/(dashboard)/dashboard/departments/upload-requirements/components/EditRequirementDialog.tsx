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
import { FileText, Zap, Webhook, Users, Check, ChevronsUpDown, Search, Eraser, Trash2, Loader2, Database } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import supabase from "@/lib/supabase/client"
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
  const [activeTab, setActiveTab] = useState("general")
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
    isStageDocument: false, 
    category: 'general',
    hasTemplate: false,
    webdata: [] // Added webdata
  })
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [automationTypes, setAutomationTypes] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)

  useEffect(() => {
    if (requirement && isOpen) {
      const webAuto = requirement.web_automation || {};
      const automationId = webAuto.automationId || webAuto.automation_id || requirement.automationId || requirement.automation_id || '';
      const webFormName = webAuto.webFormName || webAuto.web_form_name || requirement.webFormName || requirement.web_form_name || '';
      const hasWebForm = !!automationId || requirement.hasWebForm === true;

      setFormData({
        ...requirement,
        name: requirement.name || '',
        description: requirement.description || '',
        type: requirement.type || 'standard',
        isVisible: requirement.isVisible !== false,
        isRequired: requirement.isRequired !== false,
        kycDocumentIds: requirement.kyc_document_ids || (requirement.kyc_document_id ? [requirement.kyc_document_id] : []),
        hasWebForm: hasWebForm,
        webFormName: webFormName,
        automationId: automationId ? String(automationId) : '',
        applicantTypes: requirement.applicantTypes || (requirement.applicantType ? [requirement.applicantType] : ['principal']),
        requiredDocumentCount: requirement.requiredDocumentCount || 1,
        instructions: requirement.instructions || '',
        isStageDocument: requirement.isStageDocument || false,
        category: requirement.category || 'general',
        hasTemplate: requirement.hasTemplate || false,
        webdata: requirement.webdata || [] // Populate webdata from the requirement object passed by parent
      });

      fetchKycDocuments();
      fetchAutomationTypes();
    }
  }, [requirement, isOpen]);

  useEffect(() => {
    const fetchTemplates = async () => {
      const docIds = formData.kycDocumentIds || [];
      if (docIds.length === 0 || !formData.hasTemplate) {
        setTemplates([]);
        return;
      }
      setLoadingTemplates(true);
      try {
        const { data, error } = await supabase
          .from('acc_portal_templates')
          .select('*')
          .in('document_id', docIds)
          .or('banks_associated.is.null,banks_associated.eq.[]')
          .order('file_name', { ascending: true });

        if (error) throw error;
        setTemplates(data || []);
      } catch (error) {
        console.error("Error fetching templates:", error);
      } finally {
        setLoadingTemplates(false);
      }
    };
    if (isOpen) {
      fetchTemplates();
    }
  }, [formData.kycDocumentIds, formData.hasTemplate, isOpen]);

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
    try {
      const { data, error } = await supabase.from('tm_automations').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      if (data) {
        setAutomationTypes(data);
        setFormData(prev => ({ ...prev })); 
      }
    } catch (err) { console.error(err); }
  };

  const updateField = (field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value }))
  
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
          automationName: auto?.name || '',
          webFormName: formData.webFormName,
          webhookUrl: auto?.webhook_url || ''
        }
      }
      const updatedRequirement = {
        ...requirement,
        id: formData.id,
        name: formData.name.trim(),
        description: formData.description || '',
        type: formData.type,
        isVisible: formData.isVisible,
        isRequired: formData.isRequired,
        is_mandatory: formData.isRequired,
        applicantTypes: formData.applicantTypes || ['principal'],
        kyc_document_ids: formData.kycDocumentIds || [],
        requiredDocumentCount: formData.requiredDocumentCount || 1,
        instructions: formData.instructions || '',
        isStageDocument: formData.isStageDocument || false,
        category: formData.category || 'processing', 
        hasTemplate: formData.hasTemplate || false,
        web_automation: web_automation, 
        updated_at: new Date().toISOString()
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
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b bg-white">
          <DialogTitle>Edit Requirement</DialogTitle>
          <DialogDescription>Modify requirement properties and mappings</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-4 bg-white border-b">
              <TabsList className="bg-slate-100">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="webdata">Web Data ({formData.webdata?.length || 0})</TabsTrigger>
              </TabsList>
            </div>

            {/* TAB 1: GENERAL */}
            <TabsContent value="general" className="flex-1 overflow-y-auto p-6 m-0 space-y-6">
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
                  <Label className="flex items-center gap-2 text-primary font-semibold"><FileText className="h-4 w-4" /> Document Mapping</Label>
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

                {/* Toggles */}
                <div className="flex gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="stage-document" checked={formData.isStageDocument || false} onCheckedChange={(checked) => updateField('isStageDocument', checked)} />
                    <Label htmlFor="stage-document" className="cursor-pointer">Stage Document</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="has-template" checked={formData.hasTemplate || false} onCheckedChange={(checked) => updateField('hasTemplate', checked)} />
                    <Label htmlFor="has-template" className="cursor-pointer">Has Template</Label>
                  </div>
                </div>

                {formData.hasTemplate && (
                  <div className="border-t pt-4 space-y-3">
                    <Label className="flex items-center gap-2 text-blue-600 font-semibold"><FileText className="h-4 w-4" /> Linked Letter Templates</Label>
                    <div className="bg-slate-50 rounded-lg border p-3">
                      {loadingTemplates ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground p-2"><Loader2 className="h-3 w-3 animate-spin" /> Fetching templates...</div>
                      ) : templates.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                          {templates.map((template) => (
                            <div key={template.id} className="flex items-center justify-between bg-white p-2 rounded border shadow-sm">
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-medium truncate">{template.file_name}</span>
                                <span className="text-[10px] text-muted-foreground truncate opacity-70">{template.subject || "No subject defined"}</span>
                              </div>
                              <Popover>
                                <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7 text-[10px]">Preview</Button></PopoverTrigger>
                                <PopoverContent className="w-80 max-h-60 overflow-y-auto">
                                  <div className="space-y-2"><h4 className="font-medium text-xs border-b pb-1">Content Preview</h4><div className="text-[10px] text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: template.content?.substring(0, 500) + (template.content?.length > 500 ? '...' : '') }} /></div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 bg-white rounded border border-dashed"><FileText className="h-8 w-8 text-slate-300 mx-auto mb-1" /><p className="text-xs text-slate-500">No generic templates found.</p></div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="flex items-center gap-2"><Zap className="h-4 w-4" /> Web Form Automation</Label>
                    <Switch checked={formData.hasWebForm} onCheckedChange={v => updateField('hasWebForm', v)} />
                  </div>
                  {formData.hasWebForm && (
                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                      <div className="space-y-2"><Label>Form Name</Label><Input value={formData.webFormName} onChange={e => updateField('webFormName', e.target.value)} /></div>
                      <div className="space-y-2"><Label>Automation</Label><Select value={formData.automationId} onValueChange={v => updateField('automationId', v)}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{automationTypes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea value={formData.instructions} onChange={e => updateField('instructions', e.target.value)} placeholder="Display instructions to users..." rows={2} />
                </div>
            </TabsContent>
            
            {/* TAB 2: WEB DATA */}
            <TabsContent value="webdata" className="flex-1 overflow-y-auto m-0 p-6 bg-slate-50">
               {formData.webdata && formData.webdata.length > 0 ? (
                 <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Database className="h-4 w-4 text-blue-600"/> Configured Fields</h3>
                     <Badge variant="outline" className="bg-white">{formData.webdata.length} fields</Badge>
                   </div>
                   <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
                      <Table>
                        <TableHeader>
                           <TableRow className="bg-slate-100/50">
                             <TableHead className="h-9">Variable ID</TableHead>
                             <TableHead className="h-9">Display Name</TableHead>
                             <TableHead className="h-9">Type</TableHead>
                             <TableHead className="h-9">Entity</TableHead>
                           </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.webdata.map((field: any, idx: number) => (
                            <TableRow key={idx}>
                               <TableCell className="font-mono text-xs text-blue-600">{field.variableName}</TableCell>
                               <TableCell className="text-xs font-medium">{field.efnsDisplayName || field.name}</TableCell>
                               <TableCell><Badge variant="secondary" className="text-[10px]">{field.fieldType}</Badge></TableCell>
                               <TableCell className="text-xs capitalize text-slate-500">{field.entityType}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                   </div>
                   <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                      <p className="font-semibold mb-1">Note:</p>
                      <p>Web Data fields are configured via the "Add Requirements" automation tool. To modify these fields, please update the configuration in the main requirements table.</p>
                   </div>
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                    <Database className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium">No Web Data Configured</p>
                    <p className="text-xs max-w-[200px] text-center opacity-70">This requirement does not have any web form data fields attached.</p>
                 </div>
               )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="p-4 border-t bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}