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
import { Check, ChevronsUpDown, Database, Type, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
  NATIONALITY_TYPES, 
  QUALIFICATION_TYPES, 
  AGE_RANGE_TYPES, 
  DEPENDANT_RELATIONSHIPS,
  type NationalityType,
  type QualificationType,
  type AgeRangeType
} from "@/lib/constants/entity-types"

export type QuestionType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';

interface JobQuestion {
  id: string
  label: string
  type: string
  required: boolean
  options?: string[]
  linked_field_id?: string
  applicant_types?: string[]
  default_value?: string
  nationality?: NationalityType
  qualification?: QualificationType
  ageRange?: AgeRangeType
  dependantRelationships?: string[]
  order: number
}

interface EditJobQuestionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  question: JobQuestion | null
  onSave: (question: JobQuestion) => Promise<void>
  isSubmitting: boolean
  masterFields: any[]
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

export function EditJobQuestionDialog({ 
  isOpen, 
  onOpenChange, 
  question, 
  onSave, 
  isSubmitting,
  masterFields 
}: EditJobQuestionDialogProps) {
  const [formData, setFormData] = useState<Partial<JobQuestion>>({})
  const [manualOptions, setManualOptions] = useState("")

  useEffect(() => {
    if (isOpen && question) {
      setFormData({ ...question })
      // If we are editing, map options to manual input or tags if they exist
      setManualOptions("") 
    }
  }, [isOpen, question])

  const handleSave = () => {
    if (!formData.label || !question) return

    const updatedQuestion: JobQuestion = {
      ...question,
      ...formData as JobQuestion,
      // Logic for options is handled within the multi-tag UI in the return block
    }

    onSave(updatedQuestion)
  }

  const updateField = (key: keyof JobQuestion, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Question Label</Label>
              <Input 
                value={formData.label || ''} 
                onChange={e => updateField('label', e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Input Type</Label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => updateField('type', v)}
              >
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
          </div>

          {/* NEW DEFAULT VALUE FIELD */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
                <Type className="h-3.5 w-3.5 text-muted-foreground" />
                Default Answer Value
            </Label>
            <Input 
              placeholder="Enter a default value if applicable..."
              value={formData.default_value || ''} 
              onChange={e => updateField('default_value', e.target.value)} 
            />
            <p className="text-[11px] text-muted-foreground italic">
                This value will be pre-filled when a new job is created.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Applies To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex gap-1 flex-wrap">
                    {(formData.applicant_types || []).length > 0 
                      ? formData.applicant_types?.map(t => (
                        <Badge key={t} variant="secondary" className="capitalize text-[10px]">{t}</Badge>
                      )) 
                      : <span className="text-muted-foreground">All Applicants</span>}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search types..." />
                  <CommandList>
                    <CommandGroup>
                      {APPLICANT_OPTIONS.map((opt) => (
                        <CommandItem
                          key={opt.value}
                          onSelect={() => {
                            const current = formData.applicant_types || []
                            const updated = current.includes(opt.value) 
                              ? current.filter(t => t !== opt.value) 
                              : [...current, opt.value]
                            updateField('applicant_types', updated)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", (formData.applicant_types || []).includes(opt.value) ? "opacity-100" : "opacity-0")} />
                          {opt.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {(formData.type === 'select' || formData.type === 'multiselect') && (
            <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
               <div className="space-y-2">
                  <Label className="text-xs text-blue-600 font-semibold flex items-center gap-2">
                      <Database className="h-3 w-3" /> Link Master Field (Overrides manual options)
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between bg-white",
                          !formData.linked_field_id && "text-muted-foreground"
                        )}
                      >
                        {formData.linked_field_id
                          ? masterFields.find(mf => String(mf.id) === String(formData.linked_field_id))?.label
                          : "Select master field..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search master fields..." />
                        <CommandList>
                          <CommandEmpty>No master field found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => updateField('linked_field_id', null)}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !formData.linked_field_id ? "opacity-100" : "opacity-0")} />
                              -- None (Use Manual Options) --
                            </CommandItem>
                            {masterFields.map((mf) => (
                              <CommandItem
                                key={mf.id}
                                value={mf.label}
                                onSelect={() => updateField('linked_field_id', String(mf.id))}
                              >
                                <Check className={cn("mr-2 h-4 w-4", String(formData.linked_field_id) === String(mf.id) ? "opacity-100" : "opacity-0")} />
                                {mf.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
               </div>

               {!formData.linked_field_id && (
                 <div className="space-y-2">
                    <Label>Custom Options</Label>
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            placeholder="Add an option..."
                            value={manualOptions}
                            onChange={e => setManualOptions(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && manualOptions.trim()) {
                                    e.preventDefault();
                                    const newOption = manualOptions.trim();
                                    const currentOptions = formData.options || [];
                                    if (!currentOptions.includes(newOption)) {
                                        updateField('options', [...currentOptions, newOption]);
                                        setManualOptions('');
                                    }
                                }
                            }}
                            className="flex-1 bg-white"
                        />
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                if (manualOptions.trim()) {
                                    const newOption = manualOptions.trim();
                                    const currentOptions = formData.options || [];
                                    if (!currentOptions.includes(newOption)) {
                                        updateField('options', [...currentOptions, newOption]);
                                        setManualOptions('');
                                    }
                                }
                            }}
                        >
                            Add
                        </Button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                        {formData.options?.map((option, i) => (
                            <Badge key={i} variant="secondary" className="flex items-center gap-1">
                                {option}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = [...(formData.options || [])];
                                        next.splice(i, 1);
                                        updateField('options', next);
                                    }}
                                    className="ml-1 rounded-full hover:bg-gray-300 p-0.5"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>
               )}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="req-check" 
              checked={formData.required} 
              onCheckedChange={(c) => updateField('required', c)}
            />
            <Label htmlFor="req-check">This question is mandatory</Label>
          </div>

          {/* Additional Requirement Fields */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Nationality</Label>
              <Select value={formData.nationality || 'any'} onValueChange={(v: NationalityType | 'any') => updateField('nationality', v === 'any' ? undefined : v)}>
                <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="Any nationality..." /></SelectTrigger>
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
              <Select value={formData.ageRange || 'any'} onValueChange={(v: AgeRangeType | 'any') => updateField('ageRange', v === 'any' ? undefined : v)}>
                <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="Any age..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Age</SelectItem>
                  {AGE_RANGE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {(formData.applicant_types || []).includes('dependent') && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Dependant Relationship</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between bg-white h-9 text-xs">
                      <div className="flex gap-1 flex-wrap">
                        {(formData.dependantRelationships && formData.dependantRelationships.length > 0) 
                          ? formData.dependantRelationships.map(r => (
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
                                const current = formData.dependantRelationships || []
                                const updated = current.includes(rel.value) 
                                  ? current.filter(r => r !== rel.value) 
                                  : [...current, rel.value]
                                updateField('dependantRelationships', updated)
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", (formData.dependantRelationships || []).includes(rel.value) ? "opacity-100" : "opacity-0")} />
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSubmitting}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}