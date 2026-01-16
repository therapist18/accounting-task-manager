// @ts-nocheck
"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Plus, Zap, Check, ChevronsUpDown, Search, Trash2, Eraser } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"

export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee' | 'understudy';

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
  instructions: ''
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
  const [newRequirements, setNewRequirements] = useState<RequirementForm[]>([{ ...DEFAULT_REQUIREMENT }])
  const [bulkInput, setBulkInput] = useState('')
  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [loadingKycDocs, setLoadingKycDocs] = useState(false)

  useEffect(() => {
    if (isOpen) fetchKycDocuments()
  }, [isOpen])

  const fetchKycDocuments = async () => {
    try {
      setLoadingKycDocs(true)
      const { data, error } = await supabase.from('acc_portal_kyc').select('id, name, display_name').order('name')
      if (error) throw error
      setKycDocuments(data || [])
    } finally {
      setLoadingKycDocs(false)
    }
  }

  const handleSubmit = async () => {
    const validReqs = newRequirements.filter(req => req.name.trim() !== '')
    if (validReqs.length === 0 || !context) return

    console.log("🚀 [AddRequirements] Starting submission flow...");

    try {
      // 1. Determine Job Level mapping
      const jobLevelObj = {
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId),
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4
      }

      console.log("🔍 [AddRequirements] Querying existing requirements for job_level:", jobLevelObj);

      // 2. Fetch existing record to merge (match by job_level string)
      const jobLevelString = JSON.stringify(jobLevelObj)
      const { data: existingRecord, error: fetchError } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('job_level', jobLevelString)
        .maybeSingle();
      
      if (fetchError) throw fetchError;

      // 3. Prepare processing
      const startIdCount = existingRecord?.requirements?.length || 0;
      
      const processedNewReqs = validReqs.map((req, index) => ({
        id: (Date.now() + index).toString(),
        name: req.name.trim(),
        description: req.description,
        type: req.type,
        isRequired: req.isRequired,
        is_mandatory: req.isRequired,
        isVisible: req.isVisible,
        applicantTypes: req.applicantTypes,
        instructions: req.instructions,
        requiredDocumentCount: req.requiredDocumentCount,
        kyc_document_ids: req.kycDocumentIds,
        order: startIdCount + index
      }));

      // 4. Final Payload (Legacy format with proper field names)
      const finalRequirements = existingRecord 
        ? [...existingRecord.requirements, ...processedNewReqs]
        : processedNewReqs;

      console.log(existingRecord 
        ? `✅ [AddRequirements] Merging with existing record (ID: ${existingRecord.id})` 
        : `🆕 [AddRequirements] Creating new requirement record`
      );

      const payload = {
        requirements: finalRequirements,
        job_level: jobLevelObj,
        type: context.type === 'subdepartment' ? 'subdepartment' : context.type === 'class' ? 'class' : 'subclass',
        is_mandatory: true,
        updated_at: new Date().toISOString(),
        ...(existingRecord && { id: existingRecord.id }) // Include ID for the update/upsert
      };

      console.log("📤 [AddRequirements] Payload generated:", payload);

      await onSubmit(payload);
      
      toast({ title: "Success", description: "Requirements updated." });
      handleClose();

    } catch (error) {
      console.error("❌ [AddRequirements] Submission failed:", error);
      toast({ title: 'Error', description: 'Failed to save requirements', variant: 'destructive' });
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setNewRequirements([{ ...DEFAULT_REQUIREMENT }])
    setBulkInput('')
  }

  const updateReq = (idx: number, fields: Partial<RequirementForm>) => {
    const updated = [...newRequirements]
    updated[idx] = { ...updated[idx], ...fields }
    setNewRequirements(updated)
  }

  const toggleKycDoc = (idx: number, docId: string) => {
    const current = newRequirements[idx].kycDocumentIds || []
    const updated = current.includes(docId) ? current.filter(id => id !== docId) : [...current, docId]
    updateReq(idx, { kycDocumentIds: updated })
  }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Requirements</DialogTitle>
          <DialogDescription>
            Target Path: <span className="font-bold text-primary">{context.subdepartmentName} {context.className && `> ${context.className}`}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Bulk Add (One per line)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => {
                setBulkInput(e.target.value)
                const lines = e.target.value.split('\n').filter(l => l.trim())
                if (lines.length > 0) {
                  setNewRequirements(lines.map(l => ({ ...DEFAULT_REQUIREMENT, name: l.trim() })))
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
                onClick={() => {
                  if (newRequirements.length > 1) {
                    setNewRequirements(newRequirements.filter((_, i) => i !== idx))
                  }
                }}
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
                        <div className="flex gap-1 truncate">
                          {req.applicantTypes.length > 0 ? req.applicantTypes.map(t => (
                            <Badge key={t} variant="secondary" className="capitalize text-[10px]">{t}</Badge>
                          )) : <span className="text-muted-foreground">Select applicants...</span>}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search types..." />
                        <CommandList>
                          <CommandEmpty>No results found.</CommandEmpty>
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
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem onSelect={() => updateReq(idx, { applicantTypes: [] })} className="justify-center text-destructive font-medium cursor-pointer">
                              <Eraser className="mr-2 h-4 w-4" />
                              Clear All Selections
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <Label>Required Document Count</Label>
                  <Input 
                    type="number" min="1" 
                    value={req.requiredDocumentCount} 
                    onChange={e => updateReq(idx, { requiredDocumentCount: parseInt(e.target.value) || 1 })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requirement Type</Label>
                  <Select value={req.type} onValueChange={v => updateReq(idx, { type: v })}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="conditional">Conditional</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                      <SelectItem value="multi-document">Multi-Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <Label className="flex items-center gap-2 text-primary font-semibold">
                  <FileText className="h-4 w-4"/> Document Mapping (Existing Portal Docs)
                </Label>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between bg-white">
                      <div className="flex gap-1 truncate">
                        {req.kycDocumentIds.length > 0 
                          ? `${req.kycDocumentIds.length} types linked` 
                          : "Search & Select Document Types..."}
                      </div>
                      <Search className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search documents..." />
                      <CommandList>
                        {loadingKycDocs && <div className="p-4 text-center text-sm italic">Loading documents...</div>}
                        <CommandEmpty>No documents found.</CommandEmpty>
                        <CommandGroup>
                          {kycDocuments.map((doc) => (
                            <CommandItem key={doc.id} onSelect={() => toggleKycDoc(idx, doc.id.toString())}>
                              <Check className={cn("mr-2 h-4 w-4", req.kycDocumentIds.includes(doc.id.toString()) ? "opacity-100" : "opacity-0")} />
                              {doc.display_name || doc.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem onSelect={() => updateReq(idx, { kycDocumentIds: [] })} className="justify-center text-destructive font-medium cursor-pointer">
                            <Eraser className="mr-2 h-4 w-4" />
                            Clear Links
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ))}

          <Button 
            variant="outline" 
            className="w-full border-dashed py-6 hover:bg-slate-100" 
            onClick={() => setNewRequirements([...newRequirements, { ...DEFAULT_REQUIREMENT }])}
          >
            <Plus className="mr-2 h-4 w-4"/> Add Individual Requirement
          </Button>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !newRequirements.some(r => r.name.trim())}>
            {isSubmitting ? "Saving..." : "Save Requirements"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}