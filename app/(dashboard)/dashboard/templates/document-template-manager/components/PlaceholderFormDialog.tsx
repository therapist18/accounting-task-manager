// @ts-nocheck
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
import { PlusCircle, Pencil, X, Check, ChevronsUpDown, Search, Sparkles, Code, Database, HelpCircle, FileText, Link2, Plus, Layers, ChevronDown, View } from "lucide-react";
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
  // Lets callers whose Placeholder model doesn't use a given concept (e.g.
  // Employment Contracts, which has no entity-type/job-question/requirement
  // linking) hide those sections instead of showing controls that do
  // nothing for them. Undefined/false = shown, i.e. no behavior change for
  // Document Template Manager's own usage.
  hiddenSections?: {
    entityContext?: boolean;
    uiVisibility?: boolean;
    aiRefinement?: boolean;
    jobQuestions?: boolean;
    requirements?: boolean;
  };
  // Opt-in (default off) rather than a hiddenSections entry, since this
  // field only has meaning for Employment Contracts' placeholder.source -
  // showing it by default would add a meaningless input to every other
  // Placeholder consumer of this dialog.
  showSourceField?: boolean;
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
  isEditing,
  hiddenSections = {},
  showSourceField = false
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

  const handleAddAndComparison = (condIndex: number) => {
    const updatedConditions = [...(placeholder.conditions || [])];
    const existing = updatedConditions[condIndex].additional_comparisons || [];
    updatedConditions[condIndex] = {
      ...updatedConditions[condIndex],
      additional_comparisons: [...existing, { field: '', operator: 'equals', value: '' }]
    };
    onChange({ conditions: updatedConditions });
  };

  const handleUpdateAndComparison = (condIndex: number, compIndex: number, updates: any) => {
    const updatedConditions = [...(placeholder.conditions || [])];
    const clauses = [...(updatedConditions[condIndex].additional_comparisons || [])];
    clauses[compIndex] = { ...clauses[compIndex], ...updates };
    updatedConditions[condIndex] = { ...updatedConditions[condIndex], additional_comparisons: clauses };
    onChange({ conditions: updatedConditions });
  };

  const handleRemoveAndComparison = (condIndex: number, compIndex: number) => {
    const updatedConditions = [...(placeholder.conditions || [])];
    const clauses = [...(updatedConditions[condIndex].additional_comparisons || [])];
    clauses.splice(compIndex, 1);
    updatedConditions[condIndex] = { ...updatedConditions[condIndex], additional_comparisons: clauses };
    onChange({ conditions: updatedConditions });
  };

  const handleSave = () => {
    onSave(placeholder);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-2xl bg-white">
        <DialogHeader className="px-6 py-4 bg-white border-b border-slate-100 shrink-0 flex flex-row items-center gap-4">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-md shadow-blue-500/10 shrink-0 flex items-center justify-center">
            {isEditing ? <Pencil className="h-5 w-5 text-white" /> : <PlusCircle className="h-5 w-5 text-white" />}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold text-slate-800 tracking-tight">
              {isEditing ? 'Edit' : 'Add'} Placeholder
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              Define data sources and logic for tag 
              <span className="font-mono text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md border border-blue-200/50 font-bold tracking-tight">
                {'{'}{placeholder.name || '...'}{'}'}
              </span>
            </DialogDescription>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-slate-50/30 px-6 py-4 overflow-auto">
          <div className="space-y-6 pb-6">
            {/* Identity & Basic Info */}
            <div className="grid grid-cols-2 gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[11px] font-black uppercase text-slate-400">JSON Variable Key</Label>
                <Input
                  id="name"
                  placeholder="e.g. client_first_name"
                  value={placeholder.name || ''}
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
              {showSourceField && (
                <div className="space-y-2">
                  <Label htmlFor="source" className="text-[11px] font-black uppercase text-slate-400">Source</Label>
                  <Input
                    id="source"
                    placeholder="e.g. medical_cover, basic_salary..."
                    value={placeholder.source || ''}
                    onChange={(e) => onChange({ source: e.target.value })}
                    className="bg-slate-50 font-mono text-sm"
                  />
                </div>
              )}
              {showSourceField && (
                <div className="col-span-2 flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Checkbox
                    id="editable"
                    checked={!!placeholder.editable}
                    onCheckedChange={(c) => onChange({ editable: !!c })}
                  />
                  <div>
                    <Label htmlFor="editable" className="text-sm font-semibold text-slate-700">Allow user override</Label>
                    <p className="text-[11px] text-slate-400">
                      When off, this field is locked: the resolved value is always rendered as-is and can't be edited or overridden per contract.
                    </p>
                  </div>
                </div>
              )}
              <div className="col-span-2 space-y-2">
                <Label htmlFor="description" className="text-[11px] font-black uppercase text-slate-400">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Internal notes about this field..."
                  value={placeholder.description || ''}
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
            <div className={cn("grid gap-4", hiddenSections.entityContext ? "grid-cols-1" : "grid-cols-2")}>
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

              {!hiddenSections.entityContext && (
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
                                      const currentTypes = Array.isArray(placeholder.entity_type) ? placeholder.entity_type : [];
                                      onChange({
                                        entity_type: isSelected
                                          ? currentTypes.filter(et => et !== type.value)
                                          : [...currentTypes, type.value]
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
              )}
            </div>

            {/* Director & Dependant Configuration */}
            {(placeholder.entity_type?.includes('director') || placeholder.entity_type?.includes('dependant')) && (
              <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100/50 space-y-4">
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
              <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50 space-y-4">
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
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold text-slate-500 uppercase">Master Field to Compare</Label>
                            <MasterFieldPicker
                              masterFields={masterFields}
                              selectedFieldId={cond.master_field_id}
                              onSelect={(field) => {
                                const updated = [...placeholder.conditions!];
                                updated[idx] = {
                                  ...updated[idx],
                                  master_field_id: field?.id,
                                  comparison: { ...updated[idx].comparison!, field: field?.field_key || '' }
                                };
                                onChange({ conditions: updated });
                              }}
                              onClear={() => {
                                const updated = [...placeholder.conditions!];
                                delete updated[idx].master_field_id;
                                updated[idx].comparison = { ...updated[idx].comparison!, field: '' };
                                onChange({ conditions: updated });
                              }}
                              placeholder="Select master field to compare..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
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

                          {(cond.additional_comparisons || []).map((clause, compIdx) => (
                            <div key={compIdx} className="space-y-1.5 pt-2 border-t border-dashed border-slate-200">
                              <div className="flex items-center justify-between">
                                <Label className="text-[9px] font-bold text-indigo-500 uppercase">AND Master Field</Label>
                                <Button
                                  variant="ghost" size="icon" type="button"
                                  onClick={() => handleRemoveAndComparison(idx, compIdx)}
                                  className="h-5 w-5 text-red-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                              <MasterFieldPicker
                                masterFields={masterFields}
                                selectedFieldId={clause.master_field_id}
                                onSelect={(field) => handleUpdateAndComparison(idx, compIdx, {
                                  master_field_id: field?.id,
                                  field: field?.field_key || ''
                                })}
                                onClear={() => handleUpdateAndComparison(idx, compIdx, { master_field_id: undefined, field: '' })}
                                placeholder="Select master field to compare..."
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={clause.operator}
                                  onChange={(e) => handleUpdateAndComparison(idx, compIdx, { operator: e.target.value as any })}
                                  className="h-8 text-xs bg-slate-50 border rounded"
                                >
                                  <option value="equals">Equals</option>
                                  <option value="not_equals">Not Equals</option>
                                  <option value="contains">Contains</option>
                                </select>
                                <Input
                                  placeholder="Value"
                                  value={clause.value || ''}
                                  onChange={(e) => handleUpdateAndComparison(idx, compIdx, { value: e.target.value })}
                                  className="h-8 text-xs bg-slate-50"
                                />
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-[10px] border-dashed border-indigo-200 text-indigo-500 hover:bg-indigo-50"
                            onClick={() => handleAddAndComparison(idx)}
                          >
                            <PlusCircle className="h-3 w-3 mr-1.5" />
                            AND Another Field
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOOLEAN / CHECKBOX CONFIGURATION */}
            {placeholder.type === 'boolean' && (
              <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100/50 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-black uppercase text-emerald-700">Boolean / Checkbox Options</Label>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => onChange({
                      boolean_conditions: [...(placeholder.boolean_conditions || []), { tag: '', label: '' }]
                    })}
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Option
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-emerald-700">Selection Mode</Label>
                  <Select
                    value={placeholder.boolean_type || 'single'}
                    onValueChange={v => onChange({ boolean_type: v as 'single' | 'multiple' })}
                  >
                    <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single (Radio — only one can be checked)</SelectItem>
                      <SelectItem value="multiple">Multiple (Checkboxes — any can be checked)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  {(placeholder.boolean_conditions || []).map((condition, idx) => (
                    <div key={idx} className="bg-white rounded-lg border p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Option {idx + 1}</span>
                        <Button
                          variant="ghost" size="icon" type="button"
                          onClick={() => {
                            const updated = [...(placeholder.boolean_conditions || [])];
                            updated.splice(idx, 1);
                            onChange({ boolean_conditions: updated });
                          }}
                          className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[9px] font-bold text-slate-500 uppercase">Tag (template key)</Label>
                          <Input
                            placeholder="e.g. is_married"
                            value={condition.tag}
                            onChange={e => {
                              const updated = [...(placeholder.boolean_conditions || [])];
                              updated[idx] = { ...updated[idx], tag: e.target.value };
                              onChange({ boolean_conditions: updated });
                            }}
                            className="h-8 text-xs font-mono bg-slate-50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] font-bold text-slate-500 uppercase">Display Label</Label>
                          <Input
                            placeholder="e.g. Married"
                            value={condition.label}
                            onChange={e => {
                              const updated = [...(placeholder.boolean_conditions || [])];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              onChange({ boolean_conditions: updated });
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 border-t border-slate-100 pt-2">
                        <Label className="text-[9px] font-bold text-blue-600 uppercase">Link to Job Question</Label>
                        <Select
                          value={condition.linked_job_question_id || '__none__'}
                          onValueChange={v => {
                            const updated = [...(placeholder.boolean_conditions || [])];
                            updated[idx] = { ...updated[idx], linked_job_question_id: v === '__none__' ? undefined : v };
                            onChange({ boolean_conditions: updated });
                          }}
                        >
                          <SelectTrigger className="bg-white h-8 text-xs"><SelectValue placeholder="No question linked" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— No question linked —</SelectItem>
                            {jobQuestions.map(q => (
                              <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {condition.linked_job_question_id && (
                        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2">
                          <div className="space-y-1">
                            <Label className="text-[9px] font-bold text-slate-500 uppercase">Operator</Label>
                            <Select
                              value={condition.comparison?.operator || 'equals'}
                              onValueChange={v => {
                                const updated = [...(placeholder.boolean_conditions || [])];
                                updated[idx] = { ...updated[idx], comparison: { ...(updated[idx].comparison || { value: '' }), operator: v as any } };
                                onChange({ boolean_conditions: updated });
                              }}
                            >
                              <SelectTrigger className="bg-white h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-[9px] font-bold text-slate-500 uppercase">Match Value</Label>
                            <Input
                              placeholder="e.g. yes, true, married"
                              value={condition.comparison?.value || ''}
                              onChange={e => {
                                const updated = [...(placeholder.boolean_conditions || [])];
                                updated[idx] = { ...updated[idx], comparison: { operator: updated[idx].comparison?.operator || 'equals', ...updated[idx].comparison, value: e.target.value } };
                                onChange({ boolean_conditions: updated });
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5 border-t border-slate-100 pt-2">
                        <Label className="text-[9px] font-bold text-blue-600 uppercase">Or Link to Master Field</Label>
                        <Select
                          value={condition.master_field_id ? String(condition.master_field_id) : '__none__'}
                          onValueChange={v => {
                            const updated = [...(placeholder.boolean_conditions || [])];
                            updated[idx] = { ...updated[idx], master_field_id: v === '__none__' ? undefined : parseInt(v) };
                            onChange({ boolean_conditions: updated });
                          }}
                        >
                          <SelectTrigger className="bg-white h-8 text-xs"><SelectValue placeholder="No master field" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— No master field —</SelectItem>
                            {masterFields.map(mf => (
                              <SelectItem key={mf.id} value={String(mf.id)}>{mf.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}

                  {(!placeholder.boolean_conditions || placeholder.boolean_conditions.length === 0) && (
                    <div className="text-center py-6 border-2 border-dashed border-emerald-200 rounded-lg text-emerald-500 text-xs">
                      No options yet. Click "Add Option" to define checkbox states.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DOCUMENT CHECKLIST CONFIGURATION */}
            {placeholder.type === 'document_checklist' && (
              <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100/50 space-y-4">
                <Label className="text-[11px] font-black uppercase text-blue-700">Document Checklist Configuration</Label>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-blue-700">Display Format</Label>
                    <Select
                      value={placeholder.checklist_display_format || 'bullets'}
                      onValueChange={v => onChange({ checklist_display_format: v as 'bullets' | 'checkboxes' | 'table' })}
                    >
                      <SelectTrigger className="bg-white h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bullets">Bullets</SelectItem>
                        <SelectItem value="checkboxes">Checkboxes</SelectItem>
                        <SelectItem value="table">Table</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-blue-700">Found Label</Label>
                    <Input
                      placeholder="✔"
                      value={placeholder.checklist_success_label || ''}
                      onChange={e => onChange({ checklist_success_label: e.target.value })}
                      className="bg-white h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-blue-700">Not Found Label</Label>
                    <Input
                      placeholder="✗"
                      value={placeholder.checklist_not_found_label || ''}
                      onChange={e => onChange({ checklist_not_found_label: e.target.value })}
                      className="bg-white h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-blue-700">Document Sources</Label>
                    <Button
                      size="sm" type="button"
                      onClick={() => onChange({
                        checklist_data_sources: [...(placeholder.checklist_data_sources || []), {
                          id: crypto.randomUUID(),
                          label: '',
                          table: 'acc_portal_kyc_uploads' as const,
                          linking_variable: 'company_id',
                          entity_types: ['company' as EntityType],
                          execution_mode: 'latest',
                          linked_document_ids: []
                        }]
                      })}
                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Source
                    </Button>
                  </div>

                  {(placeholder.checklist_data_sources || []).map((source, idx) => (
                    <div key={source.id || idx} className="bg-white rounded-lg border p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Document #{idx + 1}</span>
                        <Button
                          variant="ghost" size="icon" type="button"
                          onClick={() => {
                            const updated = [...(placeholder.checklist_data_sources || [])];
                            updated.splice(idx, 1);
                            onChange({ checklist_data_sources: updated });
                          }}
                          className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-bold text-slate-500 uppercase">Checklist Row Label</Label>
                        <Input
                          placeholder="e.g. National ID, KRA PIN"
                          value={(source as any).label || ''}
                          onChange={e => {
                            const updated = [...(placeholder.checklist_data_sources || [])];
                            updated[idx] = { ...updated[idx], label: e.target.value } as any;
                            onChange({ checklist_data_sources: updated });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-bold text-slate-500 uppercase">Source Table</Label>
                          <Select
                            value={source.table}
                            onValueChange={v => {
                              const updated = [...(placeholder.checklist_data_sources || [])];
                              updated[idx] = {
                                ...updated[idx],
                                table: v as any,
                                linking_variable: v === 'acc_portal_kyc_uploads' ? 'company_id' : 'director_id'
                              };
                              onChange({ checklist_data_sources: updated });
                            }}
                          >
                            <SelectTrigger className="bg-white h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="acc_portal_kyc_uploads">Company Uploads</SelectItem>
                              <SelectItem value="acc_portal_directors_documents">Director Documents</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-bold text-slate-500 uppercase">Linking Variable</Label>
                          <Select
                            value={source.linking_variable || 'company_id'}
                            onValueChange={v => {
                              const updated = [...(placeholder.checklist_data_sources || [])];
                              updated[idx] = { ...updated[idx], linking_variable: v };
                              onChange({ checklist_data_sources: updated });
                            }}
                          >
                            <SelectTrigger className="bg-white h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="company_id">company_id</SelectItem>
                              <SelectItem value="director_id">director_id</SelectItem>
                              <SelectItem value="individual_id">individual_id</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-bold text-slate-500 uppercase">Execution Mode</Label>
                        <Select
                          value={(source as any).execution_mode || 'latest'}
                          onValueChange={v => {
                            const updated = [...(placeholder.checklist_data_sources || [])];
                            updated[idx] = { ...updated[idx], execution_mode: v } as any;
                            onChange({ checklist_data_sources: updated });
                          }}
                        >
                          <SelectTrigger className="bg-white h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="latest">Latest only</SelectItem>
                            <SelectItem value="all">All records</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-bold text-slate-500 uppercase">Linked KYC Documents</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between h-8 text-xs bg-white font-normal">
                              {(source.linked_document_ids || []).length > 0
                                ? `${(source.linked_document_ids || []).length} document(s) selected`
                                : 'Select documents to check for...'}
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-64 max-h-60 overflow-y-auto">
                            {kycDocuments.map(doc => (
                              <DropdownMenuCheckboxItem
                                key={doc.id}
                                checked={(source.linked_document_ids || []).includes(String(doc.id))}
                                onCheckedChange={checked => {
                                  const updated = [...(placeholder.checklist_data_sources || [])];
                                  const ids = [...(updated[idx].linked_document_ids || [])];
                                  if (checked) {
                                    if (!ids.includes(String(doc.id))) ids.push(String(doc.id));
                                  } else {
                                    const pos = ids.indexOf(String(doc.id));
                                    if (pos !== -1) ids.splice(pos, 1);
                                  }
                                  updated[idx] = { ...updated[idx], linked_document_ids: ids };
                                  onChange({ checklist_data_sources: updated });
                                }}
                              >
                                {doc.display_name || doc.name}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {(source.linked_document_ids || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(source.linked_document_ids || []).map(id => {
                              const doc = kycDocuments.find(d => String(d.id) === id);
                              return (
                                <Badge key={id} variant="secondary" className="text-[9px] pl-1.5 pr-1 gap-1">
                                  {doc?.display_name || doc?.name || id}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(placeholder.checklist_data_sources || [])];
                                      updated[idx] = { ...updated[idx], linked_document_ids: (updated[idx].linked_document_ids || []).filter(d => d !== id) };
                                      onChange({ checklist_data_sources: updated });
                                    }}
                                    className="hover:text-red-500"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {(!placeholder.checklist_data_sources || placeholder.checklist_data_sources.length === 0) && (
                    <div className="text-center py-6 border-2 border-dashed border-blue-200 rounded-lg text-blue-400 text-xs">
                      No document sources yet. Click "Add Source" to define what documents to check for.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ARRAY/ORDINAL FORMATTING */}
            {(placeholder.type === 'array' || placeholder.type === 'ordinal') && (
              <div className="bg-orange-50/50 p-5 rounded-2xl border border-orange-100/50 space-y-4">
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
                    value={placeholder.options?.join('\n') || ''}
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
                  <div className="grid grid-cols-2 gap-4 p-5 bg-green-50/50 rounded-2xl border border-green-100/50">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold text-green-700">Image Width</Label>
                      <Input className="bg-white" value={placeholder.image_width || ''} onChange={e => onChange({ image_width: e.target.value })} placeholder="e.g. 200px" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold text-green-700">Image Height</Label>
                      <Input className="bg-white" value={placeholder.image_height || ''} onChange={e => onChange({ image_height: e.target.value })} placeholder="e.g. 150px" />
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

              <div className="flex items-center space-x-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Checkbox id="required" checked={placeholder.required} onCheckedChange={c => onChange({ required: !!c })} />
                <Label htmlFor="required" className="text-sm font-semibold">Mandatory Field (Validation will block generation if empty)</Label>
              </div>

              {/* UI Visibility & Grouping */}
              {!hiddenSections.uiVisibility && (
              <div className="space-y-4 border-t pt-4">
                <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/50 space-y-4">
                  <Label className="text-[11px] font-black uppercase text-amber-700 flex items-center gap-2">
                    <View className="h-3.5 w-3.5" /> UI Visibility Settings
                  </Label>
                  <p className="text-[10px] text-amber-600">
                    Use these settings to hide technical placeholders from users while keeping them active in the backend.
                    Useful for currency options, conditional variants, and other backend-resolved fields.
                  </p>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ui_hidden"
                      checked={placeholder.ui_hidden}
                      onCheckedChange={c => onChange({ ui_hidden: !!c })}
                    />
                    <Label htmlFor="ui_hidden" className="text-sm font-semibold text-amber-800">
                      Hide from UI (Backend Only)
                    </Label>
                  </div>

                  {placeholder.ui_hidden && (
                    <div className="space-y-2 pt-2 border-t border-amber-200">
                      <Label className="text-[10px] font-bold text-amber-700">Parent Group Placeholder</Label>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="use_job_question_label"
                            checked={!!placeholder.linked_job_question_id && placeholder.group_parent_id === placeholder.linked_job_question_id}
                            onCheckedChange={(checked) => {
                              if (checked && placeholder.linked_job_question_id) {
                                onChange({ group_parent_id: placeholder.linked_job_question_id });
                              }
                            }}
                          />
                          <Label htmlFor="use_job_question_label" className="text-xs text-amber-800">
                            Use linked job question label
                          </Label>
                        </div>
                        {placeholder.linked_job_question_id && (
                          <>
                            <p className="text-[9px] text-amber-600 ml-6">
                              {jobQuestions.find(q => q.id === placeholder.linked_job_question_id)?.label || 'Unknown question'}
                            </p>
                            <div className="space-y-2 pt-2 border-t border-amber-200">
                              <Label className="text-[10px] font-bold text-amber-700">Linked Question Option</Label>
                              <Input
                                placeholder="e.g., USD, GBP, EUR"
                                value={placeholder.linked_job_question_option || ''}
                                onChange={e => onChange({ linked_job_question_option: e.target.value })}
                                className="bg-white border-amber-200 h-10 text-xs"
                              />
                              <p className="text-[9px] text-amber-500 ml-6">
                                Links this placeholder to a specific option from the job question above.
                              </p>
                            </div>
                          </>
                        )}
                        <Input
                          placeholder="Or enter custom parent placeholder ID"
                          value={placeholder.group_parent_id || ''}
                          onChange={e => onChange({ group_parent_id: e.target.value || undefined })}
                          className="bg-white text-xs font-mono"
                        />
                      </div>
                      <p className="text-[9px] text-amber-500">
                        This hidden placeholder will be linked to a parent group placeholder that users see in the UI.
                      </p>
                    </div>
                  )}

                  {placeholder.type === 'group' && (
                    <div className="space-y-2 pt-2 border-t border-amber-200">
                      <Label className="text-[10px] font-bold text-amber-700">Child Placeholders</Label>
                      <Textarea
                        placeholder="Enter child placeholder IDs (one per line)&#10;usd_placeholder_id&#10;gbp_placeholder_id&#10;eur_placeholder_id"
                        value={placeholder.group_children?.join('\n') || ''}
                        onChange={e => onChange({ group_children: e.target.value.split('\n').filter(Boolean) })}
                        className="bg-white text-xs font-mono min-h-[80px]"
                      />
                      <p className="text-[9px] text-amber-500">
                        This group represents these hidden child placeholders in the UI. Backend will resolve based on job question answers.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              )}

              {!hiddenSections.aiRefinement && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_ai" checked={placeholder.is_ai_generated} onCheckedChange={c => onChange({ is_ai_generated: !!c })} />
                  <Label htmlFor="is_ai" className="text-purple-700 font-bold flex items-center gap-2 uppercase text-[11px] tracking-wider">
                    <Sparkles className="h-4 w-4" /> Enable AI Refinement
                  </Label>
                </div>
                {placeholder.is_ai_generated && (
                  <Textarea
                    className="bg-purple-50/10 border-purple-100/30 rounded-xl"
                    placeholder="Prompt: Rewrite the source data to be more professional..."
                    value={placeholder.ai_prompt || ''}
                    onChange={e => onChange({ ai_prompt: e.target.value })}
                  />
                )}
              </div>
              )}
            </div>

            {/* Linking Tools Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
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

                <div className={cn("grid gap-4", !hiddenSections.jobQuestions && !hiddenSections.requirements ? "grid-cols-2" : "grid-cols-1")}>
                  {!hiddenSections.jobQuestions && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-purple-600 uppercase flex items-center gap-1.5">
                      <HelpCircle className="h-3 w-3" /> Job Questions
                    </Label>
                    <JobQuestionPicker
                      jobQuestions={jobQuestions}
                      allowMultiple={true}
                      selectedQuestionIds={placeholder.linked_job_question_ids || []}
                      onMultipleSelect={(questionIds) => {
                        // Set both array (legacy) and singular (new grouping logic)
                        const updates: any = { linked_job_question_ids: questionIds };
                        if (questionIds.length === 1) {
                          updates.linked_job_question_id = questionIds[0];
                        } else {
                          updates.linked_job_question_id = undefined;
                          updates.linked_job_question_option = undefined; // Clear option if multiple or none
                        }
                        onChange(updates);
                      }}
                      onClear={() => onChange({ 
                        linked_job_question_ids: [],
                        linked_job_question_id: undefined,
                        linked_job_question_option: undefined 
                      })}
                      placeholder="Select job questions..."
                    />
                    {(() => {
                      const qIds = placeholder.linked_job_question_ids || [];
                      if (qIds.length !== 1) return null;
                      const linkedQ = jobQuestions.find(q => q.id === qIds[0]);
                      if (!linkedQ?.options?.length) return null;
                      return (
                        <div className="mt-2 p-2 bg-purple-50 rounded-lg border border-purple-100 space-y-1.5">
                          <Label className="text-[10px] font-bold text-purple-700 uppercase flex items-center gap-1">
                            <Layers className="h-3 w-3" /> Represents Option
                          </Label>
                          <Select
                            value={placeholder.linked_job_question_option || ''}
                            onValueChange={(v) => onChange({ linked_job_question_option: v || undefined })}
                          >
                            <SelectTrigger className="h-7 text-xs bg-white border-purple-200">
                              <SelectValue placeholder="Which option does this placeholder map to?" />
                            </SelectTrigger>
                            <SelectContent>
                              {linkedQ.options.map((opt: string) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[9px] text-purple-400">
                            When &quot;{placeholder.linked_job_question_option || '...'}&quot; is selected by the user, {`{${placeholder.name || '...'}}`} will be populated.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  )}

                  {!hiddenSections.requirements && (
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
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="px-6 py-4 bg-slate-50/90 backdrop-blur-sm border-t border-slate-100 flex justify-end gap-2.5 shrink-0 z-10">
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="h-9 px-4 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            className="h-9 px-5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold shadow-md shadow-blue-500/10 border-0 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Save Placeholder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}