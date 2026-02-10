// @ts-nocheck
"use client"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus, Zap, Check, ChevronsUpDown, Trash2,
  Loader2, X, Search, Split, HelpCircle, ArrowDownRight,
  Settings2, Database, Folder, Eye
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { Card } from "@/components/ui/card"

// --- Types ---
export type ApplicantType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependant' | 'employee' | 'understudy';
export type RequirementCategory = 'general' | 'processing' | 'issuance' | 'job-specific';
export type QuestionType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
export type LogicOperator = 'equals' | 'not_equals' | 'is_not_empty' | 'is_empty';

export interface RequirementForm {
  id: string
  name: string
  category_name: string // Grouping category (e.g. Arrival Details)
  description: string
  isRequired: boolean
  isVisible: boolean
  kycDocumentIds: string[]
  applicantTypes: ApplicantType[]
  category: RequirementCategory // The Tab (processing/issuance/etc)
  inputType?: QuestionType
  options?: string[]
  defaultValue?: string
  linkedMasterFieldId?: string
  dependsOnQuestionId?: string
  dependsOnOperator?: LogicOperator
  dependsOnValue?: string
}

const DEFAULT_REQUIREMENT = (category: RequirementCategory): RequirementForm => ({
  id: crypto.randomUUID(),
  name: '',
  category_name: '',
  description: '',
  isRequired: true,
  isVisible: true,
  kycDocumentIds: [],
  applicantTypes: ['principal'],
  category: category,
  inputType: 'text',
  defaultValue: '',
  options: [],
  dependsOnQuestionId: undefined,
  dependsOnOperator: 'equals',
  dependsOnValue: ''
})

