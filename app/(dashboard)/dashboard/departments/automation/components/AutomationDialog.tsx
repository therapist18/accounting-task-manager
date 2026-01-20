// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import {
  Loader2, Trash2, Save, Plus, Search, Check, X,
  FileText, Database, Paperclip, Settings2, GripVertical,
  Download, FileSpreadsheet,
  ChevronRight, FunctionSquare, Calculator, Table as TableIcon,
  Info, AlertCircle, Key, Globe, Shield, LayoutGrid, List,
  MousePointerClick,
  Type,
  Layers,
  Pencil
} from "lucide-react"
import * as z from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import * as XLSX from 'xlsx'
import { DEPENDANT_RELATIONSHIPS, ENTITY_TYPES } from "@/lib/constants/entity-types"

// --- Interfaces ---
interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  is_computed?: boolean;
  computed_config?: { is_computed: boolean };
}

interface WebDataGroup {
  id: string;
  efnsDisplayName: string;
  variableName: string;
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object' | 'document' | 'computed';
  entityTypes: string[];
  dependantRelationships?: string[];
  directorType?: 'all' | 'primary';
  dateFormat?: 'iso' | 'object_split' | 'dd_mm_yyyy';
  extractionMode?: 'latest' | 'all';
  arrayItems?: Array<{
    name: string;
    variableName: string;
    type: 'text' | 'number' | 'boolean' | 'date' | 'select';
    linkedMasterFieldId?: number;
    dateFormat?: 'iso' | 'object_split' | 'dd_mm_yyyy';
    extractionMode?: 'latest' | 'all';
  }>;
  linkedMasterFields: JobField[];
  kycDocumentId?: string;
  computedFunction?: string;
  computedDocuments?: string[];
  customFieldSource?: string;
}

interface KYCDocument {
  id: string;
  display_name: string;
  document_type: string;
  max_file_size_mb: number;
  name: string;
}

