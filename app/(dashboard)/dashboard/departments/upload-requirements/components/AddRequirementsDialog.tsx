// @ts-nocheck
"use client"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Plus, Zap, Check, ChevronsUpDown, Search, Trash2, Eraser, Building2, User, Layout, FileType } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"


export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee' | 'understudy';
export type RequirementCategory = 'general' | 'processing' | 'issuance';
export type SubmissionMode = 'standard' | 'template' | 'webform';

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
  category: RequirementCategory // Added category
  isStageDocument: boolean // Added stage document flag
}

const DEFAULT_REQUIREMENT: RequirementForm = {
  name: '',
  description: '',
  type: 'standard',
  isRequired: true,
  isVisible: true,
  kycDocumentIds: [],
  applicantTypes: ['principal'],
  requiredDocumentCount: 1,
  instructions: '',
  category: 'processing',
  isStageDocument: false // Added stage document default
}

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
  isStageDocument: boolean; // Added stage document flag
}

export function AddRequirementsDialog({ isOpen, onOpenChange, onSubmit, isSubmitting, context }: AddRequirementsDialogProps) {
  const [activeSection, setActiveSection] = useState<RequirementCategory>('processing')
  const [newRequirements, setNewRequirements] = useState<RequirementForm[]>([{ ...DEFAULT_REQUIREMENT }])
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
    const [bulkInput, setBulkInput] = useState('')
  const [selectedGeneralConfigs, setSelectedGeneralConfigs] = useState<Record<string, GeneralDocConfig>>({})

  useEffect(() => {
    if (isOpen) {
      fetchInitialData()
      setSelectedGeneralConfigs({})
    }
  }, [isOpen])

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      const [kycRes, deptRes] = await Promise.all([
        supabase.from('acc_portal_kyc').select('*').order('name'),
        supabase.from('tm_departments').select('*')
      ])
      setKycDocuments(kycRes.data || [])
      setDepartments(deptRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  // Helper to find automation in the department stages JSON
  const findAutomation = (kycId: string) => {
    if (!context || !departments.length) return null;
    const dept = departments.find(d => Number(d.id) === Number(context.departmentId));
    if (!dept?.stages) return null;

    for (const stage of dept.stages) {
      if (!stage.documents) continue;
      for (const doc of stage.documents) {
        if (doc.kycId === kycId && doc.hasAutomation && doc.targetEntities) {
          // Match against current job level
          const match = doc.targetEntities.find(entity => 
            Number(entity.job_level?.department_id) === Number(context.departmentId) &&
            Number(entity.job_level?.subdepartment_id) === Number(context.subdepartmentId) &&
            String(entity.job_level?.class_id) === String(context.classId || 'null')
          );
          if (match) return { automationId: match.automationId, name: doc.name };
        }
      }
    }
    return null;
  }

  const handleToggleGeneralDoc = (doc: any) => {
    const kycId = String(doc.id);
    if (selectedGeneralConfigs[kycId]) {
      const newConfigs = { ...selectedGeneralConfigs };
      delete newConfigs[kycId];
      setSelectedGeneralConfigs(newConfigs);
    } else {
      // Auto-detect Mode
      const automation = findAutomation(kycId);
      let mode: SubmissionMode = 'standard';
      
      if (doc.has_template) mode = 'template';
      else if (automation) mode = 'webform';

      setSelectedGeneralConfigs(prev => ({
        ...prev,
        [kycId]: {
          kycId,
          name: doc.display_name || doc.name,
          mode,
          hasTemplate: !!doc.has_template,
          automationId: automation?.automationId,
          isStageDocument: false // Default to false for new selections
        }
      }));
    }
  }

  const updateGeneralMode = (kycId: string, mode: SubmissionMode) => {
    setSelectedGeneralConfigs(prev => ({
      ...prev,
      [kycId]: { ...prev[kycId], mode }
    }));
  }

  const toggleStageDocument = (kycId: string) => {
    setSelectedGeneralConfigs(prev => ({
      ...prev,
      [kycId]: { ...prev[kycId], isStageDocument: !prev[kycId]?.isStageDocument }
    }));
  }

  const handleSubmit = async () => {
    let validReqs = []

    if (activeSection === 'general') {
      // Convert selected KYC docs into requirement objects
      validReqs = Object.keys(selectedGeneralConfigs).map(kycId => {
        const doc = kycDocuments.find(d => String(d.id) === String(kycId))
        const config = selectedGeneralConfigs[kycId]
        return {
          ...DEFAULT_REQUIREMENT,
          name: doc?.display_name || doc?.name || 'Requirement',
          kycDocumentIds: [String(kycId)],
          category: 'general',
          isStageDocument: config?.isStageDocument || false
        }
      })
    } else {
      validReqs = newRequirements.filter(req => req.name.trim() !== '')
    }

    if (validReqs.length === 0 || !context) return

    try {
      const jobLevelObj = {
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId),
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4
      }

      const jobLevelString = JSON.stringify(jobLevelObj)
      const { data: existingRecord } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', jobLevelString)
        .maybeSingle();
      
      const startIdCount = existingRecord?.requirements?.length || 0;
      
      const processedNewReqs = validReqs.map((req, index) => ({
        id: (Date.now() + index).toString(),
        name: req.name.trim(),
        description: req.description || '',
        type: req.type,
        isRequired: req.isRequired,
        is_mandatory: req.isRequired,
        isVisible: req.isVisible,
        applicantTypes: req.applicantTypes,
        instructions: req.instructions || '',
        requiredDocumentCount: req.requiredDocumentCount,
        kyc_document_ids: req.kycDocumentIds,
        category: 'processing', // Force to 'processing' for Upload Processing Requirements section
        isStageDocument: req.isStageDocument || false, // Added stage document flag
        order: startIdCount + index
        // Explicitly exclude old fields: kyc_document_id, applicantType
      }));

      const finalRequirements = existingRecord 
        ? [...existingRecord.requirements.map(req => {
            // Clean up existing requirements by removing old fields
            const { kyc_document_id, applicantType, ...cleanReq } = req;
            return cleanReq;
          }), ...processedNewReqs]
        : processedNewReqs;

      const payload = {
        requirements: finalRequirements,
        job_level: jobLevelObj,
        type: context.type,
        updated_at: new Date().toISOString(),
        ...(existingRecord && { id: existingRecord.id })
      };

      await onSubmit(payload);
      toast({ title: "Success", description: "Requirements updated." });
      handleClose();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to save requirements', variant: 'destructive' });
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setNewRequirements([{ ...DEFAULT_REQUIREMENT }])
    setSelectedGeneralConfigs({})
    setBulkInput('')
  }
  // Grouped KYC Docs
  const companyDocs = useMemo(() => kycDocuments.filter(d => d.category === 'company-docs'), [kycDocuments])
  const individualDocs = useMemo(() => kycDocuments.filter(d => d.category === 'application-docs' || d.category === 'directors-docs'), [kycDocuments])

    const updateReq = (idx: number, fields: Partial<RequirementForm>) => {
    const updated = [...newRequirements]
    updated[idx] = { ...updated[idx], ...fields }
    setNewRequirements(updated)
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Add Requirements</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-6 space-y-4">
          {/* Section Switcher */}
          <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
            {['general', 'processing', 'issuance'].map((sec) => (
              <Button 
                key={sec}
                variant={activeSection === sec ? 'default' : 'ghost'} 
                className="flex-1 h-8 text-xs capitalize"
                onClick={() => setActiveSection(sec as RequirementCategory)}
              >
                {sec}
              </Button>
            ))}
          </div>

          {activeSection === 'general' ? (
            <div className="flex gap-6 h-full overflow-hidden pb-6">
              {/* Left: Selection Area */}
              <div className="w-1/2 flex flex-col border rounded-xl overflow-hidden bg-white">
                <div className="p-3 border-b bg-slate-50 font-semibold text-sm">Select Documents</div>
                <Tabs defaultValue="company" className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="mx-3 mt-3">
                    <TabsTrigger value="company" className="flex-1 text-xs">Company Docs</TabsTrigger>
                    <TabsTrigger value="individual" className="flex-1 text-xs">Individual Docs</TabsTrigger>
                  </TabsList>
                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-2">
                      {(activeSection === 'general' ? (activeSection === 'general' ? (companyDocs.concat(individualDocs)) : []) : []).map(doc => {
                         // Logic check: if doc is in companyDocs or individualDocs based on tab
                         return null; // Placeholder for logic inside TabsContent below
                      })}
                      
                      <TabsContent value="company" className="mt-0 space-y-1">
                        {companyDocs.map(doc => (
                          <div key={doc.id} className={cn("flex items-center gap-3 p-2 rounded-md border transition-all", selectedGeneralConfigs[doc.id] ? "bg-blue-50 border-blue-200" : "hover:bg-slate-50")}>
                            <Checkbox checked={!!selectedGeneralConfigs[doc.id]} onCheckedChange={() => handleToggleGeneralDoc(doc)} id={doc.id}/>
                            <label htmlFor={doc.id} className="text-xs font-medium flex-1 cursor-pointer">{doc.display_name || doc.name}</label>
                            {doc.has_template && <FileType className="h-3 w-3 text-orange-500" title="Has Template" />}
                          </div>
                        ))}
                      </TabsContent>
                      <TabsContent value="individual" className="mt-0 space-y-1">
                        {individualDocs.map(doc => (
                          <div key={doc.id} className={cn("flex items-center gap-3 p-2 rounded-md border transition-all", selectedGeneralConfigs[doc.id] ? "bg-blue-50 border-blue-200" : "hover:bg-slate-50")}>
                            <Checkbox checked={!!selectedGeneralConfigs[doc.id]} onCheckedChange={() => handleToggleGeneralDoc(doc)} id={doc.id}/>
                            <label htmlFor={doc.id} className="text-xs font-medium flex-1 cursor-pointer">{doc.display_name || doc.name}</label>
                            {doc.has_template && <FileType className="h-3 w-3 text-orange-500" title="Has Template" />}
                          </div>
                        ))}
                      </TabsContent>
                    </div>
                  </ScrollArea>
                </Tabs>
              </div>

              {/* Right: Configuration Area */}
              <div className="w-1/2 flex flex-col border rounded-xl overflow-hidden bg-white">
                <div className="p-3 border-b bg-slate-50 font-semibold text-sm flex justify-between">
                  <span>Configure Selection</span>
                  <Badge variant="secondary">{Object.keys(selectedGeneralConfigs).length} items</Badge>
                </div>
                <ScrollArea className="flex-1 p-4 bg-slate-50/30">
                  {Object.keys(selectedGeneralConfigs).length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 pt-20">
                      <FileText className="h-12 w-12 mb-2" />
                      <p className="text-sm">Select documents on the left to configure</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.values(selectedGeneralConfigs).map(config => (
                        <div key={config.kycId} className="bg-white border rounded-lg p-3 shadow-sm space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-slate-700">{config.name}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleGeneralDoc({id: config.kycId})}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                          
                          <RadioGroup 
                            value={config.mode} 
                            onValueChange={(v) => updateGeneralMode(config.kycId, v)}
                            className="grid grid-cols-3 gap-2"
                          >
                            <div>
                              <RadioGroupItem value="standard" id={`std-${config.kycId}`} className="sr-only" />
                              <Label htmlFor={`std-${config.kycId}`} className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-blue-600", config.mode === 'standard' && "border-blue-600 bg-blue-50")}>
                                <User className="mb-1 h-4 w-4" />
                                <span className="text-[10px]">Normal</span>
                              </Label>
                            </div>

                            <div className={cn(!config.hasTemplate && "opacity-40 grayscale pointer-events-none")}>
                              <RadioGroupItem value="template" id={`tmp-${config.kycId}`} className="sr-only" />
                              <Label htmlFor={`tmp-${config.kycId}`} className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-orange-600", config.mode === 'template' && "border-orange-600 bg-orange-50")}>
                                <FileType className="mb-1 h-4 w-4" />
                                <span className="text-[10px]">Template</span>
                              </Label>
                            </div>

                            <div className={cn(!config.automationId && "opacity-40 grayscale pointer-events-none")}>
                              <RadioGroupItem value="webform" id={`web-${config.kycId}`} className="sr-only" />
                              <Label htmlFor={`web-${config.kycId}`} className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-purple-600", config.mode === 'webform' && "border-purple-600 bg-purple-50")}>
                                <Zap className="mb-1 h-4 w-4" />
                                <span className="text-[10px]">Web Form</span>
                              </Label>
                            </div>
                          </RadioGroup>
                          
                          {/* Stage Document Checkbox */}
                          <div className="flex items-center space-x-2 pt-2 border-t">
                            <Checkbox 
                              id={`stage-${config.kycId}`}
                              checked={config.isStageDocument || false}
                              onCheckedChange={() => toggleStageDocument(config.kycId)}
                            />
                            <Label htmlFor={`stage-${config.kycId}`} className="text-xs font-medium cursor-pointer">
                              Mark as Stage Document
                            </Label>
                          </div>
                          
                          {config.mode === 'webform' && config.automationId && (
                            <div className="text-[10px] text-purple-600 bg-purple-50 p-1.5 rounded flex items-center gap-1">
                              <Check className="h-3 w-3" /> Linked to Auto ID: {config.automationId.slice(0,8)}...
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          ) : (
           <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Bulk Add (One per line)</Label>
                <Textarea
                  value={bulkInput}
                  onChange={(e) => {
                    setBulkInput(e.target.value)
                    const lines = e.target.value.split('\n').filter(l => l.trim())
                    if (lines.length > 0) {
                      setNewRequirements(lines.map(l => ({ ...DEFAULT_REQUIREMENT, name: l.trim(), category: activeSection })))
                    }
                  }}
                  placeholder="Requirement A&#10;Requirement B"
                  className="min-h-[80px] bg-slate-50/50"
                />
              </div>

              {newRequirements.map((req, idx) => (
                <div key={idx} className="group relative border p-5 rounded-xl bg-card hover:shadow-md transition-all space-y-4">
                  <Button 
                    variant="ghost" size="icon" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                    onClick={() => setNewRequirements(newRequirements.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Requirement Name</Label>
                      <Input value={req.name} onChange={e => updateReq(idx, { name: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <Label>Applies To</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between overflow-hidden bg-white">
                            <div className="flex gap-1 truncate text-xs">
                              {req.applicantTypes.length > 0 ? req.applicantTypes.map(t => (
                                <Badge key={t} variant="secondary" className="capitalize text-[9px]">{t}</Badge>
                              )) : <span className="text-muted-foreground">Select applicants...</span>}
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search types..." />
                            <CommandList>
                              <CommandGroup>
                                {APPLICANT_OPTIONS.map((opt) => (
                                  <CommandItem
                                    key={opt.value}
                                    onSelect={() => {
                                      const current = req.applicantTypes
                                      const updated = current.includes(opt.value) ? current.filter(t => t !== opt.value) : [...current, opt.value]
                                      updateReq(idx, { applicantTypes: updated })
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", req.applicantTypes.includes(opt.value) ? "opacity-100" : "opacity-0")} />
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

                  <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Requirement Type</Label>
                      <Select value={req.type} onValueChange={v => updateReq(idx, { type: v })}>
                        <SelectTrigger className="bg-white h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="conditional">Conditional</SelectItem>
                          <SelectItem value="optional">Optional</SelectItem>
                          <SelectItem value="multi-document">Multi-Document</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">Doc Mapping</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between h-8 text-xs bg-white">
                                    {req.kycDocumentIds.length > 0 ? `${req.kycDocumentIds.length} Linked` : "Link Doc"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search..." />
                                    <CommandList className="max-h-[200px]">
                                        {kycDocuments.map(doc => (
                                            <CommandItem key={doc.id} onSelect={() => {
                                                const current = req.kycDocumentIds
                                                const updated = current.includes(String(doc.id)) ? current.filter(id => id !== String(doc.id)) : [...current, String(doc.id)]
                                                updateReq(idx, { kycDocumentIds: updated })
                                            }}>
                                                <Check className={cn("mr-2 h-3 w-3", req.kycDocumentIds.includes(String(doc.id)) ? "opacity-100" : "opacity-0")} />
                                                {doc.display_name || doc.name}
                                            </CommandItem>
                                        ))}
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                  </div>

                  {/* Stage Document Checkbox */}
                  <div className="flex items-center space-x-2 border-t pt-4">
                    <Checkbox 
                      id={`stage-req-${idx}`}
                      checked={req.isStageDocument || false}
                      onCheckedChange={(checked) => updateReq(idx, { isStageDocument: checked })}
                    />
                    <Label htmlFor={`stage-req-${idx}`} className="text-xs font-medium cursor-pointer">
                      Mark as Stage Document
                    </Label>
                  </div>
                </div>
              ))}

              <Button 
                variant="outline" 
                className="w-full border-dashed py-6 hover:bg-slate-100" 
                onClick={() => setNewRequirements([...newRequirements, { ...DEFAULT_REQUIREMENT, category: activeSection }])}
              >
                <Plus className="mr-2 h-4 w-4"/> Add Individual Requirement
              </Button>
            </div>
          )}
        </div>
        
        <DialogFooter className="p-6 bg-slate-50 border-t">
           <Button variant="outline" onClick={handleClose}>Cancel</Button>
           <Button onClick={handleSubmit} disabled={isSubmitting}>Save Requirements</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}