export function AddRequirementsDialog({ isOpen, onOpenChange, onSubmit, isSubmitting, context }: any) {
  const [activeSection, setActiveSection] = useState<RequirementCategory>('job-specific')
  const [generalReqs, setGeneralReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('general')])
  const [processingReqs, setProcessingReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('processing')])
  const [issuanceReqs, setIssuanceReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('issuance')])
  const [jobSpecificReqs, setJobSpecificReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('job-specific')])

  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<any[]>([])
  const [bulkInput, setBulkInput] = useState('')

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        const [kyc, mf] = await Promise.all([
          supabase.from('acc_portal_kyc').select('*').order('name'),
          supabase.from('tm_job_fields').select('id, label').order('label')
        ])
        setKycDocuments(kyc.data || [])
        setMasterFields(mf.data || [])
      }
      fetchData()
    }
  }, [isOpen])

  const updateCurrentReq = (idx: number, fields: Partial<RequirementForm>) => {
    const listMap = { 'general': [generalReqs, setGeneralReqs], 'processing': [processingReqs, setProcessingReqs], 'issuance': [issuanceReqs, setIssuanceReqs], 'job-specific': [jobSpecificReqs, setJobSpecificReqs] }
    const [state, setter] = listMap[activeSection];
    const updated = [...state];
    updated[idx] = { ...updated[idx], ...fields };
    setter(updated);
  }

  const handleBulkAdd = () => {
    const lines = bulkInput.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return;
    const newItems = lines.map(line => ({ ...DEFAULT_REQUIREMENT(activeSection), name: line.trim() }));
    if (activeSection === 'job-specific') setJobSpecificReqs([...jobSpecificReqs, ...newItems]);
    setBulkInput('');
  }

  const handleSubmit = async () => {
    if (!context) return;
    const source = activeSection === 'general' ? generalReqs : activeSection === 'processing' ? processingReqs : activeSection === 'issuance' ? issuanceReqs : jobSpecificReqs;
    const validItems = source.filter(r => r.name.trim() !== '');

    try {
      const jobLevelObj = {
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4,
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId)
      };

      // 1. Fetch Existing Record to Merge
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
        // 2. Merge Job Specific Questions
        const existingQuestions = existingRecord?.job_specific_questions || [];
        payload.job_specific_questions = [
          ...existingQuestions,
          ...validItems.map((r, i) => ({
            id: r.id,
            category: r.category_name || 'General',
            label: r.name.trim(),
            type: r.inputType || 'text',
            required: r.isRequired,
            options: r.options || [],
            default_value: r.defaultValue || '',
            depends_on: r.dependsOnQuestionId ? {
              id: r.dependsOnQuestionId,
              operator: r.dependsOnOperator,
              value: r.dependsOnValue
            } : null,
            applicant_types: r.applicantTypes,
            order: existingQuestions.length + i
          }))
        ];
      } else {
        // 3. Merge Standard Requirements
        const existingReqs = existingRecord?.requirements || [];
        payload.requirements = [
          ...existingReqs,
          ...validItems.map((r, i) => ({
            id: r.id,
            name: r.name.trim(),
            category: activeSection,
            kyc_document_ids: r.kycDocumentIds,
            is_mandatory: r.isRequired,
            applicantTypes: r.applicantTypes,
            order: existingReqs.length + i
          }))
        ];
      }

      await onSubmit(payload);
      toast({ title: "Success", description: "Configuration updated and merged." });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Merge failed', variant: 'destructive' });
    }
  }

  const currentReqs = activeSection === 'general' ? generalReqs : activeSection === 'processing' ? processingReqs : activeSection === 'issuance' ? issuanceReqs : jobSpecificReqs;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 bg-slate-50 overflow-hidden">
        <DialogHeader className="p-6 bg-white border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Configuration Manager
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <div className="flex bg-slate-200/50 p-1 rounded-xl sticky top-0 z-20 backdrop-blur-md">
            {['general', 'processing', 'issuance', 'job-specific'].map(tab => (
              <Button key={tab} variant={activeSection === tab ? "default" : "ghost"} className={cn("flex-1 capitalize text-xs rounded-lg transition-all", activeSection === tab && "shadow-sm")} onClick={() => setActiveSection(tab as any)}>
                {tab.replace('-', ' ')}
              </Button>
            ))}
          </div>

          {/* Bulk Add */}
          <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
            <Label className="text-[10px] uppercase font-bold text-slate-400">Quick Add Questions (One per line)</Label>
            <div className="flex gap-2">
              <Textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} placeholder="e.g. Arrival Method&#10;Select Airline&#10;Flight Number" className="min-h-[80px] text-sm" />
              <Button onClick={handleBulkAdd} className="h-auto">Add Items</Button>
            </div>
          </div>

          <div className="space-y-4">
            {currentReqs.map((req, idx) => (
              <Card key={req.id} className="border-2 border-slate-200 overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-white">Item {idx + 1}</Badge>
                    <Input value={req.name} onChange={e => updateCurrentReq(idx, { name: e.target.value })} className="h-8 bg-transparent border-none font-bold text-slate-700 w-[300px] focus-visible:ring-0" placeholder="Question label..." />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => {
                    const filtered = currentReqs.filter(r => r.id !== req.id);
                    if (activeSection === 'job-specific') setJobSpecificReqs(filtered);
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>

                <div className="p-5 space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    {/* Category Input */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-blue-600 flex items-center gap-1">
                        <Folder className="h-3 w-3" /> Section Category
                      </Label>
                      <Input value={req.category_name} onChange={e => updateCurrentReq(idx, { category_name: e.target.value })} placeholder="e.g. Arrival Details" className="h-9" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Response Type</Label>
                      <Select value={req.inputType} onValueChange={v => updateCurrentReq(idx, { inputType: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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

                    {req.inputType === 'select' && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-slate-400">Options (Comma Sep)</Label>
                        <Input placeholder="Air, Sea, Land" value={req.options?.join(', ')} onChange={e => updateCurrentReq(idx, { options: e.target.value.split(',').map(s => s.trim()) })} className="h-9" />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-400">Mandatory</Label>
                      <div className="flex items-center h-9 gap-2 px-3 border rounded-md">
                        <Checkbox checked={req.isRequired} onCheckedChange={c => updateCurrentReq(idx, { isRequired: !!c })} />
                        <span className="text-xs">Required</span>
                      </div>
                    </div>
                  </div>

                  {/* LOGIC ENGINE */}
                  <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 space-y-4">
                    <div className="flex items-center gap-2 text-amber-800">
                      <Split className="h-4 w-4" />
                      <span className="text-[11px] font-bold uppercase">Visibility Logic</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-amber-700 font-bold">Show if this question...</Label>
                        <Select value={req.dependsOnQuestionId || "always"} onValueChange={v => updateCurrentReq(idx, { dependsOnQuestionId: v === "always" ? undefined : v })}>
                          <SelectTrigger className="bg-white border-amber-200 h-9"><SelectValue placeholder="Always Visible" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="always">Always Visible</SelectItem>
                            {currentReqs.slice(0, idx).map(prev => (
                              <SelectItem key={prev.id} value={prev.id}>{prev.name || 'Untitled'}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {req.dependsOnQuestionId && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-amber-700 font-bold">Operator</Label>
                            <Select value={req.dependsOnOperator} onValueChange={v => updateCurrentReq(idx, { dependsOnOperator: v as any })}>
                              <SelectTrigger className="bg-white border-amber-200 h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="is_not_empty">Is Answered</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {req.dependsOnOperator === 'equals' && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-amber-700 font-bold">Value</Label>
                              <Input placeholder="e.g. Arriving by Air" value={req.dependsOnValue} onChange={e => updateCurrentReq(idx, { dependsOnValue: e.target.value })} className="bg-white border-amber-200 h-9" />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="w-full border-dashed py-8 bg-white" onClick={() => setJobSpecificReqs([...jobSpecificReqs, DEFAULT_REQUIREMENT('job-specific')])}>
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </div>

        <DialogFooter className="p-6 bg-white border-t flex gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Save & Merge Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}