// --- Updated Array Configurator ---
function ArrayConfigurator({ group, masterFields, onUpdate }: { group: WebDataGroup; masterFields: JobField[]; onUpdate: (items: any[]) => void; }) {
  const items = group.arrayItems || [];

  const handleItemChange = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    onUpdate(newItems);
  };

  const addItem = () => {
    onUpdate([...items, { name: '', variableName: '', type: 'text' }]);
  };

  const removeItem = (idx: number) => {
    onUpdate(items.filter((_, i) => i !== idx));
  };

  const linkMasterField = (idx: number, field: JobField) => {
    const newItems = [...items];
    newItems[idx] = {
      ...newItems[idx],
      name: field.label,
      linkedMasterFieldId: field.id,
      type: field.type || 'text'
    };
    onUpdate(newItems);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(
          "w-full justify-between px-3 text-xs bg-white border-slate-200",
          items.length > 0 ? "text-blue-700 border-blue-200 bg-blue-50" : "text-slate-500"
        )}>
          <span className="flex items-center gap-2">
            <TableIcon className="h-3.5 w-3.5" />
            {items.length > 0 ? `${items.length} columns defined` : "Configure Array"}
          </span>
          <ChevronRight className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[800px] p-0 shadow-2xl border-slate-200" align="start">
        {/* Header */}
        <div className="bg-slate-50/80 backdrop-blur px-4 py-3 border-b flex justify-between items-center">
          <div>
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <TableIcon className="h-4 w-4 text-blue-600" /> Array Column Mapping
            </span>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Define the schema for rows within the <strong>{group.variableName}</strong> array.
            </p>
          </div>
          <Button size="sm" onClick={addItem} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
            <Plus className="h-3 w-3 mr-1" /> Add Column
          </Button>
        </div>

        {/* Table Header Row */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-slate-100/50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-3">Web Key (JSON Property)</div>
          <div className="col-span-3">Data Type & Format</div>
          <div className="col-span-5">Source Mapping</div>
          <div className="col-span-1 text-center">Action</div>
        </div>

        {/* Rows */}
        <ScrollArea className="max-h-[400px] bg-white">
          <div className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                <TableIcon className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-xs">No columns defined yet.</p>
              </div>
            ) : (
              items.map((item, i) => {
                const linkedField = masterFields.find(f => f.id === item.linkedMasterFieldId);
                const isComputed = linkedField?.is_computed || linkedField?.computed_config?.is_computed;

                return (
                  <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3 items-start hover:bg-slate-50 transition-colors group">
                    
                    {/* 1. Web Key */}
                    <div className="col-span-3">
                      <Input
                        value={item.variableName}
                        onChange={e => handleItemChange(i, 'variableName', e.target.value)}
                        placeholder="e.g. first_name"
                        className="h-8 text-xs font-mono border-slate-200 focus:border-blue-400"
                      />
                    </div>

                    {/* 2. Type & Format */}
                    <div className="col-span-3 flex flex-col gap-2">
                      <Select value={item.type} onValueChange={(val) => handleItemChange(i, 'type', val)}>
                        <SelectTrigger className="h-8 text-xs border-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {item.type === 'date' && (
                        <Select value={item.dateFormat || 'iso'} onValueChange={(val) => handleItemChange(i, 'dateFormat', val)}>
                          <SelectTrigger className="h-7 text-[10px] bg-blue-50 text-blue-700 border-blue-100">
                            <span className="truncate">Fmt: <SelectValue /></span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="iso">YYYY-MM-DD</SelectItem>
                            <SelectItem value="object_split">Object &#123;d, m, y&#125;</SelectItem>
                            <SelectItem value="dd_mm_yyyy">DD/MM/YYYY</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* 3. Source Mapping */}
                    <div className="col-span-5 space-y-2">
                      <div className="flex gap-1">
                        <div className={cn(
                          "flex-1 flex items-center px-3 h-8 rounded-md border text-xs transition-colors",
                          linkedField 
                            ? "bg-blue-50 border-blue-200 text-blue-700" 
                            : "bg-slate-50 border-slate-200 text-slate-400 italic"
                        )}>
                          <Database className="h-3.5 w-3.5 mr-2 opacity-70" />
                          <span className="truncate font-medium">
                            {linkedField ? linkedField.label : "Manual Entry / None"}
                          </span>
                        </div>
                        <MasterFieldPicker
                          availableFields={masterFields}
                          onSelect={(f) => linkMasterField(i, f)}
                        />
                      </div>

                      {/* Extraction Mode for Computed Fields inside Array */}
                      {isComputed && (
                         <div className="flex items-center gap-2 bg-purple-50 px-2 py-1.5 rounded border border-purple-100">
                           <Label className="text-[9px] text-purple-700 font-bold uppercase whitespace-nowrap">
                             Mode:
                           </Label>
                           <Select
                             value={item.extractionMode || 'latest'}
                             onValueChange={(val) => handleItemChange(i, 'extractionMode', val)}
                           >
                             <SelectTrigger className="h-5 text-[10px] border-none bg-white/50 shadow-none p-0 px-1.5 w-full">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="latest">Latest Doc</SelectItem>
                               <SelectItem value="all">All Docs</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                      )}
                    </div>

                    {/* 4. Action */}
                    <div className="col-span-1 flex justify-center pt-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50" 
                        onClick={() => removeItem(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// --- Helper: Entity Configuration ---
function EntityConfigurator({
  group,
  onUpdate
}: {
  group: WebDataGroup;
  onUpdate: (updates: Partial<WebDataGroup>) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggleEntityType = (type: string) => {
    const current = group.entityTypes || [];
    const exists = current.includes(type);
    let newTypes = exists
      ? current.filter(t => t !== type)
      : [...current, type];

    let newRelationships = group.dependantRelationships;
    if (type === 'dependant' && exists) {
      newRelationships = [];
    }

    let newDirectorType = group.directorType;
    if (type === 'director' && exists) {
      newDirectorType = undefined;
    }

    onUpdate({
      entityTypes: newTypes,
      dependantRelationships: newRelationships,
      directorType: newDirectorType as any
    });
  };

  const toggleRelationship = (rel: string) => {
    const current = group.dependantRelationships || [];
    const exists = current.includes(rel);
    const newRels = exists
      ? current.filter(r => r !== rel)
      : [...current, rel];
    onUpdate({ dependantRelationships: newRels });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between px-3 text-xs bg-white border-slate-200 text-slate-700">
           <div className="flex flex-col items-start truncate">
             <span className={cn("truncate font-medium", group.entityTypes?.length ? "text-slate-700" : "text-slate-400 italic")}>
              {group.entityTypes?.length > 0
                ? `${group.entityTypes.length} Selected`
                : "Select entities..."}
            </span>
             {group.entityTypes?.includes('dependant') && (
                <span className="text-[9px] text-slate-400 truncate -mt-1">
                  {(group.dependantRelationships?.length || 0) > 0
                    ? `${group.dependantRelationships?.length} rels`
                    : 'All relations'}
                </span>
             )}
           </div>
           <ChevronRight className="h-3 w-3 text-slate-400 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search entities..." className="h-9 text-xs" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No entity found.</CommandEmpty>
            <CommandGroup heading="Entity Types">
              {ENTITY_TYPES.map((type) => {
                const isSelected = group.entityTypes?.includes(type.value);
                return (
                  <div key={type.value} className="flex flex-col border-b last:border-0">
                    <CommandItem
                      onSelect={() => toggleEntityType(type.value)}
                      className="cursor-pointer flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                        )}>
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="capitalize">{type.label}</span>
                      </div>
                    </CommandItem>
                    {isSelected && type.value === 'dependant' && (
                      <div className="pl-8 pr-2 pb-2 bg-slate-50/50 animate-in slide-in-from-top-1">
                        <Label className="text-[10px] text-slate-500 font-bold uppercase mb-1.5 block">
                          Applies to Relationships:
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {DEPENDANT_RELATIONSHIPS.map(rel => {
                            const isRelSelected = group.dependantRelationships?.includes(rel.value);
                            return (
                              <Badge
                                key={rel.value}
                                variant={isRelSelected ? "default" : "outline"}
                                className={cn(
                                  "text-[9px] h-5 px-1.5 cursor-pointer hover:border-blue-400",
                                  isRelSelected ? "bg-blue-600 hover:bg-blue-700" : "bg-white text-slate-600"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRelationship(rel.value);
                                }}
                              >
                                {rel.label}
                              </Badge>
                            )
                          })}
                        </div>
                        {(!group.dependantRelationships || group.dependantRelationships.length === 0) && (
                          <p className="text-[9px] text-amber-600 mt-1 italic">
                            *If none selected, applies to ALL dependents.
                          </p>
                        )}
                      </div>
                    )}
                    {isSelected && type.value === 'director' && (
                      <div className="pl-8 pr-2 pb-2 bg-slate-50/50 animate-in slide-in-from-top-1">
                        <Label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">
                          Director Scope:
                        </Label>
                        <div className="flex gap-2">
                          <div
                            className={cn(
                              "flex items-center gap-1 text-[10px] cursor-pointer px-2 py-1 rounded border",
                              group.directorType === 'primary' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200"
                            )}
                            onClick={(e) => { e.stopPropagation(); onUpdate({ directorType: 'primary' }); }}
                          >
                            <div className={cn("h-2 w-2 rounded-full", group.directorType === 'primary' ? "bg-blue-600" : "bg-slate-300")} />
                            Primary Only
                          </div>
                          <div
                            className={cn(
                              "flex items-center gap-1 text-[10px] cursor-pointer px-2 py-1 rounded border",
                              group.directorType !== 'primary' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200"
                            )}
                            onClick={(e) => { e.stopPropagation(); onUpdate({ directorType: 'all' }); }}
                          >
                            <div className={cn("h-2 w-2 rounded-full", group.directorType !== 'primary' ? "bg-blue-600" : "bg-slate-300")} />
                            All Directors
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// --- Helper: Computed Field Config ---
function ComputedFieldConfig({
  group,
  kycDocuments,
  onUpdate
}: {
  group: WebDataGroup;
  kycDocuments: KYCDocument[];
  onUpdate: (updates: Partial<WebDataGroup>) => void;
}) {
  const [selectedDocs, setSelectedDocs] = useState<string[]>(group.computedDocuments || []);
  const [docSearch, setDocSearch] = useState("");

  const filteredDocuments = kycDocuments.filter(doc => 
    (doc.display_name?.toLowerCase().includes(docSearch.toLowerCase()) || 
    doc.name?.toLowerCase().includes(docSearch.toLowerCase()))
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="w-full h-full flex items-center px-3 py-2 border rounded-md cursor-pointer hover:bg-purple-50 group transition-colors bg-white">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Calculator className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
              <span className={cn("text-xs font-mono font-medium truncate", group.computedFunction ? "text-purple-700" : "text-slate-400 italic")}>
                {group.computedFunction || "Configure function..."}
              </span>
            </div>
            {group.computedDocuments && group.computedDocuments.length > 0 && (
              <div className="text-[9px] text-slate-500 mt-1 truncate pl-5">
                Uses {group.computedDocuments.length} document(s)
              </div>
            )}
          </div>
          <Settings2 className="h-3.5 w-3.5 text-slate-300 group-hover:text-purple-600 flex-shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0 shadow-xl border-purple-100" align="start">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-3 flex items-center gap-2 text-white rounded-t-md">
          <FunctionSquare className="h-4 w-4" />
          <span className="text-sm font-semibold">Computed Field Logic</span>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
              Function Name
            </Label>
            <div className="relative">
              <Calculator className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={group.computedFunction || ''}
                onChange={e => onUpdate({ computedFunction: e.target.value })}
                placeholder="e.g. calculateAgeFromId()"
                className="pl-9 h-9 text-xs font-mono border-slate-200 focus:border-purple-400 focus:ring-purple-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">Required Documents</Label>
              <Badge variant="secondary" className="h-5 text-[10px] bg-purple-50 text-purple-700 border-purple-100">
                {selectedDocs.length} selected
              </Badge>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <Input 
                    className="h-7 text-xs border-none shadow-none bg-transparent focus-visible:ring-0 p-0" 
                    placeholder="Search documents..." 
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                />
              </div>

              <ScrollArea className="h-[200px] bg-white">
                <div className="divide-y divide-slate-100">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">No documents found matching "{docSearch}"</p>
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const isSelected = selectedDocs.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-center px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer group",
                            isSelected && "bg-purple-50/60"
                          )}
                          onClick={() => {
                            const newDocs = isSelected
                              ? selectedDocs.filter(id => id !== doc.id)
                              : [...selectedDocs, doc.id];
                            setSelectedDocs(newDocs);
                            onUpdate({ computedDocuments: newDocs });
                          }}
                        >
                          <Checkbox
                            id={`doc-${doc.id}`}
                            checked={isSelected}
                            onCheckedChange={() => { }} // handled by div click
                            className="mr-3 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-800 truncate group-hover:text-purple-700 transition-colors">
                              {doc.display_name}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono truncate">
                              {doc.name}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-4 py-3 border-t flex justify-between items-center rounded-b-md">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] text-slate-500">Executes server-side before automation runs.</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => {
              onUpdate({ computedFunction: '', computedDocuments: [] });
              setSelectedDocs([]);
            }}
          >
            Clear Config
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Helper: Master Field Picker (Simplified) ---
function MasterFieldPicker({ availableFields, onSelect }: { availableFields: JobField[]; onSelect: (field: JobField) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 rounded-md hover:bg-blue-50 text-blue-500 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search database fields..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No fields found.</CommandEmpty>
            <CommandGroup heading="Available Fields">
              <ScrollArea className="h-[200px]">
                {availableFields.map((field) => (
                  <CommandItem key={field.id} onSelect={() => { onSelect(field); setOpen(false) }} className="text-xs cursor-pointer">
                    <Database className="h-3 w-3 mr-2 text-slate-400" />
                    {field.label}
                  </CommandItem>
                ))}
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// --- NEW COMPONENT: Edit Dialog for WebDataGroup ---
function WebDataGroupEditDialog({ 
  open, 
  onOpenChange, 
  group, 
  onSave, 
  masterFields, 
  kycDocuments 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  group: WebDataGroup | null; 
  onSave: (updatedGroup: WebDataGroup) => void;
  masterFields: JobField[];
  kycDocuments: KYCDocument[];
}) {
    const [editingGroup, setEditingGroup] = useState<WebDataGroup | null>(null);

    useEffect(() => {
        if (group) setEditingGroup({ ...group });
    }, [group, open]);

    if (!editingGroup) return null;

    const updateField = (key: keyof WebDataGroup, value: any) => {
        setEditingGroup(prev => prev ? ({ ...prev, [key]: value }) : null);
    };

    const linkMasterField = (field: JobField) => {
        setEditingGroup(prev => prev ? ({
            ...prev,
            linkedMasterFields: [...(prev.linkedMasterFields || []), field]
        }) : null);
    };

    const unlinkMasterField = (fieldId: number) => {
        setEditingGroup(prev => prev ? ({
            ...prev,
            linkedMasterFields: (prev.linkedMasterFields || []).filter(f => f.id !== fieldId)
        }) : null);
    };

    const isDocument = editingGroup.fieldType === 'document';
    const isComputed = editingGroup.fieldType === 'computed';
    const hasComputedMasterField = editingGroup.linkedMasterFields?.some(f => f.is_computed || f.computed_config?.is_computed);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit Data Field</DialogTitle>
                    <DialogDescription>Configure how this field maps to the web automation.</DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Variable Key (JSON Property)</Label>
                            <Input 
                                value={editingGroup.variableName} 
                                onChange={(e) => updateField('variableName', e.target.value)}
                                className="font-mono text-xs"
                                placeholder="e.g. first_name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Display Label</Label>
                            <Input 
                                value={editingGroup.efnsDisplayName} 
                                onChange={(e) => updateField('efnsDisplayName', e.target.value)}
                                placeholder="e.g. First Name"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Data Type</Label>
                             <Select value={editingGroup.fieldType} onValueChange={(v) => updateField('fieldType', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="array">Array</SelectItem>
                                    <SelectItem value="document">Document</SelectItem>
                                    <SelectItem value="computed">Computed</SelectItem>
                                </SelectContent>
                            </Select>
                            
                            {editingGroup.fieldType === 'date' && (
                                <Select value={editingGroup.dateFormat || 'iso'} onValueChange={(v) => updateField('dateFormat', v)}>
                                    <SelectTrigger className="mt-2 text-xs h-8"><SelectValue placeholder="Format..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="iso">YYYY-MM-DD</SelectItem>
                                        <SelectItem value="object_split">Object &#123;d,m,y&#125;</SelectItem>
                                        <SelectItem value="dd_mm_yyyy">DD/MM/YYYY</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Entity Scope</Label>
                            <EntityConfigurator 
                                group={editingGroup} 
                                onUpdate={(updates) => Object.entries(updates).forEach(([k, v]) => updateField(k as any, v))} 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Custom Field Source (Optional)</Label>
                        <Input 
                            value={editingGroup.customFieldSource || ''} 
                            onChange={(e) => updateField('customFieldSource', e.target.value)}
                            placeholder="e.g. Passport (Used for grouping fields in UI)"
                        />
                    </div>

                    {/* DYNAMIC CONFIGURATION AREA */}
                    <div className="space-y-2 border rounded-lg p-4 bg-slate-50">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                            Source Configuration
                        </Label>

                        {isDocument ? (
                             <Select 
                                value={editingGroup.kycDocumentId} 
                                onValueChange={(v) => updateField('kycDocumentId', v)}
                             >
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Select Document..." /></SelectTrigger>
                                <SelectContent>
                                    {kycDocuments.map(doc => (
                                        <SelectItem key={doc.id} value={doc.id}>{doc.display_name}</SelectItem>
                                    ))}
                                </SelectContent>
                             </Select>
                        ) : isComputed ? (
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <ComputedFieldConfig 
                                        group={editingGroup} 
                                        kycDocuments={kycDocuments} 
                                        onUpdate={(updates) => Object.entries(updates).forEach(([k, v]) => updateField(k as any, v))} 
                                    />
                                </div>
                                <div className="w-[120px]">
                                     <Select 
                                        value={editingGroup.extractionMode || 'latest'} 
                                        onValueChange={(v) => updateField('extractionMode', v)}
                                    >
                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="latest">Latest</SelectItem>
                                            <SelectItem value="all">All</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ) : editingGroup.fieldType === 'array' ? (
                            <ArrayConfigurator 
                                group={editingGroup} 
                                masterFields={masterFields} 
                                onUpdate={(items) => updateField('arrayItems', items)} 
                            />
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap gap-2 p-2 bg-white border rounded min-h-[40px]">
                                    {(editingGroup.linkedMasterFields || []).map(f => (
                                        <Badge key={f.id} variant="secondary" className="pl-2 pr-1 h-7 flex items-center gap-1">
                                            {f.label}
                                            <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-slate-200" onClick={() => unlinkMasterField(f.id)}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </Badge>
                                    ))}
                                    <MasterFieldPicker availableFields={masterFields} onSelect={linkMasterField} />
                                </div>
                                {hasComputedMasterField && (
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs">Extraction Mode:</Label>
                                         <Select 
                                            value={editingGroup.extractionMode || 'latest'} 
                                            onValueChange={(v) => updateField('extractionMode', v)}
                                        >
                                            <SelectTrigger className="w-[120px] h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="latest">Latest</SelectItem>
                                                <SelectItem value="all">All</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => onSave(editingGroup)}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// --- Zod Schema ---
const automationFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  webhook_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  webhook_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  is_active: z.boolean().default(true),
  category: z.string().default("general"),
  max_concurrent_runs: z.number().min(1).default(1),
  queue_priority: z.number().default(0),
  async_processing: z.boolean().default(false),
  login: z.object({
    url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    email: z.string().optional(),
    idNumber: z.string().optional(),
    password: z.string().optional()
  }).optional(),
  webdata: z.any().optional(),
})

type AutomationFormValues = z.infer<typeof automationFormSchema>

interface AutomationDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (automation: any) => Promise<void>
  initialData?: any
}

export function AutomationDialog({
  isOpen,
  onOpenChange,
  onSave,
  initialData,
}: AutomationDialogProps) {
  const [activeTab, setActiveTab] = useState("general")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [webDataGroups, setWebDataGroups] = useState<WebDataGroup[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])

  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false)
  const [addDialogSearchTerm, setAddDialogSearchTerm] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')

  // Editing State
  const [editingGroup, setEditingGroup] = useState<WebDataGroup | null>(null);
  const [isEditDialogopen, setIsEditDialogopen] = useState(false);

  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationFormSchema),
    defaultValues: {
      name: "",
      description: "",
      webhook_url: "",
      webhook_method: "POST",
      is_active: true,
      category: "general",
      max_concurrent_runs: 1,
      queue_priority: 0,
      async_processing: false,
      webdata: [],
      login: { url: "", email: "", idNumber: "", password: "" }
    },
  })

  useEffect(() => {
    if (isOpen) {
      const fetchFields = async () => {
        const { data } = await supabase.from('tm_job_fields').select('*').order('label');
        setMasterFields(data || []);
      };
      const fetchKyc = async () => {
        const { data } = await supabase.from('acc_portal_kyc').select('*').order('display_name');
        setKycDocuments(data || []);
      };
      fetchFields();
      fetchKyc();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || "",
        description: initialData.description || "",
        webhook_url: initialData.webhook_url || "",
        webhook_method: initialData.webhook_method || "POST",
        is_active: initialData.is_active ?? true,
        category: initialData.category || "general",
        max_concurrent_runs: initialData.max_concurrent_runs || 1,
        queue_priority: initialData.queue_priority || 0,
        async_processing: initialData.async_processing || false,
        login: initialData.login || { url: "", email: "", idNumber: "", password: "" },
      });

      if (initialData.webdata && Array.isArray(initialData.webdata)) {
        setWebDataGroups(initialData.webdata.map((g: any) => ({
          ...g,
          id: g.id || crypto.randomUUID(),
          linkedMasterFields: g.linkedMasterFields || [],
          kycDocumentId: g.kycDocumentId || undefined,
          fieldType: g.fieldType || 'text',
          customFieldSource: g.customFieldSource || '',
          dependantRelationships: g.dependantRelationships || [],
          directorType: g.directorType || 'all',
          extractionMode: g.extractionMode || 'latest',
          entityTypes: Array.isArray(g.entityTypes)
            ? g.entityTypes
            : (g.entityType ? [g.entityType] : [])
        })));
      } else {
        setWebDataGroups([]);
      }
    } else {
      form.reset({
        name: "",
        webhook_method: "POST",
        is_active: true,
        category: "general",
        max_concurrent_runs: 1,
        login: { url: "", email: "", idNumber: "", password: "" }
      });
      setWebDataGroups([]);
    }
  }, [initialData, form]);

  const removeGroup = (id: string) =>
    setWebDataGroups(prev => prev.filter(g => g.id !== id));

  const availableForPicking = useMemo(() => masterFields, [masterFields]);

  const handleExportToExcel = () => {
    try {
      const exportData = webDataGroups.map((group, index) => ({
        '#': index + 1,
        'Variable ID': group.variableName,
        'Display Name': group.efnsDisplayName,
        'Type': group.fieldType,
        'Entities': group.entityTypes?.join(', ') || 'None',
        'Custom Source': group.customFieldSource || 'None',
        'Source Mapping': group.fieldType === 'document'
          ? kycDocuments.find(d => d.id === group.kycDocumentId)?.display_name || "Unknown Doc"
          : group.fieldType === 'array'
            ? `Array with ${group.arrayItems?.length || 0} items`
            : group.fieldType === 'computed'
              ? `Function: ${group.computedFunction || 'Not configured'}`
              : group.linkedMasterFields.map(f => f.label).join(', ') || 'None',
        'Extraction Mode': group.extractionMode || 'N/A'
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Web Data Config");
      XLSX.writeFile(workbook, `${form.getValues('name') || 'Automation'}_config.xlsx`);
      toast({ title: "Success", description: "Exported successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Export failed", variant: "destructive" });
    }
  };

  const handleSubmit = async (data: AutomationFormValues) => {
    try {
      setIsSaving(true)
      const automationId = initialData?.id || crypto.randomUUID()
      const automationData = {
        ...data,
        id: automationId,
        webdata: webDataGroups.map(g => ({ ...g, masterFieldIds: g.linkedMasterFields.map(f => f.id) })),
        created_at: initialData?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      await onSave(automationData)
      toast({ title: "Success", description: initialData ? "Automation updated" : "Automation created" })
      onOpenChange(false)
    } catch (error) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!initialData?.id) return
    try {
      setIsDeleting(true)
      const { error } = await supabase.from("tm_automations").delete().eq("id", initialData.id)
      if (error) throw error
      toast({ title: "Success", description: "Automation deleted" })
      onOpenChange(false)
    } catch (error) {
      toast({ title: "Error", description: "Delete failed.", variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  const addNewRow = (type: 'text' | 'document' | 'computed') => {
    const newRow: WebDataGroup = {
      id: crypto.randomUUID(),
      efnsDisplayName: type === 'document' ? 'New Document' : 'New Field',
      variableName: '',
      fieldType: type,
      entityTypes: ['principal'],
      linkedMasterFields: [],
      arrayItems: []
    };
    setWebDataGroups(prev => [...prev, newRow]);
    setIsAddFieldOpen(false);
  }

  const addFromMasterField = (field: JobField) => {
    setWebDataGroups(prev => [...prev, {
      id: crypto.randomUUID(),
      efnsDisplayName: field.label,
      variableName: field.field_key.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()),
      fieldType: 'text',
      entityTypes: ['principal'],
      linkedMasterFields: [field]
    }]);
    setIsAddFieldOpen(false);
  }

  const addFromDocument = (doc: KYCDocument) => {
    setWebDataGroups(prev => [...prev, {
      id: crypto.randomUUID(),
      efnsDisplayName: doc.display_name,
      variableName: doc.name,
      fieldType: 'document',
      entityTypes: ['principal'],
      linkedMasterFields: [],
      kycDocumentId: doc.id
    }]);
    setIsAddFieldOpen(false);
  }

  const filteredAddFields = masterFields.filter(f => f.label?.toLowerCase().includes(addDialogSearchTerm.toLowerCase()));
  const filteredAddDocs = kycDocuments.filter(d => d.display_name?.toLowerCase().includes(addDialogSearchTerm.toLowerCase()));

  const openEditDialog = (group: WebDataGroup) => {
      setEditingGroup(group);
      setIsEditDialogopen(true);
  }

  const saveEditedGroup = (updatedGroup: WebDataGroup) => {
      setWebDataGroups(prev => prev.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      setIsEditDialogopen(false);
      setEditingGroup(null);
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[85vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-none shadow-2xl rounded-xl">
          <DialogHeader className="px-6 py-4 bg-white border-b flex-shrink-0 flex-row items-center justify-between space-y-0 z-20">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">{initialData ? 'Edit Automation Flow' : 'Create Automation Flow'}</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5 font-medium">
                  Configure connection details and map database fields to the target system.
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Status:</span>
                <Switch
                  checked={form.watch('is_active')}
                  onCheckedChange={(c) => form.setValue('is_active', c)}
                  className="data-[state=checked]:bg-green-500"
                />
                <span className={cn("text-xs font-bold", form.watch('is_active') ? "text-green-600" : "text-slate-400")}>
                  {form.watch('is_active') ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 bg-white border-b flex-shrink-0">
                <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={cn(
                      "px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                      activeTab === 'general' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> General Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('webdata')}
                    className={cn(
                      "px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                      activeTab === 'webdata' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    )}
                  >
                    <List className="h-3.5 w-3.5" /> Data Mapping
                    <Badge className={cn("ml-1 h-4 px-1 rounded text-[9px]", activeTab === 'webdata' ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-slate-200 text-slate-600")}>
                      {webDataGroups.length}
                    </Badge>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden relative bg-slate-50/50">
                {activeTab === 'general' && (
                  <ScrollArea className="h-full">
                    <div className="p-8 max-w-5xl mx-auto space-y-6">
                      <Card className="border-none shadow-sm ring-1 ring-slate-200">
                        <CardHeader className="pb-4 border-b">
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" /> Basic Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-6 pt-6">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem className="col-span-1">
                                <FormLabel className="text-xs font-bold text-slate-500 uppercase">Automation Name</FormLabel>
                                <FormControl><Input placeholder="e.g. Alien Card Application" {...field} className="bg-slate-50" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="category"
                            render={({ field }) => (
                              <FormItem className="col-span-1">
                                <FormLabel className="text-xs font-bold text-slate-500 uppercase">Category</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl><SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    <SelectItem value="general">General</SelectItem>
                                    <SelectItem value="document_processing">Document Processing</SelectItem>
                                    <SelectItem value="form_automation">Form Automation</SelectItem>
                                    <SelectItem value="notification">Notification</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel className="text-xs font-bold text-slate-500 uppercase">Description</FormLabel>
                                <FormControl><Textarea placeholder="Describe the purpose..." className="resize-none bg-slate-50 min-h-[80px]" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="border-none shadow-sm ring-1 ring-slate-200 h-full">
                          <CardHeader className="pb-4 border-b bg-slate-50/50">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                              <Globe className="h-4 w-4 text-purple-500" /> Connection & Security
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4 pt-6">
                            <div className="flex gap-3">
                              <FormField
                                control={form.control}
                                name="webhook_method"
                                render={({ field }) => (
                                  <FormItem className="w-28">
                                    <FormLabel className="text-xs font-bold text-slate-500">Method</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="POST">POST</SelectItem>
                                        <SelectItem value="GET">GET</SelectItem>
                                        <SelectItem value="PUT">PUT</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="webhook_url"
                                render={({ field }) => (
                                  <FormItem className="flex-1">
                                    <FormLabel className="text-xs font-bold text-slate-500">Endpoint URL</FormLabel>
                                    <FormControl><Input placeholder="https://api..." {...field} className="font-mono text-xs" /></FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2">
                              <FormField control={form.control} name="max_concurrent_runs" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs font-bold text-slate-500">Concurrency</FormLabel>
                                  <FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl>
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="queue_priority" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs font-bold text-slate-500">Priority</FormLabel>
                                  <FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl>
                                </FormItem>
                              )} />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm ring-1 ring-slate-200 h-full">
                          <CardHeader className="pb-4 border-b bg-slate-50/50">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                              <Key className="h-4 w-4 text-amber-500" /> Authentication
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4 pt-6">
                            <FormField control={form.control} name="login.url" render={({ field }) => (
                              <FormItem><FormLabel className="text-xs font-bold text-slate-500">Login Page URL</FormLabel><FormControl><Input {...field} placeholder="https://login..." /></FormControl></FormItem>
                            )} />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField control={form.control} name="login.email" render={({ field }) => (
                                <FormItem><FormLabel className="text-xs font-bold text-slate-500">Username/Email</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                              )} />
                              <FormField control={form.control} name="login.password" render={({ field }) => (
                                <FormItem><FormLabel className="text-xs font-bold text-slate-500">Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl></FormItem>
                              )} />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </ScrollArea>
                )}

                {activeTab === 'webdata' && (
                  <div className="flex flex-col h-full">
                    <div className="px-6 py-3 bg-white border-b flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 flex-1">
                        <Button type="button" size="sm" onClick={() => setIsAddFieldOpen(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm shadow-blue-100 transition-all active:scale-95">
                          <Plus className="h-4 w-4 mr-2" /> Add Data Field
                        </Button>

                        <div className="h-6 w-px bg-slate-200 mx-2" />

                        <div className="relative flex-1 max-w-sm">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input
                            placeholder="Filter current mapping..."
                            className="h-9 pl-9 text-xs bg-slate-50 border-slate-200 focus:bg-white transition-all"
                            value={fieldSearch}
                            onChange={e => setFieldSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      <Button type="button" size="sm" variant="outline" onClick={handleExportToExcel} className="h-9 text-xs text-slate-600 border-slate-200 hover:bg-slate-50">
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-green-600" /> Export
                      </Button>
                    </div>

                    <div className="flex-1 overflow-hidden p-6">
                      <div className="h-full border border-slate-200 rounded-lg shadow-sm bg-white overflow-hidden flex flex-col">
                        <ScrollArea className="flex-1 w-full">
                          <Table className="w-full border-collapse">
                            <TableHeader className="bg-blue-600 sticky top-0 z-10 backdrop-blur-sm border-b border-slate-200">
                              <TableRow className="hover:bg-transparent border-none">
                                <TableHead className="w-[50px] text-center h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider">#</TableHead>
                                <TableHead className="w-[200px] h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Target Key (Variable)</TableHead>
                                <TableHead className="w-[200px] h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Display Label</TableHead>
                                <TableHead className="w-[120px] h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Type</TableHead>
                                <TableHead className="w-[150px] h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Entities</TableHead>
                                <TableHead className="w-[120px] h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Custom Source</TableHead>
                                <TableHead className="h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Source Configuration</TableHead>
                                <TableHead className="w-[80px] h-10"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {webDataGroups
                                .filter(g => g.variableName.includes(fieldSearch) || g.efnsDisplayName.includes(fieldSearch))
                                .map((group, index) => {
                                  const isDocument = group.fieldType === 'document';
                                  const isComputed = group.fieldType === 'computed';
                                  const rowBg = isDocument ? "bg-amber-50/30 hover:bg-amber-50/60" : isComputed ? "bg-purple-50/30 hover:bg-purple-50/60" : "hover:bg-slate-50";

                                  return (
                                    <TableRow key={group.id} className={cn("h-10 border-b border-slate-100 group transition-all", rowBg)}>
                                      <TableCell className="text-center text-xs font-mono text-slate-400 border-r border-slate-100 p-0">{index + 1}</TableCell>

                                      <TableCell className="p-3 border-r border-slate-100">
                                         <span className="font-mono text-xs font-medium text-blue-600">{group.variableName}</span>
                                      </TableCell>

                                      <TableCell className="p-3 border-r border-slate-100">
                                         <span className="text-xs text-slate-700">{group.efnsDisplayName}</span>
                                      </TableCell>

                                      <TableCell className="p-3 border-r border-slate-100 align-top">
                                         <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize text-[10px]">{group.fieldType}</Badge>
                                            {group.fieldType === 'date' && (
                                                <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-700">{group.dateFormat || 'iso'}</Badge>
                                            )}
                                         </div>
                                      </TableCell>

                                      <TableCell className="p-3 border-r border-slate-100 align-top">
                                         <div className="flex flex-wrap gap-1">
                                            {group.entityTypes.map(et => (
                                                <Badge key={et} variant="secondary" className="capitalize text-[10px] bg-slate-100">{et}</Badge>
                                            ))}
                                            {group.entityTypes.includes('dependant') && (
                                                <span className="text-[9px] text-slate-400 ml-1">
                                                    {(group.dependantRelationships?.length || 0) > 0 ? `(${group.dependantRelationships?.length} rels)` : '(All)'}
                                                </span>
                                            )}
                                         </div>
                                      </TableCell>

                                      <TableCell className="p-3 border-r border-slate-100 align-middle">
                                         <span className="text-xs text-slate-500 italic">{group.customFieldSource || '-'}</span>
                                      </TableCell>

                                      <TableCell className="p-3 border-r border-slate-100 align-middle">
                                        {isDocument ? (
                                          <div className="flex items-center gap-2 text-amber-700">
                                            <Paperclip className="h-3.5 w-3.5" />
                                            <span className="text-xs font-medium truncate">
                                              {kycDocuments.find(d => d.id === group.kycDocumentId)?.display_name || "Unknown Document"}
                                            </span>
                                          </div>
                                        ) : isComputed ? (
                                          <div className="flex items-center gap-2">
                                              <FunctionSquare className="h-3.5 w-3.5 text-purple-600" />
                                              <span className="text-xs font-mono text-purple-700 truncate max-w-[200px]">{group.computedFunction || 'No function'}</span>
                                              <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-600 ml-auto">
                                                {group.computedDocuments?.length || 0} Docs
                                              </Badge>
                                          </div>
                                        ) : group.fieldType === 'array' ? (
                                          <div className="flex items-center gap-2">
                                            <TableIcon className="h-3.5 w-3.5 text-blue-600" />
                                            <span className="text-xs text-slate-600">{group.arrayItems?.length || 0} columns mapped</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center flex-wrap gap-1.5">
                                              {(group.linkedMasterFields || []).length > 0 ? (
                                                group.linkedMasterFields.map(f => (
                                                    <Badge key={f.id} variant="outline" className="text-[10px] bg-white text-slate-700">
                                                    {f.label}
                                                    </Badge>
                                                ))
                                              ) : (
                                                  <span className="text-[10px] text-slate-400 italic">No fields linked</span>
                                              )}
                                          </div>
                                        )}
                                      </TableCell>

                                      <TableCell className="p-2 border-b border-slate-100 text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" type="button" className="h-7 w-7" onClick={() => openEditDialog(group)}>
                                                <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                            </Button>
                                            <Button variant="ghost" size="icon" type="button" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeGroup(group.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                        {webDataGroups.length === 0 && (
                          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50">
                            <div className="h-12 w-12 rounded-full bg-white border border-dashed border-slate-200 flex items-center justify-center mb-3">
                              <Database className="h-6 w-6 text-slate-200" />
                            </div>
                            <p className="text-sm font-medium text-slate-500">No data mapping configured</p>
                            <p className="text-xs text-slate-400">Use the "Add Data Field" button to start mapping.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 py-4 bg-white border-t flex-shrink-0 z-20">
                <div className="flex justify-between w-full items-center">
                  <div>
                    {initialData && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={isDeleting || isSaving} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9">
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete Flow
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isDeleting} className="h-9">Cancel</Button>
                    <Button type="submit" disabled={isSaving || isDeleting} className="bg-blue-600 hover:bg-blue-700 h-9 px-6 font-semibold shadow-md shadow-blue-100">
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {initialData ? "Save Changes" : "Create Automation"}
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Data Group Dialog */}
      <WebDataGroupEditDialog 
        open={isEditDialogopen} 
        onOpenChange={setIsEditDialogopen} 
        group={editingGroup} 
        onSave={saveEditedGroup}
        masterFields={masterFields}
        kycDocuments={kycDocuments}
      />

      <Dialog open={isAddFieldOpen} onOpenChange={setIsAddFieldOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white gap-0">
          <div className="px-4 py-3 border-b flex items-center gap-3 bg-slate-50/50">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              autoFocus
              className="border-none shadow-none focus-visible:ring-0 bg-transparent h-9 text-sm"
              placeholder="Search database fields or documents..."
              value={addDialogSearchTerm}
              onChange={e => setAddDialogSearchTerm(e.target.value)}
            />
            <div className="text-[10px] text-slate-400 font-medium px-2 py-1 border rounded bg-white">ESC to close</div>
          </div>

          <ScrollArea className="h-[450px] bg-slate-50/50">
            <div className="p-4 space-y-6">

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  <FunctionSquare className="h-3.5 w-3.5 text-blue-600" />
                  <span>Logic & Manual Input</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => addNewRow('text')}
                    className="relative flex flex-col items-start p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-md hover:shadow-blue-50 transition-all group text-left"
                  >
                    <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Type className="h-4 w-4" />
                    </div>
                    <div className="font-semibold text-sm text-slate-800">Empty Field</div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-1">
                      Create a placeholder variable for manual data entry later.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => addNewRow('computed')}
                    className="relative flex flex-col items-start p-3 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:shadow-md hover:shadow-purple-50 transition-all group text-left"
                  >
                    <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Calculator className="h-4 w-4" />
                    </div>
                    <div className="font-semibold text-sm text-slate-800">Computed Logic</div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-1">
                      Calculate values server-side (e.g. Age) before automation runs.
                    </div>
                  </button>
                </div>
              </div>

              <div className="h-px bg-slate-200 w-full" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    <Database className="h-3.5 w-3.5 text-slate-500" />
                    <span>Database Fields</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5 bg-white border border-slate-200 text-slate-500">
                    {filteredAddFields.length} found
                  </Badge>
                </div>

                {filteredAddFields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                    <Search className="h-6 w-6 text-slate-300 mb-2" />
                    <p className="text-xs text-slate-500">No database fields match "{addDialogSearchTerm}"</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredAddFields.map(f => (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => addFromMasterField(f)}
                        className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/30 transition-all text-left group"
                      >
                        <div className="flex-shrink-0 h-8 w-8 rounded-md bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100 group-hover:bg-blue-100 group-hover:text-blue-600 group-hover:border-blue-200 transition-colors">
                          <Database className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-700">
                            {f.label}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate group-hover:text-blue-400">
                            {f.field_key}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-px bg-slate-200 w-full" />

              <div className="space-y-3 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                    <span>Attachments</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5 bg-white border border-slate-200 text-slate-500">
                    {filteredAddDocs.length} found
                  </Badge>
                </div>

                {filteredAddDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                    <Search className="h-6 w-6 text-slate-300 mb-2" />
                    <p className="text-xs text-slate-500">No documents match "{addDialogSearchTerm}"</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredAddDocs.map(d => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => addFromDocument(d)}
                        className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg hover:border-amber-400 hover:bg-amber-50/30 transition-all text-left group"
                      >
                        <div className="flex-shrink-0 h-8 w-8 rounded-md bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100 group-hover:bg-amber-100 group-hover:text-amber-700 group-hover:border-amber-200 transition-colors">
                          <Paperclip className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-700 truncate group-hover:text-amber-800">
                            {d.display_name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate group-hover:text-amber-600">
                            {d.name}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}