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
import { Loader2, PlusCircle, Trash2, FileText, Pencil, Save, RefreshCw, ChevronDown, Check, ChevronsUpDown, Link2, X, Search, View, Download, UserCog, Users, User, Code, Hash, Database, Sparkles, HelpCircle, Layers, Info, ArrowUp, ArrowDown, Plus } from "lucide-react";
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
import { EntityType, ENTITY_TYPES, DEPENDANT_RELATIONSHIPS, DIRECTOR_TYPES, type DirectorType } from "@/lib/constants/entity-types";
import { COMPUTED_FUNCTIONS, EXECUTION_MODES, LINKING_VARIABLES } from "@/lib/constants/computed-functions";
import { useTableData, type TableOption } from "@/lib/tableUtils";
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
  sub_questions?: Array<{
    id: string;
    type: string;
    label: string;
    required?: boolean;
  }>;
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
  { value: 'if', label: 'If Statement' },
  { value: 'boolean', label: 'Boolean/Checkbox' },
  { value: 'image', label: 'Image' },
  { value: 'document_checklist', label: 'Document Checklist' }, // NEW
];

// Update the Placeholder type to handle hierarchy
type ConditionalCondition = {
  tag: string;           // e.g., 'child_kenyan_id_no', 'country_check'
  label: string;         // e.g., 'Kenyan ID No: ', 'Country Check'
  master_field_id?: number; // The specific master field for this condition
  // NEW: Support comparison logic for conditions like "country not equals Kenya"
  comparison?: {
    field?: string;           // e.g., 'country_of_residence'
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;           // e.g., 'Kenya'
  };
};

type BooleanCondition = {
  tag: string;
  label: string;
  master_field_id?: number; // Optional
  linked_job_question_id?: string; // Add this
  comparison?: {
    field?: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  };
};

type IfStatement = {
  condition: {
    field: string;           // e.g., 'country_of_residence'
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;           // e.g., 'Kenya'
  };
  then_value: string;       // Value to display if condition is true
  else_value?: string;      // Optional value to display if condition is false
};

// Base interface for shared media functionality
interface BaseMediaConfig {
  source_table?: string;
  linking_variable?: "id" | "individual_id" | "director_id" | "document_id" | "company_id" | null;
  entity_types?: EntityType[];
  computed_function?: string;
  execution_mode?: 'all' | 'latest';
  document_type_ids?: string[]; // NEW: Specific document types to filter by
}

// Document checklist specific configuration
interface DocumentChecklistConfig extends BaseMediaConfig {
  checklist_data_sources?: Array<{
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string; // e.g., 'company_id', 'director_id', 'individual_id'
    id: string; // unique identifier for this mapping
    entity_types: EntityType[]; // entity context for this specific data source
    computed_function?: string; // computed function for this data source
    linked_document_ids?: string[]; // documents linked to this data source
  }>;
  checklist_display_format?: 'bullets' | 'checkboxes' | 'table';
}

// Image specific configuration  
interface ImageConfig extends BaseMediaConfig {
  image_width?: string;
  image_height?: string;
  is_ai_generated?: boolean;
  ai_prompt?: string;
  linked_master_field_id?: string;
}

type Placeholder = {
  id: string;
  name: string;
  description?: string;
  display_value?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'array' | 'conditional' | 'if' | 'image' | 'boolean' | 'ordinal' | 'document_checklist';
  array_direction?: 'horizontal' | 'vertical';
  boolean_conditions?: BooleanCondition[];
  boolean_type?: 'single' | 'multiple';
  if_statement?: IfStatement;  // NEW: For if statement logic
  required: boolean;
  options?: string[];
  entity_type: EntityType[];
  parent_name?: string;
  is_block_start?: boolean;
  director_type?: DirectorType;
  dependant_relationship?: string[];
  conditions?: ConditionalCondition[];
  ordinal_format?: 'number' | 'word' | 'custom';
  custom_ordinal_format?: string;
  source_logic?: 'all' | 'priority'
  linked_document_ids?: string[];
  
  // Document Checklist Configuration (using DocumentChecklistConfig)
  document_checklist_config?: DocumentChecklistConfig;
  
  // Image Configuration (using ImageConfig)
  image_config?: ImageConfig;
  
  // Shared Media Configuration (using BaseMediaConfig)
  media_config?: BaseMediaConfig;
  
  // Other existing fields
  master_field_ids?: number[];
  linked_job_question_ids?: string[]; // Plural
  linked_requirement_ids?: string[];
  default_value?: string;
};

const getCleanText = (str: string) => str.replace(/<[^>]+>/g, '');

// Helper function to render job questions with sub_questions support
function renderJobQuestionOptions(jobQuestions: JobQuestion[], searchQuery?: string) {
  // If no search query, render all questions normally
  if (!searchQuery?.trim()) {
    return jobQuestions.map(q => {
      if (q.type === 'field_group' && q.sub_questions?.length) {
        return (
          <React.Fragment key={q.id}>
            <SelectItem value={q.id} className="font-semibold text-purple-700">
              📁 {q.label}
            </SelectItem>
            {q.sub_questions.map(sub => (
              <SelectItem key={sub.id} value={sub.id} className="pl-6 text-sm text-slate-600">
                📄 {sub.label}
              </SelectItem>
            ))}
          </React.Fragment>
        );
      }
      return (
        <SelectItem key={q.id} value={q.id}>
          {q.label}
        </SelectItem>
      );
    });
  }

  // With search query, filter and show matching field groups with their matching sub-questions
  const searchLower = searchQuery.toLowerCase();
  
  return jobQuestions.map(q => {
    if (q.type === 'field_group' && q.sub_questions?.length) {
      const groupMatches = q.label.toLowerCase().includes(searchLower);
      const matchingSubQuestions = q.sub_questions.filter(sub => 
        sub.label.toLowerCase().includes(searchLower)
      );
      
      // Show field group if group name matches OR has matching sub-questions
      if (groupMatches || matchingSubQuestions.length > 0) {
        return (
          <React.Fragment key={q.id}>
            <SelectItem value={q.id} className="font-semibold text-purple-700">
              📁 {q.label}
            </SelectItem>
            {/* Show only matching sub-questions, or all if group matches */}
            {(groupMatches ? q.sub_questions : matchingSubQuestions).map(sub => (
              <SelectItem key={sub.id} value={sub.id} className="pl-6 text-sm text-slate-600">
                📄 {sub.label}
              </SelectItem>
            ))}
          </React.Fragment>
        );
      }
      
      // Don't show field group if no matches
      return null;
    }
    
    // Regular questions - show only if they match
    const matches = q.label.toLowerCase().includes(searchLower);
    return matches ? (
      <SelectItem key={q.id} value={q.id}>
        {q.label}
      </SelectItem>
    ) : null;
  }).filter(Boolean);
}

