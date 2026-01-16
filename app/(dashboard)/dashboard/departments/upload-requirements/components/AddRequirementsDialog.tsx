// @ts-nocheck
"use client"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Plus, Zap, Check, ChevronsUpDown, Search, Trash2, Eraser, Building2, User } from "lucide-react"
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

export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee' | 'understudy';
export type RequirementCategory = 'general' | 'processing' | 'issuance';

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
  category: 'processing'
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

export function AddRequirementsDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isSubmitting,
  context
}: AddRequirementsDialogProps) {
  const [activeSection, setActiveSection] = useState<RequirementCategory>('processing')
  const [newRequirements, setNewRequirements] = useState<RequirementForm[]>([{ ...DEFAULT_REQUIREMENT }])
  const [bulkInput, setBulkInput] = useState('')
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)
  
  // State for General Requirements multi-select
  const [selectedGeneralDocs, setSelectedGeneralDocs] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) {
      fetchKycDocuments()
      setSelectedGeneralDocs([])
      setNewRequirements([{ ...DEFAULT_REQUIREMENT, category: activeSection }])
    }
  }, [isOpen, activeSection])

  const fetchKycDocuments = async () => {
    try {
      setLoadingKycDocs(true)
      // Assuming 'category' or similar column exists to distinguish company vs individual
      const { data, error } = await supabase.from('acc_portal_kyc').select('*').order('name')
      if (error) throw error
      setKycDocuments(data || [])
    } finally {
      setLoadingKycDocs(false)
    }
  }

  // Filter KYC docs for the General section
  const companyDocs = useMemo(() => kycDocuments.filter(d => d.category === 'company-docs'), [kycDocuments])
  const individualDocs = useMemo(() => kycDocuments.filter(d => d.category === 'application-docs' || d.category === 'directors-docs'), [kycDocuments])

  const handleSubmit = async () => {
    let validReqs = []

    if (activeSection === 'general') {
      // Convert selected KYC docs into requirement objects
      validReqs = selectedGeneralDocs.map(docId => {
        const doc = kycDocuments.find(d => String(d.id) === String(docId))
        return {
          ...DEFAULT_REQUIREMENT,
          name: doc?.display_name || doc?.name || 'Requirement',
          kycDocumentIds: [String(docId)],
          category: 'general'
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
        category: activeSection, // Critical for UI filtering
        order: startIdCount + index
      }));

      const finalRequirements = existingRecord 
        ? [...existingRecord.requirements, ...processedNewReqs]
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
    setSelectedGeneralDocs([])
    setBulkInput('')
  }

  const updateReq = (idx: number, fields: Partial<RequirementForm>) => {
    const updated = [...newRequirements]
    updated[idx] = { ...updated[idx], ...fields }
    setNewRequirements(updated)
  }

  const toggleGeneralDoc = (docId: string) => {
    setSelectedGeneralDocs(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    )
  }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Add New Requirements</DialogTitle>
          <DialogDescription>
            Target: <span className="font-bold text-primary">{context.subdepartmentName}</span> {context.className && `> ${context.className}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-6">
          {/* Main Section Selection */}
          <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1">
            <Button 
              variant={activeSection === 'general' ? 'default' : 'ghost'} 
              className="flex-1 h-9 text-xs" 
              onClick={() => setActiveSection('general')}
            >
              1. General Requirements
            </Button>
            <Button 
              variant={activeSection === 'processing' ? 'default' : 'ghost'} 
              className="flex-1 h-9 text-xs" 
              onClick={() => setActiveSection('processing')}
            >
              2. Processing Requirements
            </Button>
            <Button 
              variant={activeSection === 'issuance' ? 'default' : 'ghost'} 
              className="flex-1 h-9 text-xs" 
              onClick={() => setActiveSection('issuance')}
            >
              3. Issuance Requirements
            </Button>
          </div>

          {activeSection === 'general' ? (
            /* SPECIAL MULTI-SELECT UI FOR GENERAL REQUIREMENTS */
            <div className="space-y-4 border rounded-xl p-6 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" /> Select Document Types
                  </h3>
                  <p className="text-xs text-muted-foreground">Select existing document types from the KYC portal to add as general requirements.</p>
                </div>
                <Badge variant="outline" className="bg-white">{selectedGeneralDocs.length} selected</Badge>
              </div>

              <Tabs defaultValue="company" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="company" className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" /> Company Docs
                  </TabsTrigger>
                  <TabsTrigger value="individual" className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" /> Individual Docs
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="company" className="mt-4">
                  <ScrollArea className="h-[300px] border rounded-md bg-white p-4">
                    <div className="grid grid-cols-2 gap-3">
                      {companyDocs.map(doc => (
                        <div key={doc.id} className="flex items-center space-x-2 border p-2 rounded hover:bg-slate-50 transition-colors">
                          <Checkbox 
                            id={`doc-${doc.id}`} 
                            checked={selectedGeneralDocs.includes(String(doc.id))}
                            onCheckedChange={() => toggleGeneralDoc(String(doc.id))}
                          />
                          <label htmlFor={`doc-${doc.id}`} className="text-xs font-medium leading-none cursor-pointer truncate">
                            {doc.display_name || doc.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="individual" className="mt-4">
                  <ScrollArea className="h-[300px] border rounded-md bg-white p-4">
                    <div className="grid grid-cols-2 gap-3">
                      {individualDocs.map(doc => (
                        <div key={doc.id} className="flex items-center space-x-2 border p-2 rounded hover:bg-slate-50 transition-colors">
                          <Checkbox 
                            id={`doc-${doc.id}`} 
                            checked={selectedGeneralDocs.includes(String(doc.id))}
                            onCheckedChange={() => toggleGeneralDoc(String(doc.id))}
                          />
                          <label htmlFor={`doc-${doc.id}`} className="text-xs font-medium leading-none cursor-pointer truncate">
                            {doc.display_name || doc.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            /* STANDARD FORM UI FOR PROCESSING/ISSUANCE */
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
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || (activeSection === 'general' ? selectedGeneralDocs.length === 0 : !newRequirements.some(r => r.name.trim()))}
          >
            {isSubmitting ? "Saving..." : `Save to ${activeSection === 'general' ? 'General' : activeSection === 'processing' ? 'Processing' : 'Issuance'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}