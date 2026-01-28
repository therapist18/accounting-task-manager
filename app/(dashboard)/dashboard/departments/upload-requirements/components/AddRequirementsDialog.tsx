// @ts-nocheck
"use client"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Plus, Zap, Check, ChevronsUpDown, Trash2, FileType, Loader2, Database, Globe } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandEmpty } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { 
  NATIONALITY_TYPES, 
  QUALIFICATION_TYPES, 
  AGE_RANGE_TYPES, 
  DEPENDANT_RELATIONSHIPS,
  type NationalityType,
  type QualificationType,
  type AgeRangeType
} from "@/lib/constants/entity-types"

export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee' | 'understudy';
export type RequirementCategory = 'general' | 'processing' | 'issuance' | 'job-specific';
export type SubmissionMode = 'standard' | 'template' | 'webform';
export type QuestionType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';

export interface RequirementForm {
  name: string
  description: string
  type: 'standard' | 'conditional' | 'optional' | 'company' | 'multi-document'
  isRequired: boolean
  isVisible: boolean
  kycDocumentIds: string[]
  applicantTypes: ApplicantType[]
  requiredDocumentCount: number
  instructions: string
  category: RequirementCategory
  isStageDocument: boolean
  hasTemplate: boolean
  // Automation fields
  hasWebForm?: boolean
  automationId?: string
  // New fields for questions
  inputType?: QuestionType
  linkedMasterFieldId?: string
  options?: string[] 
  defaultValue?: string // Added default value field
  // Additional requirement fields
  nationality?: NationalityType
  ageRange?: AgeRangeType
  dependantRelationships?: string[]
}

const DEFAULT_REQUIREMENT = (category: RequirementCategory): RequirementForm => ({
  name: '',
  description: '',
  type: 'standard',
  isRequired: true,
  isVisible: true,
  kycDocumentIds: [],
  applicantTypes: ['principal'],
  requiredDocumentCount: 1,
  instructions: '',
  category: category,
  isStageDocument: false,
  hasTemplate: false,
  hasWebForm: false,
  inputType: 'text',
  defaultValue: '',
  nationality: undefined,
  ageRange: undefined,
  dependantRelationships: []
})

interface AddRequirementsDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: any) => Promise<void>
  isSubmitting: boolean
  context: {
    type: 'subdepartment' | 'class' | 'subclass'
    departmentId: number
    subdepartmentId: number
    subdepartmentName: string
    classId?: string | number
    className?: string
    subclassId?: string | number
    subclassName?: string
  } | null
}

const APPLICANT_OPTIONS = [
  { label: 'Company', value: 'company' },
  { label: 'Principal', value: 'principal' },
  { label: 'Director', value: 'director' },
  { label: 'Shareholder', value: 'shareholder' },
  { label: 'Dependent', value: 'dependent' },
  { label: 'Employee', value: 'employee' },
  { label: 'Understudy', value: 'understudy' },
]

interface GeneralDocConfig {
  kycId: string;
  name: string;
  mode: SubmissionMode;
  automationId?: string;
  hasTemplate: boolean;
  isStageDocument: boolean;
}