// Shared Media Data Source Component for common functionality
function MediaDataSource({
  config,
  onChange,
  tables,
  loadingTables,
  documentTypes,
  masterFields,
  showEntityTypes = true,
  showDocumentLinks = false,
  showComputedFunction = true,
  showDimensions = false,
  showAI = false,
  showMasterFieldSync = false,
  title = "Data Source Configuration"
}: {
  config: BaseMediaConfig;
  onChange: (updates: Partial<BaseMediaConfig>) => void;
  tables: TableOption[];
  loadingTables: boolean;
  documentTypes: any[];
  masterFields: JobField[];
  showEntityTypes?: boolean;
  showDocumentLinks?: boolean;
  showComputedFunction?: boolean;
  showDimensions?: boolean;
  showAI?: boolean;
  showMasterFieldSync?: boolean;
  title?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-blue-600" />
        <Label className="text-sm font-medium text-blue-800">{title}</Label>
      </div>

      {/* Source Table Selection */}
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">Source Table</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
              <span className="text-slate-400">
                {config.source_table ? tables.find(t => t.name === config.source_table)?.label || config.source_table : "Select source table..."}
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
                      <CommandItem key={table.name} onSelect={() => onChange({ source_table: table.name })}>
                        <Check className={cn("mr-2 h-4 w-4", config.source_table === table.name ? "opacity-100" : "opacity-0")} />
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

      {/* Linking Variable */}
      {config.source_table && (
        <div className="space-y-2">
          <Label className="text-xs font-bold text-slate-500">Linking Variable</Label>
          <Select value={config.linking_variable || ''} onValueChange={(value) => onChange({ linking_variable: value || null })}>
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

      {/* Document Types */}
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">Document Types</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
              <span className="text-slate-400">
                {config.document_type_ids?.length > 0
                  ? `${config.document_type_ids.length} document type${config.document_type_ids.length > 1 ? 's' : ''} selected`
                  : "Select document types..."
                }
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[350px] max-h-[250px] overflow-y-auto">
            {documentTypes.map(docType => (
              <DropdownMenuCheckboxItem
                key={docType.id}
                checked={config.document_type_ids?.includes(docType.id) || false}
                onCheckedChange={(checked) => {
                  const current = config.document_type_ids || [];
                  const updated = checked
                    ? [...current, docType.id]
                    : current.filter(id => id !== docType.id);
                  onChange({ document_type_ids: updated });
                }}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-slate-400" />
                  <span className="text-sm">{docType.display_name || docType.name}</span>
                  {docType.description && (
                    <span className="text-xs text-slate-400 ml-1">({docType.description})</span>
                  )}
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {config.document_type_ids && config.document_type_ids.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {config.document_type_ids.map(typeId => {
              const docType = documentTypes.find(dt => dt.id === typeId);
              return docType ? (
                <Badge key={typeId} variant="secondary" className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border-amber-200">
                  <FileText className="h-3 w-3 mr-1" />
                  {docType.display_name || docType.name}
                  <button
                    onClick={() => {
                      const updated = config.document_type_ids?.filter(id => id !== typeId) || [];
                      onChange({ document_type_ids: updated });
                    }}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* Entity Types */}
      {showEntityTypes && (
        <div className="space-y-2">
          <Label className="text-xs font-bold text-slate-500">Entity Types</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
                <span className="text-slate-400">
                  {config.entity_types?.length > 0
                    ? config.entity_types.map(et => ENTITY_TYPES.find(t => t.value === et)?.label || et).join(', ')
                    : "Select entity types..."
                  }
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[300px] max-h-[200px] overflow-y-auto">
              {ENTITY_TYPES.map(entity => (
                <DropdownMenuCheckboxItem
                  key={entity.value}
                  checked={config.entity_types?.includes(entity.value) || false}
                  onCheckedChange={(checked) => {
                    const current = config.entity_types || [];
                    const updated = checked
                      ? [...current, entity.value]
                      : current.filter(et => et !== entity.value);
                    onChange({ entity_types: updated });
                  }}
                >
                  <span className="text-sm">{entity.label}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Computed Function */}
      {showComputedFunction && (
        <div className="pt-4 border-t">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500">Extraction / Computed Function</Label>
            <Select value={config.computed_function || 'none'} onValueChange={(v) => {
              const updates: Partial<BaseMediaConfig> = { computed_function: v };

              if (v === 'none') {
                updates.execution_mode = 'latest';
              } else if (v.includes('Latest')) {
                updates.execution_mode = 'latest';
              } else {
                updates.execution_mode = 'all';
              }

              onChange(updates);
            }}>
              <SelectTrigger className="bg-white h-9">
                <SelectValue placeholder="Select extraction function..." />
              </SelectTrigger>
              <SelectContent>
                {COMPUTED_FUNCTIONS.map(fn => (
                  <SelectItem key={fn.value} value={fn.value}>
                    {fn.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Image Dimensions */}
      {showDimensions && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-green-700">Image Width</Label>
            <Input className="bg-white" placeholder="e.g. 200px" />
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-green-700">Image Height</Label>
            <Input className="bg-white" placeholder="e.g. 150px" />
          </div>
        </div>
      )}

      {/* AI Refinement */}
      {showAI && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="is_ai" />
            <Label htmlFor="is_ai" className="text-purple-700 font-bold flex items-center gap-2 uppercase text-[11px] tracking-wider">
              <Sparkles className="h-4 w-4" /> Enable AI Refinement
            </Label>
          </div>
          <Textarea
            className="bg-purple-50/30 border-purple-100"
            placeholder="Prompt: Rewrite the source data to be more professional..."
          />
        </div>
      )}

      {/* Master Field Sync */}
      {showMasterFieldSync && (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-blue-600">Master Field Sync</Label>
          <Select value="none" onValueChange={() => {}}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Link field..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {masterFields.map(mf => (
                <SelectItem key={mf.id} value={String(mf.id)}>{mf.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// Centralized Master Database Field Picker Component
function MasterFieldPicker({
  masterFields,
  allowMultiple = false,
  selectedFieldId,
  selectedFieldIds = [],
  onSelect,
  onMultipleSelect,
  onClear,
  placeholder = "Select master fields...",
}: {
  masterFields: JobField[];
  allowMultiple?: boolean;
  selectedFieldId?: number;
  selectedFieldIds?: number[];
  onSelect?: (field: JobField) => void;
  onMultipleSelect?: (fieldIds: number[]) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Handle selection state
  const currentSelection = useMemo(() => {
    if (allowMultiple) return selectedFieldIds;
    if (selectedFieldId) return [selectedFieldId];
    return [];
  }, [allowMultiple, selectedFieldId, selectedFieldIds]);

  const selectedFields = useMemo(() =>
    masterFields.filter(f => currentSelection.includes(f.id)),
    [masterFields, currentSelection]);

  const filteredFields = useMemo(() => {
    if (!search?.trim()) return masterFields;
    const searchLower = search.toLowerCase();
    return masterFields.filter(field =>
      field.label.toLowerCase().includes(searchLower) ||
      field.field_key.toLowerCase().includes(searchLower)
    );
  }, [masterFields, search]);

  const handleSingleSelect = (field: JobField) => {
    onSelect?.(field);
    setOpen(false);
  };

  const handleMultipleSelect = (fieldId: number) => {
    const isSelected = currentSelection.includes(fieldId);
    const newSelection = isSelected
      ? currentSelection.filter(id => id !== fieldId)
      : [...currentSelection, fieldId];
    onMultipleSelect?.(newSelection);
  };

  const handleClear = () => {
    if (allowMultiple) {
      onMultipleSelect?.([]);
    } else if (selectedFieldId) {
      onSelect?.(undefined as any);
    }
    onClear?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedFields.length > 0
                  ? allowMultiple
                    ? `${selectedFields.length} field${selectedFields.length > 1 ? 's' : ''} selected`
                    : selectedFields[0]?.label || "Select master field..."
                  : placeholder
                }
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
                    const isSelected = currentSelection.includes(field.id);
                    return (
                      <CommandItem
                        key={field.id}
                        value={field.label}
                        onSelect={() => {
                          if (allowMultiple) {
                            handleMultipleSelect(field.id);
                          } else {
                            handleSingleSelect(field);
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
              handleClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedFields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedFields.map((field) => (
            <Badge
              key={field.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-blue-50 text-blue-700 border-blue-200"
            >
              <Database className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{field.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (allowMultiple) {
                    handleMultipleSelect(field.id);
                  } else {
                    handleClear();
                  }
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

// Centralized JobQuestionPicker component
interface JobQuestionPickerProps {
  jobQuestions: JobQuestion[];
  selectedQuestionId?: string;
  onSelect: (question: JobQuestion) => void;
  onClear?: () => void;
  placeholder?: string;
  allowMultiple?: boolean;
  selectedQuestionIds?: string[];
  onMultipleSelect?: (questionIds: string[]) => void;
  className?: string;
}

function JobQuestionPicker({
  jobQuestions,
  selectedQuestionId,
  onSelect,
  onClear,
  placeholder = "Select job question...",
  allowMultiple = false,
  selectedQuestionIds = [],
  onMultipleSelect,
  className = ""
}: JobQuestionPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedQuestion = useMemo(() =>
    jobQuestions.find(q => q.id === selectedQuestionId),
    [jobQuestions, selectedQuestionId]);

  const selectedQuestions = useMemo(() =>
    jobQuestions.filter(q => selectedQuestionIds.includes(q.id)),
    [jobQuestions, selectedQuestionIds]);

  const filteredQuestions = useMemo(() => {
    if (!search) return jobQuestions;
    const searchLower = search.toLowerCase();
    
    return jobQuestions.map(question => {
      // If it's a field group, check if the group name matches or any sub-question matches
      if (question.type === 'field_group' && question.sub_questions?.length) {
        const groupMatches = question.label.toLowerCase().includes(searchLower) ||
                           question.type.toLowerCase().includes(searchLower);
        
        const matchingSubQuestions = question.sub_questions.filter(sub => 
          sub.label.toLowerCase().includes(searchLower) ||
          sub.type.toLowerCase().includes(searchLower)
        );
        
        // If group matches or has matching sub-questions, return the question with appropriate sub-questions
        if (groupMatches || matchingSubQuestions.length > 0) {
          return {
            ...question,
            sub_questions: groupMatches ? question.sub_questions : matchingSubQuestions,
            // Add a flag to indicate this is a search result with matches
            _hasMatchingSubQuestions: matchingSubQuestions.length > 0 && !groupMatches
          };
        }
        
        // If no matches, exclude this field group
        return null;
      }
      
      // For regular questions, check if they match
      const matches = question.label.toLowerCase().includes(searchLower) ||
                     question.type.toLowerCase().includes(searchLower);
      
      return matches ? question : null;
    }).filter(Boolean) as (JobQuestion & { _hasMatchingSubQuestions?: boolean })[];
  }, [jobQuestions, search]);

  // Helper function to render questions with sub_questions
  const renderQuestionItem = (question: JobQuestion, isSubQuestion = false) => {
    const isSelected = allowMultiple 
      ? selectedQuestionIds.includes(question.id)
      : selectedQuestionId === question.id;
    const indentClass = isSubQuestion ? 'pl-6' : '';
    const iconClass = isSubQuestion ? '📄' : question.type === 'field_group' ? '📁' : '📝';
    const textClass = isSubQuestion ? 'text-sm text-slate-600' : question.type === 'field_group' ? 'font-semibold text-purple-700' : 'font-medium';
    
    return (
      <CommandItem
        key={question.id}
        value={question.label}
        onSelect={() => {
          if (allowMultiple && onMultipleSelect) {
            const currentIds = [...selectedQuestionIds];
            if (isSelected) {
              onMultipleSelect(currentIds.filter(id => id !== question.id));
            } else {
              onMultipleSelect([...currentIds, question.id]);
            }
          } else {
            onSelect(question);
            setOpen(false);
          }
        }}
        className={`cursor-pointer ${indentClass}`}
      >
        <div className="flex items-center">
          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
            {isSelected && <Check className="h-3 w-3" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">{iconClass}</span>
            <div>
              <div className={textClass}>{question.label}</div>
              <div className="text-xs text-muted-foreground capitalize">{question.type}</div>
            </div>
          </div>
        </div>
      </CommandItem>
    );
  };

  const displayText = allowMultiple 
    ? selectedQuestions.length > 0 
      ? `${selectedQuestions.length} question${selectedQuestions.length > 1 ? 's' : ''} selected`
      : placeholder
    : selectedQuestion
      ? selectedQuestion.label
      : placeholder;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">{displayText}</span>
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
                  {filteredQuestions.map((question) => {
                    if (question.type === 'field_group' && question.sub_questions?.length) {
                      return (
                        <React.Fragment key={question.id}>
                          {renderQuestionItem(question)}
                          {question.sub_questions.map(subQuestion => 
                            renderQuestionItem(subQuestion, true)
                          )}
                        </React.Fragment>
                      );
                    }
                    return renderQuestionItem(question);
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {((!allowMultiple && selectedQuestion) || (allowMultiple && selectedQuestions.length > 0)) && onClear && (
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

      {/* Display selected items */}
      {allowMultiple && selectedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedQuestions.map(question => (
            <Badge
              key={question.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-purple-50 text-purple-700 border-purple-200"
            >
              <HelpCircle className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{question.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMultipleSelect?.(selectedQuestionIds.filter(id => id !== question.id));
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-purple-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {!allowMultiple && selectedQuestion && (
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

function DataSourceMappingManager({
  dataSources,
  onChange,
  availableDocuments,
}: {
  dataSources: Array<{
    id: string;
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string;
    entity_types: EntityType[];
    computed_function?: string;
    linked_document_ids?: string[];
  }>;
  onChange: (dataSources: Array<{
    id: string;
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string;
    entity_types: EntityType[];
    computed_function?: string;
    linked_document_ids?: string[];
  }>) => void;
  availableDocuments: Array<{ id: string; display_name: string; name: string }>;
}) {
  const addDataSource = () => {
    const newDataSource = {
      id: Date.now().toString(),
      table: 'acc_portal_kyc_uploads' as const,
      linking_variable: 'company_id',
      entity_types: ['company'] as EntityType[],
      computed_function: 'none',
      linked_document_ids: [] as string[]
    };
    onChange([...dataSources, newDataSource]);
  };

  const updateDataSource = (id: string, updates: Partial<typeof dataSources[0]>) => {
    onChange(dataSources.map(ds => ds.id === id ? { ...ds, ...updates } : ds));
  };

  const removeDataSource = (id: string) => {
    if (dataSources.length > 1) {
      onChange(dataSources.filter(ds => ds.id !== id));
    }
  };

  return (
    <div className="space-y-3">
      {dataSources.map((dataSource, index) => (
        <div key={dataSource.id} className="p-3 bg-white rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold text-blue-700">Data Source {index + 1}</Label>
            {dataSources.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeDataSource(dataSource.id)}
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Entity Context</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full h-7 text-xs justify-between bg-white">
                    {dataSource.entity_types.length > 0
                      ? `${dataSource.entity_types.length} entit${dataSource.entity_types.length > 1 ? 'ies' : 'y'} selected`
                      : "Select entity types..."
                    }
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search entity types..." className="h-7 text-xs" />
                    <CommandList>
                      <CommandEmpty>No entity types found.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-y-auto">
                        {ENTITY_TYPES.map((type) => {
                          const isSelected = dataSource.entity_types.includes(type.value);
                          return (
                            <CommandItem
                              key={type.value}
                              value={type.value}
                              onSelect={() => {
                                const current = dataSource.entity_types;
                                if (isSelected) {
                                  updateDataSource(dataSource.id, {
                                    entity_types: current.filter(t => t !== type.value)
                                  });
                                } else {
                                  updateDataSource(dataSource.id, {
                                    entity_types: [...current, type.value]
                                  });
                                }
                              }}
                              className="cursor-pointer text-xs"
                            >
                              <div className={`mr-2 flex h-3 w-3 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                                {isSelected && <Check className="h-2 w-2" />}
                              </div>
                              <span className="text-xs">{type.label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Source Table</Label>
              <Select
                value={dataSource.table}
                onValueChange={(v: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents') =>
                  updateDataSource(dataSource.id, { table: v })
                }
              >
                <SelectTrigger className="h-7 text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acc_portal_kyc_uploads">KYC Uploads Table</SelectItem>
                  <SelectItem value="acc_portal_directors_documents">Directors Docs Table</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Linking Field</Label>
              <Input
                className="h-7 text-xs bg-white"
                placeholder="e.g. company_id"
                value={dataSource.linking_variable}
                onChange={e => updateDataSource(dataSource.id, { linking_variable: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Computed Function</Label>
              <Select
                value={dataSource.computed_function || 'none'}
                onValueChange={(v) => {
                  updateDataSource(dataSource.id, { computed_function: v });
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPUTED_FUNCTIONS.map(fn => (
                    <SelectItem key={fn.value} value={fn.value} className="text-xs">
                      {fn.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Selected Documents</Label>
              <DocumentPicker
                documents={availableDocuments}
                selectedDocumentIds={dataSource.linked_document_ids || []}
                onSelect={(documentId) => {
                  const current = dataSource.linked_document_ids || [];
                  updateDataSource(dataSource.id, {
                    linked_document_ids: [...current, documentId]
                  });
                }}
                onRemove={(documentId) => {
                  const current = dataSource.linked_document_ids || [];
                  updateDataSource(dataSource.id, {
                    linked_document_ids: current.filter(id => id !== documentId)
                  });
                }}
                onClear={() => {
                  updateDataSource(dataSource.id, {
                    linked_document_ids: []
                  });
                }}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addDataSource}
        className="w-full h-8 border-dashed border-blue-300 text-blue-600 hover:bg-blue-100"
      >
        <PlusCircle className="h-3 w-3 mr-2" />
        Add Data Source Mapping
      </Button>
    </div>
  );
}

function DocumentPicker({
  documents,
  selectedDocumentIds = [],
  onSelect,
  onRemove,
  onClear,
}: {
  documents: Array<{ id: string; display_name: string; name: string }>;
  selectedDocumentIds?: string[];
  onSelect: (documentId: string) => void;
  onRemove: (documentId: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedDocuments = useMemo(() =>
    documents.filter(d => selectedDocumentIds.includes(d.id)),
    [documents, selectedDocumentIds]);

  const filteredDocuments = useMemo(() => {
    if (!search) return documents;
    const searchLower = search.toLowerCase();
    return documents.filter(document =>
      document.display_name?.toLowerCase().includes(searchLower) ||
      document.name?.toLowerCase().includes(searchLower)
    );
  }, [documents, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedDocuments.length > 0
                  ? `${selectedDocuments.length} document${selectedDocuments.length > 1 ? 's' : ''} selected`
                  : "Select documents..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search documents..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No documents found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredDocuments.map((document) => {
                    const isSelected = selectedDocumentIds.includes(document.id);
                    return (
                      <CommandItem
                        key={document.id}
                        value={document.display_name || document.name}
                        onSelect={() => {
                          if (isSelected) {
                            onRemove(document.id);
                          } else {
                            onSelect(document.id);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div>
                            <div className="font-medium">{document.display_name || document.name}</div>
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
        {selectedDocuments.length > 0 && (
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

      {selectedDocuments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedDocuments.map(document => (
            <Badge
              key={document.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-green-50 text-green-700 border-green-200"
            >
              <FileText className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{document.display_name || document.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(document.id);
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

// Centralized Requirement Picker Component
function RequirementPicker({
  requirements,
  allowMultiple = false,
  selectedRequirementId,
  selectedRequirementIds = [],
  onSelect,
  onMultipleSelect,
  onClear,
  placeholder = "Select requirement...",
}: {
  requirements: Requirement[];
  allowMultiple?: boolean;
  selectedRequirementId?: string;
  selectedRequirementIds?: string[];
  onSelect?: (requirement: Requirement) => void;
  onMultipleSelect?: (requirementIds: string[]) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Handle selection state
  const currentSelection = useMemo(() => {
    if (allowMultiple) return selectedRequirementIds;
    if (selectedRequirementId) return [selectedRequirementId];
    return [];
  }, [allowMultiple, selectedRequirementId, selectedRequirementIds]);

  const selectedRequirements = useMemo(() =>
    requirements.filter(r => currentSelection.includes(r.id)),
    [requirements, currentSelection]);

  const filteredRequirements = useMemo(() => {
    if (!search?.trim()) return requirements;
    const searchLower = search.toLowerCase();
    return requirements.filter(requirement =>
      requirement.label.toLowerCase().includes(searchLower)
    );
  }, [requirements, search]);

  const handleSingleSelect = (requirement: Requirement) => {
    onSelect?.(requirement);
    setOpen(false);
  };

  const handleMultipleSelect = (requirementId: string) => {
    const isSelected = currentSelection.includes(requirementId);
    const newSelection = isSelected
      ? currentSelection.filter(id => id !== requirementId)
      : [...currentSelection, requirementId];
    onMultipleSelect?.(newSelection);
  };

  const handleClear = () => {
    if (allowMultiple) {
      onMultipleSelect?.([]);
    } else if (selectedRequirementId) {
      onSelect?.(undefined as any);
    }
    onClear?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedRequirements.length > 0
                  ? allowMultiple
                    ? `${selectedRequirements.length} requirement${selectedRequirements.length > 1 ? 's' : ''} selected`
                    : selectedRequirements[0]?.label || "Select requirement..."
                  : placeholder
                }
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
                  {filteredRequirements.map((requirement) => {
                    const isSelected = currentSelection.includes(requirement.id);
                    return (
                      <CommandItem
                        key={requirement.id}
                        value={requirement.label}
                        onSelect={() => {
                          if (allowMultiple) {
                            handleMultipleSelect(requirement.id);
                          } else {
                            handleSingleSelect(requirement);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
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
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedRequirements.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedRequirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRequirements.map((requirement) => (
            <Badge
              key={requirement.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-green-50 text-green-700 border-green-200"
            >
              <FileText className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{requirement.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (allowMultiple) {
                    handleMultipleSelect(requirement.id);
                  } else {
                    handleClear();
                  }
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
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-blue-600" onClick={() => moveItem('master_field_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-blue-600" onClick={() => moveItem('master_field_ids', idx, 'down')} disabled={idx === placeholder.master_field_ids.length - 1}><ArrowDown className="h-3 w-3" /></Button>
            </div>
            <Database className="h-3.5 w-3.5 text-blue-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{masterFields.find(f => f.id === id)?.label || id}</p>
              <p className="text-[9px] text-blue-500/70 font-mono">DB Field</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('db', id)}><X className="h-4 w-4" /></Button>
          </div>
        ))}

        {/* Job Questions */}
        {placeholder.linked_job_question_ids?.map((id, idx) => (
          <div key={`job-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-purple-600" onClick={() => moveItem('linked_job_question_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-purple-600" onClick={() => moveItem('linked_job_question_ids', idx, 'down')} disabled={idx === placeholder.linked_job_question_ids.length - 1}><ArrowDown className="h-3 w-3" /></Button>
            </div>
            <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{jobQuestions.find(q => q.id === id)?.label || id}</p>
              <p className="text-[9px] text-purple-500/70 font-mono">Job Question</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('job', id)}><X className="h-4 w-4" /></Button>
          </div>
        ))}

        {/* Requirements */}
        {placeholder.linked_requirement_ids?.map((id, idx) => (
          <div key={`req-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-green-600" onClick={() => moveItem('linked_requirement_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-green-600" onClick={() => moveItem('linked_requirement_ids', idx, 'down')} disabled={idx === placeholder.linked_requirement_ids.length - 1}><ArrowDown className="h-3 w-3" /></Button>
            </div>
            <FileText className="h-3.5 w-3.5 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{requirements.find(r => r.id === id)?.label || id}</p>
              <p className="text-[9px] text-green-500/70 font-mono">Requirement</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('req', id)}><X className="h-4 w-4" /></Button>
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
    display_value: '',  
    type: 'text',
    required: false,
    entity_type: [],
    default_value: '',
    array_direction: 'vertical',
    checklist_data_sources: [],
    image_width: '',
    image_height: '',
    linked_job_question_id: undefined,
    linked_requirement_id: undefined,
    director_type: 'all',
    dependant_relationship: [],
    computed_function: 'none',
    execution_mode: 'latest',
    source_table: '',
    linking_variable: null,
    linked_master_field_id: undefined,
  });
  const [directorType, setDirectorType] = useState<DirectorType>('all');
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

  // Table data hook for fetching available tables
  const { tables, loadingTables } = useTableData();
  const [kycDocuments, setKycDocuments] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);

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
      fetchKycDocuments();
      fetchDocumentTypes();
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

  const fetchKycDocuments = async () => {
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('*').order('name');
      if (error) throw error;
      setKycDocuments(data || []);
    } catch (error) {
      console.error('Error fetching KYC documents:', error);
      setKycDocuments([]);
    }
  };

  const fetchDocumentTypes = async () => {
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('*').order('display_name');
      if (error) throw error;
      setDocumentTypes(data || []);
    } catch (error) {
      console.error('Error fetching document types:', error);
      setDocumentTypes([]);
    }
  };

  const validateTemplate = async (file: File): Promise<boolean> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      // Word stores main content in document.xml
      let xmlContent = zip.files['word/document.xml'].asText();

      // Check for additional content files (header.xml, footer.xml)
      let headerContent = '';
      let footerContent = '';
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

  const handleRescanPlaceholders = async () => {
    if (!currentTemplate || currentTemplateIndex === null) return;

    const source = currentTemplate.content
      ? { type: 'text', content: currentTemplate.content }
      : { type: 'file', content: templateFiles.get(currentTemplate.id)! };

    if (source.type === 'file' && !source.content) {
      toast({ title: "No source file found to rescan" });
      return;
    }

    // 1. Get raw tags from current content
    const newlyExtracted = await extractPlaceholders(source);

    // 2. Merge safely
    const updatedTemplates = [...templates];
    const existing = updatedTemplates[currentTemplateIndex].placeholders || [];

    updatedTemplates[currentTemplateIndex].placeholders = mergePlaceholders(
      existing,
      newlyExtracted,
      masterFields
    );

    updatedTemplates[currentTemplateIndex].isDirty = false;
    setTemplates(updatedTemplates);

    toast({ title: "Content Synced", description: "Updated tag list while preserving your field settings." });
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

      // Calculate total sources for the Priority Logic indicator
      const sourceCount = (p.master_field_ids?.length || 0) +
        (p.linked_job_question_ids?.length || 0) +
        (p.linked_requirement_ids?.length || 0);

      return (
        <TableRow
          key={p.id}
          className={cn(
            "group transition-colors",
            isChild && "bg-muted/5 hover:bg-muted/10",
            isBlock && "bg-blue-50/30 hover:bg-blue-50/50"
          )}
        >
          {/* FIELD NAME & TAG */}
          <TableCell className="border-r py-3">
            <div className={cn(
              "flex items-center gap-2 font-mono text-[11px]",
              isChild && "pl-6 border-l-2 border-blue-200 ml-2"
            )}>
              {isBlock ? (
                <Badge className="bg-blue-600 hover:bg-blue-700 h-4 px-1 text-[9px] uppercase">Block</Badge>
              ) : isChild ? (
                <Link2 className="h-3 w-3 text-blue-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-slate-400" />
              )}
              <div className="flex flex-col">
                <span className={cn("font-bold", isBlock ? "text-blue-800" : "text-slate-700")}>
                  {isBlock ? `{#${p.name}}` : `{${p.name}}`}
                </span>
                {p.is_digit_split && (
                  <span className="text-[8px] text-orange-600 font-bold uppercase tracking-tighter">Digit Split: 1-{p.digit_count}</span>
                )}
              </div>
            </div>
          </TableCell>

          {/* TYPE INDICATOR */}
          <TableCell className="border-r">
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className={cn(
                "capitalize text-[9px] font-bold px-1.5 h-5",
                p.type === 'document_checklist' && "border-blue-200 bg-blue-50 text-blue-700",
                p.type === 'conditional' && "border-indigo-200 bg-indigo-50 text-indigo-700",
                p.type === 'boolean' && "border-purple-200 bg-purple-50 text-purple-700",
                p.type === 'image' && "border-green-200 bg-green-50 text-green-700",
                p.type === 'array' && "border-orange-200 bg-orange-50 text-orange-700"
              )}>
                {p.type.replace('_', ' ')}
              </Badge>
              {p.is_ai_generated && (
                <Sparkles className="h-3 w-3 text-purple-500 animate-pulse" />
              )}
            </div>
          </TableCell>

          {/* ENTITY CONTEXT */}
          <TableCell className="border-r">
            <div className="flex flex-wrap gap-1">
              {p.entity_type?.map(et => (
                <Badge key={et} variant="secondary" className="text-[9px] capitalize h-4 px-1 font-normal">
                  {et}
                </Badge>
              ))}
            </div>
          </TableCell>

          {/* DATA SOURCES & PRIORITY */}
          <TableCell className="border-r min-w-[200px]">
            <div className="flex flex-col gap-1.5">
              {/* Database Fields */}
              {p.master_field_ids?.map(id => (
                <div key={id} className="flex items-center gap-1.5 text-[10px] text-blue-700 bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100 w-fit">
                  <Database className="h-2.5 w-2.5" />
                  <span className="truncate max-w-[120px]">{masterFieldMap.get(id) || id}</span>
                </div>
              ))}

              {/* Job Questions */}
              {p.linked_job_question_ids?.map(id => (
                <div key={id} className="flex items-center gap-1.5 text-[10px] text-purple-700 bg-purple-50/50 px-1.5 py-0.5 rounded border border-purple-100 w-fit">
                  <HelpCircle className="h-2.5 w-2.5" />
                  <span className="truncate max-w-[120px]">{jobQuestions.find(q => q.id === id)?.label || 'Job Question'}</span>
                </div>
              ))}

              {/* Requirements */}
              {p.linked_requirement_ids?.map(id => (
                <div key={id} className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50/50 px-1.5 py-0.5 rounded border border-green-100 w-fit">
                  <FileText className="h-2.5 w-2.5" />
                  <span className="truncate max-w-[120px]">{requirements.find(r => r.id === id)?.label || 'Requirement'}</span>
                </div>
              ))}

              {/* Type Specific Summaries */}
              {p.type === 'document_checklist' && (
                <div className="text-[9px] text-slate-500 italic flex items-center gap-1">
                  <Layers className="h-2.5 w-2.5" /> {p.linked_document_ids?.length || 0} Docs Tracked
                </div>
              )}

              {p.type === 'conditional' && (
                <div className="text-[9px] text-slate-500 italic flex items-center gap-1">
                  <Code className="h-2.5 w-2.5" /> {p.conditions?.length || 0} Logic Blocks
                </div>
              )}

              {sourceCount > 1 && (
                <div className="pt-1 mt-1 border-t border-slate-100">
                  <Badge className="bg-slate-700 text-[8px] h-3 px-1 uppercase tracking-tighter">
                    {p.source_logic === 'all' ? 'Merge All' : 'Priority Fallback'}
                  </Badge>
                </div>
              )}

              {sourceCount === 0 && !isBlock && (
                <span className="text-[10px] text-slate-400 italic">No Data Source</span>
              )}
            </div>
          </TableCell>

          {/* DEFAULT / FALLBACK */}
          <TableCell className="border-r">
            {p.default_value ? (
              <code className="text-[10px] text-slate-600 bg-slate-100 px-1 rounded truncate block max-w-[80px]">
                "{p.default_value}"
              </code>
            ) : (
              <span className="text-[10px] text-slate-300">--</span>
            )}
          </TableCell>

          {/* ACTIONS */}
          <TableCell className="text-right">
            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600" onClick={() => editPlaceholder(originalIndex)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600" onClick={() => removePlaceholder(originalIndex)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    });
  };

  const autoGeneratePlaceholders = (extracted: string[], masterFields: JobField[] = []): Placeholder[] => {
    const arrayPlaceholders = extracted.filter(name =>
      name.endsWith('s') && // Simple heuristic: array names are often plural
      extracted.includes(name.slice(0, -1)) // Check if singular form exists
    );

    return extracted.map((name, index) => {
      const isImage = name.startsWith('%') && name.endsWith('%');
      const cleanName = isImage ? name.substring(1, name.length - 1) : name;
      const isArray = arrayPlaceholders.includes(name) ||
        (name.endsWith('s') && extracted.includes(name.slice(0, -1)));

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

  const mergePlaceholders = (
    existingPlaceholders: Placeholder[],
    newlyExtracted: Placeholder[], // Now accepts the full Placeholder objects from extractPlaceholders
    masterFields: JobField[] = []
  ): Placeholder[] => {
    // Map existing placeholders by name for quick lookup
    const existingMap = new Map(existingPlaceholders.map(p => [p.name, p]));

    // We iterate through the newly extracted placeholders to maintain the order found in the document
    return newlyExtracted.map(newPh => {
      const existing = existingMap.get(newPh.name);

      if (existing) {
        // TAG EXISTS: Preserving user-defined logic
        console.log(`[MERGE] Preserving data for tag: {${newPh.name}}`);

        return {
          ...existing, // 1. Start with everything the user already configured
          // 2. Overlay structural updates from the new scan
          parent_name: newPh.parent_name,
          is_block_start: newPh.is_block_start,
          // Only update type if it's structural (e.g. was text, now is a {#block})
          // But if the user manually set it to 'date' or 'select', keep that.
          type: (newPh.type === 'array' || newPh.type === 'conditional' || existing.type === 'image')
            ? newPh.type
            : existing.type,
          // Keep description unless it was empty and we have a new one from the scanner
          description: existing.description || newPh.description,
        };
      }

      // NEW TAG DETECTED: Use the scanner's version
      return newPh;
    });
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

    let processedHtml = '';

    if (typeof content === 'string') {
      processedHtml = content;
    } else {
      const { html, header = '', footer = '' } = content;
      processedHtml = [
        header ? `<header style="white-space: pre-wrap;">${header}</header>` : '',
        `<div class="template-body" style="white-space: pre-wrap;">${html}</div>`,
        footer ? `<footer style="white-space: pre-wrap;">${footer}</footer>` : ''
      ].filter(Boolean).join('\n');
    }

    updatedTemplates[currentTemplateIndex].content = processedHtml;
    updatedTemplates[currentTemplateIndex].isDirty = true;
    setTemplates(updatedTemplates);
  };

  const preserveFormat = (html: string) => {
    if (!html) return html;
    return html
      .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length)) // Convert multiple spaces to &nbsp;
      .replace(/\n/g, '<br />'); // Ensure literal newlines become HTML breaks
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

  const handleClearEntityTypes = () => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].entity_types = [];
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
        checklist_data_sources: newPlaceholder.checklist_data_sources || [],
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
      display_value: '',
      type: 'text',
      required: false,
      entity_type: [],
      default_value: '',
      array_direction: 'vertical',
      checklist_data_sources: [],
      image_width: '',
      image_height: '',
      linked_job_question_id: undefined,
      linked_requirement_id: undefined,
      director_type: 'all',
      dependant_relationship: [],
      computed_function: 'none',
      execution_mode: 'latest',
      source_table: '',
      linking_variable: null,
      linked_master_field_id: undefined,
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
      is_ai_generated: placeholder.is_ai_generated || false,
      ai_prompt: placeholder.ai_prompt || '',
      default_value: placeholder.default_value || '',
      display_value: placeholder.display_value || '',
      director_type: placeholder.director_type || 'all',
      dependant_relationship: placeholder.dependant_relationship || [],
      computed_function: placeholder.computed_function || 'none',
      execution_mode: placeholder.execution_mode || 'latest',
      source_table: placeholder.source_table || '',
      linking_variable: placeholder.linking_variable || null,
      linked_master_field_id: placeholder.linked_master_field_id || undefined,
      checklist_data_sources: placeholder.checklist_data_sources || [],
    });

    // Set director type if applicable
    if (placeholder.entity_type?.includes('director') && placeholder.director_type) {
      setDirectorType(placeholder.director_type as DirectorType);
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

        // If template has a file to upload, upload it to kyc-templates/document_id structure
        if (template.id.startsWith('temp_') && templateFiles.has(template.id)) {
          const file = templateFiles.get(template.id);
          if (file) {
            // Create the new file path in kyc-templates/document_id structure
            const fileName = `${Date.now()}_${file.name}`;
            filePath = `kyc-templates/${document.id}/${fileName}`;

            // Upload file to the new path
            const { error: uploadError } = await supabase.storage
              .from('templates')
              .upload(filePath, file, {
                contentType: file.type,
                upsert: true
              });

            if (uploadError) throw uploadError;
          }
        }

        // If it's an HTML template (Text Template), sanitize whitespace
        let finalContent = template.content;
        if (finalContent && !template.file_name) {
          // Only apply this to Text Templates, not docx binary references
          finalContent = preserveFormat(finalContent);
        }

        const templateData = {
          file_name: template.name,
          document_id: document.id,
          file_path: filePath, // Updated with new path
          content: finalContent, // Use the sanitized content
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

      // More robust client-side check
      if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement) {
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = currentTemplate.file_name || 'document.docx';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (domError) {
          console.error('DOM manipulation error:', domError);
          // Fallback: open in new tab
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 100);
        }
      } else {
        console.error('Download not available in this environment');
        // Fallback for non-browser environments
        if (typeof window !== 'undefined') {
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 100);
        }
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download the document. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleManualRescan = async () => {
    if (!currentTemplate || currentTemplateIndex === null) return;

    try {
      setIsProcessing(true);

      let extracted: Placeholder[] = [];

      // Determine scan source
      if (currentTemplate.file_name && templateFiles.has(currentTemplate.id)) {
        const file = templateFiles.get(currentTemplate.id);
        if (file) {
          extracted = await extractPlaceholders({ type: 'file', content: file });
        }
      } else {
        extracted = await extractPlaceholders({
          type: 'text',
          content: currentTemplate.content || ''
        });
      }

      // Perform the safe merge
      const updatedTemplates = [...templates];
      const existingPlaceholders = updatedTemplates[currentTemplateIndex].placeholders || [];

      // Pass the arrays of Placeholder objects
      const merged = mergePlaceholders(
        existingPlaceholders,
        extracted,
        masterFields
      );

      updatedTemplates[currentTemplateIndex].placeholders = merged;
      updatedTemplates[currentTemplateIndex].isDirty = false;
      setTemplates(updatedTemplates);

      // UI Feedback
      const newlyAdded = merged.filter(m => !existingPlaceholders.find(e => e.name === m.name)).length;
      const preserved = merged.length - newlyAdded;

      toast({
        title: 'Sync Complete',
        description: `Synced ${merged.length} tags. Preserved logic for ${preserved} existing fields and added ${newlyAdded} new ones.`,
        variant: 'default'
      });

    } catch (error) {
      console.error('Error during manual rescan:', error);
      toast({
        title: 'Rescan Error',
        description: error instanceof Error ? error.message : 'Failed to sync placeholders',
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

          <div className="grid grid-cols-12 gap-6 py-4 flex-1 overflow-y-auto h-[calc(100vh - 150px)]">
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
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2"><Label htmlFor="template-name">Template Name</Label><Input id="template-name" value={currentTemplate.name || ''} onChange={handleTemplateNameChange} /></div>
                      <div className="space-y-2"><Label htmlFor="entity-type">Template For</Label>
                        <div className="flex gap-2 items-center">
                          <DropdownMenu className="flex-1">
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearEntityTypes}
                            title="Clear all entity types"
                            className="shrink-0 w-8 h-8 p-0 flex items-center justify-center"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
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
                        <div className="h-[950px] overflow-auto">
                          <Table className="border">
                            <TableHeader className="bg-gray-100 sticky top-0 z-10"><TableRow>
                              <TableHead className="border-r font-bold text-gray-700">Field</TableHead>
                              <TableHead className="border-r font-bold text-gray-700">Display Value</TableHead>
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
                                      <span className="text-sm text-gray-700">
                                        {p.display_value || '-'}
                                      </span>
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

                                    <TableCell className="border-r">
                                      <Badge
                                        variant="secondary"
                                        className={cn(
                                          "capitalize text-[10px]",
                                          isChild && "bg-blue-100 text-blue-700"
                                        )}
                                      >
                                        {p.default_value}
                                      </Badge>
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
                        </div>
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

          <ScrollArea className="flex-1 bg-slate-50/30 px-6 py-4 overflow-auto">
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
                  <Label htmlFor="display_value" className="text-[11px] font-black uppercase text-slate-400">Display Value</Label>
                  <Input
                    id="display_value"
                    placeholder="e.g. Client First Name"
                    value={newPlaceholder.display_value || ''}
                    onChange={(e) => setNewPlaceholder({ ...newPlaceholder, display_value: e.target.value })}
                    className="bg-slate-50"
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
              {/* Configuration: Type & Entity Scope */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400">Placeholder Type</Label>
                  <Select
                    value={newPlaceholder.type}
                    onValueChange={(v) => {
                      const updates: Partial<Placeholder> = { type: v as any };
                      
                      // Initialize checklist_data_sources when document_checklist is selected
                      if (v === 'document_checklist' && (!newPlaceholder.checklist_data_sources || newPlaceholder.checklist_data_sources.length === 0)) {
                        updates.checklist_data_sources = [{
                          id: `ds_${Date.now()}`,
                          table: 'acc_portal_kyc_uploads',
                          linking_variable: 'company_id',
                          entity_types: ['company'],
                          computed_function: 'none',
                          linked_document_ids: []
                        }];
                      }
                      
                      setNewPlaceholder({ ...newPlaceholder, ...updates });
                    }}
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
                  <div className="flex gap-2">
                    <Popover className="flex-1">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNewPlaceholder(prev => ({ ...prev, entity_type: [] }))}
                      title="Clear all entity contexts"
                      className="shrink-0 w-8 h-8 p-0 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Director & Dependant Configuration */}
              {(newPlaceholder.entity_type?.includes('director') || newPlaceholder.entity_type?.includes('dependant')) && (
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-4">
                  <Label className="text-[11px] font-black uppercase text-purple-600">Entity-Specific Configuration</Label>

                  {newPlaceholder.entity_type?.includes('director') && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-purple-700">Director Type</Label>
                      <div className="flex gap-2">
                        {DIRECTOR_TYPES.map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id={`director-${option.value}`}
                              name="director-type"
                              value={option.value}
                              checked={newPlaceholder.director_type === option.value}
                              onChange={(e) => setNewPlaceholder(prev => ({ ...prev, director_type: e.target.value as DirectorType }))}
                              className="h-4 w-4 text-purple-600"
                            />
                            <Label htmlFor={`director-${option.value}`} className="text-sm text-purple-700">
                              {option.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {newPlaceholder.entity_type?.includes('dependant') && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-purple-700">Dependant Relationships</Label>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {DEPENDANT_RELATIONSHIPS.map((relationship) => (
                          <div key={relationship.value} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`dep-${relationship.value}`}
                              checked={newPlaceholder.dependant_relationship?.includes(relationship.value) || false}
                              onChange={(e) => {
                                const current = newPlaceholder.dependant_relationship || [];
                                if (e.target.checked) {
                                  setNewPlaceholder(prev => ({
                                    ...prev,
                                    dependant_relationship: [...current, relationship.value]
                                  }));
                                } else {
                                  setNewPlaceholder(prev => ({
                                    ...prev,
                                    dependant_relationship: current.filter(r => r !== relationship.value)
                                  }));
                                }
                              }}
                              className="h-4 w-4 text-purple-600 rounded"
                            />
                            <Label htmlFor={`dep-${relationship.value}`} className="text-sm text-purple-700">
                              {relationship.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CONDITIONAL LOGIC BLOCKS */}
              {newPlaceholder.type === 'conditional' && (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-4">
                  <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                    <div className="space-y-0.5">
                      <Label className="text-[11px] font-black uppercase text-indigo-600">Logic Blocks (Conditional Sections)</Label>
                      <p className="text-[10px] text-indigo-400">Define sections that appear based on data existence or value comparisons.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                      onClick={() => {
                        const newCond = { tag: '', label: '', master_field_id: undefined };
                        setNewPlaceholder(prev => ({
                          ...prev,
                          conditions: [...(prev.conditions || []), newCond]
                        }));
                      }}
                    >
                      <PlusCircle className="h-3 w-3 mr-1.5" />
                      Add Block
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {(newPlaceholder.conditions || []).length === 0 && (
                      <div className="text-center py-6 border-2 border-dashed border-indigo-100 rounded-lg">
                        <Code className="h-8 w-8 mx-auto text-indigo-200 mb-2" />
                        <p className="text-[10px] text-indigo-300 uppercase font-bold">No logic blocks added yet</p>
                      </div>
                    )}

                    {(newPlaceholder.conditions || []).map((cond, idx) => (
                      <div key={idx} className="relative p-4 rounded-lg border bg-white shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-white border shadow-sm text-red-500 hover:bg-red-50"
                          onClick={() => {
                            const updated = [...newPlaceholder.conditions];
                            updated.splice(idx, 1);
                            setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-slate-400">Variable Tag (slug)</Label>
                            <Input
                              placeholder="e.g. spouse_details"
                              value={cond.tag}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\s+/g, '_').toLowerCase();
                                const updated = [...newPlaceholder.conditions];
                                updated[idx].tag = val;
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                              className="h-8 text-xs font-mono bg-slate-50"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-slate-400">Display Label (Prefix)</Label>
                            <Input
                              placeholder="e.g. Spouse Name: "
                              value={cond.label}
                              onChange={(e) => {
                                const updated = [...newPlaceholder.conditions];
                                updated[idx].label = e.target.value;
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                              className="h-8 text-xs bg-slate-50"
                            />
                          </div>
                        </div>

                        {/* NEW: Condition Type Toggle */}
                        <div className="space-y-2 pt-1">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Condition Type</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={!cond.comparison ? "default" : "outline"}
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => {
                                const updated = [...newPlaceholder.conditions];
                                delete updated[idx].comparison;
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                            >
                              <Database className="h-3 w-3 mr-1" />
                              Field Exists
                            </Button>
                            <Button
                              type="button"
                              variant={cond.comparison ? "default" : "outline"}
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => {
                                const updated = [...newPlaceholder.conditions];
                                updated[idx].comparison = { field: '', operator: 'equals', value: '' };
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                            >
                              <Code className="h-3 w-3 mr-1" />
                              Value Comparison
                            </Button>
                          </div>
                        </div>

                        {/* Existing: Field Exists Logic */}
                        {!cond.comparison && (
                          <div className="space-y-1.5 pt-1">
                            <Label className="text-[10px] uppercase font-bold text-slate-400">Trigger: If this field has data...</Label>
                            <MasterFieldPicker
                              masterFields={masterFields}
                              selectedFieldIds={cond.master_field_id ? [cond.master_field_id] : []}
                              onSelect={(fieldId) => {
                                const updated = [...newPlaceholder.conditions];
                                updated[idx].master_field_id = fieldId;
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                              onRemove={() => {
                                const updated = [...newPlaceholder.conditions];
                                delete updated[idx].master_field_id;
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                              onClear={() => {
                                const updated = [...newPlaceholder.conditions];
                                delete updated[idx].master_field_id;
                                setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                              }}
                            />
                          </div>
                        )}

                        {/* NEW: Value Comparison Logic */}
                        {cond.comparison && (
                          <div className="space-y-2 pt-1">
                            <Label className="text-[10px] uppercase font-bold text-slate-400">Comparison Logic</Label>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[9px] text-slate-500">Field</Label>
                                <Select
                                  value={cond.comparison?.field || ''}
                                  onValueChange={(value) => {
                                    const updated = [...newPlaceholder.conditions];
                                    updated[idx].comparison = { ...updated[idx].comparison, field: value };
                                    setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                                  }}
                                >
                                  <SelectTrigger className="h-7">
                                    <SelectValue placeholder="Select field..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {masterFields.map(field => (
                                      <SelectItem key={field.field_key} value={field.field_key}>
                                        {field.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] text-slate-500">Operator</Label>
                                <Select
                                  value={cond.comparison?.operator || 'equals'}
                                  onValueChange={(value) => {
                                    const updated = [...newPlaceholder.conditions];
                                    updated[idx].comparison = { ...updated[idx].comparison, operator: value as 'equals' | 'not_equals' | 'contains' };
                                    setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                                  }}
                                >
                                  <SelectTrigger className="h-7">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="not_equals">Not Equals</SelectItem>
                                    <SelectItem value="contains">Contains</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] text-slate-500">Value</Label>
                                <Input
                                  placeholder="e.g. Kenya"
                                  value={cond.comparison?.value || ''}
                                  onChange={(e) => {
                                    const updated = [...newPlaceholder.conditions];
                                    updated[idx].comparison = { ...updated[idx].comparison, value: e.target.value };
                                    setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                                  }}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mt-2 pt-2 border-t border-slate-50">
                          <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Tag Preview:</span>
                            <code className="text-[10px] text-indigo-600 font-bold">
                              {"{#"}{cond.tag || '...'}{"}"}{cond.label || ''}{"{"}{cond.tag || '...'}{"}"}{"{/"}{cond.tag || '...'}{"}"}
                            </code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BOOLEAN LOGIC */}
              {newPlaceholder.type === 'boolean' && (
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-black uppercase text-purple-600">Boolean Options & Comparison</Label>
                    <Select
                      value={newPlaceholder.boolean_type || 'single'}
                      onValueChange={(v) => setNewPlaceholder(prev => ({ ...prev, boolean_type: v }))}
                    >
                      <SelectTrigger className="w-32 h-7 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Radio (Pick One)</SelectItem>
                        <SelectItem value="multiple">Checkbox (Multi)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-auto pr-2">
                    {(newPlaceholder.boolean_conditions || []).map((cond, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-md border shadow-sm space-y-3 relative">
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5 absolute right-1 top-1 text-slate-300 hover:text-red-500"
                          onClick={() => {
                            const updated = [...newPlaceholder.boolean_conditions];
                            updated.splice(idx, 1);
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }}
                        ><X className="h-3.3 w-3.3" /></Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Tag (e.g. male)" value={cond.tag} onChange={e => {
                            const updated = [...newPlaceholder.boolean_conditions];
                            updated[idx].tag = e.target.value.toLowerCase();
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }} className="h-8 text-xs font-mono" />
                          <Input placeholder="Label (e.g. Male)" value={cond.label} onChange={e => {
                            const updated = [...newPlaceholder.boolean_conditions];
                            updated[idx].label = e.target.value;
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }} className="h-8 text-xs" />
                        </div>
                        <div className="flex gap-2 items-center bg-slate-50 p-2 rounded">
                          <Label className="text-[9px] font-bold text-slate-500">IF VALUE</Label>
                          <Select
                            value={cond.comparison?.operator || 'equals'}
                            onValueChange={v => {
                              const updated = [...newPlaceholder.boolean_conditions];
                              updated[idx].comparison = { ...updated[idx].comparison, operator: v };
                              setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                            }}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-24 bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">Equals</SelectItem>
                              <SelectItem value="not_equals">Not Equals</SelectItem>
                              <SelectItem value="contains">Contains</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input placeholder="Value..." value={cond.comparison?.value} onChange={e => {
                            const updated = [...newPlaceholder.boolean_conditions];
                            updated[idx].comparison = { ...updated[idx].comparison, value: e.target.value };
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }} className="h-6 text-xs bg-white" />
                        </div>
                        {/* Source Selection */}
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                            Source for Comparison
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            {/* Master Field Picker */}
                            <div className="space-y-1">
                              <Label className="text-[9px] text-blue-600 font-bold">Database Field</Label>
                              <MasterFieldPicker
                                masterFields={masterFields}
                                selectedFieldId={cond.master_field_id}
                                onSelect={(field) => {
                                  const updated = [...newPlaceholder.boolean_conditions];
                                  updated[idx] = {
                                    ...updated[idx],
                                    master_field_id: field.id,
                                    linked_job_question_id: undefined, // Clear the other one
                                    comparison: { field: field.field_key, operator: 'equals', value: cond.comparison?.value || '' }
                                  };
                                  setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                                }}
                                onClear={() => {
                                  const updated = [...newPlaceholder.boolean_conditions];
                                  updated[idx] = {
                                    ...updated[idx],
                                    master_field_id: undefined,
                                    linked_job_question_id: undefined,
                                    comparison: { operator: 'equals', value: '' }
                                  };
                                  setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                                }}
                                placeholder="Select DB field..."
                              />
                            </div>

                            {/* Job Question Picker */}
                            <div className="space-y-1">
                              <Label className="text-[9px] text-purple-600 font-bold">Job Question</Label>
                              <JobQuestionPicker
                                jobQuestions={jobQuestions}
                                selectedQuestionId={cond.linked_job_question_id}
                                onSelect={(question) => {
                                  const updated = [...newPlaceholder.boolean_conditions];
                                  updated[idx] = {
                                    ...updated[idx],
                                    linked_job_question_id: question.id,
                                    master_field_id: undefined, // Clear the other one
                                    comparison: { operator: 'equals', value: cond.comparison?.value || '' }
                                  };
                                  setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                                }}
                                onClear={() => {
                                  const updated = [...newPlaceholder.boolean_conditions];
                                  updated[idx] = {
                                    ...updated[idx],
                                    linked_job_question_id: undefined,
                                    master_field_id: undefined,
                                    comparison: { operator: 'equals', value: '' }
                                  };
                                  setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                                }}
                                placeholder="Select question..."
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full h-8 border-dashed border-purple-300 text-purple-600 hover:bg-purple-100" onClick={() => {
                      const updated = [...(newPlaceholder.boolean_conditions || []), {
                        tag: '',
                        label: '',
                        master_field_id: undefined,
                        linked_job_question_id: undefined,
                        comparison: { operator: 'equals', value: '' }
                      }];
                      setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                    }}><PlusCircle className="h-3.5 w-3.5 mr-2" /> Add Logic Option</Button>
                  </div>
                </div>
              )}

              {/* DOCUMENT CHECKLIST LOGIC */}
              {newPlaceholder.type === 'document_checklist' && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-black uppercase text-blue-600">Document Checklist Configuration</Label>
                  </div>

                  <div className="space-y-4">
                    {newPlaceholder.checklist_data_sources?.map((dataSource, index) => (
                      <div key={dataSource.id} className="bg-white p-4 rounded-lg border border-blue-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-blue-700">Data Source {index + 1}</Label>
                          {newPlaceholder.checklist_data_sources!.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = newPlaceholder.checklist_data_sources!.filter(ds => ds.id !== dataSource.id);
                                setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updated }));
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Entity Types</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
                                  <span className="text-slate-400">
                                    {dataSource.entity_types?.length > 0
                                      ? dataSource.entity_types.map(et => ENTITY_TYPES.find(t => t.value === et)?.label || et).join(', ')
                                      : "Select entity types..."
                                    }
                                  </span>
                                  <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-[300px] max-h-[200px] overflow-y-auto">
                                {ENTITY_TYPES.map(entity => (
                                  <DropdownMenuCheckboxItem
                                    key={entity.value}
                                    checked={dataSource.entity_types?.includes(entity.value) || false}
                                    onCheckedChange={(checked) => {
                                      const current = dataSource.entity_types || [];
                                      const updated = checked
                                        ? [...current, entity.value]
                                        : current.filter(et => et !== entity.value);
                                      const updatedDataSources = newPlaceholder.checklist_data_sources!.map(ds =>
                                        ds.id === dataSource.id ? { ...ds, entity_types: updated } : ds
                                      );
                                      setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updatedDataSources }));
                                    }}
                                  >
                                    <span className="text-sm">{entity.label}</span>
                                  </DropdownMenuCheckboxItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Document Links</Label>
                            <div className="space-y-2">
                              {dataSource.linked_document_ids?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {dataSource.linked_document_ids.map(docId => {
                                    const doc = kycDocuments.find(d => String(d.id) === String(docId))
                                    return doc ? (
                                      <Badge key={docId} variant="secondary" className="text-xs px-2 py-1">
                                        {doc.display_name || doc.name}
                                        <button
                                          onClick={() => {
                                            const current = dataSource.linked_document_ids || [];
                                            const updated = current.filter(id => id !== String(docId));
                                            const updatedDataSources = newPlaceholder.checklist_data_sources!.map(ds =>
                                              ds.id === dataSource.id ? { ...ds, linked_document_ids: updated } : ds
                                            );
                                            setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updatedDataSources }));
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
                                            const current = dataSource.linked_document_ids || [];
                                            const updated = current.includes(String(doc.id)) ? current : [...current, String(doc.id)];
                                            const updatedDataSources = newPlaceholder.checklist_data_sources!.map(ds =>
                                              ds.id === dataSource.id ? { ...ds, linked_document_ids: updated } : ds
                                            );
                                            setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updatedDataSources }));
                                          }}>
                                            <Check className={cn("mr-2 h-4 w-4", dataSource.linked_document_ids?.includes(String(doc.id)) ? "opacity-100" : "opacity-0")} />
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
                                      {dataSource.table ? tables.find(t => t.name === dataSource.table)?.label || dataSource.table : "Select source table..."}
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
                                              const updatedDataSources = newPlaceholder.checklist_data_sources!.map(ds =>
                                                ds.id === dataSource.id ? { ...ds, table: table.name } : ds
                                              );
                                              setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updatedDataSources }));
                                            }}>
                                              <Check className={cn("mr-2 h-4 w-4", dataSource.table === table.name ? "opacity-100" : "opacity-0")} />
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

                            {dataSource.table && (
                              <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500">Linking Variable</Label>
                                <Select value={dataSource.linking_variable || ''} onValueChange={(value) => {
                                  const updatedDataSources = newPlaceholder.checklist_data_sources!.map(ds =>
                                    ds.id === dataSource.id ? { ...ds, linking_variable: value } : ds
                                  );
                                  setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updatedDataSources }));
                                }}>
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
                                <Select value={dataSource.computed_function || 'none'} onValueChange={(v) => {
                                  const updatedDataSources = newPlaceholder.checklist_data_sources!.map(ds => {
                                    if (ds.id === dataSource.id) {
                                      const updates: Partial<any> = { computed_function: v };

                                      if (v === 'none') {
                                        updates.execution_mode = 'latest';
                                      } else if (v.includes('Latest')) {
                                        updates.execution_mode = 'latest';
                                      } else {
                                        updates.execution_mode = 'all';
                                      }

                                      return { ...ds, ...updates };
                                    }
                                    return ds;
                                  });
                                  setNewPlaceholder(prev => ({ ...prev, checklist_data_sources: updatedDataSources }));
                                }}>
                                  <SelectTrigger className="bg-white h-9">
                                    <SelectValue placeholder="Select extraction function..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {COMPUTED_FUNCTIONS.map(fn => (
                                      <SelectItem key={fn.value} value={fn.value}>
                                        {fn.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full border-dashed py-8 bg-white hover:bg-slate-50"
                          onClick={() => {
                            const newDataSource = {
                              id: `ds_${Date.now()}`,
                              table: 'acc_portal_kyc_uploads',
                              linking_variable: 'company_id',
                              entity_types: ['company'],
                              computed_function: 'none',
                              linked_document_ids: []
                            };
                            setNewPlaceholder(prev => ({
                              ...prev,
                              checklist_data_sources: [...(prev.checklist_data_sources || []), newDataSource]
                            }));
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Add Another Data Source
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ARRAY/ORDINAL FORMATTING */}
              {(newPlaceholder.type === 'array' || newPlaceholder.type === 'ordinal') && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-4">
                  <Label className="text-[11px] font-black uppercase text-orange-600">List Formatting & Direction</Label>
                  <div className="grid grid-cols-2 gap-4">
                    {newPlaceholder.type === 'array' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Flow Direction</Label>
                        <Select value={newPlaceholder.array_direction} onValueChange={v => setNewPlaceholder({ ...newPlaceholder, array_direction: v })}>
                          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vertical">Vertical (New Paragraphs)</SelectItem>
                            <SelectItem value="horizontal">Horizontal (Table Columns)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {newPlaceholder.type === 'ordinal' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Numbering Style</Label>
                        <Select value={newPlaceholder.ordinal_format} onValueChange={v => setNewPlaceholder({ ...newPlaceholder, ordinal_format: v })}>
                          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="number">1st, 2nd, 3rd...</SelectItem>
                            <SelectItem value="word">First, Second, Third...</SelectItem>
                            <SelectItem value="custom">Custom Pattern</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Context Sections (Boolean, Array, Image, AI etc) */}
              <div className="space-y-4 pt-4 border-t">
                {newPlaceholder.type === 'select' && (
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase text-slate-400">Select Options</Label>
                    <Textarea
                      placeholder="Option A&#10;Option B"
                      value={newPlaceholder.options?.join('\n')}
                      onChange={e => setNewPlaceholder({ ...newPlaceholder, options: e.target.value.split('\n').filter(Boolean) })}
                    />
                  </div>
                )}

                {newPlaceholder.type === 'if' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-blue-600" />
                        <Label className="text-sm font-medium text-blue-800">If Statement Configuration</Label>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Field</Label>
                            <Input 
                              placeholder="e.g., country_of_residence" 
                              value={newPlaceholder.if_statement?.condition?.field || ''}
                              onChange={e => setNewPlaceholder(prev => ({
                                ...prev,
                                if_statement: {
                                  ...prev.if_statement,
                                  condition: {
                                    ...prev.if_statement?.condition,
                                    field: e.target.value
                                  }
                                }
                              }))}
                              className="bg-white h-8 text-xs"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Operator</Label>
                            <Select 
                              value={newPlaceholder.if_statement?.condition?.operator || 'equals'}
                              onValueChange={(value) => setNewPlaceholder(prev => ({
                                ...prev,
                                if_statement: {
                                  ...prev.if_statement,
                                  condition: {
                                    ...prev.if_statement?.condition,
                                    operator: value as 'equals' | 'not_equals' | 'contains'
                                  }
                                }
                              }))}
                            >
                              <SelectTrigger className="bg-white h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Value</Label>
                            <Input 
                              placeholder="e.g., Kenya" 
                              value={newPlaceholder.if_statement?.condition?.value || ''}
                              onChange={e => setNewPlaceholder(prev => ({
                                ...prev,
                                if_statement: {
                                  ...prev.if_statement,
                                  condition: {
                                    ...prev.if_statement?.condition,
                                    value: e.target.value
                                  }
                                }
                              }))}
                              className="bg-white h-8 text-xs"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-200">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-blue-700">Then Value</Label>
                            <Input 
                              placeholder="Value if condition is true" 
                              value={newPlaceholder.if_statement?.then_value || ''}
                              onChange={e => setNewPlaceholder(prev => ({
                                ...prev,
                                if_statement: {
                                  ...prev.if_statement,
                                  then_value: e.target.value
                                }
                              }))}
                              className="bg-white h-8 text-xs"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">Else Value (Optional)</Label>
                            <Input 
                              placeholder="Value if condition is false" 
                              value={newPlaceholder.if_statement?.else_value || ''}
                              onChange={e => setNewPlaceholder(prev => ({
                                ...prev,
                                if_statement: {
                                  ...prev.if_statement,
                                  else_value: e.target.value
                                }
                              }))}
                              className="bg-white h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {newPlaceholder.type === 'image' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-green-700">Image Width</Label>
                        <Input className="bg-white" value={newPlaceholder.image_width} onChange={e => setNewPlaceholder({ ...newPlaceholder, image_width: e.target.value })} placeholder="e.g. 200px" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-green-700">Image Height</Label>
                        <Input className="bg-white" value={newPlaceholder.image_height} onChange={e => setNewPlaceholder({ ...newPlaceholder, image_height: e.target.value })} placeholder="e.g. 150px" />
                      </div>
                    </div>

                    <MediaDataSource
                      config={{
                        source_table: newPlaceholder.source_table,
                        linking_variable: newPlaceholder.linking_variable,
                        entity_types: Array.isArray(newPlaceholder.entity_type) ? newPlaceholder.entity_type : [],
                        computed_function: newPlaceholder.computed_function,
                        execution_mode: newPlaceholder.execution_mode,
                        document_type_ids: newPlaceholder.document_type_ids || []
                      }}
                      onChange={(updates) => setNewPlaceholder(prev => ({ ...prev, ...updates }))}
                      tables={tables}
                      loadingTables={loadingTables}
                      documentTypes={documentTypes}
                      masterFields={masterFields}
                      showDimensions={false}
                      showAI={true}
                      showMasterFieldSync={true}
                      title="Image Data Source"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border">
                  <Checkbox id="required" checked={newPlaceholder.required} onCheckedChange={c => setNewPlaceholder({ ...newPlaceholder, required: !!c })} />
                  <Label htmlFor="required" className="text-sm font-semibold">Mandatory Field (Validation will block generation if empty)</Label>
                </div>

                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="is_ai" checked={newPlaceholder.is_ai_generated} onCheckedChange={c => setNewPlaceholder({ ...newPlaceholder, is_ai_generated: !!c })} />
                    <Label htmlFor="is_ai" className="text-purple-700 font-bold flex items-center gap-2 uppercase text-[11px] tracking-wider">
                      <Sparkles className="h-4 w-4" /> Enable AI Refinement
                    </Label>
                  </div>
                  {newPlaceholder.is_ai_generated && (
                    <Textarea
                      className="bg-purple-50/30 border-purple-100"
                      placeholder="Prompt: Rewrite the source data to be more professional..."
                      value={newPlaceholder.ai_prompt}
                      onChange={e => setNewPlaceholder({ ...newPlaceholder, ai_prompt: e.target.value })}
                    />
                  )}
                </div>
              </div>

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
                      allowMultiple={true}
                      selectedFieldIds={newPlaceholder.master_field_ids || []}
                      onMultipleSelect={(fieldIds) => {
                        setNewPlaceholder(prev => ({ ...prev, master_field_ids: fieldIds }));
                      }}
                      onClear={() => {
                        setNewPlaceholder(prev => ({ ...prev, master_field_ids: [] }));
                      }}
                      placeholder="Select master fields..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-purple-600 uppercase flex items-center gap-1.5">
                        <HelpCircle className="h-3 w-3" /> Job Questions
                      </Label>
                      <JobQuestionPicker
                        jobQuestions={jobQuestions}
                        allowMultiple={true}
                        selectedQuestionIds={newPlaceholder.linked_job_question_ids || []}
                        onMultipleSelect={(questionIds) => {
                          setNewPlaceholder(prev => ({ ...prev, linked_job_question_ids: questionIds }));
                        }}
                        onClear={() => {
                          setNewPlaceholder(prev => ({ ...prev, linked_job_question_ids: [] }));
                        }}
                        placeholder="Select job questions..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-green-600 uppercase flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> Requirements
                      </Label>
                      <RequirementPicker
                        requirements={requirements}
                        allowMultiple={true}
                        selectedRequirementIds={newPlaceholder.linked_requirement_ids || []}
                        onMultipleSelect={(requirementIds) => {
                          setNewPlaceholder(prev => ({ ...prev, linked_requirement_ids: requirementIds }));
                        }}
                        onClear={() => {
                          setNewPlaceholder(prev => ({ ...prev, linked_requirement_ids: [] }));
                        }}
                        placeholder="Select requirements..."
                      />
                    </div>
                  </div>
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