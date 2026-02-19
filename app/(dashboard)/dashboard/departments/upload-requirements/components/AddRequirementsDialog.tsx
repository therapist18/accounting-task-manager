// @ts-nocheck
"use client"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Plus, Zap, Check, ChevronsUpDown, Trash2, FileType, Loader2, Database, Settings2, Calculator, X, Search, Split, Folder, HelpCircle } from "lucide-react"
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
  AGE_RANGE_TYPES,
  DEPENDANT_RELATIONSHIPS,
  ENTITY_TYPES,
  type NationalityType,
  type AgeRangeType,
  type EntityType,
  REQUIREMENT_CATEGORIES, type RequirementCategory
} from "@/lib/constants/entity-types"
import { COMPUTED_FUNCTIONS, EXECUTION_MODES, LINKING_VARIABLES } from "@/lib/constants/computed-functions"
import { useTableData, type TableOption } from "@/lib/tableUtils"
import { Card } from "@/components/ui/card"

export type EntityType = EntityType;
export type SubmissionMode = 'standard' | 'template' | 'webform';
export type QuestionType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
export type LogicOperator = 'equals' | 'not_equals' | 'is_not_empty' | 'is_empty';

export interface RequirementForm {
  name: string
  description: string
  type: 'standard' | 'conditional' | 'optional' | 'company' | 'multi-document'
  isRequired: boolean
  isVisible: boolean
  documentIds: string[]
  entityTypes: EntityType[]
  requiredDocumentCount: number
  instructions: string
  category: RequirementCategory
  isStageDocument: boolean
  hasTemplate: boolean
  hasWebForm?: boolean
  automationId?: string
  inputType?: QuestionType
  linkedMasterFieldId?: string
  options?: string[]
  defaultValue?: string
  executionMode?: 'all' | 'latest'
  computedFunction?: string
  nationality?: NationalityType
  ageRange?: AgeRangeType
  dependantRelationships?: string[]
  sourceTable?: string
  linkingVariable?: "id" | "individual_id" | "director_id" | "document_id" | "company_id" | null
  selectedTemplateId?: string
  selectedTemplate?: any
  // New fields for job-specific questions
  category_name?: string // Grouping category (e.g. Arrival Details)
  dependsOnQuestionId?: string
  dependsOnOperator?: LogicOperator
  dependsOnValue?: string
}

const DEFAULT_REQUIREMENT = (category: RequirementCategory): RequirementForm => ({
  name: '',
  description: '',
  type: 'standard',
  isRequired: true,
  isVisible: true,
  documentIds: [],
  entityTypes: ['principal'],
  requiredDocumentCount: 1,
  instructions: '',
  category: category,
  isStageDocument: false,
  hasTemplate: false,
  hasWebForm: false,
  inputType: 'text',
  defaultValue: '',
  executionMode: 'latest',
  computedFunction: 'none',
  nationality: undefined,
  ageRange: undefined,
  dependantRelationships: [],
  sourceTable: '',
  linkingVariable: null,
  selectedTemplateId: undefined,
  selectedTemplate: undefined,
  category_name: '',
  dependsOnQuestionId: undefined,
  dependsOnOperator: 'equals',
  dependsOnValue: ''
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
    subclassId?: string | number
  } | null
}

const APPLICANT_OPTIONS = ENTITY_TYPES;

