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
import { FileText, Zap, Users, Check, ChevronsUpDown, Search, Eraser, Trash2, Loader2, Database, X, Settings2, Calculator } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import supabase from "@/lib/supabase/client"
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  NATIONALITY_TYPES,
  AGE_RANGE_TYPES,
  DEPENDANT_RELATIONSHIPS,
  type NationalityType,
  type AgeRangeType
} from "@/lib/constants/entity-types"
import { COMPUTED_FUNCTIONS, EXECUTION_MODES, LINKING_VARIABLES } from "@/lib/constants/computed-functions"
import { useTableData, type TableOption } from "@/lib/tableUtils"
import { Card } from '@/components/ui/card'

export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependant' | 'employee' | 'understudy';

const APPLICANT_OPTIONS = [
  { label: 'Company', value: 'company' },
  { label: 'Principal', value: 'principal' },
  { label: 'Director', value: 'director' },
  { label: 'Shareholder', value: 'shareholder' },
  { label: 'Dependant', value: 'dependant' },
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
    type: 'document',
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
    webdata: [],
    executionMode: 'latest',
    computedFunction: 'none',
    sourceTable: '',
    linkingVariable: null,
    selectedTemplateId: undefined,
    selectedTemplate: undefined
  })
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [automationTypes, setAutomationTypes] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)

  // Table data hook for fetching available tables
  const { tables, loadingTables } = useTableData()

  useEffect(() => {
    if (requirement && isOpen) {
      const webAuto = requirement.web_automation || {};
      const automationId = webAuto.automationId || webAuto.automation_id || requirement.automationId || requirement.automation_id || '';
      const webFormName = webAuto.webFormName || webAuto.web_form_name || requirement.webFormName || requirement.web_form_name || '';
      
      setFormData({
        ...requirement,
        name: requirement.name || '',
        description: requirement.description || '',
        type: requirement.type || 'document',
        isVisible: requirement.isVisible !== false,
        isRequired: requirement.isRequired !== false || requirement.is_mandatory !== false,
        kycDocumentIds: requirement.kyc_document_ids || (requirement.kyc_document_id ? [requirement.kyc_document_id] : []),
        hasWebForm: !!automationId || requirement.hasWebForm === true,
        webFormName: webFormName,
        automationId: automationId ? String(automationId) : '',
        applicantTypes: requirement.applicantTypes || (requirement.applicantType ? [requirement.applicantType] : ['principal']),
        requiredDocumentCount: requirement.requiredDocumentCount || 1,
        instructions: requirement.instructions || '',
        isStageDocument: requirement.isStageDocument || false,
        category: requirement.category || 'general',
        hasTemplate: requirement.hasTemplate || false,
        webdata: requirement.webdata || [],
        executionMode: requirement.execution_mode || 'latest',
        computedFunction: requirement.computed_function || 'getLatestDocument',
        sourceTable: requirement.sourceTable || '',
        linkingVariable: requirement.linkingVariable || null,
        selectedTemplateId: requirement.selectedTemplateId || undefined,
        selectedTemplate: requirement.selectedTemplate || undefined
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
      const entityTypeMap: Record<string, string> = {
        'company': 'company',
        'principal': 'principal',
        'director': 'director',
        'shareholder': 'shareholder',
        'dependant': 'dependant',
        'employee': 'employee',
        'understudy': 'understudy'
      };

      const applicantTypes = formData.applicantTypes || ['principal'];
      const entityTypes = [...new Set(applicantTypes.map(type => entityTypeMap[type] || 'principal'))];
      const entityFilters = entityTypes.map(et => `entity_types.cs.["${et}"]`).join(',');

      // BUILD THE QUERY
      let query = supabase
        .from('acc_portal_templates')
        .select('*')
        .in('document_id', docIds);

      // Logic: Must match the entity type
      if (entityFilters) {
        query = query.or(entityFilters);
      }

      const { data, error } = await query.order('file_name', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoadingTemplates(false);
    }
  };
  if (isOpen) fetchTemplates();
}, [formData.kycDocumentIds, formData.hasTemplate, formData.applicantTypes, isOpen]);

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
      const { data } = await supabase.from('tm_automations').select('*').eq('is_active', true).order('name');
      if (data) setAutomationTypes(data);
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

  const removeKycDoc = (docId: string) => {
    const current = formData.kycDocumentIds || []
    updateField('kycDocumentIds', current.filter(id => id !== String(docId)))
  }

  const getSelectedDocumentNames = () => {
    const selectedIds = formData.kycDocumentIds || []
    return selectedIds.map(id => {
      const doc = kycDocuments.find(d => String(d.id) === String(id))
      return { id, name: doc?.display_name || doc?.name || `Document ${id}` }
    })
  }

  const handleSubmit = async () => {
    console.log('[handleSubmit] Starting form submission...');
    if (!formData.name.trim()) {
      console.log('[handleSubmit] Validation failed: Name is required');
      return;
    }
    
    setIsSubmitting(true);
    try {
      let web_automation = null;
      console.log('[handleSubmit] Form data:', {
        hasWebForm: formData.hasWebForm,
        automationId: formData.automationId,
        contextJobLevel: context?.jobLevel
      });

      if (formData.hasWebForm && formData.automationId) {
        const auto = automationTypes.find(a => String(a.id) === String(formData.automationId));
        console.log('[handleSubmit] Found automation:', auto);
        
        // Update tm_automations table with job level data if it exists in context
        if (context?.jobLevel) {
          // Create job level object with correct structure
          const jobLevelForAutomation = {
            level: context.jobLevel.level || (context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4),
            class_id: context.classId ? Number(context.classId) : null,
            subclass_id: context.subclassId ? Number(context.subclassId) : null,
            department_id: Number(context.departmentId),
            subdepartment_id: Number(context.subdepartmentId)
          };
          
          console.log('[handleSubmit] Updating automation with job level:', {
            automationId: formData.automationId,
            jobLevel: jobLevelForAutomation
          });
          
          try {
            const { data, error: updateError } = await supabase
              .from('tm_automations')
              .update({ 
                job_level: jobLevelForAutomation,
                updated_at: new Date().toISOString()
              })
              .eq('id', formData.automationId)
              .select();

            console.log('[handleSubmit] Update result:', { data, error: updateError });

            if (updateError) {
              console.error('[handleSubmit] Error updating automation job level:', updateError);
              throw updateError;
            }
            
            console.log('[handleSubmit] Successfully updated automation with job level');
          } catch (updateErr) {
            console.error('[handleSubmit] Exception during automation update:', updateErr);
            throw updateErr;
          }
        } else {
          console.log('[handleSubmit] No job level found in context, skipping automation update');
        }

        web_automation = {
          automationId: formData.automationId,
          automationName: auto?.name || '',
          webFormName: formData.webFormName,
          webhookUrl: auto?.webhook_url || ''
        };
      }
      console.log('[handleSubmit] Creating updated requirement object...');
      const updatedRequirement = {
        ...requirement,
        name: formData.name.trim(),
        description: formData.description || '',
        type: 'document',
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
        execution_mode: formData.executionMode, 
        computed_function: formData.computedFunction,
        nationality: formData.nationality,
        ageRange: formData.ageRange,
        dependantRelationships: formData.dependantRelationships,
        sourceTable: formData.sourceTable || '',
        linkingVariable: formData.linkingVariable || null,
        selectedTemplateId: formData.selectedTemplateId || undefined,
        updated_at: new Date().toISOString()
      };
      console.log('[handleSubmit] Created updated requirement:', updatedRequirement);
      console.log('[handleSubmit] Calling onSave with updated requirement...');
      try {
        await onSave(updatedRequirement);
        console.log('[handleSubmit] Successfully saved requirement');
        onOpenChange(false);
      } catch (saveError) {
        console.error('[handleSubmit] Error in onSave callback:', saveError);
        throw saveError;
      }
    } catch (error) {
      console.error('[handleSubmit] Error in handleSubmit:', {
        error,
        message: error.message,
        stack: error.stack
      });
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save requirement', 
        variant: 'destructive' 
      });
    } finally {
      console.log('[handleSubmit] Form submission complete');
      setIsSubmitting(false);
    }
  }

  if (!requirement) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        <DialogHeader className="p-6 pb-4 border-b bg-white">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-xl">Requirement Configuration</DialogTitle>
              <DialogDescription>Setup how this document requirement behaves and pulls data.</DialogDescription>
            </div>
            <Badge variant="secondary" className="px-3 py-1 uppercase tracking-wider text-[10px]">
              {formData.category}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 bg-white border-b">
              <TabsList className="bg-transparent gap-6 h-12 p-0">
                <TabsTrigger value="general" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 border-primary rounded-none h-full px-0">General Settings</TabsTrigger>
                <TabsTrigger value="webdata" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 border-primary rounded-none h-full px-0">Web Data Mapping ({formData.webdata?.length || 0})</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="general" className="flex-1 overflow-y-auto p-6 m-0 space-y-6">
              {/* TOP SECTION: IDENTITY */}
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Requirement Display Name</Label>
                  <Input 
                    value={formData.name} 
                    onChange={e => updateField('name', e.target.value)} 
                    placeholder="e.g. Current Valid Passport"
                    className="h-10 text-base font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Required Count</Label>
                  <Input 
                    type="number" 
                    min="1" 
                    value={formData.requiredDocumentCount} 
                    onChange={e => updateField('requiredDocumentCount', parseInt(e.target.value))} 
                    className="h-10"
                  />
                </div>
              </div>

              {/* APPLICANT TYPES POPOVER */}
              <div className="space-y-2">
                  <Label className="flex justify-between items-center text-xs font-bold uppercase text-slate-500">
                    Target Applicants
                    <Button variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => updateField('applicantTypes', [])}>Reset Selection</Button>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-10 bg-white">
                        <div className="flex gap-1.5 flex-wrap">
                          {(formData.applicantTypes || []).length > 0 ? formData.applicantTypes.map(t => (
                            <Badge key={t} variant="secondary" className="capitalize text-[10px] px-2">{t}</Badge>
                          )) : <span className="text-slate-400 font-normal">Who needs to provide this?</span>}
                        </div>
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0" align="start">
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

              {/* EXECUTION & DOCUMENT LOGIC SECTION */}
              <Card className="p-0 overflow-hidden border-slate-200 shadow-sm">
                <div className="bg-slate-100/80 px-4 py-2 border-b flex items-center gap-2">
                   <Settings2 className="h-4 w-4 text-slate-600" />
                   <span className="text-xs font-bold uppercase text-slate-700">Document Logic & Mapping</span>
                </div>
                <div className="p-6 space-y-6 bg-white">
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-500">Linked KYC Definitions</Label>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {getSelectedDocumentNames().map((doc) => (
                          <Badge key={doc.id} variant="blue" className="pl-3 pr-1 py-1 flex items-center gap-2 text-xs border-blue-200 bg-blue-50 text-blue-700">
                            {doc.name}
                            <button onClick={() => removeKycDoc(doc.id)} className="hover:bg-blue-200 rounded-full p-0.5 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </Badge>
                        ))}
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
                          <span className="text-slate-400">Add document links...</span>
                          <Search className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search documents..." />
                          <CommandList>
                            <CommandGroup className="max-h-[300px] overflow-y-auto">
                              {kycDocuments.map(doc => (
                                <CommandItem key={doc.id} onSelect={() => toggleKycDoc(doc.id.toString())}>
                                  <Check className={cn("mr-2 h-4 w-4", (formData.kycDocumentIds || []).includes(doc.id.toString()) ? "opacity-100" : "opacity-0")} />
                                  {doc.display_name || doc.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500">Source Table</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
                          <span className="text-slate-400">
                            {formData.sourceTable ? tables.find(t => t.name === formData.sourceTable)?.label || formData.sourceTable : "Select source table..."}
                          </span>
                          <Search className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search tables..." />
                          <CommandList>
                            {loadingTables ? (
                              <div className="px-2 py-4 text-center text-sm text-slate-500">Loading tables...</div>
                            ) : tables.length > 0 ? (
                              <CommandGroup className="max-h-[300px] overflow-y-auto">
                                {tables.map(table => (
                                  <CommandItem key={table.name} onSelect={() => {
                                    updateField('sourceTable', table.name);
                                  }}>
                                    <Check className={cn("mr-2 h-4 w-4", formData.sourceTable === table.name ? "opacity-100" : "opacity-0")} />
                                    {table.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ) : (
                              <div className="px-2 py-4 text-center text-sm text-slate-500">No tables available</div>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {formData.sourceTable && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500">Linking Variable</Label>
                      <Select value={formData.linkingVariable || ''} onValueChange={(value) => updateField('linkingVariable', value || null)}>
                        <SelectTrigger className="bg-white h-9">
                          <SelectValue placeholder="Select linking variable..." />
                        </SelectTrigger>
                        <SelectContent>
                          {LINKING_VARIABLES.map(variable => (
                            <SelectItem key={variable.value} value={variable.value}>
                              {variable.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500">Extraction / Computed Function</Label>
                      <Select value={formData.computedFunction || 'none'} onValueChange={v => {
                        console.log('Computed function changed:', v); // Debug log
                        
                        // Combine all updates into a single call
                        const updates: any = { computedFunction: v };
                        
                        // Auto-derive execution mode from function (only if not None)
                        if (v === 'none') {
                          updates.executionMode = '';
                        } else if (v.includes('Latest')) {
                          updates.executionMode = 'latest';
                        } else {
                          updates.executionMode = 'all';
                        }
                        
                        // Apply all updates at once
                        Object.keys(updates).forEach(key => {
                          updateField(key, updates[key]);
                        });
                      }}>
                        <SelectTrigger className="bg-slate-50 border-slate-200 h-10">
                          <SelectValue placeholder="Select function..." />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPUTED_FUNCTIONS.map(fn => (
                            <SelectItem key={fn.value} value={fn.value} className="text-sm">
                              {fn.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </Card>

              {/* CRITERIA & TEMPLATES */}
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <Label className="flex items-center gap-2 text-primary font-bold uppercase text-xs tracking-wide">
                    <Users className="h-4 w-4" /> Applicant Criteria
                  </Label>
                  <div className="grid grid-cols-1 gap-4 p-4 bg-white border rounded-xl shadow-sm">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Nationality</Label>
                      <Select value={formData.nationality || 'any'} onValueChange={(v: NationalityType | 'any') => updateField('nationality', v === 'any' ? undefined : v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Any nationality..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any Nationality</SelectItem>
                          {NATIONALITY_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Age Range</Label>
                      <Select value={formData.ageRange || 'any'} onValueChange={(v: AgeRangeType | 'any') => updateField('ageRange', v === 'any' ? undefined : v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Any age..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any Age</SelectItem>
                          {AGE_RANGE_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                   <Label className="flex items-center gap-2 text-primary font-bold uppercase text-xs tracking-wide">
                    <Settings2 className="h-4 w-4" /> Workflow & Templates
                  </Label>
                  <div className="space-y-4 p-4 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Stage Document</Label>
                        <p className="text-[10px] text-slate-500">Block workflow until this is verified.</p>
                      </div>
                      <Switch checked={formData.isStageDocument || false} onCheckedChange={(v) => updateField('isStageDocument', v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">System Template</Label>
                        <p className="text-[10px] text-slate-500">Attach a fillable PDF/Word template.</p>
                      </div>
                      <Switch checked={formData.hasTemplate || false} onCheckedChange={(v) => updateField('hasTemplate', v)} />
                    </div>
                    {formData.hasTemplate && (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-orange-600" />
                          <Label className="text-sm font-medium text-orange-800">Available Templates</Label>
                          {loadingTemplates && <Loader2 className="h-4 w-4 animate-spin text-orange-600" />}
                        </div>
                        
                        {templates.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs text-slate-600">Templates for selected documents:</p>
                            <div className="grid gap-2">
                              {templates.map(template => (
                                <div key={template.id} className="flex items-center justify-between p-2 bg-orange-50 rounded border border-orange-200">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-orange-600" />
                                    <div>
                                      <p className="text-sm font-medium">{template.file_name}</p>
                                      <p className="text-xs text-slate-500">{template.file_type?.toUpperCase()}</p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={formData.selectedTemplateId === template.id ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      updateField('selectedTemplateId', template.id);
                                      updateField('selectedTemplate', template);
                                      toast({
                                        title: "Template Selected",
                                        description: `${template.file_name} has been selected`
                                      });
                                    }}
                                  >
                                    {formData.selectedTemplateId === template.id ? "Selected" : "Select"}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : !loadingTemplates ? (
                          <div className="text-center py-4">
                            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">No templates found</p>
                            <p className="text-xs text-slate-400">Templates will appear here once available for the selected documents</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AUTOMATION & INSTRUCTIONS */}
              <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-purple-600 font-bold uppercase text-xs tracking-wide">
                      <Zap className="h-4 w-4" /> Web Form Automation
                    </Label>
                    <Switch checked={formData.hasWebForm} onCheckedChange={v => updateField('hasWebForm', v)} />
                  </div>
                  {formData.hasWebForm && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-purple-50/50 border border-purple-100 rounded-xl animate-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-purple-700">Web Form Header</Label>
                        <Input value={formData.webFormName} onChange={e => updateField('webFormName', e.target.value)} className="bg-white border-purple-200" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-purple-700">Automation Logic</Label>
                        <Select value={formData.automationId} onValueChange={v => updateField('automationId', v)}>
                          <SelectTrigger className="bg-white border-purple-200"><SelectValue placeholder="Select logic..." /></SelectTrigger>
                          <SelectContent>
                            {automationTypes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Submission Instructions</Label>
                    <Textarea 
                      value={formData.instructions} 
                      onChange={e => updateField('instructions', e.target.value)} 
                      placeholder="Give users specific guidance on how to provide this document..." 
                      rows={3} 
                    />
                  </div>
              </div>
            </TabsContent>

            <TabsContent value="webdata" className="flex-1 overflow-y-auto m-0 p-6 bg-slate-50">
              {formData.webdata && formData.webdata.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Database className="h-4 w-4 text-blue-600" /> Configured Fields</h3>
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

        <DialogFooter className="p-4 border-t bg-white gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[140px]">
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}