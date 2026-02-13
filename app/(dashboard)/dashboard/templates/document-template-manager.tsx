// @ts-nocheck
"use client";
import React, { useRef, useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, PlusCircle, Trash2, FileText, Pencil, Save, RefreshCw, ChevronDown, Check, ChevronsUpDown, Link2, X, Search, View, Download, UserCog, Users, User, Code, Hash, Database, Sparkles, HelpCircle, Layers, Info, ArrowUp, ArrowDown } from "lucide-react";
import { DocxLivePreview } from "@/components/DocxLivePreview";
import { DocumentTemplate as BaseDocumentTemplate } from "./types";
import { TableHeader, Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import supabase from "@/lib/supabase/client";
import TemplateEditor from "@/components/TemplateEditor";
import { Textarea } from "@/components/ui/textarea";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import InspectModule from 'docxtemplater/js/inspect-module';
import { renderAsync } from "docx-preview";
import { EntityType, ENTITY_TYPES, DEPENDANT_RELATIONSHIPS } from "@/lib/constants/entity-types";
import { ScrollArea } from "@/components/ui/scroll-area";

const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
interface DocumentTemplate extends BaseDocumentTemplate {
  content?: string;
  isDirty?: boolean;
  entity_types?: EntityType[];
}

interface JobField {
  id: number;
  field_key: string;
  label: string;
  sources?: Array<{
    path: string;
    table: string;
    priority: number;
    source_type?: string;
  }>;
}

interface JobQuestion {
  id: string;
  label: string;
  type: string;
}

interface Requirement {
  id: string;
  label: string;
  document_ids?: string[];
}

const sanitizeClassName = (cls: string | undefined): string => {
  if (!cls) return '';
  return String(cls).replace(/\s+/g, ' ').trim();
};

interface DocumentTemplateManagerProps {
  document: { id: string; name: string; display_name?: string; };
  initialTemplates?: DocumentTemplate[];
  isOpen: boolean;
  onClose: () => void;
  onTemplateUpdate: () => void;
  jobLevel?: {
    level: number;
    department_id?: number | null;
    subdepartment_id?: number | null;
    class_id?: number | null;
    subclass_id?: number | null;
  } | null;
  className?: string; // Add className to props
  selectedBank?: { bank_id: string; bank_name: string } | null;
}

const PLACEHOLDER_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'ordinal', label: 'Ordinal (1st, 2nd, 3rd...)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'array', label: 'Array/List' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'boolean', label: 'Boolean/Checkbox' },
  { value: 'image', label: 'Image' },
  { value: 'document_checklist', label: 'Document Checklist' }, // NEW
];

// Update the Placeholder type to handle hierarchy
type ConditionalCondition = {
  tag: string;           // e.g., 'child_kenyan_id_no'
  label: string;         // e.g., 'Kenyan ID No: '
  master_field_id?: number; // The specific master field for this condition
};

type BooleanCondition = {
  tag: string;              // e.g., 'is_male', 'daily_frequency'
  label: string;            // Display text: 'Male', 'Daily'
  master_field_id?: number; // Optional - for DB-driven fields
  comparison?: {            // For DB fields
    field: string;          // e.g., 'gender'
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;          // e.g., 'Male'
  };
};

type Placeholder = {
  id: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'array' | 'conditional' | 'image' | 'boolean' | 'ordinal' | 'document_checklist';
  array_direction?: 'horizontal' | 'vertical';
  boolean_conditions?: BooleanCondition[];
  boolean_type?: 'single' | 'multiple';
  required: boolean;
  options?: string[];
  entity_type: EntityType[];
  parent_name?: string;
  is_block_start?: boolean;
  director_type?: 'all' | 'primary';
  dependant_relationship?: string[];
  conditions?: ConditionalCondition[];
  ordinal_format?: 'number' | 'word' | 'custom';
  custom_ordinal_format?: string;
  source_logic?: 'all' | 'priority'
  linked_document_ids?: string[];
  checklist_display_format?: 'bullets' | 'checkboxes' | 'table';
  // NEW: Data source configuration
  checklist_data_source?: {
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string; // e.g., 'company_id', 'director_id', 'individual_id'
    document_id_field: string; // e.g., 'kyc_document_id', 'document_id'
  };
  // NEW: Image size properties
  image_width?: string;
  image_height?: string;
  is_ai_generated?: boolean;
  ai_prompt?: string;
   master_field_ids?: number[];
  linked_job_question_ids?: string[]; // Plural
  linked_requirement_ids?: string[]; 
  default_value?: string;
};

