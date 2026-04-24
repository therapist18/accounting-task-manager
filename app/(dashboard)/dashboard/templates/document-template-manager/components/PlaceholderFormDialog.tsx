"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, Pencil, X, Check, ChevronsUpDown, Search, Sparkles, Code, Database, HelpCircle, FileText, Link2, Plus, Layers, ChevronDown } from "lucide-react";
import { EntityType, ENTITY_TYPES, DEPENDANT_RELATIONSHIPS, DIRECTOR_TYPES, type DirectorType, COMPUTED_FUNCTIONS, LINKING_VARIABLES } from "@/lib/constants/entity-types";
import { cn } from "@/lib/utils";
import type { Placeholder, JobField, JobQuestion, Requirement, ConditionalCondition } from "../types";
import { PLACEHOLDER_TYPES } from "../types";
import { MasterFieldPicker } from "./MasterFieldPicker";
import { JobQuestionPicker } from "./JobQuestionPicker";
import { RequirementPicker } from "./RequirementPicker";
import { PlaceholderSourceManager } from "./PlaceholderSourceManager";
import { MediaDataSource } from "./MediaDataSource";
import { useTableData, type TableOption } from "@/lib/tableUtils";

interface PlaceholderFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  placeholder: Placeholder;
  masterFields: JobField[];
  jobQuestions: JobQuestion[];
  requirements: Requirement[];
  kycDocuments: any[];
  documentTypes: any[];
  tables: TableOption[];
  loadingTables: boolean;
  onSave: (placeholder: Placeholder) => void;
  onChange: (updates: Partial<Placeholder>) => void;
  isEditing: boolean;
}