export function AddRequirementsDialog({ isOpen, onOpenChange, onSubmit, isSubmitting, context }: AddRequirementsDialogProps) {
  const [activeSection, setActiveSection] = useState<RequirementCategory>('processing')
  
  // Persistent States for each section
  const [processingReqs, setProcessingReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('processing')])
  const [issuanceReqs, setIssuanceReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('issuance')])
  const [jobSpecificReqs, setJobSpecificReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('job-specific')])
  const [selectedGeneralConfigs, setSelectedGeneralConfigs] = useState<Record<string, GeneralDocConfig>>({})
  
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [automationTypes, setAutomationTypes] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<any[]>([])

  useEffect(() => {
    if (isOpen) {
      fetchInitialData()
    }
  }, [isOpen])

  useEffect(() => {
    if (context?.departmentId !== 1 && (activeSection === 'processing' || activeSection === 'issuance')) {
      setActiveSection('general');
    }
  }, [context?.departmentId, activeSection])

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      const [kycRes, deptRes, autoRes, mfRes] = await Promise.all([
        supabase.from('acc_portal_kyc').select('*').order('name'),
        supabase.from('tm_departments').select('*'),
        supabase.from('tm_automations').select('*').eq('is_active', true).order('name'),
        supabase.from('tm_job_fields').select('id, field_key, label, type, options').order('label')
      ])
      setKycDocuments(kycRes.data || [])
      setAutomationTypes(autoRes.data || [])
      setMasterFields(mfRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const handleToggleGeneralDoc = (doc: any) => {
    const kycId = String(doc.id);
    if (selectedGeneralConfigs[kycId]) {
      const newConfigs = { ...selectedGeneralConfigs };
      delete newConfigs[kycId];
      setSelectedGeneralConfigs(newConfigs);
    } else {
      let mode: SubmissionMode = doc.has_template ? 'template' : 'standard';
      setSelectedGeneralConfigs(prev => ({
        ...prev,
        [kycId]: {
          kycId,
          name: doc.display_name || doc.name,
          mode,
          hasTemplate: !!doc.has_template,
          isStageDocument: false 
        }
      }));
    }
  }

  const handleSubmit = async () => {
    if (!context) return;

    let validItems = [];
    if (activeSection === 'general') {
        validItems = Object.keys(selectedGeneralConfigs).map(kycId => {
            const doc = kycDocuments.find(d => String(d.id) === String(kycId))
            const config = selectedGeneralConfigs[kycId]
            return {
                ...DEFAULT_REQUIREMENT('general'),
                name: doc?.display_name || doc?.name || 'Requirement',
                kycDocumentIds: [String(kycId)],
                category: 'general',
                isStageDocument: config?.isStageDocument || false
            }
        })
    } else {
        const source = activeSection === 'processing' ? processingReqs : activeSection === 'issuance' ? issuanceReqs : jobSpecificReqs;
        validItems = source.filter(req => req.name.trim() !== '')
    }

    if (validItems.length === 0) return;

    try {
        const jobLevelObj = {
            department_id: Number(context.departmentId),
            subdepartment_id: Number(context.subdepartmentId),
            class_id: context.classId ? Number(context.classId) : null,
            subclass_id: context.subclassId ? Number(context.subclassId) : null,
            level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4
        }

        const { data: existingRecord } = await supabase
            .from('tm_class_requirements')
            .select('*')
            .eq('job_level', JSON.stringify(jobLevelObj))
            .maybeSingle();

        let payload: any = {
            job_level: jobLevelObj,
            type: context.type,
            updated_at: new Date().toISOString(),
            id: existingRecord?.id
        };

        if (activeSection === 'job-specific') {
            const existingQuestions = existingRecord?.job_specific_questions || [];
            const processedQuestions = validItems.map((req, index) => ({
                id: (Date.now() + index).toString(),
                label: req.name.trim(),
                type: req.inputType || 'text',
                required: req.isRequired,
                default_value: req.defaultValue || '', // Save default value
                options: req.options || [],
                linked_field_id: req.linkedMasterFieldId || null,
                applicant_types: req.applicantTypes,
                order: existingQuestions.length + index
            }));
            payload.job_specific_questions = [...existingQuestions, ...processedQuestions];
        } else {
            const existingReqs = existingRecord?.requirements || [];
            const processedReqs = validItems.map((req, index) => {
                let web_automation = null
                if (req.hasWebForm && req.automationId) {
                  const auto = automationTypes.find(a => String(a.id) === String(req.automationId))
                  web_automation = {
                    automationId: req.automationId,
                    automationName: auto?.name,
                    webhookUrl: auto?.webhook_url
                  }
                }
                
                return {
                    id: (Date.now() + index).toString(),
                    name: req.name.trim(),
                    description: req.description || '',
                    type: 'document', // Always submit as 'document' type
                    nationality: req.nationality,
                    ageRange: req.ageRange,
                    dependantRelationships: req.dependantRelationships,
                    is_mandatory: req.isRequired,
                    isVisible: req.isVisible,
                    applicantTypes: req.applicantTypes,
                    instructions: req.instructions || '',
                    requiredDocumentCount: req.requiredDocumentCount,
                    kyc_document_ids: req.kycDocumentIds,
                    category: activeSection,
                    isStageDocument: req.isStageDocument || false,
                    hasTemplate: req.hasTemplate || false,
                    web_automation,
                    linked_master_field_id: req.linkedMasterFieldId,
                    order: existingReqs.length + index
                }
            });
            payload.requirements = [...existingReqs, ...processedReqs];
        }

        await onSubmit(payload);
        toast({ title: "Success", description: "Updated successfully." });
        handleClose();
    } catch (error) {
        console.error(error);
        toast({ title: 'Error', description: 'Failed to save data', variant: 'destructive' });
    }
  }

  const handleClose = () => {
    // Completely reset all states on close
    onOpenChange(false)
    setProcessingReqs([DEFAULT_REQUIREMENT('processing')])
    setIssuanceReqs([DEFAULT_REQUIREMENT('issuance')])
    setJobSpecificReqs([DEFAULT_REQUIREMENT('job-specific')])
    setSelectedGeneralConfigs({})
    setBulkInput('')
    setActiveSection('processing')
  }

  const updateCurrentReq = (idx: number, fields: Partial<RequirementForm>) => {
    if (activeSection === 'processing') {
        const updated = [...processingReqs];
        updated[idx] = { ...updated[idx], ...fields };
        setProcessingReqs(updated);
    } else if (activeSection === 'issuance') {
        const updated = [...issuanceReqs];
        updated[idx] = { ...updated[idx], ...fields };
        setIssuanceReqs(updated);
    } else if (activeSection === 'job-specific') {
        const updated = [...jobSpecificReqs];
        updated[idx] = { ...updated[idx], ...fields };
        setJobSpecificReqs(updated);
    }
  }

  const currentReqs = activeSection === 'processing' ? processingReqs : activeSection === 'issuance' ? issuanceReqs : jobSpecificReqs;
  const companyDocs = useMemo(() => kycDocuments.filter(d => d.category === 'company-docs'), [kycDocuments])
  const individualDocs = useMemo(() => kycDocuments.filter(d => d.category === 'application-docs' || d.category === 'directors-docs'), [kycDocuments])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open ? handleClose() : onOpenChange(true)}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Add {activeSection === 'job-specific' ? 'Job Questions' : 'Requirements'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex flex-col px-6 space-y-4">
          <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
            {['general', 'processing', 'issuance', 'job-specific'].filter(sec => context?.departmentId === 1 || sec === 'general' || sec === 'job-specific').map((sec) => (
                <Button 
                  key={sec}
                  variant={activeSection === sec ? 'default' : 'ghost'} 
                  className="flex-1 h-8 text-xs capitalize"
                  onClick={() => setActiveSection(sec as RequirementCategory)}
                >
                  {sec.replace('-', ' ')}
                </Button>
            ))}
          </div>

          {activeSection === 'general' ? (
            <div className="flex gap-6 h-full overflow-hidden pb-6">
              {/* Left Selection Area */}
              <div className="w-1/2 flex flex-col border rounded-xl overflow-hidden bg-white">
                <div className="p-3 border-b bg-slate-50 font-semibold text-sm">Select Documents</div>
                <Tabs defaultValue="company" className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="mx-3 mt-3"><TabsTrigger value="company" className="flex-1 text-xs">Company</TabsTrigger><TabsTrigger value="individual" className="flex-1 text-xs">Individual</TabsTrigger></TabsList>
                  <ScrollArea className="flex-1 p-3">
                    <TabsContent value="company" className="mt-0 space-y-1">
                      {companyDocs.map(doc => (
                        <div key={doc.id} className={cn("flex items-center gap-3 p-2 rounded-md border", selectedGeneralConfigs[doc.id] && "bg-blue-50 border-blue-200")}>
                          <Checkbox checked={!!selectedGeneralConfigs[doc.id]} onCheckedChange={() => handleToggleGeneralDoc(doc)} />
                          <Label className="text-xs flex-1 cursor-pointer">{doc.display_name || doc.name}</Label>
                        </div>
                      ))}
                    </TabsContent>
                    <TabsContent value="individual" className="mt-0 space-y-1">
                      {individualDocs.map(doc => (
                        <div key={doc.id} className={cn("flex items-center gap-3 p-2 rounded-md border", selectedGeneralConfigs[doc.id] && "bg-blue-50 border-blue-200")}>
                          <Checkbox checked={!!selectedGeneralConfigs[doc.id]} onCheckedChange={() => handleToggleGeneralDoc(doc)} />
                          <Label className="text-xs flex-1 cursor-pointer">{doc.display_name || doc.name}</Label>
                        </div>
                      ))}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </div>

              {/* Right Configuration Area */}
              <div className="w-1/2 flex flex-col border rounded-xl overflow-hidden bg-white">
                <div className="p-3 border-b bg-slate-50 font-semibold text-sm flex justify-between">
                  <span>Configure Selection</span>
                  <Badge variant="secondary">{Object.keys(selectedGeneralConfigs).length} items</Badge>
                </div>
                <ScrollArea className="flex-1 p-4 bg-slate-50/30">
                   {Object.values(selectedGeneralConfigs).map(config => (
                     <div key={config.kycId} className="bg-white border rounded-lg p-3 shadow-sm space-y-3 mb-3">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold text-slate-700">{config.name}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleGeneralDoc({id: config.kycId})}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                        <RadioGroup value={config.mode} onValueChange={(v) => setSelectedGeneralConfigs(prev => ({ ...prev, [config.kycId]: { ...prev[config.kycId], mode: v as SubmissionMode }}))} className="grid grid-cols-3 gap-2">
                           {['standard', 'template', 'webform'].map(m => (
                             <div key={m}>
                               <RadioGroupItem value={m} id={`${m}-${config.kycId}`} className="sr-only" />
                               <Label htmlFor={`${m}-${config.kycId}`} className={cn("flex flex-col items-center justify-between rounded-md border-2 p-2 cursor-pointer", config.mode === m ? "border-blue-600 bg-blue-50" : "border-muted")}>
                                 {m === 'standard' ? <FileText className="h-4 w-4" /> : m === 'template' ? <FileType className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                                 <span className="text-[10px] capitalize">{m}</span>
                               </Label>
                             </div>
                           ))}
                        </RadioGroup>
                        <div className="flex items-center space-x-2 pt-2 border-t">
                          <Checkbox id={`stage-${config.kycId}`} checked={config.isStageDocument} onCheckedChange={(c) => setSelectedGeneralConfigs(prev => ({ ...prev, [config.kycId]: { ...prev[config.kycId], isStageDocument: !!c }}))} />
                          <Label htmlFor={`stage-${config.kycId}`} className="text-xs">Mark as Stage Document</Label>
                        </div>
                     </div>
                   ))}
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {activeSection !== 'job-specific' && (
                <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Bulk Add (One per line)</Label>
                    <Textarea
                        value={bulkInput}
                        onChange={(e) => {
                            setBulkInput(e.target.value)
                            const lines = e.target.value.split('\n').filter(l => l.trim())
                            if (lines.length > 0) {
                                const newBatch = lines.map(l => ({ ...DEFAULT_REQUIREMENT(activeSection), name: l.trim() }))
                                if (activeSection === 'processing') setProcessingReqs(newBatch)
                                else setIssuanceReqs(newBatch)
                            }
                        }}
                        placeholder="Requirement A&#10;Requirement B"
                        className="min-h-[80px] bg-slate-50/50"
                    />
                </div>
              )}

              {currentReqs.map((req, idx) => (
                <div key={idx} className="group relative border p-5 rounded-xl bg-card hover:shadow-md transition-all space-y-4">
                  <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" onClick={() => {
                      const updated = currentReqs.filter((_, i) => i !== idx);
                      if (activeSection === 'processing') setProcessingReqs(updated);
                      else if (activeSection === 'issuance') setIssuanceReqs(updated);
                      else setJobSpecificReqs(updated);
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>{activeSection === 'job-specific' ? 'Question Label' : 'Requirement Name'}</Label>
                      <Input value={req.name} onChange={e => updateCurrentReq(idx, { name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Applies To</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between bg-white text-xs">
                            <div className="flex gap-1 truncate">
                              {req.applicantTypes.length > 0 ? req.applicantTypes.map(t => <Badge key={t} variant="secondary" className="capitalize text-[9px]">{t}</Badge>) : "Select..."}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0">
                          <Command><CommandInput placeholder="Search..." /><CommandList><CommandGroup>
                            {APPLICANT_OPTIONS.map((opt) => (
                              <CommandItem key={opt.value} onSelect={() => {
                                const current = req.applicantTypes;
                                const updated = current.includes(opt.value as ApplicantType) ? current.filter(t => t !== opt.value) : [...current, opt.value as ApplicantType];
                                updateCurrentReq(idx, { applicantTypes: updated });
                              }}>
                                <Check className={cn("mr-2 h-4 w-4", req.applicantTypes.includes(opt.value as ApplicantType) ? "opacity-100" : "opacity-0")} />
                                {opt.label}
                              </CommandItem>
                            ))}</CommandGroup></CommandList></Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {activeSection === 'job-specific' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t pt-4 bg-slate-50/50 -mx-5 px-5 pb-2">
                        <div className="space-y-2">
                            <Label className="text-xs text-blue-600 font-semibold">Answer Type</Label>
                            <Select value={req.inputType} onValueChange={(v: QuestionType) => updateCurrentReq(idx, { inputType: v })}>
                                <SelectTrigger className="bg-white h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text Input</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date Picker</SelectItem>
                                    <SelectItem value="select">Dropdown (Single)</SelectItem>
                                    <SelectItem value="multiselect">Dropdown (Multi)</SelectItem>
                                    <SelectItem value="boolean">Yes/No</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {/* DEFAULT VALUE FIELD */}
                        <div className="space-y-2">
                            <Label className="text-xs text-blue-600 font-semibold">Default Value</Label>
                            <Input 
                                value={req.defaultValue} 
                                onChange={e => updateCurrentReq(idx, { defaultValue: e.target.value })} 
                                placeholder="Static default value..."
                                className="bg-white h-9"
                            />
                        </div>

                        {(req.inputType === 'select' || req.inputType === 'multiselect') && (
                            <div className="space-y-2">
                                <div className="space-y-2">
                                    <Label className="text-xs text-blue-600 font-semibold flex items-center gap-2">
                                        <Database className="h-3 w-3" /> Master Field
                                    </Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" className="w-full justify-between h-9 bg-white">
                                                {req.linkedMasterFieldId ? masterFields.find(mf => String(mf.id) === String(req.linkedMasterFieldId))?.label : "Select master field..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search..." />
                                                <CommandList>
                                                    <CommandEmpty>No fields.</CommandEmpty>
                                                    <CommandGroup>
                                                        <CommandItem onSelect={() => updateCurrentReq(idx, { linkedMasterFieldId: undefined, options: [] })}>-- None --</CommandItem>
                                                        {masterFields.map(mf => (
                                                            <CommandItem key={mf.id} onSelect={() => updateCurrentReq(idx, { linkedMasterFieldId: String(mf.id), options: mf.options || [] })}>
                                                                {mf.label}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                
                                {!req.linkedMasterFieldId && (
                                    <div className="space-y-2">
                                        <Label className="text-xs text-blue-600 font-semibold">Custom Options</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                type="text"
                                                placeholder="Add an option..."
                                                value={req.newOption || ''}
                                                onChange={(e) => updateCurrentReq(idx, { newOption: e.target.value })}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && req.newOption?.trim()) {
                                                        e.preventDefault();
                                                        const newOptions = [...(req.options || []), req.newOption.trim()];
                                                        updateCurrentReq(idx, { 
                                                            options: newOptions,
                                                            newOption: ''
                                                        });
                                                    }
                                                }}
                                                className="flex-1 h-9"
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => {
                                                    if (req.newOption?.trim()) {
                                                        const newOptions = [...(req.options || []), req.newOption.trim()];
                                                        updateCurrentReq(idx, { 
                                                            options: newOptions,
                                                            newOption: ''
                                                        });
                                                    }
                                                }}
                                                disabled={!req.newOption?.trim()}
                                                className="h-9"
                                            >
                                                Add
                                            </Button>
                                        </div>
                                        
                                        {(req.options?.length || 0) > 0 && (
                                            <div className="mt-2 space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    {req.options?.map((option, i) => (
                                                        <Badge key={i} variant="secondary" className="flex items-center gap-1">
                                                            {option}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newOptions = [...(req.options || [])];
                                                                    newOptions.splice(i, 1);
                                                                    updateCurrentReq(idx, { options: newOptions });
                                                                }}
                                                                className="ml-1 rounded-full hover:bg-gray-300 p-0.5"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                </svg>
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {req.options?.length} option{req.options?.length !== 1 ? 's' : ''} added
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                  ) : (
                    <div className="space-y-4 border-t pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Requirement Type</Label>
                                <Select value={req.type} onValueChange={(v: any) => updateCurrentReq(idx, { type: v })}>
                                    <SelectTrigger className="bg-white h-8"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="multi-document">Multi-Doc</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Doc Mapping</Label>
                                <Popover>
                                    <PopoverTrigger asChild><Button variant="outline" className="w-full justify-between h-8 text-xs bg-white">{req.kycDocumentIds.length > 0 ? `${req.kycDocumentIds.length} Linked` : "Link Doc"}</Button></PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0"><Command><CommandInput placeholder="Search..." /><CommandList className="max-h-[200px]">{kycDocuments.map(doc => (
                                        <CommandItem key={doc.id} onSelect={() => {
                                            const current = req.kycDocumentIds;
                                            const updated = current.includes(String(doc.id)) ? current.filter(id => id !== String(doc.id)) : [...current, String(doc.id)];
                                            updateCurrentReq(idx, { kycDocumentIds: updated });
                                        }}><Check className={cn("mr-2 h-3 w-3", req.kycDocumentIds.includes(String(doc.id)) ? "opacity-100" : "opacity-0")} />{doc.display_name || doc.name}</CommandItem>
                                    ))}</CommandList></Command></PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Master Field</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between h-8 text-xs bg-white"
                                        >
                                            {req.linkedMasterFieldId 
                                                ? masterFields.find(mf => String(mf.id) === String(req.linkedMasterFieldId))?.label || "Selected Field"
                                                : "Link Master Field..."
                                            }
                                            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search master fields..." />
                                            <CommandList className="max-h-[200px]">
                                                <CommandEmpty>No master field found.</CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        value="none"
                                                        onSelect={() => updateCurrentReq(idx, { linkedMasterFieldId: null })}
                                                    >
                                                        <Check className={cn("mr-2 h-3 w-3", !req.linkedMasterFieldId ? "opacity-100" : "opacity-0")} />
                                                        -- None --
                                                    </CommandItem>
                                                    {masterFields.map((mf) => (
                                                        <CommandItem
                                                            key={mf.id}
                                                            value={mf.label}
                                                            onSelect={() => updateCurrentReq(idx, { linkedMasterFieldId: String(mf.id) })}
                                                        >
                                                            <Check className={cn("mr-2 h-3 w-3", String(req.linkedMasterFieldId) === String(mf.id) ? "opacity-100" : "opacity-0")} />
                                                            {mf.label}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-dashed">
                           <div className="flex items-center space-x-2">
                              <Checkbox id={`webform-${idx}`} checked={req.hasWebForm} onCheckedChange={(c) => updateCurrentReq(idx, { hasWebForm: !!c })} />
                              <Label htmlFor={`webform-${idx}`} className="text-xs font-semibold flex items-center gap-1"><Zap className="h-3 w-3 text-purple-600" /> Link to Web Form Automation</Label>
                           </div>
                           {req.hasWebForm && (
                             <Select value={req.automationId} onValueChange={(v) => updateCurrentReq(idx, { automationId: v })}>
                                <SelectTrigger className="bg-white h-8 text-xs"><SelectValue placeholder="Select Automation..." /></SelectTrigger>
                                <SelectContent>
                                   {automationTypes.map(auto => (
                                     <SelectItem key={auto.id} value={String(auto.id)}>{auto.name}</SelectItem>
                                   ))}
                                </SelectContent>
                             </Select>
                           )}
                        </div>

                        <div className="flex items-center space-x-6">
                            <div className="flex items-center space-x-2">
                                <Checkbox id={`stage-req-${idx}`} checked={req.isStageDocument} onCheckedChange={(c) => updateCurrentReq(idx, { isStageDocument: !!c })} />
                                <Label htmlFor={`stage-req-${idx}`} className="text-xs">Stage Doc</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id={`template-req-${idx}`} checked={req.hasTemplate} onCheckedChange={(c) => updateCurrentReq(idx, { hasTemplate: !!c })} />
                                <Label htmlFor={`template-req-${idx}`} className="text-xs text-orange-600 font-bold">Has Template</Label>
                            </div>
                        </div>

                        {/* Additional Requirement Fields */}
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Nationality</Label>
                                <Select value={req.nationality || 'any'} onValueChange={(v: NationalityType | 'any') => updateCurrentReq(idx, { nationality: v === 'any' ? undefined : v })}>
                                    <SelectTrigger className="bg-white h-8 text-xs"><SelectValue placeholder="Any nationality..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="any">Any Nationality</SelectItem>
                                        {NATIONALITY_TYPES.map(type => (
                                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Age Range</Label>
                                <Select value={req.ageRange || 'any'} onValueChange={(v: AgeRangeType | 'any') => updateCurrentReq(idx, { ageRange: v === 'any' ? undefined : v })}>
                                    <SelectTrigger className="bg-white h-8 text-xs"><SelectValue placeholder="Any age..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="any">Any Age</SelectItem>
                                        {AGE_RANGE_TYPES.map(type => (
                                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            {req.applicantTypes.includes('dependent') && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Dependant Relationship</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between bg-white h-8 text-xs">
                                                <div className="flex gap-1 flex-wrap">
                                                    {req.dependantRelationships?.length > 0 
                                                        ? req.dependantRelationships?.map(r => (
                                                            <Badge key={r} variant="secondary" className="text-[10px]">{DEPENDANT_RELATIONSHIPS.find(dr => dr.value === r)?.label || r}</Badge>
                                                        )) 
                                                        : <span className="text-muted-foreground">Select relationships...</span>}
                                                </div>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search relationships..." />
                                                <CommandList>
                                                    <CommandGroup>
                                                        {DEPENDANT_RELATIONSHIPS.map((rel) => (
                                                            <CommandItem
                                                                key={rel.value}
                                                                onSelect={() => {
                                                                    const current = req.dependantRelationships || []
                                                                    const updated = current.includes(rel.value) 
                                                                        ? current.filter(r => r !== rel.value) 
                                                                        : [...current, rel.value]
                                                                    updateCurrentReq(idx, { dependantRelationships: updated })
                                                                }}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", (req.dependantRelationships || []).includes(rel.value) ? "opacity-100" : "opacity-0")} />
                                                                {rel.label}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}
                        </div>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" className="w-full border-dashed py-6" onClick={() => {
                  const newItem = DEFAULT_REQUIREMENT(activeSection);
                  if (activeSection === 'processing') setProcessingReqs([...processingReqs, newItem]);
                  else if (activeSection === 'issuance') setIssuanceReqs([...issuanceReqs, newItem]);
                  else setJobSpecificReqs([...jobSpecificReqs, newItem]);
              }}><Plus className="mr-2 h-4 w-4"/> Add Item</Button>
            </div>
          )}
        </div>
        
        <DialogFooter className="p-6 bg-slate-50 border-t">
           <Button variant="outline" onClick={handleClose}>Cancel</Button>
           <Button onClick={handleSubmit} disabled={isSubmitting}>Save {activeSection.replace('-', ' ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}