const getCleanText = (str: string) => str.replace(/<[^>]+>/g, '');
function MasterFieldPicker({
  masterFields,
  selectedFieldIds = [],
  onSelect,
  onRemove,
  onClear,
}: {
  masterFields: JobField[];
  selectedFieldIds?: number[];
  onSelect: (fieldId: number) => void;
  onRemove: (fieldId: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedFields = useMemo(() =>
    masterFields.filter(f => selectedFieldIds.includes(f.id)),
    [masterFields, selectedFieldIds]);

  const filteredFields = useMemo(() => {
    if (!search) return masterFields;
    const searchLower = search.toLowerCase();
    return masterFields.filter(field =>
      field.label.toLowerCase().includes(searchLower) ||
      field.field_key.toLowerCase().includes(searchLower)
    );
  }, [masterFields, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedFields.length > 0
                  ? `${selectedFields.length} field${selectedFields.length > 1 ? 's' : ''} selected`
                  : "Select master fields..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search master fields..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No master fields found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredFields.map((field) => {
                    const isSelected = selectedFieldIds.includes(field.id);
                    return (
                      <CommandItem
                        key={field.id}
                        value={field.label}
                        onSelect={() => {
                          if (isSelected) {
                            onRemove(field.id);
                          } else {
                            onSelect(field.id);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div>
                            <div className="font-medium">{field.label}</div>
                            <div className="text-xs text-muted-foreground">{field.field_key}</div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedFields.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedFields.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedFields.map(field => (
            <Badge
              key={field.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5"
            >
              <Link2 className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{field.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(field.id);
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function JobQuestionPicker({
  jobQuestions,
  selectedQuestionId,
  onSelect,
  onClear,
}: {
  jobQuestions: JobQuestion[];
  selectedQuestionId?: string;
  onSelect: (question: JobQuestion) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedQuestion = useMemo(() =>
    jobQuestions.find(q => q.id === selectedQuestionId),
    [jobQuestions, selectedQuestionId]);

  const filteredQuestions = useMemo(() => {
    if (!search) return jobQuestions;
    const searchLower = search.toLowerCase();
    return jobQuestions.filter(question =>
      question.label.toLowerCase().includes(searchLower) ||
      question.type.toLowerCase().includes(searchLower)
    );
  }, [jobQuestions, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedQuestion
                  ? selectedQuestion.label
                  : "Select job question..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search job questions..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No job questions found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredQuestions.map((question) => (
                    <CommandItem
                      key={question.id}
                      value={question.label}
                      onSelect={() => {
                        onSelect(question);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedQuestionId === question.id ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                          {selectedQuestionId === question.id && <Check className="h-3 w-3" />}
                        </div>
                        <div>
                          <div className="font-medium">{question.label}</div>
                          <div className="text-xs text-muted-foreground capitalize">{question.type}</div>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedQuestion && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedQuestion && (
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 pr-1.5 bg-purple-50 text-purple-700 border-purple-200"
          >
            <HelpCircle className="h-3 w-3" />
            <span className="max-w-[200px] truncate">{selectedQuestion.label}</span>
          </Badge>
        </div>
      )}
    </div>
  );
}

function RequirementPicker({
  requirements,
  selectedRequirementId,
  onSelect,
  onClear,
}: {
  requirements: Requirement[];
  selectedRequirementId?: string;
  onSelect: (requirement: Requirement) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedRequirement = useMemo(() =>
    requirements.find(r => r.id === selectedRequirementId),
    [requirements, selectedRequirementId]);

  const filteredRequirements = useMemo(() => {
    if (!search) return requirements;
    const searchLower = search.toLowerCase();
    return requirements.filter(requirement =>
      requirement.label.toLowerCase().includes(searchLower)
    );
  }, [requirements, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedRequirement
                  ? selectedRequirement.label
                  : "Select requirement..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search requirements..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No requirements found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredRequirements.map((requirement) => (
                    <CommandItem
                      key={requirement.id}
                      value={requirement.label}
                      onSelect={() => {
                        onSelect(requirement);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedRequirementId === requirement.id ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                          {selectedRequirementId === requirement.id && <Check className="h-3 w-3" />}
                        </div>
                        <div>
                          <div className="font-medium">{requirement.label}</div>
                          {requirement.document_ids && requirement.document_ids.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {requirement.document_ids.length} document(s)
                            </div>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedRequirement && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedRequirement && (
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 pr-1.5 bg-green-50 text-green-700 border-green-200"
          >
            <Database className="h-3 w-3" />
            <span className="max-w-[200px] truncate">{selectedRequirement.label}</span>
          </Badge>
        </div>
      )}
    </div>
  );
}

function PlaceholderSourceManager({
  placeholder,
  masterFields,
  jobQuestions,
  requirements,
  onUpdate,
  onRemove
}: {
  placeholder: Placeholder;
  masterFields: JobField[];
  jobQuestions: JobQuestion[];
  requirements: Requirement[];
  onUpdate: (updates: Partial<Placeholder>) => void;
  onRemove: (type: 'db' | 'job' | 'req', id: any) => void;
}) {
  const moveItem = (listKey: 'master_field_ids' | 'linked_job_question_ids' | 'linked_requirement_ids', index: number, direction: 'up' | 'down') => {
    const newList = [...(placeholder[listKey] || [])] as any[];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    onUpdate({ [listKey]: newList });
  };

  const totalSources = (placeholder.master_field_ids?.length || 0) + 
                       (placeholder.linked_job_question_ids?.length || 0) + 
                       (placeholder.linked_requirement_ids?.length || 0);

  if (totalSources === 0) return null;

  return (
    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner mb-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
          <Layers className="h-3 w-3" /> Active Sources & Priority
        </Label>
        {totalSources > 1 && (
          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border shadow-sm">
            <Label className="text-[9px] font-bold text-slate-400 uppercase">Logic:</Label>
            <Select 
              value={placeholder.source_logic || 'priority'} 
              onValueChange={(v: 'all' | 'priority') => onUpdate({ source_logic: v })}
            >
              <SelectTrigger className="h-6 w-[130px] text-[10px] border-none shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Fallback (Priority)</SelectItem>
                <SelectItem value="all">Return All (Merge)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {/* Database Fields */}
        {placeholder.master_field_ids?.map((id, idx) => (
          <div key={`db-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-blue-600" onClick={() => moveItem('master_field_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3"/></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-blue-600" onClick={() => moveItem('master_field_ids', idx, 'down')} disabled={idx === placeholder.master_field_ids.length - 1}><ArrowDown className="h-3 w-3"/></Button>
            </div>
            <Database className="h-3.5 w-3.5 text-blue-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{masterFields.find(f => f.id === id)?.label || id}</p>
              <p className="text-[9px] text-blue-500/70 font-mono">DB Field</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('db', id)}><X className="h-4 w-4"/></Button>
          </div>
        ))}

        {/* Job Questions */}
        {placeholder.linked_job_question_ids?.map((id, idx) => (
          <div key={`job-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-purple-600" onClick={() => moveItem('linked_job_question_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3"/></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-purple-600" onClick={() => moveItem('linked_job_question_ids', idx, 'down')} disabled={idx === placeholder.linked_job_question_ids.length - 1}><ArrowDown className="h-3 w-3"/></Button>
            </div>
            <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{jobQuestions.find(q => q.id === id)?.label || id}</p>
              <p className="text-[9px] text-purple-500/70 font-mono">Job Question</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('job', id)}><X className="h-4 w-4"/></Button>
          </div>
        ))}

        {/* Requirements */}
        {placeholder.linked_requirement_ids?.map((id, idx) => (
          <div key={`req-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-green-600" onClick={() => moveItem('linked_requirement_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3"/></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-green-600" onClick={() => moveItem('linked_requirement_ids', idx, 'down')} disabled={idx === placeholder.linked_requirement_ids.length - 1}><ArrowDown className="h-3 w-3"/></Button>
            </div>
            <FileText className="h-3.5 w-3.5 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{requirements.find(r => r.id === id)?.label || id}</p>
              <p className="text-[9px] text-green-500/70 font-mono">Requirement</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('req', id)}><X className="h-4 w-4"/></Button>
          </div>
        ))}
      </div>

      {placeholder.source_logic === 'priority' && totalSources > 1 && (
        <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg flex gap-2">
          <Info className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-[10px] text-blue-700 leading-tight">
            <strong>Priority Mode:</strong> The system will try to find a value from the top source first, falling back to the next if empty.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DocumentTemplateManager({
  document,
  isOpen,
  onClose,
  initialTemplates = [],
  onTemplateUpdate,
  jobLevel = null,
  selectedBank = null,
  className = ''
}: DocumentTemplateManagerProps) {
  const containerClassName = `document-template-manager ${sanitizeClassName(className)}`.trim();
  const safeJobLevel = useMemo(() => {
    if (!jobLevel) {
      return {
        level: 0,
        department_id: null,
        subdepartment_id: null,
        class_id: null,
        subclass_id: null
      };
    }
    return jobLevel;
  }, [jobLevel]);
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaceholderFormOpen, setIsPlaceholderFormOpen] = useState(false);
  const [isEditingPlaceholder, setIsEditingPlaceholder] = useState<number | null>(null);
  const [newPlaceholder, setNewPlaceholder] = useState<Placeholder>({
    id: '',
    name: '',
    description: '',
    type: 'text',
    required: false,
    entity_type: [],
    default_value: '',
    array_direction: 'vertical',
    checklist_data_source: {
      table: 'acc_portal_kyc_uploads',
      linking_variable: 'company_id',
      document_id_field: 'kyc_document_id'
    },
    image_width: '',
    image_height: '',
    linked_job_question_id: undefined,
    linked_requirement_id: undefined
  });
  const [directorType, setDirectorType] = useState<'all' | 'primary'>('all');
  const [dependantRelationship, setDependantRelationship] = useState<string[]>([]);
  const [templateFiles, setTemplateFiles] = useState<Map<string, File>>(new Map());
  const [masterFields, setMasterFields] = useState<JobField[]>([]);
  const [jobQuestions, setJobQuestions] = useState<JobQuestion[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [placeholderSearch, setPlaceholderSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTemplate = (currentTemplateIndex !== null && templates[currentTemplateIndex]) ? templates[currentTemplateIndex] : null;
  const masterFieldMap = useMemo(() => new Map(masterFields.map(f => [f.id, f.label])), [masterFields]);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<Array<{ id: string; display_name: string; name: string }>>([]);

  // Extract scalar fields from conditional template
  const extractScalarFields = (templateContent: string): string[] => {
    // Simple regex to match {#field_name} patterns
    const scalarFieldRegex = /\{#([^{}]+)\}/g;
    const fields: string[] = [];
    let match;

    console.log('[SCALAR FIELD DETECTION] Template content:', templateContent);
    console.log('[SCALAR FIELD DETECTION] Regex pattern:', scalarFieldRegex);

    while ((match = scalarFieldRegex.exec(templateContent)) !== null) {
      fields.push(match[1]); // Extracts field name between {# and }
      console.log('[SCALAR FIELD DETECTION] Found scalar field:', match[1]);
    }

    console.log('[SCALAR FIELD DETECTION] Extracted fields:', fields);
    return fields;
  };

  // Handle auto-linking of scalar fields to master fields
  const handleAutoLinkFields = async (scalarFields: string[]) => {
    const linkingPromises = scalarFields.map(async (fieldName) => {
      // Find existing master field
      const existingField = masterFields.find(f =>
        f.field_key === fieldName ||
        f.label.toLowerCase().includes(fieldName.toLowerCase())
      );

      if (existingField) {
        return { fieldName, masterFieldId: existingField.id, alreadyLinked: true };
      } else {
        // Create new master field prompt
        return { fieldName, masterFieldId: null, needsCreation: true };
      }
    });

    const linkingResults = await Promise.all(linkingPromises);

    // Process results
    const needsCreation = linkingResults.filter(r => r.needsCreation);
    const alreadyLinked = linkingResults.filter(r => r.alreadyLinked);

    if (needsCreation.length > 0) {
      const fieldsToCreate = needsCreation.map(r => r.fieldName).join(', ');
      toast({
        title: "Master Fields Required",
        description: `The following master fields need to be created:\n\n${fieldsToCreate}\n\nPlease create them in the Master Fields section first.`,
        variant: "destructive",
        duration: 8000,
        action: (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAutoLinkFields(scalarFields)}
            >
              Link All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkPrompt(false)}
            >
              Skip
            </Button>
          </div>
        ),
      });
      return;
    }

    if (alreadyLinked.length > 0) {
      const linkedFields = alreadyLinked.map(r => r.fieldName).join(', ');
      const masterFieldIds = alreadyLinked.map(r => r.masterFieldId).filter(id => id !== null);

      // Add the linked fields to the placeholder
      setNewPlaceholder(prev => ({
        ...prev,
        master_field_ids: [...(prev.master_field_ids || []), ...masterFieldIds]
      }));

      toast({
        title: "Fields Linked Successfully",
        description: `Successfully linked ${linkedFields} to existing master fields.`,
        duration: 3000,
      });
    }

    setShowLinkPrompt(false);
  };

  const [panelsVisible, setPanelsVisible] = useState({
    left: true,
    middle: true,
    right: true,
  });

  // Update the document preview effect
  useEffect(() => {
    const loadDocumentPreview = async () => {
      if (!currentTemplate?.file_path) {
        setDocPreviewUrl(null);
        return;
      }

      try {
        // Get the public URL for the file
        const { data: { publicUrl } } = supabase.storage
          .from('templates')
          .getPublicUrl(currentTemplate.file_path);

        // Use the public URL in the Office Online Viewer
        const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
        setDocPreviewUrl(viewerUrl);

      } catch (error) {
        console.error('Error loading document:', error);
        setDocPreviewUrl(null);
        toast({
          title: 'Preview Error',
          description: 'Could not load document preview. The file may not be accessible.',
          variant: 'destructive'
        });
      }
    };

    loadDocumentPreview();
  }, [currentTemplate?.file_path]);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const { data, error } = await supabase
          .from('acc_portal_kyc')
          .select('id, name, display_name, category')
          .order('display_name');

        if (error) throw error;
        setAvailableDocuments(data || []);
      } catch (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: 'Could not load documents',
          description: error.message,
          variant: 'destructive'
        });
      }
    };

    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen]);

  const togglePanel = (panel: 'left' | 'middle' | 'right') => {
    const currentlyVisibleCount = Object.values(panelsVisible).filter(Boolean).length;
    if (currentlyVisibleCount === 1 && panelsVisible[panel]) {
      toast({ title: "Cannot hide the last visible panel." });
      return;
    }
    setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const panelClasses = useMemo(() => {
    const { left, middle, right } = panelsVisible;
    const visibleCount = [left, middle, right].filter(Boolean).length;

    // Ensure no whitespace in class names
    const getClass = (className: string) => className.replace(/\s+/g, ' ').trim();

    if (visibleCount === 3) return {
      left: getClass('col-span-3'),
      middle: getClass('col-span-5'),
      right: getClass('col-span-4')
    };
    if (visibleCount === 2) {
      if (!left) return {
        left: getClass('hidden'),
        middle: getClass('col-span-7'),
        right: getClass('col-span-5')
      };
      if (!middle) return {
        left: getClass('hidden'),
        middle: getClass('hidden'),
        right: getClass('col-span-12')
      };
      if (!right) return {
        left: getClass('col-span-4'),
        middle: getClass('col-span-8'),
        right: getClass('hidden')
      };
    }
    if (visibleCount === 1) {
      if (left) return {
        left: getClass('col-span-12'),
        middle: getClass('hidden'),
        right: getClass('hidden')
      };
      if (middle) return {
        left: getClass('hidden'),
        middle: getClass('col-span-12'),
        right: getClass('hidden')
      };
      if (right) return {
        left: getClass('hidden'),
        middle: getClass('hidden'),
        right: getClass('col-span-12')
      };
    }
    return {
      left: getClass('hidden'),
      middle: getClass('hidden'),
      right: getClass('hidden')
    };
  }, [panelsVisible]);


  const filteredPlaceholders = useMemo(() => {
    if (!currentTemplate?.placeholders) return [];
    if (!placeholderSearch) return currentTemplate.placeholders;
    const searchLower = placeholderSearch.toLowerCase();
    return currentTemplate.placeholders.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.type.toLowerCase().includes(searchLower) ||
      (Array.isArray(p.entity_type) ? p.entity_type : [p.entity_type]).some(et => et?.toLowerCase().includes(searchLower)) ||
      (p.master_field_ids || []).some(id =>
        masterFieldMap.get(id)?.toLowerCase().includes(searchLower)
      ) ||
      (p.linked_job_question_id && jobQuestions.find(q => q.id === p.linked_job_question_id)?.label.toLowerCase().includes(searchLower)) ||
      (p.linked_requirement_id && requirements.find(r => r.id === p.linked_requirement_id)?.label.toLowerCase().includes(searchLower))
    );
  }, [currentTemplate?.placeholders, placeholderSearch, masterFieldMap, jobQuestions, requirements]);

  const fetchMasterFields = async () => {
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('*').order('label');
      if (error) throw error;
      setMasterFields(data || []);
    } catch (error) {
      console.error('Error fetching master fields:', error);
      toast({ title: 'Could not load master fields', variant: 'destructive' });
    }
  };

  const fetchJobQuestions = async () => {
    try {
      // Fetch job-specific questions based on job level
      if (jobLevel?.level) {
        // Create complete job level object for query
        const jobLevelObject = {
          level: jobLevel.level,
          department_id: jobLevel.department_id,
          subdepartment_id: jobLevel.subdepartment_id,
          class_id: jobLevel.class_id,
          subclass_id: jobLevel.subclass_id
        };

        // Use filter instead of eq for complex objects
        const { data, error } = await supabase
          .from('tm_class_requirements')
          .select('*')
          .filter('job_level', 'eq', JSON.stringify(jobLevelObject))
          .maybeSingle();

        if (error) {
          console.error('Error fetching job-specific questions:', error);
        } else {
          setJobQuestions(data?.job_specific_questions || []);
          setRequirements(data?.requirements || []);
        }
      } else {
        // Fallback: fetch all questions
        const { data, error } = await supabase.from('tm_class_requirements').select('job_specific_questions, requirements');
        if (error) throw error;
        
        const allQuestions = data?.flatMap(r => r.job_specific_questions || []) || [];
        const uniqueQuestions = Array.from(new Map(allQuestions.map(q => [q.label, q])).values());
        setJobQuestions(uniqueQuestions);
        
        const allRequirements = data?.flatMap(r => r.requirements || []) || [];
        const uniqueRequirements = Array.from(new Map(allRequirements.map(r => [r.label, r])).values());
        setRequirements(uniqueRequirements);
      }
    } catch (error) {
      console.error('Error fetching job questions:', error);
      toast({ title: 'Could not load job questions', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMasterFields();
      fetchJobQuestions();
      const initialData = initialTemplates?.map(t => ({
        ...t,
        name: t.file_name,
        entity_types: Array.isArray(t.entity_types) ? t.entity_types : []
      })) || [];
      setTemplates(initialData.map(t => ({ ...t, isDirty: false })));
      setCurrentTemplateIndex(initialData.length > 0 ? 0 : null);
    } else {
      setTemplates([]);
      setCurrentTemplateIndex(null);
    }
  }, [isOpen, initialTemplates, jobLevel]);

  const validateTemplate = async (file: File): Promise<boolean> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // Check if the file contains the required document.xml
      const fileList = Object.keys(zip.files);
      const hasDocumentXml = fileList.some(file =>
        file.startsWith('word/document') && file.endsWith('.xml')
      );

      if (!hasDocumentXml) {
        throw new Error('The uploaded file is not a valid Word document (missing document.xml)');
      }

      return true;
    } catch (error) {
      console.error('Template validation failed:', error);
      return false;
    }
  };

  const extractPlaceholders = async (source: { type: 'file', content: File } | { type: 'text', content: string }): Promise<Placeholder[]> => {
    console.group(`%c[SCANNER] Target: ${source.type}`, "color: #2563eb; font-weight: bold;");
    setIsProcessing(true);

    try {
      let rawTextContent = "";

      if (source.type === 'file') {
        const arrayBuffer = await source.content.arrayBuffer();
        const zip = new PizZip(arrayBuffer);
        // Word stores main content in document.xml
        let xmlContent = zip.files['word/document.xml'].asText();

        // Check for additional content files (header.xml, footer.xml)
        let headerContent = '';
        let footerContent = '';

        console.log('[SCANNER] Available files in zip:', Object.keys(zip.files));

        // Word documents can have multiple headers/footers with numbers (header1.xml, header2.xml, etc.)
        const headerFiles = Object.keys(zip.files).filter(file => file.startsWith('word/header') && file.endsWith('.xml'));
        const footerFiles = Object.keys(zip.files).filter(file => file.startsWith('word/footer') && file.endsWith('.xml'));

        console.log('[SCANNER] Found header files:', headerFiles);
        console.log('[SCANNER] Found footer files:', footerFiles);

        // Combine all header files
        if (headerFiles.length > 0) {
          headerContent = headerFiles.map(file => zip.files[file].asText()).join('\n');
          console.log('[SCANNER] Header content found (first 200 chars):', headerContent.substring(0, 200));
        }

        // Combine all footer files
        if (footerFiles.length > 0) {
          footerContent = footerFiles.map(file => zip.files[file].asText()).join('\n');
          console.log('[SCANNER] Footer content found (first 200 chars):', footerContent.substring(0, 200));
        }

        // Combine all parts for complete text extraction
        if (headerContent) {
          xmlContent = headerContent + xmlContent;
          console.log('[SCANNER] Added header to content');
        }

        if (footerContent) {
          xmlContent = xmlContent + footerContent;
          console.log('[SCANNER] Added footer to content');
        }

        // 1. Strip XML tags. 
        // 2. IMPORTANT: Remove zero-width joiners/spaces that Word inserts between characters in tags
        rawTextContent = xmlContent
          .replace(/<[^>]+>/g, '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '');

        console.log('[SCANNER] Combined XML Content (first 200 chars):', xmlContent.substring(0, 200));
        console.log('[SCANNER] Combined Raw Text Content (first 200 chars):', rawTextContent.substring(0, 200));
        console.log('[SCANNER] Raw text content length:', rawTextContent.length);
      } else {
        // Clean HTML from the editor
        rawTextContent = getCleanText(source.content).replace(/[\u200B-\u200D\uFEFF]/g, '');
      }

      const tagRegex = /\{([#\/%])?\s*([a-zA-Z0-9_]+)\s*\}/g;
      const sequences = new Map(); // To track em_1, em_2 groups

      const results: Placeholder[] = [];
      const blockStack: string[] = [];
      const processedTags = new Set<string>();

      let match;
      while ((match = tagRegex.exec(rawTextContent)) !== null) {
        const prefix = match[1]; // #, /, %
        const tagName = match[2];
        const currentParent = blockStack.length > 0 ? blockStack[blockStack.length - 1] : undefined;
        const contextKey = currentParent ? `${currentParent}_${tagName}` : tagName;

        if (!prefix) {
          // Check if this is a numbered sequence (e.g., em_1)
          const digitMatch = tagName.match(/^(.+)_(\d+)$/);
          if (digitMatch) {
            const groupName = digitMatch[1]; // "em"
            const index = parseInt(digitMatch[2]); // 1, 2, 3...

            if (!sequences.has(groupName)) {
              sequences.set(groupName, { max: index, count: 1 });
            } else {
              const seq = sequences.get(groupName);
              seq.max = Math.max(seq.max, index);
              seq.count++;
            }
            continue; // Skip individual processing for now
          }
        }

        if (prefix === '#') {
          console.log(`%c[ARRAY DETECTED] {#${tagName}}`, "color: #059669");
          blockStack.push(tagName);
          if (!processedTags.has(contextKey)) {
            // Check if this is a conditional block (starts with 'condition_')
            if (tagName.startsWith('condition_')) {
              const conditionName = tagName.replace('condition_', '');
              results.push({
                id: `block_${tagName}_${Date.now()}`,
                name: tagName,
                type: 'conditional',
                required: true,
                entity_type: ['company', 'principal', 'director', 'shareholder', 'dependant', 'employee'], // Conditional can apply to any entity
                is_block_start: true,
                description: `Conditional block: {#${tagName}}`
              });
            } else {
              // Regular array block - determine entity type
              let blockEntity: EntityType = (tagName.endsWith('s') ? tagName.slice(0, -1) : tagName) as EntityType;
              let blockRelationships: string[] = [];

              if (blockEntity === 'dependant') {
                const relationshipPrefixes = ['father', 'mother', 'daughter', 'son', 'husband', 'wife', 'mother_in_law', 'father_in_law'];
                const tagNameLower = tagName.toLowerCase();

                for (const prefix of relationshipPrefixes) {
                  if (tagNameLower.startsWith(prefix + '_')) {
                    blockRelationships = [prefix];
                    console.log(`[BLOCK RELATIONSHIP DETECTED] ${tagName} -> ${prefix} (dependant)`);
                    break;
                  }
                }
              }

              results.push({
                id: `block_${tagName}_${Date.now()}`,
                name: tagName,
                type: 'array',
                required: true,
                entity_type: blockEntity,
                ...(blockRelationships.length > 0 && { dependant_relationship: blockRelationships }),
                is_block_start: true,
                description: `Repeating section: {#${tagName}}`
              });
            }
            processedTags.add(contextKey);
          }
        }
        else if (prefix === '/') {
          blockStack.pop();
        }
        else {
          if (processedTags.has(contextKey)) continue;

          console.log(`[FIELD DETECTED] {${tagName}} ${currentParent ? `(Inside ${currentParent})` : '(Global)'}`);

          const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(tagName, masterFields);

          let inferredEntity: EntityType = 'principal';
          let inferredRelationships: string[] = [];

          if (currentParent) {
            // Priority 1: Map to plural parent (e.g. #directors -> director)
            inferredEntity = (currentParent.endsWith('s') ? currentParent.slice(0, -1) : currentParent) as EntityType;
          } else if (sourceType) {
            // Priority 2: Use DB metadata
            inferredEntity = sourceType as EntityType;
          } else {
            // Priority 3: Check for relationship prefixes in tag name
            const relationshipPrefixes = ['father', 'mother', 'daughter', 'son', 'husband', 'wife', 'mother_in_law', 'father_in_law'];
            const tagNameLower = tagName.toLowerCase();

            for (const prefix of relationshipPrefixes) {
              if (tagNameLower.startsWith(prefix + '_')) {
                inferredEntity = 'dependant';
                inferredRelationships = [prefix];
                console.log(`[RELATIONSHIP DETECTED] ${tagName} -> ${prefix} (dependant)`);
                break;
              }
            }
          }

          results.push({
            id: `ph_${tagName}_${Date.now()}`,
            name: tagName,
            parent_name: currentParent,
            type: prefix === '%' ? 'image' : 'text',
            required: true,
            entity_type: inferredEntity,
            master_field_ids: matchingFieldIds,
            ...(inferredRelationships.length > 0 && { dependant_relationship: inferredRelationships }),
            description: currentParent ? `Inside ${currentParent}` : ''
          });
          processedTags.add(contextKey);
        }
      }
      sequences.forEach((data, groupName) => {
        // Only treat as a sequence if we found more than 1 (e.g., em_1 and em_2)
        if (data.count > 1) {
          results.push({
            id: `seq_${groupName}_${Date.now()}`,
            name: groupName,
            type: 'text', // Generator will handle splitting
            is_digit_split: true, // Custom flag
            digit_count: data.max,
            required: true,
            entity_type: 'company', // Default
            description: `Grouped Sequence (${groupName}_1 to ${groupName}_${data.max})`
          });
        }
      })
      console.groupEnd();
      return results;
    } catch (err) {
      console.error("[SCANNER] Error:", err);
      console.groupEnd();
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Word File Upload Handler
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Logic fix: calling unified extractor
      const extractedPlaceholders = await extractPlaceholders({ type: 'file', content: file });

      const tempId = `temp_file_${Date.now()}`;
      const newTemplate: DocumentTemplate = {
        id: tempId,
        document_id: document.id,
        name: file.name.replace(/\.[^/.]+$/, ''),
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        placeholders: extractedPlaceholders,
        created_at: new Date().toISOString(),
        entity_types: [],
      };

      setTemplateFiles(prev => new Map(prev.set(tempId, file)));
      setTemplates(prev => [...prev, newTemplate]);
      setCurrentTemplateIndex(templates.length);

      toast({
        title: "File Uploaded",
        description: `Successfully detected ${extractedPlaceholders.length} tags.`
      });
    } catch (error) {
      toast({ title: 'Error processing file', description: error.message, variant: 'destructive' });
    }
  };

  /**
   * Manual Editor Rescan Handler
   */
  const handleRescanPlaceholders = async () => {
    if (!currentTemplate || currentTemplateIndex === null) return;

    // Check if we scan the editor text or the file
    const source = currentTemplate.content
      ? { type: 'text', content: currentTemplate.content }
      : { type: 'file', content: templateFiles.get(currentTemplate.id)! };

    if (source.type === 'file' && !source.content) {
      toast({ title: "No source file found to rescan" });
      return;
    }

    const updatedPlaceholders = await extractPlaceholders(source);

    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].placeholders = updatedPlaceholders;
    updatedTemplates[currentTemplateIndex].isDirty = false;
    setTemplates(updatedTemplates);

    toast({ title: "Rescan Complete", description: `Updated ${updatedPlaceholders.length} fields.` });
  };

  const findMatchingMasterFields = (placeholderName: string, masterFields: JobField[]): { ids: number[], sourceType?: string } => {
    if (!placeholderName || !masterFields.length) return { ids: [] };

    const normalizedPlaceholder = placeholderName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    const matches = masterFields.filter(field => {
      const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const normalizedKey = field.field_key.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

      const isMatch = (
        normalizedPlaceholder === normalizedLabel ||
        normalizedPlaceholder === normalizedKey ||
        normalizedPlaceholder.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedPlaceholder)
      );

      if (isMatch) console.log(`  -> Match Found: "${field.label}" (${field.field_key})`);
      return isMatch;
    });

    // Determine the most likely entity type based on master field sources
    const sourceTypes = matches.flatMap(field =>
      Array.isArray(field.sources) ? field.sources.map(s => s.source_type).filter(Boolean) : []
    );

    const mostCommonSource = sourceTypes.sort((a, b) =>
      sourceTypes.filter(v => v === a).length - sourceTypes.filter(v => v === b).length
    ).pop();

    return {
      ids: matches.map(field => field.id),
      sourceType: mostCommonSource
    };
  };


  const renderPlaceholderRows = () => {
    if (!currentTemplate?.placeholders) return null;

    const filtered = currentTemplate.placeholders.filter(p =>
      p.name.toLowerCase().includes(placeholderSearch.toLowerCase())
    );

    return filtered.map((p) => {
      const isChild = !!p.parent_name;
      const isBlock = p.is_block_start;
      const originalIndex = currentTemplate.placeholders.findIndex(orig => orig.id === p.id);

      return (
        <TableRow
          key={p.id}
          className={cn(
            isChild && "bg-muted/10 hover:bg-muted/20",
            isBlock && "bg-blue-50/40 hover:bg-blue-50/60"
          )}
        >
          <TableCell className="border-r">
            <div className="flex items-center gap-2 font-mono text-sm">
              <FileText className="h-3.5 w-3.5" />
              <span>{p.is_digit_split ? `${p.name}_[1-${p.digit_count}]` : `{${p.name}}`}</span>
              {p.is_digit_split && <Badge className="bg-orange-500">DIGIT SPLIT</Badge>}
            </div>
          </TableCell>
          <TableCell className="border-r">
            <div className={cn(
              "flex items-center gap-2 font-mono text-sm",
              isChild && "pl-8 border-l-2 border-blue-200 ml-2"
            )}>
              {isBlock ? (
                <Badge className="bg-blue-600 hover:bg-blue-700 h-5 px-1.5 text-[10px]">BLOCK</Badge>
              ) : isChild ? (
                <Link2 className="h-3 w-3 text-blue-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={cn(isBlock && "font-bold text-blue-800")}>
                {isBlock ? `{#${p.name}}` : `{${p.name}}`}
              </span>
            </div>
          </TableCell>

          <TableCell className="border-r">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="capitalize text-[10px]">
                {p.type}
              </Badge>
              {p.type === 'boolean' && p.boolean_type && (
                <Badge variant="secondary" className="text-[8px] bg-purple-100 text-purple-700">
                  {p.boolean_type === 'single' ? 'Radio' : 'Multi'}
                </Badge>
              )}
              {p.type === 'boolean' && p.boolean_conditions?.length > 0 && (
                <Badge variant="outline" className="text-[8px]">
                  {p.boolean_conditions.length} opts
                </Badge>
              )}
              {p.type === 'array' && (
                <Badge className="text-[8px] bg-orange-100 text-orange-700 hover:bg-orange-100">
                  {p.array_direction === 'horizontal' ? '→ Horizontal' : '↓ Vertical'}
                </Badge>
              )}
            </div>
          </TableCell>

          <TableCell className="border-r">
            <Badge variant="secondary" className={cn("capitalize text-[10px]", isChild && "bg-blue-100 text-blue-700")}>
              {p.entity_type}
            </Badge>
          </TableCell>

          <TableCell className="border-r">
            {p.type === 'document_checklist' && p.linked_document_ids?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.linked_document_ids.slice(0, 3).map(docId => {
                  const doc = availableDocuments.find(d => d.id === docId);
                  return (
                    <Badge key={docId} variant="outline" className="text-[9px] bg-purple-50 text-purple-700">
                      {doc?.display_name || doc?.name || 'Doc'}
                    </Badge>
                  );
                })}
                {p.linked_document_ids.length > 3 && (
                  <Badge variant="outline" className="text-[9px]">
                    +{p.linked_document_ids.length - 3}
                  </Badge>
                )}
              </div>
            ) : p.type === 'boolean' && p.boolean_conditions?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.boolean_conditions.slice(0, 3).map((cond) => (
                  <Badge key={`${p.id}-${cond.tag}`} variant="outline" className="text-[9px] bg-purple-50 text-purple-700">
                    {cond.label}
                  </Badge>
                ))}
                {p.boolean_conditions.length > 3 && (
                  <Badge variant="outline" className="text-[9px]">
                    +{p.boolean_conditions.length - 3}
                  </Badge>
                )}
              </div>
            ) : p.master_field_ids?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.master_field_ids.map(id => (
                  <Badge key={id} variant="outline" className="text-[9px] bg-white">
                    {masterFieldMap.get(id) || id}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">Not Linked</span>
            )}
          </TableCell>

          <TableCell className="border-r">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="capitalize text-[10px]">
                {p.type}
              </Badge>
              {p.is_ai_generated && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[8px] h-4">
                  AI
                </Badge>
              )}
              {p.type === 'image' && (p.image_width || p.image_height) && (
                <Badge variant="secondary" className="text-[8px] bg-green-100 text-green-700">
                  {p.image_width || 'auto'} × {p.image_height || 'auto'}
                </Badge>
              )}
            </div>
          </TableCell>

          <TableCell className="border-r">
            {p.default_value ? (
              <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-700">
                {p.default_value.length > 15 ? `${p.default_value.substring(0, 15)}...` : p.default_value}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">None</span>
            )}
          </TableCell>

          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editPlaceholder(originalIndex)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePlaceholder(originalIndex)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    });
  };


  // Update the autoGeneratePlaceholders function to use source_type from master fields and detect array placeholders
  const autoGeneratePlaceholders = (extracted: string[], masterFields: JobField[] = []): Placeholder[] => {
    // First, identify array placeholders (they typically appear in the format "director" from "{#directors}")
    const arrayPlaceholders = extracted.filter(name =>
      name.endsWith('s') && // Simple heuristic: array names are often plural
      extracted.includes(name.slice(0, -1)) // Check if singular form exists
    );

    return extracted.map((name, index) => {
      const isImage = name.startsWith('%') && name.endsWith('%');
      const cleanName = isImage ? name.substring(1, name.length - 1) : name;
      const isArray = arrayPlaceholders.includes(name) ||
        (name.endsWith('s') && extracted.includes(name.slice(0, -1)));

      // Find matching master fields and get source type
      const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(cleanName, masterFields);

      return {
        id: `auto_${Date.now()}_${index}`,
        name: cleanName,
        description: matchingFieldIds.length > 0
          ? `Auto-linked to ${matchingFieldIds.length} field(s)`
          : isArray ? 'Array placeholder' : '',
        type: isImage ? 'image' : isArray ? 'array' : 'text',
        required: true,
        entity_type: (sourceType as EntityType) || 'principal', // Use source_type from master field or default to 'principal'
        master_field_ids: matchingFieldIds,
        default_value: ''
      };
    });
  };

  // Update the mergePlaceholders function to use source_type from master fields and handle array placeholders
  const mergePlaceholders = (
    existingPlaceholders: Placeholder[],
    extractedNames: string[],
    masterFields: JobField[] = []
  ): Placeholder[] => {
    const existingMap = new Map(existingPlaceholders.map(p => [p.name, p]));
    const updatedPlaceholders: Placeholder[] = [];
    const processedNames = new Set<string>();

    // First, identify array placeholders
    const arrayPlaceholders = extractedNames.filter(name =>
      name.endsWith('s') && // Simple heuristic: array names are often plural
      extractedNames.includes(name.slice(0, -1)) // Check if singular form exists
    );

    for (const name of extractedNames) {
      const isImageTag = name.startsWith('%') && name.endsWith('%');
      const cleanName = isImageTag ? name.substring(1, name.length - 1) : name;

      // Check if this is an array placeholder
      const isArray = arrayPlaceholders.includes(name) ||
        (name.endsWith('s') && extractedNames.includes(name.slice(0, -1)));

      if (processedNames.has(cleanName)) continue;

      const existingPlaceholder = existingMap.get(cleanName);
      if (existingPlaceholder) {
        // Preserve existing placeholder but update the type if it's now detected as an array
        if (isArray && existingPlaceholder.type !== 'array') {
          updatedPlaceholders.push({
            ...existingPlaceholder,
            type: 'array',
            description: existingPlaceholder.description || 'Array placeholder'
          });
        } else {
          updatedPlaceholders.push(existingPlaceholder);
        }
      } else {
        // Find matching master fields and get source type
        const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(cleanName, masterFields);

        updatedPlaceholders.push({
          id: `auto_${Date.now()}_${updatedPlaceholders.length}`,
          name: cleanName,
          description: matchingFieldIds.length > 0
            ? `Auto-linked to ${matchingFieldIds.length} field(s)`
            : isArray ? 'Array placeholder' : '',
          type: isImageTag ? 'image' : isArray ? 'array' : 'text',
          required: true,
          entity_type: (sourceType as EntityType) || 'principal', // Use source_type from master field or default to 'principal'
          master_field_ids: matchingFieldIds,
          default_value: ''
        });
      }
      processedNames.add(cleanName);
    }

    return updatedPlaceholders;
  };

  // Update the addNewFileTemplate function to accept masterFields
  const addNewFileTemplate = (file: File, extractedPlaceholders: string[], masterFields: JobField[] = []) => {
    const tempId = `temp_file_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId,
      document_id: document.id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      placeholders: autoGeneratePlaceholders(extractedPlaceholders, masterFields),
      created_at: new Date().toISOString(),
      entity_types: [],
    };
    setTemplateFiles(prev => new Map(prev.set(tempId, file)));
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
    toast({
      title: 'File Template Added',
      description: `Detected ${extractedPlaceholders.length} placeholders. ${newTemplate.placeholders.filter(p => p.master_field_ids?.length).length
        } placeholders were automatically linked to master fields.`
    });
  };

  const addNewTextTemplate = () => {
    const tempId = `temp_text_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId, document_id: document.id,
      name: `New Text Template ${templates.filter(t => t.content !== undefined).length + 1}`,
      content: '<p>Start writing your template here...</p>', file_type: 'text/html',
      placeholders: [], created_at: new Date().toISOString(),
      entity_types: [],
    };
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
  };

  const handleEditorChange = (content: { html: string; header?: string; footer?: string } | string) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    // Handle both string (legacy) and object (new) formats
    if (typeof content === 'string') {
      updatedTemplates[currentTemplateIndex].content = content;
    } else {
      // Combine header, main content, and footer with proper separation
      const { html, header = '', footer = '' } = content;
      updatedTemplates[currentTemplateIndex].content = [
        header ? `<header>${header}</header>` : '',
        html,
        footer ? `<footer>${footer}</footer>` : ''
      ].join('\n\n');
    }
    updatedTemplates[currentTemplateIndex].isDirty = true;
    setTemplates(updatedTemplates);
  };

  const handleTemplateNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].name = e.target.value;
    setTemplates(updatedTemplates);
  };

  // Set default entity types for new placeholders
  useEffect(() => {
    if (currentTemplateIndex === null) return;

    const currentTemplate = templates[currentTemplateIndex];
    const entityTypes = currentTemplate.entity_types || [];

    // Only set default entity type for new placeholders if we have entity types defined
    if (entityTypes.length > 0) {
      const updatedTemplates = [...templates];
      const placeholders = [...(currentTemplate.placeholders || [])];
      let needsUpdate = false;

      // Only update placeholders that don't have an entity_type set
      const updatedPlaceholders = placeholders.map(p => {
        if (!p.entity_type) {
          needsUpdate = true;
          return {
            ...p,
            entity_type: entityTypes[0] // Set to first allowed entity type
          };
        }
        return p;
      });

      if (needsUpdate) {
        updatedTemplates[currentTemplateIndex] = {
          ...currentTemplate,
          placeholders: updatedPlaceholders
        };
        setTemplates(updatedTemplates);
      }
    }
  }, [currentTemplateIndex, templates, templates[currentTemplateIndex]?.entity_types]);

  const handleEntityTypeToggle = (entityType: EntityType) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    const currentTypes = updatedTemplates[currentTemplateIndex].entity_types || [];
    const newTypes = currentTypes.includes(entityType)
      ? currentTypes.filter(et => et !== entityType)
      : [...currentTypes, entityType];
    updatedTemplates[currentTemplateIndex].entity_types = newTypes;
    setTemplates(updatedTemplates);
  };

  const handleEditorBlur = () => { if (currentTemplate?.isDirty) handleRescanPlaceholders(); };

  const savePlaceholder = () => {
    if (!newPlaceholder.name.trim()) return;

    const processedOptions = newPlaceholder.type === 'conditional'
      ? (newPlaceholder.conditions || []).map(c => `{#${c.tag}}${c.label}{${c.tag}}{/${c.tag}}`)
      : newPlaceholder.options;

    const placeholderToSave = {
      ...newPlaceholder,
      source_logic: newPlaceholder.source_logic || 'priority',
      linked_job_question_ids: newPlaceholder.linked_job_question_ids || [],
      linked_requirement_ids: newPlaceholder.linked_requirement_ids || [],
      id: newPlaceholder.id || `placeholder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      is_ai_generated: newPlaceholder.is_ai_generated || false,
      ai_prompt: newPlaceholder.ai_prompt || '',
      options: processedOptions,
      entity_type: Array.isArray(newPlaceholder.entity_type)
        ? newPlaceholder.entity_type
        : newPlaceholder.entity_type ? [newPlaceholder.entity_type] : [],
      ...(newPlaceholder.entity_type?.includes('director') && { director_type: directorType }),
      ...(newPlaceholder.entity_type?.includes('dependant') && { dependant_relationship: dependantRelationship }),
      ...(newPlaceholder.type === 'boolean' && {
        boolean_conditions: newPlaceholder.boolean_conditions || [],
        boolean_type: newPlaceholder.boolean_type || 'single'
      }),
      ...(newPlaceholder.type === 'document_checklist' && {
        linked_document_ids: newPlaceholder.linked_document_ids || [],
        checklist_display_format: newPlaceholder.checklist_display_format || 'checkboxes',
        checklist_data_source: newPlaceholder.checklist_data_source || {
          table: 'acc_portal_kyc_uploads',
          linking_variable: 'company_id',
          document_id_field: 'kyc_document_id'
        }
      }),
      // Include default_value field
      default_value: newPlaceholder.default_value || ''
    };

    if (isEditingPlaceholder !== null) {
      const updatedTemplates = [...templates];
      const targetTemplate = updatedTemplates[currentTemplateIndex];
      const updatedPlaceholders = [...(targetTemplate.placeholders || [])];
      updatedPlaceholders[isEditingPlaceholder] = placeholderToSave;
      targetTemplate.placeholders = updatedPlaceholders;
      setTemplates(updatedTemplates);
    } else {
      const updatedTemplates = [...templates];
      const targetTemplate = updatedTemplates[currentTemplateIndex];
      const updatedPlaceholders = [...(targetTemplate.placeholders || [])];
      updatedPlaceholders.push(placeholderToSave);
      targetTemplate.placeholders = updatedPlaceholders;
      setTemplates(updatedTemplates);
    }

    setIsPlaceholderFormOpen(false);

    setNewPlaceholder({
      id: '',
      name: '',
      description: '',
      type: 'text',
      required: false,
      entity_type: [],
      default_value: '',
      conditions: [],
      boolean_conditions: [],
      boolean_type: 'single',
      array_direction: 'vertical',
      image_width: '',
      image_height: '',
      linked_job_question_id: undefined,
      linked_requirement_id: undefined
    });

    setDirectorType('all');
    setDependantRelationship([]);
    setAvailableFields([]);
    setIsEditingPlaceholder(null);
  };

  const editPlaceholder = (index: number) => {
    if (!currentTemplate || currentTemplateIndex === null) return;
    const placeholder = currentTemplate.placeholders?.[index];
    if (!placeholder) return;

    // Ensure entity_type is always an array
    setNewPlaceholder({
      ...placeholder,
      entity_type: Array.isArray(placeholder.entity_type)
        ? placeholder.entity_type
        : placeholder.entity_type ? [placeholder.entity_type] : [],
      conditions: placeholder.conditions || [],
      boolean_conditions: placeholder.boolean_conditions || [],
      boolean_type: placeholder.boolean_type || 'single',
      is_ai_generated: placeholder.is_ai_generated || false, // Add this
      ai_prompt: placeholder.ai_prompt || '',
      default_value: placeholder.default_value || '',
    });

    // Set director type if applicable
    if (placeholder.entity_type?.includes('director') && placeholder.director_type) {
      setDirectorType(placeholder.director_type as 'all' | 'primary');
    } else {
      setDirectorType('all');
    }

    // Set dependant relationship if applicable
    if (placeholder.entity_type?.includes('dependant') && placeholder.dependant_relationship) {
      setDependantRelationship(Array.isArray(placeholder.dependant_relationship) ? placeholder.dependant_relationship : []);
    } else {
      setDependantRelationship([]);
    }

    setIsEditingPlaceholder(index);
    setIsPlaceholderFormOpen(true);
  };

  const removePlaceholder = (index: number) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].placeholders = updatedTemplates[currentTemplateIndex].placeholders?.filter((_, i) => i !== index);
    setTemplates(updatedTemplates);
  };

  // Conditional builder functions
  const addCondition = () => {
    const newCondition: ConditionalCondition = {
      field: '',
      operator: 'exists',
      master_field_ids: [],
      value: ''
    };
    setNewPlaceholder(prev => ({
      ...prev,
      conditions: [...(prev.conditions || []), newCondition]
    }));
  };

  const updateCondition = (index: number, field: keyof ConditionalCondition, value: any) => {
    setNewPlaceholder(prev => {
      const updatedConditions = [...(prev.conditions || [])];
      updatedConditions[index] = {
        ...updatedConditions[index],
        [field]: value
      };
      return {
        ...prev,
        conditions: updatedConditions
      };
    });
  };

  const removeCondition = (index: number) => {
    setNewPlaceholder(prev => {
      const updatedConditions = [...(prev.conditions || [])];
      updatedConditions.splice(index, 1);
      return {
        ...prev,
        conditions: updatedConditions
      };
    });
  };

  const uploadAndSaveAll = async () => {
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const template of templates) {
        let filePath = template.file_path;
        if (template.id.startsWith('temp_') && !template.content) {
          const fileToUpload = templateFiles.get(template.id);
          if (!fileToUpload) throw new Error(`File for ${template.file_name} not found.`);
          const storagePath = `kyc-templates/${document.id}-${Date.now()}`;
          const { data, error } = await supabase.storage.from('templates').upload(storagePath, fileToUpload);
          if (error) throw error;
          filePath = data.path;
        }

        // --- MODIFICATION: Use job_level instead of class_id in the payload ---
        const templateData = {
          file_name: template.name,
          document_id: document.id,
          file_path: filePath,
          content: template.content,
          file_type: template.file_type,
          file_size: template.file_size,
          placeholders: template.placeholders || [],
          updated_at: new Date().toISOString(),
          created_by: user?.id,
          banks_associated: selectedBank ? [selectedBank] : [],
          job_level: jobLevel ? [jobLevel] : [],
          entity_types: template.entity_types || [],
        };

        let error;
        if (template.id.startsWith('temp_')) {
          ({ error } = await supabase.from('acc_portal_templates').insert(templateData));
        } else {
          // Exclude created_by from update if you don't want to change ownership
          const { created_by, ...updateData } = templateData;
          ({ error } = await supabase.from('acc_portal_templates').update(updateData).eq('id', template.id));
        }
        if (error) throw error;
      }
      await supabase.from('acc_portal_kyc').update({ has_template: templates.length > 0 }).eq('id', document.id);
      onTemplateUpdate();
      onClose();
      toast({ title: "Templates Saved Successfully" });
    } catch (error) {
      console.error('Error saving templates:', error);
      toast({ title: "Error Saving", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteTemplate = async (index: number) => {
    const templateToDelete = templates[index];
    if (!templateToDelete) return;
    if (!templateToDelete.id.startsWith('temp_')) {
      if (templateToDelete.file_path) {
        await supabase.storage.from('templates').remove([templateToDelete.file_path]);
      }
      await supabase.from('acc_portal_templates').delete().eq('id', templateToDelete.id);
    }
    const updatedTemplates = templates.filter((_, i) => i !== index);
    setTemplates(updatedTemplates);
    if (index === currentTemplateIndex) {
      setCurrentTemplateIndex(updatedTemplates.length > 0 ? Math.max(0, index - 1) : null);
    } else if (currentTemplateIndex && index < currentTemplateIndex) {
      setCurrentTemplateIndex(currentTemplateIndex - 1);
    }
    toast({ title: "Template Removed" });
  };

  const getTemplatePreviewUrl = (template: DocumentTemplate) => {
    if (!template) return '';
    if (template.file_path) {
      const { data } = supabase.storage.from('templates').getPublicUrl(template.file_path);
      return data.publicUrl;
    }
    const file = templateFiles.get(template.id);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      return blobUrl;
    }
    return '';
  };

  const handleDownload = async () => {
    if (!currentTemplate?.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('templates')
        .download(currentTemplate.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentTemplate.file_name || 'document.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download the document. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Add this function for manual rescan with enhanced detection
  const handleManualRescan = async () => {
    if (!currentTemplate) return;

    try {
      setIsProcessing(true);

      // Use enhanced extractPlaceholders function that includes header/footer support
      let extracted: Placeholder[] = [];

      // If it's a file template, extract from file (includes header/footer)
      if (currentTemplate.file_name && templateFiles.has(currentTemplate.id)) {
        const file = templateFiles.get(currentTemplate.id);
        if (file) {
          extracted = await extractPlaceholders({ type: 'file', content: file });
        }
      } else {
        // Extract from editor content
        extracted = await extractPlaceholders({ type: 'text', content: currentTemplate.content || '' });
      }

      // Update placeholders in template with the extracted ones
      const updatedTemplates = [...templates];
      const existingPlaceholders = updatedTemplates[currentTemplateIndex].placeholders || [];

      updatedTemplates[currentTemplateIndex].placeholders = mergePlaceholders(
        existingPlaceholders,
        extracted,
        masterFields
      );

      updatedTemplates[currentTemplateIndex].isDirty = false;
      setTemplates(updatedTemplates);

      const linkedCount = updatedTemplates[currentTemplateIndex].placeholders
        .filter(p => p.master_field_ids?.length).length;

      toast({
        title: 'Manual Rescan Complete',
        description: `Found ${extracted.length} placeholders including header/footer. ${linkedCount} were automatically linked to master fields.`,
        variant: 'default'
      });

    } catch (error) {
      console.error('Error during manual rescan:', error);
      toast({
        title: 'Rescan Error',
        description: error instanceof Error ? error.message : 'Failed to rescan placeholders',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={`max-w-screen h-[90vh] flex flex-col ${containerClassName}`}>
          <DialogHeader>
            <DialogTitle>Template Manager: {document.display_name || document.name}</DialogTitle>
            <DialogDescription>Create and manage templates by uploading a DOCX file or using the rich text editor.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 px-6 py-2 border-b border-t">
            <View className="h-4 w-4 text-muted-foreground" />
            <Label className="mr-2">View Panels:</Label>
            <Button variant={panelsVisible.left ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('left')}>Templates</Button>
            <Button variant={panelsVisible.middle ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('middle')}>Editor</Button>
            <Button variant={panelsVisible.right ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('right')}>Placeholders</Button>
          </div>

          <div className="grid grid-cols-12 gap-6 py-4 flex-1 overflow-y-auto">
            {/* Left Panel */}
            <div className={`${panelClasses.left} flex flex-col gap-6 h-full transition-all duration-300`}>
              <Card>
                <CardHeader><CardTitle className="text-lg">Add New Template</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="template-upload">Upload .docx File</Label><Input id="template-upload" type="file" accept=".docx" onChange={handleFileChange} disabled={isProcessing} ref={fileInputRef} /></div>
                  <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div></div>
                  <Button onClick={addNewTextTemplate} variant="outline" className="w-full"><PlusCircle className="mr-2 h-4 w-4" /> Create Text Template</Button>
                </CardContent>
              </Card>

              <Card className="flex-1 flex flex-col">
                <CardHeader><CardTitle className="text-lg">Template Queue</CardTitle></CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {templates.length > 0 ? (
                    <div className="border rounded-md">
                      {templates.map((tpl, idx) => (
                        <div key={tpl.id} className={`p-3 border-b last:border-b-0 flex items-center justify-between gap-2 hover:bg-muted/50 cursor-pointer ${idx === currentTemplateIndex ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`} onClick={() => setCurrentTemplateIndex(idx)}>
                          <div className="flex items-center gap-3 flex-grow truncate">
                            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            <div className="truncate">
                              <p className="font-medium truncate">{tpl.name}</p>
                              <div className="flex items-center flex-wrap gap-1 mt-1">
                                {tpl.entity_types?.map(et => <Badge key={et} variant="secondary" className="capitalize">{et}</Badge>)}
                                <p className="text-xs text-muted-foreground">{tpl.placeholders?.length || 0} fields</p>
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={(e) => { e.stopPropagation(); deleteTemplate(idx); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-center p-8"><h3 className="text-sm font-medium">Queue is empty</h3></div>}
                </CardContent>
              </Card>
            </div>

            {/* Middle Panel */}
            <div className={`${panelClasses.middle} h-full transition-all duration-300`}>
              {currentTemplate ? (
                <Card className="h-full flex flex-col">
                  <CardHeader className="flex flex-row justify-between items-center">
                    <div><CardTitle>Template Editor</CardTitle><CardDescription>Edit the name, type, and content below.</CardDescription></div>
                    {currentTemplate.isDirty && (<Button size="sm" onClick={handleRescanPlaceholders}><RefreshCw className="mr-2 h-4 w-4" /> Re-scan</Button>)}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="grid grid-cols-3 flex gap-4">
                      <div className="space-y-2"><Label htmlFor="template-name">Template Name</Label><Input id="template-name" value={currentTemplate.name || ''} onChange={handleTemplateNameChange} /></div>
                      <div className="space-y-2"><Label htmlFor="entity-type">Template For</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
                              <span className="truncate pr-2">
                                {currentTemplate.entity_types?.length > 0 ? currentTemplate.entity_types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : "Select entities..."}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
                            {ENTITY_TYPES.map(t => (
                              <DropdownMenuCheckboxItem key={t.value} checked={currentTemplate.entity_types?.includes(t.value)} onCheckedChange={() => handleEntityTypeToggle(t.value)}>
                                {t.label}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-col items-center justify-between"><Label htmlFor="entity-type"></Label>
                        {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownload}
                            className="ml-2"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleManualRescan}
                          disabled={isProcessing || currentTemplateIndex === null}
                          className="ml-2"
                        >
                          {isProcessing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Manual Rescan
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 flex-1 flex flex-col">
                      <Label>Content</Label>
                      {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
                        <div className="w-full h-full border rounded-md overflow-hidden">
                          {docPreviewUrl ? (
                            <iframe
                              src={docPreviewUrl || ''}
                              className="w-full h-full border-0"
                              frameBorder="0"
                              title="Document Preview"
                              onError={(e) => {
                                console.error('Error loading document preview:', e);
                                setDocPreviewUrl(null);
                                toast({
                                  title: 'Preview Error',
                                  description: 'Could not load document preview. The file may not be accessible or the format is not supported.',
                                  variant: 'destructive'
                                });
                              }}
                            />
                          ) : templateFiles.get(currentTemplate.id) ? (
                            <div className="w-full h-full border rounded-md flex items-center justify-center">
                              <div className="text-center p-6">
                                <FileText className="h-12 w-12 mx-auto text-green-500 mb-3" />
                                <p className="text-sm font-medium text-gray-700">Word Document Uploaded</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {templateFiles.get(currentTemplate.id)?.name || 'Document ready for processing'}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <div className="text-center p-4">
                                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">No document available</p>
                                <p className="text-xs text-gray-400 mt-1">Upload a document to see preview</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <TemplateEditor
                          key={currentTemplate.id}
                          initialContent={currentTemplate.content || ''}
                          onChange={handleEditorChange}
                          onBlur={handleEditorBlur}
                          className="flex-1"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                panelsVisible.middle && (
                  <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
                    <div><h3 className="text-lg font-medium">No Template Selected</h3><p className="text-sm text-muted-foreground mt-1">Add or select a template to begin editing.</p></div>
                  </div>
                )
              )}
            </div>

            {/* Right Panel */}
            <div className={`${panelClasses.right} h-full transition-all duration-300`}>
              {panelsVisible.right && (
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <div className="flex flex-row items-center justify-between">
                      <div><CardTitle>Placeholders</CardTitle><CardDescription>Fields for the selected template.</CardDescription></div>
                      <Button variant="outline" size="sm" onClick={() => setIsPlaceholderFormOpen(true)} disabled={!currentTemplate}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                    </div>
                    <div className="relative pt-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search placeholders..."
                        value={placeholderSearch}
                        onChange={(e) => setPlaceholderSearch(e.target.value)}
                        disabled={!currentTemplate || !currentTemplate.placeholders?.length}
                        className="pl-9"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto min-h-[400px]">
                    {currentTemplate?.placeholders?.length > 0 ? (
                      filteredPlaceholders.length > 0 ? (
                        <Table className="border max-h-[calc(100vh - 300px)]">
                          <TableHeader className="bg-gray-100"><TableRow>
                            <TableHead className="border-r font-bold text-gray-700">Field</TableHead>
                            <TableHead className="border-r font-bold text-gray-700">Type</TableHead>
                            <TableHead className="border-r font-bold text-gray-700">Entity</TableHead>
                            <TableHead className="border-r font-bold text-gray-700">Linked Master Field</TableHead>
                            <TableHead className="border-r font-bold text-gray-700">Default Value</TableHead>
                            <TableHead className="text-right border-r font-bold text-gray-700">Actions</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {filteredPlaceholders.map((p) => {
                              const isChild = !!p.parent_name;
                              const isBlock = p.is_block_start;
                              const originalIndex = currentTemplate.placeholders.findIndex(orig => orig.id === p.id);

                              return (
                                <TableRow
                                  key={p.id}
                                  className={cn(
                                    isChild && "bg-muted/10 hover:bg-muted/20",
                                    isBlock && "bg-blue-50/40 hover:bg-blue-50/60"
                                  )}
                                >
                                  <TableCell className="border-r">
                                    <div className={cn(
                                      "flex items-center gap-2 font-mono text-sm",
                                      isChild && "pl-8 border-l-2 border-blue-200 ml-2"
                                    )}>
                                      {isBlock ? (
                                        <Badge className="bg-blue-600 hover:bg-blue-700 h-5 px-1.5 text-[10px]">ARRAY</Badge>
                                      ) : isChild ? (
                                        <Link2 className="h-3 w-3 text-blue-400" />
                                      ) : (
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                      <span className={cn(isBlock && "font-bold text-blue-800")}>
                                        {isBlock ? `{#${p.name}}` : `{${p.name}}`}
                                      </span>
                                    </div>
                                  </TableCell>

                                  <TableCell className="border-r">
                                    <Badge variant="outline" className="capitalize text-[10px]">
                                      {p.type}
                                    </Badge>
                                  </TableCell>

                                  <TableCell className="border-r">
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "capitalize text-[10px]",
                                        isChild && "bg-blue-100 text-blue-700"
                                      )}
                                    >
                                      {p.entity_type}
                                    </Badge>
                                  </TableCell>

                                  <TableCell className="border-r">
                                    <div className="space-y-1">
                                      {p.master_field_ids?.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {p.master_field_ids.map(id => (
                                            <Badge key={id} variant="outline" className="text-[9px] bg-white">
                                              {masterFieldMap.get(id) || id}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                      
                                      {p.linked_job_question_id && (
                                        <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">
                                          <HelpCircle className="h-3 w-3 mr-1" />
                                          {jobQuestions.find(q => q.id === p.linked_job_question_id)?.label || p.linked_job_question_id}
                                        </Badge>
                                      )}
                                      
                                      {p.linked_requirement_id && (
                                        <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200">
                                          <Database className="h-3 w-3 mr-1" />
                                          {requirements.find(r => r.id === p.linked_requirement_id)?.label || p.linked_requirement_id}
                                        </Badge>
                                      )}
                                      
                                      {!p.master_field_ids?.length && !p.linked_job_question_id && !p.linked_requirement_id && (
                                        <span className="text-[10px] text-muted-foreground italic">Not Linked</span>
                                      )}
                                    </div>
                                  </TableCell>

                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editPlaceholder(originalIndex)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePlaceholder(originalIndex)}>
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center p-6 h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No placeholders match your search.</p></div>
                      )
                    ) : (<div className="text-center p-6 h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No placeholders found.</p></div>)}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
            <Button onClick={uploadAndSaveAll} disabled={isProcessing || templates.length === 0}>{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save All Templates</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Placeholder Form Dialog */}
<Dialog open={isPlaceholderFormOpen} onOpenChange={setIsPlaceholderFormOpen}>
  <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
    <DialogHeader className="px-6 py-4 bg-white border-b shrink-0">
      <DialogTitle className="text-xl font-bold flex items-center gap-2">
        {isEditingPlaceholder !== null ? <Pencil className="h-5 w-5 text-blue-600" /> : <PlusCircle className="h-5 w-5 text-blue-600" />}
        {isEditingPlaceholder !== null ? 'Edit' : 'Add'} Placeholder
      </DialogTitle>
      <DialogDescription>Define the data sources and logic for document tag <span className="font-mono text-blue-600 font-bold">{'{'}{newPlaceholder.name || '...'}{'}'}</span></DialogDescription>
    </DialogHeader>

    <ScrollArea className="flex-1 bg-slate-50/30 px-6 py-4">
      <div className="space-y-6 pb-6">
        {/* Identity & Basic Info */}
        <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[11px] font-black uppercase text-slate-400">JSON Variable Key</Label>
            <Input
              id="name"
              placeholder="e.g. client_first_name"
              value={newPlaceholder.name}
              onChange={(e) => setNewPlaceholder({ ...newPlaceholder, name: e.target.value.replace(/\s+/g, '_') })}
              className="font-mono text-sm bg-slate-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_value" className="text-[11px] font-black uppercase text-slate-400">Default Fallback Value</Label>
            <Input
              id="default_value"
              placeholder="Optional default..."
              value={newPlaceholder.default_value || ''}
              onChange={(e) => setNewPlaceholder({ ...newPlaceholder, default_value: e.target.value })}
              className="bg-slate-50"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="description" className="text-[11px] font-black uppercase text-slate-400">Description</Label>
            <Textarea
              id="description"
              placeholder="Internal notes about this field..."
              value={newPlaceholder.description}
              onChange={(e) => setNewPlaceholder({ ...newPlaceholder, description: e.target.value })}
              className="min-h-[60px] resize-none bg-slate-50"
            />
          </div>
        </div>

        {/* Source Manager (The Priority List) */}
        <PlaceholderSourceManager
          placeholder={newPlaceholder}
          masterFields={masterFields}
          jobQuestions={jobQuestions}
          requirements={requirements}
          onUpdate={(updates) => setNewPlaceholder(prev => ({ ...prev, ...updates }))}
          onRemove={(type, id) => {
            setNewPlaceholder(prev => {
              if (type === 'db') return { ...prev, master_field_ids: prev.master_field_ids?.filter(fid => fid !== id) };
              if (type === 'job') return { ...prev, linked_job_question_ids: prev.linked_job_question_ids?.filter(qid => qid !== id) };
              if (type === 'req') return { ...prev, linked_requirement_ids: prev.linked_requirement_ids?.filter(rid => rid !== id) };
              return prev;
            });
          }}
        />

        {/* Linking Tools Card */}
        <div className="bg-white p-4 rounded-xl border space-y-4">
          <Label className="text-[11px] font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-blue-600" /> Data Linking Tools
          </Label>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1.5">
                <Database className="h-3 w-3" /> Master Database Fields
              </Label>
              <MasterFieldPicker
                masterFields={masterFields}
                selectedFieldIds={newPlaceholder.master_field_ids || []}
                onSelect={(id) => setNewPlaceholder(prev => ({ ...prev, master_field_ids: [...(prev.master_field_ids || []), id] }))}
                onRemove={(id) => setNewPlaceholder(prev => ({ ...prev, master_field_ids: prev.master_field_ids?.filter(fid => fid !== id) }))}
                onClear={() => setNewPlaceholder(prev => ({ ...prev, master_field_ids: [] }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-purple-600 uppercase flex items-center gap-1.5">
                  <HelpCircle className="h-3 w-3" /> Job Questions
                </Label>
                <JobQuestionPicker
                  jobQuestions={jobQuestions}
                  selectedQuestionId={undefined}
                  onSelect={(q) => {
                    const current = newPlaceholder.linked_job_question_ids || [];
                    if (!current.includes(q.id)) {
                      setNewPlaceholder(prev => ({ ...prev, linked_job_question_ids: [...current, q.id] }));
                    }
                  }}
                  onClear={() => {}}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-green-600 uppercase flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Requirements
                </Label>
                <RequirementPicker
                  requirements={requirements}
                  selectedRequirementId={undefined}
                  onSelect={(r) => {
                    const current = newPlaceholder.linked_requirement_ids || [];
                    if (!current.includes(r.id)) {
                      setNewPlaceholder(prev => ({ ...prev, linked_requirement_ids: [...current, r.id] }));
                    }
                  }}
                  onClear={() => {}}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Configuration: Type & Entity Scope */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-slate-400">Placeholder Type</Label>
            <Select
              value={newPlaceholder.type}
              onValueChange={(v) => setNewPlaceholder({ ...newPlaceholder, type: v })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEHOLDER_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-black uppercase text-slate-400">Entity Context</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between bg-white text-xs">
                  <span className="truncate pr-2">
                    {newPlaceholder.entity_type?.length > 0
                      ? newPlaceholder.entity_type.map(et => ENTITY_TYPES.find(t => t.value === et)?.label || et).join(', ')
                      : 'Select context...'}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search entities..." />
                  <CommandList>
                    <CommandGroup className="max-h-[250px] overflow-y-auto">
                      {ENTITY_TYPES.map((type) => {
                        const isSelected = newPlaceholder.entity_type?.includes(type.value);
                        return (
                          <CommandItem
                            key={type.value}
                            onSelect={() => {
                              setNewPlaceholder(prev => ({
                                ...prev,
                                entity_type: isSelected
                                  ? prev.entity_type.filter(et => et !== type.value)
                                  : [...(prev.entity_type || []), type.value]
                              }));
                            }}
                          >
                            <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <span className="text-sm font-medium">{type.label}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Dynamic Context Sections (Boolean, Array, Image, AI etc) */}
        <div className="space-y-4 pt-4 border-t">
          {newPlaceholder.type === 'select' && (
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase text-slate-400">Select Options</Label>
              <Textarea 
                placeholder="Option A&#10;Option B" 
                value={newPlaceholder.options?.join('\n')}
                onChange={e => setNewPlaceholder({...newPlaceholder, options: e.target.value.split('\n').filter(Boolean)})}
              />
            </div>
          )}

          {newPlaceholder.type === 'image' && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
               <div className="space-y-2">
                 <Label className="text-[11px] font-bold text-green-700">Image Width</Label>
                 <Input className="bg-white" value={newPlaceholder.image_width} onChange={e => setNewPlaceholder({...newPlaceholder, image_width: e.target.value})} placeholder="e.g. 200px" />
               </div>
               <div className="space-y-2">
                 <Label className="text-[11px] font-bold text-green-700">Image Height</Label>
                 <Input className="bg-white" value={newPlaceholder.image_height} onChange={e => setNewPlaceholder({...newPlaceholder, image_height: e.target.value})} placeholder="e.g. 150px" />
               </div>
            </div>
          )}

          <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border">
            <Checkbox id="required" checked={newPlaceholder.required} onCheckedChange={c => setNewPlaceholder({...newPlaceholder, required: !!c})} />
            <Label htmlFor="required" className="text-sm font-semibold">Mandatory Field (Validation will block generation if empty)</Label>
          </div>

          <div className="space-y-4 border-t pt-4">
             <div className="flex items-center space-x-2">
                <Checkbox id="is_ai" checked={newPlaceholder.is_ai_generated} onCheckedChange={c => setNewPlaceholder({...newPlaceholder, is_ai_generated: !!c})} />
                <Label htmlFor="is_ai" className="text-purple-700 font-bold flex items-center gap-2 uppercase text-[11px] tracking-wider">
                  <Sparkles className="h-4 w-4" /> Enable AI Refinement
                </Label>
             </div>
             {newPlaceholder.is_ai_generated && (
               <Textarea 
                className="bg-purple-50/30 border-purple-100" 
                placeholder="Prompt: Rewrite the source data to be more professional..." 
                value={newPlaceholder.ai_prompt}
                onChange={e => setNewPlaceholder({...newPlaceholder, ai_prompt: e.target.value})}
               />
             )}
          </div>
        </div>
      </div>
    </ScrollArea>

    <DialogFooter className="px-6 py-4 bg-white border-t shrink-0 flex items-center justify-between">
      <Button variant="ghost" onClick={() => setIsPlaceholderFormOpen(false)}>Discard Changes</Button>
      <Button 
        onClick={savePlaceholder} 
        disabled={!newPlaceholder.name.trim()}
        className="bg-blue-600 hover:bg-blue-700 px-8 shadow-lg shadow-blue-100"
      >
        {isEditingPlaceholder !== null ? 'Apply Updates' : 'Confirm & Add'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </>
  );
}