export function PlaceholderFormDialog({
  isOpen,
  onClose,
  placeholder,
  masterFields,
  jobQuestions,
  requirements,
  kycDocuments,
  documentTypes,
  tables,
  loadingTables,
  onSave,
  onChange,
  isEditing
}: PlaceholderFormDialogProps) {
  const [directorType, setDirectorType] = useState<DirectorType>('all');
  const [dependantRelationship, setDependantRelationship] = useState<string[]>([]);

  const handleAddCondition = () => {
    const newCondition: ConditionalCondition = {
      tag: '',
      label: '',
      master_field_id: undefined,
    };
    onChange({
      conditions: [...(placeholder.conditions || []), newCondition]
    });
  };

  const handleUpdateCondition = (index: number, field: keyof ConditionalCondition, value: any) => {
    const updatedConditions = [...(placeholder.conditions || [])];
    updatedConditions[index] = {
      ...updatedConditions[index],
      [field]: value
    };
    onChange({ conditions: updatedConditions });
  };

  const handleRemoveCondition = (index: number) => {
    const updatedConditions = [...(placeholder.conditions || [])];
    updatedConditions.splice(index, 1);
    onChange({ conditions: updatedConditions });
  };

  const handleSave = () => {
    onSave(placeholder);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-white border-b shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            {isEditing ? <Pencil className="h-5 w-5 text-blue-600" /> : <PlusCircle className="h-5 w-5 text-blue-600" />}
            {isEditing ? 'Edit' : 'Add'} Placeholder
          </DialogTitle>
          <DialogDescription>
            Define the data sources and logic for document tag <span className="font-mono text-blue-600 font-bold">{'{'}{placeholder.name || '...'}{'}'}</span>
          </DialogDescription>
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
                  value={placeholder.name}
                  onChange={(e) => onChange({ name: e.target.value.replace(/\s+/g, '_') })}
                  className="font-mono text-sm bg-slate-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_value" className="text-[11px] font-black uppercase text-slate-400">Display Value</Label>
                <Input
                  id="display_value"
                  placeholder="e.g. Client First Name"
                  value={placeholder.display_value || ''}
                  onChange={(e) => onChange({ display_value: e.target.value })}
                  className="bg-slate-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_value" className="text-[11px] font-black uppercase text-slate-400">Default Fallback Value</Label>
                <Input
                  id="default_value"
                  placeholder="Optional default..."
                  value={placeholder.default_value || ''}
                  onChange={(e) => onChange({ default_value: e.target.value })}
                  className="bg-slate-50"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="description" className="text-[11px] font-black uppercase text-slate-400">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Internal notes about this field..."
                  value={placeholder.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  className="min-h-[60px] resize-none bg-slate-50"
                />
              </div>
            </div>

            {/* Source Manager */}
            <PlaceholderSourceManager
              placeholder={placeholder}
              masterFields={masterFields}
              jobQuestions={jobQuestions}
              requirements={requirements}
              onUpdate={onChange}
              onRemove={(type, id) => {
                if (type === 'db') onChange({ master_field_ids: placeholder.master_field_ids?.filter(fid => fid !== id) });
                if (type === 'job') onChange({ linked_job_question_ids: placeholder.linked_job_question_ids?.filter(qid => qid !== id) });
                if (type === 'req') onChange({ linked_requirement_ids: placeholder.linked_requirement_ids?.filter(rid => rid !== id) });
              }}
            />

            {/* Configuration: Type & Entity Scope */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-black uppercase text-slate-400">Placeholder Type</Label>
                <Select
                  value={placeholder.type}
                  onValueChange={(v) => {
                    const updates: Partial<Placeholder> = { type: v as any };
                    
                    if (v === 'document_checklist' && (!placeholder.checklist_data_sources || placeholder.checklist_data_sources.length === 0)) {
                      updates.checklist_data_sources = [{
                        id: `ds_${Date.now()}`,
                        table: 'acc_portal_kyc_uploads',
                        linking_variable: 'company_id',
                        entity_types: ['company'],
                        computed_function: 'none',
                        linked_document_ids: []
                      }];
                    }
                    
                    onChange(updates);
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
                          {Array.isArray(placeholder.entity_type) && placeholder.entity_type.length > 0
                            ? placeholder.entity_type.map(et => ENTITY_TYPES.find(t => t.value === et)?.label || et).join(', ')
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
                              const isSelected = placeholder.entity_type?.includes(type.value);
                              return (
                                <CommandItem
                                  key={type.value}
                                  onSelect={() => {
                                    onChange({
                                      entity_type: isSelected
                                        ? placeholder.entity_type.filter(et => et !== type.value)
                                        : [...(placeholder.entity_type || []), type.value]
                                    });
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
                    onClick={() => onChange({ entity_type: [] })}
                    title="Clear all entity contexts"
                    className="shrink-0 w-8 h-8 p-0 flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Director & Dependant Configuration */}
            {(placeholder.entity_type?.includes('director') || placeholder.entity_type?.includes('dependant')) && (
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-4">
                <Label className="text-[11px] font-black uppercase text-purple-600">Entity-Specific Configuration</Label>

                {placeholder.entity_type?.includes('director') && (
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
                            checked={placeholder.director_type === option.value}
                            onChange={(e) => onChange({ director_type: e.target.value as DirectorType })}
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

                {placeholder.entity_type?.includes('dependant') && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-purple-700">Dependant Relationships</Label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {DEPENDANT_RELATIONSHIPS.map((relationship) => (
                        <div key={relationship.value} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`dep-${relationship.value}`}
                            checked={placeholder.dependant_relationship?.includes(relationship.value) || false}
                            onChange={(e) => {
                              const current = placeholder.dependant_relationship || [];
                              if (e.target.checked) {
                                onChange({ dependant_relationship: [...current, relationship.value] });
                              } else {
                                onChange({ dependant_relationship: current.filter(r => r !== relationship.value) });
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
            {placeholder.type === 'conditional' && (
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
                    onClick={handleAddCondition}
                  >
                    <PlusCircle className="h-3 w-3 mr-1.5" />
                    Add Block
                  </Button>
                </div>

                <div className="space-y-3">
                  {(placeholder.conditions || []).length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-indigo-100 rounded-lg">
                      <Code className="h-8 w-8 mx-auto text-indigo-200 mb-2" />
                      <p className="text-[10px] text-indigo-300 uppercase font-bold">No logic blocks added yet</p>
                    </div>
                  )}

                  {(placeholder.conditions || []).map((cond, idx) => (
                    <div key={idx} className="relative p-4 rounded-lg border bg-white shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-white border shadow-sm text-red-500 hover:bg-red-50"
                        onClick={() => handleRemoveCondition(idx)}
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
                              handleUpdateCondition(idx, 'tag', val);
                            }}
                            className="h-8 text-xs font-mono bg-slate-50"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Display Label (Prefix)</Label>
                          <Input
                            placeholder="e.g. Spouse Name: "
                            value={cond.label}
                            onChange={(e) => handleUpdateCondition(idx, 'label', e.target.value)}
                            className="h-8 text-xs bg-slate-50"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <Label className="text-[10px] uppercase font-bold text-slate-400">Condition Type</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={!cond.comparison ? "default" : "outline"}
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            onClick={() => {
                              const updated = [...placeholder.conditions!];
                              delete updated[idx].comparison;
                              onChange({ conditions: updated });
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
                              const updated = [...placeholder.conditions!];
                              updated[idx].comparison = { field: '', operator: 'equals', value: '' };
                              onChange({ conditions: updated });
                            }}
                          >
                            <Code className="h-3 w-3 mr-1" />
                            Value Comparison
                          </Button>
                        </div>
                      </div>

                      {!cond.comparison && (
                        <div className="space-y-1.5 pt-1">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Trigger: If this field has data...</Label>
                          <MasterFieldPicker
                            masterFields={masterFields}
                            selectedFieldId={cond.master_field_id || null}
                            onSelect={(field) => handleUpdateCondition(idx, 'master_field_id', field?.id)}
                            onClear={() => {
                              const updated = [...placeholder.conditions!];
                              delete updated[idx].master_field_id;
                              onChange({ conditions: updated });
                            }}
                          />
                        </div>
                      )}

                      {cond.comparison && (
                        <div className="space-y-2 pt-1">
                          <Label className="text-[10px] uppercase font-bold text-slate-400">Comparison Logic</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              placeholder="Field"
                              value={cond.comparison.field || ''}
                              onChange={(e) => {
                                const updated = [...placeholder.conditions!];
                                updated[idx].comparison = { ...updated[idx].comparison!, field: e.target.value };
                                onChange({ conditions: updated });
                              }}
                              className="h-8 text-xs bg-slate-50"
                            />
                            <select
                              value={cond.comparison.operator}
                              onChange={(e) => {
                                const updated = [...placeholder.conditions!];
                                updated[idx].comparison = { ...updated[idx].comparison!, operator: e.target.value as any };
                                onChange({ conditions: updated });
                              }}
                              className="h-8 text-xs bg-slate-50 border rounded"
                            >
                              <option value="equals">Equals</option>
                              <option value="not_equals">Not Equals</option>
                              <option value="contains">Contains</option>
                            </select>
                            <Input
                              placeholder="Value"
                              value={cond.comparison.value || ''}
                              onChange={(e) => {
                                const updated = [...placeholder.conditions!];
                                updated[idx].comparison = { ...updated[idx].comparison!, value: e.target.value };
                                onChange({ conditions: updated });
                              }}
                              className="h-8 text-xs bg-slate-50"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DOCUMENT CHECKLIST LOGIC */}
            {placeholder.type === 'document_checklist' && (
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                <Label className="text-[11px] font-black uppercase text-blue-600">Document Checklist Configuration</Label>
                <div className="text-sm text-slate-600 italic">
                  Document checklist configuration is simplified in this view. Use the full configuration in the main editor for advanced options.
                </div>
              </div>
            )}

            {/* ARRAY/ORDINAL FORMATTING */}
            {(placeholder.type === 'array' || placeholder.type === 'ordinal') && (
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-4">
                <Label className="text-[11px] font-black uppercase text-orange-600">List Formatting & Direction</Label>
                <div className="grid grid-cols-2 gap-4">
                  {placeholder.type === 'array' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Flow Direction</Label>
                      <Select value={placeholder.array_direction} onValueChange={v => onChange({ array_direction: v })}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vertical">Vertical (New Paragraphs)</SelectItem>
                          <SelectItem value="horizontal">Horizontal (Table Columns)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {placeholder.type === 'ordinal' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Numbering Style</Label>
                      <Select value={placeholder.ordinal_format} onValueChange={v => onChange({ ordinal_format: v })}>
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

            {/* Dynamic Context Sections */}
            <div className="space-y-4 pt-4 border-t">
              {placeholder.type === 'select' && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase text-slate-400">Select Options</Label>
                  <Textarea
                    placeholder="Option A&#10;Option B"
                    value={placeholder.options?.join('\n')}
                    onChange={e => onChange({ options: e.target.value.split('\n').filter(Boolean) })}
                  />
                </div>
              )}

              {placeholder.type === 'if' && (
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
                            value={placeholder.if_statement?.condition?.field || ''}
                            onChange={e => onChange({
                              if_statement: {
                                ...placeholder.if_statement,
                                condition: {
                                  ...placeholder.if_statement?.condition,
                                  field: e.target.value
                                }
                              }
                            })}
                            className="bg-white h-8 text-xs"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">Operator</Label>
                          <Select 
                            value={placeholder.if_statement?.condition?.operator || 'equals'}
                            onValueChange={(value) => onChange({
                              if_statement: {
                                ...placeholder.if_statement,
                                condition: {
                                  ...placeholder.if_statement?.condition,
                                  operator: value as 'equals' | 'not_equals' | 'contains'
                                }
                              }
                            })}
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
                            value={placeholder.if_statement?.condition?.value || ''}
                            onChange={e => onChange({
                              if_statement: {
                                ...placeholder.if_statement,
                                condition: {
                                  ...placeholder.if_statement?.condition,
                                  value: e.target.value
                                }
                              }
                            })}
                            className="bg-white h-8 text-xs"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-200">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-blue-700">Then Value</Label>
                          <Input 
                            placeholder="Value if condition is true" 
                            value={placeholder.if_statement?.then_value || ''}
                            onChange={e => onChange({
                              if_statement: {
                                ...placeholder.if_statement,
                                then_value: e.target.value
                              }
                            })}
                            className="bg-white h-8 text-xs"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">Else Value (Optional)</Label>
                          <Input 
                            placeholder="Value if condition is false" 
                            value={placeholder.if_statement?.else_value || ''}
                            onChange={e => onChange({
                              if_statement: {
                                ...placeholder.if_statement,
                                else_value: e.target.value
                              }
                            })}
                            className="bg-white h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {placeholder.type === 'image' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold text-green-700">Image Width</Label>
                      <Input className="bg-white" value={placeholder.image_width} onChange={e => onChange({ image_width: e.target.value })} placeholder="e.g. 200px" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold text-green-700">Image Height</Label>
                      <Input className="bg-white" value={placeholder.image_height} onChange={e => onChange({ image_height: e.target.value })} placeholder="e.g. 150px" />
                    </div>
                  </div>

                  <MediaDataSource
                    config={{
                      source_table: placeholder.source_table,
                      linking_variable: placeholder.linking_variable,
                      entity_types: Array.isArray(placeholder.entity_type) ? placeholder.entity_type : [],
                      computed_function: placeholder.computed_function,
                      execution_mode: placeholder.execution_mode,
                      document_type_ids: placeholder.document_type_ids || []
                    }}
                    onChange={onChange}
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
                <Checkbox id="required" checked={placeholder.required} onCheckedChange={c => onChange({ required: !!c })} />
                <Label htmlFor="required" className="text-sm font-semibold">Mandatory Field (Validation will block generation if empty)</Label>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_ai" checked={placeholder.is_ai_generated} onCheckedChange={c => onChange({ is_ai_generated: !!c })} />
                  <Label htmlFor="is_ai" className="text-purple-700 font-bold flex items-center gap-2 uppercase text-[11px] tracking-wider">
                    <Sparkles className="h-4 w-4" /> Enable AI Refinement
                  </Label>
                </div>
                {placeholder.is_ai_generated && (
                  <Textarea
                    className="bg-purple-50/30 border-purple-100"
                    placeholder="Prompt: Rewrite the source data to be more professional..."
                    value={placeholder.ai_prompt}
                    onChange={e => onChange({ ai_prompt: e.target.value })}
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
                    selectedFieldIds={placeholder.master_field_ids || []}
                    onMultipleSelect={(fieldIds) => onChange({ master_field_ids: fieldIds })}
                    onClear={() => onChange({ master_field_ids: [] })}
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
                      selectedQuestionIds={placeholder.linked_job_question_ids || []}
                      onMultipleSelect={(questionIds) => onChange({ linked_job_question_ids: questionIds })}
                      onClear={() => onChange({ linked_job_question_ids: [] })}
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
                      selectedRequirementIds={placeholder.linked_requirement_ids || []}
                      onMultipleSelect={(requirementIds) => onChange({ linked_requirement_ids: requirementIds })}
                      onClear={() => onChange({ linked_requirement_ids: [] })}
                      placeholder="Select requirements..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="px-6 py-4 bg-white border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Placeholder</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
