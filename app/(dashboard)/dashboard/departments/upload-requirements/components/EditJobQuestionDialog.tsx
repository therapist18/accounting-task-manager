// @ts-nocheck
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, ChevronsUpDown, Database, X, Split, ArrowDownRight, Folder, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
  NATIONALITY_TYPES, 
  AGE_RANGE_TYPES, 
  type NationalityType,
  type AgeRangeType,
  ENTITY_TYPES,
  type EntityType
} from "@/lib/constants/entity-types"

export type LogicOperator = 'equals' | 'not_equals' | 'is_not_empty' | 'is_empty';

interface JobQuestion {
  id: string
  label: string
  category?: string 
  type: string
  required: boolean
  options?: string[]
  linked_field_id?: string
  entityTypes?: EntityType[]
  default_value?: string
  nationality?: NationalityType
  ageRange?: AgeRangeType
  order: number
  depends_on?: {
    id: string
    operator: LogicOperator
    value: string
  } | null
}

interface EditJobQuestionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  question: JobQuestion | null
  allQuestions?: JobQuestion[] 
  onSave: (question: JobQuestion) => Promise<void>
  isSubmitting: boolean
  masterFields: any[]
}

export function EditJobQuestionDialog({ 
  isOpen, 
  onOpenChange, 
  question, 
  allQuestions = [], 
  onSave, 
  isSubmitting,
  masterFields 
}: EditJobQuestionDialogProps) {
  const [formData, setFormData] = useState<Partial<JobQuestion>>({})
  const [manualOptions, setManualOptions] = useState("")

  useEffect(() => {
    if (isOpen && question) {
      setFormData({ 
        ...question,
        depends_on_id: question.depends_on?.id,
        depends_on_operator: question.depends_on?.operator || 'equals',
        depends_on_value: question.depends_on?.value || ''
      })
      setManualOptions("") 
    }
  }, [isOpen, question])

  const handleSave = () => {
    if (!formData.label || !question) return

    const updatedQuestion: JobQuestion = {
      ...formData as JobQuestion,
      depends_on: formData.depends_on_id ? {
        id: formData.depends_on_id,
        operator: formData.depends_on_operator || 'equals',
        value: formData.depends_on_value || ''
      } : null
    }

    // Clean up temporary flat fields used for UI state
    delete updatedQuestion.depends_on_id;
    delete updatedQuestion.depends_on_operator;
    delete updatedQuestion.depends_on_value;

    onSave(updatedQuestion)
  }

  const updateField = (key: keyof JobQuestion, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  // Only show questions that are NOT the current one and have a label.
  // We also sort them by order to make the dropdown logical.
  const availableParents = (allQuestions || [])
    .filter(q => q.id !== question?.id && q.label)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            Edit Question Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-blue-600 font-bold uppercase text-[10px]">
                <Folder className="h-3.5 w-3.5" /> Section / Category
              </Label>
              <Input 
                placeholder="e.g. Arrival Details"
                value={formData.category || ''} 
                onChange={e => updateField('category', e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Question Label</Label>
              <Input 
                placeholder="e.g. Select Airline"
                value={formData.label || ''} 
                onChange={e => updateField('label', e.target.value)} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500">
              <Users className="h-3.5 w-3.5" /> Applies To (Entity Types)
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-auto min-h-10 bg-white">
                  <div className="flex gap-1 flex-wrap p-1">
                    {(formData.entityTypes || []).length > 0 ? (
                      formData.entityTypes?.map(t => (
                        <Badge key={t} variant="secondary" className="capitalize text-[10px]">{t}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs font-normal">Select applicable entity types...</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search roles..." />
                  <CommandList>
                    <CommandEmpty>No role found.</CommandEmpty>
                    <CommandGroup>
                      {ENTITY_TYPES.map((opt) => (
                        <CommandItem
                          key={opt.value}
                          onSelect={() => {
                            const current = formData.entityTypes || [];
                            const updated = current.includes(opt.value) 
                              ? current.filter(t => t !== opt.value) 
                              : [...current, opt.value];
                            updateField('entityTypes', updated);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", (formData.entityTypes || []).includes(opt.value) ? "opacity-100" : "opacity-0")} />
                          {opt.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Input Type</Label>
              <Select value={formData.type} onValueChange={(v) => updateField('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Default Answer Value</Label>
                <Input value={formData.default_value || ''} onChange={e => updateField('default_value', e.target.value)} placeholder="None" />
            </div>
          </div>

          {/* VISIBILITY & DEPENDENCY LOGIC SECTION */}
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800">
                    <Split className="h-4 w-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Visibility & Dependency Logic</span>
                </div>
                {formData.depends_on_id && <Badge className="bg-amber-200 text-amber-800 border-none text-[10px] font-black">CONDITIONAL</Badge>}
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">Show if this question...</Label>
                    <Select 
                        value={formData.depends_on_id || "always"} 
                        onValueChange={v => updateField('depends_on_id', v === "always" ? undefined : v)}
                    >
                        <SelectTrigger className="bg-white border-amber-200 h-10">
                            <SelectValue placeholder="Always Visible" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="always">Always Visible</SelectItem>
                            {availableParents.map(q => (
                                <SelectItem key={q.id} value={q.id}>
                                  {q.category ? `[${q.category}] ` : ''}{q.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {formData.depends_on_id && (
                    <>
                    <div className="space-y-1.5 animate-in slide-in-from-left-2">
                        <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">Operator</Label>
                        <Select 
                            value={formData.depends_on_operator || 'equals'} 
                            onValueChange={v => updateField('depends_on_operator', v)}
                        >
                            <SelectTrigger className="bg-white border-amber-200 h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Does Not Equal</SelectItem>
                                <SelectItem value="is_not_empty">Has Any Answer</SelectItem>
                                <SelectItem value="is_empty">Is Unanswered</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {(formData.depends_on_operator === 'equals' || formData.depends_on_operator === 'not_equals') && (
                        <div className="space-y-1.5 animate-in slide-in-from-left-2">
                            <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">Value to Match</Label>
                            <div className="flex items-center gap-2">
                                <ArrowDownRight className="h-4 w-4 text-amber-300 shrink-0" />
                                <Input 
                                    placeholder="Exact value..." 
                                    value={formData.depends_on_value || ''}
                                    onChange={e => updateField('depends_on_value', e.target.value)}
                                    className="bg-white border-amber-200 h-10"
                                />
                            </div>
                        </div>
                    )}
                    </>
                )}
            </div>
          </div>

          {/* MASTER FIELDS & CUSTOM OPTIONS */}
          {(formData.type === 'select' || formData.type === 'multiselect') && (
            <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
               <div className="space-y-2">
                  <Label className="text-xs text-blue-600 font-semibold flex items-center gap-2">
                      <Database className="h-3 w-3" /> Link Master Field (Dynamic Data)
                  </Label>
                  <Select 
                    value={formData.linked_field_id || "none"} 
                    onValueChange={v => updateField('linked_field_id', v === "none" ? null : v)}
                  >
                    <SelectTrigger className="bg-white h-10"><SelectValue placeholder="Select master field..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">-- Manual Options Only --</SelectItem>
                        {masterFields.map(mf => (
                            <SelectItem key={mf.id} value={String(mf.id)}>{mf.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
               </div>

               {!formData.linked_field_id && (
                 <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-500">Custom Options</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Add an option..."
                            value={manualOptions}
                            onChange={e => setManualOptions(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && manualOptions.trim()) {
                                    e.preventDefault();
                                    updateField('options', [...(formData.options || []), manualOptions.trim()]);
                                    setManualOptions('');
                                }
                            }}
                            className="bg-white h-10"
                        />
                        <Button type="button" onClick={() => {
                            if (manualOptions.trim()) {
                                updateField('options', [...(formData.options || []), manualOptions.trim()]);
                                setManualOptions('');
                            }
                        }}>Add</Button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                        {formData.options?.map((option, i) => (
                            <Badge key={`${option}-${i}`} variant="secondary" className="pl-2">
                                {option}
                                <button type="button" onClick={() => {
                                    const next = [...(formData.options || [])];
                                    next.splice(i, 1);
                                    updateField('options', next);
                                }} className="ml-1 hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
                            </Badge>
                        ))}
                    </div>
                </div>
               )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Nationality Filter</Label>
                  <Select value={formData.nationality || 'any'} onValueChange={v => updateField('nationality', v === 'any' ? undefined : v)}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="any">Any Nationality</SelectItem>
                          {NATIONALITY_TYPES.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
              <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Age Range Filter</Label>
                  <Select value={formData.ageRange || 'any'} onValueChange={v => updateField('ageRange', v === 'any' ? undefined : v)}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="any">Any Age</SelectItem>
                          {AGE_RANGE_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-100 p-4 rounded-lg border border-slate-200">
            <Checkbox id="req-check" checked={formData.required} onCheckedChange={(c) => updateField('required', !!c)} />
            <Label htmlFor="req-check" className="font-bold cursor-pointer text-slate-700">This question is mandatory for the applicant</Label>
          </div>

        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="px-8">Cancel</Button>
          <Button onClick={handleSave} disabled={isSubmitting} className="px-8">Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}