export function AddRequirementsDialog({ isOpen, onOpenChange, onSubmit, isSubmitting, context }: AddRequirementsDialogProps) {
  const [activeSection, setActiveSection] = useState<RequirementCategory>('processing')

  // State for all categories including general
  const [generalReqs, setGeneralReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('general')])
  const [processingReqs, setProcessingReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('processing')])
  const [issuanceReqs, setIssuanceReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('issuance')])
  const [jobSpecificReqs, setJobSpecificReqs] = useState<RequirementForm[]>([DEFAULT_REQUIREMENT('job-specific')])

  const [kycDocuments, setKycDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Bulk inputs
  const [generalBulkInput, setGeneralBulkInput] = useState('')
  const [processingBulkInput, setProcessingBulkInput] = useState('')
  const [issuanceBulkInput, setIssuanceBulkInput] = useState('')
  const [jobSpecificBulkInput, setJobSpecificBulkInput] = useState('')

  const [automationTypes, setAutomationTypes] = useState<any[]>([])
  const [masterFields, setMasterFields] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Table data hook for fetching available tables
  const { tables, loadingTables } = useTableData()

  useEffect(() => {
    if (isOpen) fetchInitialData()
  }, [isOpen])

  useEffect(() => {
    if (context?.departmentId !== 1 && (activeSection === 'processing' || activeSection === 'issuance')) {
      setActiveSection('general');
    }
  }, [context?.departmentId, activeSection])

  const fetchInitialData = async () => {
    try {
      setLoading(true)
      const [kycRes, autoRes, mfRes] = await Promise.all([
        supabase.from('acc_portal_kyc').select('*').order('name'),
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

  const fetchTemplates = async (documentIds: string[], entityTypes: EntityType[] = ['principal']) => {
    if (documentIds.length === 0) {
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

      const mappedEntityTypes = [...new Set(entityTypes.map(type => entityTypeMap[type] || 'principal'))];

      const entityFilters = mappedEntityTypes.map(et => `entity_types.cs.["${et}"]`).join(',');

      let query = supabase
        .from('acc_portal_templates')
        .select('*')
        .in('document_id', documentIds)
        .or(entityFilters);

      const { data, error } = await query.order('file_name', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({ title: "Error", description: "Failed to fetch templates", variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  }

  // Fetch templates when hasTemplate or documentIds change
  useEffect(() => {
    if (!isOpen) return;

    const allDocIds = [...generalReqs, ...processingReqs, ...issuanceReqs, ...jobSpecificReqs]
      .filter(req => req.hasTemplate && req.documentIds.length > 0)
      .flatMap(req => req.documentIds);

    const allEntityTypes = [...generalReqs, ...processingReqs, ...issuanceReqs, ...jobSpecificReqs]
      .filter(req => req.hasTemplate)
      .flatMap(req => req.entityTypes || ['principal']);

    if (allDocIds.length > 0) {
      fetchTemplates(allDocIds, allEntityTypes);
    } else {
      setTemplates([]);
    }
  }, [isOpen, generalReqs, processingReqs, issuanceReqs, jobSpecificReqs]);

  const handleSubmit = async () => {
    if (!context) return;

    let source: RequirementForm[] = [];
    switch (activeSection) {
      case 'general': source = generalReqs; break;
      case 'processing': source = processingReqs; break;
      case 'issuance': source = issuanceReqs; break;
      case 'job-specific': source = jobSpecificReqs; break;
      default: source = [];
    }

    const validItems = source.filter(req => req.name.trim() !== '');

    if (validItems.length === 0) return;

    try {
      const jobLevelObj = {
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4,
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId)
      };

      const jobLevelForAutomation = {
        level: context.type === 'subdepartment' ? 2 : context.type === 'class' ? 3 : 4,
        class_id: context.classId ? Number(context.classId) : null,
        subclass_id: context.subclassId ? Number(context.subclassId) : null,
        department_id: Number(context.departmentId),
        subdepartment_id: Number(context.subdepartmentId)
      };

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

      // Update tm_automations table for any web form automations
      const automationUpdates = [];
      for (const req of validItems) {
        if (req.hasWebForm && req.automationId) {
          automationUpdates.push(
            supabase
              .from('tm_automations')
              .update({
                job_level: jobLevelForAutomation,
                updated_at: new Date().toISOString()
              })
              .eq('id', req.automationId)
          );
        }
      }

      if (automationUpdates.length > 0) {
        await Promise.all(automationUpdates);
      }

      if (activeSection === 'job-specific') {
        const existingQuestions = existingRecord?.job_specific_questions || [];
        payload.job_specific_questions = [...existingQuestions, ...validItems.map((req, index) => {
          const options = Array.isArray(req.options) ? req.options.filter(opt => opt.trim() !== '') : [];
          return {
            id: crypto.randomUUID(),
            category: req.category_name || 'General',
            label: req.name.trim(),
            type: req.inputType || 'text',
            required: req.isRequired,
            default_value: req.defaultValue || '',
            options: options,
            linked_field_id: req.linkedMasterFieldId || null,
            entityTypes: req.entityTypes,
            depends_on: req.dependsOnQuestionId ? {
              id: req.dependsOnQuestionId,
              operator: req.dependsOnOperator,
              value: req.dependsOnValue
            } : null,
            order: existingQuestions.length + index
          };
        })];
      } else {
        const existingReqs = existingRecord?.requirements || [];
        payload.requirements = [...existingReqs, ...validItems.map((req, index) => {
          let web_automation = null
          if (req.hasWebForm && req.automationId) {
            const auto = automationTypes.find(a => String(a.id) === String(req.automationId))
            web_automation = { automationId: req.automationId, automationName: auto?.name, webhookUrl: auto?.webhook_url }
          }
          return {
            id: (Date.now() + index).toString(),
            name: req.name.trim(),
            description: req.description || '',
            type: 'document',
            nationality: req.nationality,
            ageRange: req.ageRange,
            dependantRelationships: req.dependantRelationships,
            is_mandatory: req.isRequired,
            isVisible: req.isVisible,
            entityTypes: req.entityTypes,
            instructions: req.instructions || '',
            requiredDocumentCount: req.requiredDocumentCount,
            document_ids: req.documentIds,
            category: activeSection,
            isStageDocument: req.isStageDocument || false,
            hasTemplate: req.hasTemplate || false,
            web_automation,
            execution_mode: req.executionMode || 'latest',
            computed_function: req.computedFunction || 'getLatestDocument',
            sourceTable: req.sourceTable || '',
            linkingVariable: req.linkingVariable || null,
            selectedTemplateId: req.selectedTemplateId || undefined,
            order: existingReqs.length + index
          }
        })];
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
    const resetForm = () => {
      setGeneralReqs([DEFAULT_REQUIREMENT('general')])
      setProcessingReqs([DEFAULT_REQUIREMENT('processing')])
      setIssuanceReqs([DEFAULT_REQUIREMENT('issuance')])
      setJobSpecificReqs([DEFAULT_REQUIREMENT('job-specific')])

      setGeneralBulkInput('')
      setProcessingBulkInput('')
      setIssuanceBulkInput('')
      setJobSpecificBulkInput('')

      setActiveSection('processing')
    }
    onOpenChange(false)
    resetForm()
  }

  const updateCurrentReq = (idx: number, fields: Partial<RequirementForm>) => {
    if (activeSection === 'general') {
      const updated = [...generalReqs];
      updated[idx] = { ...updated[idx], ...fields };
      setGeneralReqs(updated);
    } else if (activeSection === 'processing') {
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

  const handleBulkInputChange = (section: RequirementCategory, value: string) => {
    const lines = value.split('\n').filter(l => l.trim())

    switch (section) {
      case 'general':
        setGeneralBulkInput(value)
        if (lines.length > 0) {
          setGeneralReqs(lines.map(l => ({ ...DEFAULT_REQUIREMENT('general'), name: l.trim() })))
        }
        break
      case 'processing':
        setProcessingBulkInput(value)
        if (lines.length > 0) {
          setProcessingReqs(lines.map(l => ({ ...DEFAULT_REQUIREMENT('processing'), name: l.trim() })))
        }
        break
      case 'issuance':
        setIssuanceBulkInput(value)
        if (lines.length > 0) {
          setIssuanceReqs(lines.map(l => ({ ...DEFAULT_REQUIREMENT('issuance'), name: l.trim() })))
        }
        break
      case 'job-specific':
        setJobSpecificBulkInput(value)
        if (lines.length > 0) {
          setJobSpecificReqs(lines.map(l => ({ ...DEFAULT_REQUIREMENT('job-specific'), name: l.trim() })))
        }
        break
    }
  }

  const getCurrentBulkInput = () => {
    switch (activeSection) {
      case 'general': return generalBulkInput
      case 'processing': return processingBulkInput
      case 'issuance': return issuanceBulkInput
      case 'job-specific': return jobSpecificBulkInput
      default: return ''
    }
  }

  const getCurrentBulkPlaceholder = () => {
    switch (activeSection) {
      case 'general':
        return "Enter general requirements line by line (e.g. Cover Letter, Application Form)"
      case 'processing':
        return "Enter processing requirements line by line (e.g. Current Passport, Tax PIN, Good Conduct)"
      case 'issuance':
        return "Enter issuance requirements line by line (e.g. Work Permit, Certificate of Incorporation, Tax Compliance)"
      case 'job-specific':
        return "e.g. Arrival Method\nSelect Airline\nFlight Number"
      default:
        return "Enter requirements line by line"
    }
  }

  const currentReqs = useMemo(() => {
    switch (activeSection) {
      case 'general': return generalReqs;
      case 'processing': return processingReqs;
      case 'issuance': return issuanceReqs;
      case 'job-specific': return jobSpecificReqs;
      default: return [];
    }
  }, [activeSection, generalReqs, processingReqs, issuanceReqs, jobSpecificReqs]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open ? handleClose() : onOpenChange(true)}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 bg-slate-50">
        <DialogHeader className="p-6 pb-2 bg-white border-b">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Configuration Manager
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex flex-col px-6 space-y-4 pt-4">
          <div className="bg-slate-200/50 p-1 rounded-xl sticky top-0 z-20 backdrop-blur-md flex gap-1">
            {REQUIREMENT_CATEGORIES.map(cat => cat.value).filter(sec => context?.departmentId === 1 || sec === 'general' || sec === 'job-specific').map((sec) => (
              <Button key={sec} variant={activeSection === sec ? 'default' : 'ghost'} className={cn("flex-1 h-8 text-xs capitalize rounded-lg transition-all", activeSection === sec && "shadow-sm")} onClick={() => setActiveSection(sec as RequirementCategory)}>
                {sec.replace('-', ' ')}
              </Button>
            ))}
          </div>

          <div className="space-y-6 pb-6">
            <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
              <Label className="text-[10px] uppercase font-bold text-slate-400">
                Quick Add {activeSection === 'job-specific' ? 'Questions' : 'Requirements'} (One per line)
              </Label>
              <Textarea
                value={getCurrentBulkInput()}
                onChange={(e) => handleBulkInputChange(activeSection, e.target.value)}
                placeholder={getCurrentBulkPlaceholder()}
                className="min-h-[80px] text-sm"
              />
            </div>

            {currentReqs.map((req, idx) => (
              <Card key={idx} className="border-2 border-slate-200 overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-white">Item {idx + 1}</Badge>
                    <Input
                      value={req.name}
                      onChange={e => updateCurrentReq(idx, { name: e.target.value })}
                      className="h-8 bg-transparent border-none font-bold text-slate-700 w-[300px] focus-visible:ring-0"
                      placeholder="Question label..."
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400"
                    onClick={() => {
                      const updated = currentReqs.filter((_, i) => i !== idx);
                      if (activeSection === 'general') setGeneralReqs(updated);
                      else if (activeSection === 'processing') setProcessingReqs(updated);
                      else if (activeSection === 'issuance') setIssuanceReqs(updated);
                      else setJobSpecificReqs(updated);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="p-5 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-500">Applies To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between h-10 bg-white">
                          <div className="flex gap-1 truncate text-xs">
                            {req.entityTypes.length > 0 ? req.entityTypes.map(t => <Badge key={t} variant="secondary" className="capitalize text-[9px]">{t}</Badge>) : "Select role..."}
                          </div>
                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search roles..." />
                          <CommandList>
                            <CommandGroup>
                              {APPLICANT_OPTIONS.map((opt) => (
                                <CommandItem key={opt.value} onSelect={() => {
                                  const current = req.entityTypes;
                                  const updated = current.includes(opt.value as EntityType)
                                    ? current.filter(t => t !== opt.value)
                                    : [...current, opt.value as EntityType];
                                  updateCurrentReq(idx, { entityTypes: updated });
                                }}>
                                  <Check className={cn("mr-2 h-4 w-4", req.entityTypes.includes(opt.value as EntityType) ? "opacity-100" : "opacity-0")} />
                                  {opt.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {activeSection === 'job-specific' ? (
                    <>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-blue-600 flex items-center gap-1">
                            <Folder className="h-3 w-3" /> Section Category
                          </Label>
                          <Input
                            value={req.category_name}
                            onChange={e => updateCurrentReq(idx, { category_name: e.target.value })}
                            placeholder="e.g. Arrival Details"
                            className="h-9"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Response Type</Label>
                          <Select value={req.inputType} onValueChange={(v: QuestionType) => updateCurrentReq(idx, { inputType: v })}>
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

                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Default Value</Label>
                          <Input
                            value={req.defaultValue}
                            onChange={e => updateCurrentReq(idx, { defaultValue: e.target.value })}
                            className="h-9"
                            placeholder="Optional..."
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Mandatory</Label>
                          <div className="flex items-center h-9 gap-2 px-3 border rounded-md">
                            <Checkbox
                              checked={req.isRequired}
                              onCheckedChange={c => updateCurrentReq(idx, { isRequired: !!c })}
                            />
                            <span className="text-xs">Required</span>
                          </div>
                        </div>
                      </div>

                      {(req.inputType === 'select' || req.inputType === 'multiselect') && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase font-bold text-blue-600">Dropdown Options</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                const currentOptions = Array.isArray(req.options) ? [...req.options] : [];
                                updateCurrentReq(idx, { options: [...currentOptions, ''] });
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add Option
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {Array.isArray(req.options) && req.options.map((option, optIdx) => (
                              <div key={optIdx} className="flex gap-2 items-center">
                                <Input
                                  value={option}
                                  onChange={(e) => {
                                    const newOptions = [...req.options];
                                    newOptions[optIdx] = e.target.value;
                                    updateCurrentReq(idx, { options: newOptions });
                                  }}
                                  placeholder={`Option ${optIdx + 1}`}
                                  className="h-9 flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive"
                                  onClick={() => {
                                    const newOptions = [...req.options];
                                    newOptions.splice(optIdx, 1);
                                    updateCurrentReq(idx, { options: newOptions });
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            {(!req.options || req.options.length === 0) && (
                              <div className="text-sm text-muted-foreground text-center py-2">
                                No options added yet. Click "Add Option" to get started.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-blue-600">Master Field Sync</Label>
                        <Select value={req.linkedMasterFieldId} onValueChange={(v) => updateCurrentReq(idx, { linkedMasterFieldId: v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Link field..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {masterFields.map(mf => (
                              <SelectItem key={mf.id} value={String(mf.id)}>{mf.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* CONDITIONAL LOGIC ENGINE */}
                      <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 space-y-4">
                        <div className="flex items-center gap-2 text-amber-800">
                          <Split className="h-4 w-4" />
                          <span className="text-[11px] font-bold uppercase">Visibility Logic</span>
                          <HelpCircle className="h-3 w-3 text-amber-600" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-amber-700 font-bold">Show if this question...</Label>
                            <Select
                              value={req.dependsOnQuestionId || "always"}
                              onValueChange={v => updateCurrentReq(idx, {
                                dependsOnQuestionId: v === "always" ? undefined : v
                              })}
                            >
                              <SelectTrigger className="bg-white border-amber-200 h-9">
                                <SelectValue placeholder="Always Visible" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="always">Always Visible</SelectItem>
                                {currentReqs.slice(0, idx).filter(q => q.name.trim()).map(prev => (
                                  <SelectItem key={prev.name + idx} value={prev.name}>
                                    {prev.name || 'Untitled'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {req.dependsOnQuestionId && (
                            <>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-amber-700 font-bold">Operator</Label>
                                <Select
                                  value={req.dependsOnOperator}
                                  onValueChange={v => updateCurrentReq(idx, { dependsOnOperator: v as LogicOperator })}
                                >
                                  <SelectTrigger className="bg-white border-amber-200 h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="not_equals">Not Equals</SelectItem>
                                    <SelectItem value="is_not_empty">Is Answered</SelectItem>
                                    <SelectItem value="is_empty">Is Empty</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {(req.dependsOnOperator === 'equals' || req.dependsOnOperator === 'not_equals') && (
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-amber-700 font-bold">Value</Label>
                                  <Input
                                    placeholder="e.g. Arriving by Air"
                                    value={req.dependsOnValue}
                                    onChange={e => updateCurrentReq(idx, { dependsOnValue: e.target.value })}
                                    className="bg-white border-amber-200 h-9"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-4 bg-white border rounded-xl shadow-sm space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">Document Links</Label>
                          <div className="space-y-2">
                            {req.documentIds.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {req.documentIds.map(docId => {
                                  const doc = kycDocuments.find(d => String(d.id) === String(docId))
                                  return doc ? (
                                    <Badge key={docId} variant="secondary" className="text-xs px-2 py-1">
                                      {doc.display_name || doc.name}
                                      <button
                                        onClick={() => {
                                          const current = req.documentIds;
                                          const updated = current.filter(id => id !== String(docId));
                                          updateCurrentReq(idx, { documentIds: updated });
                                        }}
                                        className="ml-1 hover:text-red-600"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ) : null
                                })}
                              </div>
                            )}
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
                                        <CommandItem key={doc.id} onSelect={() => {
                                          const current = req.documentIds;
                                          const updated = current.includes(String(doc.id))
                                            ? current.filter(id => id !== String(doc.id))
                                            : [...current, String(doc.id)];
                                          updateCurrentReq(idx, { documentIds: updated });
                                        }}>
                                          <Check className={cn("mr-2 h-4 w-4", req.documentIds.includes(String(doc.id)) ? "opacity-100" : "opacity-0")} />
                                          {doc.display_name || doc.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">Source Table</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
                                <span className="text-slate-400">
                                  {req.sourceTable ? tables.find(t => t.name === req.sourceTable)?.label || req.sourceTable : "Select source table..."}
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
                                          updateCurrentReq(idx, { sourceTable: table.name });
                                        }}>
                                          <Check className={cn("mr-2 h-4 w-4", req.sourceTable === table.name ? "opacity-100" : "opacity-0")} />
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

                        {req.sourceTable && (
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Linking Variable</Label>
                            <Select value={req.linkingVariable || ''} onValueChange={(value) => updateCurrentReq(idx, { linkingVariable: value || null })}>
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
                            <Select value={req.computedFunction || 'none'} onValueChange={(v) => {
                              const updates: Partial<RequirementForm> = { computedFunction: v };

                              if (v === 'none') {
                                updates.executionMode = '';
                              } else if (v.includes('Latest')) {
                                updates.executionMode = 'latest';
                              } else {
                                updates.executionMode = 'all';
                              }

                              updateCurrentReq(idx, updates);
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

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-purple-50/50 p-3 rounded-lg border border-purple-100 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox id={`webform-${idx}`} checked={req.hasWebForm} onCheckedChange={(c) => updateCurrentReq(idx, { hasWebForm: !!c })} />
                            <Label htmlFor={`webform-${idx}`} className="text-[10px] font-bold text-purple-700 flex items-center gap-1 uppercase tracking-tight">
                              <Zap className="h-3 w-3" /> Link Web Form
                            </Label>
                          </div>
                          {req.hasWebForm && (
                            <Select value={req.automationId} onValueChange={(v) => updateCurrentReq(idx, { automationId: v })}>
                              <SelectTrigger className="bg-white h-8 text-xs border-purple-200"><SelectValue placeholder="Select Logic..." /></SelectTrigger>
                              <SelectContent>
                                {automationTypes.map(auto => (
                                  <SelectItem key={auto.id} value={String(auto.id)}>{auto.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="bg-white p-3 rounded-lg border flex items-center gap-6">
                          <div className="flex items-center space-x-2">
                            <Checkbox id={`stage-req-${idx}`} checked={req.isStageDocument} onCheckedChange={(c) => updateCurrentReq(idx, { isStageDocument: !!c })} />
                            <Label htmlFor={`stage-req-${idx}`} className="text-[10px] font-bold uppercase text-slate-500">Stage Doc</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id={`template-req-${idx}`} checked={req.hasTemplate} onCheckedChange={(c) => updateCurrentReq(idx, { hasTemplate: !!c })} />
                            <Label htmlFor={`template-req-${idx}`} className="text-[10px] font-bold uppercase text-orange-600">Has Template</Label>
                          </div>
                        </div>
                      </div>

                      {req.hasTemplate && (
                        <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Settings2 className="h-4 w-4 text-orange-600" />
                              <Label className="text-sm font-medium text-orange-800">Template Selection</Label>
                              {loadingTemplates && <Loader2 className="h-4 w-4 animate-spin text-orange-600" />}
                            </div>

                            {templates.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs text-slate-600">Available templates for selected documents:</p>
                                <div className="grid gap-2">
                                  {templates.map(template => (
                                    <div key={template.id} className="flex items-center justify-between p-2 bg-white rounded border border-orange-200">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-orange-600" />
                                        <div>
                                          <p className="text-sm font-medium">{template.file_name}</p>
                                          <p className="text-xs text-slate-500">{template.file_type?.toUpperCase()}</p>
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          updateCurrentReq(idx, {
                                            selectedTemplateId: template.id,
                                            selectedTemplate: template
                                          });
                                          toast({
                                            title: "Template Selected",
                                            description: `${template.file_name} has been selected`
                                          });
                                        }}
                                      >
                                        Select
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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}

            <Button
              variant="outline"
              className="w-full border-dashed py-8 bg-white hover:bg-slate-50"
              onClick={() => {
                const newItem = DEFAULT_REQUIREMENT(activeSection);
                if (activeSection === 'general') setGeneralReqs([...generalReqs, newItem]);
                else if (activeSection === 'processing') setProcessingReqs([...processingReqs, newItem]);
                else if (activeSection === 'issuance') setIssuanceReqs([...issuanceReqs, newItem]);
                else setJobSpecificReqs([...jobSpecificReqs, newItem]);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Another Item
            </Button>
          </div>
        </div>

        <DialogFooter className="p-6 bg-white border-t gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[150px]">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              `Save & Merge Configuration`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}